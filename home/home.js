(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const ic = (n, s) => Icon.el(n, s);
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag); let value;
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v; else if (k === 'value') value = v;
      else if (k === 'style' && typeof v === 'string') e.style.cssText = v;
      else if (k.startsWith('on')) e[k] = v; else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
    if (value !== undefined) e.value = value;
    return e;
  }
  const api = async (url, opts) => { const r = await fetch(url, opts); const j = await r.json().catch(() => ({})); if (!r.ok && !j.error) j.error = 'Error ' + r.status; return j; };
  const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const COLORES = { teal: ['Verde azulado', '#0e6b5c', '#16a085'], azul: ['Azul', '#1d5fbf', '#3b8bf0'], vino: ['Vino', '#8a1f3d', '#c2456b'], naranja: ['Naranja', '#c2540a', '#ee8a3c'], grafito: ['Grafito', '#35434a', '#6b7d86'] };
  const grad = (c) => { const x = COLORES[c] || COLORES.teal; return 'linear-gradient(135deg,' + x[1] + ',' + x[2] + ')'; };
  function rel(ts) {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'ahora mismo'; if (m < 60) return 'hace ' + m + ' min';
    const hh = Math.round(m / 60); if (hh < 24) return 'hace ' + hh + ' h';
    const d = Math.round(hh / 24); return d < 30 ? 'hace ' + d + (d === 1 ? ' día' : ' días') : new Date(ts).toLocaleDateString('es-MX');
  }
  const kb = (n) => (n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB');

  /* ---------- servicios compartidos con el asistente ---------- */
  function toast(msg, icon) {
    const old = document.querySelector('.toast'); if (old) old.remove();
    const t = h('div', { class: 'toast', role: 'status' }, ic(icon || 'check-circle', 18), h('span', {}, msg), h('button', { onclick: () => t.remove() }, 'Entendido'));
    document.body.append(t); setTimeout(() => t.remove(), 9000);
  }
  async function uniqueId(base) {
    const ids = new Set((await api('/api/projects')).map((p) => p.id)); let id = slug(base) || 'curso', n = 2; const root = id; while (ids.has(id)) id = root + '-' + n++;
    return id;
  }
  async function createAndOpen(course, flash) {
    const id = await uniqueId(course.curso.titulo || course.curso.id);
    course.curso.id = id;
    const r = await api('/api/project?id=' + encodeURIComponent(id), { method: 'POST', body: JSON.stringify(course) });
    if (!r.ok) { toast('No se pudo crear el curso: ' + (r.error || ''), 'alert'); return; }
    try { localStorage.setItem('gs-proj', id); if (flash) localStorage.setItem('gs-flash', flash); } catch (e) {}
    location.href = '/editor/';
  }
  window.Home = { h, ic, api, slug, COLORES, grad, toast, createAndOpen, kb };

  /* ---------- menú emergente ---------- */
  let menu = null;
  const closeMenu = () => { if (menu) { menu.remove(); menu = null; } };
  function showMenu(anchor, items) {
    closeMenu();
    const m = h('div', { class: 'menu' }, items.map((it) => it.sep ? h('hr') : h('button', { class: 'mi' + (it.danger ? ' danger' : ''), onclick: () => { closeMenu(); it.onclick(); } }, ic(it.icon, 16), h('span', {}, it.label))));
    document.body.append(m); menu = m;
    const r = anchor.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, innerWidth - m.offsetWidth - 8)) + 'px'; m.style.top = r.bottom + 6 + 'px';
  }
  document.addEventListener('mousedown', (e) => { if (menu && !menu.contains(e.target)) closeMenu(); });

  /* ---------- ilustraciones de las tarjetas ---------- */
  const svg = (inner) => { const t = document.createElement('template'); t.innerHTML = '<svg class="bg" viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + inner + '</svg>'; return t.content.firstChild; };
  const deco = '<circle cx="262" cy="14" r="62" fill="#fff" opacity=".13"/><circle cx="22" cy="146" r="52" fill="#000" opacity=".09"/>';
  const ART = {
    ia: deco + '<rect x="64" y="26" width="110" height="98" rx="13" fill="#fff"/><rect x="78" y="42" width="52" height="8" rx="4" fill="#7a2bb8"/><rect x="78" y="58" width="82" height="6" rx="3" fill="#ecd9f7"/><rect x="78" y="70" width="70" height="6" rx="3" fill="#ecd9f7"/><rect x="78" y="86" width="60" height="24" rx="7" fill="#fadbe9"/><path d="M206 34l6 16 16 6-16 6-6 16-6-16-16-6 16-6z" fill="#fff"/><path d="M232 92l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#fff" opacity=".8"/>',
    cero: deco + '<rect x="72" y="24" width="156" height="106" rx="13" fill="#fff"/><rect x="88" y="40" width="68" height="8" rx="4" fill="#0e8f73"/><rect x="88" y="56" width="124" height="6" rx="3" fill="#cdebe3"/><rect x="88" y="68" width="104" height="6" rx="3" fill="#cdebe3"/><rect x="88" y="86" width="48" height="30" rx="7" fill="#d9f2ea"/><circle cx="198" cy="106" r="18" fill="#0e8f73"/><path d="M198 97v18M189 106h18" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>',
    contenido: deco + '<g transform="rotate(-6 80 80)"><rect x="40" y="30" width="62" height="86" rx="9" fill="#fff" opacity=".6"/></g><rect x="50" y="34" width="62" height="86" rx="9" fill="#fff"/><rect x="60" y="48" width="30" height="6" rx="3" fill="#4a3fd0"/><rect x="60" y="62" width="42" height="5" rx="2.5" fill="#d9d4fa"/><rect x="60" y="73" width="38" height="5" rx="2.5" fill="#d9d4fa"/><rect x="60" y="84" width="42" height="5" rx="2.5" fill="#d9d4fa"/><path d="M128 78h38m-10-10 10 10-10 10" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><rect x="180" y="34" width="84" height="86" rx="11" fill="#fff"/><rect x="190" y="46" width="64" height="16" rx="6" fill="#e6e1fb"/><rect x="190" y="68" width="64" height="16" rx="6" fill="#e6e1fb"/><rect x="190" y="90" width="64" height="16" rx="6" fill="#8d6bf0"/>',
    evaluacion: deco + '<rect x="70" y="22" width="120" height="110" rx="13" fill="#fff"/><circle cx="92" cy="50" r="9" fill="#1a4aa8"/><path d="m88 50 3 3 6-7" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="108" y="46" width="66" height="7" rx="3.5" fill="#c9dcf7"/><circle cx="92" cy="76" r="9" fill="#d6e5fb"/><rect x="108" y="72" width="54" height="7" rx="3.5" fill="#c9dcf7"/><circle cx="92" cy="102" r="9" fill="#d6e5fb"/><rect x="108" y="98" width="62" height="7" rx="3.5" fill="#c9dcf7"/><circle cx="222" cy="88" r="34" fill="#fff"/><circle cx="222" cy="88" r="26" fill="none" stroke="#d6e5fb" stroke-width="7"/><path d="M222 62a26 26 0 1 1-24.7 34.2" fill="none" stroke="#1a4aa8" stroke-width="7" stroke-linecap="round"/><text x="222" y="94" text-anchor="middle" font-size="17" font-weight="700" fill="#1a4aa8" font-family="sans-serif">80%</text>',
    importar: deco + '<rect x="82" y="68" width="136" height="64" rx="12" fill="#fff"/><rect x="82" y="68" width="136" height="16" rx="8" fill="#ffe3b3"/><path d="M150 20v50m-16-16 16 16 16-16" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><rect x="100" y="96" width="60" height="7" rx="3.5" fill="#f3c46b"/><rect x="100" y="110" width="40" height="6" rx="3" fill="#fae3b4"/>',
    ejemplo: deco + '<rect x="58" y="40" width="72" height="92" rx="10" fill="#fff" opacity=".55" transform="rotate(-9 94 86)"/><rect x="96" y="30" width="96" height="104" rx="12" fill="#fff"/><path d="M114 58 144 44l30 14-30 14z" fill="#c93a6a"/><path d="M124 66v14c8 7 24 7 32 0V66" fill="none" stroke="#c93a6a" stroke-width="4" stroke-linecap="round"/><rect x="110" y="96" width="68" height="7" rx="3.5" fill="#f9d0dd"/><rect x="110" y="110" width="46" height="6" rx="3" fill="#f9d0dd"/><circle cx="226" cy="100" r="22" fill="#fff" opacity=".92"/><path d="m217 100 7 7 12-14" stroke="#c93a6a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
  };

  /* ---------- pantalla ---------- */
  let projects = [], pkgs = [], filter = '';
  function actionCard(cls, art, icon, title, desc, cta, fn, badge) {
    const a = h('button', { class: 'act ' + cls, onclick: fn }, h('div', { class: 'art' }, svg(ART[art])),
      h('div', { class: 'body' }, h('b', {}, title, badge ? h('span', { class: 'new' }, badge) : null), h('span', {}, desc), h('div', { class: 'go' }, cta, ic('arrow-right', 14))));
    return a;
  }
  function thumb(p) {
    const t = h('div', { class: 'thumb', style: 'background:' + grad(p.color) }, h('div', { class: 'tt' }, p.titulo),
      h('div', { class: 'mini' }, p.tipo === 'evaluacion' ? h('i', {}, 'Evaluación') : [h('i', {}, p.modulos + ' mód.'), h('i', {}, p.pantallas + ' pant.')], p.preguntas ? h('i', {}, p.preguntas + ' preg.') : null));
    return t;
  }
  function openProject(id) { try { localStorage.setItem('gs-proj', id); } catch (e) {} location.href = '/editor/'; }
  async function dupProject(p) {
    const c = await api('/api/project?id=' + encodeURIComponent(p.id)); c.curso.titulo = (c.curso.titulo || p.id) + ' (copia)';
    const id = await uniqueId(c.curso.titulo); c.curso.id = id; await api('/api/project?id=' + encodeURIComponent(id), { method: 'POST', body: JSON.stringify(c) }); toast('Copia creada: ' + c.curso.titulo); load();
  }
  function projectCard(p) {
    const more = h('button', { class: 'btn icon sm more', title: 'Más acciones', onclick: (e) => { e.stopPropagation(); showMenu(e.currentTarget, [
      { label: 'Abrir', icon: 'pencil', onclick: () => openProject(p.id) }, { label: 'Duplicar', icon: 'copy', onclick: () => dupProject(p) }, { sep: true },
      { label: 'Eliminar', icon: 'trash', danger: true, onclick: async () => { if (confirm('¿Eliminar "' + p.titulo + '"? No se puede deshacer.')) { await api('/api/project?id=' + encodeURIComponent(p.id), { method: 'DELETE' }); load(); } } }]); } }, ic('more', 16));
    return h('div', { class: 'pc', role: 'button', tabindex: 0, onclick: () => openProject(p.id), onkeydown: (e) => { if (e.key === 'Enter') openProject(p.id); } }, thumb(p), more,
      h('div', { class: 'info' }, h('div', { class: 'nm' }, p.titulo), h('div', { class: 'meta' }, ic('clock', 13), rel(p.mtime),
        p.errores ? h('span', { class: 'badge warn' }, p.errores + ' por corregir') : h('span', { class: 'badge ok' }, 'Listo'))));
  }
  function render() {
    const page = $('page'); page.innerHTML = '';
    page.append(h('section', { class: 'hero' }, h('div', { class: 'wrap' },
      h('span', { class: 'eyebrow' }, ic('sparkles', 14), 'Autoría SCORM 1.2 · 100 % sin conexión'),
      h('h1', {}, '¿Qué quieres crear hoy?'),
      h('p', {}, 'Convierte tus ideas o tus documentos en cursos e-learning profesionales, listos para subir a tu LMS. Te guiamos paso a paso.'))));
    page.append(h('div', { class: 'wrap' },
      h('div', { class: 'actions' },
        actionCard('g1', 'cero', 'plus', 'Curso desde cero', 'Define el tema, la estructura y el estilo con un asistente guiado.', 'Empezar', () => Wizard.cero()),
        actionCard('g2', 'contenido', 'file-text', 'Desde mi contenido', 'Sube Word, PDF, Markdown, HTML o texto y armamos la estructura por ti.', 'Cargar contenido', () => Wizard.contenido()),
        actionCard('g5', 'evaluacion', 'help', 'Solo evaluación', 'Crea un examen SCORM con tus preguntas: reglas, intentos y revisión.', 'Crear evaluación', () => Wizard.evaluacion(), 'Nuevo'),
        actionCard('g3', 'importar', 'upload', 'Importar un curso', 'Abre un curso guardado en formato JSON para seguir editándolo.', 'Elegir archivo', () => $('fileJson').click()),
        actionCard('g4', 'ejemplo', 'cap', 'Explorar un ejemplo', 'Crea una copia del curso de ejemplo y descubre cómo funciona todo.', 'Ver ejemplo', useExample)),
      section('Tus cursos', projects.length, projectsBlock()), pkgSection(),
      h('div', { class: 'foot-note' }, ic('shield', 14), 'Tus cursos, imágenes y paquetes se guardan en esta computadora. Nada sale a internet.')));
  }
  function section(title, count, content, extra) {
    return h('section', { class: 'section' }, h('div', { class: 'sec-top' }, h('h2', {}, title), count != null ? h('span', { class: 'cnt' }, count) : null, h('span', { class: 'grow' }), extra || null), content);
  }
  function projectsBlock() {
    const list = projects.filter((p) => !filter || p.titulo.toLowerCase().includes(filter));
    if (!projects.length) return h('div', { class: 'empty' }, h('div', { class: 'circle' }, ic('layers', 28)), h('b', {}, 'Todavía no tienes cursos'), h('span', {}, 'Elige una de las opciones de arriba para crear el primero.'));
    const box = h('div', { class: 'cards' }, h('button', { class: 'pc add', onclick: () => Wizard.cero() }, h('span', { class: 'plus' }, ic('plus', 26)), h('b', {}, 'Crear nuevo curso')), list.map(projectCard));
    if (!list.length) box.append(h('div', { class: 'muted', style: 'grid-column:1/-1;padding:20px' }, 'Ningún curso coincide con «' + filter + '».'));
    return box;
  }
  function pkgSection() {
    if (!pkgs.length) return '';
    return section('Paquetes SCORM generados', pkgs.length, h('div', {}, pkgs.map((k) => h('div', { class: 'pk' }, h('span', { class: 'ico' }, ic('package', 20)),
      h('div', { class: 'tx' }, h('b', {}, k.name), h('span', {}, kb(k.size) + ' · ' + rel(k.mtime))),
      h('a', { class: 'btn sm', href: '/index.html?open=' + encodeURIComponent(k.name) }, ic('play', 14), 'Validar en el player'),
      h('a', { class: 'btn sm', href: '/download/' + encodeURIComponent(k.name), download: k.name }, ic('download', 14), 'Descargar'),
      h('button', { class: 'btn ghost sm icon danger', title: 'Eliminar paquete', onclick: async () => { if (confirm('¿Eliminar el paquete "' + k.name + '"?')) { await api('/api/package?name=' + encodeURIComponent(k.name), { method: 'DELETE' }); load(); } } }, ic('trash', 15))))));
  }
  async function useExample() {
    const ex = projects.find((p) => p.id === 'ayb-higiene-01') || projects.find((p) => /higiene/i.test(p.titulo));
    if (!ex) { toast('El curso de ejemplo ya no está disponible en esta computadora.', 'alert'); return; }
    const c = await api('/api/project?id=' + encodeURIComponent(ex.id)); c.curso.titulo = 'Ejemplo · ' + c.curso.titulo;
    await createAndOpen(c, 'Es una copia del curso de ejemplo: edítala libremente y pulsa «Generar SCORM».');
  }
  async function load() { [projects, pkgs] = await Promise.all([api('/api/projects'), api('/api/packages-info')]); render(); }

  $('fileJson').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const c = JSON.parse(await f.text()); if (!c.curso) throw new Error('No parece un curso de este generador (falta «curso»).');
      c.modulos = c.modulos || []; c.evaluacion = c.evaluacion || { preguntas: [] }; if (!c.curso.titulo) c.curso.titulo = f.name.replace(/\.json$/i, '');
      await createAndOpen(c, 'Curso importado desde ' + f.name + '.');
    } catch (err) { toast('JSON no válido: ' + err.message, 'alert'); }
  };

  $('logoIc').append(ic('cap', 17));
  $('tabHome').append(ic('home', 14), 'Inicio'); $('tabAut').append(ic('pencil', 14), 'Autoría'); $('tabPlay').append(ic('play', 14), 'Player'); $('tabUtil').append(ic('wand', 14), 'Utilidades');
  $('btnTheme').append(ic(Theme.current() === 'dark' ? 'sun' : 'moon', 16));
  $('btnTheme').onclick = () => { const t = Theme.toggle(); $('btnTheme').innerHTML = ''; $('btnTheme').append(ic(t === 'dark' ? 'sun' : 'moon', 16)); };
  window.Home.reload = load;
  load();
})();
