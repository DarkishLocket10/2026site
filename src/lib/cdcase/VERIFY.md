# Case look round — verified 2026-10-22

All repository edits are under `src/lib/cdcase/`. No dependencies were installed,
no commits were made, and `Bookshelves.astro` was not edited.

Material study summary (written before implementation; MATERIALS.md is 54 lines):
- Polystyrene: sparse sliding hairlines, edge/hinge wear and a shallow lid bow.
- Polypropylene/PET: softer body scuffs and dish; a glossy, lightly rippled sleeve with fine hairlines and a welded edge.
- Tinplate lacquer: curved gloss swirls or faint matte brushing, shallow oil-canning and a pillowed centre.

Implemented: removal of the three star targets and extraction/blur passes,
removal of point-lamp impulses, filtered steady softbox reflections, material
wear and tessellated warp, the 128 × 128 × 1.2 mm rounded satin ABS holder,
and unbounded case yaw with inertia, face settling, back-aware taps and
Shift+ArrowLeft/Right flips. Public additions are optional `wear` on items and
options, and optional `onFace` on options. Wear defaults to 0.35; zero disables
wear/warp. Displacement is bounded below 0.3 mm; colour/depth use the same warp.

Commands run from `/home/yashnilay/work/2026site-look`:

```sh
ASTRO_TELEMETRY_DISABLED=1 npx --no-install astro check \
  --config ../../../../tmp/2026site-cases-astro.config.mjs \
  --tsconfig /tmp/2026site-cases-tsconfig.json
ASTRO_TELEMETRY_DISABLED=1 npm run build \
  -- --config ../../../../tmp/2026site-cases-astro.config.mjs
node /home/yashnilay/work/cdcase-harness/run-all.mjs
git diff --check
```

Astro: **11 scoped files, 0 errors, 0 warnings, 0 hints**. Build: **17 pages,
passed**. Existing build notices: KaTeX Unicode strict-mode warning, bundle
size warning, and unavailable Piwigo fetch using its fallback. The temporary
Astro config imports the repository config and redirects Vite/Astro caches to
`/tmp` because the shared node_modules target is read-only. Copies of both
configs are retained in the persistent harness for reuse after a reboot.

The harness exports actual Pipeline geometry, shaders, uniforms and draw order,
then runs EGL GLES 3.2 / Mesa llvmpipe with four-sample MSAA, HDR targets,
cubemap mipmaps, depth occluders, blending, scissor and polygon offset.
Every native render ran serially with `LP_NUM_THREADS=1`; a native file lock
prevents simultaneous GL jobs. Total concurrent heavy jobs never exceeded two.
Generated asymmetric test art is local. Main shots are 900 × 900; detail shots
are 1600 × 1600. Crops are literal 2× enlargements without contrast adjustment.
All 32 PNGs were visually inspected, including the final contact sheets.

Motion assertions passed: multiple turns, clamped tilt, no spring during drag,
timestamp-based flicks, inertial continuation, front/back settling and callbacks,
back tap returning without opening, front open/close, keyboard flip method,
selection reset, cancellation, and pointer-event-rate independence.
Geometry assertions passed: finite attributes/valid indices, holder dimensions
and plate clearance below the disc.

| Shot | Inspection |
| --- | --- |
| [jewel-closed-face-gloss-w0.35](/home/yashnilay/work/cdcase-harness/shots/jewel-closed-face-gloss-w0.35.png) | Clear square frame and sharp front print; wear is not conspicuous head-on. |
| [jewel-closed-idle-gloss-w0.35](/home/yashnilay/work/cdcase-harness/shots/jewel-closed-idle-gloss-w0.35.png) | Tilt exposes the clear rails and a continuous pale reflection down the left lid edge. |
| [jewel-back-gloss-w0.35](/home/yashnilay/work/cdcase-harness/shots/jewel-back-gloss-w0.35.png) | BACK / 02 and left/right registration text read normally through the clear tray floor. |
| [jewel-half-spin-gloss-w0.35](/home/yashnilay/work/cdcase-harness/shots/jewel-half-spin-gloss-w0.35.png) | At yaw π/2 the printed spine and thin case section remain visible; faces are edge-on. |
| [jewel-open-gloss-w0.35](/home/yashnilay/work/cdcase-harness/shots/jewel-open-gloss-w0.35.png) | Darkened inner booklet sits left; disc, clear centre, release hub and inlay sit right. |
| [bluray-closed-face-gloss-w0.35](/home/yashnilay/work/cdcase-harness/shots/bluray-closed-face-gloss-w0.35.png) | Blue rounded body/header surrounds saturated, sharp print; flat view has little glare. |
| [bluray-closed-idle-gloss-w0.35](/home/yashnilay/work/cdcase-harness/shots/bluray-closed-idle-gloss-w0.35.png) | A softbox reflection enters at the left sleeve edge without obscuring the fine print. |
| [bluray-back-gloss-w0.35](/home/yashnilay/work/cdcase-harness/shots/bluray-back-gloss-w0.35.png) | BACK / 02 is upright and unmirrored, with a mild blue transmission tint. |
| [bluray-half-spin-gloss-w0.35](/home/yashnilay/work/cdcase-harness/shots/bluray-half-spin-gloss-w0.35.png) | Printed spine, rounded blue lips and hinge separation remain visible at yaw π/2. |
| [bluray-open-gloss-w0.35](/home/yashnilay/work/cdcase-harness/shots/bluray-open-gloss-w0.35.png) | Continuous interior spread, blue clips/rails and stationary disc are visible; right art is occluded by the disc. |
| [steelbook-closed-face-gloss-w0.35](/home/yashnilay/work/cdcase-harness/shots/steelbook-closed-face-gloss-w0.35.png) | Front ink stays sharp; narrow rolled perimeter has restrained metallic highlights. |
| [steelbook-closed-idle-gloss-w0.35](/home/yashnilay/work/cdcase-harness/shots/steelbook-closed-idle-gloss-w0.35.png) | Continuous lacquer reflection enters on the left; sparse curved wear appears only near that reflection. |
| [steelbook-back-gloss-w0.35](/home/yashnilay/work/cdcase-harness/shots/steelbook-back-gloss-w0.35.png) | BACK / 02 and asymmetric test art read correctly on the exterior back panel. |
| [steelbook-half-spin-gloss-w0.35](/home/yashnilay/work/cdcase-harness/shots/steelbook-half-spin-gloss-w0.35.png) | Printed spine and rolled hinge curls show the 14 mm case section at yaw π/2. |
| [steelbook-open-gloss-w0.35](/home/yashnilay/work/cdcase-harness/shots/steelbook-open-gloss-w0.35.png) | Rounded black insert sits on the right panel with interior art above/below it; disc and centre hub are visible. |
| [bluray-detail-sleeve-gloss-w0.35](/home/yashnilay/work/cdcase-harness/shots/bluray-detail-sleeve-gloss-w0.35.png) | Defined vertical softbox spans the sleeve. Its edge bends slightly; a fine perimeter lip sits inside the blue body. Ink remains sharp beneath glare. |
| [jewel-detail-scratch-gloss-w0.35](/home/yashnilay/work/cdcase-harness/shots/jewel-detail-scratch-gloss-w0.35.png) | Fine sliding hairlines break the lid reflection near its boundaries; the remaining purple print stays clean. |
| [bluray-detail-pp-gloss-w0.35](/home/yashnilay/work/cdcase-harness/shots/bluray-detail-pp-gloss-w0.35.png) | Without supplied inside art, the pale paper reverse reveals faint, wider vertical scuffs in the broad PP sheen. Ghosted outside print is intentional. |
| [steelbook-detail-scratch-gloss-w0.35](/home/yashnilay/work/cdcase-harness/shots/steelbook-detail-scratch-gloss-w0.35.png) | Short curved lacquer marks cross the sharp reflection boundary; outside it the print is unmarked. The softbox itself is intentionally bright. |
| [steelbook-detail-scratch-matte-w0.35](/home/yashnilay/work/cdcase-harness/shots/steelbook-detail-scratch-matte-w0.35.png) | The same angle has a wide satin reflection and much fainter brushed scuffs; no hard white softbox rectangle. |
| [steelbook-detail-holder-gloss-w0.35](/home/yashnilay/work/cdcase-harness/shots/steelbook-detail-holder-gloss-w0.35.png) | Plate corners, low raised rim, support ring and release petals read under a broad satin highlight. Art remains visible around the plate. |
| [steelbook-holder-bare-gloss-w0.35](/home/yashnilay/work/cdcase-harness/shots/steelbook-holder-bare-gloss-w0.35.png) | Disc hidden: entire rounded plate, perimeter rim, disc supports and rosette are exposed; no phantom disc contact shadow. |
| [steelbook-detail-scratch-gloss-w0](/home/yashnilay/work/cdcase-harness/shots/steelbook-detail-scratch-gloss-w0.png) | Pristine comparison: continuous clean lacquer reflection without curved scratch interruptions. |
| [bluray-detail-pp-gloss-w0](/home/yashnilay/work/cdcase-harness/shots/bluray-detail-pp-gloss-w0.png) | Pristine comparison: smoother pale PP sheen without the faint scuff streaks; paper reverse remains unchanged. |
| [sleeve-reflection-2x](/home/yashnilay/work/cdcase-harness/shots/sleeve-reflection-2x.png) | 2×: gently bent softbox boundary, tiny sleeve hairlines and faint doubled perimeter edge over saturated print. |
| [pet-scratch-2x](/home/yashnilay/work/cdcase-harness/shots/pet-scratch-2x.png) | 2×: sparse narrow hairlines visible on the reflected strip; adjacent diffuse purple remains clean. |
| [polystyrene-scratch-2x](/home/yashnilay/work/cdcase-harness/shots/polystyrene-scratch-2x.png) | 2×: thin sliding hairlines catch the lid reflection alongside readable fine type. |
| [polypropylene-scuff-2x](/home/yashnilay/work/cdcase-harness/shots/polypropylene-scuff-2x.png) | 2×: pale, soft scuff streaks interrupt the broad interior sheen; lower contrast than PS/PET. |
| [lacquer-gloss-swirl-2x](/home/yashnilay/work/cdcase-harness/shots/lacquer-gloss-swirl-2x.png) | 2×: short curved streaks crossing the sharp lacquer reflection; no drawn diffuse scratch lines. |
| [lacquer-matte-scuff-2x](/home/yashnilay/work/cdcase-harness/shots/lacquer-matte-scuff-2x.png) | 2×: extremely faint vertical brushing within the broad satin highlight. |
| [steelbook-holder-2x](/home/yashnilay/work/cdcase-harness/shots/steelbook-holder-2x.png) | 2×: rounded square plate, thin raised edge, near-disc support and darker contact region beneath the disc. |
| [steelbook-hub-2x](/home/yashnilay/work/cdcase-harness/shots/steelbook-hub-2x.png) | 2×: twelve separated moulded release fingers and retaining lips, with satin highlights and dark slots. |

Review sheets: [poses](/home/yashnilay/work/cdcase-harness/poses-contact.png),
[details](/home/yashnilay/work/cdcase-harness/details-contact.png),
[crops](/home/yashnilay/work/cdcase-harness/crops-contact.png).
Logs: [native verification](/home/yashnilay/work/cdcase-harness/verification.log),
[build](/home/yashnilay/work/cdcase-harness/build.log).

Gaps: native GL is not a live browser test. Real pointer capture, keyboard event
routing through the parallel shelf redesign, hardware-GPU performance and
continuous animation need browser verification. Static shots plus deterministic
motion tests do not establish frame-by-frame temporal quality on every GPU.
The harness uses generated art and a local-font banner, not the production
artwork collection. Wear is deliberately hard to notice at normal shelf size;
the enlarged crops expose the subtle marks. Fine clear rails/hub edges retain
some raster grain under extreme enlargement. The 0.3 mm warp ceiling is tiny
at these framing scales, so reflection curvature is clearer than silhouette
movement. No gaps remain in the requested static shot/crop matrix.
