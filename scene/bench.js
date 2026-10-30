// bench.js - the rustic plank bench she sits on, built to the measurements of the footage's bench
// (seat top 0.45 m, 1.41 m long, a deep apron, four square legs, one long stretcher at 0.19 m), so the cut-out
// person (whose own bench was removed from the matte) sits on a real 3D bench lit and shadowed by the world.
import * as THREE from 'three';
import { Builder } from './geo.js';
import { M, makeMat } from './mat.js';

/** frontZ: the bench's front plane (the footage's front legs); cx: centre x; gy: ground y under the bench */
export function buildBench({ cx, frontZ, gy, len = 1.41, depth = 0.27, seat = 0.45 }) {
  const b = new Builder();
  const WOOD = '#8c7a62', WOOD2 = '#9a8669', END = '#b19d80';   // sun-bleached, greyed old wood
  const T = (x, y, z) => [cx + x, gy + y, frontZ + z];
  // seat: two planks with a hairline gap, weathered, slightly uneven
  b.rbox([len, 0.045, depth * 0.52], T(0, seat - 0.0225, -depth * 0.26), WOOD2, M.oldwood, [0, 0, 0.002], 0.008);
  b.rbox([len - 0.01, 0.043, depth * 0.46], T(0.004, seat - 0.0235, -depth * 0.765), WOOD, M.oldwood, [0, 0, -0.002], 0.008);
  // aprons under the seat (front, back, ends)
  b.rbox([len - 0.18, 0.06, 0.03], T(0, seat - 0.075, -0.03), WOOD, M.oldwood, [0, 0, 0], 0.006);
  b.rbox([len - 0.18, 0.06, 0.03], T(0, seat - 0.075, -depth + 0.04), WOOD, M.oldwood, [0, 0, 0], 0.006);
  // four legs, square, inset from the ends, the front pair in the front plane
  const lx = len / 2 - 0.115;
  for (const sx of [-lx, lx]) for (const [sz, k] of [[-0.035, 0], [-depth + 0.045, 1]]) {
    b.rbox([0.066, seat - 0.045, 0.066], T(sx, (seat - 0.045) / 2, sz), k ? WOOD : WOOD2, M.oldwood, [0.01 * (k ? 1 : -1), 0, 0.012 * Math.sign(sx)], 0.007);
    b.rbox([0.069, 0.004, 0.069], T(sx, seat - 0.046, sz), END, M.oldwood);
  }
  // side rails between the leg pairs and the long front stretcher
  for (const sx of [-lx, lx]) b.rbox([0.034, 0.05, depth - 0.08], T(sx, 0.19, -depth / 2), WOOD, M.oldwood, [0, 0, 0], 0.005);
  b.rbox([2 * lx, 0.036, 0.034], T(0, 0.19, -0.04), WOOD2, M.oldwood, [0, 0, 0], 0.006);
  const mesh = new THREE.Mesh(b.merge(), makeMat({ roughness: 0.92 }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
