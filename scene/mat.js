// mat.js - every surface uses one material family: MeshStandardMaterial + vertex colours, extended in GLSL with
// (1) procedural patterns chosen per vertex by `aMat`, (2) sunlight broken by a moving canopy (dappled light),
// (3) wind (leaves sway; grass bends in travelling gusts), (4) translucency of leaves/grass/petals against the
// sun, (5) aerial perspective + valley mist coloured like the horizon in that direction (the sky uses the same).
// opts.ids lists the pattern ids a material needs: only those are compiled (small shaders compile fast).
import * as THREE from 'three';

// shared, animated uniforms (one object, referenced by every material)
export const U = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.32, 0.8, 0.5).normalize() },     // direction TO the sun
  uCanopy: { value: new THREE.Vector4(2.0, 1.5, 6.8, 5.1) },             // plane model: centre x, centre z, radius, height
  uCanopyC: { value: new THREE.Vector3(0, 6, 0) },                       // ellipsoid model: centre (world)
  uCanopyR: { value: new THREE.Vector3(8, 3.5, 8) },                     // ellipsoid model: radii
  uDappleMode: { value: 0 },                                             // 0 = plane (yard), 1 = ellipsoid (meadow)
  uDappleStrength: { value: 1 },
  uFogOn: { value: 0 }, uFogDensity: { value: 1 / 1500 },
  uValleyY: { value: -40 }, uMist: { value: 0 },                         // valley mist: below this height, thicker haze
  uHazeSun: { value: new THREE.Color('#ffb36b') },                       // horizon toward the sun
  uHazeAway: { value: new THREE.Color('#b8a9b6') },                      // horizon away from the sun
  uWindDir: { value: new THREE.Vector2(-0.9, 0.45).normalize() },        // where the wind blows TO (x, z)
};

// material ids (aMat) - patterns live in the shader
export const M = {
  plain: 0, hair: 1, tee: 2, denim: 3, skin: 4, wood: 5, bark: 6, brick: 7, plaster: 8, glass: 9, leaf: 10, metal: 11,
  fabric: 12, shoe: 13, lip: 14, iris: 15, grass: 16, ground: 17, flower: 18, rock: 19, core: 20, moss: 21, oldwood: 22, rope: 23,
  leafCard: 24, groveCard: 25,
};

const NOISE_V = /* glsl */`
uniform float uTime; uniform vec2 uWindDir;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1.0,0.0)), u.x), mix(h21(i+vec2(0.0,1.0)), h21(i+vec2(1.0,1.0)), u.x), u.y); }
// fbm with a rotation between octaves, so no grid shows through
float fbm(vec2 p){ float s = 0.0, a = 0.5; mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) { s += a*vn(p); p = r*p*2.03 + vec2(17.1, 9.7); a *= 0.5; } return s; }
float h31(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x + p.y + p.z)); }
float vn3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0 - 2.0*f);
  return mix(mix(mix(h31(i), h31(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h31(i + vec3(0.0, 1.0, 0.0)), h31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(h31(i + vec3(0.0, 0.0, 1.0)), h31(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h31(i + vec3(0.0, 1.0, 1.0)), h31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }
// gusts: a noise field that travels downwind at ~4 m/s, so waves visibly roll across the meadow
float gustField(vec2 p, float t){ vec2 w = normalize(uWindDir); float g = fbm(p*0.07 - w*t*0.28) + 0.35*fbm(p*0.21 - w*t*0.9); return smoothstep(0.42, 0.95, g); }
`;

const NOISE = NOISE_V + /* glsl */`
uniform vec3 uSunDir; uniform vec4 uCanopy; uniform vec3 uCanopyC; uniform vec3 uCanopyR; uniform float uDappleMode; uniform float uDappleStrength;
uniform vec3 uHazeSun; uniform vec3 uHazeAway; uniform float uFogOn; uniform float uFogDensity; uniform float uValleyY; uniform float uMist;
// the colour of the horizon in direction d: gold toward the sun, dusty mauve away from it
vec3 skyHaze(vec3 d){
  vec2 a = normalize(d.xz + 1e-5), s = normalize(uSunDir.xz + 1e-5);
  float sa = dot(a, s);
  vec3 c = mix(uHazeAway, uHazeSun, smoothstep(-0.5, 1.0, sa));
  c += uHazeSun*pow(max(dot(d, uSunDir), 0.0), 10.0)*0.6;
  return c;
}
// 1 = full sun, 0 = shade of the canopy. Flecks drift with the wind and agree on every surface.
float dapple(vec3 w){
  vec2 wind = vec2(uTime*0.09, uTime*0.055);
  if (uDappleMode < 0.5) {                       // plane model: follow the sun ray up to the canopy height
    float k = (uCanopy.w - w.y) / max(uSunDir.y, 0.25);
    if (k < 0.0) return 1.0;
    vec2 p = w.xz + uSunDir.xz * k;
    float inside = 1.0 - smoothstep(uCanopy.z*0.72, uCanopy.z*1.04, length(p - uCanopy.xy));
    float n = fbm(p*0.85 + wind)*0.62 + fbm(p*3.3 - wind*1.9)*0.38;
    n += 0.03*sin(uTime*2.1 + p.x*4.0 + p.y*3.0);
    return mix(1.0, smoothstep(0.545, 0.585, n), inside);
  }
  // ellipsoid model: how much canopy does the ray toward the sun cross? (works for a low sun too)
  vec3 o = (w - uCanopyC)/uCanopyR, dd = uSunDir/uCanopyR;
  float a = dot(dd, dd), b = dot(o, dd), c = dot(o, o) - 1.0, disc = b*b - a*c;
  if (disc <= 0.0) return 1.0;
  float sq = sqrt(disc), s0 = max((-b - sq)/a, 0.0), s1 = (-b + sq)/a;
  if (s1 <= 0.0) return 1.0;
  float L = s1 - s0;
  vec3 m = w + uSunDir*(s0 + s1)*0.5;
  vec2 q = m.xz + vec2(m.y*0.37, -m.y*0.21);
  float n = fbm(q*0.8 + wind)*0.62 + fbm(q*3.1 - wind*1.9)*0.38 + 0.03*sin(uTime*2.1 + q.x*4.0 + q.y*3.0);
  float cover = smoothstep(0.4, 3.5, L);
  float fleck = smoothstep(0.53 + 0.06*cover, 0.575 + 0.06*cover, n);
  return mix(1.0, fleck, cover*uDappleStrength);
}
`;

// colour patterns, one per material id (compiled only where used)
const PAT = {
  1: `float s = vn(vec2(op.x*520.0 + op.z*380.0, op.y*14.0)); float s2 = vn(vec2(op.x*130.0 - op.z*170.0, op.y*5.0));
      diffuseColor.rgb *= 0.72 + 0.38*s + 0.18*s2;`,
  2: `vec2 q = op.xy*70.0 + vec2(op.z*35.0, 0.0); vec2 c = fract(q) - 0.5; float pick = step(0.5, h21(floor(q)));
      float petal = 1.0 - smoothstep(0.16, 0.24, length(c));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.20, 0.26), petal*pick*0.85);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.42, 0.30), (1.0 - smoothstep(0.06, 0.1, length(c - vec2(0.18, 0.12))))*pick);`,
  3: `float tw = sin((op.x*0.7 + op.y)*1400.0)*0.5 + 0.5; diffuseColor.rgb *= 0.88 + 0.1*tw + 0.12*(vn(op.xy*60.0 + op.z*20.0) - 0.5);`,
  4: `diffuseColor.rgb *= 0.97 + 0.05*vn(op.xy*45.0 + op.z*10.0); diffuseColor.r *= 1.0 + 0.03*vn(op.yz*25.0);`,
  5: `float g = vn(vec2(wp.x*2.5 + wp.z*0.3, (wp.y + wp.z)*70.0)); diffuseColor.rgb *= 0.86 + 0.2*g;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.47, 0.38), smoothstep(0.78, 0.9, fbm(wp.xz*9.0))*0.6);`,
  6: `vec3 bq = wp*vec3(4.2, 2.4, 4.2);
      bq += (vn3(bq*0.45 + 3.0) - 0.5)*1.6;
      float plate = smoothstep(0.32, 0.64, vn3(bq));
      float fine = vn3(bq*3.6 + 11.0);
      float bpatch = vn3(wp*0.7 + 5.0);
      diffuseColor.rgb *= (0.66 + 0.42*plate)*(0.9 + 0.18*fine)*(0.88 + 0.24*bpatch);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.50, 0.55, 0.42), smoothstep(0.66, 0.84, fbm(wp.xz*3.0 + wp.y))*0.4);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.26, 0.33, 0.14), smoothstep(0.7, 0.86, fbm(wp.xz*1.7 - wp.y*0.8 + 4.0))*0.35);`,
  7: `vec2 q = wp.xz / vec2(0.2, 0.1); float row = floor(q.y); q.x += 0.5*mod(row, 2.0);
      vec2 id = floor(q), f = fract(q); float e = min(min(f.x, 1.0 - f.x)*0.2, min(f.y, 1.0 - f.y)*0.1);
      float mort = smoothstep(0.003, 0.008, e); float aa = fwidth(q.y); mort = mix(mort, 0.88, smoothstep(0.25, 0.7, aa));
      float tone = h21(id); vec3 brick = diffuseColor.rgb*(0.84 + 0.26*tone)*(0.93 + 0.1*vn(wp.xz*11.0));
      diffuseColor.rgb = mix(diffuseColor.rgb*0.6, brick, mort); diffuseColor.rgb *= 0.9 + 0.14*fbm(wp.xz*0.55);`,
  8: `diffuseColor.rgb *= 0.92 + 0.1*fbm(wp.xy*1.7 + wp.zy*1.7);
      float st = smoothstep(0.62, 0.85, vn(vec2((wp.x + wp.z)*3.0, wp.y*0.35))); diffuseColor.rgb *= 1.0 - 0.1*st;`,
  11: `diffuseColor.rgb *= 0.92 + 0.12*vn(wp.xy*30.0 + wp.zz*30.0);`,
  12: `diffuseColor.rgb *= 0.9 + 0.1*sin(op.x*900.0)*sin(op.y*900.0) + 0.06*vn(op.xy*50.0);`,
  // grass blade: dark at the root, a lighter midrib, golden tips, gusts flash the field lighter
  16: `float hh = clamp(op.y, 0.0, 1.0);
      diffuseColor.rgb *= mix(0.3, 1.1, pow(max(hh, 0.0), 0.7));
      diffuseColor.rgb *= 0.84 + 0.2*cos(clamp(op.x, -0.5, 0.5)*3.14159);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(1.35, 1.15, 0.7), smoothstep(0.55, 1.0, hh)*0.55);
      diffuseColor.rgb *= 1.0 + 0.3*vGust*hh;`,
  // meadow ground: short turf seen from above, green and golden patches, leaf litter, a worn path
  17: `float n1 = fbm(wp.xz*0.06), n2 = fbm(wp.xz*0.7 + 7.0);
      float fw = clamp(fwidth(wp.x)*30.0, 0.0, 1.0);
      float streak = mix(vn(vec2(wp.x*55.0 + wp.z*13.0, wp.z*55.0 - wp.x*13.0)), 0.5, fw);
      float tuft = mix(vn(wp.xz*9.0), 0.5, clamp(fwidth(wp.x)*6.0, 0.0, 1.0));
      vec3 green = vec3(0.13, 0.17, 0.05), gold = vec3(0.36, 0.28, 0.10);
      vec3 c = mix(green, gold, smoothstep(0.3, 0.75, n1));
      c *= 0.68 + 0.38*n2 + 0.3*(streak - 0.5) + 0.25*(tuft - 0.5);
      c *= 1.0 + 0.28*gustField(wp.xz, uTime);
      #ifdef USE_COLOR
        vec3 litter = mix(vec3(0.2, 0.15, 0.08), vec3(0.34, 0.25, 0.11), vn(wp.xz*7.0));
        c = mix(c, litter, clamp(vColor.r, 0.0, 1.0));
        // dusty ochre path: pebbles, dry blades, never chocolate
        float peb = smoothstep(0.62, 0.7, vn(wp.xz*38.0)), dry = smoothstep(0.55, 0.8, vn(vec2(wp.x*90.0 + wp.z*20.0, wp.z*14.0)));
        vec3 dirt = vec3(0.42, 0.32, 0.18)*(0.85 + 0.25*vn(wp.xz*12.0));
        dirt = mix(dirt, vec3(0.55, 0.48, 0.38), peb*0.6);
        dirt = mix(dirt, vec3(0.48, 0.38, 0.16), dry*0.5);
        c = mix(c, dirt, clamp(vColor.g, 0.0, 1.0)*(0.55 + 0.35*vn(wp.xz*3.0)));
      #endif
      // the valley floor below the hill: a patchwork of fields (green crops, ripe wheat, ploughed earth, orchards)
      float vw = smoothstep(uValleyY + 16.0, uValleyY + 6.0, wp.y);
      if (vw > 0.0) {
        vec2 fq = mat2(0.87, -0.5, 0.5, 0.87)*wp.xz/vec2(64.0, 38.0);
        fq += (vec2(fbm(wp.xz*0.004 + 3.0), fbm(wp.xz*0.004 - 5.0)) - 0.5)*0.9;   // fields follow the land, not a grid
        vec2 fid = floor(fq), ff = fract(fq);
        float hf = h21(fid + 3.0);
        vec3 fc = hf < 0.34 ? vec3(0.08, 0.14, 0.035) : hf < 0.5 ? vec3(0.36, 0.28, 0.10) : hf < 0.62 ? vec3(0.22, 0.16, 0.10) : hf < 0.8 ? vec3(0.12, 0.16, 0.06) : vec3(0.17, 0.2, 0.07);
        float fwq = clamp(fwidth(fq.x)*40.0, 0.0, 1.0);
        fc *= 0.82 + 0.36*vn(wp.xz*0.04 + fid);
        float edge = min(min(ff.x, 1.0 - ff.x)*64.0, min(ff.y, 1.0 - ff.y)*38.0);
        fc = mix(vec3(0.06, 0.08, 0.03), fc, mix(smoothstep(0.8, 2.2, edge), 1.0, fwq*0.7));
        c = mix(c, fc, vw);
      }
      diffuseColor.rgb = c;`,
  19: `diffuseColor.rgb *= 0.78 + 0.3*fbm(wp.xz*4.0 + wp.y*4.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.6, 0.42), smoothstep(0.66, 0.8, vn(wp.xz*9.0 + wp.yy*9.0))*0.5);`,
  20: `diffuseColor.rgb *= 0.7 + 0.5*vn(wp.xz*6.0 + wp.y*6.0);`,
  21: `diffuseColor.rgb *= 0.75 + 0.45*vn(wp.xz*25.0 + wp.y*25.0);`,
  22: `float g = vn(vec2(op.x*3.0, (op.y + op.z)*90.0)); float crack = smoothstep(0.82, 0.92, vn(vec2(op.x*1.5, (op.y + op.z)*240.0)));
      diffuseColor.rgb *= 0.78 + 0.32*g - 0.35*crack;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.36, 0.22), smoothstep(0.75, 0.9, fbm(wp.xz*6.0 + wp.y*3.0))*0.3);`,
  23: `diffuseColor.rgb *= 0.8 + 0.25*sin(op.y*600.0 + atan(op.x, op.z)*3.0);`,
  // foliage cards: darker deep inside the canopy, lighter at its skin
  24: `float cr = length((wp - uCanopyC)/uCanopyR); diffuseColor.rgb *= mix(0.42, 1.12, smoothstep(0.2, 1.0, cr));`,
  25: `diffuseColor.rgb *= 0.85 + 0.3*clamp(op.y + 0.5, 0.0, 1.0);`,
};

// emissive terms (translucency, rim, sky reflection), grouped by the ids that use them
const EMI = [
  [[9], `{ float fr = pow(clamp(1.0 - abs(dot(normal, V)), 0.0, 1.0), 2.5); vec3 sky = mix(vec3(0.20, 0.24, 0.28), vec3(0.70, 0.78, 0.86), fr);
          totalEmissiveRadiance += sky*(0.25 + 0.6*fr)*(0.6 + 0.4*vn(wp.xy*0.7)); }`],
  [[1, 2, 3, 4, 12, 13, 14], `{ float rim = pow(clamp(1.0 - abs(dot(normal, V)), 0.0, 1.0), 3.0); totalEmissiveRadiance += diffuseColor.rgb*vec3(0.75, 0.8, 0.9)*rim*0.35;
          if (mid == 4.0 || mid == 14.0) totalEmissiveRadiance += diffuseColor.rgb*vec3(0.16, 0.05, 0.03); }`],
  [[10, 24, 25], `{ float tr = pow(back, 4.0); totalEmissiveRadiance += diffuseColor.rgb*vec3(1.1, 1.25, 0.55)*(0.16 + 1.7*tr)*mix(0.45, 1.0, dappleK); }`],
  [[16, 18], `{ float hh = mid == 16.0 ? clamp(op.y, 0.0, 1.0) : 1.0; float tr = pow(back, 3.0);
          totalEmissiveRadiance += diffuseColor.rgb*vec3(1.3, 1.05, 0.5)*(0.06 + 2.0*tr)*hh*dappleK
            + vec3(1.0, 0.75, 0.38)*pow(hh, 6.0)*pow(back, 5.0)*0.55*dappleK; }`],
  [[6, 22, 19, 23], `{ float rim = pow(clamp(1.0 - abs(dot(normal, V)), 0.0, 1.0), 3.4); totalEmissiveRadiance += diffuseColor.rgb*uHazeSun*rim*(0.18 + 1.5*pow(back, 2.0))*dappleK + diffuseColor.rgb*vec3(0.16, 0.11, 0.06)*(1.0 - 0.5*back); }`],
];

function patterns(ids) {
  const list = ids.filter(i => PAT[i]);
  let s = 'float mid = floor(vMat + 0.5);\nfloat dappleK = dapple(vWPos);\nvec3 wp = vWPos; vec3 op = vOPos;\n';
  list.forEach((i, k) => { s += (k ? ' else ' : '') + `if (mid == ${i.toFixed(1)}) {\n${PAT[i]}\n}`; });
  return s + '\n';
}
function emissive(ids) {
  let s = '{\nvec3 V = normalize(vViewPosition); vec3 Ls = normalize((viewMatrix*vec4(uSunDir, 0.0)).xyz); float back = clamp(dot(-V, Ls), 0.0, 1.0);\n';
  for (const [group, code] of EMI) {
    const use = group.filter(i => ids.includes(i));
    if (!use.length) continue;
    s += `if (${use.map(i => `mid == ${i.toFixed(1)}`).join(' || ')}) ${code}\n`;
  }
  return s + '}\n';
}

// aerial perspective + valley mist, in linear light before tone mapping (so terrain and sky meet in the same haze)
const FOG = /* glsl */`
if (uFogOn > 0.5) {
  vec3 fv = vWPos - cameraPosition; float fd = length(fv);
  float ff = 1.0 - exp(-pow(max(fd*uFogDensity, 0.0), 1.12));
  float mist = uMist*(1.0 - exp(-fd*0.01))*exp(-max(vWPos.y - uValleyY, 0.0)*0.16);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, skyHaze(fv/max(fd, 1e-3)), clamp(max(ff, mist), 0.0, 1.0));
}
`;
const ALL_IDS = Object.values(M);
// last line of every material: a NaN/Inf pixel becomes black instead of poisoning post-processing
// (bloom/DOF downsampling spreads one NaN pixel into a large black block)
const NAN_GUARD = /* glsl */`
if (any(isnan(gl_FragColor)) || any(isinf(gl_FragColor))) gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
`;

/**
 * opts: { roughness, wind (amplitude, for leaves), grass (bend in gusts), foliage (both sides lit alike + canopy
 * normals), side, map, alphaTest, alphaToCoverage, metalness, aMat (one fixed id), ids (ids to compile) }
 */
export function makeMat(opts = {}) {
  const P = opts.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new P({
    vertexColors: opts.vertexColors !== false, roughness: opts.roughness ?? 0.86, metalness: opts.metalness ?? 0,
    side: opts.side ?? THREE.FrontSide, map: opts.map ?? null, alphaTest: opts.alphaTest ?? 0,
    color: opts.color ?? 0xffffff,
  });
  if (opts.physical) { m.clearcoat = opts.clearcoat ?? 0; m.clearcoatRoughness = 0.08; }
  if (opts.alphaToCoverage) m.alphaToCoverage = true;
  if (opts.grass) m.defines = { GRASS: '' };
  const windAmp = { value: opts.wind ?? 0 };
  const fixedMat = opts.aMat ?? -1;
  const ids = opts.ids ?? (fixedMat >= 0 ? [fixedMat] : ALL_IDS);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uWindAmp: windAmp });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uWindAmp;
${NOISE_V}
attribute float aMat; varying float vMat; varying vec3 vWPos; varying vec3 vOPos; varying float vGust;`)
      .replace('#include <project_vertex>', `
#ifdef USE_INSTANCING
  vec4 wp4 = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  vec3 ip = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#else
  vec4 wp4 = modelMatrix * vec4(transformed, 1.0);
  vec3 ip = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#endif
  vGust = 0.0;
#ifdef GRASS
  {
    float hgt = clamp(position.y, 0.0, 1.0);
  #ifdef USE_INSTANCING
    float blen = length((modelMatrix * instanceMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  #else
    float blen = 0.5;
  #endif
    vec2 wd = normalize(uWindDir);
    float g = gustField(ip.xz, uTime);
    vGust = g;
    float bend = (0.06 + 0.42*g)*hgt*hgt*blen;
    float fl = 0.04*sin(uTime*3.1 + dot(ip.xz, vec2(1.7, 2.3)) + hgt*2.0)*hgt*blen*(0.35 + g);
    vec2 side = vec2(-wd.y, wd.x)*0.03*sin(uTime*1.7 + ip.x*3.1)*hgt*blen;
    wp4.xz += wd*(bend + fl) + side;
    wp4.y -= 0.5*(bend*bend)/max(blen, 0.05);
  }
#endif
  if (uWindAmp > 0.0) {
    float ph = dot(ip, vec3(0.37, 0.11, 0.53));
    float gust = 0.55 + 0.45*sin(uTime*0.33 + ip.x*0.07 + ip.z*0.05);
    vec3 rel = wp4.xyz - ip;
    rel.y += (rel.x*0.8 + rel.z*0.6)*sin(uTime*4.7 + ph*7.0)*0.22*gust*min(uWindAmp, 1.0);
    vec3 sway = vec3(sin(uTime*1.13 + ph), 0.35*sin(uTime*1.7 + ph*2.0), cos(uTime*0.91 + ph*1.3))*0.045*gust;
    sway += vec3(sin(uTime*0.4 + ip.z*0.15), 0.0, cos(uTime*0.33 + ip.x*0.15))*0.05*gust*clamp((ip.y - 3.0)*0.3, 0.0, 1.0);
    wp4.xyz = ip + rel + sway*uWindAmp;
  }
  vWPos = wp4.xyz;
  vOPos = position;
  vMat = ${fixedMat >= 0 ? fixedMat.toFixed(1) : 'aMat'};
  vec4 mvPosition = viewMatrix * wp4;
  gl_Position = projectionMatrix * mvPosition;`);
    let fs = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vMat; varying vec3 vWPos; varying vec3 vOPos; varying float vGust;\n' + NOISE)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + patterns(ids))
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + emissive(ids))
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin
        .replace('getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= dappleK;'))
      .replace('#include <tonemapping_fragment>', FOG + '\n#include <tonemapping_fragment>')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + NAN_GUARD);
    // a zero-length normal (degenerate geometry) would be normalized into NaN
    fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  if (any(isnan(normal)) || dot(normal, normal) < 1e-8) normal = vec3(0.0, 0.0, 1.0);');
    // grass, flowers and foliage are lit the same from both sides (a blade's back is not "facing away from the sky")
    if (opts.grass || opts.foliage) fs = fs.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;'));
    // foliage cards borrow the canopy's roundness for their normals, so the crown shades like a volume
    if (opts.foliage) fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if (mid == 24.0) normal = normalize(mix(normal, normalize((viewMatrix*vec4((vWPos - uCanopyC)/(uCanopyR*uCanopyR), 0.0)).xyz), 0.7));
      if (mid == 25.0) normal = normalize(mix(normal, normalize((viewMatrix*vec4(0.0, 1.0, 0.0, 0.0)).xyz), 0.55));`);
    sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => 'm:' + (opts.wind ? 'w' : '') + (opts.grass ? 'g' : '') + (opts.foliage ? 'f' : '') + (opts.physical ? 'p' : '') + fixedMat + ':' + ids.join(',');
  m.userData.windAmp = windAmp;
  return m;
}

// the sky dome. Default: the clear midday sky of the yard. opts.golden: a golden-hour sky with a low sun,
// a warm horizon that turns dusty mauve away from the sun, and two cloud layers lit from below.
export function makeSky(opts = {}) {
  const yardFrag = /* glsl */`
        vec3 hor = vec3(0.93, 0.86, 0.74), mid = vec3(0.62, 0.74, 0.88), zen = vec3(0.30, 0.50, 0.82);
        vec3 col = mix(hor, mid, smoothstep(0.0, 0.25, y));
        col = mix(col, zen, smoothstep(0.25, 0.95, y));
        if (y > 0.02) {
          vec2 uv = d.xz/(y + 0.18)*1.6 + vec2(uTime*0.004, uTime*0.002);
          float c = smoothstep(0.52, 0.8, fbm(uv) + 0.25*fbm(uv*3.0));
          col = mix(col, vec3(1.0, 0.98, 0.95), c*0.55*smoothstep(0.02, 0.3, y));
        } else col = hor*0.92;
        float s = max(dot(d, uSunDir), 0.0);
        col += vec3(1.0, 0.86, 0.62)*(pow(s, 900.0)*6.0 + pow(s, 30.0)*0.35 + pow(s, 4.0)*0.08);`;
  const goldenFrag = /* glsl */`
        float sd = max(dot(d, uSunDir), 0.0);
        vec3 hz = skyHaze(d);
        vec3 midc = vec3(0.36, 0.42, 0.62), zen = vec3(0.09, 0.15, 0.36);
        vec3 col = mix(hz, midc, smoothstep(0.02, 0.34, y));
        col = mix(col, zen, smoothstep(0.32, 0.95, y));
        // the sun: a wide warm glow, a tighter halo and a soft bright disc
        col += uHazeSun*(pow(sd, 5.0)*0.5 + pow(sd, 60.0)*1.2);
        col += vec3(1.0, 0.84, 0.6)*smoothstep(0.99962, 0.99988, sd)*24.0;
        if (y > 0.0) {
          vec2 uv = d.xz/(y + 0.09);
          vec2 warp = vec2(fbm(uv*0.3 + 5.0), fbm(uv*0.3 - 3.0))*1.6;
          float c1 = fbm(uv*0.42 + warp + vec2(uTime*0.0025, 0.001*uTime));
          c1 = smoothstep(0.5, 0.78, c1 + 0.2*fbm(uv*2.1 + warp*2.0 + 1.0));
          float c2 = smoothstep(0.52, 0.84, fbm(uv*vec2(0.07, 0.3) + warp*0.4 + vec2(11.0 + uTime*0.0012, 0.0)));
          float fade = smoothstep(0.0, 0.08, y)*(1.0 - 0.6*smoothstep(0.45, 0.95, y));
          vec3 under = mix(vec3(0.46, 0.30, 0.40), vec3(1.6, 0.74, 0.34), pow(sd, 2.2));
          float edge = smoothstep(0.0, 0.35, c1)*(1.0 - smoothstep(0.35, 0.9, c1));
          vec3 cc = under*(0.85 + 0.7*pow(sd, 6.0)) + vec3(1.7, 1.05, 0.55)*edge*pow(sd, 10.0)*1.6;
          col = mix(col, cc, c1*fade*0.9);
          col = mix(col, under*1.08, c2*fade*0.62);
        } else {
          col = hz;
        }`;
  const mat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      ${NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        ${opts.golden ? goldenFrag : yardFrag}
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), mat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  return sky;
}
