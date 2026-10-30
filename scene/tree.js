// tree.js - a ficus grown from rules (trunk, root flares, limbs, three generations of branches), ~22k
// individual leaves that move in the wind, ivy on the west wall, shrubs, fallen leaves, palms past the gate.
import * as THREE from 'three';
import { M, makeMat, U } from './mat.js';
import { G, rng } from './yard.js';

const V3 = THREE.Vector3;
export const TREE = { base: [4.6, 3.4] };
const BARK = '#8b7d6b';

// a tube through points whose radius tapers from r0 to r1
export function taperedTube(b, pts, r0, r1, color, aMat, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const segs = Math.max(3, Math.round(curve.getLength() / 0.3));
  const fr = curve.computeFrenetFrames(segs, false);
  const pos = [], nor = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, P = curve.getPointAt(u), N = fr.normals[i], B = fr.binormals[i];
    const r = THREE.MathUtils.lerp(r0, r1, Math.pow(u, 0.85));
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const nx = c * N.x + s * B.x, ny = c * N.y + s * B.y, nz = c * N.z + s * B.z;
      const bump = 1 + 0.07 * Math.sin(a * 3 + u * 9) * (r0 > 0.2 ? 1 : 0.3);
      pos.push(P.x + nx * r * bump, P.y + ny * r * bump, P.z + nz * r * bump); nor.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, c = a + radial + 1;
    idx.push(a, c, a + 1, a + 1, c, c + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  b.add(g, color, aMat);
}

// one leaf: a folded, slightly curled ellipse 16 cm long, tip along +y, face along +z
export function leafGeometry(L = 0.16, W = 0.072) {
  const v = [
    [0, 0, 0], [-W * 0.42, L * 0.3, -0.004], [0, L * 0.3, 0.007], [W * 0.42, L * 0.3, -0.004],
    [-W * 0.5, L * 0.6, -0.006], [0, L * 0.62, 0.006], [W * 0.5, L * 0.6, -0.006], [0, L, -0.014],
  ];
  const f = [0, 2, 1, 0, 3, 2, 1, 2, 5, 1, 5, 4, 2, 3, 6, 2, 6, 5, 4, 5, 7, 5, 6, 7];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v.flat(), 3));
  g.setIndex(f); g.computeVertexNormals();
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(v.length * 3).fill(1), 3));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(new Array(v.length).fill(M.leaf), 1));
  return g;
}

export function leafMatrix(pos, normal, tip, s) {
  const z = normal.clone().normalize();
  const y = tip.clone().addScaledVector(z, -tip.dot(z)).normalize();
  const x = new V3().crossVectors(y, z);
  return new THREE.Matrix4().makeBasis(x.multiplyScalar(s), y.multiplyScalar(s), z.multiplyScalar(s)).setPosition(pos);
}

export function instanced(geo, mat, items, colors) {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const c = new THREE.Color();
  items.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, c.set(colors[i])); });
  mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

const CANOPY_GREENS = ['#2c5224', '#36602a', '#3f6c2e', '#4a7832', '#57843a', '#3a6430', '#6a8c3c', '#7f9842'];

export function buildTree(b, group) {
  const R = rng(777);
  const rnd = (a, c) => a + (c - a) * R();
  const [bx, bz] = TREE.base;
  const base = new V3(bx, G, bz);
  const trunk = [new V3(0, -0.25, 0), new V3(-0.1, 1.2, -0.08), new V3(-0.25, 2.3, -0.2), new V3(-0.42, 3.3, -0.36)].map(v => v.add(base));
  taperedTube(b, trunk, 0.47, 0.33, BARK, M.bark, 16);
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * Math.PI * 2 + R() * 0.5, c = Math.cos(a), s = Math.sin(a);
    taperedTube(b, [new V3(0, 0.55, 0), new V3(c * 0.42, 0.14, s * 0.42), new V3(c * 0.95, -0.04, s * 0.95)].map(v => v.add(base)), 0.2, 0.05, BARK, M.bark, 8);
  }
  const top = trunk[3];
  const anchors = [];
  const grow = (p, dir, len, r, depth) => {
    const n = depth >= 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const out = new V3(p.x - bx, 0, p.z - bz).normalize();
      const rand = new V3(rnd(-1, 1), rnd(-0.6, 1), rnd(-1, 1)).normalize();
      const d = dir.clone().multiplyScalar(0.7).addScaledVector(rand, 0.75).addScaledVector(out, 0.35);
      d.y += depth === 0 ? -0.2 : 0.12; d.normalize();
      const L = len * rnd(0.75, 1.2);
      const mid = p.clone().addScaledVector(d, L * 0.5).add(new V3(0, 0.08 * L, 0));
      const end = p.clone().addScaledVector(d, L);
      taperedTube(b, [p.clone(), mid, end], r, r * 0.62, BARK, M.bark, depth > 1 ? 7 : 5);
      if (depth <= 1) anchors.push(mid, end);
      if (depth > 0) grow(end, d, len * 0.72, r * 0.62, depth - 1); else anchors.push(end);
    }
  };
  const limbs = [[0.8, 5.4, 0.8], [-0.8, 6.0, -2.2], [6.5, 5.8, -2.5], [-2.8, 5.6, 2.8], [3.0, 6.2, 6.6], [4.8, 7.6, 2.0], [8.0, 5.6, 4.6]];
  for (const [tx, ty, tz] of limbs) {
    const end = new V3(tx, G + ty, tz);
    const q1 = top.clone().lerp(end, 0.3).add(new V3(rnd(-0.3, 0.3), 0.7, rnd(-0.3, 0.3)));
    const q2 = top.clone().lerp(end, 0.65).add(new V3(rnd(-0.3, 0.3), 0.6, rnd(-0.3, 0.3)));
    taperedTube(b, [top.clone(), q1, q2, end], 0.25, 0.1, BARK, M.bark, 10);
    grow(end, end.clone().sub(q2).normalize(), 1.7, 0.1, 3);
    grow(q2, end.clone().sub(q1).normalize(), 1.2, 0.08, 1);
  }

  // leaves: a clump around every anchor, never hanging down into the viewer's face
  const geo = leafGeometry();
  const mats = [], cols = [];
  let sx = 0, sz = 0, n = 0;
  for (const a of anchors) {
    for (let i = 0; i < 44; i++) {
      const off = new V3(rnd(-1, 1), rnd(-0.55, 0.75), rnd(-1, 1));
      if (off.lengthSq() > 1) { i--; continue; }
      off.multiplyScalar(0.8);
      const p = a.clone().add(off);
      if (p.y < G + 3.9) continue;
      const nrm = off.clone().add(new V3(0, 0.9, 0)).addScaledVector(new V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)), 0.6);
      const tip = new V3(off.x, rnd(-0.4, 0.4), off.z).add(new V3(rnd(-0.5, 0.5), 0, rnd(-0.5, 0.5)));
      mats.push(leafMatrix(p, nrm, tip, rnd(0.8, 1.3)));
      cols.push(CANOPY_GREENS[Math.floor(R() * CANOPY_GREENS.length)]);
      sx += p.x; sz += p.z; n++;
    }
  }
  const leafMat = makeMat({ wind: 1, side: THREE.DoubleSide, roughness: 0.55, aMat: M.leaf });
  const canopy = instanced(geo, leafMat, mats, cols);
  group.add(canopy);
  // the shader's dappled light follows the real canopy: centre = mean of the leaves, radius = 80th percentile
  const cx = sx / n, cz = sz / n;
  const dists = mats.map(m => Math.hypot(m.elements[12] - cx, m.elements[14] - cz)).sort((a, c) => a - c);
  U.uCanopy.value.set(cx, cz, dists[Math.floor(dists.length * 0.8)], G + 6.2);

  // ivy climbing the west wall in the corner, thinning out as it rises
  const ivyM = [], ivyC = [], IVY = ['#24481f', '#2d5426', '#355e2b', '#3f6a31'];
  for (let i = 0; i < 2600; i++) {
    const z = rnd(-12.4, -8.9), y = rnd(0, 5.2);
    const keep = Math.sin(z * 2.1) * 0.5 + Math.sin(z * 5.3 + y) * 0.3 + 1.1 - y / 4.5;
    if (keep < R()) continue;
    const p = new V3(-10.47 + rnd(0, 0.32), G + y, z);
    ivyM.push(leafMatrix(p, new V3(1, rnd(-0.3, 0.6), rnd(-0.5, 0.5)), new V3(0, rnd(-1, 1), rnd(-1, 1)), rnd(0.55, 0.85)));
    ivyC.push(IVY[Math.floor(R() * IVY.length)]);
  }
  // shrubs in the three planters on the east side
  for (const pz of [-10.2, -7.8, -4.4]) for (let i = 0; i < 420; i++) {
    const off = new V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)); if (off.lengthSq() > 1) { i--; continue; }
    const p = new V3(9.9, G + 1.0, pz).add(off.clone().multiply(new V3(0.38, 0.42, 0.62)));
    ivyM.push(leafMatrix(p, off.clone().add(new V3(0, 0.5, 0)), new V3(rnd(-1, 1), 1, rnd(-1, 1)), rnd(0.6, 0.9)));
    ivyC.push(CANOPY_GREENS[Math.floor(R() * 6)]);
  }
  group.add(instanced(geo, makeMat({ wind: 0.35, side: THREE.DoubleSide, roughness: 0.6, aMat: M.leaf }), ivyM, ivyC));

  // fallen leaves on the paving under the canopy
  const fM = [], fC = [], DRY = ['#9a7a3a', '#b08f45', '#7c6a36', '#5f6b30', '#a5863f', '#8c6a35'];
  for (let i = 0; i < 380; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 7.5;
    const p = new V3(cx + Math.cos(a) * r, G + 0.006, cz + Math.sin(a) * r);
    if (Math.abs(p.x - TREE.base[0]) < 1.2 && Math.abs(p.z - TREE.base[1]) < 1.2) continue;
    fM.push(leafMatrix(p, new V3(rnd(-0.15, 0.15), 1, rnd(-0.15, 0.15)), new V3(Math.cos(R() * 6.3), 0, Math.sin(R() * 6.3)), rnd(0.8, 1.15)));
    fC.push(DRY[Math.floor(R() * DRY.length)]);
  }
  group.add(instanced(geo, makeMat({ wind: 0, side: THREE.DoubleSide, roughness: 0.8, aMat: M.leaf }), fM, fC));
  return { leaves: mats.length + ivyM.length + fM.length };
}

// palms on the street beyond the gate, crowns above the fence
export function buildPalms(pb) {
  const R = rng(4242);
  for (const [px, pz, h] of [[15.2, -0.8, 12.5], [18.6, 2.2, 14], [16.4, 5.8, 11.5], [21.5, -3.5, 13]]) {
    const base = new V3(px, G, pz), lean = new V3(R() - 0.5, 0, R() - 0.5).multiplyScalar(0.9);
    const crown = base.clone().add(new V3(lean.x, h, lean.z));
    taperedTube(pb, [base, base.clone().lerp(crown, 0.5).add(new V3(lean.x * 0.3, 0, lean.z * 0.3)), crown], 0.3, 0.2, '#9c8c72', M.bark, 10);
    const pos = [], nor = [];
    for (let f = 0; f < 18; f++) {
      const a = f / 18 * Math.PI * 2 + R() * 0.3, d = new V3(Math.cos(a), 0, Math.sin(a)), side = new V3(-d.z, 0, d.x);
      const lift = 0.5 + R() * 0.9, L = 3.0 + R() * 0.8;
      const spine = new THREE.CatmullRomCurve3([crown.clone(), crown.clone().addScaledVector(d, L * 0.35).add(new V3(0, lift, 0)), crown.clone().addScaledVector(d, L * 0.7).add(new V3(0, lift * 0.6, 0)), crown.clone().addScaledVector(d, L).add(new V3(0, -0.5, 0))]);
      for (let s = 2; s < 30; s++) {
        const u = s / 30, P = spine.getPointAt(u), T = spine.getTangentAt(u);
        const ll = 0.75 * Math.sin(Math.PI * Math.min(1, u * 1.15)) + 0.12;
        for (const sg of [-1, 1]) {
          const tipP = P.clone().addScaledVector(side, sg * ll).addScaledVector(T, 0.25).add(new V3(0, -0.35 * ll, 0));
          const b2 = P.clone().addScaledVector(T, 0.07);
          pos.push(P.x, P.y, P.z, tipP.x, tipP.y, tipP.z, b2.x, b2.y, b2.z);
          for (let k = 0; k < 3; k++) nor.push(0, 1, 0);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    pb.add(g, '#55763a', M.leaf);
  }
}
