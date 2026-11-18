/**
 * Visor 3D del marcador.
 *
 * Carga la escena de Blender (brand_scene.glb), reproduce la secuencia de marcación,
 * intercambia el sello del hierro por cualquiera de los diseños del catálogo y, al
 * terminar, entra en la vista 360 alrededor del logo.
 *
 * El módulo no toca el DOM más que para crear el canvas y escuchar el resize: toda la
 * interfaz vive en js/ui.js.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// grosor del sello del JR clásico (13 mm): es el que copian todas las placas
const PLATE_THICK = 0.013;
// el clip de cámara arranca con ~1 s de imagen fija: entramos directo en el zoom al horno
const SEQ_START = 1.0;
// coreografía final: acercamiento (medio segundo) + pausa de 1 s sobre el logo + apertura al órbita
const DOLLY_CLOSE_END = 0.5;
const DOLLY_HOLD_END = 1.5;
const FINAL_MOVE_END = 3.3;

const COW_BONES = [
  'Cow_Spine_02SHJnt_27', 'Cow_Spine_03SHJnt_26', 'Cow_Spine_04SHJnt_25',
  'Cow_Neck_TopSHJnt_19', 'Cow_l_Ear_01_02SHJnt_14', 'Cow_r_Ear_01_02SHJnt_16',
  'Cow_Udder_01_01SHJnt_48', 'Cow_Udder_01_02SHJnt_47',
  'Cow_Tail_01_01SHJnt_46', 'Cow_Tail_01_02SHJnt_45', 'Cow_Tail_01_04SHJnt_44',
  'Cow_Tail_01_05SHJnt_43', 'Cow_Tail_01_06SHJnt_42', 'Cow_Tail_01_07SHJnt_41'
];
const TAIL_CHAIN = COW_BONES.slice(8);
const WANTED_CLIPS = ['BrandIron_Rig', 'Cam_Main', 'Cow_Brand', 'Animation'];

const qIdle = new THREE.Quaternion();
const eIdle = new THREE.Euler();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();

/** Cielo de atardecer dibujado en canvas: fondo y entorno (reflejos) de la escena. */
function makeSky() {
  const w = 1024, h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.00, '#0a1220');
  grad.addColorStop(0.18, '#131d33');
  grad.addColorStop(0.32, '#22304c');
  grad.addColorStop(0.40, '#3a3f60');
  grad.addColorStop(0.455, '#6b5069');
  grad.addColorStop(0.487, '#b06a45');
  grad.addColorStop(0.505, '#e08a44');
  grad.addColorStop(0.52, '#7d5334');
  grad.addColorStop(0.58, '#3a3026');
  grad.addColorStop(1.00, '#151210');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const sx = w * 0.609, sy = h * 0.403;
  const rg = g.createRadialGradient(sx, sy, 0, sx, sy, h * 0.55);
  rg.addColorStop(0.00, 'rgba(255,214,150,0.95)');
  rg.addColorStop(0.09, 'rgba(255,168,96,0.55)');
  rg.addColorStop(0.30, 'rgba(228,132,80,0.22)');
  rg.addColorStop(1.00, 'rgba(180,110,70,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.07 },
    uContrast: { value: 1.05 },
    uLift: { value: new THREE.Color(0.004, 0.012, 0.020) }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    uniform vec3 uLift;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSaturation);
      c.rgb = (c.rgb - 0.5) * uContrast + 0.5;
      c.rgb += uLift * (1.0 - smoothstep(0.0, 0.55, l));
      gl_FragColor = vec4(max(c.rgb, 0.0), c.a);
    }`
};

/**
 * @param {object} opts
 * @param {HTMLElement} opts.container  contenedor donde se inyecta el canvas
 * @param {string}      opts.modelUrl   ruta del .glb
 * @param {Array}       opts.designs    catálogo (ver js/config.js)
 * @param {Function}    [opts.onProgress] (0..1)
 * @param {Function}    [opts.onStatus] (texto) aviso mientras se reintenta la descarga
 * @param {Function}    [opts.onError] (err) la descarga falló definitivamente
 * @param {Function}    [opts.onReady]
 * @param {Function}    [opts.onSequenceEnd] se llama al entrar en la vista 360
 * @param {Function}    [opts.onDesign] (design) al cambiar de diseño
 * @param {Function}    [opts.onFps] (fps)
 */
export function createViewer(opts) {
  const {
    container, modelUrl, designs,
    onProgress = () => {}, onStatus = () => {}, onError = () => {},
    onReady = () => {}, onSequenceEnd = () => {},
    onOrbit = () => {}, onDesign = () => {}, onFps = () => {}
  } = opts;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.id = 'viewerCanvas';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x3b3f52, 70, 900);

  const skyTex = makeSky();
  scene.background = skyTex;
  scene.backgroundIntensity = 1.05;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(skyTex).texture;
  scene.environmentIntensity = 1.0;

  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 2000);
  camera.position.set(2.4, 1.6, -3.2);

  scene.add(new THREE.HemisphereLight(0x53688f, 0x1d2118, 0.30));

  const sun = new THREE.DirectionalLight(0xffb27a, 1.75);
  sun.position.set(8, 3.4, 6.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 70;
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(0x5f7bb0, 0.22);
  fill.position.set(-7, 5, -6);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0x9fc2ff, 0.35);
  rim.position.set(-5, 4.0, -9);
  scene.add(rim);

  // farol de calle que ilumina el marcador sobre el yunque
  const lampPos = new THREE.Vector3(5.25, 1.33, -2.55);
  const anvilTarget = new THREE.Vector3(2.59, 0.62, -0.43);
  const lampLight = new THREE.SpotLight(0xffd0a0, 26, 14, 0.60, 0.85, 1.5);
  lampLight.position.copy(lampPos);
  lampLight.target.position.copy(anvilTarget);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(1024, 1024);
  lampLight.shadow.camera.near = 0.6;
  lampLight.shadow.camera.far = 16;
  lampLight.shadow.bias = -0.0012;
  lampLight.shadow.normalBias = 0.03;
  scene.add(lampLight, lampLight.target);

  const lampGlow = new THREE.PointLight(0xffb066, 4.5, 10, 1.8);
  lampGlow.position.copy(lampPos);
  scene.add(lampGlow);

  const forgeLight = new THREE.PointLight(0xff7326, 26, 11, 1.6);
  forgeLight.position.set(-8.1, 0.75, -1.9);
  scene.add(forgeLight);

  const keyLight = new THREE.PointLight(0xffdcae, 14, 7, 1.5);
  keyLight.position.set(1.9, 1.5, 1.3);
  scene.add(keyLight);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.7, 0.93);
  composer.addPass(bloomPass);
  composer.addPass(new ShaderPass(GradeShader));
  composer.addPass(new OutputPass());

  // ── estado ────────────────────────────────────────────────────────────────
  let mixer = null;
  const actions = [];
  let seqDuration = 0;
  let camRig = null;
  const ironMats = [];
  const fireMats = [];
  const ironTarget = new THREE.Vector3(2.6, 0.7, 0.15);
  let ironMarkObj = null;
  let ironRigObj = null;
  let cowMarkObj = null;
  let rootModel = null;
  let controls = null;
  const cowBones = {};
  let playing = false;
  let mixerTime = 0;
  let ready = false;
  let active = true;
  let rafId = 0;
  let dollyT = -1;
  const dollyFrom = new THREE.Vector3();
  const dollyClose = new THREE.Vector3();
  const dollyOrbit = new THREE.Vector3();

  const plates = {};       // id -> { iron, cow }
  const maskCache = {};    // id -> { mask: Uint8Array, n }
  const maskWaiters = {};
  const extraDesigns = []; // diseños subidos por el visitante
  const customMasks = {};  // id -> { mask, n, canvas }
  let platesBuilt = false;
  let activeDesign = designs[0] ? designs[0].id : null;

  const clock = new THREE.Clock();

  function syncPlates() {
    if (!cowMarkObj) return;
    const s = cowMarkObj.scale.x;
    for (const k in plates) {
      const p = plates[k].cow;
      if (p) p.scale.setScalar(s);
    }
  }

  function renderFrame() {
    syncPlates();
    composer.render();
  }

  // ── placas de los diseños ─────────────────────────────────────────────────
  // se lee la silueta del logo en una rejilla para cerrar el canto de la placa
  function loadMask(id, url, cb) {
    if (maskCache[id]) { if (cb) cb(); return; }
    if (maskWaiters[id]) { if (cb) maskWaiters[id].push(cb); return; }
    maskWaiters[id] = cb ? [cb] : [];
    const img = new Image();
    img.onload = () => {
      const n = 384;
      const cv = document.createElement('canvas');
      cv.width = n;
      cv.height = n;
      const cx = cv.getContext('2d');
      cx.drawImage(img, 0, 0, n, n);
      const d = cx.getImageData(0, 0, n, n).data;
      const m = new Uint8Array(n * n);
      for (let i = 0; i < n * n; i++) m[i] = d[i * 4];
      maskCache[id] = { mask: m, n };
      const waiters = maskWaiters[id] || [];
      delete maskWaiters[id];
      for (const w of waiters) w();
    };
    img.onerror = () => { delete maskWaiters[id]; };
    img.src = url;
  }

  // placa sólida: dos caras con el logo recortado + canto cerrado (mismo grosor que el JR)
  function plateGeometry(side, thick, mask, n, step) {
    const pos = [];
    const nor = [];
    const uvs = [];
    const h = side / 2, t = thick / 2;
    const tri = (a, b, c, nx, ny, nz, ua, ub, uc) => {
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      uvs.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    };
    const quad = (a, b, c, d, nx, ny, nz, uv4) => {
      tri(a, b, c, nx, ny, nz, uv4[0], uv4[1], uv4[2]);
      tri(a, c, d, nx, ny, nz, uv4[0], uv4[2], uv4[3]);
    };
    const FACE_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
    quad([-h, -h, t], [h, -h, t], [h, h, t], [-h, h, t], 0, 0, 1, FACE_UV);
    quad([h, -h, -t], [-h, -h, -t], [-h, h, -t], [h, h, -t], 0, 0, -1, FACE_UV);

    if (mask && n) {
      const st = Math.max(1, step | 0);
      const N = Math.floor(n / st);
      const s = side / N;
      const solid = (x, y) => {
        if (x < 0 || y < 0 || x >= N || y >= N) return false;
        return mask[(y * st) * n + x * st] > 127;
      };
      const X = (x) => -h + x * s;
      const Y = (y) => h - y * s;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          if (!solid(x, y)) continue;
          const u = (x + 0.5) / N, v = 1 - (y + 0.5) / N;
          const u4 = [[u, v], [u, v], [u, v], [u, v]];
          const xa = X(x), xb = X(x + 1), ya = Y(y), yb = Y(y + 1);
          if (!solid(x + 1, y)) quad([xb, ya, t], [xb, yb, t], [xb, yb, -t], [xb, ya, -t], 1, 0, 0, u4);
          if (!solid(x - 1, y)) quad([xa, yb, t], [xa, ya, t], [xa, ya, -t], [xa, yb, -t], -1, 0, 0, u4);
          if (!solid(x, y + 1)) quad([xb, yb, t], [xa, yb, t], [xa, yb, -t], [xb, yb, -t], 0, -1, 0, u4);
          if (!solid(x, y - 1)) quad([xa, ya, t], [xb, ya, t], [xb, ya, -t], [xa, ya, -t], 0, 1, 0, u4);
        }
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.userData.side = side;
    g.userData.thick = thick;
    g.userData.step = step || 1;
    return g;
  }

  // la placa copia la transformación del sello original y cuelga de "attachTo" para
  // heredar su animación (el hierro, o la marca que aparece en el cuero)
  function plateFrom(target, attachTo, mat, bodyObj, id) {
    if (!target || !attachTo || !target.geometry) return null;
    const saved = target.scale.clone();
    target.scale.set(1, 1, 1);
    target.matrixAutoUpdate = true;
    target.updateMatrix();
    target.updateWorldMatrix(true, true);

    const M = target.matrixWorld;
    const geo = target.geometry;
    geo.computeBoundingBox();
    const lb = geo.boundingBox;
    const ls = lb.getSize(new THREE.Vector3());
    const c = lb.getCenter(new THREE.Vector3()).applyMatrix4(M);
    const wq = target.getWorldQuaternion(new THREE.Quaternion());

    const nrmL = new THREE.Vector3(0, 0, 1);
    if (ls.x <= ls.y && ls.x <= ls.z) nrmL.set(1, 0, 0);
    else if (ls.y <= ls.z) nrmL.set(0, 1, 0);
    const n = nrmL.applyQuaternion(wq).normalize();
    if (bodyObj) {
      const bodyC = new THREE.Box3().setFromObject(bodyObj).getCenter(new THREE.Vector3());
      if (n.dot(c.clone().sub(bodyC)) < 0) n.negate();
    } else if (n.z < 0) {
      n.negate();   // el lado legible del sello mira al frente (+Z)
    }

    const xAx = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), n);
    if (xAx.lengthSq() < 1e-6) xAx.set(1, 0, 0);
    xAx.normalize();
    const yAx = new THREE.Vector3().crossVectors(n, xAx).normalize();

    const dims = [ls.x, ls.y, ls.z].sort((a, b) => b - a);
    const side = Math.max(dims[0], 0.02) * 1.06;
    const thick = bodyObj ? 0.0035 : PLATE_THICK;
    const mc = id ? maskCache[id] : null;
    const step = bodyObj ? 3 : 1;
    const m = new THREE.Mesh(plateGeometry(side, thick, mc && mc.mask, mc && mc.n, step), mat);
    m.castShadow = true;
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAx, yAx, n));
    m.position.copy(c).addScaledVector(n, bodyObj ? 0.020 : 0);
    m.visible = false;
    rootModel.add(m);
    m.updateWorldMatrix(true, false);
    attachTo.attach(m);
    target.scale.copy(saved);
    target.updateMatrix();
    target.updateWorldMatrix(true, true);
    return m;
  }

  function solidMaterial(src, maskTex, cow) {
    if (!src) return null;
    const m = src.clone();
    m.alphaMap = maskTex;
    m.alphaTest = 0.5;
    m.side = cow ? THREE.DoubleSide : THREE.FrontSide;
    if (!cow) {
      m.emissive = new THREE.Color(0xff5410);
      m.emissiveIntensity = 0;
    }
    m.needsUpdate = true;
    return m;
  }

  function makePlatePair(id, maskTex) {
    const ironSrc = ironMarkObj && (Array.isArray(ironMarkObj.material) ? ironMarkObj.material[0] : ironMarkObj.material);
    const cowSrc = cowMarkObj && (Array.isArray(cowMarkObj.material) ? cowMarkObj.material[0] : cowMarkObj.material);
    const ironMat = solidMaterial(ironSrc, maskTex, false) || new THREE.MeshStandardMaterial({
      map: maskTex, color: 0x33322f, metalness: 0.95, roughness: 0.34,
      emissive: new THREE.Color(0xff5410), emissiveIntensity: 0
    });
    const cowMat = solidMaterial(cowSrc, maskTex, true) || new THREE.MeshStandardMaterial({
      map: maskTex, color: 0x2b211a, metalness: 0.12, roughness: 0.86
    });
    if (ironMat.emissive) ironMats.push(ironMat);
    plates[id] = {
      iron: plateFrom(ironMarkObj, ironMarkObj && ironMarkObj.parent, ironMat, null, id),
      cow: plateFrom(cowMarkObj, rootModel, cowMat, rootModel.getObjectByName('mesh_0'), id)
    };
  }

  // sello subido por el visitante: la máscara viene de un canvas, no de un archivo
  function buildExtra(md) {
    const cm = customMasks[md.id];
    if (!cm || !rootModel || !ironMarkObj) return;
    const maskTex = new THREE.CanvasTexture(cm.canvas);
    maskTex.colorSpace = THREE.NoColorSpace;
    maskTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    maskCache[md.id] = { mask: cm.mask, n: cm.n };
    makePlatePair(md.id, maskTex);
  }

  function buildPlates() {
    const aniso = renderer.capabilities.getMaxAnisotropy();
    for (const md of designs) {
      if (!md.mask) continue;
      const maskTex = new THREE.TextureLoader().load(md.mask);
      maskTex.colorSpace = THREE.NoColorSpace;
      maskTex.anisotropy = aniso;
      makePlatePair(md.id, maskTex);
      if (!maskCache[md.id]) loadMask(md.id, md.mask, () => rebuildPlate(md.id));
    }
    for (const md of extraDesigns) buildExtra(md);
    applyDesign(activeDesign);
  }

  function rebuildPlate(id) {
    const e = plates[id];
    const mc = maskCache[id];
    if (!e || !mc) return;
    for (const k of ['iron', 'cow']) {
      const mesh = e[k];
      if (!mesh || !mesh.geometry) continue;
      const ud = mesh.geometry.userData;
      mesh.geometry.dispose();
      mesh.geometry = plateGeometry(ud.side, ud.thick, mc.mask, mc.n, ud.step);
    }
  }

  // la marca del ganado está animada desde escala 0: las placas se arman recién cuando
  // el estampado ya está hecho y su matriz es medible
  function ensurePlates() {
    if (platesBuilt || !rootModel) return;
    if (cowMarkObj && cowMarkObj.scale.x < 0.5) return;
    platesBuilt = true;
    buildPlates();
  }

  function applyDesign(id) {
    const md = designs.concat(extraDesigns).find((d) => d.id === id) || designs[0];
    activeDesign = md.id;
    if (ironMarkObj) ironMarkObj.visible = md.id === 'jr';
    if (cowMarkObj) cowMarkObj.visible = md.id === 'jr';
    for (const k in plates) {
      if (plates[k].iron) plates[k].iron.visible = k === md.id;
      if (plates[k].cow) plates[k].cow.visible = k === md.id;
    }
    onDesign(md);
  }

  // ── capa de vida de la vaca (se suma después del mixer) ───────────────────
  function addBoneRot(bone, x, y, z) {
    if (!bone) return;
    eIdle.set(x, y, z);
    bone.quaternion.multiply(qIdle.setFromEuler(eIdle));
  }

  function cowIdle(t) {
    const br = Math.sin(t * Math.PI * 2 / 3.6);
    const br2 = Math.sin(t * Math.PI * 2 / 3.6 - 0.9);
    const chest = cowBones['Cow_Spine_02SHJnt_27'];
    if (chest) chest.scale.set(1 + 0.010 * br, 1 + 0.022 * br, 1 + 0.012 * br);
    addBoneRot(cowBones['Cow_Spine_03SHJnt_26'], 0.006 * br, 0, 0);
    addBoneRot(cowBones['Cow_Spine_04SHJnt_25'], 0.005 * br, 0, 0.007 * br2);
    addBoneRot(cowBones['Cow_Neck_TopSHJnt_19'], 0.018 * Math.sin(t * Math.PI * 2 / 5.1), 0, 0.014 * br2);
    addBoneRot(cowBones['Cow_Udder_01_01SHJnt_48'], 0.010 * br2, 0, 0.008 * br);
    for (let i = 0; i < TAIL_CHAIN.length; i++) {
      const ph = t * Math.PI * 2 / 2.4 - i * 0.5;
      const amp = 0.030 + i * 0.014;
      addBoneRot(cowBones[TAIL_CHAIN[i]], Math.sin(ph * 2) * amp * 0.35, 0, Math.sin(ph) * amp);
    }
    const ft = (t + 1.3) % 4.7;
    if (ft < 0.4) addBoneRot(cowBones['Cow_l_Ear_01_02SHJnt_14'], 0, 0, -0.20 * Math.sin((ft / 0.4) * Math.PI));
    const f2 = ft - 2.2;
    if (f2 > 0 && f2 < 0.4) addBoneRot(cowBones['Cow_r_Ear_01_02SHJnt_16'], 0, 0, 0.18 * Math.sin((f2 / 0.4) * Math.PI));
  }

  // ── encuadre en pantallas angostas ────────────────────────────────────────
  // La animación de cámara se armó para 16:9: en vertical el sujeto se sale del cuadro.
  // En vez de alejar la cámara se gira un poco la vista hacia el sello (con tope).
  const _aimAuth = new THREE.Vector3();
  const _aimWant = new THREE.Vector3();
  const _aimTarget = new THREE.Vector3();
  const _actionP = new THREE.Vector3();
  const _actionBB = new THREE.Box3();
  let cowAnchor = null;     // centro del cuerpo del animal
  let brandPoint = null;    // zona del lomo donde cae el marcado

  function framingBlend() {
    const a = camera.aspect;
    if (a >= 0.95) return 0;
    return Math.min(1, (0.95 - a) / 0.5);
  }

  // Momento de la marcación sobre el animal (segundos del clip).
  const BRAND_FROM = 5.2;
  const BRAND_TO = 8.2;

  const MAX_AIM = THREE.MathUtils.degToRad(32);
  const _anchorSize = new THREE.Vector3();

  // punto del lomo donde aparece la marca (sirve de ancla del encuadre)
  function brandAnchor(out) {
    if (!cowMarkObj) return null;
    _actionBB.setFromObject(cowMarkObj);
    if (_actionBB.isEmpty()) return null;
    _actionBB.getSize(_anchorSize);
    if (_anchorSize.lengthSq() < 1e-6) return null;   // todavía sin estampar
    return _actionBB.getCenter(out);
  }

  function aimAtAction() {
    const k = framingBlend();
    if (k <= 0.001) return;
    // rampa de entrada/salida para que el giro no corte de golpe
    const w = Math.min(1, (mixerTime - BRAND_FROM) / 0.5, (BRAND_TO - mixerTime) / 0.6);
    if (w <= 0) return;
    const anchor = brandAnchor(_actionP) || brandPoint;
    if (!anchor) return;

    _aimAuth.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _aimWant.copy(anchor).sub(camera.position);
    if (_aimWant.lengthSq() < 1e-6) return;
    _aimWant.normalize();

    const angle = _aimAuth.angleTo(_aimWant);
    if (angle < 1e-4) return;
    // gira hacia la marca sin pasar del tope (así no rompe el encuadre original)
    const strength = k * w;
    const t = Math.min(1, (MAX_AIM * strength) / angle) * strength;
    _aimTarget.copy(camera.position).addScaledVector(_aimAuth.lerp(_aimWant, t).normalize(), 2);
    camera.lookAt(_aimTarget);
  }

  // ── secuencia ─────────────────────────────────────────────────────────────
  function play() {
    if (!mixer) return;
    playing = true;
    dollyT = -1;
    if (controls) { controls.enabled = false; controls.autoRotate = false; }
    for (const a of actions) { a.reset(); a.play(); a.time = SEQ_START; }
    mixer.update(0);
    mixerTime = SEQ_START;
  }

  function finishSequence() {
    playing = false;
    scene.updateMatrixWorld(true);
    ensurePlates();

    const bb = new THREE.Box3();
    if (ironMarkObj) bb.expandByObject(ironMarkObj);
    if (bb.isEmpty() && ironRigObj) bb.expandByObject(ironRigObj);
    const sph = bb.getBoundingSphere(new THREE.Sphere());
    ironTarget.copy(sph.center);
    const radius = Math.max(sph.radius, 0.05);
    const fitDist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5));

    const dir = new THREE.Vector3(0, 0.20, 1).normalize();
    dollyFrom.copy(camera.position);
    dollyClose.copy(ironTarget).addScaledVector(dir, THREE.MathUtils.clamp(fitDist * 1.5, 0.20, 0.42));
    dollyOrbit.copy(ironTarget).addScaledVector(dir, THREE.MathUtils.clamp(fitDist * 4.9, 0.62, 1.05));
    dollyT = 0;
    onSequenceEnd();
  }

  function enableControls() {
    if (controls) {
      controls.enabled = true;
      controls.target.copy(ironTarget);
      controls.update();
    } else {
      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(ironTarget);
      controls.enableDamping = true;
      controls.dampingFactor = 0.075;
      controls.minDistance = 0.45;
      controls.maxDistance = 4.5;
      controls.maxPolarAngle = Math.PI * 0.52;
      controls.update();
    }
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.7;
    onOrbit();
  }

  // ── bucle ─────────────────────────────────────────────────────────────────
  let fpsAcc = 0, fpsFrames = 0;

  function animate() {
    rafId = requestAnimationFrame(animate);
    if (!active) return;
    const dt = Math.min(clock.getDelta(), 0.05);

    if (mixer && playing) {
      mixer.update(dt);
      mixerTime += dt;
      const t = mixerTime;

      let glow = 0;
      if (t < 2.25) glow = 2.6;
      else if (t < 7.5) glow = 2.6 * (1 - (t - 2.25) / 5.25);
      for (const m of ironMats) m.emissiveIntensity = glow;
      const pulse = 2.6 + Math.sin(t * 7) * 0.5;
      for (const m of fireMats) m.emissiveIntensity = pulse;

      cowIdle(t);

      if (camRig) {
        camRig.updateWorldMatrix(true, false);
        tmpPos.setFromMatrixPosition(camRig.matrixWorld);
        tmpQuat.setFromRotationMatrix(camRig.matrixWorld);
        camera.position.copy(tmpPos);
        camera.quaternion.copy(tmpQuat);
        aimAtAction();
      }

      if (mixerTime >= seqDuration) { playing = false; finishSequence(); }
    } else if (dollyT >= 0 && dollyT < FINAL_MOVE_END) {
      dollyT = Math.min(FINAL_MOVE_END, dollyT + dt);
      const e = (v) => 1 - Math.pow(1 - v, 3);
      if (dollyT < DOLLY_CLOSE_END) {
        camera.position.lerpVectors(dollyFrom, dollyClose, e(dollyT / DOLLY_CLOSE_END));
      } else if (dollyT < DOLLY_HOLD_END) {
        camera.position.copy(dollyClose);
      } else {
        camera.position.lerpVectors(dollyClose, dollyOrbit, e((dollyT - DOLLY_HOLD_END) / (FINAL_MOVE_END - DOLLY_HOLD_END)));
      }
      camera.lookAt(ironTarget);
      if (dollyT >= FINAL_MOVE_END) enableControls();
    } else if (controls && controls.enabled) {
      controls.update();
    }

    renderFrame();

    // fps
    fpsAcc += dt;
    fpsFrames++;
    if (fpsAcc >= 0.5) {
      onFps(Math.round(fpsFrames / fpsAcc));
      fpsAcc = 0;
      fpsFrames = 0;
    }
  }

  // ── carga del modelo ──────────────────────────────────────────────────────
  // GitHub Pages a veces responde 503 o corta la descarga a medias: en vez de
  // quedarnos para siempre en el 0% del loader, reintentamos y, si no hay
  // suerte, avisamos al visitante en lugar de dejarlo mirando una pantalla negra.
  const LOAD_ATTEMPTS = 3;
  const LOAD_STALL_MS = 15000;
  let loadAttempt = 0;
  let loadingModel = false;

  function bust(url, attempt) {
    if (attempt <= 1) return url;
    return url + (url.indexOf("?") === -1 ? "?" : "&") + "reintento=" + attempt;
  }

  /** descarga el .glb con progreso y aborta si la conexión se queda muda */
  async function fetchModel(attempt) {
    const ctrl = new AbortController();
    let stall = 0;
    const bump = () => {
      clearTimeout(stall);
      stall = setTimeout(() => ctrl.abort(), LOAD_STALL_MS);
    };
    bump();
    try {
      const res = await fetch(bust(modelUrl, attempt), { signal: ctrl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const total = Number(res.headers.get("content-length")) || 0;
      if (!res.body) return await res.arrayBuffer();
      const reader = res.body.getReader();
      const chunks = [];
      let loaded = 0;
      for (;;) {
        const step = await reader.read();
        if (step.done) break;
        bump();
        chunks.push(step.value);
        loaded += step.value.length;
        if (total) onProgress(Math.min(0.99, loaded / total));
      }
      const bytes = new Uint8Array(loaded);
      let off = 0;
      for (const c of chunks) { bytes.set(c, off); off += c.length; }
      onProgress(1);
      return bytes.buffer;
    } finally {
      clearTimeout(stall);
    }
  }

  function startLoad() {
    if (loadingModel) return;
    loadingModel = true;
    loadAttempt = 0;
    tryLoad();
  }

  function tryLoad() {
    loadAttempt++;
    const attempt = loadAttempt;
    onStatus(attempt > 1 ? "Reintentando la descarga (" + attempt + "/" + LOAD_ATTEMPTS + ")…" : "");
    fetchModel(attempt)
      .then((buffer) => new GLTFLoader().parse(buffer, "", (gltf) => initModel(gltf), (e) => retryOrFail(e, attempt)))
      .catch((e) => retryOrFail(e, attempt));
  }

  function retryOrFail(err, attempt) {
    console.error("[viewer] no se pudo cargar el modelo (intento " + attempt + ")", err);
    if (attempt < LOAD_ATTEMPTS) {
      window.setTimeout(tryLoad, 1200 * attempt);
      return;
    }
    loadingModel = false;
    onStatus("");
    onError(err);
  }

  function initModel(gltf) {
    const model = gltf.scene;
    rootModel = model;
    model.traverse((o) => {
      if (!o.isMesh) return;
      const isGround = o.name.indexOf('terrain_terrain') === 0 || o.name.indexOf('Env_Ground') === 0 || o.name.indexOf('Ground_Ground') === 0;
      o.castShadow = !isGround;
      o.receiveShadow = true;
      const isIronMesh = o.name.indexOf('BrandIron') === 0;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        if (isIronMesh && m.name && (m.name.indexOf('Scene_-_Root') === 0 || m.name.indexOf('Iron_Black') === 0)) {
          m.emissive = new THREE.Color(0xff5410);
          m.emissiveIntensity = 0;
          m.needsUpdate = true;
          if (!ironMats.includes(m)) ironMats.push(m);
        }
        if (m.name && m.name.indexOf('Env_Fire') === 0) {
          m.emissive = new THREE.Color(0xff5a12);
          m.emissiveIntensity = 3;
          if (!fireMats.includes(m)) fireMats.push(m);
        }
        if (m.name === 'Iron_Black') {
          m.metalness = 1.0;
          m.roughness = 0.30;
          m.needsUpdate = true;
        }
        if (m.name === 'Glass.001') {
          m.emissive = new THREE.Color(0xffbe6a);
          m.emissiveIntensity = 3.4;
          m.transparent = false;
          m.opacity = 1;
          m.metalness = 0;
          m.roughness = 0.35;
          m.needsUpdate = true;
        }
        if (m.name === 'Furnace_2') {
          m.emissive = new THREE.Color(0xff6a1e);
          m.emissiveIntensity = 2.4;
          m.needsUpdate = true;
        }
      }
    });
    scene.add(model);

    camRig = model.getObjectByName('Cam_Main');
    for (const n of COW_BONES) {
      const b = model.getObjectByName(n);
      if (b) cowBones[n] = b;
    }

    ironMarkObj = model.getObjectByName('BrandIron_Mark');
    ironRigObj = model.getObjectByName('BrandIron_Rig') || ironMarkObj;
    cowMarkObj = model.getObjectByName('Cow_Brand');
    if (ironRigObj) {
      const box = new THREE.Box3().setFromObject(ironRigObj);
      box.getCenter(ironTarget);
    }
    // referencia para el encuadre vertical: lomo del animal (donde cae la marca)
    const body = model.getObjectByName('mesh_0');
    if (body) {
      const bb = new THREE.Box3().setFromObject(body);
      if (!bb.isEmpty()) {
        const size = bb.getSize(new THREE.Vector3());
        cowAnchor = bb.getCenter(new THREE.Vector3());
        brandPoint = cowAnchor.clone().add(new THREE.Vector3(0, size.y * 0.26, 0));
      }
    }

    const clips = (gltf.animations || []).filter((c) => WANTED_CLIPS.indexOf(c.name) !== -1);
    if (clips.length) {
      mixer = new THREE.AnimationMixer(model);
      for (const c of clips) {
        const a = mixer.clipAction(c);
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
        actions.push(a);
        seqDuration = Math.max(seqDuration, c.duration);
      }
      ready = true;
      play();
    } else {
      ready = true;
      finishSequence();
    }

    resize();
    onReady({ clips: clips.length, duration: seqDuration });
    loadingModel = false;
  }

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
    renderFrame();
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(container);
  resize();
  animate();
  startLoad();

  // ── api pública ───────────────────────────────────────────────────────────
  return {
    isReady: () => ready,
    play,
    /** vuelve a intentar la descarga del modelo (botón "Reintentar" del loader) */
    reload: startLoad,
    setDesign(id) {
      ensurePlates();
      applyDesign(id);
      renderFrame();
    },
    /**
     * Sella un diseño subido por el visitante (máscara ya procesada en el navegador).
     * @param {{id?:string, tag:string, name:string, desc:string, img:string,
     *          maskData:Uint8Array, maskCanvas:HTMLCanvasElement, n:number}} design
     */
    addDesign(design) {
      if (!design || !design.maskData || !design.maskCanvas) return false;
      const id = design.id || 'custom';
      const md = {
        id,
        tag: design.tag || 'MI LOGO',
        name: design.name || 'Personalizado',
        desc: design.desc || 'Tu marca',
        img: design.img || ''
      };
      const prev = extraDesigns.findIndex((d) => d.id === id);
      if (prev >= 0) extraDesigns.splice(prev, 1);
      extraDesigns.push(md);
      customMasks[id] = { mask: design.maskData, n: design.n || 384, canvas: design.maskCanvas };

      // si las placas ya existen, se reemplaza en el acto
      const old = plates[id];
      if (old) {
        for (const k of ['iron', 'cow']) {
          const mesh = old[k];
          if (!mesh) continue;
          if (mesh.parent) mesh.parent.remove(mesh);
          if (mesh.geometry) mesh.geometry.dispose();
        }
        delete plates[id];
      }
      if (platesBuilt && rootModel && ironMarkObj) buildExtra(md);
      applyDesign(id);
      renderFrame();
      return true;
    },
    getDesign: () => activeDesign,
    setAutoRotate(on) {
      if (!controls) return false;
      controls.autoRotate = !!on;
      return controls.autoRotate;
    },
    isAutoRotate: () => !!(controls && controls.autoRotate),
    resetView() {
      if (!controls) return;
      controls.target.copy(ironTarget);
      camera.position.copy(dollyOrbit);
      camera.lookAt(ironTarget);
      controls.update();
      renderFrame();
    },
    capture() {
      renderFrame();
      return renderer.domElement.toDataURL('image/png');
    },
    /** estado interno, útil para ajustar tiempos de cámara */
    debug() {
      camera.updateMatrixWorld(true);
      const proj = (p) => {
        if (!p) return null;
        const v = p.clone().project(camera);
        return [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(3)];
      };
      const iron = ironMarkObj ? new THREE.Box3().setFromObject(ironMarkObj).getCenter(new THREE.Vector3()) : null;
      const cowMark = cowMarkObj
        ? new THREE.Box3().setFromObject(cowMarkObj).getCenter(new THREE.Vector3())
        : null;
      const focus = [proj(iron), proj(brandPoint), proj(cowMark)];

      return {
        playing, ready, mixerTime: +mixerTime.toFixed(2), dollyT: +dollyT.toFixed(2),
        design: activeDesign, distance: +camera.position.distanceTo(ironTarget).toFixed(3),
        aspect: +camera.aspect.toFixed(3), focus
      };
    },
    /** salta a un instante de la secuencia (para revisar encuadres) */
    seek(t) {
      if (!mixer) return;
      playing = false;
      if (controls) controls.enabled = false;
      for (const a of actions) { a.reset(); a.play(); a.time = t; }
      mixer.update(0);
      mixerTime = t;
      if (camRig) {
        camRig.updateWorldMatrix(true, false);
        camera.position.setFromMatrixPosition(camRig.matrixWorld);
        camera.quaternion.setFromRotationMatrix(camRig.matrixWorld);
        aimAtAction();
      }
      cowIdle(t);
      renderFrame();
    },
    setActive(v) {
      const next = !!v;
      if (next === active) return;
      active = next;
      if (next) clock.getDelta();
    },
    dispose() {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.dispose();
    }
  };
}
