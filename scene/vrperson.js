// vrperson.js - the photoreal girl (AI video, cut out and packed: top half colour, bottom half alpha) as a
// ray-consistent 2.5D card inside the code-built world.
//
// Why "ray-consistent": every vertex of the card is moved ALONG the ray from the camera that shot the footage,
// by her depth. Seen from that camera's position the image is exactly the original; seen from a nearby head
// position (a seated viewer leaning, a slow film camera move) the body has real parallax. Rows below the
// bench's ground line are the floor in front of the bench, so they are laid onto the ground plane.
// She casts a real shadow (her silhouette, from the packed alpha) - with the sun low behind her it runs
// long across the grass toward the viewer. Two layers cross-fade between clips without pops.
import * as THREE from 'three';

// the same displacement in the visible card and in the shadow pass
const RAY = /* glsl */`
  {
    vec3 dir = transformed - uCam;
    float L = length(dir);
    float d = texture2D(uDepth, uv).r;
    float s = 1.0 - (d - 0.5) * uRelief / L;
    if (transformed.y < uGroundY) s = min(s, (uCam.y - uGroundY) / max(uCam.y - transformed.y, 1e-3));
    transformed = uCam + dir * s;
  }`;

/**
 * opts: {
 *   sources: { name: url of a packed mp4 } (optional for film rendering from images), depth: url of the depth png,
 *   frameW, frameH (px), frameHeightM (metres the frame height covers at the bench plane),
 *   groundV (image row 0 top .. 1 bottom where the bench legs meet the floor), centerU (column of the bench centre),
 *   shotCam: { height, dist } (the footage camera: eye height above the floor, distance to the bench plane),
 *   relief (metres of depth relief), backdrop (hex colour of the removed studio backdrop, for edge cleanup),
 *   grade (THREE.Color multiplier), lift (THREE.Color added to shadows), spot: { seat:[x,y,z], facing }, groundY,
 *   castShadow (default true) }
 */
export function createPersonCard(opts) {
  const aspect = opts.frameW / opts.frameH;
  const Hm = opts.frameHeightM, Wm = Hm * aspect;
  const groundYc = Hm / 2 - opts.groundV * Hm;          // the ground line's y in card-local coordinates (card centred at 0)
  const shot = opts.shotCam ?? { height: 1.05, dist: 2.0 };
  const camLocal = new THREE.Vector3(0, groundYc + shot.height, shot.dist);
  const asAlpha = t => { t.repeat.set(1, 0.5); t.offset.set(0, 0); return t; };   // built-in materials read the alpha half

  const videos = {}, textures = {}, urls = {};
  // opts.pool: many clips, but only two <video> players that take turns (phones and headsets cap open media
  // players). The incoming clip loads into the idle player and the cross-fade starts once it is playing.
  const mkPlayer = () => {
    const v = document.createElement('video');
    Object.assign(v, { muted: true, playsInline: true, crossOrigin: 'anonymous', preload: 'auto', loop: false });
    v.setAttribute('playsinline', '');
    const t = new THREE.VideoTexture(v); t.colorSpace = THREE.NoColorSpace;
    const p = { v, t: asAlpha(t), name: null };
    v.addEventListener('ended', () => { if (p === curP && !loopCur && onEnd) { const cb = onEnd; onEnd = null; cb(); } });
    return p;
  };
  const pool = opts.pool ? [mkPlayer(), mkPlayer()] : null;
  let curP = null;
  // clips can be added later (a long branching story loads them as it goes)
  function add(name, url) {
    if (pool) { urls[name] = url; return; }
    if (videos[name]) return videos[name];
    const v = document.createElement('video');
    Object.assign(v, { src: url, muted: true, playsInline: true, crossOrigin: 'anonymous', preload: 'auto', loop: false });
    v.setAttribute('playsinline', '');
    const t = new THREE.VideoTexture(v); t.colorSpace = THREE.NoColorSpace;   // colour is decoded in the shader, alpha stays raw t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
    videos[name] = v; textures[name] = asAlpha(t);
    v.addEventListener('ended', () => {
      if (name === current && !loopCur && onEnd) { const cb = onEnd; onEnd = null; cb(); }
    });
    return v;
  }
  for (const [name, url] of Object.entries(opts.sources ?? {})) add(name, url);
  const mkImgTex = () => { const t = asAlpha(new THREE.Texture()); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return t; };
  const imgTex = mkImgTex(), imgTex2 = mkImgTex();
  const depthTex = new THREE.TextureLoader().load(opts.depth); depthTex.colorSpace = THREE.NoColorSpace;
  const shared = { uDepth: { value: depthTex }, uRelief: { value: opts.relief ?? 0.34 }, uCam: { value: camLocal }, uGroundY: { value: groundYc } };

  const geo = new THREE.PlaneGeometry(Wm, Hm, 140, 100);
  const makeLayer = () => {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        ...shared, uColor: { value: null }, uFade: { value: 0 },
        uGrade: { value: opts.grade ?? new THREE.Color(1, 1, 1) }, uLift: { value: opts.lift ?? new THREE.Color(0, 0, 0) },
        uBackdrop: { value: new THREE.Color(opts.backdrop ?? '#83746a') },
        // film rendering only: the card is drawn after the (blurred) world, so it tests itself against the world's depth
        uSceneDepth: { value: null }, uUseSceneDepth: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.05 }, uFar: { value: 9000 },
      },
      vertexShader: /* glsl */`
        uniform sampler2D uDepth; uniform float uRelief, uGroundY; uniform vec3 uCam;
        varying vec2 vUv;
        void main(){
          vUv = uv;
          vec3 transformed = position;
          ${RAY}
          gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uColor; uniform vec3 uGrade, uLift, uBackdrop; uniform float uFade;
        uniform sampler2D uSceneDepth; uniform float uUseSceneDepth, uNear, uFar; uniform vec2 uRes;
        varying vec2 vUv;
        float linZ(float d) { return uNear * uFar / (uFar - d * (uFar - uNear)); }
        void main(){
          if (uUseSceneDepth > 0.5) {
            float sd = texture2D(uSceneDepth, gl_FragCoord.xy / uRes).x;
            if (linZ(gl_FragCoord.z) > linZ(sd) + 0.015) discard;     // a grass blade (or anything) in front of her
          }
          // packed frame: the top half is colour (sRGB), the bottom half alpha (raw). Stay clear of the seam row.
          vec3 c = texture2D(uColor, vec2(vUv.x, max(0.5 + vUv.y * 0.5, 0.5 + 1.5 / 1536.0))).rgb;
          c = sRGBTransferEOTF(vec4(c, 1.0)).rgb;
          float a = texture2D(uColor, vec2(vUv.x, min(vUv.y * 0.5, 0.5 - 1.5 / 1536.0))).r;
          a = smoothstep(0.03, 0.97, a);
          if (a * uFade < 0.01) discard;
          // remove the studio backdrop that is mixed into soft edges (hair): C = a*F + (1-a)*B  ->  F
          vec3 f = (c - (1.0 - a) * uBackdrop) / max(a, 0.25);
          c = mix(c, clamp(f, 0.0, 1.0), smoothstep(0.98, 0.35, a));
          vec3 rgb = c * uGrade + uLift * (1.0 - c);
          gl_FragColor = vec4(rgb, a * uFade);
          #include <colorspace_fragment>
        }`,
    });
    mat.toneMapped = false;
    const m = new THREE.Mesh(geo, mat); m.renderOrder = 3; m.frustumCulled = false;
    return m;
  };
  const layers = [makeLayer(), makeLayer()];
  layers[1].renderOrder = 4;

  // the shadow caster: invisible in the image, her silhouette in the sun's shadow map
  const firstTex = Object.values(textures)[0] ?? imgTex;
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: firstTex, alphaTest: 0.5, side: THREE.DoubleSide });
  depthMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDepth; uniform float uRelief, uGroundY; uniform vec3 uCam;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + RAY);
  };
  const caster = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  caster.customDepthMaterial = depthMat;
  caster.castShadow = opts.castShadow !== false; caster.frustumCulled = false; caster.renderOrder = -1;

  const g = new THREE.Group();
  const [sx, , sz] = opts.spot.seat;
  g.position.set(sx, opts.groundY - groundYc, sz);       // the card's ground line sits on the ground
  g.rotation.y = opts.spot.facing ?? 0;
  const inner = new THREE.Group(); inner.position.x = (0.5 - (opts.centerU ?? 0.5)) * Wm;
  inner.add(layers[0], layers[1], caster); g.add(inner);

  // a soft contact shadow right under the bench and her feet (sky light occlusion, which the sun shadow lacks)
  const sc = document.createElement('canvas'); sc.width = 256; sc.height = 128;
  const sg = sc.getContext('2d'), gr = sg.createRadialGradient(128, 64, 6, 128, 64, 126);
  gr.addColorStop(0, 'rgba(10,6,2,0.42)'); gr.addColorStop(0.55, 'rgba(10,6,2,0.16)'); gr.addColorStop(1, 'rgba(10,6,2,0)');
  sg.fillStyle = gr; sg.fillRect(0, 0, 256, 128);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.75).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, toneMapped: false }));
  contact.position.set(0, groundYc + 0.012, 0.12); contact.renderOrder = 2;
  inner.add(contact);

  // ---------- playback ----------
  let front = 0, fadeT = 1, fadeDur = 0.35, current = null, onEnd = null, loopCur = false;
  const setFront = (tex) => {
    const back = 1 - front;
    layers[back].material.uniforms.uColor.value = tex;
    front = back; depthMat.alphaMap = tex;
  };
  function show(name, { loop = false, fade = 0.35, from = 0, ended = null } = {}) {
    if (pool) {
      if (!urls[name]) throw new Error('unknown clip: ' + name);
      const p = pool[0] === curP ? pool[1] : pool[0], old = curP;
      curP = p; p.name = name; current = name; onEnd = ended; loopCur = loop;
      const v = p.v; v.loop = loop;
      const go = () => {
        if (curP !== p) return;                          // another clip was asked for meanwhile
        setFront(p.t); fadeT = 0; fadeDur = fade;
        if (old && old !== p) setTimeout(() => { if (curP !== old) old.v.pause(); }, fade * 1000 + 100);
      };
      if (v.getAttribute('src') !== urls[name]) v.src = urls[name];
      v.currentTime = from;
      v.addEventListener('playing', go, { once: true });
      return v.play().catch(() => {});
    }
    const v = videos[name];
    v.loop = loop; v.currentTime = from;
    const p = v.play().catch(() => {});
    setFront(textures[name]); fadeT = 0; fadeDur = fade;
    if (current && current !== name) { const old = videos[current]; setTimeout(() => { if (old !== videos[current]) old.pause(); }, fade * 1000 + 100); }
    current = name; onEnd = ended; loopCur = loop;
    return p;
  }
  // film rendering: show a decoded packed frame (an HTMLImageElement / ImageBitmap); no cross-fade
  function setImage(img, img2 = null, k = 0) {
    imgTex.image = img; imgTex.needsUpdate = true;
    layers[0].material.uniforms.uColor.value = imgTex; layers[0].material.uniforms.uFade.value = 1; layers[0].renderOrder = 3;
    if (img2 && k > 0) {                      // a dissolve between two clips (film rendering)
      imgTex2.image = img2; imgTex2.needsUpdate = true;
      layers[1].material.uniforms.uColor.value = imgTex2; layers[1].material.uniforms.uFade.value = k; layers[1].renderOrder = 4;
    } else layers[1].material.uniforms.uFade.value = 0;
    depthMat.alphaMap = img2 && k > 0.5 ? imgTex2 : imgTex; filmMode = true;
  }
  let filmMode = false;
  function update(dt) {
    if (filmMode) return;
    fadeT = Math.min(1, fadeT + dt / Math.max(fadeDur, 1e-3));
    const k = fadeT * fadeT * (3 - 2 * fadeT);
    layers[front].material.uniforms.uFade.value = 1;
    layers[1 - front].material.uniforms.uFade.value = 1 - k;
    layers[front].renderOrder = 3; layers[1 - front].renderOrder = 4;   // the outgoing clip fades over the incoming one
    if (current && !loopCur && onEnd) {
      const v = pool ? curP.v : videos[current];
      if (v.duration && v.currentTime >= v.duration - 0.06) { const cb = onEnd; onEnd = null; cb(); }
    }
  }
  // browsers allow video playback only after a user gesture: call this inside the start click.
  // (the pause runs later, asynchronously: never pause the clip that is on screen by then)
  function unlock() {
    if (pool) { for (const p of pool) if (p !== curP && p.v.getAttribute('src')) p.v.play().then(() => { if (p !== curP) p.v.pause(); }).catch(() => {}); return; }
    for (const v of Object.values(videos)) { v.play().then(() => { if (v !== videos[current]) v.pause(); }).catch(() => {}); } }
  const head = new THREE.Vector3();
  return {
    group: g, videos: pool ? { a: pool[0].v, b: pool[1].v } : videos, add, show, update, unlock, setImage, cards: layers, caster, contact,
    // film: draw the card after the world, testing against the world's depth texture
    useSceneDepth(tex, w, h, near, far) {
      for (const l of layers) { const u = l.material.uniforms; u.uSceneDepth.value = tex; u.uUseSceneDepth.value = tex ? 1 : 0; u.uRes.value.set(w, h); u.uNear.value = near; u.uFar.value = far; }
    },
    get current() { return current; },
    // where her head is in world space (for the gaze test and the bubbles)
    headWorld() { return inner.localToWorld(head.set(0, groundYc + 1.02, 0.08)); },
    frameWidthM: Wm, frameHeightM: Hm,
  };
}
