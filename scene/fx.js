// fx.js - life in the air: pollen and dandelion seeds drifting downwind and glowing when they cross the sunbeam,
// white storks circling in a thermal over the valley (Israel's autumn migration), swallows skimming the meadow.
// Everything is a pure function of time t.
import * as THREE from 'three';
import { U } from './mat.js';

function rngf(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const HAZE_GLSL = /* glsl */`
uniform vec3 uSunDir; uniform vec3 uHazeSun; uniform vec3 uHazeAway; uniform float uFogDensity;
vec3 skyHaze(vec3 d){ vec2 a = normalize(d.xz + 1e-5), s = normalize(uSunDir.xz + 1e-5); float sa = dot(a, s);
  vec3 c = mix(uHazeAway, uHazeSun, smoothstep(-0.5, 1.0, sa)); c += uHazeSun*pow(max(dot(d, uSunDir), 0.0), 10.0)*0.6; return c; }
`;

export function buildPollen(G, quality = 'vr') {
  const n = quality === 'film' ? 1400 : 320;
  const R = rngf(555);
  const seed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { seed[i * 4] = R(); seed[i * 4 + 1] = Math.pow(R(), 1.4); seed[i * 4 + 2] = R(); seed[i * 4 + 3] = R() * 0.6; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const uni = { uBoxMin: { value: new THREE.Vector3(-6, G + 0.3, -11) }, uBoxSize: { value: new THREE.Vector3(14, 4.2, 11) }, uScale: { value: 900 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, ...uni }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec4 aSeed; uniform vec3 uBoxMin; uniform vec3 uBoxSize; uniform float uTime; uniform vec2 uWindDir; uniform vec3 uSunDir; uniform float uScale;
      uniform vec3 uCanopyC; uniform vec3 uCanopyR;
      // how much canopy lies between this mote and the sun (motes in the tree's shade do not glow)
      float shade(vec3 w){ vec3 o = (w - uCanopyC)/uCanopyR, dd = uSunDir/uCanopyR;
        float a = dot(dd, dd), b = dot(o, dd), c = dot(o, o) - 1.0, disc = b*b - a*c;
        if (disc <= 0.0) return 0.0; float sq = sqrt(disc), s1 = (-b + sq)/a; if (s1 <= 0.0) return 0.0;
        return smoothstep(0.3, 2.0, s1 - max((-b - sq)/a, 0.0)); }
      varying float vGlow; varying float vSeed;
      void main(){
        float big = step(0.69, aSeed.w);
        vec3 wind = vec3(uWindDir.x, 0.0, uWindDir.y)*(0.18 + 0.5*aSeed.w);
        vec3 p = aSeed.xyz*uBoxSize + wind*uTime
               + vec3(sin(uTime*0.7 + aSeed.x*40.0), 0.6*sin(uTime*0.5 + aSeed.y*30.0) + 0.05*uTime*(0.3 - aSeed.w), cos(uTime*0.6 + aSeed.z*50.0))*0.28;
        p = uBoxMin + mod(p, uBoxSize);
        vec4 mv = viewMatrix*vec4(p, 1.0);
        gl_Position = projectionMatrix*mv;
        vec3 toP = normalize(p - cameraPosition);
        vGlow = (0.02 + 2.4*pow(max(dot(toP, uSunDir), 0.0), 7.0))*(0.6 + 0.4*sin(uTime*2.0 + aSeed.x*90.0))*(1.0 - 0.9*shade(p));
        vSeed = big;
        gl_PointSize = clamp(mix(0.005, 0.016, aSeed.w)*(1.0 + big*1.5)*uScale/max(-mv.z, 0.05), 1.0, 24.0);
      }`,
    fragmentShader: /* glsl */`
      varying float vGlow; varying float vSeed;
      void main(){
        vec2 q = gl_PointCoord - 0.5; float d = length(q);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(1.0, 0.78, 0.45)*vGlow*a*a, 1.0);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return { object: pts, update(t, camera, height) { uni.uScale.value = (height ?? 1000) * 0.5 / Math.tan(THREE.MathUtils.degToRad((camera.fov ?? 70) / 2)); } };
}

// a bird: body, neck, trailing legs, long broad wings with dark primaries; aWing = signed span (0 on the body)
function birdGeometry() {
  const pos = [], col = [], wing = [];
  const W = '#ece8e0', K = '#1e1b1a', O = '#c9603a';
  const tri = (a, b, c, ca, w = [0, 0, 0]) => { pos.push(...a, ...b, ...c); const k = new THREE.Color(ca); for (let i = 0; i < 3; i++) col.push(k.r, k.g, k.b); wing.push(...w); };
  tri([0, 0, 0.62], [0.07, 0, 0.08], [-0.07, 0, 0.08], W);           // neck + body, flat
  tri([0.07, 0, 0.08], [0, 0, -0.42], [-0.07, 0, 0.08], W);
  tri([0, 0.05, 0.1], [0, 0, 0.62], [0, -0.05, 0.08], W);             // keel, so it reads from the side
  tri([0, 0, 0.62], [0.012, 0, 0.85], [-0.012, 0, 0.85], O);          // beak
  tri([0.02, -0.01, -0.38], [-0.02, -0.01, -0.38], [0, -0.02, -0.82], O);   // legs trailing
  for (const s of [-1, 1]) {
    const a = [s * 0.06, 0, 0.16], b = [s * 0.06, 0, -0.14], c = [s * 0.55, 0, 0.16], d = [s * 0.55, 0, -0.18], e = [s * 1.0, 0, 0.0], f = [s * 0.95, 0, -0.16];
    tri(a, c, b, W, [s * 0.06, s * 0.55, s * 0.06]); tri(b, c, d, W, [s * 0.06, s * 0.55, s * 0.55]);
    tri(c, e, d, K, [s * 0.55, s * 1.0, s * 0.55]); tri(d, e, f, K, [s * 0.55, s * 1.0, s * 0.95]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  return g;
}

export function buildBirds(G) {
  // 7 storks circling a thermal far over the valley, 3 swallows over the meadow
  const birds = [];
  for (let i = 0; i < 7; i++) birds.push({ kind: 'stork', c: [62 + i * 1.5, G + 26 + i * 5.5, -150 - i * 2], r: 16 + i * 5.2, w: (i % 2 ? -1 : 1) * (0.13 - i * 0.008), ph: i * 0.95, s: 1.0, flap: 0.25, rate: 3.2 });
  for (let i = 0; i < 3; i++) birds.push({ kind: 'swallow', c: [-2 + i * 4, G + 2.6 + i * 0.8, -14 - i * 3], r: 7 + i * 3, w: 0.55 + i * 0.12, ph: i * 2.1, s: 0.17, flap: 1.0, rate: 13 });
  const n = birds.length;
  const geo = birdGeometry();
  const phase = new Float32Array(n), flap = new Float32Array(n), rate = new Float32Array(n);
  birds.forEach((b, i) => { phase[i] = b.ph * 3.7; flap[i] = b.flap; rate[i] = b.rate; });
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  geo.setAttribute('aFlap', new THREE.InstancedBufferAttribute(flap, 1));
  geo.setAttribute('aRate', new THREE.InstancedBufferAttribute(rate, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.DoubleSide, vertexColors: true,
    vertexShader: /* glsl */`
      attribute float aWing; attribute float aPhase; attribute float aFlap; attribute float aRate;
      uniform float uTime; varying vec3 vCol; varying vec3 vW;
      void main(){
        vec3 p = position;
        float glide = smoothstep(0.2, 0.7, sin(uTime*0.45 + aPhase*2.0)*0.5 + 0.5);
        float amp = mix(0.12, 0.75, aFlap)*mix(1.0, 0.25, glide*(1.0 - aFlap));
        float ang = (sin(uTime*aRate + aPhase)*amp + 0.06)*(0.65 + 0.35*abs(aWing));
        float span = abs(aWing), sg = sign(aWing);
        if (span > 0.07) { float r = span - 0.06; p.x = sg*(0.06 + r*cos(ang)); p.y += r*sin(ang); }
        vec4 w = modelMatrix*instanceMatrix*vec4(p, 1.0);
        vW = w.xyz; vCol = color;
        gl_Position = projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying vec3 vW;
      ${HAZE_GLSL}
      void main(){
        vec3 V = normalize(vW - cameraPosition); float dist = length(vW - cameraPosition);
        float back = pow(max(dot(V, uSunDir), 0.0), 3.0);
        vec3 c = vCol*(0.22 + 0.55*uHazeSun) + uHazeSun*back*0.6;
        float ff = 1.0 - exp(-pow(dist*uFogDensity, 1.35));
        gl_FragColor = vec4(mix(c, skyHaze(V), clamp(ff, 0.0, 1.0)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4(), f = new THREE.Vector3(), up = new THREE.Vector3(), rt = new THREE.Vector3(), P = new THREE.Vector3();
  function update(t) {
    birds.forEach((b, i) => {
      const th = b.ph + b.w * t;
      let x, y, z, dx, dz;
      if (b.kind === 'stork') {
        x = b.c[0] + Math.cos(th) * b.r; z = b.c[2] + Math.sin(th) * b.r; y = b.c[1] + 1.5 * Math.sin(t * 0.13 + i) + t * 0.08;
        dx = -Math.sin(th) * Math.sign(b.w); dz = Math.cos(th) * Math.sign(b.w);
      } else {                                            // swallows: quick figure-eights low over the grass
        x = b.c[0] + Math.sin(th) * b.r; z = b.c[2] + Math.sin(th * 2) * b.r * 0.45; y = b.c[1] + 0.6 * Math.sin(th * 3);
        dx = Math.cos(th); dz = Math.cos(th * 2) * 0.9;
      }
      f.set(dx, 0, dz).normalize();
      const bank = b.kind === 'stork' ? 0.32 * Math.sign(b.w) : 0.5 * Math.sin(th * 2);
      up.set(0, 1, 0).applyAxisAngle(f, bank);
      rt.crossVectors(up, f).normalize(); up.crossVectors(f, rt).normalize();
      m.makeBasis(rt.multiplyScalar(b.s), up.multiplyScalar(b.s), f.clone().multiplyScalar(b.s));
      m.setPosition(P.set(x, y, z));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { object: mesh, update };
}
