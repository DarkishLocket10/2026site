# Physical media case renderer

`createCdCase(container, discs, options)` mounts one WebGL2 canvas. The host needs
a positioned container with nonzero dimensions. Import the engine dynamically;
`types.ts` is independent of Three and remains the public contract.
`options.kind` selects `jewel` (the default), `bluray`, or `steelbook`; all
three share the loader, motion/controller, MSAA pipeline and shelf integration.
`mountHarness(el, kind = 'jewel')` supplies a generated RGBA disc scan with separate cover/back,
a cover-only album, a missing-art fallback, and the existing holographic fixture
without network access. `createHarnessDiscs()` exposes the same fixture data.

## Model and coordinates

The nominal closed case is **142 × 125 × 10.4 mm**, centred on its footprint:
+x right, +y up, +z toward the viewer. The spine is on the left. Thin clear base
walls and perimeter rails surround a disc well centred at **(+3.5, 0)**, with
radial finger notches, two thumb arcs, and a twelve-tooth release hub. Two shared
tray/disc variants provide the 15 mm clear centre or 7.5 mm hole; the clear-centre
variant keeps its transparent annular sheet and small 7.75 mm ring.

The lid rotates around the y-parallel hinge at **(−69.2, 0, 3.6)**. Its pane spans
x −66.5…71 and y ±62.5, with a narrow clear hinge band, interleaved knuckles,
edge skirts, four booklet clips, and two right-edge latches. The curved clip
fingers sit behind the cover at the specified depths: they are most visible
from inside the open lid. The opening curve peaks at 3.02 radians (173°) and
settles at 2.96 radians (170°), with a latch pop and subtle idle bob.

A **120.5 mm square, 0.3 mm thick** booklet moves with the lid. Its front uses
`CdDisc.cover`, falling back to `art`, and does not spin. Its back uses
`bookletInside` when available, otherwise a darkened, lower-contrast cover.
Back-face UVs reverse x so the print reads correctly when the lid opens. Closed,
the booklet occludes the disc; open, its inside page faces up on the left and
the spinning disc remains in the right-hand tray. Paper has real edge walls.
Two opaque spine strips move with the base: an 8 mm tray-card fold beside the
clear hinge rails (x −66.1…−58.1) and one facing outward on the left side.
An opaque **136.5 × 123 mm** back inlay sits at z −5.15…−4.95 in the tray frame,
covering x −66…70.5 and y ±61.5. Its 0.2 mm folds rise to z −0.35 in both side
slots. The card fills the exposed tray corners, clear hub and closed booklet
margins; its folds use `spineColour` while the existing 8 mm printed spine stays
in place.

## Architecture and optics

- `geometry.ts` sweeps rounded profiles along rails. Each vertex carries its
  profile frame for analytic exit intersections. Sheets have triangulated
  front/back faces; opaque booklet geometry also includes edge walls.
- `studio.ts` renders six cube faces with 4 × 4 supersampling and mipmaps.
  The cube contains **room + area softboxes only** (no point-lamp impulses). Surface mirrors in `shaders.ts` mix
  toward `uPage` using `backdrop(R)`; the backdrop is not baked into the cube.
- `shaders.ts` contains custom GLSL ES 3.00 stages. Rails trace four internal
  exits with Fresnel reflection and path absorption. Panes add thin sheen with
  little normal-incidence attenuation. Disc tracks diffract four studio lights.
  Paper retains dark ink contrast with faint satin glare; disc ink and spine
  print have restrained, broad lacquer highlights. Exposed aluminium has
  filtered concentric grain, anisotropic sheen and rainbow diffraction out to
  its clear rim. Procedural grain fades below the pixel footprint.
- `pipeline.ts` owns two reusable cases. The opaque **MSAA** pass draws the
  analytical shadow, disc, booklet, spine and back inlay. Paper and discs use alpha tag 2
  (scaled by fade). Their depth-only copies hide rear plastic before every
  tray/lid pass. Depth-sorted groups copy through two scissored MSAA targets.
  Star extraction, both blur passes and their three targets are removed.
  The final composite writes sRGB and
  premultiplied shadow coverage when transparent.
- Shadows use the rectangular tray, offset disc, lid, a 0.26 darkness inlay at
  z −4.95, and a 0.26 darkness booklet square at z 3.35 in the lid frame.
  The inlay and disc shadows share their overlap rather than adding darkness
  twice. Both paper sheets use the same soft penumbra. The receiver at z −42
  draws first without depth writes. Penumbra grows with light distance and
  grazing incidence, avoiding a thin streak under a half-open lid. Ambient
  occlusion projects vertically onto the receiver even when the tray tilts.
  Transparent shadow coverage converts linear transmission to sRGB to match
  the opaque canvas on a white page.
- `motion.ts` retains the phase machine, switch queue, hover and disc spin.
  Horizontal case rotation is unbounded; release velocity uses pointer timestamps.
  A short inertial coast gives way to a soft spring to the nearest front/back.
  Vertical drag stays clamped to ±0.45 radians. Disc transform is `mCase · T(3.5, 0, 0) · Rz(−spin)`. Scratch transforms
  and frame storage are reused.
- `index.ts` owns texture loading, lifecycle, events, resize and animation.

Closed framing fits 62% of view height or 70% of width, whichever limits it.
Open scale is capped at 1.04 and otherwise fits 92% of the width using a 290 mm
assembly allowance. Hit planes are 142 × 125 mm, with the lid plane at z 5.2;
scissor bounds use ±74 × ±65 × ±7 mm around each part.

## Artwork and integration

`art` supplies the disc print. `cover` supplies the booklet front, falling back
to `art` when absent or failed. Missing/failed disc art uses the cover, then `fallback`, then a square `accent` +
`label` fallback; the disc geometry supplies its own circular outline and hole.
`back` supplies the inlay print, centred and cover-cropped without stretching.
Missing/failed back art gives matte paper in `spineColour` at 72% linear
brightness, including the exposed right/top/bottom margins and folded edges.
Image transparency is composited over that opaque printed paper.

`discIsScan: true` maps the entire image square to the 120 mm disc, printing to
60 mm from the model's 15 mm clear centre (print/holo) or 7.5 mm hole (gold/vinyl).
It overrides `artIn` and `printOut`. RGBA is filtered together; alpha ≤0.02 is
unprinted and smoothly approaches normal alpha coverage by 0.08. The existing
clear centre remains plastic, with the inlay visible through it, and unprinted
pixels on the metal show the bare finish. Opaque grey pixels outside the clear
centre remain ink; colour alone is not a transparency mask. Missing/failed scan
art uses the ordinary fallback annulus. Without `discIsScan`, `base`, `artIn`
and `printOut` retain their previous finish/annulus behaviour (18…58 mm by default).

Artwork URLs are loaded once per mount and shared across disc, booklet, inlay
and albums. Failed URLs are cached too, but generated fallbacks remain specific
to each album. All three artwork roles use CORS-anonymous loading and the same
texture filtering settings.

`spineColour` overrides `accent` for the spine. `spineLogo` optionally supplies
a transparent PNG wordmark. Each disc gets one 2048 × 134 CanvasTexture, with
transparent padding cropped and its logo fitted within 86% of both dimensions.
UVs rotate the print to read top to bottom on both strips, with equal physical
ink scale on the outer side. A missing or failed logo prints `label` (or `name`) in capitals. Logos retain their own colours and
alpha. Both image loaders use CORS-anonymous requests. Short or stacked logos
keep their aspect ratio, so their length is limited by the strip width.

Artwork, generated fallbacks and spine textures use trilinear mipmaps, clamp
wrapping and the device's maximum anisotropy. The print shaders integrate up to
four samples along the footprint's long axis with an explicit minor-axis LOD;
tilted fine type stays sharp without forcing mip zero. Generated fallback and
harness covers are 2048 px, including a fine-type/rule fixture in the harness.

`page: null` defaults to a transparent canvas with white as the optical page
colour. A CSS colour normally makes the canvas opaque. Set `transparent: true`
to keep DOM visibility while the plastic sees that colour; `setPage(colour,
transparent)` updates both. The actual DOM is not sampled as a texture.
`eventTarget` redirects pointer input from an overflowing canvas to a host
region. `hitTest(clientX, clientY)` checks the currently visible tray and lid.
`spin`, `autoDemo`, and `reducedMotion` control motion independently. Reduced
motion scales idle floating to 35%; explicit interactions still animate.

Optical constants in `pipeline.ts` retain polystyrene IOR 1.59, per-mm absorption,
14 mm behind-image sampling depth and one/two rod samples.

## Lifecycle and compatibility

Pause cancels animation frames; resume starts with a zero time step. Hidden
documents also stop rendering. Resize waits until the next active frame.
`maxPixelRatio` defaults to 1.5. Every 30 animation frames, a median interval over
20 ms reduces DPR by 0.25, down to one. Rods use one sample at DPR ≥ 1.5 (also on
coarse pointers). Idle motion draws at 30 fps; hover, drag, transitions and settling
draw at up to 60 fps. `setScrolling(true)` skips alternate animation frames.
Pointer moves are coalesced per frame and canvas bounds are cached until resize/scroll.
Artwork uses ImageBitmap decoding, with async HTML decoding as a compatibility
fallback. A shared frame queue uploads one texture per frame across mounts;
`compileAsync` prepares all programs, and studio faces are warmed separately.
The initial still frame precedes `onReady`, even for paused mounts. The shelf glue
starts mounting in idle time within 800 px, keeps flat previews until ready, and
animates only the intersecting case nearest the viewport's vertical centre.
Side-by-side ties follow pointer/focus; scrolling yields until 150 ms after its last event.
Shader link failures and context loss call `onFail`; restored contexts rebuild
the studio and recompile before resuming. Dispose disconnects observers and
listeners, releases capture, disposes geometry/materials/targets and all owned
art/spine textures, loses the context, and removes the canvas. It is idempotent;
late image callbacks do not allocate textures after disposal.

Half-float targets preserve HDR lamp energy. Byte targets encode alpha tags
divided by eight; refraction remains but shadow/highlight range is reduced.
Opaque and plastic passes use up to four MSAA samples, limited by attachment
support. Specular lighting comes from continuous, filtered softbox reflections.


## Portrait formats

`formats.ts` holds the physical dimensions and procedural shell/tray geometry.
The Blu-ray case is 135 × 171.5 × 12 mm, with 3 mm corners and a 165° left
hinge. The G2 steelbook is 135 × 170 × 14 mm, with 2.5 mm corners and a 170°
left hinge. Portrait discs remain stationary. Closed framing uses 70% of
canvas height; open framing fits approximately 92% of the width. Hit planes,
scissor bounds and analytical shadows follow the selected footprint.

`portrait-shaders.ts` shades the blue polypropylene separately from the clear
outer sleeve: the inner floor multiplies reverse-print RGB by (0.70, 0.79, 0.88)
at normal incidence (~78% luminance transmission), with a refracted path-length
adjustment down to ~71% at grazing incidence (IOR 1.49). Supplied interior art
stays sharp, with no additive blue wash;
the thicker rails, ribs and hub retain their stronger blue tint. Broad body
reflections remain broader than the separate glossy sleeve. The sleeve uses
Fresnel-weighted, footprint-filtered softboxes, low-frequency film ripple, and
a welded border approximately 1 mm inside the case edge. The 13 mm header is
CanvasTexture text in a local sans-serif font. `hasBanner` suppresses this
header when the loaded front already contains it. Both panels show the
reverse insert through blue plastic; integral clips, closure catches and the
slotted hub are modelled geometry.

Steel shells carry printed metal with cool silver reflections. `finish` is
`matte` by default (broad anisotropic sheen) or `gloss` (sharp lacquer).
`relief` enables bounded luminance-gradient normal perturbation on the front;
missing/failed relief leaves the normal unchanged. Rolled hinge curls expose
bare metal. `inside` is a single left-to-right spread mapped continuously
across both inner panels, with a gloss finish on steel. Missing/failed interior
art uses off-white (0.93, 0.93, 0.92) paper on Blu-rays: horizontally mirrored
front ink on the left and back ink on the right (front fallback), desaturated
and slightly softened at 7.5% show-through beneath the existing blue plastic.
Steelbooks without interior art use plain silver-grey with a soft brushed sheen.
A 128 × 128 × 1.2 mm satin-black ABS plate (4 mm corner radius) is bonded
to the right panel, leaving interior art around it. A low rounded rim, support
rings and twelve slotted release petals are geometry. A local soft contact
shadow darkens the plate beneath the disc and disappears with `discType: none`.

`discType` selects `cd`, `bluray` (portrait default), `dvd`, or `none`. The
Blu-ray substrate is violet-blue with tighter diffraction; DVD has its own
track spacing. `none` hides the disc and its depth occluder. Missing disc
print uses the cover. Optional `spine` is a full portrait scan, rotated into
the shared spine UV orientation; failed scans fall back to `spineLogo`/text.

All three shelves use guarded eager manifest globs, title slugs, and the
curated image fallback. A failed front/disc file tries the curated URL before
a generated label. Film and Games preserve their flat PNG cases for WebGL
failure. The renderer mounts lazily, pauses off screen, receives input only
from a panel-sized hit area, tracks the theme page colour, and synchronizes
spines, accessible labels and the info strip through the same callbacks.

References used for the format details:
- [Elite cases and insert dimensions](https://www.duplication.com/viva-elite/)
- [Scanavo SteelBook product specifications](https://www.filmarena.cz/soubory/steelbook-product-specification.pdf)

## Wear and face interaction

`wear?: number` is available on both `CdDisc` and `CdCaseOptions`. Per-item
values override the global value; the default is 0.35, clamped to [0, 1].
Zero disables scratches and warping. `materials.ts` supplies deterministic
object-space micro-normal/roughness perturbations seeded by item index:
PS hairlines, softer PP scuffs, sparse sleeve hairlines, gloss-lacquer swirls
and faint matte brushing. Ink and diffuse colour never receive scratch lines.
Panels are tessellated to 10 mm edges and displaced by less than 0.28 mm even
at maximum wear; colour and depth passes share uniforms and the same warp.
See [MATERIALS.md](MATERIALS.md) for the pre-implementation study.

Drag horizontally through any number of turns; release to coast and settle.
`Shift+ArrowLeft/Right` flips to the adjacent face on the focused input target.
Tap (or Enter/Space on the input itself) opens/closes on the front; a back tap
returns to the front without opening. `onFace?: (face: 'front' | 'back') => void`
reports initial front and subsequent visible-face changes, with a small
edge-on hysteresis. Selecting another item resets its rotation to front.
The engine makes its input target focusable and restores its previous tabindex
on disposal. Existing controller methods and all required fields are unchanged.

## Verification

See [VERIFY.md](VERIFY.md) for commands, individual shot descriptions and limits.
The persistent native harness is `/home/yashnilay/work/cdcase-harness/`.
It exports the actual Three geometry, shaders, uniforms and draw order from
Node, then renders through Python ctypes/EGL GLES 3 with four-sample MSAA.
All native jobs are sequential, with `LP_NUM_THREADS=1`; dependencies are
reused through the existing node_modules symlink. Nothing is installed.
