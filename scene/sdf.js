// sdf.js - sculpting in code. A shape is a signed distance function (negative inside); smooth unions blend
// parts like clay. surfaceNets() turns any SDF into a smooth triangle mesh with gradient normals and a
// per-vertex material (colour + pattern id), so characters are modelled entirely in code.
import * as THREE from 'three';

// ---------- primitives (all take p = [x, y, z]) ----------
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
export const sphere = (c, r) => p => len3(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - r;
// ellipsoid (approximate but well-behaved, Inigo Quilez)
export const ellipsoid = (c, r) => p => {
  const x = (p[0] - c[0]) / r[0], y = (p[1] - c[1]) / r[1], z = (p[2] - c[2]) / r[2];
  const k0 = len3(x, y, z);
  const k1 = len3(x / r[0], y / r[1], z / r[2]);
  return k1 < 1e-9 ? -Math.min(r[0], r[1], r[2]) : k0 * (k0 - 1) / k1;
};
// round cone / tapered capsule from a (radius ra) to b (radius rb)
export const capsule = (a, b, ra, rb = ra) => {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz, rr = ra - rb, a2 = l2 - rr * rr, il2 = 1 / l2;
  return p => {
    const pax = p[0] - a[0], pay = p[1] - a[1], paz = p[2] - a[2];
    const y = pax * bax + pay * bay + paz * baz, z = y - l2;
    const xx = (pax * l2 - bax * y) ** 2 + (pay * l2 - bay * y) ** 2 + (paz * l2 - baz * y) ** 2;
    const y2 = y * y * l2, z2 = z * z * l2;
    const k = Math.sign(rr) * rr * rr * xx;
    if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(xx + z2) * il2 - rb;
    if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(xx + y2) * il2 - ra;
    return (Math.sqrt(xx * a2 * il2) + y * rr) * il2 - ra;
  };
};
export const roundBox = (c, h, r) => p => {
  const qx = Math.abs(p[0] - c[0]) - h[0] + r, qy = Math.abs(p[1] - c[1]) - h[1] + r, qz = Math.abs(p[2] - c[2]) - h[2] + r;
  return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
};
// a curved tube through points with radii (piecewise round cones) - fingers, locks of hair, straps
export const tube = (pts, radii) => {
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) segs.push(capsule(pts[i], pts[i + 1], radii[i], radii[i + 1]));
  const f = p => { let d = Infinity; for (const s of segs) d = Math.min(d, s(p)); return d; };
  let cx = 0, cy = 0, cz = 0; for (const q of pts) { cx += q[0]; cy += q[1]; cz += q[2]; }
  cx /= pts.length; cy /= pts.length; cz /= pts.length;
  let R = 0; pts.forEach((q, i) => { R = Math.max(R, len3(q[0] - cx, q[1] - cy, q[2] - cz) + radii[i]); });
  f.bs = [cx, cy, cz, R];
  return f;
};

// ---------- operators ----------
export const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
export const smax = (a, b, k) => -smin(-a, -b, k);
// transform: evaluate f in a frame rotated by Euler angles (radians) about a pivot, then translated
export function xform(f, { pivot = [0, 0, 0], rot = [0, 0, 0], move = [0, 0, 0], scale = [1, 1, 1] }) {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')).invert();
  const e = m.elements, q = [0, 0, 0];
  return p => {
    const x = p[0] - pivot[0] - move[0], y = p[1] - pivot[1] - move[1], z = p[2] - pivot[2] - move[2];
    q[0] = (e[0] * x + e[4] * y + e[8] * z) / scale[0] + pivot[0];
    q[1] = (e[1] * x + e[5] * y + e[9] * z) / scale[1] + pivot[1];
    q[2] = (e[2] * x + e[6] * y + e[10] * z) / scale[2] + pivot[2];
    return f(q) * Math.min(scale[0], scale[1], scale[2]);
  };
}
// move a point onto the surface of f, offset by `off` along the normal (hair that follows the skull)
export function project(f, q, off = 0) {
  const p = q.slice(), e = 1e-4, t = [0, 0, 0];
  for (let i = 0; i < 12; i++) {
    const d = f(p) - off;
    const g = [0, 1, 2].map(a => { t[0] = p[0]; t[1] = p[1]; t[2] = p[2]; t[a] += e; const u = f(t); t[a] -= 2 * e; return (u - f(t)) / (2 * e); });
    const l = Math.hypot(...g) || 1;
    for (let a = 0; a < 3; a++) p[a] -= g[a] / l * d;
  }
  return p;
}
// rotate a point (for building rigs: where does a local anchor end up)
export function rotPoint(p, { pivot = [0, 0, 0], rot = [0, 0, 0], move = [0, 0, 0] }) {
  const v = new THREE.Vector3(p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]).applyEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ'));
  return [v.x + pivot[0] + move[0], v.y + pivot[1] + move[1], v.z + pivot[2] + move[2]];
}

/**
 * A character / object made of named parts. parts: [{ d: sdf, mat: {color, id}, k: blend radius }]
 * Parts with k > 0 blend into everything before them; `cut` parts are subtracted.
 */
export function compose(parts) {
  return {
    d(p) {
      let d = Infinity;
      for (const pt of parts) {
        const bs = pt.bs ?? pt.d.bs;
        if (bs && !pt.cut && len3(p[0] - bs[0], p[1] - bs[1], p[2] - bs[2]) - bs[3] > d + (pt.k ?? 0)) continue;
        const v = pt.d(p);
        if (pt.cut) d = smax(d, -v, pt.k ?? 0); else d = smin(d, v, pt.k ?? 0);
      }
      return d;
    },
    mat(p) {   // the visible material is the part whose surface is nearest (cuts excluded)
      let best = Infinity, m = parts[0].mat;
      for (const pt of parts) { if (pt.cut || pt.noMat) continue; const v = pt.d(p) - (pt.bias ?? 0); if (v < best) { best = v; m = pt.mat; } }
      return typeof m === 'function' ? m(p) : m;   // a part may colour itself by region (a bib, straps, a sleeve)
    },
  };
}

/**
 * Naive surface nets. bounds [x0,y0,z0,x1,y1,z1], h = cell size (m).
 * Returns a BufferGeometry with position, normal, color, aMat.
 */
export function surfaceNets(shape, bounds, h) {
  const [x0, y0, z0, x1, y1, z1] = bounds;
  const nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1, nz = Math.ceil((z1 - z0) / h) + 1;
  const F = new Float32Array(nx * ny * nz), p = [0, 0, 0];
  const I = (i, j, k) => i + nx * (j + ny * k);
  // narrow band: sample a coarse grid (every S cells) exactly; fine samples are evaluated only where the
  // coarse cell may contain the surface, elsewhere the coarse value (far from the surface) is good enough
  const S = 4, cx = Math.ceil((nx - 1) / S) + 1, cy = Math.ceil((ny - 1) / S) + 1, cz = Math.ceil((nz - 1) / S) + 1;
  const Cg = new Float32Array(cx * cy * cz), CI = (i, j, k) => i + cx * (j + cy * k);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    p[0] = x0 + i * S * h; p[1] = y0 + j * S * h; p[2] = z0 + k * S * h; Cg[CI(i, j, k)] = shape.d(p);
  }
  const band = S * h * 2.6;   // > the coarse cell diagonal, with margin for the approximate (ellipsoid, smooth-min) distances
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const ci = Math.min(Math.floor(i / S), cx - 2), cj = Math.min(Math.floor(j / S), cy - 2), ck = Math.min(Math.floor(k / S), cz - 2);
    let near = false, mn = Infinity;
    for (let c = 0; c < 8 && !near; c++) { const v = Cg[CI(ci + (c & 1), cj + ((c >> 1) & 1), ck + ((c >> 2) & 1))]; if (Math.abs(v) < band) near = true; mn = Math.min(mn, v); }
    if (near || mn < 0 && Cg[CI(ci, cj, ck)] > 0) { p[0] = x0 + i * h; p[1] = y0 + j * h; p[2] = z0 + k * h; F[I(i, j, k)] = shape.d(p); }
    else F[I(i, j, k)] = Cg[CI(ci, cj, ck)];
  }
  const cellIdx = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const C = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const o = corner[c]; cv[c] = F[I(i + o[0], j + o[1], k + o[2])]; if (cv[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]), oa = corner[a], ob = corner[b];
      sx += oa[0] + t * (ob[0] - oa[0]); sy += oa[1] + t * (ob[1] - oa[1]); sz += oa[2] + t * (ob[2] - oa[2]); n++;
    }
    cellIdx[C(i, j, k)] = pos.length / 3;
    pos.push(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h);
  }
  // project each vertex onto the true surface (two Newton steps) and take the gradient as the normal
  const V = pos.length / 3, nor = new Float32Array(V * 3), e = h * 0.35;
  const grad = (x, y, z) => {
    p[0] = x + e; p[1] = y; p[2] = z; const ax = shape.d(p); p[0] = x - e; const bx = shape.d(p);
    p[0] = x; p[1] = y + e; const ay = shape.d(p); p[1] = y - e; const by = shape.d(p);
    p[1] = y; p[2] = z + e; const az = shape.d(p); p[2] = z - e; const bz = shape.d(p);
    const gx = ax - bx, gy = ay - by, gz = az - bz, l = Math.hypot(gx, gy, gz) || 1;
    return [gx / l, gy / l, gz / l];
  };
  for (let v = 0; v < V; v++) {
    let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    for (let it = 0; it < 2; it++) {
      p[0] = x; p[1] = y; p[2] = z; const d = shape.d(p); const g = grad(x, y, z);
      const step = Math.max(-h * 0.7, Math.min(h * 0.7, d));
      x -= g[0] * step; y -= g[1] * step; z -= g[2] * step;
    }
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    let g = grad(x, y, z); if (!(Math.abs(g[0]) + Math.abs(g[1]) + Math.abs(g[2]) > 1e-6) || g.some(Number.isNaN)) g = [0, 1, 0];
    nor[v * 3] = g[0]; nor[v * 3 + 1] = g[1]; nor[v * 3 + 2] = g[2];
  }
  // quads across every sign-changing grid edge
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const s0 = F[I(i, j, k)] < 0, s1 = F[I(i + 1, j, k)] < 0; if (s0 === s1) continue;
    quad(cellIdx[C(i, j - 1, k - 1)], cellIdx[C(i, j, k - 1)], cellIdx[C(i, j, k)], cellIdx[C(i, j - 1, k)], !s0);
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const s0 = F[I(i, j, k)] < 0, s1 = F[I(i, j + 1, k)] < 0; if (s0 === s1) continue;
    quad(cellIdx[C(i - 1, j, k - 1)], cellIdx[C(i - 1, j, k)], cellIdx[C(i, j, k)], cellIdx[C(i, j, k - 1)], !s0);
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const s0 = F[I(i, j, k)] < 0, s1 = F[I(i, j, k + 1)] < 0; if (s0 === s1) continue;
    quad(cellIdx[C(i - 1, j - 1, k)], cellIdx[C(i, j - 1, k)], cellIdx[C(i, j, k)], cellIdx[C(i - 1, j, k)], !s0);
  }
  // material per vertex
  const col = new Float32Array(V * 3), am = new Float32Array(V), tc = new THREE.Color();
  for (let v = 0; v < V; v++) {
    p[0] = pos[v * 3]; p[1] = pos[v * 3 + 1]; p[2] = pos[v * 3 + 2];
    const m = shape.mat(p); tc.set(m.color);
    col[v * 3] = tc.r; col[v * 3 + 1] = tc.g; col[v * 3 + 2] = tc.b; am[v] = m.id;
  }
  // make every triangle face along the gradient (robust winding)
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const wx = pos[c * 3] - pos[a * 3], wy = pos[c * 3 + 1] - pos[a * 3 + 1], wz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
    const nx_ = nor[a * 3] + nor[b * 3] + nor[c * 3], ny_ = nor[a * 3 + 1] + nor[b * 3 + 1] + nor[c * 3 + 1], nz_ = nor[a * 3 + 2] + nor[b * 3 + 2] + nor[c * 3 + 2];
    if (cx * nx_ + cy * ny_ + cz * nz_ < 0) { idx[t + 1] = c; idx[t + 2] = b; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aMat', new THREE.BufferAttribute(am, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
