// terrain.js - the land: a small hilltop (the tree, the bench, the viewer) that falls away into a valley with a
// lake under the setting sun, then rolling hills and far ridges that fade into the golden haze. One polar mesh
// centred on the viewer: dense at the feet, coarse at the horizon (one draw call from 0 to 3 km).
import * as THREE from 'three';
import { M, U, makeMat } from './mat.js';
import { leafMatrix, instanced } from './tree.js';
import { leafCardTexture, cardGeometry } from './foliage.js';

export const G = -1.2;                                  // ground under the viewer (eyes at the origin)
export const SUN = new THREE.Vector3(0.35, 0.22, -0.9).normalize();   // low, in front, a little to the right
const SUN2 = new THREE.Vector2(SUN.x, SUN.z).normalize();
const HILL = [0.4, 2.0];                                // centre of the hilltop (the brow is just past the tree)

// deterministic value noise (the same everywhere it is used: terrain, grass, flowers)
function h2(x, y) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
export function fbm2(x, y, oct = 4) { let s = 0, a = 0.5; for (let i = 0; i < oct; i++) { s += a * vnoise(x, y); x = x * 2.03 + 17.1; y = y * 2.03 + 9.7; a *= 0.5; } return s; }
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// the lake: an ellipse straight under the sun, ~135 m away and ~35 m below the hilltop
export const RIDGE = { r: 430, crest: -11.5 };
export const LAKE = { c: [SUN2.x * 140, SUN2.y * 140], rx: 78, rz: 34 };   // rx across the view, rz along it
export function lakeE(x, z) {
  const dx = x - LAKE.c[0], dz = z - LAKE.c[1];
  const u = dx * -SUN2.y + dz * SUN2.x, v = dx * SUN2.x + dz * SUN2.y;   // u across, v along the sun direction
  return (u / LAKE.rx) ** 2 + (v / LAKE.rz) ** 2;
}

// the worn path: from beside the bench toward the light, down the slope
export const PATH = [[1.7, -3.1], [2.6, -5.6], [4.4, -9.6], [7.6, -15.5], [11.8, -23], [17.5, -32], [25, -44]];
export function pathDist(x, z) {
  let best = Infinity;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1], vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return best;
}

function rawBase(x, z) {
  const dx = x - HILL[0], dz = z - HILL[1], r = Math.hypot(dx, dz);
  const toward = r > 1e-3 ? (dx * SUN2.x + dz * SUN2.y) / r : 0;      // +1 = toward the sunset / the lake
  let h = 0.45 * Math.exp(-r * r / 160);
  const q = Math.max(0, r - 7.5) / (33 - 9 * toward);
  h -= (31 + 8 * toward) * (1 - Math.exp(-q * q));
  h += 0.14 * (fbm2(x * 0.12, z * 0.12) - 0.5);
  h += 1.8 * (fbm2(x * 0.021 + 5, z * 0.021 - 3) - 0.5) * sstep(10, 45, r);
  h += 9 * (fbm2(x * 0.0075 - 2, z * 0.0075 + 7) - 0.5) * sstep(40, 160, r);
  const sunLow = 0.55 + 0.45 * sstep(-0.25, 0.8, -toward);           // the hills are lower where the sun sets
  h += sstep(150, 560, r) * (26 + 105 * fbm2(x * 0.0028, z * 0.0028)) * sunLow;
  const ridge = 1 - Math.abs(2 * fbm2(x * 0.0007 + 3, z * 0.0007 - 2, 5) - 1);   // ridged far mountains: crests, not domes
  h += sstep(650, 2300, r) * (90 + 330 * ridge * ridge) * sunLow;
  // a ridge across the valley behind the person (430 m out, in the forward sector), its crest a little below
  // the viewer's eye line: depth behind her head instead of a blank bright band
  const rv = Math.hypot(x, z), fwd = rv > 1e-3 ? -z / rv : 0;
  const sector = sstep(Math.cos(0.8), Math.cos(0.38), fwd);
  if (sector > 0 && rv > 200) {
    const crest = RIDGE.crest + 3 * (fbm2(x * 0.02 + 1, z * 0.02 + 5) - 0.5);
    const prof = crest - 22 * ((rv - RIDGE.r) / 140) ** 2;
    h += (prof - h) * sector * Math.exp(-(((rv - RIDGE.r) / 150) ** 2));
  }
  return h;
}
// the water level sits just below the lowest point of the shore, so the lake never floats above the land
const LAKE_LEVEL_RAW = (() => {
  let lo = Infinity;
  for (let i = 0; i < 192; i++) {
    const k = [0.97, 1.03, 1.12][i % 3], a = Math.floor(i / 3) / 64 * Math.PI * 2, u = Math.cos(a) * LAKE.rx * k, v = Math.sin(a) * LAKE.rz * k;
    const x = LAKE.c[0] + u * -SUN2.y + v * SUN2.x, z = LAKE.c[1] + u * SUN2.x + v * SUN2.y;
    lo = Math.min(lo, rawBase(x, z));
  }
  return lo - 0.6;
})();
// the spot where the person (with her own bench) is composited: dead flat for 2.7 x 1.7 m, feathered beyond
export const FLAT = { x: 0, z: -1.62, hx: 1.35, hz: 0.85, feather: 0.9 };
const FLAT_H = rawBase(FLAT.x, FLAT.z);
function rawHeight(x, z) {
  let h = rawBase(x, z);
  const fx = Math.max(0, Math.abs(x - FLAT.x) - FLAT.hx), fz = Math.max(0, Math.abs(z - FLAT.z) - FLAT.hz);
  const fd = Math.hypot(fx, fz);
  if (fd < FLAT.feather) h = h + (FLAT_H - h) * sstep(FLAT.feather, 0, fd);
  const e = lakeE(x, z);
  if (e >= 1.0) return h;
  return h + (LAKE_LEVEL_RAW - 2.5 - h) * sstep(1.0, 0.72, e);
}
const RAW0 = rawHeight(0, 0);
export const heightAt = (x, z) => G + rawHeight(x, z) - RAW0;
export const LAKE_Y = G + LAKE_LEVEL_RAW - RAW0;

/** the terrain mesh. masks(x, z) -> [litter, path] painted into the vertex colour (read by the ground shader) */
export function buildTerrain(mat, masks, quality = 'vr') {
  const segs = quality === 'film' ? 320 : 110, growth = quality === 'film' ? 1.042 : 1.072;
  const radii = [0];
  let dr = quality === 'film' ? 0.18 : 0.32;
  while (radii[radii.length - 1] < 4200) { radii.push(radii[radii.length - 1] + dr); dr *= growth; }
  const pos = [], col = [], idx = [];
  pos.push(0, heightAt(0, 0), 0); col.push(...masks(0, 0), 0);
  for (let i = 1; i < radii.length; i++) for (let j = 0; j < segs; j++) {
    const a = j / segs * Math.PI * 2 + (i % 2) * Math.PI / segs, x = Math.cos(a) * radii[i], z = Math.sin(a) * radii[i];
    pos.push(x, heightAt(x, z), z);
    const m = radii[i] < 60 ? masks(x, z) : [0, 0];
    col.push(m[0], m[1], 0);
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + (j + 1) % segs, 1 + j);
  for (let i = 1; i < radii.length - 1; i++) for (let j = 0; j < segs; j++) {
    const a = 1 + (i - 1) * segs + j, b = 1 + (i - 1) * segs + (j + 1) % segs, c = 1 + i * segs + j, d = 1 + i * segs + (j + 1) % segs;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(M.ground), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

// the lake: deep water that mirrors the golden horizon and throws a glitter path toward the sun
export function buildLake() {
  const geo = new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      varying vec3 vW;
      uniform float uTime; uniform vec2 uWindDir; uniform vec3 uSunDir; uniform vec3 uHazeSun; uniform vec3 uHazeAway; uniform float uFogDensity;
      float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(h21(i), h21(i+vec2(1.0,0.0)), u.x), mix(h21(i+vec2(0.0,1.0)), h21(i+vec2(1.0,1.0)), u.x), u.y); }
      vec3 skyHaze(vec3 d){ vec2 a = normalize(d.xz + 1e-5), s = normalize(uSunDir.xz + 1e-5); float sa = dot(a, s);
        vec3 c = mix(uHazeAway, uHazeSun, smoothstep(-0.5, 1.0, sa)); c += uHazeSun*pow(max(dot(d, uSunDir), 0.0), 10.0)*0.6; return c; }
      float waves(vec2 p){ return vn(p*0.9 + vec2(uTime*0.35, uTime*0.12))*0.5 + vn(p*2.3 - vec2(uTime*0.6, -uTime*0.4))*0.3 + vn(p*5.1 + uTime*0.9)*0.2; }
      void main(){
        vec3 V = normalize(vW - cameraPosition); float dist = length(vW - cameraPosition);
        vec2 p = vW.xz*0.22; float e = 0.08;
        float h0 = waves(p), hx = waves(p + vec2(e, 0.0)), hz = waves(p + vec2(0.0, e));
        float amp = mix(0.35, 0.05, smoothstep(60.0, 220.0, dist));
        vec3 n = normalize(vec3((h0 - hx)/e*amp*0.12, 1.0, (h0 - hz)/e*amp*0.12));
        vec3 R = reflect(V, n);
        float fres = 0.02 + 0.98*pow(1.0 - max(dot(-V, n), 0.0), 5.0);
        vec3 sky = mix(skyHaze(R), vec3(0.20, 0.27, 0.48), smoothstep(0.04, 0.5, R.y));
        vec3 col = mix(vec3(0.02, 0.05, 0.07), sky, fres*0.9 + 0.1);
        float sd = max(dot(R, uSunDir), 0.0);
        col += uHazeSun*(pow(sd, 900.0)*45.0 + pow(sd, 90.0)*1.4 + pow(sd, 10.0)*0.18);
        float ff = 1.0 - exp(-pow(dist*uFogDensity, 1.35));
        col = mix(col, skyHaze(V), clamp(ff, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const lake = new THREE.Mesh(geo, mat);
  lake.position.set(LAKE.c[0], LAKE_Y, LAKE.c[1]);
  lake.rotation.y = -Math.atan2(SUN2.y, SUN2.x);
  lake.scale.set(LAKE.rz * 0.995, 1, LAKE.rx * 0.995);
  lake.frustumCulled = false;
  return lake;
}

// distant trees on the far slopes and the valley: crowns of dense leaf cards, sinking into the haze
export function buildFarTrees(_mat, quality = 'vr') {
  const film = quality === 'film';
  const n = film ? 700 : 170, per = film ? 16 : 9;
  let s = 99173;
  const R = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rnd = (a, c) => a + (c - a) * R();
  const mats = [], cols = [], tint = new THREE.Color();
  let k = 0, guard = 0;
  while (k < n && guard++ < n * 40) {
    const a = R() * Math.PI * 2, r = 125 + Math.pow(R(), 1.5) * 1100;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (lakeE(x, z) < 1.25) continue;
    if (fbm2(x * 0.012, z * 0.012) < 0.48 && R() < 0.75) continue;      // trees grow in groves and lines
    if (-z / r > Math.cos(0.55) && r > 330) continue;                    // keep the sky behind her head clean
    const sc = (4.5 + R() * 5) * (r > 400 ? 1.5 : 1), cr = sc * 0.62;
    // three crown types: a round oak, a tall carob/cypress-like oval, a wide flat pine
    const type = R(), sx = type < 0.5 ? 0.8 : type < 0.75 ? 0.45 : 1.1, sy = type < 0.5 ? 0.5 : type < 0.75 ? 1.05 : 0.3;
    const c = new THREE.Vector3(x, heightAt(x, z) + cr * (type < 0.75 ? 0.5 : 0.9), z);
    for (let i = 0; i < per; i++) {
      const u = new THREE.Vector3(rnd(-1, 1), rnd(-0.5, 1), rnd(-1, 1));
      if (u.lengthSq() > 1) { i--; continue; }
      const p = c.clone().add(new THREE.Vector3(u.x * cr * sx, u.y * cr * sy, u.z * cr * sx));
      mats.push(leafMatrix(p, u.clone().add(new THREE.Vector3(rnd(-0.6, 0.6), 0.6, rnd(-0.6, 0.6))), new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)), cr * rnd(1.1, 1.5)));
      cols.push('#' + tint.setScalar(rnd(0.55, 0.75)).getHexString());
    }
    k++;
  }
  // the treeline on the ridge behind her: a soft dark band of crowns along the crest
  for (let th = -0.6; th < 0.6; th += rnd(0.012, 0.05)) {
    if (fbm2(th * 9 + 3, 1.7) < 0.42) { th += 0.04; continue; }                // gaps between the clumps
    const rr = RIDGE.r + rnd(-30, 25), x = Math.sin(th) * rr, z = -Math.cos(th) * rr;
    const sc = rnd(5, 14) * (0.7 + 0.6 * fbm2(th * 5, 4.2)), cr = sc * 0.6, c = new THREE.Vector3(x, heightAt(x, z) + cr * 0.45, z);
    for (let i = 0; i < (film ? 12 : 7); i++) {
      const u = new THREE.Vector3(rnd(-1, 1), rnd(-0.5, 1), rnd(-1, 1));
      if (u.lengthSq() > 1) { i--; continue; }
      const p = c.clone().add(new THREE.Vector3(u.x * cr * 0.9, u.y * cr * 0.5, u.z * cr * 0.6));
      mats.push(leafMatrix(p, u.clone().add(new THREE.Vector3(0, 0.6, 0.5)), new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)), cr * rnd(1.1, 1.5)));
      cols.push('#' + tint.setScalar(rnd(0.5, 0.68)).getHexString());
    }
  }
  const mat = makeMat({ map: leafCardTexture(film ? 512 : 256, 53, 1.9), alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide, foliage: true, roughness: 0.8, aMat: M.groveCard });
  const mesh = instanced(cardGeometry(M.groveCard), mat, mats, cols);
  return mesh;
}

function mergeTwo(a, b) {
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color', 'aMat']) {
    const A = a.attributes[k], B = b.attributes[k]; if (!A || !B) continue;
    const arr = new Float32Array(A.array.length + B.array.length); arr.set(A.array); arr.set(B.array, A.array.length);
    g.setAttribute(k, new THREE.BufferAttribute(arr, A.itemSize));
  }
  return g;
}
