import * as THREE from 'three';
import type { CaseKind } from './types';
import { arc, circle, extrudeSheets, roundedRect, sweepRods, type Parts, type Rod } from './geometry';

/** Millimetres throughout, with the closed case centred at the origin. */
export const CASE_SPECS = {
  jewel: { width: 142, height: 125, depth: 10.4, radius: 1.5, hingeX: -69.2, hingeZ: 3.6, angle: 2.96 },
  bluray: { width: 135, height: 171.5, depth: 12, radius: 3, hingeX: -67.5, hingeZ: 0, angle: 165 * Math.PI / 180 },
  steelbook: { width: 135, height: 170, depth: 14, radius: 2.5, hingeX: -67.5, hingeZ: 0, angle: 170 * Math.PI / 180 },
} as const;

export function buildKeepShell(kind: CaseKind, lid: boolean, clearCentre = false): Parts {
  const s = CASE_SPECS[kind], half = s.depth / 2, sign = lid ? 1 : -1;
  const rods: Rod[] = [];
  const add = (path: Rod['path'], hw: number, hh: number, zc: number, closed = false) =>
    rods.push({ path, profile: { hw, hh, rc: Math.min(hw, hh) * 0.95, zc }, closed });
  // Rounded perimeter, thin rolled lip, and the recessed mating wall.
  add(roundedRect(0, 0, 66.3, s.height / 2 - 1.2, s.radius - 1.2), 1.2, 1.2, sign * (half - 1.2), true);
  add(roundedRect(0, 0, 66.1, s.height / 2 - 1.4, s.radius - 0.65), 0.65, half / 2 - 0.4, sign * half / 2, true);
  // Segmented hinge knuckles on the left: steel curls remain unprinted.
  for (let y = -s.height / 2 + 9; y < s.height / 2 - (lid ? 21 : 12); y += 24) {
    add([[-66.1, y + (lid ? 10 : 0)], [-66.1, y + (lid ? 19 : 9)]], 1.35, 1.35, 0);
  }
  if (kind === 'bluray') {
    if (lid) {
      // Two integral leaflet clips, pointing inward on the left panel.
      for (const y of [-55, 55]) add([[-60, y], [-52, y]], 1.7, 0.65, half - 2.2);
    } else {
      // Disc retaining ring and a slotted push-button rosette.
      add(circle(0, 0, 60.8, 192), 0.7, 0.65, -3.3, true);
      add(circle(0, 0, 17), 0.8, 0.6, -3, true);
      add(circle(0, 0, 6.7), 0.5, 1.7, -2.1, true);
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        add([6.7, 9.4].map(r => [r * Math.cos(a), r * Math.sin(a)]), 0.65, 0.65, -0.9);
      }
      // Two short closure catches along the right edge.
      for (const y of [-48, 48]) add([[63.5, y - 3], [63.5, y + 3]], 1.3, 1, 0);
    }
  }
  // A separate thin clear sleeve catches a sharp Fresnel reflection above
  // the outside print. The inside polypropylene is shaded by the panel.
  const sleeveZ = sign * (half + 0.12);
  const sheets = kind === 'bluray' ? [{
    outline: roundedRect(0, 0, 66.5, s.height / 2 - 1, 2),
    z0: sleeveZ - 0.035, z1: sleeveZ + 0.035,
  }] : [];
  return { rods: sweepRods(rods), sheets: extrudeSheets([
    ...sheets,
    ...(!lid && clearCentre ? [{
      outline: circle(0, 0, 15), holes: [circle(0, 0, 7.5)], z0: -2.4, z1: -1.2,
    }] : []),
  ], false, 10) };
}

export function buildKeepPanel(kind: CaseKind, lid: boolean): THREE.BufferGeometry {
  const s = CASE_SPECS[kind], d = s.depth / 2;
  return extrudeSheets([{
    outline: roundedRect(0, 0, 66.3, s.height / 2 - 1.2, s.radius),
    z0: lid ? d - 1.3 : -d, z1: lid ? d : -d + 1.3,
  }], true, 10);
}

export function buildKeepSpine(kind: CaseKind): THREE.BufferGeometry {
  const s = CASE_SPECS[kind], h = s.height / 2 - 3, d = s.depth / 2 - 0.5;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -67.55, h, -d, -67.55, -h, -d, -67.55, h, d, -67.55, -h, d,
  ], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([-1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geometry.setIndex([0, 1, 2, 1, 3, 2]);
  return geometry;
}

/** Black glued-in disc bed; its corners leave the interior spread exposed. */
export function buildSteelTray(): Parts {
  const rods: Rod[] = [];
  const add = (path: Rod['path'], hw: number, hh: number, zc: number, closed = false) =>
    rods.push({ path, profile: { hw, hh, rc: Math.min(hw, hh) * 0.9, zc }, closed });
  // The bonded plate touches the right shell (inner face z = -5.7).
  add(roundedRect(0, 0, 63.45, 63.45, 3.45), 0.55, 0.35, -4.15, true);
  add(circle(0, 0, 60.7, 192), 0.55, 0.45, -3.9, true);
  add(circle(0, 0, 17), 0.8, 0.95, -3.35, true);
  add(circle(0, 0, 5.4), 0.55, 1.25, -3.2, true);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    // Separate curved spring fingers leave visible release slots and lips.
    add([5.2, 6.5, 7.4].map(r => [r * Math.cos(a), r * Math.sin(a)]), 0.48, 1.15, -2.5);
    add(arc(0, 0, 7.4, a - 0.13, a + 0.13, 5), 0.35, 0.3, -1.05);
  }
  return { rods: sweepRods(rods), sheets: extrudeSheets([{
    outline: roundedRect(0, 0, 64, 64, 4), z0: -5.65, z1: -4.45,
  }], true) };
}

/** Typeset locally; no logo asset or font request. */
export function bluRayBanner(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 200;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot create Blu-ray banner');
  ctx.fillStyle = '#ffffff'; ctx.font = '600 98px Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('BLU-RAY DISC', 1024, 104, 1450);
  return new THREE.CanvasTexture(canvas);
}
