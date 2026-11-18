/**
 * Datos del sitio y catálogo de diseños.
 *
 * Todo el texto comercial vive acá: para cambiar una bajada, un paso del proceso o
 * los datos de contacto no hace falta tocar el HTML.
 *
 * Cada diseño necesita:
 *   id    identificador interno (también es el nombre de archivo de la máscara)
 *   tag   sigla que va sobre el hierro
 *   name  nombre corto del diseño
 *   desc  bajada de una línea para la ficha
 *   img   PNG dorado con transparencia (tarjetas y selector)
 *   mask  PNG en escala de grises con la silueta (recorte + canto de la placa).
 *         Los diseños que no lo tienen usan la geometría original del modelo.
 */

export const SITE = {
  name: 'LuxeGrip',
  full: 'LuxeGrip Cattle Brand',
  tagline: 'Marcas de ganado en 3D',
  hero: {
    eyebrow: 'LuxeGrip · Marcas de ganado en 3D',
    title: 'Tu marca,',
    titleAccent: 'forjada al rojo vivo',
    sub: 'Elegí el diseño, mirá la marcación en 3D y encargá tu hierro a medida.',
    specs: [
      { value: '17', label: 'diseños' },
      { value: '13 mm', label: 'de acero' },
      { value: '360°', label: 'vista' }
    ]
  },
  nav: [
    { href: '#disenos', label: 'Diseños' },
    { href: '#proceso', label: 'Proceso' },
    { href: '#especificaciones', label: 'Ficha técnica' },
    { href: '#contacto', label: 'Contacto' }
  ],
  cta: { label: 'Cotizar mi marca', href: '#contacto' },
  process: [
    {
      step: '01',
      title: 'Elegís el diseño',
      text: 'Recorré los diseños del catálogo o traenos tu propia marca dibujada: la pasamos al hierro respetando cada trazo.'
    },
    {
      step: '02',
      title: 'Se forja el hierro',
      text: 'Placa de acero de 13 mm cortada y pulida a mano, con el sello en relieve para que el marcado salga nítido.'
    },
    {
      step: '03',
      title: 'Se prueba en el campo',
      text: 'Cada pieza se prueba en cuero antes de entregarse: mirá el resultado en la vista 3D antes de encargarla.'
    }
  ],
  specs: [
    { k: 'Material', v: 'Acero al carbono, terminación hierro negro' },
    { k: 'Espesor del sello', v: '13 mm' },
    { k: 'Medida del cabezal', v: '10 × 8,5 cm (a medida según el diseño)' },
    { k: 'Mango', v: 'Varilla de acero con puño de madera' },
    { k: 'Personalización', v: 'Diseños del catálogo o marca propia' },
    { k: 'Producción', v: 'Artesanal, por encargo' }
  ],
  contact: {
    title: 'Encargá tu marca',
    text: 'Contanos qué diseño te gustó y para cuándo lo necesitás. Respondemos con presupuesto y plazo de entrega.',
    email: 'hola@luxegrip.com',
    phone: '+54 9 11 0000 0000',
    whatsapp: 'https://wa.me/5491100000000'
  }
};

export const DESIGNS = [
  { id: 'jr',   tag: 'JR',    name: 'Clásico',   desc: 'Toro + JR',            img: 'assets/marcadores/jr.png' },
  { id: 'sg',   tag: 'SG',    name: 'Corona',    desc: 'Toro coronado',        img: 'assets/marcadores/sg.png',   mask: 'assets/marcadores/mask_sg.png' },
  { id: 'ae',   tag: 'AE',    name: 'Silueta',   desc: 'Vaca en línea',        img: 'assets/marcadores/ae.png',   mask: 'assets/marcadores/mask_ae.png' },
  { id: 'midv', tag: 'MI DV', name: 'Lazo',      desc: 'Cabeza de vaca',       img: 'assets/marcadores/midv.png', mask: 'assets/marcadores/mask_midv.png' },
  { id: 'am22', tag: 'AM 22', name: 'Cuernos',   desc: 'Toro abierto',         img: 'assets/marcadores/am22.png', mask: 'assets/marcadores/mask_am22.png' },
  { id: 'r3',   tag: '3R',    name: 'Herradura', desc: 'Corona + herradura',   img: 'assets/marcadores/r3.png',   mask: 'assets/marcadores/mask_r3.png' },
  { id: 'fng',  tag: 'FNG',   name: 'Rodeo',     desc: 'Caballo y oveja',      img: 'assets/marcadores/fng.png',  mask: 'assets/marcadores/mask_fng.png' },
  { id: 'dm',   tag: 'DM',    name: 'Línea',     desc: 'Cabeza en trazo',      img: 'assets/marcadores/dm.png',   mask: 'assets/marcadores/mask_dm.png' },
  { id: 'rp',   tag: 'RP',    name: 'Real',      desc: 'Toro coronado',        img: 'assets/marcadores/rp.png',   mask: 'assets/marcadores/mask_rp.png' },
  { id: 've',   tag: 'VE',    name: 'Fina',      desc: 'Toro de perfil',       img: 'assets/marcadores/ve.png',   mask: 'assets/marcadores/mask_ve.png' },
  { id: 'jsg',  tag: 'JSG',   name: 'Cruz',      desc: 'Toro y cruz',          img: 'assets/marcadores/jsg.png',  mask: 'assets/marcadores/mask_jsg.png' },
  { id: 'ev',   tag: 'EV',    name: 'Sello',     desc: 'Herradura circular',   img: 'assets/marcadores/ev.png',   mask: 'assets/marcadores/mask_ev.png' },
  { id: 'ds',   tag: 'DS',    name: 'Doble',     desc: 'Caballo y novillo',    img: 'assets/marcadores/ds.png',   mask: 'assets/marcadores/mask_ds.png' },
  { id: 'ach',  tag: 'ACH',   name: 'Fe',        desc: 'Novillo y cruz',       img: 'assets/marcadores/ach.png',  mask: 'assets/marcadores/mask_ach.png' },
  { id: 'jhc',  tag: 'JHC',   name: 'Corazón',   desc: 'Oveja y corazón',      img: 'assets/marcadores/jhc.png',  mask: 'assets/marcadores/mask_jhc.png' },
  { id: 'als',  tag: 'ALS',   name: 'Asta',      desc: 'Cuernos y sigla',      img: 'assets/marcadores/als.png',  mask: 'assets/marcadores/mask_als.png' },
  { id: 'as',   tag: 'A S',   name: 'Reina',     desc: 'Corazón y corona',     img: 'assets/marcadores/as.png',   mask: 'assets/marcadores/mask_as.png' }
];

export const MODEL_URL = 'assets/models/brand_scene.glb';

export function designById(id) {
  return DESIGNS.find((d) => d.id === id) || DESIGNS[0];
}
