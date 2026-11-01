// school.js - the schoolyard world: a photoreal 360 panorama (AI image of a Jerusalem-stone school courtyard at
// golden hour) projected onto a dome with a real flat floor (three's GroundedSkybox), so the paving under the
// bench sits where a floor should when the viewer moves the head. Her shadow and the bench's land on that floor
// through a shadow-only plane. Same interface as the meadow: { group, stats, sun, update(t, camera) }.
//
// Life on top of the still photo: the foliage in the photo sways (a small, smooth, time-varying shift of the
// picture only where it is leaves or bougainvillea), dust glows in the sunbeam, olive leaves drift down from the
// tree behind her, swallows cross the courtyard, and the low sun has a soft glare.
import * as THREE from 'three';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
import { U } from './mat.js';
import { buildPollen, buildBirds } from './fx.js';

// opts: { pano: url, groundY (floor height, the viewer's eyes are y = 0), yaw (radians: turns the panorama so its
//         sun sits behind her), sunDir: THREE.Vector3 toward the sun, treeAt: [x, y, z] the canopy behind her }
export function createSchool(opts) {
  const group = new THREE.Group(); group.name = 'school';
  let tex;
  const ready = new Promise((res, rej) => { tex = new THREE.TextureLoader().load(opts.pano, res, undefined, () => rej(new Error(`panorama: ${opts.pano}`))); });
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  const eye = -opts.groundY;
  const dome = new GroundedSkybox(tex, eye, 90, 160);
  dome.material.toneMapped = false;                    // the photo is already graded: show it as it is
  dome.rotation.y = opts.yaw ?? 0;
  // foliage sway: leaves (green) and bougainvillea (magenta) move; stone, sky and paving stay still
  dome.material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        float leafMask(vec3 c){ float g = c.g - max(c.r * 0.92, c.b); float m = min(c.r, c.b) - c.g;   // green | magenta
          return clamp(smoothstep(0.015, 0.08, g) + smoothstep(0.05, 0.16, m), 0.0, 1.0); }`)
      .replace('#include <map_fragment>', `
        vec2 uv0 = vMapUv;
        vec3 c0 = texture2D(map, uv0).rgb;
        float lm = leafMask(c0) * smoothstep(0.30, 0.45, uv0.y);          // not on the floor
        // branches move together (slow, large), leaves flutter (fast, small)
        vec2 w = vec2(sin(uTime * 0.9 + uv0.x * 41.0 + uv0.y * 23.0) + 0.5 * sin(uTime * 1.7 + uv0.y * 67.0),
                      cos(uTime * 0.7 + uv0.x * 37.0) * 0.6) * 0.00045
               + vec2(sin(uTime * 5.3 + uv0.x * 900.0 + uv0.y * 700.0), cos(uTime * 4.1 + uv0.y * 800.0)) * 0.00012;
        vec4 sampledDiffuseColor = texture2D(map, uv0 + w * lm);
        diffuseColor *= sampledDiffuseColor;`);
  };
  group.add(dome);

  // the world's shared uniforms: the sun is low behind her (the photo's sun), a light breeze
  const sunDir = (opts.sunDir ?? new THREE.Vector3(0.05, 0.12, -1)).clone().normalize();
  U.uSunDir.value.copy(sunDir);
  if (U.uWindDir) U.uWindDir.value.set(0.6, 0.35);
  const tree = new THREE.Vector3(...(opts.treeAt ?? [0, opts.groundY + 3.4, -5.5]));
  if (U.uCanopyC) { U.uCanopyC.value.copy(tree); U.uCanopyR.value.set(3.2, 1.6, 3.2); }

  // the light that falls on the 3D things (bench, her shadow): the low sun behind her, and the warm courtyard bounce
  const sun = new THREE.DirectionalLight(0xffd9a8, 2.6);
  const target = new THREE.Object3D(); target.position.set(0, opts.groundY, -2);
  sun.target = target; sun.position.copy(target.position).addScaledVector(sunDir, 30);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 5, far: 60 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
  group.add(sun, target, new THREE.HemisphereLight(0xcfe0f2, 0xc9a77e, 1.1));

  // shadows only: a plane at floor height that draws nothing but the shadows cast on it
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(24, 24).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.42, color: 0x2a1c10 }));
  catcher.position.y = opts.groundY + 0.002; catcher.receiveShadow = true;
  group.add(catcher);

  const updaters = [];
  // dust in the sunbeam around her and the tree
  const pollen = buildPollen(opts.groundY, 'vr');
  pollen.object.material.uniforms.uBoxMin.value.set(-4, opts.groundY + 0.2, -8);
  pollen.object.material.uniforms.uBoxSize.value.set(8, 3.6, 8);
  group.add(pollen.object); updaters.push((t, cam) => pollen.update(t, cam, opts.viewHeight));
  // swallows over the courtyard (the far storks of the meadow are not part of a schoolyard)
  const birds = buildBirds(opts.groundY);
  group.add(birds.object); updaters.push(t => birds.update(t));

  // olive leaves drifting down from the canopy behind her, now and then
  const NL = 14;
  const leafGeo = new THREE.PlaneGeometry(0.028, 0.075);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x8e9a6a, roughness: 0.6, side: THREE.DoubleSide });
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, NL); leaves.frustumCulled = false; leaves.castShadow = true;
  group.add(leaves);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1);
  updaters.push((t) => {
    for (let i = 0; i < NL; i++) {
      const life = 9 + (i % 5), k = ((t + i * 2.37) % life) / life;            // each leaf falls for ~9-13 s, then again
      const r = (i * 0.618) % 1, a = r * 6.283, rad = 0.6 + 2.2 * ((i * 0.37) % 1);
      const fall = tree.y - opts.groundY;
      p.set(tree.x + Math.cos(a) * rad + 0.6 * k + 0.12 * Math.sin(t * 1.3 + i),
            tree.y - fall * k + 0.08 * Math.sin(t * 2.1 + i * 3.0),
            tree.z + Math.sin(a) * rad * 0.6 + 0.3 * k);
      e.set(t * (1.1 + r) + i, t * (0.7 + r), Math.sin(t * 2.0 + i) * 0.8); q.setFromEuler(e);
      m4.compose(p, q, k > 0.97 ? s1.set(0, 0, 0) : s1.set(1, 1, 1)); leaves.setMatrixAt(i, m4);
    }
    leaves.instanceMatrix.needsUpdate = true;
  });

  // the low sun's soft glare, where the photo's sun is
  const gc = document.createElement('canvas'); gc.width = gc.height = 256;
  const gx = gc.getContext('2d'), gr = gx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,236,200,0.55)'); gr.addColorStop(0.25, 'rgba(255,200,130,0.18)'); gr.addColorStop(1, 'rgba(255,170,90,0)');
  gx.fillStyle = gr; gx.fillRect(0, 0, 256, 256);
  const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false, transparent: true }));
  glare.position.copy(sunDir).multiplyScalar(60); glare.scale.setScalar(26); glare.renderOrder = 1;
  group.add(glare);
  updaters.push((t) => { glare.material.opacity = 0.85 + 0.15 * Math.sin(t * 0.6); });

  return { group, sun, ready, stats: { pano: opts.pano }, update(t, camera) { U.uTime.value = t; for (const u of updaters) u(t, camera); } };
}
