import * as THREE from 'three';
import type { CdCaseController, CdCaseOptions, CdDisc, CreateCdCase, CaseKind } from './types';
import { Motion } from './motion';
import { Pipeline, type CaseArtwork } from './pipeline';
import { frameWork } from './frame-work';

export type { CdCaseController, CdCaseOptions, CdDisc, DiscBase, DiscType, CaseKind, CreateCdCase } from './types';

function fallbackArt(disc: CdDisc): THREE.CanvasTexture {
  // Also stands in while an item's artwork downloads, so keep the upload small.
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot create the CD label canvas');
  ctx.fillStyle = disc.accent ?? '#444'; ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const words = (disc.label ?? disc.name).split(/\s+/), lines: string[] = [];
  ctx.font = '600 32px sans-serif';
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > 360 && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 4);
  for (let i = 0; i < shown.length; i++) ctx.fillText(shown[i], 256, 166 + (i - (shown.length - 1) / 2) * 38, 380);
  return new THREE.CanvasTexture(canvas);
}

/** A single canvas supplies both spine strips, with horizontal print rotated by their UVs. */
type DecodedImage = ImageBitmap | HTMLImageElement;
const imageWidth = (image: DecodedImage) => image instanceof HTMLImageElement ? image.naturalWidth : image.width;
const imageHeight = (image: DecodedImage) => image instanceof HTMLImageElement ? image.naturalHeight : image.height;
const closeImage = (image: DecodedImage) => { if ('close' in image) image.close(); };

function spineArt(disc: CdDisc, logo?: DecodedImage, strip?: DecodedImage, kind: CaseKind = 'jewel'): THREE.CanvasTexture {
  // Match the 122.4 × 8 mm visible tray-card fold, including its ink margins.
  const W = 2048, H = kind === 'jewel' ? 134 : kind === 'bluray' ? 144 : 169;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot create the CD spine canvas');
  ctx.fillStyle = disc.spineColour ?? disc.accent ?? '#444'; ctx.fillRect(0, 0, W, H);
  // A whisper of paper grain so the strip doesn't read as flat plastic colour.
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 1400; i++) { ctx.fillStyle = i & 1 ? '#fff' : '#000'; ctx.fillRect((i * 127.31) % W, (i * 41.73) % H, 2, 1); }
  ctx.globalAlpha = 1;
  if (strip && imageWidth(strip) && imageHeight(strip)) {
    // Scans are portrait strips; shader UVs run horizontally down the spine.
    ctx.save(); ctx.translate(0, H); ctx.rotate(-Math.PI / 2);
    ctx.drawImage(strip, 0, 0, H, W); ctx.restore();
  } else if (logo && imageWidth(logo) && imageHeight(logo)) {
    // Wordmark PNGs carry transparent padding; fit the inked box, not the file.
    let sx = 0, sy = 0, sw = imageWidth(logo), sh = imageHeight(logo);
    try {
      const probe = document.createElement('canvas'); probe.width = sw; probe.height = sh;
      const pctx = probe.getContext('2d', { willReadFrequently: true });
      if (pctx) {
        pctx.drawImage(logo, 0, 0);
        const data = pctx.getImageData(0, 0, sw, sh).data;
        let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
        for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (data[(y * sw + x) * 4 + 3] > 24) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        if (x1 >= x0 && y1 >= y0) { sx = x0; sy = y0; sw = x1 - x0 + 1; sh = y1 - y0 + 1; }
      }
    } catch { /* cross-origin logo: draw the whole file */ }
    const scale = Math.min(W * 0.86 / sw, H * 0.86 / sh);
    const width = sw * scale, height = sh * scale;
    ctx.drawImage(logo, sx, sy, sw, sh, (W - width) / 2, (H - height) / 2, width, height);
  } else {
    ctx.fillStyle = '#f5f3ed'; ctx.font = '600 96px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((disc.label ?? disc.name).toUpperCase(), W / 2, H / 2 + 2, W * 0.8);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** Mounts a self-contained renderer; no scene, clock, or GPU resource is shared between mounts. */
export const createCdCase: CreateCdCase = (container: HTMLElement, discs: CdDisc[], options: CdCaseOptions = {}): CdCaseController => {
  const initial = Number.isInteger(options.initialIndex) && (options.initialIndex ?? -1) >= 0 && (options.initialIndex ?? 0) < discs.length ? options.initialIndex ?? 0 : 0;
  const motion = new Motion(discs.length, initial, index => {
    if (!options.ariaLabel) canvas?.setAttribute('aria-label', discs[index].name);
    options.onIndex?.(index);
  }, options.onOpen, options.onFace);
  motion.spinOn = options.kind && options.kind !== 'jewel' ? false : options.spin ?? true; motion.setAutoDemo(options.autoDemo ?? false);
  let renderer: THREE.WebGLRenderer | null = null, pipeline: Pipeline | null = null;
  // Artwork arrives per item: the first case draws as soon as its own images
  // are in, the rest follow in idle time or on demand. Until then an item
  // shows its typographic label (`placeholder`).
  const artwork: (CaseArtwork | null)[] = discs.map(() => null);
  const spines: (THREE.Texture | null)[] = discs.map(() => null);
  const itemTextures: THREE.Texture[][] = discs.map(() => []);
  const itemLoads = new Map<number, Promise<void>>();
  let artworkFor: ((index: number) => CaseArtwork) | null = null, spineFor: ((index: number) => THREE.Texture) | null = null;
  let loadItem: ((index: number) => Promise<void>) | null = null;
  let uploaded = new WeakSet<THREE.Texture>();
  let pendingIndex = -1, pendingTimer = 0, prefetching = false;
  let idleFps = Math.max(10, Math.min(60, options.idleFps ?? 30));
  let canvas: HTMLCanvasElement | null = null, observer: ResizeObserver | null = null;
  let reducedQuery: MediaQueryList | null = null;
  let disposed = false, paused = false, failed = false, lost = false, ready = false;
  let compiled = false, pendingResize = true, frameId = 0, lastTime: number | null = null;
  let preparation = 0, lastDraw: number | null = null, scrolling = false, scrollSkip = false;
  const maxPixelRatio = Number.isFinite(options.maxPixelRatio) ? Math.max(1, options.maxPixelRatio!) : 1.5;
  let page = options.page ?? null, transparent = options.transparent ?? page === null, pixelRatio = Math.max(1, Math.min(globalThis.devicePixelRatio || 1, maxPixelRatio));
  let capturedPointer: number | null = null, clientX = 0, clientY = 0, pointerInside = false;
  let pointerDirty = false, pointerTime = 0, boundsDirty = true, canvasRect: DOMRect | null = null;
  let sampleCount = 0;
  const sampleTimes = new Float64Array(30);
  const ownedTextures = new Set<THREE.Texture>();
  const drawingSize = new THREE.Vector2(), pointer = new THREE.Vector2(), raycaster = new THREE.Raycaster();
  const intersections: THREE.Intersection[] = [];
  const listeners = new AbortController();
  let input: HTMLElement = container;
  let originalTabIndex: string | null | undefined;

  const stop = () => { if (frameId) cancelAnimationFrame(frameId); frameId = 0; lastTime = null; lastDraw = null; sampleCount = 0; };
  const fail = (error: unknown) => {
    if (disposed || failed) return;
    failed = true; stop();
    if (canvas) canvas.style.visibility = 'hidden';
    options.onFail?.(error);
  };
  const schedule = () => {
    if (!disposed && !failed && !lost && !paused && !document.hidden && compiled && pipeline && !frameId) frameId = requestAnimationFrame(frame);
  };
  /** One texture per frame, shared across mounts, so no draw triggers an upload burst. */
  const upload = async (textures: readonly THREE.Texture[], cancelled = () => disposed || failed || lost) => {
    for (const texture of textures) {
      if (uploaded.has(texture)) continue;
      await frameWork(() => { if (!cancelled() && renderer) { renderer.initTexture(texture); uploaded.add(texture); } });
      if (cancelled()) return;
    }
  };
  const prepare = async () => {
    if (disposed || failed || lost || !renderer || !artworkFor || !spineFor || !loadItem) return;
    const generation = ++preparation;
    const cancelled = () => disposed || failed || lost || generation !== preparation;
    try {
      await loadItem(motion.current);
      if (cancelled()) return;
      await frameWork(() => {
        if (cancelled() || !renderer || !artworkFor || !spineFor) return;
        if (!pipeline) pipeline = new Pipeline(renderer, discs, artworkFor, spineFor, matchMedia('(pointer: coarse)').matches, options.kind ?? 'jewel', options.wear);
        pipeline.setPage(page, transparent);
        resizeNow();
      });
      if (cancelled() || !pipeline) return;
      await upload(itemTextures[motion.current], cancelled);
      if (cancelled()) return;
      await pipeline.compile(cancelled);
      if (cancelled()) return;
      // Seed a still frame even for a paused shelf; only the coordinator's active
      // shelf enters the animation loop. The flat preview stays until this draw.
      await frameWork(() => {
        if (cancelled() || !pipeline) return;
        if (pendingResize) resizeNow();
        pipeline.update(motion); pipeline.render(); compiled = true;
        if (!ready) { ready = true; options.onReady?.(); }
        schedule();
      });
      if (!cancelled()) void prefetch();
    } catch (error) { fail(error); }
  };
  const idle = () => new Promise<void>(resolve => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 2500 });
    else setTimeout(resolve, 120);
  });
  /** Neighbours first, one item at a time, only while the main thread is idle. */
  const prefetch = async () => {
    if (prefetching || !loadItem) return;
    prefetching = true;
    const limit = Math.max(0, Math.min(discs.length - 1, options.prefetch ?? discs.length));
    const order: number[] = [];
    for (let step = 1; order.length < discs.length - 1 && step < discs.length; step++) {
      for (const index of [(motion.current + step) % discs.length, (motion.current - step + discs.length) % discs.length]) {
        if (index !== motion.current && !order.includes(index)) order.push(index);
      }
    }
    for (const index of order.slice(0, limit)) {
      await idle();
      if (disposed || failed) return;
      await loadItem(index).catch(() => undefined);
    }
  };
  const resizeNow = () => {
    if (!renderer || !pipeline) return;
    const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(pixelRatio); renderer.setSize(width, height, false);
    renderer.getDrawingBufferSize(drawingSize);
    pipeline.resize(drawingSize.x, drawingSize.y, width / height); pipeline.setPixelRatio(pixelRatio); pendingResize = false;
    boundsDirty = true;
  };
  let nx = 0, ny = 0;
  const pick = (): boolean => {
    if (!canvas || !pipeline || motion.switching) return false;
    if (boundsDirty || !canvasRect) { canvasRect = canvas.getBoundingClientRect(); boundsDirty = false; }
    const rect = canvasRect;
    nx = (clientX - rect.left) / Math.max(rect.width, 1) * 2 - 1;
    ny = (clientY - rect.top) / Math.max(rect.height, 1) * 2 - 1;
    pointer.set(nx, -ny); raycaster.setFromCamera(pointer, pipeline.camera);
    intersections.length = 0;
    for (let i = 0; i < pipeline.hitPlanes.length; i++) {
      const plane = pipeline.hitPlanes[i];
      if (plane.visible) raycaster.intersectObject(plane, false, intersections);
    }
    return intersections.length > 0;
  };
  const hit = (): boolean => {
    if (!canvas || !pipeline || motion.switching) return false;
    const over = pick() && pointerInside;
    // Parallax follows the pointer relative to the case's own box, not the whole canvas.
    motion.setHover(pointerInside, over, nx, ny);
    input.style.cursor = motion.dragging ? 'grabbing' : over ? 'pointer' : '';
    return over;
  };
  function frame(now: number): void {
    frameId = 0;
    if (disposed || failed || paused || lost || document.hidden || !pipeline) { lastTime = null; return; }
    const frameMs = lastTime === null ? 0 : now - lastTime; lastTime = now;
    try {
      // Sample rAF intervals, not draw intervals: deliberate 30 fps/scroll skips
      // must not be mistaken for GPU overload. Keep sampling after a good window.
      // Once resolution is at its floor, a still-slow device gets a lower idle rate.
      if ((pixelRatio > 1 || idleFps > 20) && frameMs > 0 && !scrolling) {
        sampleTimes[sampleCount++] = frameMs;
        if (sampleCount === sampleTimes.length) {
          sampleTimes.sort();
          const median = (sampleTimes[14] + sampleTimes[15]) * 0.5;
          if (pixelRatio > 1 && median > 20) { pixelRatio = Math.max(1, pixelRatio - 0.25); pendingResize = true; }
          else if (pixelRatio <= 1 && median > 30) idleFps = 20;
          sampleCount = 0;
        }
      }
      if (pendingResize) resizeNow();
      if (pointerDirty) {
        pointerDirty = false;
        if (motion.dragging) motion.moveDrag(clientX, clientY, pointerTime); else hit();
      }
      scrollSkip = scrolling && !scrollSkip;
      const interval = 1000 / (pointerInside || motion.isInteracting() ? 60 : idleFps);
      if (scrollSkip || (lastDraw !== null && now - lastDraw < interval - 0.5)) { schedule(); return; }
      const elapsed = lastDraw === null ? 0 : (now - lastDraw) / 1000; lastDraw = now;
      const wasSwitching = motion.switching;
      motion.update(Math.min(elapsed, 0.05)); pipeline.update(motion); pipeline.render();
      if (wasSwitching && !motion.switching && pointerInside) pointerDirty = true;
    } catch (error) { fail(error); return; }
    if (!ready) { ready = true; options.onReady?.(); }
    schedule();
  }
  const releaseCapture = () => {
    if (capturedPointer !== null && input.hasPointerCapture(capturedPointer)) input.releasePointerCapture(capturedPointer);
    capturedPointer = null;
  };
  const fly = (index: number) => {
    pendingIndex = -1; clearTimeout(pendingTimer);
    motion.goTo(index);
    if (motion.switching) {
      releaseCapture(); motion.setHover(false, false);
      input.style.cursor = '';
    }
    schedule();
  };
  const changeDisc = (index: number) => {
    if (disposed || failed || !Number.isInteger(index) || index < 0 || index >= discs.length) return;
    if (artwork[index] || !compiled || !loadItem) { fly(index); return; }
    // Hold the flight briefly for the incoming artwork; a slow network still
    // gets its flight (with the label) and the art swaps in when it lands.
    pendingIndex = index; clearTimeout(pendingTimer);
    const start = () => { if (pendingIndex === index && !disposed && !failed) fly(index); };
    pendingTimer = window.setTimeout(start, 700);
    loadItem(index).then(start, start);
  };
  const shown = () => pendingIndex >= 0 ? pendingIndex : motion.current;
  const controller: CdCaseController = {
    goTo: changeDisc,
    next: () => changeDisc((shown() + 1) % discs.length),
    prev: () => changeDisc((shown() + discs.length - 1) % discs.length),
    setOpen: open => { if (!disposed && !failed) motion.setOpen(open); },
    isOpen: () => motion.isOpen(), currentIndex: shown,
    setSpin: on => { motion.spinOn = on; },
    setPaused: value => {
      if (disposed || paused === value) return;
      paused = value;
      if (paused) { motion.endDrag(performance.now(), true); motion.setHover(false, false); pointerDirty = false; releaseCapture(); stop(); }
      else { lastTime = null; schedule(); }
    },
    setScrolling: value => { scrolling = value; if (!value) scrollSkip = false; },
    setAutoDemo: on => { if (!disposed) motion.setAutoDemo(on); },
    setPage: (colour, clear) => { page = colour; transparent = clear ?? colour === null; if (!disposed) pipeline?.setPage(colour, transparent); },
    hitTest: (x, y) => { if (!pipeline || !canvas || paused) return false; clientX = x; clientY = y; return pick(); },
    resize: () => { pendingResize = true; boundsDirty = true; schedule(); },
    dispose: () => {
      if (disposed) return;
      disposed = true; stop(); releaseCapture(); listeners.abort(); observer?.disconnect(); clearTimeout(pendingTimer);
      if (input !== canvas && originalTabIndex !== undefined) {
        if (originalTabIndex === null) input.removeAttribute('tabindex'); else input.setAttribute('tabindex', originalTabIndex);
      }
      reducedQuery?.removeEventListener('change', updateReduced);
      pipeline?.dispose(); pipeline = null;
      for (const texture of ownedTextures) {
        texture.dispose();
        if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) texture.image.close();
      }
      ownedTextures.clear(); artworkFor = null; spineFor = null; loadItem = null;
      renderer?.dispose(); renderer?.forceContextLoss(); renderer = null;
      canvas?.remove(); canvas = null;
    },
  };
  const updateReduced = () => { motion.reduced = typeof options.reducedMotion === 'boolean' ? options.reducedMotion : reducedQuery?.matches ?? false; };

  try {
    if (!discs.length) throw new Error('The CD case needs at least one disc');
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;';
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', options.ariaLabel ?? discs[initial].name);
    const context = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'high-performance' });
    if (!context) throw new Error('WebGL2 is unavailable');
    // A CPU rasteriser can't hold an interactive refraction pipeline; the flat
    // preview is the better experience there.
    const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
    const gpu = debugInfo ? String(context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpu)) throw new Error(`Software WebGL renderer (${gpu})`);
    renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'high-performance' });
    renderer.autoClear = false; renderer.setClearColor(0, 0);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
    renderer.debug.checkShaderErrors = true;
    renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
      throw new Error(`CD case shader failed: ${gl.getProgramInfoLog(program) ?? ''}\n${gl.getShaderInfoLog(vertex) ?? ''}\n${gl.getShaderInfoLog(fragment) ?? ''}`);
    };
    container.appendChild(canvas);
    input = options.eventTarget ?? canvas;
    originalTabIndex = input.getAttribute('tabindex');
    if (input.tabIndex < 0) input.tabIndex = 0;
    if (input !== canvas) { canvas.style.pointerEvents = 'none'; input.style.touchAction = 'none'; }
    const signal = listeners.signal;
    input.addEventListener('keydown', event => {
      if (paused || motion.switching) return;
      if (event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault(); event.stopPropagation(); motion.flip(event.key === 'ArrowLeft' ? -1 : 1);
      } else if (event.target === input && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault(); event.stopPropagation(); motion.activate();
      }
    }, { signal, capture: true });
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); if (disposed) return;
      lost = true; preparation++; stop(); if (canvas) canvas.style.visibility = 'hidden';
      options.onFail?.(new Error('The CD case WebGL context was lost'));
    }, { signal });
    canvas.addEventListener('webglcontextrestored', () => {
      if (disposed || failed) return;
      lost = false; compiled = false; pendingResize = true; ready = false; uploaded = new WeakSet();
      if (canvas) canvas.style.visibility = ''; void prepare();
    }, { signal });
    input.addEventListener('pointerenter', event => {
      pointerInside = true; clientX = event.clientX; clientY = event.clientY; pointerDirty = true;
    }, { signal, passive: true });
    input.addEventListener('pointerleave', () => {
      pointerInside = false; pointerDirty = false; motion.setHover(false, false);
      if (!motion.dragging) input.style.cursor = '';
    }, { signal, passive: true });
    input.addEventListener('pointerdown', event => {
      if (event.button !== 0 || motion.switching || paused || capturedPointer !== null) return;
      clientX = event.clientX; clientY = event.clientY; pointerInside = true;
      if (!hit()) return;
      motion.beginDrag(clientX, clientY, performance.now()); capturedPointer = event.pointerId;
      input.setPointerCapture(event.pointerId); input.style.cursor = 'grabbing'; event.preventDefault();
    }, { signal });
    input.addEventListener('pointermove', event => {
      if (paused || motion.switching || (capturedPointer !== null && capturedPointer !== event.pointerId)) return;
      clientX = event.clientX; clientY = event.clientY;
      pointerTime = performance.now(); pointerDirty = true;
    }, { signal, passive: true });
    const endPointer = (event: PointerEvent) => {
      if (capturedPointer !== event.pointerId) return;
      if (event.type === 'pointerup') motion.moveDrag(event.clientX, event.clientY, performance.now());
      motion.endDrag(performance.now(), event.type !== 'pointerup'); releaseCapture();
      if (event.pointerType === 'touch') { pointerInside = false; motion.setHover(false, false); }
      pointerDirty = true;
    };
    input.addEventListener('pointerup', endPointer, { signal, passive: true });
    input.addEventListener('pointercancel', endPointer, { signal, passive: true });
    input.addEventListener('lostpointercapture', endPointer, { signal, passive: true });
    window.addEventListener('scroll', () => { boundsDirty = true; }, { signal, passive: true, capture: true });
    window.addEventListener('resize', () => { boundsDirty = true; pendingResize = true; schedule(); }, { signal, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { motion.endDrag(performance.now(), true); releaseCapture(); stop(); }
      else schedule();
    }, { signal });
    reducedQuery = matchMedia('(prefers-reduced-motion: reduce)'); updateReduced();
    if (options.reducedMotion === undefined || options.reducedMotion === 'auto') reducedQuery.addEventListener('change', updateReduced);
    observer = new ResizeObserver(() => { pendingResize = true; schedule(); }); observer.observe(container);
    const anisotropy = renderer.capabilities.getMaxAnisotropy();
    const decode = async (url: string, flipY = false, priority: RequestPriority = 'auto'): Promise<DecodedImage | null> => {
      try {
        if (typeof createImageBitmap === 'function') {
          const response = await fetch(url, { signal, mode: 'cors', priority });
          if (!response.ok) return null;
          let image = await createImageBitmap(await response.blob(), {
            imageOrientation: flipY ? 'flipY' : 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
          });
          // Low-power mounts cap texture memory; the resize also runs off the main thread.
          const limit = options.maxTextureSize ?? 0, longest = Math.max(image.width, image.height);
          if (limit > 0 && longest > limit) {
            const scale = limit / longest;
            const smaller = await createImageBitmap(image, {
              resizeWidth: Math.max(1, Math.round(image.width * scale)), resizeHeight: Math.max(1, Math.round(image.height * scale)),
              resizeQuality: 'high', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
            });
            image.close(); image = smaller;
          }
          if (disposed) { image.close(); return null; }
          return image;
        }
        const image = new Image(); image.crossOrigin = 'anonymous'; image.decoding = 'async'; image.src = url;
        await image.decode();
        return disposed ? null : image;
      } catch { return null; }
    };
    const configure = (texture: THREE.Texture): THREE.Texture => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = anisotropy;
      texture.needsUpdate = true; ownedTextures.add(texture); return texture;
    };
    // Cache the load, not a disc-specific fallback: equal URLs share one GPU
    // texture, while failed URLs still get each album's own label/paper.
    const images = new Map<string, Promise<THREE.Texture | null>>();
    const load = (url: string | null | undefined, priority: RequestPriority = 'auto'): Promise<THREE.Texture | null> => {
      if (!url) return Promise.resolve(null);
      const cached = images.get(url);
      if (cached) return cached;
      const promise = decode(url, true, priority).then(image => {
        if (!image) return null;
        if (disposed) { closeImage(image); return null; }
        const texture = new THREE.Texture(image);
        // ImageBitmap's orientation is baked into the decode; HTML fallback
        // retains Texture's normal WebGL flip. Keep bitmaps until disposal so
        // context restoration can re-upload them.
        texture.flipY = image instanceof HTMLImageElement;
        return configure(texture);
      });
      images.set(url, promise);
      return promise;
    };
    const placeholders = new Map<number, CaseArtwork>();
    const placeholderSpines = new Map<number, THREE.Texture>();
    artworkFor = index => {
      const loaded = artwork[index];
      if (loaded) return loaded;
      let label = placeholders.get(index);
      if (!label) {
        const printed = configure(fallbackArt(discs[index]));
        label = { art: printed, cover: printed, back: null, scan: false };
        placeholders.set(index, label);
      }
      return label;
    };
    spineFor = index => {
      const loaded = spines[index];
      if (loaded) return loaded;
      let plain = placeholderSpines.get(index);
      if (!plain) { plain = configure(spineArt(discs[index], undefined, undefined, options.kind)); placeholderSpines.set(index, plain); }
      return plain;
    };
    loadItem = index => {
      let pending = itemLoads.get(index);
      if (pending) return pending;
      pending = (async () => {
        const disc = discs[index];
        // Background prefetches yield the network to whatever the page needs now.
        const priority: RequestPriority = compiled && index !== pendingIndex ? 'low' : 'auto';
        const [art, cover, back, bookletInside, inside, relief] = await Promise.all([
          load(disc.art, priority), load(disc.cover ?? disc.art, priority), load(disc.back, priority),
          load(disc.bookletInside, priority), load(disc.inside, priority), load(disc.relief, priority),
        ]);
        const fallback = !art || !cover ? await load(disc.fallback, priority) : null;
        if (disposed) return;
        const strip = disc.spine ? await decode(disc.spine, false, priority) : null;
        const logo = !strip && disc.spineLogo ? await decode(disc.spineLogo, false, priority) : null;
        let spine: THREE.Texture | null;
        try {
          spine = await frameWork(() => disposed ? null : configure(spineArt(disc, logo ?? undefined, strip ?? undefined, options.kind)));
        } finally { if (strip) closeImage(strip); if (logo) closeImage(logo); }
        if (disposed || !spine) return;
        const printed = art ?? cover ?? fallback ?? artworkFor!(index).art;
        const item: CaseArtwork = { art: printed, cover: cover ?? fallback ?? printed, back, bookletInside, inside, relief, hasBanner: !!disc.hasBanner && cover !== null, scan: !!disc.discIsScan && art !== null };
        itemTextures[index] = [...new Set([item.art, item.cover, back, bookletInside, inside, relief, spine].filter((texture): texture is THREE.Texture => !!texture))];
        // Upload before binding, so the next draw never stalls on a texImage2D.
        if (pipeline) await upload(itemTextures[index]);
        if (disposed) return;
        artwork[index] = item; spines[index] = spine;
        pipeline?.invalidate(index);
        if (compiled) schedule();
      })();
      itemLoads.set(index, pending);
      pending.catch(() => itemLoads.delete(index));
      return pending;
    };
    void prepare();
  } catch (error) {
    // Defer failure so integrations can assign the returned controller before handling it.
    queueMicrotask(() => fail(error));
  }
  return controller;
};
