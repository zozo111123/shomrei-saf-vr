// sim.js - the full gatekeeper simulation: a branching conversation with the girl on the bench.
// The whole conversation lives in story/graph.json (texts, clips, voice lines, branches); this file only plays it.
//
// graph.json:
//   clips:  { id: "person/x_packed.mp4" }                       her video clips (2.5D card, packed colour+alpha)
//   lines:  { id: { src, who: "her"|"narr", text | cues:[[s, text]] } }   voice lines with subtitles
//   stages: ["זיהוי", "הקשבה", ...]                              the strip above her
//   start:  node id;  trustStart: number;  trustRange?: [min, max]  (trust is clamped to it when given)
//   nodes:  { id: { stage, beats:[beat], idle, prompt?, options?:[option] (1 to 3), coach?, next? } }
//     beat:   { clip?, loop?, line?, hold? } | { black: s }   a clip and/or a line, done when both end (or after hold s);
//             black: fade to black, wait s seconds, fade back
//     option: { text, kind: "best"|"wrong"|"miss"|"silence", trust | trustSet, beats:[beat], next: id | "retry" | [{if, go}] }
//     next:   id | [{ if: "trust>=2", go: id }, { go: id }]      the first matching rule wins
//   debrief: { title, rows:[{ label, nodes:[ids], ok, retry }], footer:[...] }
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { createYard, setupRenderer, PERSON_SPOT } from './scene/index.js';
import { createPersonCard } from './scene/vrperson.js';
import { buildBench } from './scene/bench.js';
import { makeBubble, makeSubtitles, makeReticle, makeStageStrip, makeDebrief, makeTextPanel, loadFonts } from './scene/ui.js';
import { createLook } from './controls.js';

const q = new URLSearchParams(location.search);
const G = await (await fetch(q.get('story') || 'story/graph.json')).json();
const DWELL = 1.8;

// ---------- renderer, scene, camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');
setupRenderer(renderer);
renderer.shadowMap.autoUpdate = false;
document.body.appendChild(renderer.domElement);
const vrButton = VRButton.createButton(renderer);
document.body.appendChild(vrButton);
if (!navigator.xr) vrButton.style.display = 'none';
else navigator.xr.isSessionSupported('immersive-vr').then(ok => { if (!ok) vrButton.style.display = 'none'; }).catch(() => { vrButton.style.display = 'none'; });

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 9000);
scene.add(camera);
const world = createYard({ renderer, world: 'meadow', quality: q.get('quality') || 'vr', viewHeight: innerHeight });
scene.add(world.group);

const groundY = PERSON_SPOT.seat[1] - 0.45;
const person = createPersonCard({
  sources: {}, pool: true,
  depth: G.depth || 'person/clip1_nb_depth.png', frameW: 1168, frameH: 768, frameHeightM: 1.319, groundV: 0.8984, centerU: 0.5013,
  shotCam: { height: 1.05, dist: 2.0 }, relief: 0.34, backdrop: '#83746a',
  grade: new THREE.Color(1.0, 0.93, 0.84), lift: new THREE.Color(0.035, 0.018, 0.0), spot: PERSON_SPOT, groundY,
});
// every clip is downloaded whole before the start (~90 MB), so the conversation never waits for the network
const loadEl = document.getElementById('loading');
const clipsReady = (async () => {
  const ids = Object.keys(G.clips), sizes = {}, got = {};
  const show = () => { const t = Object.values(sizes).reduce((a, b) => a + b, 0), d = Object.values(got).reduce((a, b) => a + b, 0);
    if (loadEl) loadEl.textContent = `טוען את הסימולציה... ${Math.round(100 * d / Math.max(t, 1))}%`; };
  await Promise.all(ids.map(async id => {
    const r = await fetch(G.clips[id]);
    if (!r.ok) throw new Error(`clip ${id}: ${r.status} ${G.clips[id]}`);
    sizes[id] = +r.headers.get('content-length') || 0; got[id] = 0;
    const rd = r.body.getReader(), parts = [];
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got[id] += value.length; show(); }
    person.add(id, URL.createObjectURL(new Blob(parts, { type: 'video/mp4' })));
  }));
  if (loadEl) loadEl.textContent = '';
  for (const b of document.querySelectorAll('.go')) b.disabled = false;
})();
scene.add(person.group);
scene.add(buildBench({ cx: PERSON_SPOT.seat[0] + (0.5 - 0.5013) * person.frameWidthM, frontZ: PERSON_SPOT.seat[2], gy: groundY }));

// ---------- interface ----------
await loadFonts();
const bubbles = [0, 1, 2].map(() => makeBubble(' '));
bubbles.forEach(b => scene.add(b));
const restart = makeBubble('מההתחלה', 0.62); scene.add(restart);
const subs = makeSubtitles(camera);
const reticle = makeReticle(camera);
const strip = makeStageStrip(G.stages); scene.add(strip);
let debrief = null;
const fader = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1, depthTest: false, depthWrite: false, toneMapped: false }));
fader.position.z = -0.3; fader.renderOrder = 50; camera.add(fader);
let fadeTarget = 1;
// leaving at any moment: a small button low in the view, then a neutral screen (no bench, no meadow) with help
const exitBtn = makeBubble('יציאה', 0.2, 380); exitBtn.position.set(0.6, -0.64, -1.5); exitBtn.renderOrder = 45; camera.add(exitBtn);
const exitPanel = makeTextPanel(['עצרתם. זה בסדר.', 'אם משהו התעורר בכם, אפשר לדבר:', 'ער"ן 1201 · סה"ר sahar.org.il · היועצת או מנחה המפגש', 'בחירום: מד"א 101']);
exitPanel.position.set(0, 0.12, -1.6); exitPanel.userData.shown = 0; camera.add(exitPanel);
const backBtn = makeBubble('לחזור לשיחה', 0.4, 560), endBtn = makeBubble('לסיים', 0.28, 380);
backBtn.position.set(0.26, -0.3, -1.6); endBtn.position.set(-0.24, -0.3, -1.6);
for (const b of [backBtn, endBtn]) { b.renderOrder = 61; camera.add(b); }
// the bubbles speak to her in the viewer's grammatical gender (chosen on the start screen): "יכול/ה" -> יכול | יכולה
let gender = 'm';
const SOFIT = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };          // a final letter before a suffix: מבין -> מבינה
const gz = t => t.replace(/(\S+?)\/(ת|ה)(?=[\s.,!?]|$)/g, (m, a, b) => gender === 'f' ? a.slice(0, -1) + (SOFIT[a.at(-1)] ?? a.at(-1)) + b : a);

// ---------- sound: ambience, the narrator (voice-over) and her voice (from where she sits) ----------
const listener = new THREE.AudioListener(); camera.add(listener);
const loader = new THREE.AudioLoader();
const ambience = new THREE.Audio(listener);
const herVoice = new THREE.PositionalAudio(listener); herVoice.setRefDistance(1.2); herVoice.setRolloffFactor(0.6);
const narrVoice = new THREE.Audio(listener);
const buffers = {}, sfx = {}, audioLog = [];
const loadAudio = url => new Promise((ok, bad) => loader.load(url, ok, undefined, () => bad(new Error('audio failed: ' + url))));
const lineBuffer = id => buffers[id] ??= loadAudio(G.lines[id].src);
const audioReady = Promise.all([
  loadAudio('audio/ambience.mp3').then(b => { ambience.setBuffer(b); ambience.setLoop(true); ambience.setVolume(0.36); }),
  ...['appear', 'select'].map(k => loadAudio(`audio/ui_${k}.mp3`).then(b => { const a = new THREE.Audio(listener); a.setBuffer(b); a.setVolume(k === 'appear' ? 0.35 : 0.5); sfx[k] = a; })),
  ...Object.keys(G.lines).map(lineBuffer),
]);
function blip(k) { const a = sfx[k]; if (a.isPlaying) a.stop(); a.play(); audioLog.push({ src: `audio/ui_${k}.mp3`, at: Date.now() }); }

let cueTimers = [];
async function playLine(id) {
  const L = G.lines[id];
  if (!L) throw new Error('unknown line: ' + id);
  const buf = await lineBuffer(id);
  const a = L.who === 'her' ? herVoice : narrVoice;
  if (a.isPlaying) a.stop();
  a.setBuffer(buf); a.setVolume(L.who === 'her' ? 1.0 : 0.95);
  const cues = L.cues || [[0, L.text]];
  cueTimers.forEach(clearTimeout); cueTimers = cues.map(([at, txt]) => setTimeout(() => subs.set(txt), at * 1000));
  audioLog.push({ src: L.src, at: Date.now() });            // for recording a play-through (tools/simtest.py --record)
  return new Promise(ok => { a.onEnded = () => { a.isPlaying = false; cueTimers.forEach(clearTimeout); subs.set(''); ok(); }; a.play(); });
}
function stopVoices() { for (const a of [herVoice, narrVoice]) if (a.isPlaying) a.stop(); cueTimers.forEach(clearTimeout); subs.set(''); }

// ---------- the story ----------
let state = 'idle', stateT = 0, clock = 0, run = 0;
let node = null, trust = 0, wrongStreak = 0, choiceOpen = false, shown = [];   // shown: the options on the bubbles, in bubble order
const record = {};          // node id -> choices, in order: { kind, text, trust (after the choice), dt (decision time, s) }
const trustLog = [];        // every choice in order: { node, kind, text, trust } (trust after the choice), for the debrief curve
const go = s => { state = s; stateT = 0; window.__sim.state = s; };
const sleep = s => new Promise(ok => setTimeout(ok, s * 1000));

function placeUI() {
  const h = person.headWorld();
  const pos = [[h.x + 0.66, h.y + 0.04, h.z + 0.38], [h.x, h.y + 0.46, h.z + 0.38], [h.x - 0.66, h.y + 0.04, h.z + 0.38]];
  bubbles.forEach((b, i) => b.position.set(...pos[i]));
  strip.position.set(h.x, h.y + 0.86, h.z + 0.05);
  restart.position.set(h.x + 0.78, h.y - 0.1, h.z + 0.3);
}

// one beat: a clip and/or a line, together. The clip's lips are synced to the line, so both start at once.
async function playBeat(b, my) {
  if (b.black != null) {
    fadeTarget = 1; await sleep(b.black); fadeTarget = 0;
    if (my !== run) throw new Error('stale');
    return;
  }
  const waits = [];
  if (b.clip) {
    const loop = !!b.loop;            // a looping clip runs under the line (or the hold) and does not end the beat
    if (loop) person.show(b.clip, { loop: true, fade: b.fade ?? 0.3 });
    else waits.push(new Promise(ok => person.show(b.clip, { fade: b.fade ?? 0.3, ended: ok })));
  }
  if (b.line) waits.push(playLine(b.line));
  if (b.hold) waits.push(sleep(b.hold));
  await Promise.all(waits);
  if (my !== run) throw new Error('stale');            // a restart happened meanwhile
}
async function playBeats(beats, my) { for (const b of beats || []) await playBeat(b, my); }

function resolveNext(next) {
  if (typeof next === 'string') return next;
  for (const r of next) {
    if (!r.if) return r.go;
    const m = r.if.match(/^trust\s*(>=|<=|>|<|==)\s*(-?\d+)$/);
    if (!m) throw new Error('bad rule: ' + r.if);
    const v = +m[2], ok = { '>=': trust >= v, '<=': trust <= v, '>': trust > v, '<': trust < v, '==': trust === v }[m[1]];
    if (ok) return r.go;
  }
  throw new Error('no rule matched');
}

async function enter(id, my) {
  node = G.nodes[id];
  if (!node) throw new Error('unknown node: ' + id);
  window.__sim.node = id;
  if (node.stage != null) strip.userData.set(node.stage);
  go('play');
  await playBeats(node.beats, my);
  if (node.options) await openChoice(id, my, true);
  else if (node.next) await enter(resolveNext(node.next), my);
  else await finish(my);
}

async function openChoice(id, my, first) {
  if (node.idle) person.show(node.idle, { loop: true, fade: 0.3 });
  if (first && node.prompt) await playLine(node.prompt);
  if (my !== run) return;
  // the options are shuffled per visit, so the position never gives the answer away.
  // 1 to 3 options; the bubble slots used: 1 -> centre, 2 -> the two sides, 3 -> all. An empty slot stays hidden.
  const n = node.options.length;
  if (n < 1 || n > 3) throw new Error(`node ${id} has ${n} options`);
  const slots = { 1: [1], 2: [0, 2], 3: [0, 1, 2] }[n];
  const order = [...node.options.keys()].sort(() => Math.random() - 0.5);
  shown = [null, null, null];
  slots.forEach((s, k) => { shown[s] = node.options[order[k]]; });
  bubbles.forEach((b, i) => { if (shown[i]) b.userData.setText(gz(shown[i].text)); });
  choiceOpen = true; armed = false; go('ask');
}

async function choose(i) {
  if (state !== 'ask' || !choiceOpen || !shown[i]) return;   // !shown[i]: an empty slot (keys 1-3 in testing)
  choiceOpen = false;
  const my = run, opt = shown[i], id = window.__sim.node, dt = stateT;
  bubbles[i].userData.flash = 1; blip('select');
  if (opt.trustSet != null) trust = opt.trustSet;
  else trust += opt.trust || 0;
  if (G.trustRange) trust = Math.min(G.trustRange[1], Math.max(G.trustRange[0], trust));
  window.__sim.trust = trust;
  (record[id] ??= []).push({ kind: opt.kind, text: opt.text, trust, dt });
  trustLog.push({ node: id, kind: opt.kind, text: opt.text, trust });
  if (opt.kind === 'best') wrongStreak = 0;
  else if (opt.kind !== 'silence') wrongStreak++;
  go('react');
  try {
    await playBeats(opt.beats, my);
    if (opt.next === 'retry') {
      if (wrongStreak >= 2 && node.coach) await playLine(node.coach);
      if (my !== run) return;
      await openChoice(id, my, false);
    } else await enter(resolveNext(opt.next), my);
  } catch (e) { if (e.message !== 'stale') throw e; }
}

async function finish(my) {
  strip.userData.set(-1);
  const rows = G.debrief.rows.map(r => {
    const first = r.nodes.map(n => (record[n] || [])[0]).filter(Boolean);
    const ok = first.length > 0 && first.every(c => c.kind === 'best');
    return { label: r.label, ok, note: ok ? r.ok : r.retry };
  });
  if (debrief) scene.remove(debrief);
  debrief = makeDebrief(G.debrief.title, rows, G.debrief.footer); scene.add(debrief);
  const h = person.headWorld(); debrief.position.set(h.x, h.y + 0.55, h.z + 0.2);
  go('end');
  if (G.debrief.line) await playLine(G.debrief.line);
}

async function start() {
  if (state !== 'idle') return;
  placeUI();
  run++; trust = G.trustStart || 0; wrongStreak = 0; for (const k in record) delete record[k]; trustLog.length = 0;
  strip.userData.reset();
  window.__sim.trust = trust;
  if (ambience.buffer && !ambience.isPlaying) { ambience.play(); audioLog.push({ src: 'audio/ambience.mp3', at: Date.now(), loop: true }); }
  fadeTarget = 0;
  try { await enter(G.start, run); } catch (e) { if (e.message !== 'stale') throw e; }
}
function restartAll() {
  run++; stopVoices(); choiceOpen = false; go('idle');
  if (debrief) debrief.material.opacity = 0;
  fadeTarget = 1; setTimeout(() => { fadeTarget = 0; start(); }, 900);
}
// exit: everything stops; "back" replays the node she was in, from its start
let exitFrom = null;
function exitNow() {
  exitFrom = window.__sim.node; run++; stopVoices(); choiceOpen = false; go('exit');
  for (const v of Object.values(person.videos)) v.pause();
  if (ambience.isPlaying) ambience.pause();
  fadeTarget = 1;
}
async function exitBack() {
  const my = ++run; go('play'); fadeTarget = 0;
  if (ambience.buffer && !ambience.isPlaying) ambience.play();
  try { await enter(exitFrom || G.start, my); } catch (e) { if (e.message !== 'stale') throw e; }
}
function exitEnd() { go('exited'); }

// ---------- input: gaze dwell, click / tap, controller trigger, keys 1-3 for testing ----------
const look = createLook(renderer, camera);
const ray = new THREE.Raycaster(), pos = new THREE.Vector3(), dir = new THREE.Vector3();
let gazed = null, armed = false, offFor = 0;
const specials = [restart, exitBtn, backBtn, endBtn];       // buttons that need no re-arming of the gaze
function act(o) {
  if (o === restart) restartAll(); else if (o === exitBtn) exitNow(); else if (o === backBtn) exitBack(); else if (o === endBtn) exitEnd();
  else choose(bubbles.indexOf(o));
}
function activate() { if (gazed) act(gazed); }
const pickable = () => [...bubbles, ...specials].filter(b => b.userData.shown > 0.6);
let downX = 0, downY = 0;
renderer.domElement.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; });
renderer.domElement.addEventListener('click', e => {
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
  const ndc = new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  const pr = new THREE.Raycaster(); pr.setFromCamera(ndc, camera);
  const hit = pr.intersectObjects(pickable(), false)[0];
  if (hit) act(hit.object);
});
for (const i of [0, 1]) { const c = renderer.xr.getController(i); c.addEventListener('select', activate); scene.add(c); }
addEventListener('keydown', e => { if (e.key >= '1' && e.key <= '3') choose(+e.key - 1); });

// ---------- start ----------
const startEl = document.getElementById('start');
async function begin(g) {
  if (g === 'm' || g === 'f') gender = g;
  await look.requestSensors();
  listener.context.resume();
  person.unlock();
  startEl.style.display = 'none';
  await Promise.all([audioReady, clipsReady]);
  person.unlock();
  start();
}
document.getElementById('go-m').addEventListener('click', () => begin('m'));
document.getElementById('go-f').addEventListener('click', () => begin('f'));
vrButton.addEventListener('click', () => { listener.context.resume(); person.unlock(); });
renderer.xr.addEventListener('sessionstart', () => { if (state === 'idle') begin(); });

// test hooks: __sim.pick('best') chooses the option of that kind, wherever it was shuffled to
window.__sim = {
  state, node: null, trust: 0, record, trustLog, start: begin, choose, restart: restartAll, exit: exitNow, back: exitBack, gz, audioLog,
  get options() { return state === 'ask' ? shown.filter(Boolean).map(o => o.kind) : null; },
  pick(kind) { const i = shown.findIndex(o => o && o.kind === kind); if (i < 0) throw new Error('no option ' + kind); choose(i); },
  look: (y, p) => look.look(y, p), person,
};

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
  herVoice.position.copy(person.headWorld());

  camera.getWorldPosition(pos);
  bubbles.forEach((b, i) => {
    const want = state === 'ask' && shown[i] && stateT > 0.5 + 0.3 * i ? 1 : 0;
    if (want && !b.userData.wanted) blip('appear');
    b.userData.wanted = want;
    b.userData.shown += (want - b.userData.shown) * Math.min(1, dt * (want ? 4 : 3));
    b.material.opacity = b.userData.shown;
    b.lookAt(pos);
    b.userData.flash = Math.max(0, (b.userData.flash || 0) - dt * 0.8);
  });
  const stripOn = state !== 'idle' && state !== 'end' ? 0.9 : 0;
  strip.material.opacity += (stripOn - strip.material.opacity) * Math.min(1, dt * 2); strip.lookAt(pos);
  if (debrief) { const on = state === 'end' ? 1 : 0; debrief.material.opacity += (on - debrief.material.opacity) * Math.min(1, dt * 1.5); debrief.lookAt(pos); }
  restart.userData.shown += ((state === 'end' && stateT > 2 ? 1 : 0) - restart.userData.shown) * Math.min(1, dt * 3);
  restart.material.opacity = restart.userData.shown; restart.lookAt(pos);
  const ease = (o, want, k = 3) => { o.userData.shown += (want - o.userData.shown) * Math.min(1, dt * k); o.material.opacity = o.userData.shown; };
  ease(exitBtn, ['play', 'ask', 'react'].includes(state) ? 0.75 : 0);
  ease(exitPanel, state === 'exit' || state === 'exited' ? 1 : 0);
  ease(backBtn, state === 'exit' && stateT > 1 ? 1 : 0); ease(endBtn, state === 'exit' && stateT > 1 ? 1 : 0);

  camera.getWorldDirection(dir); ray.set(pos, dir);
  const hit = ray.intersectObjects(pickable(), false)[0];
  const g = hit ? hit.object : null;
  if (g !== gazed) { if (gazed) gazed.userData.dwell = 0; gazed = g; }
  offFor = g ? 0 : offFor + dt; if (offFor > 0.3) armed = true;
  for (const b of [...bubbles, ...specials]) {
    const live = b === gazed && (armed || specials.includes(b)) && b.userData.shown > 0.7;
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
if (q.has('autostart')) begin(q.get('gender') || 'm');
