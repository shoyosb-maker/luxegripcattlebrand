/**
 * Procesa un logo subido por el visitante y devuelve lo que necesita el visor:
 *
 *   maskCanvas  canvas en escala de grises con la silueta (alphaMap + canto de la placa)
 *   maskData    los mismos píxeles en un Uint8Array (para cerrar el canto)
 *   previewUrl  PNG dorado con transparencia para la tarjeta del selector
 *
 * Todo ocurre en el navegador: la imagen no se sube a ningún servidor.
 * Acepta PNG con transparencia y también JPG/WebP con fondo claro u oscuro.
 */

const SIZE = 384;      // resolución de la máscara que usa el visor
const WORK = 512;      // resolución máxima de trabajo

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

/** percentil sobre un histograma de 256 cubetas */
function percentile(hist, total, q) {
  const target = total * q;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= target) return i / 255;
  }
  return 1;
}

/** erosión / dilatación 3×3 sobre una máscara binaria (para sacar motas) */
function morph(bin, w, h, mode) {
  const out = new Uint8Array(bin.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = mode === 'min' ? 1 : 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          const s = bin[yy * w + xx];
          if (mode === 'min') { if (s === 0) { v = 0; } } else if (s === 1) { v = 1; }
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / Math.max(1e-6, e1 - e0)));
  return t * t * (3 - 2 * t);
}

export async function processLogoFile(file) {
  const img = await loadImage(file);
  const iw = img.naturalWidth || img.width || 256;
  const ih = img.naturalHeight || img.height || 256;
  const scale = Math.min(1, WORK / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));

  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(img, 0, 0, w, h);
  const px = sctx.getImageData(0, 0, w, h).data;

  // ¿la imagen ya trae transparencia?
  let translucent = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 220) translucent++;
  const hasAlpha = translucent > w * h * 0.04;

  const raw = new Float32Array(w * h);
  if (hasAlpha) {
    for (let i = 0, p = 0; i < raw.length; i++, p += 4) raw[i] = px[p + 3] / 255;
  } else {
    // sin alfa: se usa la luminancia. Si el borde es claro, el logo es oscuro y se invierte.
    let border = 0, n = 0;
    const sample = (x, y) => {
      const p = (y * w + x) * 4;
      return (0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2]) / 255;
    };
    for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 40))) {
      border += sample(x, 0) + sample(x, h - 1);
      n += 2;
    }
    for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 40))) {
      border += sample(0, y) + sample(w - 1, y);
      n += 2;
    }
    const lightBg = border / Math.max(1, n) > 0.5;
    const hist = new Uint32Array(256);
    for (let i = 0, p = 0; i < raw.length; i++, p += 4) {
      const l = 0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2];
      raw[i] = l / 255;
      hist[Math.min(255, Math.round(l))]++;
    }
    const total = raw.length;
    const lo = percentile(hist, total, 0.04);
    const hi = percentile(hist, total, 0.96);
    const span = Math.max(0.08, hi - lo);
    for (let i = 0; i < raw.length; i++) {
      const v = Math.min(1, Math.max(0, (raw[i] - lo) / span));
      raw[i] = lightBg ? 1 - v : v;
    }
  }

  // recorte suave + binarización para limpiar motas del borde
  const soft = new Float32Array(raw.length);
  const bin = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const s = smoothstep(0.34, 0.62, raw[i]);
    soft[i] = s;
    bin[i] = s > 0.5 ? 1 : 0;
  }
  let clean = morph(bin, w, h, 'min');
  clean = morph(clean, w, h, 'max');   // apertura: saca puntos sueltos
  clean = morph(clean, w, h, 'max');
  clean = morph(clean, w, h, 'min');   // cierre: tapa agujeritos

  let solid = 0;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (clean[i]) {
        solid++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      } else {
        soft[i] = 0;
      }
    }
  }
  if (solid < w * h * 0.004) throw new Error('No se reconoció el logo. Probá con un PNG de fondo transparente.');

  // recorte cuadrado con margen y escalado a SIZE
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const side = Math.max(cw, ch) * 1.09;
  const cx = (x0 + x1 + 1) / 2;
  const cy = (y0 + y1 + 1) / 2;

  const gray = document.createElement('canvas');
  gray.width = w;
  gray.height = h;
  const gctx = gray.getContext('2d');
  const gimg = gctx.createImageData(w, h);
  for (let i = 0; i < soft.length; i++) {
    const v = Math.round(soft[i] * 255);
    gimg.data[i * 4] = v;
    gimg.data[i * 4 + 1] = v;
    gimg.data[i * 4 + 2] = v;
    gimg.data[i * 4 + 3] = 255;
  }
  gctx.putImageData(gimg, 0, 0);

  const mask = document.createElement('canvas');
  mask.width = SIZE;
  mask.height = SIZE;
  const mctx = mask.getContext('2d', { willReadFrequently: true });
  mctx.fillStyle = '#000';
  mctx.fillRect(0, 0, SIZE, SIZE);
  mctx.imageSmoothingEnabled = true;
  mctx.drawImage(gray, cx - side / 2, cy - side / 2, side, side, 0, 0, SIZE, SIZE);

  const maskData = new Uint8Array(SIZE * SIZE);
  const mpx = mctx.getImageData(0, 0, SIZE, SIZE).data;
  for (let i = 0; i < maskData.length; i++) maskData[i] = mpx[i * 4];

  // miniatura dorada para la tarjeta
  const prev = document.createElement('canvas');
  prev.width = SIZE;
  prev.height = SIZE;
  const pctx = prev.getContext('2d');
  const pimg = pctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < maskData.length; i++) {
    pimg.data[i * 4] = 217;
    pimg.data[i * 4 + 1] = 174;
    pimg.data[i * 4 + 2] = 88;
    pimg.data[i * 4 + 3] = maskData[i];
  }
  pctx.putImageData(pimg, 0, 0);

  return {
    maskCanvas: mask,
    maskData,
    n: SIZE,
    previewUrl: prev.toDataURL('image/png')
  };
}
