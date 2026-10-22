import type { CaseKind, CdCaseController, CdCaseOptions, CdDisc } from '../../lib/cdcase/types';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

document.querySelectorAll<HTMLElement>('#bookshelves .shelf-col').forEach(col => {
  const spines = Array.from(col.querySelectorAll<HTMLButtonElement>('[data-spine]'));
  const panel = col.querySelector<HTMLElement>('[data-cover-panel]');
  const stage = col.querySelector<HTMLElement>('[data-cd3d]');
  const hitArea = col.querySelector<HTMLElement>('[data-cd3d-hit]');
  const cover = col.querySelector<HTMLAnchorElement>('[data-cover-link]');
  if (!spines.length || !panel || !stage || !hitArea || !cover) return;

  const query = <T extends HTMLElement = HTMLElement>(selector: string) => col.querySelector<T>(selector);
  const info = query('[data-info-content]');
  const title = query('[data-info-title]');
  const creator = query('[data-info-creator]');
  const year = query('[data-info-sub]');
  const separator = query('[data-info-sep]');
  const rank = query('[data-info-rank]');
  const face = query('[data-info-face]');
  const browseLabel = query('[data-browse-label]');
  const counter = query('[data-case-counter]');
  const help = query('[data-case-help]');
  const external = query<HTMLAnchorElement>('[data-case-url]');
  const coverImage = query<HTMLImageElement>('[data-cover-image]');
  const coverLogo = query<HTMLImageElement>('[data-cover-spine-logo]');
  const fallback = query('[data-cover-fallback]');
  const kind = (stage.dataset.caseKind || 'jewel') as CaseKind;
  const discs: CdDisc[] = JSON.parse(stage.dataset.discs || '[]');
  let controller: CdCaseController | undefined;
  let selected = 0;
  let roving = 0;
  let inView = false;
  let failed = false;
  let ready = false;
  let mounted = false;
  let disposed = false;
  let explored = false;
  let reportedFace: 'front' | 'back' | undefined;
  const animations = new Map<HTMLElement, Animation>();
  const wrap = (index: number) => (index + spines.length) % spines.length;

  function animate(element: HTMLElement | null, frames: Keyframe[], duration = 200) {
    if (!element) return;
    animations.get(element)?.cancel();
    if (reducedMotion.matches || !inView || document.hidden) return;
    const animation = element.animate(frames, { duration, easing: 'ease-out' });
    animations.set(element, animation);
    animation.onfinish = () => animations.delete(element);
  }

  function setRoving(index: number, focus = false) {
    roving = index;
    spines.forEach((spine, i) => { spine.tabIndex = i === index ? 0 : -1; });
    if (focus) spines[index].focus();
  }

  function showBrowse(index?: number) {
    if (!browseLabel) return;
    const item = index === undefined ? undefined : spines[index].dataset;
    browseLabel.textContent = item
      ? `#${item.rank} · ${item.title} — ${item.creator}`
      : explored ? 'Choose another spine to explore.' : 'Choose a spine to pull it out.';
  }

  function configureCase() {
    hitArea!.tabIndex = ready ? 0 : -1;
    hitArea!.setAttribute('aria-label', `${col.dataset.kind} case: ${spines[selected].dataset.title}. Enter to open or close.`);
    hitArea!.setAttribute('aria-expanded', String(controller?.isOpen() ?? false));
    hitArea!.setAttribute('aria-hidden', String(!ready));
    cover!.tabIndex = ready ? -1 : 0;
    cover!.setAttribute('aria-hidden', String(ready));
    if (help) help.textContent = ready
      ? 'Tap to open · drag to turn · swipe to browse'
      : failed ? 'Cover preview · use the arrows to browse' : 'Choose a spine or use the arrows.';
  }

  function showLoadedCover() {
    if (!coverImage || !fallback) return;
    const loaded = !!coverImage.getAttribute('src') && coverImage.complete && coverImage.naturalWidth > 0;
    coverImage.hidden = !loaded;
    fallback.hidden = loaded;
  }
  coverImage?.addEventListener('load', showLoadedCover);
  coverImage?.addEventListener('error', showLoadedCover);
  coverLogo?.addEventListener('error', () => { coverLogo.hidden = true; });
  // A failed wordmark should expose the existing printed title.
  col.querySelectorAll<HTMLImageElement>('.spine-logo').forEach(logo => {
    const revealTitle = () => logo.remove();
    logo.addEventListener('error', revealTitle, { once: true });
    if (logo.complete && !logo.naturalWidth) revealTitle();
  });

  function updateFallback() {
    const item = spines[selected].dataset;
    const setText = (selector: string, text?: string) => {
      const element = query(selector);
      if (element) element.textContent = text || '';
    };
    setText('[data-cover-title]', item.title);
    setText('[data-cover-creator]', item.creator);
    setText('[data-cover-meta]', item.sub);
    cover!.style.setProperty('--spine-color', item.accent || '#2a2a2a');
    cover!.style.setProperty('--accent', item.accent || '#2a2a2a');
    if (coverImage) {
      if (item.image) coverImage.src = item.image;
      else coverImage.removeAttribute('src');
      coverImage.style.objectPosition = item.crop || '';
      showLoadedCover();
    }
    if (coverLogo) {
      coverLogo.hidden = !item.logo;
      if (item.logo) coverLogo.src = item.logo;
      else coverLogo.removeAttribute('src');
    }
  }

  function select(index: number, fromEngine = false) {
    if (!Number.isInteger(index) || !spines[index]) return;
    const changed = selected !== index;
    selected = index;
    const item = spines[index].dataset;
    spines.forEach((spine, i) => {
      spine.toggleAttribute('data-active', i === index);
      if (i === index) spine.dataset.active = 'true';
      spine.setAttribute('aria-pressed', String(i === index));
    });
    // Keep a focused spine reachable even if the engine changes its selection.
    const focused = spines.indexOf(document.activeElement as HTMLButtonElement);
    setRoving(focused >= 0 ? focused : index);
    if (title) title.textContent = item.title || '';
    if (creator) creator.textContent = item.creator || '';
    if (year) year.textContent = item.sub || '';
    if (separator) separator.hidden = !item.sub;
    if (rank) rank.textContent = `#${item.rank}`;
    if (counter) {
      counter.textContent = `${index + 1} / ${spines.length}`;
      counter.setAttribute('aria-label', `Item ${index + 1} of ${spines.length}`);
    }
    [cover, external].forEach(link => {
      if (!link) return;
      if (item.url) link.href = item.url;
      else link.removeAttribute('href');
      link.setAttribute('aria-label', `${link === cover ? 'Details' : col.dataset.kind === 'music' ? 'Last.fm' : 'Details'} for ${item.title} (opens in a new tab)`);
    });
    if (changed) {
      updateFallback();
      animate(info, [{ opacity: .2, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }]);
      if (!ready) animate(panel, [
        { opacity: .2, transform: 'translate(-12px, 6px) rotate(-2deg)' },
        { opacity: 1, transform: 'translate(0, 0) rotate(0)' },
      ], 280);
    }
    configureCase();
    if (!fromEngine) controller?.goTo(index);
  }

  function choose(index: number) {
    explored = true;
    select(wrap(index));
    showBrowse();
  }

  function focusCase() {
    (ready ? hitArea : cover)!.focus();
  }

  spines.forEach((spine, index) => {
    spine.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'touch') showBrowse(index);
    });
    spine.addEventListener('pointerleave', () => {
      showBrowse(spines.includes(document.activeElement as HTMLButtonElement) ? roving : undefined);
    });
    spine.addEventListener('focus', () => { setRoving(index); showBrowse(index); });
    spine.addEventListener('blur', () => showBrowse());
    spine.addEventListener('click', () => choose(index));
    spine.addEventListener('keydown', event => {
      let next: number;
      switch (event.key) {
        case 'ArrowLeft': next = wrap(index - 1); break;
        case 'ArrowRight': next = wrap(index + 1); break;
        case 'Home': next = 0; break;
        case 'End': next = spines.length - 1; break;
        case 'Enter':
          event.preventDefault();
          if (!event.repeat) { choose(index); focusCase(); }
          return;
        default: return; // Space keeps native button activation.
      }
      event.preventDefault();
      setRoving(next, true);
    });
  });
  query('[data-case-prev]')?.addEventListener('click', () => choose(selected - 1));
  query('[data-case-next]')?.addEventListener('click', () => choose(selected + 1));

  // Capture before the engine's own keyboard listener, so toggles happen once.
  col.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      setRoving(selected, true);
      return;
    }
    if (event.target !== hitArea && event.target !== cover) return;
    // Shift+Left/Right flips the case to its back; the engine handles that itself.
    if (event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) return;
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      choose(event.key === 'Home' ? 0 : event.key === 'End' ? spines.length - 1
        : selected + (event.key === 'ArrowLeft' ? -1 : 1));
    } else if (event.target === hitArea && ready && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) controller?.setOpen();
    }
  }, true);

  // Assistive technology can activate a button without pointer/key events.
  hitArea.addEventListener('click', event => {
    if (event.detail === 0 && ready) controller?.setOpen();
  });

  // Let normal touch drags reach the engine. A quick, deliberate horizontal
  // swipe takes ownership on release; goTo cancels the engine's current drag.
  let touch: { id: number; x: number; y: number; time: number } | undefined;
  let suppressClickUntil = 0;
  panel.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || !event.isPrimary) { touch = undefined; return; }
    touch = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
    if (!ready && cover.contains(event.target as Node)) cover.setPointerCapture(event.pointerId);
  }, true);
  panel.addEventListener('pointerup', event => {
    if (!touch || touch.id !== event.pointerId) return;
    const dx = event.clientX - touch.x;
    const dy = event.clientY - touch.y;
    const elapsed = performance.now() - touch.time;
    touch = undefined;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5 || elapsed > 550) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClickUntil = performance.now() + 450;
    choose(selected + (dx < 0 ? 1 : -1));
  }, true);
  panel.addEventListener('pointercancel', () => { touch = undefined; }, true);
  panel.addEventListener('click', event => {
    if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);

  // The existing PNG still responds when WebGL is unavailable.
  panel.addEventListener('pointermove', event => {
    if (ready || reducedMotion.matches || !inView || event.pointerType !== 'mouse') return;
    const rect = panel.getBoundingClientRect();
    cover.style.setProperty('--tilt-x', String((event.clientX - rect.left) / rect.width * 2 - 1));
    cover.style.setProperty('--tilt-y', String((event.clientY - rect.top) / rect.height * 2 - 1));
    cover.classList.add('cover-case--tilting');
  });
  panel.addEventListener('pointerleave', () => cover.classList.remove('cover-case--tilting'));

  const pageColour = () => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#dddddd';
  const syncPage = () => controller?.setPage(pageColour(), true);
  window.addEventListener('themechange', () => { syncPage(); window.setTimeout(syncPage, 60); });
  const syncPaused = () => {
    const active = inView && !document.hidden;
    col.toggleAttribute('data-in-view', active);
    controller?.setPaused(!active);
    if (!active || reducedMotion.matches) {
      animations.forEach(animation => animation.cancel());
      animations.clear();
      cover.classList.remove('cover-case--tilting');
    }
  };
  const syncMotion = () => {
    controller?.setSpin(kind === 'jewel' && !reducedMotion.matches);
    syncPaused();
  };
  reducedMotion.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncPaused);

  function showFallback(error?: unknown) {
    if (error) console.warn('[bookshelves] using the flat case preview:', error);
    const hadFocus = document.activeElement === hitArea;
    failed = true;
    ready = false;
    col.removeAttribute('data-cd3d-ready');
    if (face) face.hidden = true;
    reportedFace = undefined;
    controller?.dispose();
    controller = undefined;
    configureCase();
    if (hadFocus) cover!.focus({ preventScroll: true });
  }

  async function mount() {
    if (mounted || disposed) return;
    mounted = true;
    try {
      const { createCdCase } = await import('../../lib/cdcase');
      if (disposed) return;
      // Older engines simply ignore onFace. Never show a guessed face label.
      const options: CdCaseOptions & { onFace?: (value: unknown) => void } = {
        kind, page: pageColour(), transparent: true, eventTarget: hitArea!,
        spin: kind === 'jewel' && !reducedMotion.matches, autoDemo: false,
        initialIndex: selected, reducedMotion: 'auto',
        ariaLabel: `Interactive ${col.dataset.kind} case`,
        onReady: () => {
          if (failed || disposed) return;
          const hadFocus = document.activeElement === cover;
          ready = true;
          col.setAttribute('data-cd3d-ready', '');
          cover!.classList.remove('cover-case--tilting');
          configureCase();
          if (hadFocus) focusCase();
          syncPaused();
        },
        onFail: showFallback,
        onOpen: open => hitArea!.setAttribute('aria-expanded', String(open)),
        onIndex: index => { if (!failed) select(index, true); },
        onFace: value => {
          if (failed || !face || (value !== 'front' && value !== 'back') || reportedFace === value) return;
          reportedFace = value;
          face.textContent = value === 'back' ? 'Back' : 'Front';
          face.hidden = false;
        },
      };
      controller = createCdCase(stage!, discs, options);
      // Both onFail and onReady may run synchronously during creation.
      if (failed) showFallback();
      else { configureCase(); syncMotion(); }
    } catch (error) { showFallback(error); }
  }

  const visibility = new IntersectionObserver(entries => {
    inView = entries[entries.length - 1].isIntersecting;
    syncPaused();
  });
  visibility.observe(panel);
  const lazyMount = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    lazyMount.disconnect();
    void mount();
  }, { rootMargin: '400px 0px' });
  lazyMount.observe(col);
  updateFallback();
  configureCase();

  // Full-page navigation is used here. Preserve paused controllers for bfcache.
  window.addEventListener('pagehide', event => {
    controller?.setPaused(true);
    if (event.persisted) return;
    disposed = true;
    visibility.disconnect();
    lazyMount.disconnect();
    controller?.dispose();
  });
  window.addEventListener('pageshow', syncPaused);
});
