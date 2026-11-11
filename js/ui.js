/**
 * Interfaz del sitio: contenido estático, selector de diseños, barra del visor,
 * formulario de contacto y detalles de presentación.
 */

import { processLogoFile } from './logo.js';

const $ = (sel) => document.querySelector(sel);

export function initUI(site, designs, viewer) {
  const els = {
    head: $('#siteHead'),
    nav: $('#siteNav'),
    navToggle: $('#navToggle'),
    headCta: $('#headCta'),
    heroEyebrow: $('#heroEyebrow'),
    heroTitle: $('#heroTitle'),
    heroAccent: $('#heroAccent'),
    heroSub: $('#heroSub'),
    heroSpecs: $('#heroSpecs'),
    panel: $('#panel'),
    sheetGrip: $('#sheetGrip'),
    designGrid: $('#designGrid'),
    btnUpload: $('#btnUpload'),
    logoInput: $('#logoInput'),
    panelHint: $('#panelHint'),
    designTag: $('#designTag'),
    designName: $('#designName'),
    designDesc: $('#designDesc'),
    designCta: $('#designCta'),
    ctaTag: $('#ctaTag'),
    btnApply: $('#btnApply'),
    btnOrbit: $('#btnOrbit'),
    btnPlay: $('#btnPlay'),
    btnCapture: $('#btnCapture'),
    btnReset: $('#btnReset'),
    catalog: $('#catalogGrid'),
    processList: $('#processList'),
    specList: $('#specList'),
    contactTitle: $('#contactTitle'),
    contactText: $('#contactText'),
    contactMail: $('#contactMail'),
    contactWpp: $('#contactWpp'),
    contactForm: $('#contactForm'),
    fieldName: $('#fieldName'),
    fieldDesign: $('#fieldDesign'),
    fieldMsg: $('#fieldMsg'),
    formNote: $('#formNote'),
    year: $('#year'),
    loader: $('#loader'),
    bar: $('#bar'),
    loaderPct: $('#loaderPct')
  };

  const isMobile = () => window.matchMedia('(max-width: 860px)').matches;

  // ── contenido estático ───────────────────────────────────────────────────
  els.heroEyebrow.textContent = site.hero.eyebrow;
  els.heroTitle.textContent = site.hero.title;
  els.heroAccent.textContent = site.hero.titleAccent;
  els.heroSub.textContent = site.hero.sub;
  els.headCta.textContent = site.cta.label;

  els.heroSpecs.innerHTML = site.hero.specs
    .map((s) => `<li><b>${s.value}</b>${s.label}</li>`)
    .join('') + '<li class="fps"><b id="statFps">—</b>fps</li>';

  els.nav.innerHTML = site.nav
    .map((n) => `<a href="${n.href}">${n.label}</a>`)
    .join('');

  els.processList.innerHTML = site.process
    .map((p) => `<li data-reveal><span class="step-n">${p.step}</span><h3>${p.title}</h3><p>${p.text}</p></li>`)
    .join('');

  els.specList.innerHTML = site.specs
    .map((s) => `<div><dt>${s.k}</dt><dd>${s.v}</dd></div>`)
    .join('');

  els.contactTitle.textContent = site.contact.title;
  els.contactText.textContent = site.contact.text;
  els.contactMail.textContent = site.contact.email;
  els.contactMail.href = `mailto:${site.contact.email}`;
  els.contactWpp.href = site.contact.whatsapp;
  els.year.textContent = new Date().getFullYear();

  // catálogo completo
  els.catalog.innerHTML = designs.map((d) => `
    <article class="cat-card" data-design="${d.id}" data-reveal role="button" tabindex="0">
      <img src="${d.img}" alt="Diseño ${d.tag} ${d.name}" loading="lazy" />
      <b>${d.tag}</b>
      <small>${d.name}</small>
      <span class="cat-play">Ver en 3D</span>
    </article>`).join('');

  // selector del panel
  els.designGrid.innerHTML = designs.map((d) => `
    <button class="dg-card" type="button" data-design="${d.id}" role="option" aria-selected="false"
            title="${d.tag} · ${d.name}">
      <img src="${d.img}" alt="${d.tag}" loading="lazy" />
      <span>${d.tag}</span>
    </button>`).join('');

  // desplegable del formulario
  els.fieldDesign.innerHTML =
    `<option value="">Todavía no decidí</option>` +
    designs.map((d) => `<option value="${d.tag} · ${d.name}">${d.tag} · ${d.name}</option>`).join('');

  // ── estado del visor ─────────────────────────────────────────────────────
  const chips = [els.btnOrbit, els.btnPlay, els.btnCapture, els.btnReset];

  function progress(p) {
    const pct = Math.round(p * 100);
    els.bar.style.width = pct + '%';
    els.loaderPct.textContent = pct + '%';
  }

  function ready() {
    els.loader.classList.add('is-done');
    chips.forEach((c) => { c.disabled = false; });
    window.setTimeout(() => { els.loader.style.display = 'none'; }, 700);
  }

  function fps(n) {
    const el = document.getElementById('statFps');
    if (el) el.textContent = n;
  }

  function setDesign(d) {
    els.designTag.textContent = d.tag;
    els.designName.textContent = d.name;
    els.designDesc.textContent = d.desc;
    els.ctaTag.textContent = d.tag;
    for (const card of els.designGrid.children) {
      const on = card.dataset.design === d.id;
      card.classList.toggle('is-active', on);
      card.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    els.fieldDesign.value = `${d.tag} · ${d.name}`;
  }

  // ── interacción: elegir diseño ───────────────────────────────────────────
  function pickDesign(id, replay) {
    viewer.setDesign(id);
    if (replay) viewer.play();
  }

  els.designGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.dg-card');
    if (!card) return;
    pickDesign(card.dataset.design, false);
    if (isMobile()) els.panel.classList.remove('is-open');
  });

  els.catalog.addEventListener('click', (e) => {
    const card = e.target.closest('.cat-card');
    if (!card) return;
    els.panel.classList.remove('is-open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => pickDesign(card.dataset.design, true), 420);
  });
  els.catalog.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.cat-card');
    if (!card) return;
    e.preventDefault();
    card.click();
  });

  // ── logo propio del visitante ────────────────────────────────────────────
  function customCardMarkup(url, label) {
    return '<button class="dg-card dg-custom" type="button" data-design="custom" role="option" ' +
      'aria-selected="false" title="' + label + '">' +
      '<img src="' + url + '" alt="' + label + '" />' +
      '<span>MI LOGO</span></button>';
  }

  els.btnUpload.addEventListener('click', () => els.logoInput.click());

  els.logoInput.addEventListener('change', async () => {
    const file = els.logoInput.files && els.logoInput.files[0];
    if (!file) return;
    const labelEl = els.btnUpload.querySelector('span:last-child');
    els.btnUpload.classList.add('is-busy');
    labelEl.textContent = 'Procesando…';
    els.panelHint.classList.remove('is-error');
    els.panelHint.textContent = 'Leyendo el logo…';
    try {
      const out = await processLogoFile(file);
      const label = (file.name.replace(/\.[^.]+$/, '') || 'Tu marca').slice(0, 28);

      // tarjeta y opción del formulario antes de seleccionarlo
      const existing = els.designGrid.querySelector('.dg-custom');
      if (existing) {
        existing.querySelector('img').src = out.previewUrl;
        existing.title = label;
      } else {
        els.designGrid.insertAdjacentHTML('beforeend', customCardMarkup(out.previewUrl, label));
      }
      els.designGrid.scrollTop = els.designGrid.scrollHeight;
      let opt = els.fieldDesign.querySelector('option[data-custom="1"]');
      if (!opt) {
        opt = document.createElement('option');
        opt.dataset.custom = '1';
        opt.value = 'MI LOGO · Personalizado';
        els.fieldDesign.appendChild(opt);
      }
      opt.textContent = 'MI LOGO · ' + label;

      viewer.addDesign({
        id: 'custom',
        tag: 'MI LOGO',
        name: 'Personalizado',
        desc: label,
        img: out.previewUrl,
        maskData: out.maskData,
        maskCanvas: out.maskCanvas,
        n: out.n
      });
      els.panelHint.textContent = '“' + label + '” listo: mirá cómo queda el hierro y la marca en el ganado.';
      viewer.play();
      if (isMobile()) els.panel.classList.remove('is-open');
    } catch (err) {
      els.panelHint.classList.add('is-error');
      els.panelHint.textContent = err && err.message
        ? err.message
        : 'No se pudo leer el logo. Probá con un PNG de fondo transparente.';
    } finally {
      els.btnUpload.classList.remove('is-busy');
      labelEl.textContent = 'Subir mi logo';
      els.logoInput.value = '';
    }
  });

  // ── barra del visor ──────────────────────────────────────────────────────
  els.btnOrbit.addEventListener('click', () => {
    const on = viewer.setAutoRotate(!viewer.isAutoRotate());
    els.btnOrbit.classList.toggle('is-on', on);
  });
  els.btnPlay.addEventListener('click', () => {
    viewer.play();
    els.panel.classList.remove('is-open');
  });
  els.btnReset.addEventListener('click', () => viewer.resetView());
  els.btnCapture.addEventListener('click', () => {
    const url = viewer.capture();
    const a = document.createElement('a');
    a.href = url;
    a.download = `luxegrip-${viewer.getDesign()}.png`;
    a.click();
  });
  els.btnApply.addEventListener('click', () => {
    viewer.play();
    els.panel.classList.remove('is-open');
  });

  // ── panel plegable (móvil) y menú ────────────────────────────────────────
  els.sheetGrip.addEventListener('click', () => {
    const open = els.panel.classList.toggle('is-open');
    els.sheetGrip.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  els.navToggle.addEventListener('click', () => {
    const open = els.nav.classList.toggle('is-open');
    els.navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  els.nav.addEventListener('click', () => els.nav.classList.remove('is-open'));

  // ── presentación ─────────────────────────────────────────────────────────
  const onScroll = () => els.head.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const reveal = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        reveal.unobserve(en.target);
      }
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('[data-reveal]').forEach((el) => reveal.observe(el));

  // el visor deja de renderizar cuando el hero sale de pantalla
  const heroObs = new IntersectionObserver((entries) => {
    for (const en of entries) viewer.setActive(en.isIntersecting);
  }, { threshold: 0.08 });
  heroObs.observe($('#hero'));

  // ── formulario ───────────────────────────────────────────────────────────
  els.contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = els.fieldName.value.trim();
    const pick = els.fieldDesign.value;
    const msg = els.fieldMsg.value.trim();
    const body = [
      name ? `Nombre: ${name}` : '',
      pick ? `Diseño de interés: ${pick}` : '',
      msg ? `\n${msg}` : ''
    ].filter(Boolean).join('\n');
    const href = `mailto:${site.contact.email}?subject=${encodeURIComponent('Consulta por un marcador' + (pick ? ` · ${pick}` : ''))}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
    els.formNote.textContent = 'Abrimos tu correo con la consulta lista. Si no se abrió, escribinos a ' + site.contact.email;
  });

  return { progress, ready, fps, setDesign };
}
