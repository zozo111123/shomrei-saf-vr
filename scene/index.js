// index.js - assembles the code-built courtyard: buildings, props and tree merged into one shadowed mesh,
// instanced leaves, palms, sky, sun + sky light, and (from people.js) the characters.
// update(t, camera) is a pure function of t (plus where the viewer looks, for the characters' gaze).
import * as THREE from 'three';
import { U, makeMat, makeSky } from './mat.js';
import { Builder } from './geo.js';
import { buildYard, G } from './yard.js';
import { buildProps } from './props.js';
import { buildTree, buildPalms } from './tree.js';
import { buildGirl } from './girl.js';
import { createMeadow, PERSON_SPOT, VIEWER } from './meadow.js';

export { G, PERSON_SPOT, VIEWER };

export function setupRenderer(renderer) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
}

// opts: { world: 'meadow' (default) | 'yard', quality: 'vr' (default) | 'film', renderer, codeGirl, viewHeight }
// The camera that renders the meadow needs far >= 6000 (the far hills are ~4 km away).
export function createYard(opts = {}) {
  if ((opts.world ?? 'meadow') === 'meadow') return createMeadow(opts);
  const group = new THREE.Group();
  group.name = 'code-yard';

  const b = new Builder();
  buildYard(b);
  buildProps(b);
  const leafGroup = new THREE.Group();
  const treeInfo = buildTree(b, leafGroup);
  const staticGeo = b.merge();
  const staticMesh = new THREE.Mesh(staticGeo, makeMat({ roughness: 0.88 }));
  staticMesh.castShadow = true; staticMesh.receiveShadow = true;
  group.add(staticMesh, leafGroup);

  const pb = new Builder();
  buildPalms(pb);
  const palms = new THREE.Mesh(pb.merge(), makeMat({ side: THREE.DoubleSide, roughness: 0.7 }));
  group.add(palms);

  group.add(makeSky());

  // the sun: warm, high, behind the viewer; its shadow covers the whole courtyard
  const sun = new THREE.DirectionalLight(0xfff0da, 3.1);
  const target = new THREE.Object3D(); target.position.set(0, G, -2.5);
  sun.target = target;
  sun.position.copy(target.position).addScaledVector(U.uSunDir.value, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(opts.shadowSize ?? 2048, opts.shadowSize ?? 2048);
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 5, far: 90 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.025; sun.shadow.radius = 3;
  group.add(sun, target);
  const sky = new THREE.HemisphereLight(0xd3e2f4, 0xb49a88, 1.25);
  group.add(sky);

  const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  const stats = { staticTris: Math.round(tris(staticGeo)), leaves: treeInfo.leaves, palmTris: Math.round(tris(palms.geometry)) };

  const updaters = [];
  if (opts.renderer && opts.codeGirl) {
    const girl = buildGirl(opts.renderer);
    group.add(girl.group); updaters.push(girl.update);
    stats.girlTris = Math.round(tris(girl.meshes.bodyMesh.geometry) + tris(girl.meshes.handMesh.geometry));
  }
  return {
    group, stats, sun,
    add(obj, update) { group.add(obj); if (update) updaters.push(update); },
    update(t, camera) {
      U.uTime.value = t;
      for (const u of updaters) u(t, camera);
    },
  };
}
