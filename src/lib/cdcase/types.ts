/*
  Public contract of the 3D CD jewel-case module (src/lib/cdcase).

  The engine (index.ts and friends) renders a clear polystyrene jewel case
  with a disc inside into a <canvas> it appends to `container`, and exposes
  a small controller. The Bookshelves component drives it from the Music
  shelf's spines. Nothing in here depends on three.js so the Astro
  component can import the types without pulling the engine into the
  page bundle until it is actually needed (dynamic import).
*/

/** What the disc is "made of" — selects the shader's base look. */
export type DiscBase = 'print' | 'holo' | 'gold' | 'vinyl';
export type CaseKind = 'jewel' | 'bluray' | 'steelbook';
export type DiscType = 'cd' | 'bluray' | 'dvd' | 'none';

export interface CdDisc {
  /** Stable id (used for keys / debugging). */
  id: string;
  /** Spoken name, e.g. "Trench — Twenty One Pilots" (aria / live region). */
  name: string;
  /**
   * URL of the artwork printed on the disc face. Must be CORS-readable.
   * Disc scans are square RGBA images: the 120 mm outer edge touches the square,
   * with transparent pixels outside the disc. If it fails to load, draw a fallback
   * label disc from `accent` + `label` instead of failing.
   */
  art: string | null;
  /** Booklet front image (CORS-readable). Missing/failed cover falls back to `art`. */
  cover?: string | null;
  /** Back artwork, cover-cropped. Missing jewel inlays use matte spine-coloured paper. */
  back?: string | null;
  /** Printed inner booklet page; falls back to a muted, darkened cover. */
  bookletInside?: string | null;
  /** Interior spread, left to right; missing art uses paper reverses or plain steel. */
  inside?: string | null;
  /** Full photographed spine strip (portrait), as an alternative to a wordmark. */
  spine?: string | null;
  /** Front artwork already contains the Blu-ray banner. Default false. */
  hasBanner?: boolean;
  /** Printed tinplate lacquer; default matte. */
  finish?: 'matte' | 'gloss';
  /** Subtle material wear and panel warp, 0–1. Overrides options.wear (default 0.35). */
  wear?: number;
  /** Optional luminance height map. No embossing unless this loads. */
  relief?: string | null;
  /** Optical substrate; portrait cases default to Blu-ray. `none` hides the disc. */
  discType?: DiscType;
  /** Secondary cover/disc URL if the selected artwork file fails to load. */
  fallback?: string | null;
  /**
   * `art` is a disc scan: print from the hole/clear-centre radius to 60 mm,
   * using its alpha as ink coverage (near-transparent pixels are unprinted).
   * Overrides `artIn`/`printOut`; missing/failed art retains the normal fallback print.
   */
  discIsScan?: boolean;
  /** Fallback colour for the label disc when `art` is missing / blocked. */
  accent?: string;
  /** Printed spine colour. Defaults to `accent`. */
  spineColour?: string;
  /** Transparent PNG wordmark for the spine; a failed load leaves just its colour. */
  spineLogo?: string;
  /** Short text for the fallback label disc (album title). */
  label?: string;
  /** Base material under the print. Default 'print' (a silver CD). */
  base?: DiscBase;
  /** Radius (mm) where the printed art starts. Default 18 (clear centre). */
  artIn?: number;
  /** Radius (mm) where the printed art ends. Default 58. */
  printOut?: number;
}

export interface CdCaseOptions {
  /** Physical case format. Defaults to the original jewel case. */
  kind?: CaseKind;
  /** Default wear and panel warp, 0–1; 0 is pristine. Default 0.35. */
  wear?: number;
  /**
   * CSS colour of the page behind the canvas (what the plastic "sees"
   * through itself where nothing is behind it). `null` (default) renders
   * a transparent canvas so the site background shows through, with only
   * the case's soft shadow darkening it.
   */
  page?: string | null;
  /**
   * Keep the canvas transparent even when `page` is set. The plastic then
   * refracts `page` (match it to the site background) while the real DOM
   * shows through everywhere else. Default: transparent only when page is null.
   */
  transparent?: boolean;
  /**
   * Element that receives pointer input instead of the canvas. Lets the
   * canvas overflow its layout box with `pointer-events: none` while only a
   * smaller region (e.g. the visible case area) is interactive.
   */
  eventTarget?: HTMLElement;
  /** Start the jewel disc spinning (default true). Portrait discs stay stationary. */
  spin?: boolean;
  /**
   * Ambient demo: when idle at rest for ~2.6 s the case opens by itself,
   * and after ~8.8 s idle it moves on to the next disc. Default false.
   */
  autoDemo?: boolean;
  /** Index of the disc shown first. Default 0. */
  initialIndex?: number;
  /** 'auto' follows prefers-reduced-motion (default); booleans force it. */
  reducedMotion?: 'auto' | boolean;
  /** Accessible description set on the canvas (role="img"). */
  ariaLabel?: string;
  /** Called when the shown disc changes (including auto-advance). */
  onIndex?: (index: number) => void;
  /** Called when the case opens (true) or closes (false). */
  onOpen?: (open: boolean) => void;
  /** Called when the visible face changes during rotation. Initially front. */
  onFace?: (face: 'front' | 'back') => void;
  /** First frame is on screen. */
  onReady?: () => void;
  /** WebGL unavailable / context creation failed / shaders failed. */
  onFail?: (error: unknown) => void;
}

export interface CdCaseController {
  /** Fly to disc `index` (no-op if it is already current or out of range). */
  goTo(index: number): void;
  next(): void;
  prev(): void;
  /** Open / close the lid. Omit `open` to toggle. */
  setOpen(open?: boolean): void;
  isOpen(): boolean;
  currentIndex(): number;
  /** Disc rotation on/off. */
  setSpin(on: boolean): void;
  /** Freeze the simulation and stop rendering (e.g. while off screen). */
  setPaused(paused: boolean): void;
  setAutoDemo(on: boolean): void;
  /** Change the page colour (theme switch). `null` = transparent. */
  setPage(colour: string | null, transparent?: boolean): void;
  /** True when client coordinates hit the shown case (tray or lid). */
  hitTest(clientX: number, clientY: number): boolean;
  /** Re-measure the container (normally automatic via ResizeObserver). */
  resize(): void;
  /** Tear everything down and remove the canvas. */
  dispose(): void;
}

export type CreateCdCase = (
  container: HTMLElement,
  discs: CdDisc[],
  options?: CdCaseOptions,
) => CdCaseController;
