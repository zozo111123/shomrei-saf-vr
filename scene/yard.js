// yard.js - the school courtyard: paving and four buildings, all generated (no images, no models).
// Coordinates: the viewer's eyes are at the origin looking down -Z; the ground is G metres below.
import * as THREE from 'three';
import { M } from './mat.js';

export const G = -1.2;

// deterministic randomness, so the yard is the same on every load and in every rendered frame
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const WALL = '#e6d8bd', WALL2 = '#ddcdb0', PIL = '#efe5d0', SLAB = '#f2ebdc', GLASS = '#34404c', FRAME = '#efeee9', GRILLE = '#3c3f43';
const PANELS = ['#8c8f3d', '#6b4f8b', '#3f8984', '#c49530', '#b6533e', '#4f7fae'];
const TRIM = '#6e4f90';

// one facade along an axis. o = [x,z] start; u = unit along the facade; n = unit toward the yard
function facade(b, f) {
  const R = rng(f.seed);
  const P = (u, v, n) => [f.o[0] + f.u[0] * u + f.n[0] * n, G + v, f.o[1] + f.u[1] * u + f.n[1] * n];
  const S = (du, dv, dn) => [Math.abs(f.u[0]) * du + Math.abs(f.n[0]) * dn, dv, Math.abs(f.u[1]) * du + Math.abs(f.n[1]) * dn];
  const box = (u, v, n, du, dv, dn, col, mat = M.plaster) => b.box(S(du, dv, dn), P(u, v, n), col, mat);
  const discRot = Math.abs(f.n[1]) > 0.5 ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2];
  const H = 3.4, F = f.floors, Ht = F * H, L = f.len, bays = Math.max(1, Math.round(L / (f.bay ?? 3.1))), W = L / bays;
  const wall = f.wall ?? WALL;
  box(L / 2, Ht / 2, -0.3, L, Ht, 0.6, wall);
  box(L / 2, 0.2, 0.04, L, 0.4, 0.09, '#9a9389');
  for (let fl = 1; fl <= F; fl++) box(L / 2, fl * H - 0.13, 0.12, L + 0.1, 0.26, 0.34, SLAB);
  box(L / 2, Ht + 0.45, -0.05, L, 0.9, 0.42, wall);
  box(L / 2, Ht + 0.93, 0.0, L + 0.06, 0.07, 0.52, '#d6cdbd');
  for (let i = 0; i <= bays; i++) box(i * W, Ht / 2, 0.13, 0.34, Ht, 0.28, PIL);
  // the window: concrete surround, white frame, glass, steel grille, a roller-shutter box, maybe an AC unit
  const windowAt = (cu, vb, ww, wh, frameCol, grille = true) => {
    box(cu, vb + wh / 2, 0.012, ww, wh, 0.03, GLASS, M.glass);
    const t = 0.13;
    box(cu, vb + wh + t / 2, 0.08, ww + 2 * t, t, 0.16, PIL); box(cu, vb - t / 2, 0.11, ww + 2 * t + 0.08, t, 0.22, PIL);
    box(cu - ww / 2 - t / 2, vb + wh / 2, 0.08, t, wh, 0.16, PIL); box(cu + ww / 2 + t / 2, vb + wh / 2, 0.08, t, wh, 0.16, PIL);
    const ft = 0.045;
    box(cu, vb + wh - ft / 2, 0.035, ww, ft, 0.05, frameCol, M.metal); box(cu, vb + ft / 2, 0.035, ww, ft, 0.05, frameCol, M.metal);
    box(cu - ww / 2 + ft / 2, vb + wh / 2, 0.035, ft, wh, 0.05, frameCol, M.metal); box(cu + ww / 2 - ft / 2, vb + wh / 2, 0.035, ft, wh, 0.05, frameCol, M.metal);
    box(cu, vb + wh / 2, 0.035, ft * 0.8, wh, 0.05, frameCol, M.metal);
    if (grille) {
      const nb = Math.round(ww / 0.17);
      for (let k = 1; k < nb; k++) box(cu - ww / 2 + k * ww / nb, vb + wh / 2, 0.15, 0.018, wh - 0.02, 0.018, GRILLE, M.metal);
      box(cu, vb + wh * 0.33, 0.16, ww, 0.02, 0.02, GRILLE, M.metal); box(cu, vb + wh * 0.66, 0.16, ww, 0.02, 0.02, GRILLE, M.metal);
    }
    box(cu, vb + wh + t + 0.13, 0.13, ww + 2 * t, 0.26, 0.26, '#e9e1d0');
  };
  for (let fl = 0; fl < F; fl++) for (let i = 0; i < bays; i++) {
    const cu = (i + 0.5) * W, v0 = fl * H;
    if (f.skip && f.skip(fl, i)) continue;
    if (fl === 0 && F > 1) {
      const col = PANELS[Math.floor(R() * PANELS.length)];
      if ((f.doors ?? []).includes(i)) {
        box(cu, 1.15, 0.05, 1.1, 2.3, 0.07, col, M.wood);
        box(cu + 0.4, 1.05, 0.11, 0.12, 0.03, 0.05, '#c9c3b5', M.metal);
        box(cu, 2.36, 0.07, 1.3, 0.12, 0.12, TRIM, M.metal); box(cu - 0.62, 1.15, 0.07, 0.1, 2.3, 0.12, TRIM, M.metal); box(cu + 0.62, 1.15, 0.07, 0.1, 2.3, 0.12, TRIM, M.metal);
        windowAt(cu, 2.55, 1.1, 0.45, FRAME, false);
      } else {
        const ww = W * 0.66;
        box(cu, 0.78, 0.05, ww, 0.9, 0.08, col, M.metal);
        windowAt(cu, 1.35, ww, 1.25, TRIM);
      }
    } else {
      const ww = W * 0.62, wh = 1.45;
      windowAt(cu, v0 + 0.95, ww, wh, FRAME);
      if (R() < 0.3) {
        const au = cu + (R() < 0.5 ? -1 : 1) * ww * 0.22;
        box(au, v0 + 0.55, 0.3, 0.82, 0.52, 0.3, '#ecebe5', M.metal);
        b.cyl(0.17, 0.17, 0.02, P(au + 0.12, v0 + 0.55, 0.46), '#6a6d70', M.metal, discRot, 16);
      }
    }
  }
  for (const i of f.pipes ?? []) b.cyl(0.05, 0.05, Ht, P(i * W + 0.28, Ht / 2, 0.32), '#b8b2a6', M.metal, [0, 0, 0], 8);
}

export function buildYard(b) {
  // paving: one big plane with the brick pattern in the shader
  const ground = new THREE.PlaneGeometry(24, 24, 1, 1).rotateX(-Math.PI / 2);
  b.add(ground, '#b8988a', M.brick, new THREE.Matrix4().makeTranslation(0, G, -2));

  // the four buildings around the courtyard
  facade(b, { o: [-10.5, -12.5], u: [1, 0], n: [0, 1], len: 21, floors: 3, seed: 11, doors: [2, 5], pipes: [1, 6] });
  facade(b, { o: [-10.5, 8.5], u: [0, -1], n: [1, 0], len: 21, floors: 3, seed: 23, doors: [3], pipes: [4], wall: WALL2 });
  facade(b, { o: [10.5, -12.5], u: [0, 1], n: [-1, 0], len: 9.5, floors: 3, seed: 37, doors: [1] });
  facade(b, { o: [10.5, 3.5], u: [0, 1], n: [-1, 0], len: 5, floors: 3, seed: 41 });
  facade(b, { o: [10.5, 8.5], u: [-1, 0], n: [0, -1], len: 21, floors: 2, seed: 53, doors: [1, 4], wall: WALL2 });

  // covered walkway in front of the south building (behind the viewer)
  for (let x = -9; x <= 9; x += 3) b.rbox([0.3, 3.0, 0.3], [x, G + 1.5, 6.6], PIL, M.plaster, [0, 0, 0], 0.03);
  b.box([21, 0.22, 2.4], [0, G + 3.1, 7.4], SLAB, M.plaster);

  // the gate in the east gap: a green steel fence, and the street beyond it
  for (let z = -2.9; z <= 3.4; z += 0.14) b.box([0.03, 2.0, 0.03], [10.45, G + 1.0, z], '#3f6b4f', M.metal);
  b.box([0.06, 0.06, 6.4], [10.45, G + 1.95, 0.25], '#3f6b4f', M.metal); b.box([0.06, 0.06, 6.4], [10.45, G + 0.25, 0.25], '#3f6b4f', M.metal);
  b.add(new THREE.PlaneGeometry(14, 20).rotateX(-Math.PI / 2), '#8f8b86', M.plain, new THREE.Matrix4().makeTranslation(17.5, G - 0.02, 0));
  // a far apartment block across the street (seen through the gate and above the roofs)
  b.box([8, 16, 12], [27, G + 8, -2], '#d9cbb3', M.plaster);
  for (let fl = 0; fl < 5; fl++) for (let k = 0; k < 4; k++) b.box([0.05, 1.3, 1.6], [22.97, G + 1.6 + fl * 3.1, -6.5 + k * 3], GLASS, M.glass);
}
