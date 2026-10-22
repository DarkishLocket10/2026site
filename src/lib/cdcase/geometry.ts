import * as THREE from 'three';

export type Point = readonly [number, number];
export interface Profile { hw: number; hh: number; rc: number; zc: number }
export interface Rod { path: Point[]; profile: Profile; closed?: boolean; ends?: 'round' | 'flat' }
export interface Parts { rods: THREE.BufferGeometry; sheets: THREE.BufferGeometry }
const TAU = Math.PI * 2;

export function arc(cx: number, cy: number, r: number, start: number, end: number, steps = 24): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = start + (end - start) * i / steps;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}
export function circle(cx: number, cy: number, r: number, step = 96): Point[] {
  return arc(cx, cy, r, 0, TAU, step).slice(0, -1);
}
export function roundedRect(cx: number, cy: number, hw: number, hh: number, r: number, steps = 10): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < 4; i++) {
    const x = cx + (i === 0 || i === 3 ? hw - r : r - hw);
    const y = cy + (i < 2 ? hh - r : r - hh);
    points.push(...arc(x, y, r, i * Math.PI / 2, (i + 1) * Math.PI / 2, steps));
  }
  return points;
}
export const roundedSquare = (half: number, r: number): Point[] => roundedRect(0, 0, half, half, r);

/** Tangent circular fillets keep ribs smooth without changing their endpoints. */
export function fillet(points: Point[], radius: number): Point[] {
  if (points.length < 3) return points.slice();
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], prev = points[i - 1], next = points[i + 1];
    const l0 = Math.hypot(prev[0] - p[0], prev[1] - p[1]);
    const l1 = Math.hypot(next[0] - p[0], next[1] - p[1]);
    const ux = (prev[0] - p[0]) / l0, uy = (prev[1] - p[1]) / l0;
    const vx = (next[0] - p[0]) / l1, vy = (next[1] - p[1]) / l1;
    const theta = Math.acos(THREE.MathUtils.clamp(ux * vx + uy * vy, -1, 1));
    if (theta < 0.001 || Math.PI - theta < 0.001) { out.push(p); continue; }
    const distance = Math.min(radius / Math.tan(theta / 2), l0 * 0.49, l1 * 0.49);
    const r = distance * Math.tan(theta / 2);
    const bisector = Math.hypot(ux + vx, uy + vy);
    const cx = p[0] + (ux + vx) / bisector * r / Math.sin(theta / 2);
    const cy = p[1] + (uy + vy) / bisector * r / Math.sin(theta / 2);
    const a = Math.atan2(p[1] + uy * distance - cy, p[0] + ux * distance - cx);
    let b = Math.atan2(p[1] + vy * distance - cy, p[0] + vx * distance - cx);
    while (b - a > Math.PI) b -= TAU;
    while (b - a < -Math.PI) b += TAU;
    out.push(...arc(cx, cy, r, a, b, 8));
  }
  out.push(points[points.length - 1]);
  return out;
}

/** One indexed allocation per part; profile data lets the shader find exit walls. */
export function sweepRods(rods: Rod[]): THREE.BufferGeometry {
  const position: number[] = [], normal: number[] = [], centres: number[] = [];
  const sides: number[] = [], sizes: number[] = [], caps: number[] = [], indices: number[] = [];
  for (const rod of rods) {
    const { hw, hh, rc, zc } = rod.profile;
    const profile = roundedRect(0, 0, hw, hh, Math.min(rc, hw, hh), 4);
    const n = profile.length, count = rod.path.length;
    const base = position.length / 3;
    const frames = rod.path.map((p, i) => {
      const prev = rod.path[rod.closed ? (i + count - 1) % count : Math.max(0, i - 1)];
      const next = rod.path[rod.closed ? (i + 1) % count : Math.min(count - 1, i + 1)];
      const length = Math.hypot(next[0] - prev[0], next[1] - prev[1]);
      return { p, tx: (next[0] - prev[0]) / length, ty: (next[1] - prev[1]) / length };
    });
    const vertex = (i: number, j: number, shrink = 1, extension = 0, cap = 0, tilt = 0) => {
      const { p, tx, ty } = frames[i], [u, w] = profile[j];
      const cu = THREE.MathUtils.clamp(u, -hw + rc, hw - rc);
      const cw = THREE.MathUtils.clamp(w, -hh + rc, hh - rc);
      const length = Math.hypot(u - cu, w - cw) || 1;
      const nu = (u - cu) / length, nw = (w - cw) / length;
      position.push(p[0] + ty * u * shrink + tx * extension, p[1] - tx * u * shrink + ty * extension, zc + w * shrink);
      normal.push(ty * nu * Math.cos(tilt) + tx * Math.sin(tilt), -tx * nu * Math.cos(tilt) + ty * Math.sin(tilt), nw * Math.cos(tilt));
      centres.push(p[0] + tx * extension, p[1] + ty * extension, zc);
      sides.push(ty, -tx, 0); sizes.push(hw, hh, rc); caps.push(cap);
    };
    for (let i = 0; i < count; i++) for (let j = 0; j < n; j++) vertex(i, j);
    const stitch = (a: number, b: number, reverse = false) => {
      for (let j = 0; j < n; j++) {
        const k = (j + 1) % n;
        if (reverse) indices.push(a + j, a + k, b + j, b + j, a + k, b + k);
        else indices.push(a + j, b + j, a + k, b + j, b + k, a + k);
      }
    };
    for (let i = 0; i < count - (rod.closed ? 0 : 1); i++) stitch(base + i * n, base + ((i + 1) % count) * n);
    if (!rod.closed) for (const end of [0, count - 1]) {
      const sign = end === 0 ? -1 : 1;
      if (rod.ends === 'flat') {
        const start = position.length / 3;
        for (let j = 0; j < n; j++) vertex(end, j, 1, 0, 1, sign * Math.PI / 2);
        for (let j = 1; j < n - 1; j++) {
          if (sign > 0) indices.push(start, start + j + 1, start + j);
          else indices.push(start, start + j, start + j + 1);
        }
      } else {
        let last = base + end * n;
        for (let step = 1; step <= 5; step++) {
          const angle = step / 5 * Math.PI / 2, start = position.length / 3;
          for (let j = 0; j < n; j++) vertex(end, j, Math.max(0.0001, Math.cos(angle)), sign * hw * Math.sin(angle), 0, sign * angle);
          stitch(last, start, sign < 0); last = start;
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  for (const [name, data, size] of [
    ['position', position, 3], ['normal', normal, 3], ['aCentre', centres, 3],
    ['aSide', sides, 3], ['aSize', sizes, 3], ['aCap', caps, 1],
  ] as const) geometry.setAttribute(name, new THREE.Float32BufferAttribute(data, size));
  geometry.setIndex(indices); geometry.computeBoundingSphere();
  return geometry;
}

export interface Sheet { outline: Point[]; holes?: Point[][]; z0: number; z1: number }
export function extrudeSheets(sheets: Sheet[], edges = false, maxEdge = 0): THREE.BufferGeometry {
  const positions: number[] = [], normals: number[] = [], thickness: number[] = [], indices: number[] = [];
  for (const sheet of sheets) {
    const outline = sheet.outline.map(p => new THREE.Vector2(...p));
    const holes = (sheet.holes ?? []).map(hole => hole.map(p => new THREE.Vector2(...p)));
    const faces = THREE.ShapeUtils.triangulateShape(outline, holes);
    const points = outline.concat(...holes);
    for (const front of [true, false]) {
      const base = positions.length / 3;
      for (const p of points) {
        positions.push(p.x, p.y, front ? sheet.z1 : sheet.z0);
        normals.push(0, 0, front ? 1 : -1); thickness.push(sheet.z1 - sheet.z0);
      }
      const triangle = (a: number, b: number, c: number): void => {
        const distance = (i: number, j: number): number => Math.hypot(positions[i * 3] - positions[j * 3], positions[i * 3 + 1] - positions[j * 3 + 1]);
        const ab = distance(a, b), bc = distance(b, c), ca = distance(c, a);
        if (!maxEdge || Math.max(ab, bc, ca) <= maxEdge) { indices.push(a, b, c); return; }
        if (bc > ab && bc >= ca) { triangle(b, c, a); return; }
        if (ca > ab && ca > bc) { triangle(c, a, b); return; }
        const mid = positions.length / 3;
        for (let axis = 0; axis < 3; axis++) positions.push((positions[a * 3 + axis] + positions[b * 3 + axis]) / 2);
        normals.push(0, 0, front ? 1 : -1); thickness.push(sheet.z1 - sheet.z0);
        triangle(a, mid, c); triangle(mid, b, c);
      };
      for (const [a, b, c] of faces) triangle(base + a, base + (front ? b : c), base + (front ? c : b));
    }
    if (edges) for (const contour of [outline, ...holes]) {
      // The opaque paper needs real thickness; plastic sheets use their swept rails.
      const clockwise = THREE.ShapeUtils.isClockWise(contour);
      const sign = (contour === outline ? 1 : -1) * (clockwise ? -1 : 1);
      for (let i = 0; i < contour.length; i++) {
        const a = contour[i], b = contour[(i + 1) % contour.length];
        const length = a.distanceTo(b), base = positions.length / 3;
        for (const [p, z] of [[a, sheet.z0], [b, sheet.z0], [a, sheet.z1], [b, sheet.z1]] as const) {
          positions.push(p.x, p.y, z);
          normals.push(sign * (b.y - a.y) / length, sign * (a.x - b.x) / length, 0);
          thickness.push(sheet.z1 - sheet.z0);
        }
        if (sign > 0) indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        else indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('aThick', new THREE.Float32BufferAttribute(thickness, 1));
  geometry.setIndex(indices); geometry.computeBoundingSphere();
  return geometry;
}

/** Standard 142 × 125 × 10.4 mm jewel case; the disc well is right of the spine. */
export function buildTray({ clearCentre = false }: { clearCentre?: boolean } = {}): Parts {
  const rods: Rod[] = [];
  const add = (path: Point[], hw: number, hh: number, rc: number, zc: number, closed = false, ends?: 'flat') =>
    rods.push({ path, profile: { hw, hh, rc, zc }, closed, ends });
  add(roundedRect(0, 0, 70.3, 61.8, 1.5), 0.7, 0.9, 0.65, -4.4, true);
  for (const sy of [-1, 1]) add([[-64, sy * 61.6], [70, sy * 61.6]], 0.55, 2.4, 0.5, -2.6);
  add([[70.3, -61], [70.3, 61]], 0.55, 2.4, 0.5, -2.6);
  add([[-70.4, -61.8], [-70.4, 61.8]], 0.6, 2.8, 0.55, -2.2);
  add([[-64.6, -61.8], [-64.6, 61.8]], 0.55, 2.2, 0.5, -2.6);
  add(circle(3.5, 0, 60.6, 192), 0.6, 0.9, 0.55, -3.6, true);
  for (const degrees of [45, 135, 225, 315]) {
    const a = degrees * Math.PI / 180;
    add([58, 61.5].map(r => [3.5 + r * Math.cos(a), r * Math.sin(a)]), 1, 0.7, 0.6, -3.4);
  }
  // Inward half-circles keep the thumb cut-outs inside the case perimeter.
  add(arc(3.5 - 60.6, 0, 6, -Math.PI / 2, Math.PI / 2), 0.6, 0.8, 0.55, -3.5);
  add(arc(3.5 + 60.6, 0, 6, Math.PI / 2, 3 * Math.PI / 2), 0.6, 0.8, 0.55, -3.5);
  for (const [r, hw, hh, rc, zc] of [[18.8, 0.8, 0.75, 0.7, -2.6], [16.5, 0.45, 0.45, 0.42, -2.4], [9.6, 0.95, 0.95, 0.9, -2.2], [6.6, 0.55, 0.85, 0.5, -2.5]])
    add(circle(3.5, 0, r), hw, hh, rc, zc, true);
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12;
    add([7.2, 9.2].map(r => [3.5 + r * Math.cos(a), r * Math.sin(a)]), 0.35, 0.5, 0.3, -2.3);
  }
  for (const sy of [-1, 1]) add([[-69.2, sy * 52], [-69.2, sy * 62]], 1.6, 1.6, 1.58, 3.6, false, 'flat');
  const sheets: Sheet[] = [
    { outline: roundedRect(0, 0, 70.5, 62, 1.2), z0: -5.2, z1: -4 },
    { outline: circle(3.5, 0, 19.4), holes: [circle(3.5, 0, 6.2)], z0: -3.4, z1: -2.6 },
  ];
  if (clearCentre) {
    add(circle(3.5, 0, 7.75), 0.25, 0.6, 0.24, -1.8, true);
    sheets.push({ outline: circle(3.5, 0, 15), holes: [circle(3.5, 0, 7.5)], z0: -2.4, z1: -1.2 });
  }
  return { rods: sweepRods(rods), sheets: extrudeSheets(sheets, false, 10) };
}

export function buildLid(): Parts {
  const rods: Rod[] = [];
  const add = (path: Point[], hw: number, hh: number, rc: number, zc: number, closed = false, ends?: 'flat') =>
    rods.push({ path, profile: { hw, hh, rc, zc }, closed, ends });
  add(roundedRect(2.25, 0, 68.35, 62.1, 1.2), 0.6, 0.75, 0.55, 4.45, true);
  for (const sy of [-1, 1]) {
    add([[-66, sy * 62.1], [70.6, sy * 62.1]], 0.5, 2, 0.45, 2.6);
    for (const [x0, x1, cx] of [[-44, -19, -22.2], [27, 54, 30.2]]) {
      add([[x0, sy * 60.2], [x1, sy * 60.2]], 0.9, 0.55, 0.5, 2.9);
      add(arc(cx, sy * 60.2, 3.2, sy > 0 ? Math.PI : 0, sy > 0 ? TAU : Math.PI), 0.9, 0.55, 0.5, 2.9);
    }
    add([[70.4, sy * 36.5 - 2], [70.4, sy * 36.5 + 2]], 0.6, 0.9, 0.55, 2.4);
    add([[-69.2, sy * 40], [-69.2, sy * 51]], 1.55, 1.55, 1.53, 3.6, false, 'flat');
  }
  add([[70.6, -62], [70.6, 62]], 0.5, 2, 0.45, 2.6);
  add([[-67, -61], [-67, 61]], 0.45, 0.55, 0.4, 4.6);
  add([[-69.6, -61], [-69.6, 61]], 0.7, 0.8, 0.65, 4.2);
  return { rods: sweepRods(rods), sheets: extrudeSheets([
    { outline: roundedRect(2.25, 0, 68.75, 62.5, 1.4), z0: 3.6, z1: 5.2 },
    { outline: roundedRect(-68.25, 0, 1.75, 61, 0.6), z0: 3.6, z1: 5.2 },
  ], false, 10) };
}

export function buildBooklet(): THREE.BufferGeometry {
  return extrudeSheets([{ outline: roundedRect(3.5, 0, 60.25, 60.25, 0.6), z0: 3.2, z1: 3.5 }], true);
}

/** Opaque tray card beneath the clear floor, folded up into both side slots. */
export function buildInlay(): THREE.BufferGeometry {
  const rectangle = (left: number, right: number): Point[] =>
    [[right, 61.5], [left, 61.5], [left, -61.5], [right, -61.5]];
  return extrudeSheets([
    { outline: rectangle(-66, 70.5), z0: -5.15, z1: -4.95 },
    { outline: rectangle(-66, -65.8), z0: -4.95, z1: -0.35 },
    { outline: rectangle(70.3, 70.5), z0: -4.95, z1: -0.35 },
  ], true);
}

/** Both strips share one horizontal texture; its left-to-right text reads top-to-bottom. */
export function buildSpine(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    // The visible fold sits beside the hinge rails, clear of the booklet edge.
    -66.1, 61.2, -3.9, -66.1, -61.2, -3.9, -58.1, 61.2, -3.9, -58.1, -61.2, -3.9,
    -71.05, 61.2, -4.8, -71.05, -61.2, -4.8, -71.05, 61.2, 4.8, -71.05, -61.2, 4.8,
  ], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ], 3));
  // u increases down the case on both faces; side margins retain the same ink scale.
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1, 0, -0.1, 1, -0.1, 0, 1.1, 1, 1.1], 2));
  geometry.setIndex([0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6]);
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildDisc({ innerRadius = 7.5 }: { innerRadius?: number } = {}): THREE.BufferGeometry {
  const p: number[] = [], n: number[] = [], face: number[] = [], indices: number[] = [];
  const segments = 256, rings = 24;
  for (let side = 0; side < 2; side++) {
    const base = p.length / 3;
    for (let j = 0; j <= rings; j++) for (let i = 0; i <= segments; i++) {
      const r = innerRadius + (60 - innerRadius) * j / rings, a = i / segments * TAU;
      p.push(r * Math.cos(a), r * Math.sin(a), side === 0 ? -1.2 : -2.4);
      n.push(0, 0, side === 0 ? 1 : -1); face.push(side);
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < segments; i++) {
      const a = base + j * (segments + 1) + i, b = a + segments + 1;
      if (side === 0) indices.push(a, b, a + 1, b, b + 1, a + 1);
      else indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  for (const radius of [innerRadius, 60]) {
    const base = p.length / 3, sign = radius === 60 ? 1 : -1;
    for (const z of [-2.4, -1.2]) for (let i = 0; i <= segments; i++) {
      const a = i / segments * TAU;
      p.push(radius * Math.cos(a), radius * Math.sin(a), z);
      n.push(sign * Math.cos(a), sign * Math.sin(a), 0); face.push(2);
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i, b = a + segments + 1;
      if (sign > 0) indices.push(a, a + 1, b, b, a + 1, b + 1);
      else indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  geometry.setAttribute('aFace', new THREE.Float32BufferAttribute(face, 1));
  geometry.setIndex(indices); geometry.computeBoundingSphere();
  return geometry;
}
