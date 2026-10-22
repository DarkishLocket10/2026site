import * as THREE from 'three';
import type { CdCaseController, CdCaseOptions, CdDisc, CreateCdCase, CaseKind } from './types';
import { Motion } from './motion';
import { Pipeline, type CaseArtwork } from './pipeline';

export type { CdCaseController, CdCaseOptions, CdDisc, DiscBase, DiscType, CaseKind, CreateCdCase } from './types';

function fallbackArt(disc: CdDisc): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot create the CD label canvas');
  ctx.scale(4, 4);
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
function spineArt(disc: CdDisc, logo?: HTMLImageElement, strip?: HTMLImageElement, kind: CaseKind = 'jewel'): THREE.CanvasTexture {
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
  if (strip && strip.naturalWidth && strip.naturalHeight) {
    // Scans are portrait strips; shader UVs run horizontally down the spine.
    ctx.save(); ctx.translate(0, H); ctx.rotate(-Math.PI / 2);
    ctx.drawImage(strip, 0, 0, H, W); ctx.restore();
  } else if (logo && logo.naturalWidth && logo.naturalHeight) {
    // Wordmark PNGs carry transparent padding; fit the inked box, not the file.
    let sx = 0, sy = 0, sw = logo.naturalWidth, sh = logo.naturalHeight;
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
  let resolvedTextures: CaseArtwork[] | null = null, resolvedSpines: THREE.Texture[] | null = null;
  let canvas: HTMLCanvasElement | null = null, observer: ResizeObserver | null = null;
  let reducedQuery: MediaQueryList | null = null;
  let disposed = false, paused = false, failed = false, lost = false, ready = false;
  let compiled = false, pendingResize = true, frameId = 0, lastTime: number | null = null;
  let page = options.page ?? null, transparent = options.transparent ?? page === null, pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
  let capturedPointer: number | null = null, clientX = 0, clientY = 0, pointerInside = false;
  let sampleCount = 0, qualityDone = pixelRatio <= 1;
  const sampleTimes = new Float64Array(120);
  const ownedTextures = new Set<THREE.Texture>();
  const drawingSize = new THREE.Vector2(), pointer = new THREE.Vector2(), raycaster = new THREE.Raycaster();
  const intersections: THREE.Intersection[] = [];
  const listeners = new AbortController();
  let input: HTMLElement = container;
  let originalTabIndex: string | null | undefined;

  const stop = () => { if (frameId) cancelAnimationFrame(frameId); frameId = 0; lastTime = null; };
  const fail = (error: unknown) => {
    if (disposed || failed) return;
    failed = true; stop();
    if (canvas) canvas.style.visibility = 'hidden';
    options.onFail?.(error);
  };
  const schedule = () => {
    if (!disposed && !failed && !lost && !paused && !document.hidden && pipeline && !frameId) frameId = requestAnimationFrame(frame);
  };
  const prepare = () => {
    if (disposed || failed || lost || !renderer || !resolvedTextures || !resolvedSpines) return;
    try {
      if (!pipeline) pipeline = new Pipeline(renderer, discs, resolvedTextures, resolvedSpines, matchMedia('(pointer: coarse)').matches, options.kind ?? 'jewel', options.wear);
      pipeline.setPage(page, transparent); schedule();
    } catch (error) { fail(error); }
  };
  const resizeNow = () => {
    if (!renderer || !pipeline) return;
    const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(pixelRatio); renderer.setSize(width, height, false);
    renderer.getDrawingBufferSize(drawingSize);
    pipeline.resize(drawingSize.x, drawingSize.y, width / height); pendingResize = false;
  };
  let nx = 0, ny = 0;
  const pick = (): boolean => {
    if (!canvas || !pipeline || motion.switching) return false;
    const rect = canvas.getBoundingClientRect();
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
    const elapsed = lastTime === null ? 0 : (now - lastTime) / 1000; lastTime = now;
    try {
      if (pendingResize) resizeNow();
      if (!compiled) { pipeline.compile(); compiled = true; lastTime = null; }
      const wasSwitching = motion.switching;
      motion.update(Math.min(elapsed, 0.05)); pipeline.update(motion); pipeline.render();
      if (wasSwitching && !motion.switching && pointerInside) hit();
      if (!qualityDone && elapsed > 0) {
        sampleTimes[sampleCount++] = elapsed;
        if (sampleCount === 120) {
          sampleTimes.sort();
          const median = (sampleTimes[59] + sampleTimes[60]) * 0.5;
          if (median > 1 / 45 && pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.25); pendingResize = true; sampleCount = 0; qualityDone = pixelRatio <= 1; }
          else qualityDone = true;
        }
      }
    } catch (error) { fail(error); return; }
    if (!ready) { ready = true; options.onReady?.(); }
    schedule();
  }
  const releaseCapture = () => {
    if (capturedPointer !== null && input.hasPointerCapture(capturedPointer)) input.releasePointerCapture(capturedPointer);
    capturedPointer = null;
  };
  const changeDisc = (index: number) => {
    if (disposed || failed) return;
    motion.goTo(index);
    if (motion.switching) {
      releaseCapture(); motion.setHover(false, false);
      input.style.cursor = '';
    }
  };
  const controller: CdCaseController = {
    goTo: changeDisc,
    next: () => changeDisc((motion.current + 1) % discs.length),
    prev: () => changeDisc((motion.current + discs.length - 1) % discs.length),
    setOpen: open => { if (!disposed && !failed) motion.setOpen(open); },
    isOpen: () => motion.isOpen(), currentIndex: () => motion.current,
    setSpin: on => { motion.spinOn = on; },
    setPaused: value => {
      if (disposed || paused === value) return;
      paused = value;
      if (paused) { motion.endDrag(performance.now(), true); releaseCapture(); stop(); }
      else { lastTime = null; schedule(); }
    },
    setAutoDemo: on => { if (!disposed) motion.setAutoDemo(on); },
    setPage: (colour, clear) => { page = colour; transparent = clear ?? colour === null; if (!disposed) pipeline?.setPage(colour, transparent); },
    hitTest: (x, y) => { if (!pipeline || !canvas || paused) return false; clientX = x; clientY = y; return pick(); },
    resize: () => { pendingResize = true; schedule(); },
    dispose: () => {
      if (disposed) return;
      disposed = true; stop(); releaseCapture(); listeners.abort(); observer?.disconnect();
      if (input !== canvas && originalTabIndex !== undefined) {
        if (originalTabIndex === null) input.removeAttribute('tabindex'); else input.setAttribute('tabindex', originalTabIndex);
      }
      reducedQuery?.removeEventListener('change', updateReduced);
      pipeline?.dispose(); pipeline = null;
      for (const texture of ownedTextures) texture.dispose(); ownedTextures.clear(); resolvedTextures = null; resolvedSpines = null;
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
      lost = true; stop(); if (canvas) canvas.style.visibility = 'hidden';
      options.onFail?.(new Error('The CD case WebGL context was lost'));
    }, { signal });
    canvas.addEventListener('webglcontextrestored', () => {
      if (disposed || failed) return;
      lost = false; compiled = false; pendingResize = true;
      if (canvas) canvas.style.visibility = ''; prepare();
    }, { signal });
    input.addEventListener('pointerenter', event => {
      pointerInside = true; clientX = event.clientX; clientY = event.clientY; if (!paused) hit();
    }, { signal });
    input.addEventListener('pointerleave', () => {
      pointerInside = false; motion.setHover(false, false);
      if (!motion.dragging) input.style.cursor = '';
    }, { signal });
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
      if (motion.dragging) motion.moveDrag(clientX, clientY, performance.now()); else hit();
    }, { signal });
    const endPointer = (event: PointerEvent) => {
      if (capturedPointer !== event.pointerId) return;
      if (event.type === 'pointerup') motion.moveDrag(event.clientX, event.clientY, performance.now());
      motion.endDrag(performance.now(), event.type !== 'pointerup'); releaseCapture();
      if (event.pointerType === 'touch') { pointerInside = false; motion.setHover(false, false); }
      hit();
    };
    input.addEventListener('pointerup', endPointer, { signal });
    input.addEventListener('pointercancel', endPointer, { signal });
    input.addEventListener('lostpointercapture', endPointer, { signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { motion.endDrag(performance.now(), true); releaseCapture(); stop(); }
      else schedule();
    }, { signal });
    reducedQuery = matchMedia('(prefers-reduced-motion: reduce)'); updateReduced();
    if (options.reducedMotion === undefined || options.reducedMotion === 'auto') reducedQuery.addEventListener('change', updateReduced);
    observer = new ResizeObserver(() => { pendingResize = true; schedule(); }); observer.observe(container);
    const anisotropy = renderer.capabilities.getMaxAnisotropy();
    const loader = new THREE.TextureLoader(); loader.setCrossOrigin('anonymous');
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
    const load = (url: string | null | undefined): Promise<THREE.Texture | null> => {
      if (!url) return Promise.resolve(null);
      const cached = images.get(url);
      if (cached) return cached;
      const promise = new Promise<THREE.Texture | null>(resolve => {
        const pending = loader.load(url, texture => {
          if (disposed) { resolve(null); return; }
          resolve(configure(texture));
        }, undefined, () => {
          if (ownedTextures.delete(pending)) pending.dispose();
          resolve(null);
        });
        ownedTextures.add(pending);
      });
      images.set(url, promise);
      return promise;
    };
    const loads = discs.map(async (disc): Promise<CaseArtwork | null> => {
      const [art, cover, back, bookletInside, inside, relief] = await Promise.all([
        load(disc.art), load(disc.cover ?? disc.art), load(disc.back),
        load(disc.bookletInside), load(disc.inside), load(disc.relief),
      ]);
      const fallback = !art || !cover ? await load(disc.fallback) : null;
      if (disposed) return null;
      const printed = art ?? cover ?? fallback ?? configure(fallbackArt(disc));
      return { art: printed, cover: cover ?? fallback ?? printed, back, bookletInside, inside, relief, hasBanner: !!disc.hasBanner && cover !== null, scan: !!disc.discIsScan && art !== null };
    });
    const imageLoader = new THREE.ImageLoader(); imageLoader.setCrossOrigin('anonymous');
    const spineLoads = discs.map(disc => new Promise<THREE.Texture | null>((resolve, reject) => {
      const finish = (logo?: HTMLImageElement, strip?: HTMLImageElement) => {
        if (disposed) { resolve(null); return; }
        try { resolve(configure(spineArt(disc, logo, strip, options.kind))); } catch (error) { reject(error); }
      };
      const loadLogo = () => {
        if (disc.spineLogo) imageLoader.load(disc.spineLogo, logo => finish(logo), undefined, () => finish());
        else finish();
      };
      if (disc.spine) imageLoader.load(disc.spine, strip => finish(undefined, strip), undefined, loadLogo);
      else loadLogo();
    }));
    void Promise.all([Promise.all(loads), Promise.all(spineLoads)]).then(([textures, spines]) => {
      if (disposed || failed) return;
      resolvedTextures = textures.filter((texture): texture is CaseArtwork => texture !== null);
      resolvedSpines = spines.filter((texture): texture is THREE.Texture => texture !== null);
      prepare();
    }).catch(fail);
  } catch (error) {
    // Defer failure so integrations can assign the returned controller before handling it.
    queueMicrotask(() => fail(error));
  }
  return controller;
};
