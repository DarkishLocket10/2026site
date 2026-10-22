# Case material study — before implementation

All dimensions below are millimetres. This is a lightly handled collection,
not distressed props. `wear` defaults to 0.35; zero disables wear and warp.
Patterns are fixed in object space and seeded by item index, never time.

## Jewel lid and tray — clear, brittle polystyrene
Sparse, fine hairlines run mostly along the shelf-sliding direction, with a
few crossed strokes. Typical modelled lengths: 4–30 mm. Handling concentrates
them at the perimeter, beside the hinge, and in a light central sliding band.
They interrupt a reflected softbox as narrow anisotropic streaks; they must
not become white or dark lines painted over the booklet in diffuse light.
The lid has a shallow broad bow; the tray floor is more restrained. Small
normal changes bend the reflection while the perimeter remains seated.

## Blu-ray body — soft blue polypropylene
PP has shorter, wider, softer scuffs than polystyrene, typically 3–18 mm.
Most follow shelf travel, with a few oblique handling marks near the hinge
and closure edges. Density stays low and the satin highlight broadens gently.
Blue absorption and the underlying print remain independent of these marks.
Large panels show shallow dish/oil-canning with broad, irregular lobes, not
sharp creases. Ribs and the perimeter stay substantially rigid.

## Blu-ray outer sleeve — clear PET/PP film
Very sparse, thin sliding scratches are 8–35 mm long, mainly vertical with
slight angle variation; edges and the central contact band receive more wear.
Sharp softbox reflections reveal hairlines and a tiny roughness increase.
Ink below remains sharp and saturated. Fresnel strengthens the reflection
at grazing angles. The welded border lies about 1 mm inside the case edge.
Broad, very shallow film ripples bend reflections independently of the body;
the sleeve follows the body's dish without crossing the print surface.

## Steelbook — printed, lacquered tinplate
Gloss lacquer carries sparse curved cleaning/swirl arcs (roughly 8–35 mm),
seen only within the reflected lights, with more handling near the edges.
Matte lacquer has faint, short brushed scuffs (3–15 mm) in the sliding
direction, mostly visible as a slightly wider satin sheen. Neither finish
has bare-metal gouges, desaturated ink, or visible diffuse scratch strokes.
Panels have a gently pillowed centre and a few extremely shallow oil-canning
depressions; rolled edges remain seated. No displacement exceeds 0.3 mm.

## Steelbook disc insert — satin black ABS
A 128 × 128 × 1.2 mm rounded plate, 4 mm corner radius, sits on the right
interior. A low perimeter rim, disc support and slotted release petals catch
broad restrained highlights. The disc casts a soft local contact shadow;
interior metal/art remains visible around the plate. No wear is painted on.

## Implementation constraints
Only specular normals and roughness receive micro-scratch perturbations.
Filter subpixel hairlines by their screen footprint to avoid crawling/glints.
Use tessellated panels with matching colour/depth displacement and analytic
low-frequency normals; clamp the global/item wear control to [0, 1].
Remove star extraction, star blur targets/passes and point-lamp impulses.
Keep bounded, steady softbox reflections with no temporal random input.
