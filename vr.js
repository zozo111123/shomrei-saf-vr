// vr.js - the interactive VR experience: the code-built meadow + the photoreal girl + a gatekeeper choice.
// Runs from one URL on desktop (drag to look, click), phone (gyro, tap) and a Quest browser (ENTER VR, gaze/trigger).
//   intro (her 15 s clip) -> ask (narration, three bubbles) -> wrong: feedback, she withdraws, ask again
//                                                           -> right: her reaction + closing narration -> end
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { createYard, setupRenderer, PERSON_SPOT } from './scene/index.js';
import { createPersonCard } from './scene/vrperson.js';
import { buildBench } from './scene/bench.js';
import { makeBubble, makeSubtitles, makeReticle, makeEndPanel, loadFonts } from './scene/ui.js';
import { createLook } from './controls.js';

const q = new URLSearchParams(location.search);
const DWELL = 1.8;
const OPTS = ['יהיה בסדר, אל תדאגי', 'תחשבי חיובי, יש אנשים שקשה להם יותר.', 'אני רואה שקשה לך. ספרי לי, אני כאן.'];
const RIGHT = 2;
const LINES = {
  ask: { url: 'audio/narration_01_n.mp3', text: 'היא לא אומרת מילה. מה תגידו לה?' },
  close: { url: 'audio/narration_v2_n.mp3', cues: [[0.2, 'לא לשפוט. לא להטיף.'], [3.3, 'ולא להגיד לה "יהיה בסדר".'], [6.1, 'להיות שם, ולהקשיב.'], [9.2, 'וזו רק ההתחלה.']] },
  wrong0: { url: 'audio/feedback_v2_01_n.mp3', cues: [[0.2, 'כרגע היא מרגישה שהכול לא בסדר.'], [3.2, 'המשפט "יהיה בסדר" סוגר את השיחה.'], [7.0, 'אפשר לתקן. חזרו אליה.']] },
  wrong1: { url: 'audio/feedback_v2_02_n.mp3', cues: [[0.2, 'גם הטפה בכוונה טובה אומרת לה שהכאב שלה לא נחשב.'], [5.6, 'היא תשתוק. אפשר לתקן. חזרו אליה.']] },
};

// ---------- renderer, scene, camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');            // seated: the viewer's eyes are the origin
setupRenderer(renderer);
renderer.shadowMap.autoUpdate = false;                  // the world is almost static: refresh shadows twice a second
document.body.appendChild(renderer.domElement);
const vrButton = VRButton.createButton(renderer);
document.body.appendChild(vrButton);
// on a computer or phone without a headset the button only says "VR NOT SUPPORTED": hide it there
if (!navigator.xr) vrButton.style.display = 'none';
else navigator.xr.isSessionSupported('immersive-vr').then(ok => { if (!ok) vrButton.style.display = 'none'; }).catch(() => { vrButton.style.display = 'none'; });

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 9000);
scene.add(camera);
const world = createYard({ renderer, world: 'meadow', quality: q.get('quality') || 'vr', viewHeight: innerHeight });
scene.add(world.group);

const groundY = PERSON_SPOT.seat[1] - 0.45;
const person = createPersonCard({
  sources: { intro: 'person/clip1_nb_packed.mp4', wait: 'person/wait_nb_packed.mp4', down: 'person/down_nb_packed.mp4', react: 'person/clip2_nb_packed.mp4' },
  depth: 'person/clip1_nb_depth.png', frameW: 1168, frameH: 768, frameHeightM: 1.319, groundV: 0.8984, centerU: 0.5013,
  shotCam: { height: 1.05, dist: 2.0 }, relief: 0.34, backdrop: '#83746a',
  grade: new THREE.Color(1.0, 0.93, 0.84), lift: new THREE.Color(0.035, 0.018, 0.0), spot: PERSON_SPOT, groundY,
});
scene.add(person.group);
// the footage's bench was removed from the matte; she sits on a real 3D bench built to its measurements
scene.add(buildBench({ cx: PERSON_SPOT.seat[0] + (0.5 - 0.5013) * person.frameWidthM, frontZ: PERSON_SPOT.seat[2], gy: groundY }));

// ---------- interface ----------
await loadFonts();
const bubbles = OPTS.map(t => makeBubble(t));
bubbles.forEach(b => scene.add(b));
const restart = makeBubble('מההתחלה', 0.62); scene.add(restart);
const subs = makeSubtitles(camera);
const reticle = makeReticle(camera);
const endPanel = makeEndPanel(); scene.add(endPanel);
const fader = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1, depthTest: false, depthWrite: false, toneMapped: false }));
fader.position.z = -0.3; fader.renderOrder = 50; camera.add(fader);
let fadeTarget = 1;

// ---------- sound: an ambience loop and the narrator (non-positional, it is a voice-over) ----------
const listener = new THREE.AudioListener(); camera.add(listener);
const loader = new THREE.AudioLoader();
const ambience = new THREE.Audio(listener);
const voice = {}, sfx = {};
const loadAudio = url => new Promise(ok => loader.load(url, ok, undefined, () => ok(null)));
const audioReady = Promise.all([
  loadAudio('audio/ambience.mp3').then(b => { if (b) { ambience.setBuffer(b); ambience.setLoop(true); ambience.setVolume(0.42); } }),
  ...Object.entries(LINES).map(([k, l]) => loadAudio(l.url).then(b => { if (b) { const a = new THREE.Audio(listener); a.setBuffer(b); a.setVolume(1.0); voice[k] = a; } })),
  ...['appear', 'select'].map(k => loadAudio(`audio/ui_${k}.mp3`).then(b => { if (b) { const a = new THREE.Audio(listener); a.setBuffer(b); a.setVolume(k === 'appear' ? 0.35 : 0.5); sfx[k] = a; } })),
]);
function blip(k) { const a = sfx[k]; if (!a) return; if (a.isPlaying) a.stop(); a.play(); }
let speaking = null, cueTimers = [], armed = false, offFor = 0;
function say(key, then) {
  if (speaking && speaking.isPlaying) speaking.stop();
  const a = voice[key], L = LINES[key];
  const cues = L.cues || [[0, L.text]];
  cueTimers.forEach(clearTimeout); cueTimers = cues.map(([at, txt]) => setTimeout(() => subs.set(txt), at * 1000));
  const done = () => { cueTimers.forEach(clearTimeout); subs.set(''); if (then) then(); };
  if (!a) { setTimeout(done, 3500); return; }
  a.onEnded = () => { a.isPlaying = false; done(); };
  speaking = a; a.play();
}

// ---------- the story ----------
let state = 'idle', stateT = 0, clock = 0, tries = 0, askSpoken = false;
const go = (s) => { state = s; stateT = 0; window.__vr.state = s; };
function placeUI() {
  const h = person.headWorld();
  const pos = [[h.x + 0.62, h.y + 0.06, h.z + 0.38], [h.x, h.y + 0.44, h.z + 0.38], [h.x - 0.62, h.y + 0.06, h.z + 0.38]];
  bubbles.forEach((b, i) => b.position.set(...pos[i]));
  endPanel.position.set(h.x, h.y + 0.62, h.z + 0.1);
  restart.position.set(h.x + 0.72, h.y + 0.25, h.z + 0.15);
}
function start() {
  if (state !== 'idle') return;
  placeUI();
  person.show('intro', { fade: 0.01, ended: () => ask() });
  if (ambience.buffer) ambience.play();
  fadeTarget = 0; go('intro');
}
function ask() {
  person.show('wait', { loop: true, fade: 0.25 });
  go('ask');
  armed = false; askSpoken = tries > 0;
  if (tries === 0) say('ask', () => { askSpoken = true; }); else subs.set('');
}
function choose(i) {
  if (state !== 'ask') return;
  const b = bubbles[i]; b.userData.flash = 1; blip('select');
  if (i === RIGHT) {
    go('right');
    person.show('react', { fade: 0.35, ended: () => go('end') });
    setTimeout(() => say('close'), 1600);
  } else {
    tries++; go('wrong');
    person.show('down', { loop: true, fade: 0.6 });
    say(i === 0 ? 'wrong0' : 'wrong1', () => setTimeout(() => { if (state === 'wrong') ask(); }, 700));
  }
}
function restartAll() {
  go('idle'); tries = 0; endPanel.material.opacity = 0;
  fadeTarget = 1; setTimeout(() => { fadeTarget = 0; start(); }, 900);
}

// ---------- input: gaze dwell, click / tap, controller trigger, keys 1-3 for testing ----------
const look = createLook(renderer, camera);
const ray = new THREE.Raycaster(), pos = new THREE.Vector3(), dir = new THREE.Vector3();
let gazed = null;
function activate() { if (!gazed || (gazed !== restart && !askSpoken)) return; if (gazed === restart) restartAll(); else choose(bubbles.indexOf(gazed)); }
let downX = 0, downY = 0;
renderer.domElement.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; });
renderer.domElement.addEventListener('click', e => {
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;          // that was a drag to look around
  const ndc = new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  const pr = new THREE.Raycaster(); pr.setFromCamera(ndc, camera);
  const hit = pr.intersectObjects([...bubbles.filter(b => b.userData.shown > 0.6), ...(restart.userData.shown > 0.6 ? [restart] : [])], false)[0];
  if (!hit) return;
  if (hit.object === restart) restartAll(); else if (askSpoken) choose(bubbles.indexOf(hit.object));
});
for (const i of [0, 1]) { const c = renderer.xr.getController(i); c.addEventListener('select', activate); scene.add(c); }
addEventListener('keydown', e => { if (e.key >= '1' && e.key <= '3') choose(+e.key - 1); });

// ---------- start: the button (desktop / phone) or entering VR ----------
const startEl = document.getElementById('start');
async function begin() {
  await look.requestSensors();
  listener.context.resume();
  person.unlock();
  startEl.style.display = 'none';
  await audioReady;
  start();
}
document.getElementById('go').addEventListener('click', begin);
vrButton.addEventListener('click', () => { listener.context.resume(); person.unlock(); });
renderer.xr.addEventListener('sessionstart', () => { if (state === 'idle') begin(); });

// test hooks
window.__vr = { state, choose, start: begin, get gazed() { return gazed ? (gazed === restart ? 'restart' : bubbles.indexOf(gazed)) : null; }, look: (y, p) => look.look(y, p), person };

// ---------- frame loop ----------
let last = null, shadowT = 0;
renderer.setAnimationLoop((ms) => {
  const now = ms / 1000, dt = last === null ? 0 : Math.min(0.1, now - last); last = now;
  clock += dt; stateT += dt;
  if (!renderer.xr.isPresenting) look.update();
  world.update(clock, camera);
  person.update(dt);
  subs.update(dt);
  fader.material.opacity += (fadeTarget - fader.material.opacity) * Math.min(1, dt * 2.2);
  shadowT -= dt; if (shadowT <= 0) { renderer.shadowMap.needsUpdate = true; shadowT = 0.5; }

  // bubbles: appear one after another while asking, face the viewer, glow when chosen
  camera.getWorldPosition(pos);
  bubbles.forEach((b, i) => {
    const want = state === 'ask' && stateT > (tries === 0 ? 2.2 : 0.4) + 0.35 * i ? 1 : 0;
    if (want && !b.userData.wanted) blip('appear');
    b.userData.wanted = want;
    b.userData.shown += (want - b.userData.shown) * Math.min(1, dt * (want ? 4 : 3));
    b.material.opacity = b.userData.shown;
    b.lookAt(pos);
    b.userData.flash = Math.max(0, (b.userData.flash || 0) - dt * 0.8);
  });
  const endOn = state === 'end' ? 1 : 0;
  endPanel.material.opacity += (endOn - endPanel.material.opacity) * Math.min(1, dt * 1.5); endPanel.lookAt(pos);
  restart.userData.shown += ((state === 'end' && stateT > 1.5 ? 1 : 0) - restart.userData.shown) * Math.min(1, dt * 3);
  restart.material.opacity = restart.userData.shown; restart.lookAt(pos);

  // gaze: what is in the centre of the view
  camera.getWorldDirection(dir); ray.set(pos, dir);
  const targets = [...bubbles.filter(b => b.userData.shown > 0.6), ...(restart.userData.shown > 0.6 ? [restart] : [])];
  const hit = ray.intersectObjects(targets, false)[0];
  const g = hit ? hit.object : null;
  if (g !== gazed) { if (gazed) { gazed.userData.dwell = 0; } gazed = g; }
  offFor = g ? 0 : offFor + dt; if (offFor > 0.3) armed = true;      // re-arm only after the eyes leave every bubble
  for (const b of [...bubbles, restart]) {
    const live = b === gazed && (armed || b === restart) && (b === restart || askSpoken) && b.userData.shown > 0.95;
    if (live) b.userData.dwell += dt; else if (b !== gazed) b.userData.dwell = 0;
    const p = live ? Math.max(0, Math.min(1, (b.userData.dwell - 0.4) / (DWELL - 0.4))) : 0;
    const glow = Math.max(b === gazed ? 0.35 : 0, b.userData.flash || 0);
    const key = `${p.toFixed(2)}|${glow.toFixed(2)}`;
    if (b.userData.key !== key) { b.userData.key = key; b.userData.draw(p, glow); }
  }
  if (gazed && gazed.userData.dwell >= DWELL) { gazed.userData.dwell = 0; armed = false; activate(); }
  reticle.material.opacity = gazed ? 0.95 : 0.5; reticle.scale.setScalar(gazed ? 1.5 : 1);

  renderer.render(scene, camera);
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
if (q.has('autostart')) begin();
