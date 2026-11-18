/**
 * Punto de entrada: arma el visor 3D y le pasa los ganchos a la interfaz.
 */

import { SITE, DESIGNS, MODEL_URL } from './config.js';
import { createViewer } from './viewer.js';
import { initUI } from './ui.js';

let ui = null;

const viewer = createViewer({
  container: document.getElementById('viewer'),
  modelUrl: MODEL_URL,
  designs: DESIGNS,
  onProgress: (p) => ui && ui.progress(p),
  onStatus: (msg) => ui && ui.status(msg),
  onError: (err) => ui && ui.fail(err),
  onReady: () => ui && ui.ready(),
  onSequenceEnd: () => { /* el acercamiento al logo ya está en marcha */ },
  onOrbit: () => { /* vista 360 lista: los controles quedan habilitados */ },
  onDesign: (d) => ui && ui.setDesign(d),
  onFps: (n) => ui && ui.fps(n)
});

ui = initUI(SITE, DESIGNS, viewer);
ui.setDesign(DESIGNS.find((d) => d.id === viewer.getDesign()) || DESIGNS[0]);

window.luxegrip = { viewer, ui, SITE, DESIGNS };
