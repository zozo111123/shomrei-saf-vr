// person.js - a photoreal person (AI-generated video, cut out) living inside the code-built 3D world.
// The video frames carry colour + alpha (person only). A second video or image carries depth (0 far .. 1 near).
// The card is a dense grid displaced by that depth, so a seated viewer who moves their head sees real
// parallax across her body. She receives the world's light colour grade and casts a soft contact shadow.
import * as THREE from 'three';

/**
 * opts: { color: url of the RGBA video (webm with alpha) or image, depth: url (video or image, same framing),
 *         heightM: her height in the frame (top of hair to soles) in metres, spot: { seat:[x,y,z], facing },
 *         footV: the image row (0 top .. 1 bottom) where her soles are, centerU: the image column of her centre,
 *         relief: metres of depth relief, grade: THREE.Color multiplier, loop: true }
 */
export function createPerson(opts) {
  const isVideo = s => /\.(webm|mp4|mov)$/i.test(s);
  const load = (src) => {
    if (!isVideo(src)) { const t = new THREE.TextureLoader().load(src); t.colorSpace = THREE.SRGBColorSpace; return { tex: t, video: null }; }
    const v = document.createElement('video');
    Object.assign(v, { src, muted: true, loop: opts.loop !== false, playsInline: true, crossOrigin: 'anonymous', preload: 'auto' });
    const t = new THREE.VideoTexture(v); t.colorSpace = THREE.SRGBColorSpace;
    return { tex: t, video: v };
  };
  // opts.packed: the colour source is a packed frame (top half colour, bottom half alpha as grey, tools/pack.py)
  const col = opts.color ? load(opts.color) : { tex: new THREE.Texture(), video: null }, dep = opts.depth ? load(opts.depth) : null;
  if (dep) dep.tex.colorSpace = THREE.NoColorSpace;

  const aspect = opts.aspect ?? 1.5;                      // frame width / height
  const H = opts.heightM / ((opts.footV ?? 0.95) - (opts.headV ?? 0.05));   // metres covered by the full frame height
  const Wd = H * aspect;
  const geo = new THREE.PlaneGeometry(Wd, H, 160, 110);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: true, side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: col.tex }, uDepth: { value: dep ? dep.tex : null }, uHasDepth: { value: dep ? 1 : 0 },
      uRelief: { value: opts.relief ?? 0.32 }, uGrade: { value: opts.grade ?? new THREE.Color(1, 1, 1) },
      uLift: { value: opts.lift ?? new THREE.Color(0, 0, 0) }, uPacked: { value: opts.packed ? 1 : 0 },
    },
    vertexShader: /* glsl */`
      uniform sampler2D uDepth; uniform float uHasDepth, uRelief;
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vec3 p = position;
        if (uHasDepth > 0.5) { float d = texture2D(uDepth, uv).r; p.z += (d - 0.5) * uRelief; }
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uColor; uniform vec3 uGrade, uLift; uniform float uPacked;
      varying vec2 vUv;
      void main(){
        vec4 c = texture2D(uColor, vUv);
        if (uPacked > 0.5) { c = texture2D(uColor, vec2(vUv.x, 0.5 + vUv.y * 0.5)); c.a = texture2D(uColor, vec2(vUv.x, vUv.y * 0.5)).r; }
        if (c.a < 0.04) discard;
        vec3 rgb = c.rgb * uGrade + uLift * (1.0 - c.rgb);
        gl_FragColor = vec4(rgb, c.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  mat.toneMapped = false;                                  // the footage is already a finished image
  const card = new THREE.Mesh(geo, mat);
  card.renderOrder = 2;
  // place: the soles on the ground at the seat, her centre column on the seat's centre line
  const g = new THREE.Group();
  const [sx, sy, sz] = opts.spot.seat;
  g.position.set(sx, opts.groundY, sz);
  g.rotation.y = opts.spot.facing ?? 0;
  // the plane's centre sits at half its height; lift it so the soles (row footV) touch the ground
  card.position.set((0.5 - (opts.centerU ?? 0.5)) * Wd, H / 2 - H * (1 - (opts.footV ?? 0.95)), opts.zOffset ?? 0);
  g.add(card);

  // a soft contact shadow under her and the bench (the footage has no ground)
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  const sg = sc.getContext('2d'), gr = sg.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = gr; sg.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.7).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
  shadow.position.set(0, 0.004, -0.05); shadow.renderOrder = 1;
  g.add(shadow);

  const vids = [col.video, dep && dep.video].filter(Boolean);
  return {
    group: g, card, videos: vids,
    play() { for (const v of vids) v.play().catch(() => {}); },
    // film rendering from packed PNG frames: show this image (an HTMLImageElement, already loaded)
    setImage(img) { const t = mat.uniforms.uColor.value; t.image = img; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; },
    // film rendering: seek every stream to the same time and wait until they show it
    async seek(t) {
      await Promise.all(vids.map(v => new Promise(ok => {
        const target = v.duration ? t % v.duration : t;
        if (Math.abs(v.currentTime - target) < 1e-3 && v.readyState >= 2) return ok();
        v.addEventListener('seeked', () => ok(), { once: true }); v.currentTime = target;
      })));
    },
  };
}
