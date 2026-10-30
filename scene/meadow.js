// meadow.js - the golden-hour world, entirely in code: a hilltop meadow under an old Tabor oak, an empty
// weathered bench facing the viewer (where the person will sit), the viewer on a fallen log, grass and
// wildflowers in travelling gusts, a valley with a lake under the low sun, far hills in haze, pollen, storks.
// createMeadow(opts) has the same interface as the yard: { group, stats, sun, add, update(t, camera) }.
import * as THREE from 'three';
import { U, M, makeMat, makeSky } from './mat.js';
import { Builder, matrixOf } from './geo.js';
import { G, SUN, heightAt, pathDist, buildTerrain, buildLake, buildFarTrees, vnoise } from './terrain.js';
import { buildOak, gnarledTube } from './oak.js';
import { buildGrass, buildFlowers } from './grass.js';
import { buildPollen, buildBirds } from './fx.js';
import { buildGrove } from './grove.js';

export { G };
export const VIEWER = [0, 0, 0];                                   // the seated viewer's eyes; ground is G below
const BENCH = { x: 0, z: -1.62, len: 1.4, seat: 0.45 };
// where the person sits: the middle of the seat top, facing the viewer (+z). facing is a rotation about y.
export const PERSON_SPOT = { seat: [BENCH.x, heightAt(BENCH.x, BENCH.z) + BENCH.seat, BENCH.z], facing: 0 };
export const TREE_BASE = [-1.6, -5.1];

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// what grows where: 0 = nothing, <1 = kept low. The stage between the viewer and the bench stays low and clean.
export function zone(x, z) {
  const dt = Math.hypot(x - TREE_BASE[0], z - TREE_BASE[1]);
  if (dt < 1.25) return 0;
  const bx = Math.abs(x - BENCH.x), bz = z - BENCH.z;
  if (Math.abs(x) < 1.85 && z > 0.02 && z < 0.66) return 0;        // the log under the viewer
  const pd = pathDist(x, z);
  if (pd < 0.12) return 0;
  let k = 1;
  if (pd < 1.1) k = Math.min(k, 0.12 + 0.88 * sstep(0.12, 1.1, pd));
  if (bx < 1.05 && bz > -0.45 && bz < 0.4) k = Math.min(k, 0.14);  // where her bench stands (the video brings it)
  // the mown strip: from just behind the spot to 5 m toward the viewer, wide enough for the film camera's path;
  // grass there stays under 0.25 m, rising softly to full height over 0.7 m outside it
  const ox = Math.max(0, -1.1 - x, x - 1.8), oz = Math.max(0, BENCH.z - 0.4 - z, z - (BENCH.z + 5.0));
  const out = Math.hypot(ox, oz);
  if (out < 0.7) k = Math.min(k, 0.2 + 0.8 * sstep(0, 0.7, out));
  if (bx < 1.9 && z > -2.8 && z < 0.25) k = Math.min(k, 0.24 + 0.1 * sstep(1.3, 1.9, bx));   // the stage around the spot
  if (dt < 3.6) k = Math.min(k, 0.4 + 0.3 * sstep(1.25, 3.6, dt));                            // trodden, shaded
  return k;
}
// ground masks for the shader: [leaf litter + bare soil, worn path]
function masks(x, z) {
  const dt = Math.hypot(x - TREE_BASE[0], z - TREE_BASE[1]);
  const litter = Math.max(1 - sstep(1.2, 2.5, dt), 0) * 0.7 * (0.7 + 0.3 * vnoise(x * 2, z * 2));
  const bench = Math.abs(x - BENCH.x) < 1.05 && Math.abs(z - BENCH.z) < 0.5 ? 0.12 * (0.6 + 0.4 * vnoise(x * 4, z * 4)) : 0;
  const path = (1 - sstep(0.15, 0.5, pathDist(x, z))) * (0.55 + 0.3 * vnoise(x * 3 + 4, z * 3));
  return [Math.min(1, Math.max(litter, bench)), path];
}

function bench(b) {
  const { x, z, len, seat } = BENCH, gy = heightAt(x, z);
  const T = (lx, ly, lz) => [x + lx, gy + ly, z + lz];
  const WOOD = '#958671', IRON = '#2a2622';
  for (const [dz, k] of [[0.13, 0], [0.0, 1], [-0.13, 2]]) b.rbox([len, 0.034, 0.112], T(0, seat - 0.017, dz), WOOD, M.oldwood, [0, 0, (k - 1) * 0.004], 0.008);
  for (const [y, dz] of [[0.63, -0.235], [0.78, -0.265]]) b.rbox([len, 0.095, 0.03], T(0, y, dz), WOOD, M.oldwood, [-0.2, 0, 0], 0.008);
  for (const sx of [-len / 2 + 0.08, len / 2 - 0.08]) {
    b.rod(T(sx, seat - 0.03, 0.17), T(sx, -0.03, 0.2), 0.02, IRON);
    b.rod(T(sx, seat - 0.03, -0.18), T(sx, -0.03, -0.26), 0.02, IRON);
    b.rod(T(sx, seat - 0.03, -0.2), T(sx, 0.86, -0.3), 0.018, IRON);
    b.rod(T(sx, seat - 0.03, 0.17), T(sx, seat - 0.03, -0.2), 0.015, IRON);
    b.rod(T(sx, 0.63, -0.24), T(sx, 0.64, 0.19), 0.017, IRON);
    b.rod(T(sx, seat - 0.03, 0.18), T(sx, 0.64, 0.19), 0.016, IRON);
    b.rod(T(sx, 0.1, 0.19), T(sx, 0.1, -0.24), 0.012, IRON);
  }
}

function viewerLog(b) {
  const y0 = heightAt(-1.7, 0.36), y1 = heightAt(0, 0.32), y2 = heightAt(1.65, 0.27);
  gnarledTube(b, [new THREE.Vector3(-1.7, y0 + 0.24, 0.36), new THREE.Vector3(0, y1 + 0.26, 0.32), new THREE.Vector3(1.65, y2 + 0.22, 0.27)], 0.28, 0.24, '#6a5f50', M.bark, 18, 0.06, 4.2);
  gnarledTube(b, [new THREE.Vector3(0.6, y1 + 0.38, 0.33), new THREE.Vector3(0.7, y1 + 0.52, 0.42), new THREE.Vector3(0.76, y1 + 0.6, 0.5)], 0.06, 0.03, '#6a5f50', M.bark, 7, 0.05, 2);
  const capA = new THREE.CircleGeometry(0.28, 20), capB = new THREE.CircleGeometry(0.24, 20);
  b.add(capA, '#b39b7a', M.oldwood, matrixOf([-1.72, y0 + 0.24, 0.362], [0, -Math.PI / 2 - 0.02, 0]));
  b.add(capB, '#b39b7a', M.oldwood, matrixOf([1.67, y2 + 0.22, 0.27], [0, Math.PI / 2 + 0.02, 0]));
}

function stones(b) {
  const spots = [[3.6, -2.2, 0.45], [-3.4, -1.0, 0.3], [5.4, -7.8, 0.8], [-6.0, -3.6, 0.55], [2.2, -13.5, 1.1], [-9.5, -9.5, 0.9], [7.5, 2.5, 0.5], [-4.6, 3.6, 0.35], [10.5, -12, 1.4], [-12, -16, 1.6], [1.9, 3.8, 0.3], [-2.4, -8.6, 0.4]];
  const base = new THREE.IcosahedronGeometry(1, 2), p = base.attributes.position;
  spots.forEach(([x, z, s], i) => {
    const g = base.clone(), q = g.attributes.position;
    for (let k = 0; k < q.count; k++) {
      const vx = p.getX(k), vy = p.getY(k), vz = p.getZ(k);
      const f = 1 + 0.3 * (vnoise(vx * 1.6 + i * 3, vz * 1.6 + vy) - 0.5) + 0.1 * (vnoise(vx * 5 + i, vy * 5 - vz * 4) - 0.5);
      q.setXYZ(k, vx * f, vy * f * 0.58, vz * f * (0.8 + 0.2 * Math.sin(i)));
    }
    g.computeVertexNormals();
    b.add(g, i % 3 ? '#8e877b' : '#7d786c', M.rock, matrixOf([x, heightAt(x, z) + s * 0.12, z], [0.1 * Math.sin(i), i * 1.7, 0.08 * Math.cos(i)], [s, s, s]));
  });
}

export function createMeadow(opts = {}) {
  const quality = opts.quality === 'film' ? 'film' : 'vr';
  const film = quality === 'film';
  U.uSunDir.value.copy(SUN);
  U.uFogOn.value = 1; U.uFogDensity.value = 1 / 1100;
  U.uHazeSun.value.set('#f7b06a'); U.uHazeAway.value.set('#a3a6c2');
  U.uWindDir.value.set(-0.9, 0.45).normalize();
  U.uDappleStrength.value = 0.6;
  U.uValleyY.value = G - 26; U.uMist.value = 0.22;

  const group = new THREE.Group(); group.name = 'code-meadow';
  const updaters = [];
  const stats = { quality };

  group.add(makeSky({ golden: true }));
  const ground = buildTerrain(makeMat({ roughness: 0.95, aMat: M.ground }), masks, quality);
  group.add(ground);
  group.add(buildLake());
  group.add(buildFarTrees(null, quality));

  // bark, bench, log, stones: one shadow-casting mesh
  const b = new Builder();
  const foliage = new THREE.Group();
  const oak = buildOak(b, foliage, { base: TREE_BASE, ground: heightAt, quality, seed: 1948, clear: (x, z) => zone(x, z) < 0.3 && Math.abs(x) < 1.8 && z > -2.4 });
  if (opts.bench === true && !opts.noBench) bench(b);              // off by default: the person's footage brings its own bench
  if (opts.viewerLog !== false) viewerLog(b);                  // film.html passes viewerLog: false
  stones(b);
  const grove = buildGrove(b, { quality, sun2: new THREE.Vector2(SUN.x, SUN.z).normalize() });
  group.add(grove.mesh);
  const staticMesh = new THREE.Mesh(b.merge(), makeMat({ roughness: 0.9, ids: [5, 6, 11, 19, 21, 22, 23] }));
  staticMesh.castShadow = true; staticMesh.receiveShadow = true;
  group.add(staticMesh, foliage);

  const grass = buildGrass(group, { quality, zone });
  const turf = buildGrass(group, { quality, zone, turf: true });
  const flowers = buildFlowers(group, { quality, zone });
  const pollen = buildPollen(G, quality);
  group.add(pollen.object); updaters.push((t, cam) => pollen.update(t, cam, opts.viewHeight));
  const birds = buildBirds(G);
  group.add(birds.object); updaters.push(birds.update);

  // the low sun: warm orange, long shadows running toward the viewer
  const sun = new THREE.DirectionalLight(0xffb27a, 3.4);
  const target = new THREE.Object3D(); target.position.set(0, G, -3.5);
  sun.target = target;
  sun.position.copy(target.position).addScaledVector(SUN, 70);
  sun.castShadow = true;
  const ss = film ? 4096 : 2048, ext = film ? 26 : 20;
  sun.shadow.mapSize.set(ss, ss);
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 20, far: 130 });
  sun.shadow.bias = -0.00035; sun.shadow.normalBias = film ? 0.02 : 0.035; sun.shadow.radius = 4;
  group.add(sun, target);
  group.add(new THREE.HemisphereLight(0xa9b9dc, 0x6a5f34, 1.35));

  const tris = g => (g.index ? g.index.count : g.attributes.position.count) / 3;
  Object.assign(stats, {
    terrainTris: Math.round(tris(ground.geometry)), staticTris: Math.round(tris(staticMesh.geometry)),
    leaves: oak.leaves, cards: oak.cards, fallen: oak.fallen, groveTrees: grove.trees, groveCards: grove.cards, branchTips: oak.tips, blades: grass.blades, turf: turf.blades, flowers,
    canopy: oak.canopy, personSpot: PERSON_SPOT, sun: SUN.toArray().map(v => +v.toFixed(3)),
  });
  return {
    group, stats, sun, oak,
    add(obj, update) { group.add(obj); if (update) updaters.push(update); },
    update(t, camera) { U.uTime.value = t; for (const u of updaters) u(t, camera); },
  };
}
