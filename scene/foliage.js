// foliage.js - leaf cards: a texture PAINTED IN CODE (about 150 small oak leaves with twigs on a transparent canvas)
// on slightly bent quads. Dense, natural foliage with real holes for very few triangles; the holes also cut
// real dappled shadows (alphaTest is honoured by the shadow pass).
import * as THREE from 'three';
import { M } from './mat.js';

function rngf(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// one leaf: an elongated, finely toothed oval with a midrib, painted with a soft gradient
function leaf(g, x, y, len, wid, ang, fill, edge, rib) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.beginPath();
  const N = 18;
  for (let i = 0; i <= N; i++) { const t = i / N, w = wid * Math.pow(Math.sin(Math.PI * t), 0.75) * (1 + 0.1 * Math.sin(t * Math.PI * 9)); g.lineTo(t * len, -w); }
  for (let i = N; i >= 0; i--) { const t = i / N, w = wid * Math.pow(Math.sin(Math.PI * t), 0.75) * (1 + 0.1 * Math.sin(t * Math.PI * 9 + 1)); g.lineTo(t * len, w); }
  g.closePath();
  const gr = g.createLinearGradient(0, -wid, 0, wid); gr.addColorStop(0, fill[0]); gr.addColorStop(1, fill[1]);
  g.fillStyle = gr; g.fill();
  g.lineWidth = Math.max(0.6, wid * 0.08); g.strokeStyle = edge; g.stroke();
  g.beginPath(); g.moveTo(len * 0.02, 0); g.lineTo(len * 0.9, 0); g.strokeStyle = rib; g.lineWidth = Math.max(0.5, wid * 0.09); g.stroke();
  g.restore();
}

const SHADES = [['#2a3d1d', '#1f2f16'], ['#33492a', '#26391d'], ['#3f5530', '#2f4223'], ['#4b6136', '#3a4e2a'], ['#566c3c', '#43582f'], ['#62763f', '#4e6233'], ['#6f8044', '#5a6b37']];

/** a cluster texture: leaves fanned around a centre, back leaves darker, twigs underneath */
export function leafCardTexture(size = 512, seed = 7, density = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), R = rngf(seed), S = size;
  g.clearRect(0, 0, S, S);
  g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {                                    // twigs
    const a = R() * Math.PI * 2, r = S * (0.25 + R() * 0.2);
    g.strokeStyle = 'rgba(70,55,40,0.9)'; g.lineWidth = S * 0.006;
    g.beginPath(); g.moveTo(S / 2, S / 2); g.quadraticCurveTo(S / 2 + Math.cos(a + 0.3) * r * 0.5, S / 2 + Math.sin(a + 0.3) * r * 0.5, S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); g.stroke();
  }
  const n = Math.round(150 * density * (size / 512) ** 0.5);
  const items = [];
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, r = Math.pow(R(), 0.62 + 0.25 * (density - 1)) * S * 0.43;
    const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r * 0.92;
    items.push({ x, y, a: a + (R() - 0.5) * 1.6, len: S * (0.06 + R() * 0.035) * (1 + 0.35 * (density - 1)), depth: R() * 0.6 + 0.4 * (r / (S * 0.43)) });
  }
  items.sort((p, q) => p.depth - q.depth);                        // back (dark, inner) first, front (light, outer) last
  for (const it of items) {
    const k = Math.min(SHADES.length - 1, Math.floor(it.depth * SHADES.length * 0.999 + (R() - 0.5) * 2));
    const sh = SHADES[Math.max(0, k)];
    leaf(g, it.x, it.y, it.len, it.len * 0.24, it.a, sh, 'rgba(20,28,12,0.55)', 'rgba(150,170,90,0.35)');
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** a 1 x 1 m card, bent forward at the middle so it is never perfectly flat */
export function cardGeometry(aMat = M.leafCard) {
  const g = new THREE.PlaneGeometry(1, 1, 2, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, 0.1 * (1 - x * x * 4)); }
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(p.count * 3).fill(1), 3));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(new Array(p.count).fill(aMat), 1));
  return g;
}
