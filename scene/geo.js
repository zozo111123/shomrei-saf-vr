// geo.js - a builder that collects many small parts (boxes, rounded boxes, cylinders, any geometry) with a
// colour and a material id each, and merges them into ONE geometry = one draw call in the headset.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const tc = new THREE.Color();

export function matrixOf(pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  tmpE.set(rot[0], rot[1], rot[2], 'YXZ'); tmpQ.setFromEuler(tmpE);
  return new THREE.Matrix4().compose(tmpP.set(pos[0], pos[1], pos[2]), tmpQ, tmpS.set(scale[0], scale[1], scale[2]));
}

export class Builder {
  constructor() { this.parts = []; }
  // add any geometry; it is baked with a colour (hex or array of hex per vertex) and a pattern id
  add(geo, color, aMat = 0, matrix = null) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color' && k !== 'aMat') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (matrix) g.applyMatrix4(matrix);
    const n = g.attributes.position.count;
    if (color !== null && color !== undefined) {
      const c = new Float32Array(n * 3); tc.set(color);
      for (let i = 0; i < n; i++) { c[i * 3] = tc.r; c[i * 3 + 1] = tc.g; c[i * 3 + 2] = tc.b; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    if (!g.attributes.aMat) g.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(n).fill(aMat), 1));
    this.parts.push(g);
    return this;
  }
  box(size, pos, color, aMat = 0, rot = [0, 0, 0]) { return this.add(new THREE.BoxGeometry(size[0], size[1], size[2]), color, aMat, matrixOf(pos, rot)); }
  rbox(size, pos, color, aMat = 0, rot = [0, 0, 0], r = 0.02) {
    const rr = Math.min(r, size[0] / 2.01, size[1] / 2.01, size[2] / 2.01);
    return this.add(new RoundedBoxGeometry(size[0], size[1], size[2], 2, rr), color, aMat, matrixOf(pos, rot));
  }
  cyl(rTop, rBot, h, pos, color, aMat = 0, rot = [0, 0, 0], seg = 12, open = false) {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open), color, aMat, matrixOf(pos, rot));
  }
  // a cylinder between two points (legs, rails, pipes)
  rod(a, b, r, color, aMat = 11, seg = 8) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
    const g = new THREE.CylinderGeometry(r, r, L, seg, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    return this.add(g, color, aMat, m);
  }
  merge() {
    const g = mergeGeometries(this.parts, false);
    if (!g) throw new Error('merge failed: attribute mismatch between parts');
    g.computeBoundingSphere();
    return g;
  }
}
