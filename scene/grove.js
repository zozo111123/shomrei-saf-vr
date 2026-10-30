// grove.js - smaller oaks and carobs scattered over the slopes 20-130 m away: each a trunk and a crown of the same
// code-painted leaf cards as the big tree (darker), so the middle distance has real trees, not lollipops.
import * as THREE from 'three';
import { M, makeMat } from './mat.js';
import { heightAt, lakeE, pathDist, fbm2 } from './terrain.js';
import { leafMatrix, instanced } from './tree.js';
import { gnarledTube } from './oak.js';
import { leafCardTexture, cardGeometry } from './foliage.js';

function rngf(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** b: Builder for the trunks (they join the shadowed static mesh); returns the crowns as one instanced mesh */
export function buildGrove(b, { quality = 'vr', sun2, avoid } = {}) {
  const film = quality === 'film';
  const R = rngf(4711), rnd = (a, c) => a + (c - a) * R();
  const nTrees = film ? 110 : 40, perTree = film ? 46 : 26;
  const mats = [], cols = [];
  const V3 = THREE.Vector3, tint = new THREE.Color(), warm = new THREE.Color('#cdb46a');
  let n = 0, guard = 0;
  while (n < nTrees && guard++ < 6000) {
    const a = R() * Math.PI * 2, r = 22 + Math.pow(R(), 1.25) * 115;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (lakeE(x, z) < 1.3 || pathDist(x, z) < 3) continue;
    if (avoid && avoid(x, z)) continue;
    // keep the line of sight from the viewer to the sun clear
    const ang = Math.acos((x * sun2.x + z * sun2.y) / r);
    if (ang < 0.22 && r < 90) continue;
    if (fbm2(x * 0.03 + 7, z * 0.03 - 2) < 0.43 && R() < 0.7) continue;            // in groves, with open land between
    const gy = heightAt(x, z), h = rnd(3.6, 7.5), cr = h * rnd(0.42, 0.6);
    const base = new V3(x, gy - 0.3, z), top = new V3(x + rnd(-0.4, 0.4), gy + h * 0.55, z + rnd(-0.4, 0.4));
    gnarledTube(b, [base, base.clone().lerp(top, 0.5).add(new V3(rnd(-0.25, 0.25), 0, rnd(-0.25, 0.25))), top], h * 0.045, h * 0.026, '#6f6557', M.bark, 6, 0.08, n);
    const c = top.clone().add(new V3(0, cr * 0.45, 0));
    for (let i = 0; i < perTree; i++) {
      const u = new V3(rnd(-1, 1), rnd(-0.5, 1), rnd(-1, 1));
      if (u.lengthSq() > 1 || u.lengthSq() < 0.03) { i--; continue; }
      const p = c.clone().add(new V3(u.x * cr, u.y * cr * 0.62, u.z * cr));
      const nrm = u.clone().normalize().add(new V3(rnd(-0.7, 0.7), rnd(-0.3, 0.8), rnd(-0.7, 0.7)));
      mats.push(leafMatrix(p, nrm, new V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)), cr * rnd(0.55, 0.85)));
      tint.setScalar(0.6 + 0.3 * u.y + rnd(-0.08, 0.08)).lerp(warm, rnd(0, 0.15));
      cols.push('#' + tint.getHexString());
    }
    n++;
  }
  const tex = leafCardTexture(film ? 1024 : 512, 31);
  const mat = makeMat({ map: tex, alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide, wind: 0.45, foliage: true, roughness: 0.7, aMat: M.groveCard });
  const mesh = instanced(cardGeometry(M.groveCard), mat, mats, cols);
  mesh.castShadow = true;
  return { mesh, trees: n, cards: mats.length };
}
