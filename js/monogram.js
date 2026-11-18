/**
 * Arma una sigla de 1 a 3 letras como si fuera una marca de ganado forjada:
 * dibuja las letras en un canvas y devuelve la misma estructura que processLogoFile
 * (maskCanvas, maskData, n y previewUrl), así el visor la sella igual que un logo subido.
 */

import { maskFromCanvas } from './logo.js';

const SIZE = 512;                       // resolución de trabajo
const BASE = 400;                       // cuerpo de referencia para medir las letras
const FONT = 'Georgia, "Times New Roman", serif';
const CAP_RATIO = 0.69;                 // altura de mayúscula de Georgia, en em

export const MONOGRAM_MAX = 3;

/** limpia lo que llega de la interfaz: solo A-Z, en mayúscula, hasta 3 letras */
export function normalizeMonogram(text) {
  return String(text || '').toUpperCase().normalize('NFD').replace(/[^A-Z]/g, '').slice(0, MONOGRAM_MAX);
}

export function buildMonogram(input) {
  const text = normalizeMonogram(input);
  if (!text) return null;

  const chars = text.split('');
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#fff';

  // medir en un cuerpo grande y después escalar: así el ajuste es estable
  g.font = `700 ${BASE}px ${FONT}`;
  const widths = chars.map((ch) => g.measureText(ch).width);
  const gapBase = chars.length > 1 ? BASE * 0.03 : 0;
  const total = widths.reduce((a, b) => a + b, 0) + gapBase * (chars.length - 1);

  const scale = Math.min((SIZE * 0.88) / total, (SIZE * 0.78) / (BASE * CAP_RATIO));
  const fontPx = BASE * scale;
  const gap = gapBase * scale;
  const capH = fontPx * CAP_RATIO;

  g.font = `700 ${fontPx}px ${FONT}`;
  let x = (SIZE - (total * scale)) / 2;
  const baseline = SIZE / 2 + capH / 2;

  chars.forEach((ch, i) => {
    const w = widths[i] * scale;
    // micro desfase y giro alternos: da el aire de letra estampada a mano
    const sign = i % 2 === 0 ? -1 : 1;
    const dy = chars.length > 1 ? sign * fontPx * 0.014 : 0;
    const rot = chars.length > 1 ? sign * 0.012 : 0;
    g.save();
    g.translate(x + w / 2, baseline + dy);
    g.rotate(rot);
    g.fillText(ch, 0, 0);
    g.restore();
    x += w + gap;
  });

  return maskFromCanvas(canvas);
}
