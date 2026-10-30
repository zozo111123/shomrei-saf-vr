// girl.js - the student, sculpted in code (signed distance functions -> meshes), with living eyes:
// eyeballs that turn to whoever she looks at, lids that blink and droop with her gaze, a head that follows
// her eyes, breathing, and a small behaviour model (looks down; glances up; meets your eyes if you keep
// looking at her, then looks away). Body frame: origin = where she sits on the table edge, +z toward the viewer.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { sphere, ellipsoid, capsule, roundBox, tube, smax, xform, rotPoint, compose, surfaceNets } from './sdf.js';
import { M, makeMat } from './mat.js';
import { SEAT } from './props.js';

const SKIN = { color: '#d4a284', id: M.skin }, LIP = { color: '#b8675f', id: M.lip }, HAIR = { color: '#2a1b14', id: M.hair };
const BROW = { color: '#30221a', id: M.hair }, TEE = { color: '#cfd3c1', id: M.tee }, DENIM = { color: '#2d3a57', id: M.denim };
const SHOE = { color: '#1d1c20', id: M.shoe }, SOLE = { color: '#d8d2c6', id: M.plain }, SOCK = { color: '#ebe8e0', id: M.fabric };

const LEAN = 0.2, PIV = [0, 0.08, -0.06];
const lean = p => rotPoint(p, { pivot: PIV, rot: [LEAN, 0, 0] });
const leaned = f => xform(f, { pivot: PIV, rot: [LEAN, 0, 0] });
const NECK = lean([0, 0.585, -0.045]);          // head pivot (top of the neck) in the body frame
const HEAD_REST = [0.12, 0, 0];                 // the head's rest pose: a little bowed
const headPt = p => rotPoint(p, { rot: HEAD_REST, move: NECK });
const EYE = [[-0.031, 0.117, 0.0615], [0.031, 0.117, 0.0615]];   // eyeball centres in the head frame
const EYE_R = 0.0128;

function torsoMat(p) {
  const [x, y, z] = rotPoint(p, { pivot: PIV, rot: [-LEAN, 0, 0] });
  const ax = Math.abs(x);
  if (y < 0.27) return DENIM;
  if (z > -0.06 && y < 0.405 && ax < 0.115) return DENIM;      // the bib of the pinafore
  if (ax > 0.07 && ax < 0.112 && y < 0.5) return DENIM;        // straps over the shoulders
  if (z < -0.06 && y < 0.32) return DENIM;                     // the back of the dress
  return TEE;
}

function bodyShape() {
  const P = [], add = (d, mat, k = 0.02, o = {}) => P.push({ d, mat, k, ...o });
  // torso, sculpted upright then leaned forward
  add(leaned(ellipsoid([0, 0.10, -0.07], [0.165, 0.105, 0.12])), torsoMat, 0);
  add(leaned(ellipsoid([0, 0.22, -0.06], [0.128, 0.10, 0.092])), torsoMat, 0.05);
  add(leaned(ellipsoid([0, 0.35, -0.058], [0.142, 0.12, 0.095])), torsoMat, 0.05);
  add(leaned(ellipsoid([0, 0.425, -0.062], [0.15, 0.07, 0.085])), torsoMat, 0.04);
  add(leaned(capsule([-0.148, 0.452, -0.066], [0.148, 0.452, -0.066], 0.05)), torsoMat, 0.05);
  add(leaned(capsule([0, 0.44, -0.062], [0, 0.6, -0.05], 0.041, 0.037)), SKIN, 0.03);
  // the skirt of the pinafore over the thighs
  add(roundBox([0, 0.088, 0.115], [0.19, 0.064, 0.22], 0.05), DENIM, 0.03);
  add(capsule([-0.15, 0.074, 0.33], [0.15, 0.074, 0.33], 0.034), DENIM, 0.02);
  for (const s of [-1, 1]) {
    // arm: shoulder -> elbow resting near the knee -> wrist toward the clasped hands
    const S = lean([s * 0.163, 0.445, -0.066]), E = [s * 0.165, 0.178, 0.255], W = [s * 0.046, 0.166, 0.455];
    add(capsule(S, E, 0.043, 0.035), SKIN, 0.015);
    add(capsule(S, S.map((v, i) => v + (E[i] - v) * 0.42), 0.051, 0.046), TEE, 0.006);
    add(sphere(E, 0.036), SKIN, 0.012);
    add(capsule(E, W, 0.034, 0.025), SKIN, 0.01);
    // leg: thigh on the table, knee, shin down to the bench, sock, shoe
    add(capsule([s * 0.085, 0.072, -0.03], [s * 0.095, 0.085, 0.40], 0.074, 0.055), SKIN, 0.03);
    add(sphere([s * 0.095, 0.083, 0.418], 0.051), SKIN, 0.02);
    add(capsule([s * 0.095, 0.07, 0.43], [s * 0.1, -0.235, 0.462], 0.047, 0.031), SKIN, 0.02);
    add(ellipsoid([s * 0.095, -0.03, 0.413], [0.043, 0.085, 0.044]), SKIN, 0.03);
    add(capsule([s * 0.1, -0.205, 0.462], [s * 0.1, -0.262, 0.463], 0.034, 0.034), SOCK, 0.004);
    const shoeA = capsule([s * 0.1, -0.272, 0.432], [s * 0.103, -0.28, 0.635], 0.043, 0.035), shoeB = sphere([s * 0.1, -0.258, 0.452], 0.04);
    add(p => smax(Math.min(shoeA(p), shoeB(p)), -(p[1] + 0.302), 0.004), SHOE, 0.006);
    add(roundBox([s * 0.1, -0.304, 0.533], [0.046, 0.009, 0.122], 0.008), SOLE, 0.003);
  }
  // long hair down her back and two locks falling forward over the shoulders
  add(leaned(ellipsoid([0, 0.43, -0.165], [0.112, 0.16, 0.052])), HAIR, 0.03);
  add(leaned(capsule([0, 0.5, -0.15], [0, 0.29, -0.16], 0.075, 0.05)), HAIR, 0.03);
  add(capsule(headPt([0, 0.13, -0.07]), lean([0, 0.47, -0.16]), 0.07, 0.06), HAIR, 0.03);
  for (const s of [-1, 1]) {
    add(tube([headPt([s * 0.07, 0.085, -0.005]), lean([s * 0.118, 0.475, -0.01]), lean([s * 0.122, 0.40, 0.032]), lean([s * 0.11, 0.33, 0.043])], [0.026, 0.03, 0.026, 0.015]), HAIR, 0.012);
    add(tube([headPt([s * 0.06, 0.07, -0.03]), lean([s * 0.1, 0.47, -0.05]), lean([s * 0.14, 0.38, -0.02])], [0.022, 0.026, 0.016]), HAIR, 0.012);
  }
  return compose(P);
}

function headShape() {
  const P = [], add = (d, mat, k = 0.02, o = {}) => P.push({ d, mat, k, ...o });
  add(ellipsoid([0, 0.14, -0.012], [0.074, 0.09, 0.088]), SKIN, 0);
  add(ellipsoid([0, 0.095, 0.018], [0.064, 0.078, 0.07]), SKIN, 0.03);
  add(ellipsoid([0, 0.055, 0.03], [0.052, 0.04, 0.056]), SKIN, 0.025);
  add(ellipsoid([0, 0.034, 0.06], [0.022, 0.018, 0.018]), SKIN, 0.02);
  for (const s of [-1, 1]) add(ellipsoid([s * 0.038, 0.088, 0.058], [0.026, 0.022, 0.02]), SKIN, 0.02);
  add(capsule([0, -0.04, -0.012], [0, 0.07, -0.005], 0.038), SKIN, 0.03);
  // nose: bridge, tip, wings
  add(capsule([0, 0.13, 0.078], [0, 0.1, 0.094], 0.0072, 0.0105), SKIN, 0.012);
  add(sphere([0, 0.0985, 0.0935], 0.011), SKIN, 0.008);
  for (const s of [-1, 1]) add(sphere([s * 0.0115, 0.0935, 0.086], 0.0085), SKIN, 0.008);
  add(capsule([-0.045, 0.137, 0.066], [0.045, 0.137, 0.066], 0.009), SKIN, 0.02);
  // lips (corners a little down)
  add(capsule([-0.0165, 0.0695, 0.0825], [0.0165, 0.0695, 0.0825], 0.0052), LIP, 0.004);
  add(sphere([0, 0.0712, 0.0858], 0.0042), LIP, 0.003);
  add(capsule([-0.0135, 0.0605, 0.0795], [0.0135, 0.0605, 0.0795], 0.0062), LIP, 0.004);
  add(capsule([-0.019, 0.066, 0.083], [0.019, 0.066, 0.083], 0.0014), LIP, 0.002, { cut: true });
  for (const s of [-1, 1]) {
    const [ex, ey, ez] = EYE[s < 0 ? 0 : 1];
    add(ellipsoid([ex, ey, ez + 0.008], [0.0165, 0.0095, 0.012]), SKIN, 0.004, { cut: true });           // the eye opening
    add(capsule([ex - 0.012, ey - 0.0075, 0.0735], [ex + 0.012, ey - 0.0065, 0.0725], 0.0021), SKIN, 0.003); // lower lid rim
    add(capsule([ex - 0.012, ey + 0.0135, 0.0725], [ex + 0.013, ey + 0.0125, 0.0705], 0.0024), SKIN, 0.004); // upper lid fold
    add(tube([[s * 0.017, 0.1375, 0.0755], [s * 0.032, 0.1415, 0.0765], [s * 0.049, 0.137, 0.068]], [0.0028, 0.0026, 0.0018]), BROW, 0.003);
    add(ellipsoid([s * 0.073, 0.115, -0.003], [0.011, 0.026, 0.017]), SKIN, 0.008);
  }
  // hair: a cap with a face opening and a middle part, curtain bangs, side curtains to the jaw
  const cap = ellipsoid([0, 0.148, -0.014], [0.0845, 0.1005, 0.099]);
  const win = ellipsoid([0, 0.088, 0.088], [0.067, 0.093, 0.072]);
  const part = capsule([0, 0.252, 0.05], [0, 0.246, -0.05], 0.003);
  add(p => smax(smax(cap(p), -win(p), 0.01), -part(p), 0.003), HAIR, 0.006);
  for (const s of [-1, 1]) {
    add(tube([[s * 0.004, 0.235, 0.032], [s * 0.03, 0.212, 0.06], [s * 0.056, 0.175, 0.064], [s * 0.07, 0.13, 0.055]], [0.009, 0.012, 0.011, 0.008]), HAIR, 0.012);
    add(ellipsoid([s * 0.078, 0.07, -0.01], [0.024, 0.08, 0.055]), HAIR, 0.015);
  }
  return compose(P);
}

function handsShape() {
  const P = [], add = (d, k = 0.006) => P.push({ d, mat: SKIN, k });
  for (const s of [-1, 1]) {
    add(capsule([s * 0.047, 0.166, 0.452], [s * 0.02, 0.165, 0.472], 0.024, 0.021), 0);
    add(ellipsoid([s * 0.0175, 0.163, 0.492], [0.0125, 0.036, 0.041]), 0.012);
    for (let i = 0; i < 4; i++) {
      const y0 = 0.19 - i * 0.0155 + (s > 0 ? -0.0078 : 0), f = i === 3 ? 0.85 : 1;
      add(tube([[s * 0.017, y0, 0.526], [-s * 0.002, y0 - 0.003, 0.549], [-s * 0.024, y0 - 0.006, 0.537], [-s * 0.03, y0 - 0.008, 0.515]],
        [0.0085 * f, 0.0078 * f, 0.007 * f, 0.0062 * f]), 0.005);
    }
    const up = s > 0 ? 0.004 : 0;
    add(tube([[s * 0.024, 0.186 + up, 0.47], [s * 0.012, 0.203 + up, 0.494], [-s * 0.004, 0.206 + up, 0.512]], [0.011, 0.0095, 0.0085]), 0.006);
  }
  return compose(P);
}

function eyeTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#efe8e1'; g.fillRect(0, 0, 512, 256);
  const cx = 128, cy = 128, R = 27;                    // +z of a three.js sphere is u = 0.25, v = 0.5
  let gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
  gr.addColorStop(0, '#2a1a10'); gr.addColorStop(0.35, '#6b4428'); gr.addColorStop(0.8, '#5a3820'); gr.addColorStop(1, '#2b1a0e');
  g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 90; i++) {                       // iris fibres
    const a = i / 90 * Math.PI * 2;
    g.strokeStyle = i % 3 ? 'rgba(150,105,60,0.35)' : 'rgba(30,18,10,0.4)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10); g.lineTo(cx + Math.cos(a) * (R - 2), cy + Math.sin(a) * (R - 2)); g.stroke();
  }
  g.strokeStyle = '#1e130b'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R - 1, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#070505'; g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(cx + 7, cy - 8, 3.2, 2.6, 0, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** builds her and returns { group, update(t, camera), timings } */
export function buildGirl(renderer) {
  const tm = {}, clock = d => { const a = Date.UTC(2026, 0); return a; };
  const mat = makeMat({ roughness: 0.6 });
  const body = new THREE.Group(); body.position.set(...SEAT);
  const mk = (shape, bounds, h) => { const m = new THREE.Mesh(surfaceNets(shape, bounds, h), mat); m.castShadow = true; m.receiveShadow = true; return m; };
  const bodyMesh = mk(bodyShape(), [-0.27, -0.33, -0.27, 0.27, 0.72, 0.7], 0.0072);
  const handMesh = mk(handsShape(), [-0.085, 0.115, 0.43, 0.085, 0.228, 0.572], 0.0028);
  body.add(bodyMesh, handMesh);

  const head = new THREE.Group(); head.position.set(...NECK); head.rotation.order = 'YXZ'; head.rotation.set(...HEAD_REST);
  head.add(mk(headShape(), [-0.115, -0.05, -0.13, 0.115, 0.27, 0.125], 0.0031));
  body.add(head);

  // eyes: eyeball (painted iris, studio reflections), an upper lid that blinks, a lash line on the lid edge
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTexture(), roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03, envMap: env, envMapIntensity: 0.55 });
  const lidMat = makeMat({ roughness: 0.6, vertexColors: false, color: SKIN.color, aMat: M.skin });
  const lashMat = new THREE.MeshStandardMaterial({ color: 0x120c09, roughness: 0.9 });
  const eyes = EYE.map(([x, y, z]) => {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(EYE_R, 32, 24), eyeMat); ball.rotation.order = 'YXZ';
    ball.position.set(x, y, z);
    const lid = new THREE.Group(); lid.position.set(x, y, z); lid.rotation.order = 'YXZ';
    const shell = new THREE.Mesh(new THREE.SphereGeometry(EYE_R + 0.0007, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
    const lash = new THREE.Mesh(new THREE.TorusGeometry(EYE_R + 0.0009, 0.00075, 4, 24, Math.PI).rotateX(Math.PI / 2), lashMat);
    lid.add(shell, lash);
    head.add(ball, lid);
    return { ball, lid };
  });

  // ---------- behaviour ----------
  const st = { t: null, eyeYaw: 0, eyePitch: -0.35, headYaw: 0, headPitch: HEAD_REST[0], stare: 0, mode: 'down', modeUntil: 0, blink: -9, nextBlink: 2.2, nextGlance: 6.5 };
  const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const handsW = new THREE.Vector3(), camP = new THREE.Vector3(), camF = new THREE.Vector3(), tgt = new THREE.Vector3(), v = new THREE.Vector3();
  const headW = new THREE.Vector3();
  let script = null;   // optional: (t) => 'down' | 'viewer' | 'side' (a scripted performance for the film)

  function update(t, camera) {
    const dt = st.t === null ? 0 : Math.min(0.1, Math.max(0, t - st.t)); st.t = t;
    // breathing: about 15 breaths a minute, the chest rises a few millimetres
    const br = Math.sin(t * Math.PI * 2 / 4.1);
    body.scale.set(1 + 0.0025 * br, 1 + 0.0045 * br, 1 + 0.004 * br);
    camera.getWorldPosition(camP); camera.getWorldDirection(camF);
    head.getWorldPosition(headW);
    // does the viewer look at her face?
    v.copy(headW).add(new THREE.Vector3(0, 0.12, 0)).sub(camP).normalize();
    const looked = camF.dot(v) > Math.cos(0.14);
    st.stare = looked ? st.stare + dt : Math.max(0, st.stare - dt * 2);
    let mode = st.mode;
    if (script) mode = script(t);
    else {
      if (t > st.modeUntil) mode = 'down';
      if (mode === 'down' && st.stare > 2.2) { mode = 'viewer'; st.modeUntil = t + 2.4; st.stare = -1.5; st.blink = t; }
      else if (mode === 'viewer' && t > st.modeUntil - 0.6) { mode = 'side'; st.modeUntil = t + 1.4; }
      else if (mode === 'down' && t > st.nextGlance) { mode = 'viewer'; st.modeUntil = t + 1.3; st.nextGlance = t + 7 + 5 * hash(Math.floor(t)); }
    }
    if (mode !== st.mode) { st.mode = mode; st.blink = t; }
    // the target she looks at, in world space
    if (mode === 'viewer') tgt.copy(camP);
    else if (mode === 'side') tgt.set(SEAT[0] - 3.5, SEAT[1] - 0.2, SEAT[2] + 1.2);
    else body.localToWorld(handsW.set(0, 0.16, 0.5)), tgt.copy(handsW).add(new THREE.Vector3(0, -0.05, 0.05));
    // direction from the head to the target, in the BODY frame (the head turns toward it, partly)
    const local = body.worldToLocal(tgt.clone()).sub(new THREE.Vector3(...NECK).add(new THREE.Vector3(0, 0.11, 0.04)));
    const yawT = Math.atan2(local.x, local.z), pitchT = -Math.atan2(local.y, Math.hypot(local.x, local.z));
    const kH = 1 - Math.exp(-dt / 0.45);
    st.headYaw += (THREE.MathUtils.clamp(yawT * 0.55, -0.6, 0.6) - st.headYaw) * kH;
    st.headPitch += (THREE.MathUtils.clamp(pitchT * 0.6 + 0.04, -0.15, 0.5) - st.headPitch) * kH;
    const idle = 0.02 * Math.sin(t * 0.37) + 0.012 * Math.sin(t * 0.91 + 1.3);
    head.rotation.set(st.headPitch + idle * 0.5, st.headYaw + idle, 0.04 * Math.sin(t * 0.23) + 0.03);
    // eyes: the rest of the way, fast (saccades), in the head frame
    head.updateWorldMatrix(true, false);
    const kE = 1 - Math.exp(-dt / 0.045);
    let eyeYawSum = 0, eyePitchSum = 0;
    for (const e of eyes) {
      const p = head.worldToLocal(tgt.clone()).sub(e.ball.position);
      const y = THREE.MathUtils.clamp(Math.atan2(p.x, p.z), -0.55, 0.55), pu = THREE.MathUtils.clamp(Math.atan2(p.y, Math.hypot(p.x, p.z)), -0.5, 0.4);
      eyeYawSum += y; eyePitchSum += pu;
      e.ball.rotation.y += (y - e.ball.rotation.y) * kE;
      e.ball.rotation.x += (-pu - e.ball.rotation.x) * kE;
    }
    const pu = eyePitchSum / 2;
    // lids: open edge follows the gaze (lower when looking down), plus blinks
    if (t > st.nextBlink) { st.blink = t; st.nextBlink = t + 2.6 + 3.2 * hash(Math.floor(t * 3)); }
    const bp = (t - st.blink) / 0.16, closed = bp >= 0 && bp < 1 ? Math.sin(bp * Math.PI) : 0;
    const open = 0.3 + 0.75 * Math.min(0, pu) + 0.2 * Math.max(0, pu);
    const a = open + (-0.75 - open) * closed;
    for (const e of eyes) { e.lid.rotation.x = -a; e.lid.rotation.y = e.ball.rotation.y * 0.35; }
  }

  return { group: body, update, setScript(fn) { script = fn; }, meshes: { bodyMesh, handMesh }, head };
}
