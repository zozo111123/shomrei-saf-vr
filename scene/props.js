// props.js - furniture and small things that make the courtyard a school: the picnic table she sits on,
// the bench under the viewer, the row of painted school chairs, slatted benches, a notice board, hopscotch.
import * as THREE from 'three';
import { M } from './mat.js';
import { G } from './yard.js';

export const TABLE = { x: 0.05, z: -2.15 };
export const SEAT = [0.0, G + 0.78, -1.80];      // where she sits: the near edge of the table top

const BLUE = '#3d80c2', YELLOW = '#e3ad45', STEEL = '#4b4f55';

// a local frame: x, z position on the ground, facing angle a (0 = faces +z)
const frame = (x, z, a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return (lx, ly, lz) => [x + c * lx + s * lz, G + ly, z - s * lx + c * lz];
};

function picnicTable(b) {
  const { x, z } = TABLE;
  for (let i = 0; i < 5; i++) b.rbox([1.9, 0.04, 0.138], [x, G + 0.76, z + (i - 2) * 0.152], BLUE, M.wood, [0, 0, 0], 0.012);
  const benchZ = [z + 0.85, z - 0.85];           // near bench (her feet) and far bench
  benchZ.forEach((bz, k) => {
    for (let i = 0; i < 2; i++) b.rbox([1.9, 0.04, 0.14], [x, G + 0.45, bz + (i - 0.5) * 0.152], k === 0 ? YELLOW : BLUE, M.wood, [0, 0, 0], 0.012);
  });
  for (const ex of [-0.78, 0.78]) {
    b.box([0.06, 0.06, 0.74], [x + ex, G + 0.71, z], STEEL, M.metal);
    b.box([0.06, 0.05, 2.0], [x + ex, G + 0.405, z], STEEL, M.metal);
    for (const s of [-1, 1]) b.rod([x + ex, G + 0.72, z + s * 0.18], [x + ex, G + 0.0, z + s * 0.62], 0.028, STEEL, M.metal);
  }
}

function viewerBench(b) {
  for (let i = 0; i < 3; i++) b.rbox([1.7, 0.04, 0.12], [0, G + 0.45, 0.32 + (i - 1) * 0.135], '#8a7b67', M.wood, [0, 0, 0], 0.01);
  for (const ex of [-0.7, 0.7]) { b.box([0.05, 0.43, 0.05], [ex, G + 0.215, 0.18], STEEL, M.metal); b.box([0.05, 0.43, 0.05], [ex, G + 0.215, 0.46], STEEL, M.metal); }
}

function schoolChair(b, x, z, a, col) {
  const T = frame(x, z, a);
  b.rbox([0.42, 0.025, 0.38], T(0, 0.44, 0), col, M.metal, [0, a, 0], 0.01);
  b.rbox([0.42, 0.22, 0.025], T(0, 0.72, -0.2), col, M.metal, [-0.12, a, 0], 0.01);
  for (const sx of [-0.19, 0.19]) {
    b.rod(T(sx, 0.43, 0.16), T(sx * 1.05, 0, 0.19), 0.011, col);
    b.rod(T(sx, 0.43, -0.17), T(sx * 1.05, 0, -0.2), 0.011, col);
    b.rod(T(sx, 0.43, -0.18), T(sx, 0.84, -0.22), 0.011, col);
  }
}

function slatBench(b, x, z, a, len, col) {
  const T = frame(x, z, a);
  for (let i = 0; i < 3; i++) b.rbox([len, 0.035, 0.12], T(0, 0.45, -0.14 + i * 0.14), col, M.wood, [0, a, 0], 0.01);
  for (let i = 0; i < 2; i++) b.rbox([len, 0.11, 0.03], T(0, 0.62 + i * 0.15, -0.25), col, M.wood, [-0.15, a, 0], 0.01);
  for (const sx of [-len / 2 + 0.12, len / 2 - 0.12]) {
    b.rod(T(sx, 0.44, 0.15), T(sx, 0, 0.18), 0.02, STEEL);
    b.rod(T(sx, 0.44, -0.22), T(sx, 0, -0.24), 0.02, STEEL);
    b.rod(T(sx, 0.44, -0.24), T(sx, 0.85, -0.3), 0.02, STEEL);
  }
}

export function buildProps(b) {
  picnicTable(b);
  viewerBench(b);
  // her things on the table: a backpack, a closed lunch box nobody opened, a phone face down
  const ty = G + 0.78;
  b.rbox([0.30, 0.38, 0.17], [-0.52, ty + 0.17, -2.0], '#2f3b5a', M.fabric, [0.25, 0.4, 1.35], 0.06);
  b.rbox([0.2, 0.12, 0.03], [-0.47, ty + 0.27, -1.93], '#26304a', M.fabric, [0.25, 0.4, 1.35], 0.012);
  b.rbox([0.2, 0.07, 0.14], [0.46, ty + 0.035, -1.98], '#4aa59a', M.plain, [0, -0.3, 0], 0.025);
  b.rbox([0.206, 0.012, 0.146], [0.46, ty + 0.072, -1.98], '#3d8c83', M.plain, [0, -0.3, 0], 0.01);
  b.rbox([0.075, 0.009, 0.155], [0.27, ty + 0.0045, -2.06], '#1d1e22', M.metal, [0, 0.5, 0], 0.008);

  // painted school chairs along the west wall, facing the yard
  ['#c8443a', '#4c9a4a', '#e07a3a', '#c8443a', '#3f6fb5', '#4c9a4a', '#e0b23a'].forEach((c, i) => schoolChair(b, -9.7, -8.2 + i * 0.62, Math.PI / 2, c));
  // benches along the back wall and the east wall
  slatBench(b, -2.6, -11.75, 0, 1.9, '#7d8b8d');
  slatBench(b, 3.2, -11.75, 0, 1.9, '#7d8b8d');
  slatBench(b, 9.75, -6.5, -Math.PI / 2, 1.8, '#a26a4a');
  // a green box seat (as in the original yard) and a pallet chair
  b.rbox([1.0, 0.45, 0.6], [-8.9, G + 0.225, -10.6], '#4f8e4a', M.wood, [0, 0, 0], 0.02);
  b.rbox([1.02, 0.04, 0.62], [-8.9, G + 0.47, -10.6], '#9aa0a0', M.wood, [0, 0, 0], 0.01);
  for (let i = 0; i < 4; i++) b.rbox([0.9, 0.025, 0.1], [-6.4, G + 0.4, -11.4 + i * 0.13], '#cdb791', M.wood, [0, 0.1, 0], 0.005);
  b.rbox([0.9, 0.4, 0.06], [-6.4, G + 0.62, -11.55], '#cdb791', M.wood, [-0.25, 0.1, 0], 0.01);
  // bin, drinking fountain, concrete planters along the east wall
  b.cyl(0.27, 0.24, 0.8, [6.4, G + 0.4, -11.9], '#3f5d45', M.metal, [0, 0, 0], 18);
  b.rbox([0.6, 0.9, 0.35], [-4.2, G + 0.45, -12.15], '#b9b6af', M.metal, [0, 0, 0], 0.03);
  for (const pz of [-10.2, -7.8, -4.4]) b.rbox([0.7, 0.55, 1.3], [9.9, G + 0.275, pz], '#a9a39a', M.plaster, [0, 0, 0], 0.03);
  // notice board on the west wall with pinned papers
  b.rbox([0.06, 1.0, 1.8], [-10.15, G + 1.65, -3.2], '#b08a5a', M.wood, [0, 0, 0], 0.01);
  const PAP = ['#f4efe0', '#f0d9a0', '#cfe3f0', '#f3c6c0', '#f4efe0', '#d9ecc9'];
  for (let i = 0; i < 6; i++) b.box([0.01, 0.3, 0.24], [-10.11, G + 1.45 + (i % 2) * 0.4, -3.85 + Math.floor(i / 2) * 0.62 + (i % 2) * 0.07], PAP[i], M.plain, [0, 0, (i - 2.5) * 0.03]);
  // hopscotch painted on the paving
  const hop = [[0, 0], [0, 1], [-0.5, 2], [0.5, 2], [0, 3], [-0.5, 4], [0.5, 4], [0, 5]];
  for (const [hx, hz] of hop) {
    const cx = 5.2 + hx * 1.05, cz = -3.2 - hz * 0.55, s = 0.5;
    b.box([s, 0.004, 0.035], [cx, G + 0.002, cz - s / 2], '#f2eee4', M.plain); b.box([s, 0.004, 0.035], [cx, G + 0.002, cz + s / 2], '#f2eee4', M.plain);
    b.box([0.035, 0.004, s], [cx - s / 2, G + 0.002, cz], '#f2eee4', M.plain); b.box([0.035, 0.004, s], [cx + s / 2, G + 0.002, cz], '#f2eee4', M.plain);
  }
  // the tree pit: a raised concrete ring with dark soil
  b.cyl(1.1, 1.1, 0.06, [4.6, G + 0.03, 3.4], '#5a4433', M.plain, [0, 0, 0], 40);
  b.add(new THREE.TorusGeometry(1.14, 0.08, 8, 48).rotateX(Math.PI / 2), '#b3aca0', M.plaster, new THREE.Matrix4().makeTranslation(4.6, G + 0.08, 3.4));
}
