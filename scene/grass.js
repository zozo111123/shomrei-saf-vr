// grass.js - the meadow: tens of thousands of instanced grass blades and wildflowers (poppies, daisies,
// lavender, dandelion clocks). Every blade bends in gusts that roll across the hill (vertex shader, mat.js GRASS).
// zone(x, z) from the caller returns a height multiplier: 0 = nothing grows here, < 1 = trodden / kept low.
import * as THREE from 'three';
import { M, makeMat } from './mat.js';
import { heightAt, fbm2, vnoise } from './terrain.js';

function rngf(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// one blade: y in [0, 1] along its length (the wind shader reads it), width 1, curling back a little
function bladeGeometry(segs) {
  const pos = [], idx = [];
  for (let i = 0; i < segs; i++) {
    const t = i / segs, w = 0.5 * (1 - Math.pow(t, 1.35)), z = -0.3 * t * t;
    pos.push(-w, t, z, w, t, z);
  }
  pos.push(0, 1, -0.3);
  for (let i = 0; i < segs - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const a = (segs - 1) * 2; idx.push(a, a + 1, segs * 2);
  const n = pos.length / 3, nor = [];
  for (let i = 0; i < n; i++) nor.push(0, 0.78, 0.62);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(1), 3));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(new Array(n).fill(M.grass), 1));
  g.setIndex(idx);
  return g;
}

const GREENS = ['#4a6622', '#567226', '#637d2c', '#4f6a2a', '#6e8434'];
const GOLDS = ['#9a8a3c', '#ae9446', '#c0a352', '#8d8a3c', '#b8994a', '#cdb064'];

export function buildGrass(group, P) {
  const film = P.quality === 'film';
  const turf = !!P.turf;   // turf: a carpet of short blades on the stage between the viewer and the spot
  const N = P.count ?? (turf ? (film ? 30000 : 7000) : (film ? 190000 : 27000)), RMAX = film ? 44 : 21, segs = turf ? 2 : (film ? 5 : 3);
  const R = rngf(31337), rnd = (a, c) => a + (c - a) * R();
  const mat = makeMat({ grass: true, side: THREE.DoubleSide, roughness: 0.7, ids: [16] });
  const items = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), c2 = new THREE.Color();
  const K = Math.log(1 + (RMAX / 6) ** 2);
  let n = 0, guard = 0;
  while (n < N && guard++ < N * 6) {
    let x, z, r;
    if (turf) {
      if (R() < 0.7) { x = rnd(-1.8, 2.5); z = rnd(-3.1, 3.9); } else { const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * 3.2; x = Math.cos(a) * rr; z = Math.sin(a) * rr; }
      r = Math.hypot(x, z);
    } else {
      r = 6 * Math.sqrt(Math.exp(R() * K) - 1); const a = R() * Math.PI * 2;
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    }
    const zk = P.zone(x, z);
    if (zk <= 0) continue;
    const patch = fbm2(x * 0.13 + 3, z * 0.13 - 1);
    const H = turf ? rnd(0.05, 0.15) * (zk < 0.2 ? 0.8 : 1) : (0.4 + 0.65 * sstep(0.3, 0.7, patch)) * zk * (1 + Math.max(0, r - 9) / 20) * rnd(0.72, 1.18);
    const W = turf ? rnd(0.01, 0.018) : (0.011 + 0.016 * R()) * (1 + r / 14) * (zk < 0.5 ? 0.85 : 1);
    e.set(rnd(-0.22, 0.22), R() * Math.PI * 2, rnd(-0.22, 0.22), 'YXZ'); q.setFromEuler(e);
    m.compose(p.set(x, heightAt(x, z) - 0.02, z), q, s.set(W, H, H));
    const mm = m.clone();
    const dry = (sstep(0.32, 0.7, fbm2(x * 0.05 + 11, z * 0.05 - 4)) * 0.8 + rnd(-0.25, 0.25)) * (turf ? 0.55 : 1);
    c.set(GREENS[Math.floor(R() * GREENS.length)]); c2.set(GOLDS[Math.floor(R() * GOLDS.length)]);
    c.lerp(c2, THREE.MathUtils.clamp(dry, 0, 1));
    items.push({ m: mm, c: c.clone().multiplyScalar(rnd(0.85, 1.1)), far: r > 7 });
    n++;
  }
  let tris = 0;
  for (const far of [false, true]) {
    const list = items.filter(it => it.far === far), sg = turf ? segs : Math.max(2, segs - (far ? 1 : 0));
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(bladeGeometry(sg), mat, list.length);
    list.forEach((it, i) => { mesh.setMatrixAt(i, it.m); mesh.setColorAt(i, it.c); });
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false; mesh.receiveShadow = true;
    group.add(mesh); tris += list.length * (sg * 2 - 1);
  }
  return { blades: n, tris };
}

// ---------- flowers: stem height 1 (scaled per instance), heads in vertex colours ----------
function flowerGeometry(kind, film) {
  const pos = [], col = [], mat = [];
  const tri = (a, b, c, color, id) => { pos.push(...a, ...b, ...c); const k = new THREE.Color(color); for (let i = 0; i < 3; i++) { col.push(k.r, k.g, k.b); mat.push(id); } };
  const stemTop = kind === 'lavender' ? 0.66 : kind === 'oat' ? 1.0 : 0.94;
  const sw = kind === 'oat' ? 0.007 : 0.012;
  const stemCol = kind === 'oat' ? '#a8975a' : '#4b6526';
  const sz = t => -0.05 * t * t;
  for (let i = 0; i < 2; i++) {                       // the stem as a thin strip
    const t0 = i / 2 * stemTop, t1 = (i + 1) / 2 * stemTop;
    tri([-sw, t0, sz(t0)], [sw, t0, sz(t0)], [sw * 0.7, t1, sz(t1)], stemCol, M.grass);
    tri([-sw, t0, sz(t0)], [sw * 0.7, t1, sz(t1)], [-sw * 0.7, t1, sz(t1)], stemCol, M.grass);
  }
  const C = [0, 0.95, sz(0.95)];
  if (kind === 'poppy') {
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 2 + 0.4, d = [Math.cos(a), 0, Math.sin(a)], sd = [-d[2], 0, d[0]];
      const P0 = [C[0] + sd[0] * 0.012, C[1], C[2] + sd[2] * 0.012], P1 = [C[0] - sd[0] * 0.012, C[1], C[2] - sd[2] * 0.012];
      const o = (r, w, up) => [C[0] + d[0] * r + sd[0] * w, C[1] + up, C[2] + d[2] * r + sd[2] * w];
      tri(P0, o(0.11, 0.05, 0.07), o(0.11, -0.05, 0.07), '#d6301e', M.flower);
      tri(P0, o(0.11, -0.05, 0.07), P1, '#c4281a', M.flower);
    }
    for (let k = 0; k < 5; k++) {
      const a0 = k / 5 * Math.PI * 2, a1 = (k + 1) / 5 * Math.PI * 2;
      tri([C[0], C[1] + 0.035, C[2]], [C[0] + Math.cos(a0) * 0.024, C[1] + 0.012, C[2] + Math.sin(a0) * 0.024], [C[0] + Math.cos(a1) * 0.024, C[1] + 0.012, C[2] + Math.sin(a1) * 0.024], '#1c1610', M.plain);
    }
  } else if (kind === 'daisy') {
    const np = film ? 12 : 9;
    for (let k = 0; k < np; k++) {
      const a = k / np * Math.PI * 2, d = [Math.cos(a), 0, Math.sin(a)], sd = [-d[2], 0, d[0]];
      tri([C[0] + d[0] * 0.012 + sd[0] * 0.008, C[1], C[2] + d[2] * 0.012 + sd[2] * 0.008], [C[0] + d[0] * 0.075, C[1] + 0.012, C[2] + d[2] * 0.075],
        [C[0] + d[0] * 0.012 - sd[0] * 0.008, C[1], C[2] + d[2] * 0.012 - sd[2] * 0.008], '#f3efe4', M.flower);
    }
    const nc = film ? 6 : 4;
    for (let k = 0; k < nc; k++) {
      const a0 = k / nc * Math.PI * 2, a1 = (k + 1) / nc * Math.PI * 2;
      tri([C[0], C[1] + 0.012, C[2]], [C[0] + Math.cos(a1) * 0.02, C[1] + 0.004, C[2] + Math.sin(a1) * 0.02], [C[0] + Math.cos(a0) * 0.02, C[1] + 0.004, C[2] + Math.sin(a0) * 0.02], '#e9b31d', M.flower);
    }
  } else if (kind === 'lavender') {
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * Math.PI, dx = Math.cos(a) * 0.035, dz = Math.sin(a) * 0.035, y0 = stemTop, y1 = 1.02, zc = sz(0.66);
      tri([-dx, y0, zc - dz], [dx, y0, zc + dz], [dx * 0.3, y1, zc + dz * 0.3], '#6f55ad', M.flower);
      tri([-dx, y0, zc - dz], [dx * 0.3, y1, zc + dz * 0.3], [-dx * 0.3, y1, zc - dz * 0.3], '#8a70c4', M.flower);
    }
  } else if (kind === 'oat') {               // wild oats: spikelets hanging from thin branches at the top
    const n = film ? 9 : 6;
    for (let k = 0; k < n; k++) {
      const y = 0.74 + k / n * 0.24, a = k * 2.4, d = [Math.cos(a), 0, Math.sin(a)];
      const at = [0, y, sz(y)], hang = [d[0] * 0.045, y - 0.075, sz(y) + d[2] * 0.045];
      tri([at[0] - 0.006, at[1], at[2]], [at[0] + 0.006, at[1], at[2]], hang, '#cfae5f', M.flower);
      tri([hang[0] - 0.008, hang[1] + 0.02, hang[2]], [hang[0] + 0.008, hang[1] + 0.02, hang[2]], [hang[0], hang[1] - 0.03, hang[2]], '#ddbd6c', M.flower);
    }
  } else if (kind === 'puff') {
    const ico = new THREE.IcosahedronGeometry(0.05, 0).toNonIndexed().attributes.position;
    for (let i = 0; i < ico.count; i += 3) tri(
      [ico.getX(i) + C[0], ico.getY(i) + C[1] + 0.03, ico.getZ(i) + C[2]], [ico.getX(i + 1) + C[0], ico.getY(i + 1) + C[1] + 0.03, ico.getZ(i + 1) + C[2]],
      [ico.getX(i + 2) + C[0], ico.getY(i + 2) + C[1] + 0.03, ico.getZ(i + 2) + C[2]], '#f1ede2', M.flower);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(mat, 1));
  g.computeVertexNormals();
  const nr = g.attributes.normal;   // soften: flowers are lit mostly from above, like the grass
  for (let i = 0; i < nr.count; i++) { const v = new THREE.Vector3(nr.getX(i), nr.getY(i), nr.getZ(i)); v.y = Math.abs(v.y) + 0.8; v.normalize(); nr.setXYZ(i, v.x, v.y, v.z); }
  return g;
}

export function buildFlowers(group, P) {
  const film = P.quality === 'film', f = film ? 4 : 1;
  const R = rngf(8080), rnd = (a, c) => a + (c - a) * R();
  const mat = makeMat({ grass: true, side: THREE.DoubleSide, roughness: 0.6, ids: [0, 16, 18] });
  const out = {};
  const plant = (kind, count, pick, stem) => {
    const mesh = new THREE.InstancedMesh(flowerGeometry(kind, film), mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    let n = 0, guard = 0;
    while (n < count && guard++ < count * 400) {
      const at = pick();
      if (!at) continue;
      const [x, z] = at, zk = P.zone(x, z);
      if (zk < 0.2) continue;
      const k = stem() * (zk < 0.5 ? 0.42 : 1);
      e.set(rnd(-0.18, 0.18), R() * 6.28, rnd(-0.18, 0.18), 'YXZ'); q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, heightAt(x, z) - 0.01, z), q, new THREE.Vector3(k, k, k));
      mesh.setMatrixAt(n, m); mesh.setColorAt(n, c.setScalar(rnd(0.85, 1.1)));
      n++;
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false; mesh.receiveShadow = true;
    group.add(mesh); out[kind] = n;
  };
  const disc = (r0, r1) => { const a = R() * Math.PI * 2, r = r0 + (r1 - r0) * Math.sqrt(R()); return [Math.cos(a) * r, Math.sin(a) * r]; };
  // poppies: a red drift in the meadow toward the sun, so they glow against the light
  // wild oats in the dry golden patches: tall, catching the backlight
  plant('oat', (film ? 5200 : 950), () => { const [x, z] = disc(3.0, film ? 38 : 21); const d = fbm2(x * 0.05 + 11, z * 0.05 - 4) + (x * 0.35 - z * 0.9) * 0.006; return d > 0.47 && P.zone(x, z) > 0.9 ? [x, z] : null; }, () => rnd(0.78, 1.12));
  plant('poppy', 520 * f, () => { const [x, z] = disc(2.5, film ? 34 : 22); const d = fbm2(x * 0.09 + 40, z * 0.09 - 7) + (x * 0.35 - z * 0.9) * 0.012; return d > 0.56 ? [x, z] : null; }, () => rnd(0.42, 0.68));
  plant('daisy', 480 * f, () => { const [x, z] = disc(0.8, film ? 34 : 20); return vnoise(x * 0.35 + 9, z * 0.35) > 0.45 ? [x, z] : null; }, () => rnd(0.22, 0.42));
  // lavender in clumps around the edges of the hilltop
  const clumps = [];
  for (let i = 0; i < (film ? 26 : 11); i++) { const [x, z] = disc(3.5, 14); if (Math.abs(x) > 1.8 || z < -3) clumps.push([x, z]); }
  plant('lavender', 300 * f, () => { const c = clumps[Math.floor(R() * clumps.length)]; if (!c) return null; return [c[0] + rnd(-0.45, 0.45), c[1] + rnd(-0.45, 0.45)]; }, () => rnd(0.45, 0.65));
  plant('puff', 140 * f, () => disc(1.5, film ? 26 : 16), () => rnd(0.32, 0.5));
  return out;
}
