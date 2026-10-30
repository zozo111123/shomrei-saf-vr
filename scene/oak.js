// oak.js - an old Tabor oak (the broad oak of Israel's golden hills), grown from rules: a short massive trunk
// with buttress roots, eight sinuous limbs that arch out low and wide, three or four generations of branches,
// and foliage in clumps (a dense core + leaves on its surface) so the canopy has real volume and real gaps.
import * as THREE from 'three';
import { M, makeMat, U } from './mat.js';
import { leafMatrix, instanced } from './tree.js';
import { vnoise } from './terrain.js';
import { leafCardTexture, cardGeometry } from './foliage.js';
import { tube, compose, surfaceNets } from './sdf.js';

const V3 = THREE.Vector3;
const BARK = '#8d7c66';

function rngf(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// a tube whose radius tapers and is modulated around and along it: bark ridges, burls, a living surface
export function gnarledTube(b, pts, r0, r1, color, aMat, radial, gnarl, seed, flare = 0) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const segs = Math.max(3, Math.round(curve.getLength() / (r0 > 0.25 ? 0.18 : 0.3)));
  const fr = curve.computeFrenetFrames(segs, false);
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, P = curve.getPointAt(u), N = fr.normals[i], B = fr.binormals[i];
    const r = THREE.MathUtils.lerp(r0, r1, Math.pow(u, 0.75)) * (1 + flare * Math.exp(-u * 14));
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const g = 1 + gnarl * (0.45 * Math.sin(a * 3 + seed) + 0.25 * Math.sin(a * 7 + seed * 2) + 0.6 * (vnoise(Math.cos(a) * 1.2 + seed, Math.sin(a) * 1.2 + u * 2.5) - 0.5));
      pos.push(P.x + (c * N.x + s * B.x) * r * g, P.y + (c * N.y + s * B.y) * r * g, P.z + (c * N.z + s * B.z) * r * g);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, c = a + radial + 1;
    idx.push(a, c, a + 1, a + 1, c, c + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  b.add(geo, color, aMat);
  return curve;
}

// an oak leaf for clumps: 5 points, folded on the midrib (4 triangles) or 8 points (film)
function oakLeaf(film) {
  const L = 0.16, W = 0.075;
  const v = film
    ? [[0, 0, 0], [-W * 0.4, L * 0.28, -0.004], [0, L * 0.3, 0.007], [W * 0.4, L * 0.28, -0.004], [-W * 0.5, L * 0.62, -0.006], [0, L * 0.62, 0.006], [W * 0.5, L * 0.62, -0.006], [0, L, -0.012]]
    : [[0, 0, 0], [-W * 0.5, L * 0.45, -0.005], [0, L * 0.5, 0.008], [W * 0.5, L * 0.45, -0.005], [0, L, -0.01]];
  const f = film ? [0, 2, 1, 0, 3, 2, 1, 2, 5, 1, 5, 4, 2, 3, 6, 2, 6, 5, 4, 5, 7, 5, 6, 7] : [0, 2, 1, 0, 3, 2, 1, 2, 4, 2, 3, 4];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v.flat(), 3));
  g.setIndex(f); g.computeVertexNormals();
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(v.length * 3).fill(1), 3));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(new Array(v.length).fill(M.leaf), 1));
  return g;
}

// the dense heart of a clump: a lumpy squashed ball
function coreGeometry(detail) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.28 * (vnoise(x * 2.1 + 5, z * 2.1 + y * 1.7) - 0.5) + 0.12 * (vnoise(x * 5 + 1, y * 5 - z * 3) - 0.5);
    p.setXYZ(i, x * k, y * k * 0.72, z * k);
  }
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(p.count * 3).fill(1), 3));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(new Array(p.count).fill(M.core), 1));
  return g;
}

const GREENS = ['#34492a', '#3e532c', '#4a5e30', '#566a34', '#62733a', '#6f7d40', '#7c8646'];
const CORES = ['#1d2d17', '#22341a', '#283b1d', '#2e4220'];
const DRY = ['#8a6c38', '#a3823f', '#76633a', '#5f6431', '#9a7a3c', '#7e5f33', '#b39456'];

/**
 * P: { base: [x, z], ground: (x, z) => y, quality: 'vr' | 'film', seed, clear: (x, z) => bool (no fallen leaves) }
 * Adds bark to builder b, foliage to `group`. Returns { leaves, cores, limbs (curves), canopy {c, r} }.
 */
export function buildOak(b, group, P) {
  const film = P.quality === 'film';
  const R = rngf(P.seed ?? 2026), rnd = (a, c) => a + (c - a) * R();
  const [bx, bz] = P.base, gy = P.ground(bx, bz), B = new V3(bx, gy, bz);
  const at = (x, y, z) => new V3(x, y, z).add(B);
  // trunk: short, massive, a slight twist and lean
  const trunk = [at(0, -0.5, 0), at(0.06, 0.7, 0.04), at(-0.08, 1.55, 0.12), at(0.06, 2.35, 0.06), at(0.02, 2.85, -0.04), at(-0.04, 3.15, 0.02)];
  // the skeleton (trunk, roots, limbs, branches) is identical in 'vr' and 'film' quality: same random sequence,
  // same depths. Film only adds foliage (more cards, individual leaves), drawn from a second random stream.
  // The junction zone - trunk, root flares and the first metre and a half of every limb - is ONE sculpted surface
  // (signed distance functions blended smoothly, meshed by surface nets), so limbs swell out of the trunk like a
  // real oak instead of tubes poking through each other. Beyond it each limb continues as its own tube.
  const trunkCurve = new THREE.CatmullRomCurve3(trunk, false, 'centripetal');
  const A = v => [v.x, v.y, v.z];
  const BARKM = { color: BARK, id: M.bark };
  const trunkTube = tube(trunk.map(A), [0.98, 0.86, 0.76, 0.68, 0.6, 0.5]);
  // vertical oak furrows: a ridge displacement around the trunk axis, strongest low down, fading into the limbs
  const furrow = p => {
    const a = Math.atan2(p[2] - bz, p[0] - bx), h = p[1] - gy;
    const w = 0.5 + 0.5 * Math.sin(a * 11 + 1.6 * vnoise(h * 0.7 + 3, a * 1.3) + h * 0.15);
    return 0.045 * Math.pow(w, 3) * Math.max(0, 1 - Math.max(0, h - 2.2) / 0.8);
  };
  const trunkF = p => trunkTube(p) + furrow(p); trunkF.bs = trunkTube.bs;
  const sdfParts = [{ d: trunkF, mat: BARKM, k: 0 }];
  const sdfPts = [...trunk];
  // buttress roots sliding into the ground
  for (let k = 0; k < 9; k++) {
    const a = k / 9 * Math.PI * 2 + rnd(-0.25, 0.25), d = new V3(Math.cos(a), 0, Math.sin(a)), L = rnd(1.6, 2.6);
    const p1 = B.clone().addScaledVector(d, 0.6), p2 = B.clone().addScaledVector(d, L * 0.55), p3 = B.clone().addScaledVector(d, L);
    p1.y = gy + 0.32; p2.y = P.ground(p2.x, p2.z) + 0.08; p3.y = P.ground(p3.x, p3.z) - 0.12;
    const rp = [at(0, 0.62, 0).addScaledVector(d, 0.3), p1, p2, p3];
    sdfParts.push({ d: tube(rp.map(A), [0.38, 0.27, 0.14, 0.05]), mat: BARKM, k: 0.32 }); sdfPts.push(...rp);
  }
  const tips = [];
  const grow = (p, dir, len, r, depth) => {
    const n = depth >= 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const out = new V3(p.x - bx, 0, p.z - bz).normalize();
      const rand = new V3(rnd(-1, 1), rnd(-0.5, 1), rnd(-1, 1)).normalize();
      const d = dir.clone().multiplyScalar(0.62).addScaledVector(rand, 0.78).addScaledVector(out, 0.42);
      d.y += depth === 0 ? 0.08 : 0.2; d.normalize();
      const L = len * rnd(0.72, 1.15);
      const mid = p.clone().addScaledVector(d, L * 0.5).add(new V3(rnd(-0.12, 0.12) * L, 0.1 * L, rnd(-0.12, 0.12) * L));
      const end = p.clone().addScaledVector(d, L);
      gnarledTube(b, [p.clone(), mid, end], r, r * 0.6, BARK, M.bark, depth > 1 ? 7 : depth === 1 ? 5 : 4, 0.04, i + depth);
      if (depth === 1) tips.push({ p: mid, d });
      if (depth > 0) grow(end, d, len * 0.7, r * 0.6, depth - 1); else tips.push({ p: end, d });
    }
  };
  // eight limbs, as [x, height above the ground there, z] in the world
  const LIMBS = P.limbs ?? [[3.6, 5.3, 0.6], [-4.6, 5.1, 1.4], [7.6, 5.7, -4.2], [-8.6, 5.5, -4.6], [-6.4, 6.5, -11.2], [4.6, 6.7, -10.6], [-1.2, 8.6, -5.8], [-1.6, 6.3, -12.2]];
  const limbs = [], limbInfo = [];
  LIMBS.forEach(([tx, th, tz], i) => {
    const end = new V3(tx, P.ground(tx, tz) + th, tz);
    // each limb leaves the trunk on the side that faces where it is going (limbs never cross the trunk's face)
    // limbs that reach toward the viewer leave from the top of the trunk (never across its face); back and side
    // limbs leave lower, as an old oak's great low limbs do
    const tdx = tx - bx, tdz = tz - bz, front = tdz / Math.max(1e-3, Math.hypot(tdx, tdz));
    const axis = trunkCurve.getPointAt(THREE.MathUtils.clamp(0.46 + 0.5 * THREE.MathUtils.smoothstep(front, -0.5, 0.6) + rnd(-0.04, 0.04), 0.4, 0.97));
    const hdir = new V3(end.x - axis.x, 0, end.z - axis.z).normalize();
    const from = axis.clone().addScaledVector(hdir, 0.26);
    const dir = end.clone().sub(from), side = new V3(-dir.z, 0, dir.x).normalize();
    const start = from.clone().addScaledVector(hdir, 0.35).add(new V3(0, 0.3, 0));
    // a sinuous path: it rises steeply out of the trunk, then snakes outward and settles, never straight
    const w = [rnd(-1, 1), rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)];
    const ctrl = [0.18, 0.4, 0.62, 0.82].map((f, j) => from.clone().lerp(end, f)
      .add(new V3(0, (1 - Math.abs(f - 0.35) * 1.6) * rnd(0.6, 1.3), 0)).addScaledVector(side, w[j] * Math.max(0, f - 0.15) * 1.1));
    const r0 = rnd(0.24, 0.32), r1 = rnd(0.1, 0.14);
    const lc = new THREE.CatmullRomCurve3([axis.clone().add(new V3(0, -0.3, 0)), from, from.clone().lerp(ctrl[1], 0.35).add(new V3(0, 0.15, 0)), ...ctrl.slice(1), end], false, 'centripetal');
    const radAt = u => THREE.MathUtils.lerp(r0, r1, Math.pow(u, 0.75));
    let u0 = 0, u1 = 0;
    for (let u = 0; u <= 1; u += 0.005) { const dd = lc.getPointAt(u).distanceTo(axis); if (!u0 && dd > 2.0) u0 = u; if (dd > 2.45) { u1 = u; break; } }
    const basePts = [], baseR = [];
    for (let u = 0; u <= u1 + 1e-6; u += Math.max(0.01, u1 / 14)) { basePts.push(A(lc.getPointAt(u))); baseR.push(radAt(u) * (u <= u0 ? 1.08 + 0.16 * (1 - u / Math.max(u0, 1e-3)) : THREE.MathUtils.lerp(1.08, 0.7, (u - u0) / Math.max(u1 - u0, 1e-3)))); }
    // the limb starts inside the trunk and widens into a collar where it leaves it
    const us = 0;
    // the whole limb is sculpted together with the trunk: it swells smoothly out of it, radius matching all along
    const nL = Math.max(12, Math.round(lc.getLength() / 0.35));
    const lp = [], lr = [];
    for (let j = 0; j <= nL; j++) { const u = j / nL; lp.push(A(lc.getPointAt(u))); lr.push(radAt(u)); }
    sdfParts.push({ d: tube(lp, lr), mat: BARKM, k: 0.16 }); sdfPts.push(...lp.map(q => new V3(...q)));
    limbs.push(lc); limbInfo.push({ axis: A(axis), u0, u1, us, r0, rAtU0: radAt(us), baseR0: baseR[0], baseRmax: Math.max(...baseR), baseEnd: basePts[basePts.length - 1], tubeStart: A(lc.getPointAt(us)), len: lc.getLength() });
    const [q1, q2, q3] = [ctrl[1], ctrl[2], ctrl[3]];
    grow(end, end.clone().sub(q3).normalize(), 2.1, r1, 3);
    grow(q2, end.clone().sub(q1).normalize().add(side.clone().multiplyScalar(rnd(-0.6, 0.6))).normalize(), 1.6, r1 * 0.9, 2);
    grow(q1, end.clone().sub(from).normalize().add(side.clone().multiplyScalar(rnd(-0.8, 0.8))).add(new V3(0, 0.5, 0)).normalize(), 1.3, r1 * 0.8, 1);
  });

  {
    const lo = new V3(Infinity, Infinity, Infinity), hi = new V3(-Infinity, -Infinity, -Infinity);
    for (const q of sdfPts) { lo.min(q); hi.max(q); }
    const m = 1.3;
    const geo = surfaceNets(compose(sdfParts), [lo.x - m, Math.max(lo.y - m, gy - 0.6), lo.z - m, hi.x + m, hi.y + m, hi.z + m], film ? 0.04 : 0.085);
    b.add(geo, BARK, M.bark);
  }

  // foliage: leaf cards painted in code around every branch tip (dense, with real holes that cut real dapples);
  // film quality adds individual 3D leaves on the outer skin of each clump
  const R2 = rngf(4049), frnd = (a, c) => a + (c - a) * R2();
  const size = film ? 1024 : 512;
  const tex = [leafCardTexture(size, 7), leafCardTexture(size, 19)];
  const cardMats = tex.map(t => makeMat({ map: t, alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide, wind: 0.8, foliage: true, roughness: 0.62, aMat: M.leafCard }));
  const cardM = [[], []], cardC = [[], []], leafM = [], leafC = [], pts = [];
  const minY = (x, z) => P.ground(x, z) + 3.3;
  const perTip = film ? 15 : 10, perLeaf = film ? 26 : 0;
  const tint = new THREE.Color(), warm = new THREE.Color('#d8c27a');
  let k = 0;
  for (const tip of tips) {
    const rc = frnd(0.62, 0.98) * 1.08;
    const c = tip.p.clone().add(new V3(0, rc * 0.22, 0));
    if (c.y < minY(c.x, c.z)) continue;
    for (let i = 0; i < perTip; i++) {
      const u = new V3(frnd(-1, 1), frnd(-0.45, 1), frnd(-1, 1));
      if (u.lengthSq() > 1 || u.lengthSq() < 0.04) { i--; continue; }
      u.normalize();
      const p = c.clone().addScaledVector(u, rc * frnd(0.12, 0.8));
      if (p.y < minY(p.x, p.z)) continue;
      const nrm = u.clone().add(new V3(frnd(-0.9, 0.9), frnd(-0.5, 0.9), frnd(-0.9, 0.9)));
      const s = frnd(0.95, 1.45) * (film ? 0.95 : 1.15);
      cardM[k % 2].push(leafMatrix(p, nrm, new V3(frnd(-1, 1), frnd(-1, 1), frnd(-1, 1)), s));
      const lit = 0.82 + 0.22 * u.y + 0.12 * (-u.z * 0.9 + u.x * 0.35) + frnd(-0.12, 0.12);
      tint.setScalar(lit).lerp(warm, frnd(0, 0.18));
      cardC[k % 2].push('#' + tint.getHexString());
      pts.push(p); k++;
    }
    for (let i = 0; i < perLeaf; i++) {
      const u = new V3(frnd(-1, 1), frnd(-0.5, 1), frnd(-1, 1));
      if (u.lengthSq() > 1 || u.lengthSq() < 0.05) { i--; continue; }
      u.normalize();
      const p = c.clone().addScaledVector(u, rc * frnd(0.85, 1.15));
      if (p.y < minY(p.x, p.z)) continue;
      leafM.push(leafMatrix(p, u.clone().add(new V3(frnd(-0.5, 0.5), frnd(-0.3, 0.6), frnd(-0.5, 0.5))), new V3(frnd(-1, 1), frnd(-0.6, 0.6), frnd(-1, 1)), frnd(0.9, 1.3)));
      const lit = THREE.MathUtils.clamp(0.5 + 0.35 * u.y + 0.25 * (-u.z * 0.9 + u.x * 0.35) + frnd(-0.3, 0.3), 0, 0.999);
      leafC.push(GREENS[Math.floor(lit * GREENS.length)]);
    }
  }
  // fill the inside of the crown so it reads as one great mass, not separate puffs
  {
    const m = a => a.reduce((s, v) => s + v, 0) / a.length;
    const C = new V3(m(pts.map(p => p.x)), m(pts.map(p => p.y)), m(pts.map(p => p.z)));
    const Rr = new V3(...['x', 'y', 'z'].map(ax => { const d = pts.map(p => Math.abs(p[ax] - C[ax])).sort((p, q) => p - q); return d[Math.floor(d.length * 0.85)]; }));
    const nFill = film ? 2600 : 900;
    for (let i = 0, g = 0; i < nFill && g < nFill * 20; g++) {
      const u = new V3(frnd(-1, 1), frnd(-1, 1), frnd(-1, 1)), L = u.length();
      if (L > 1 || L < 0.45) continue;
      const p = C.clone().add(u.clone().multiply(Rr));
      if (p.y < minY(p.x, p.z) + 0.4) continue;
      const nrm = u.clone().normalize().add(new V3(frnd(-0.8, 0.8), frnd(-0.4, 0.8), frnd(-0.8, 0.8)));
      cardM[i % 2].push(leafMatrix(p, nrm, new V3(frnd(-1, 1), frnd(-1, 1), frnd(-1, 1)), frnd(1.1, 1.7)));
      tint.setScalar(0.78 + 0.25 * (u.y / L) + frnd(-0.1, 0.1)).lerp(warm, frnd(0, 0.15));
      cardC[i % 2].push('#' + tint.getHexString());
      pts.push(p); i++;
    }
  }
  const geo = cardGeometry(M.leafCard);
  for (let i = 0; i < 2; i++) {
    const cards = instanced(geo, cardMats[i], cardM[i], cardC[i]);
    cards.castShadow = true;
    group.add(cards);
  }
  if (leafM.length) {
    const leaves = instanced(oakLeaf(true), makeMat({ wind: 1, side: THREE.DoubleSide, roughness: 0.55, aMat: M.leaf }), leafM, leafC);
    leaves.castShadow = true; group.add(leaves);
  }

  // the dappled-light ellipsoid follows the real canopy
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y), zs = pts.map(p => p.z);
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const cx = mean(xs), cy = mean(ys), cz = mean(zs);
  const pct = (a, c) => { const d = a.map(v => Math.abs(v - c)).sort((p, q) => p - q); return d[Math.floor(d.length * 0.9)]; };
  const canopy = { c: [cx, cy, cz], r: [pct(xs, cx) * 1.1, pct(ys, cy) * 1.3, pct(zs, cz) * 1.1] };
  U.uCanopyC.value.set(...canopy.c); U.uCanopyR.value.set(...canopy.r); U.uDappleMode.value = 1;

  // fallen leaves on the grass under the tree
  const fM = [], fC = [];
  const nf = film ? 1800 : 520;
  for (let i = 0; i < nf; i++) {
    const a = R2() * Math.PI * 2, r = 1.0 + Math.sqrt(R2()) * 8.5;
    const x = bx + Math.cos(a) * r * 1.1, z = bz + Math.sin(a) * r;
    if (P.clear && P.clear(x, z)) continue;
    const p = new V3(x, P.ground(x, z) + 0.012, z);
    fM.push(leafMatrix(p, new V3(frnd(-0.25, 0.25), 1, frnd(-0.25, 0.25)), new V3(Math.cos(R2() * 6.3), 0, Math.sin(R2() * 6.3)), frnd(0.75, 1.1)));
    fC.push(DRY[Math.floor(R2() * DRY.length)]);
  }
  group.add(instanced(oakLeaf(false), makeMat({ wind: 0, side: THREE.DoubleSide, roughness: 0.85, aMat: M.leaf }), fM, fC));
  return { leaves: leafM.length, cards: cardM[0].length + cardM[1].length, fallen: fM.length, limbs, limbInfo, canopy, tips: tips.length };
}
