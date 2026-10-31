// ui.js - the in-world interface: Hebrew choice bubbles that fill with a ring while you look at them,
// subtitles under the view, a gaze reticle, and an end panel. All canvas-drawn (RTL), crisp in a headset.
import * as THREE from 'three';

const FONT = '"Heebo", "Segoe UI", "Noto Sans Hebrew", sans-serif';
export async function loadFonts() {
  try { await Promise.all(['500 48px Heebo', '700 64px Heebo', '400 36px Heebo', '300 36px Heebo'].map(f => document.fonts.load(f, 'שומרי סף'))); } catch (e) { /* system fallback */ }
}
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function wrap(ctx, text, maxW) { const words = text.split(' '), lines = []; let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; } if (line) lines.push(line); return lines; }

/** a choice bubble in world space; .draw(progress 0..1, glow 0..1) */
export function makeBubble(text, widthM = 0.95, W = 1380) {      // a short button: a narrower canvas W, so the pill fills it
  const H = 200;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, opacity: 0 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, widthM * H / W), mat);
  mesh.renderOrder = 20;
  const g = c.getContext('2d');
  const draw = (p = 0, glow = 0) => {
    const text = mesh.userData.text;
    g.clearRect(0, 0, W, H); g.direction = 'rtl';
    let fs = 54; g.font = `500 ${fs}px ${FONT}`;
    while (fs > 36 && g.measureText(text).width > W - 170) { fs -= 2; g.font = `500 ${fs}px ${FONT}`; }   // long lines: a smaller font
    const tw = Math.min(W - 60, g.measureText(text).width + 110), x = (W - tw) / 2, y = 40, h = 120;
    g.shadowColor = glow > 0 ? `rgba(255,205,130,${0.85 * glow})` : 'rgba(0,0,0,0.45)'; g.shadowBlur = 14 + 26 * glow;
    rrect(g, x, y, tw, h, 60);
    g.fillStyle = `rgba(${Math.round(24 + 40 * glow)},${Math.round(20 + 26 * glow)},${Math.round(16 + 10 * glow)},0.66)`; g.fill();
    g.shadowBlur = 0; g.lineWidth = 3 + 3 * glow; g.strokeStyle = `rgba(255,${Math.round(238 - 30 * glow)},${Math.round(220 - 80 * glow)},${0.6 + 0.4 * glow})`; g.stroke();
    if (p > 0) {        // the dwell ring runs around the bubble outline
      g.save(); rrect(g, x, y, tw, h, 60); g.clip();
      g.fillStyle = 'rgba(255,205,130,0.22)'; g.fillRect(x + tw * (1 - p), y, tw * p, h); g.restore();
    }
    g.fillStyle = '#fbf3e6'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, W / 2, y + h / 2 + 3);
    tex.needsUpdate = true;
  };
  mesh.userData = { text, draw, dwell: 0, shown: 0 };
  mesh.userData.setText = (t) => { mesh.userData.text = t; mesh.userData.key = null; draw(0, 0); };
  draw(0, 0);
  return mesh;
}

/** subtitles attached to the camera, bottom of the view */
export function makeSubtitles(camera) {
  const W = 1400, H = 240;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4 * H / W),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, opacity: 0 }));
  mesh.position.set(0, -0.78, -1.9); mesh.renderOrder = 30; camera.add(mesh);   // low in the view, under her feet
  const g = c.getContext('2d');
  let target = 0;
  return {
    set(text) {
      g.clearRect(0, 0, W, H);
      if (text) {
        g.direction = 'rtl'; g.font = `500 50px ${FONT}`;
        const lines = wrap(g, text, W - 140), h = lines.length * 64 + 40;
        g.fillStyle = 'rgba(8,6,4,0.58)'; rrect(g, 40, H - h - 10, W - 80, h, 26); g.fill();
        g.fillStyle = '#f8efe2'; g.textAlign = 'center'; g.textBaseline = 'middle';
        lines.forEach((l, i) => g.fillText(l, W / 2, H - h - 10 + 52 + i * 64));
      }
      tex.needsUpdate = true; target = text ? 1 : 0;
    },
    update(dt) { const m = mesh.material; m.opacity += (target - m.opacity) * Math.min(1, dt * 6); },
  };
}

/** a small ring in the centre of the view: the gaze cursor */
export function makeReticle(camera) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.011, 0.018, 40),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false, toneMapped: false }));
  ring.position.z = -1.6; ring.renderOrder = 40; camera.add(ring);
  return ring;
}

/** a small strip above her: the four gatekeeper actions, the current one lit. .set(index or -1) */
export function makeStageStrip(labels) {
  const W = 1600, H = 120;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25 * H / W),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
  mesh.renderOrder = 19;
  const done = new Set();
  mesh.userData.set = (cur) => {
    if (cur > 0) for (let i = 0; i < cur; i++) done.add(i);
    g.clearRect(0, 0, W, H); g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const n = labels.length, cw = W / n;
    labels.forEach((l, i) => {
      const x = W - cw * (i + 0.5);                      // right to left, like the Hebrew reading order
      const on = i === cur;
      g.fillStyle = on ? 'rgba(232,181,90,0.88)' : 'rgba(14,10,6,0.55)';
      rrect(g, x - cw / 2 + 10, 18, cw - 20, 84, 42); g.fill();
      g.fillStyle = on ? '#1a1408' : (done.has(i) ? '#e8c48c' : 'rgba(246,236,220,0.6)');
      let fs = 40; g.font = `${on ? 700 : 500} ${fs}px ${FONT}`;
      while (fs > 24 && g.measureText(`${i + 1}. ${l}`).width > cw - 56) { fs -= 2; g.font = `${on ? 700 : 500} ${fs}px ${FONT}`; }
      g.fillText(`${i + 1}. ${l}`, x, 62);
    });
    tex.needsUpdate = true;
  };
  mesh.userData.reset = () => { done.clear(); mesh.userData.set(-1); };
  mesh.userData.set(-1);
  return mesh;
}

/** the debrief: one row per action, how the viewer did, and the principle. rows: [{label, ok, note}] */
export function makeDebrief(title, rows, footer) {
  const W = 1600, H = 300 + rows.length * 120 + footer.length * 58;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(12,9,6,0.84)'; rrect(g, 0, 0, W, H, 40); g.fill();
  g.direction = 'rtl'; g.textBaseline = 'middle';
  g.textAlign = 'center'; g.fillStyle = '#f7ead2'; g.font = `700 80px ${FONT}`; g.fillText(title, W / 2, 110);
  let y = 250;
  for (const r of rows) {
    g.textAlign = 'right';
    g.fillStyle = r.ok ? '#9fd39a' : '#e8b55a'; g.font = `700 52px ${FONT}`;
    g.fillText(r.ok ? '✓' : '↺', W - 70, y);
    g.fillStyle = '#f7ead2'; g.font = `700 48px ${FONT}`; g.fillText(r.label, W - 140, y - 24);
    g.fillStyle = '#d9c7a8'; g.font = `400 36px ${FONT}`; g.fillText(r.note, W - 140, y + 28);
    y += 120;
  }
  g.textAlign = 'center';
  footer.forEach((f, i) => { g.fillStyle = i === 0 ? '#ffffff' : '#cdbb9c'; g.font = `${i === 0 ? 500 : 400} ${i === 0 ? 44 : 32}px ${FONT}`; g.fillText(f, W / 2, y + 10 + i * 58); });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3 * H / W),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
  mesh.renderOrder = 25;
  return mesh;
}

/** a calm panel on a plain background (the exit screen). lines: [text, ...], the first is the title */
export function makeTextPanel(lines, widthM = 1.1) {
  const W = 1600, H = 160 + lines.length * 78;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(58,66,78,0.94)'; rrect(g, 0, 0, W, H, 40); g.fill();
  g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => { g.fillStyle = i === 0 ? '#f4f1ea' : '#dfe4ea'; g.font = `${i === 0 ? 700 : 400} ${i === 0 ? 64 : 42}px ${FONT}`; g.fillText(l, W / 2, 90 + i * 78 + (i ? 30 : 0)); });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, widthM * H / W),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
  mesh.renderOrder = 60;
  return mesh;
}

/** the end panel: title and an honest credit line */
export function makeEndPanel() {
  const W = 1600, H = 760;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(12,9,6,0.8)'; rrect(g, 0, 0, W, H, 40); g.fill();
  g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#f7ead2'; g.font = `700 96px ${FONT}`; g.fillText('שומרי סף · פיילוט VR', W / 2, 120);
  g.fillStyle = '#e8c48c'; g.font = `500 56px ${FONT}`; g.fillText('לא לשפוט. לא להטיף. להקשיב.', W / 2, 240);
  g.fillStyle = '#efe2cc'; g.font = `500 44px ${FONT}`; g.fillText('ואז: לשאול ישירות על מחשבות אובדניות, ולעזור להגיע לעזרה.', W / 2, 345);
  g.fillStyle = '#ffffff'; g.font = `500 48px ${FONT}`; g.fillText('צריכים לדבר?  ער"ן 1201 · סה"ר sahar.org.il · חירום 101', W / 2, 460);
  g.fillStyle = '#cdbb9c'; g.font = `400 34px ${FONT}`;
  g.fillText('העולם נבנה בקוד · הדמות נוצרה בבינה מלאכותית ואינה אדם אמיתי · הקול סינתטי', W / 2, 580);
  g.fillText("התוכן המקצועי: על פי תוכנית שומרי סף של פרופ' יוסי לוי-בלז", W / 2, 640);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15 * H / W),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
  mesh.renderOrder = 25;
  return mesh;
}
