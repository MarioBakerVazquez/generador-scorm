(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const S = window.Schema;
  const ic = (n, s) => Icon.el(n, s);

  const TIPOS = {
    bloques: { label: 'Lección con bloques', desc: 'Texto, imágenes y elementos interactivos apilados (pestañas, pasos, tarjetas, escenarios…).', icon: 'layers' },
    texto_imagen: { label: 'Texto con imagen', desc: 'Párrafos, puntos clave y una imagen del banco.', icon: 'text' },
    acordeon: { label: 'Acordeón', desc: 'Contenido desplegable; el alumno abre cada elemento.', icon: 'list' }
  };
  const PROXIMAS = ['Video y audio desde archivo'];
  const ANIM = { 'fade-in': 'Aparecer (fade)', 'slide-up': 'Deslizar hacia arriba', zoom: 'Zoom suave', escalonada: 'Aparición escalonada', ninguna: 'Sin animación' };
  const COLORES = { teal: ['Verde azulado', '#0e6b5c'], azul: ['Azul', '#1d5fbf'], vino: ['Vino', '#8a1f3d'], naranja: ['Naranja', '#c2540a'], grafito: ['Grafito', '#35434a'] };

  /* ---------- utilidades ---------- */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    let value;
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v;
      else if (k === 'value') value = v;
      else if (k === 'style' && typeof v === 'string') e.style.cssText = v;
      else if (k.startsWith('on')) e[k] = v;
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
    if (value !== undefined) e.value = value;
    return e;
  }
  const api = async (url, opts) => { const r = await fetch(url, opts); const j = await r.json().catch(() => ({})); if (!r.ok && !j.error) j.error = 'Error ' + r.status; return j; };
  const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const debounce = (fn, ms) => { let t; const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; f.now = (...a) => { clearTimeout(t); fn(...a); }; return f; };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const sameNode = (a, b) => a.t === b.t && a.m === b.m && a.p === b.p && a.q === b.q; // ignora el bloque seleccionado (b)
  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return false; [arr[i], arr[j]] = [arr[j], arr[i]]; return true; };

  /* ---------- estado ---------- */
  let course = null, projId = null, sel = { t: 'curso' }, stockCache = [], projects = [];
  const collapsed = new Set();
  let saving = Promise.resolve();

  const isEval = () => !!course && course.curso.tipo === 'evaluacion';
  const mods = () => (isEval() ? [] : course.modulos);
  function normalize(c) {
    c.curso = c.curso || {}; c.modulos = c.modulos || []; c.evaluacion = c.evaluacion || { preguntas: [] };
    c.evaluacion.preguntas = c.evaluacion.preguntas || [];
    if (c.evaluacion.modo !== 'examen') c.evaluacion.modo = 'practica';
    c.objetivos = Array.isArray(c.objetivos) ? c.objetivos : [];
    { const fi = c.curso.ficha || {}; c.curso.ficha = Object.assign(Modelo.fichaVacia(), fi, { modo: fi.modo || 'experto' }); }
    c.modulos.forEach((m) => (m.pantallas || []).forEach((p) => {
      if (p.objetivo && !c.objetivos.some((o) => o.id === p.objetivo)) { const o = c.objetivos.find((x) => x.texto === p.objetivo) || (() => { const n = { id: 'ob' + (c.objetivos.length + 1), texto: String(p.objetivo) }; while (c.objetivos.some((x) => x.id === n.id)) n.id += 'x'; c.objetivos.push(n); return n; })(); p.objetivo = o.id; }
    }));
    c.evaluacion.intentos = c.evaluacion.intentos || 0; c.evaluacion.aleatorizar = !!c.evaluacion.aleatorizar;
    c.modulos.forEach((m) => (m.pantallas = m.pantallas || []).forEach((p) => {
      p.contenido = p.contenido || {};
      if (p.tipo === 'texto_imagen') {
        if (Array.isArray(p.contenido.parrafos)) { p.contenido.texto = [p.contenido.texto, ...p.contenido.parrafos].filter(Boolean).join('\n'); delete p.contenido.parrafos; }
        p.contenido.puntos = p.contenido.puntos || [];
        p.imagen = p.imagen || { etiquetas: [], archivo: null, alt: '' };
      }
      if (p.tipo === 'acordeon') p.contenido.items = p.contenido.items || [];
      if (p.tipo === 'bloques') p.bloques = p.bloques || [];
    }));
    return c;
  }
  function allIds() { const s = new Set(); course.modulos.forEach((m) => { s.add(m.id); m.pantallas.forEach((p) => s.add(p.id)); }); course.evaluacion.preguntas.forEach((q) => s.add(q.id)); return s; }
  function genId(prefix) { const ids = allIds(); let n = 1; while (ids.has(prefix + n)) n++; return prefix + n; }
  function newScreen(m, tipo) {
    const base = { id: genId(m.id + '-p'), tipo, titulo: '', animacion: 'fade-in', fuente: 'autoría manual' };
    if (tipo === 'bloques') return Object.assign(base, { contenido: {}, bloques: [{ tipo: 'parrafo', texto: '' }] });
    return tipo === 'acordeon'
      ? Object.assign(base, { contenido: { items: [{ encabezado: '', texto: '' }] } })
      : Object.assign(base, { contenido: { texto: '', puntos: [] }, imagen: { etiquetas: [], archivo: null, alt: '' } });
  }
  function newCourse(titulo, id) {
    const c = { curso: { id, titulo, descripcion: '', idioma: 'es-MX', duracion_min: 15, puntaje_aprobatorio: 80, color: 'teal' }, modulos: [{ id: 'm1', titulo: 'Módulo 1', pantallas: [] }], evaluacion: { preguntas: [] } };
    course = c; c.modulos[0].pantallas.push(newScreen(c.modulos[0], 'bloques'));
    c.objetivos = []; c.curso.ficha = Object.assign(Modelo.fichaVacia(), { modo: lastModo() });
    return c;
  }

  /* ---------- menús emergentes ---------- */
  let openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
  function showMenu(anchor, items, opts = {}) {
    closeMenu();
    const m = h('div', { class: 'menu', role: 'menu' }, items.map((it) => {
      if (it.sep) return h('hr');
      if (it.header) return h('div', { class: 'mh' }, it.header);
      return h('button', { class: 'mi' + (it.danger ? ' danger' : '') + (it.on ? ' on' : ''), role: 'menuitem', disabled: it.disabled, onclick: () => { closeMenu(); it.onclick && it.onclick(); } },
        it.icon ? ic(it.icon, 16) : null, h('span', { style: 'flex:1' }, it.label, it.desc ? h('small', {}, it.desc) : null), it.on ? ic('check', 14) : null);
    }));
    document.body.append(m); openMenu = m;
    const r = anchor.getBoundingClientRect(), w = m.offsetWidth, hh = m.offsetHeight;
    let left = opts.alignRight ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, innerWidth - w - 8));
    let top = r.bottom + 6; if (top + hh > innerHeight - 8) top = Math.max(8, r.top - hh - 6);
    m.style.left = left + 'px'; m.style.top = top + 'px';
  }
  document.addEventListener('mousedown', (e) => { if (openMenu && !openMenu.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); if (!$('modal').hidden) closeModal(); } });
  window.addEventListener('resize', closeMenu);

  /* ---------- modal ---------- */
  function openModal(title, body, footer, narrow) {
    const d = $('dlg'); d.className = 'dlg' + (narrow ? ' narrow' : ''); d.innerHTML = '';
    d.append(h('div', { class: 'dlg-h' }, h('h3', {}, title), h('button', { class: 'btn ghost sm icon', title: 'Cerrar', onclick: closeModal }, ic('x', 16))),
      h('div', { class: 'dlg-b' }, body), footer ? h('div', { class: 'dlg-f' }, footer) : null);
    $('modal').hidden = false;
  }
  function closeModal() { $('modal').hidden = true; $('dlg').innerHTML = ''; }
  $('modal').addEventListener('mousedown', (e) => { if (e.target === $('modal')) closeModal(); });
  function ask(title, fields, okLabel) {
    return new Promise((resolve) => {
      const inputs = fields.map((f) => h('input', { class: 'input', type: 'text', value: f.value || '', placeholder: f.placeholder || '' }));
      const done = (v) => { closeModal(); resolve(v); };
      const ok = () => done(Object.fromEntries(fields.map((f, i) => [f.key, inputs[i].value.trim()])));
      inputs.forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') done(null); }));
      openModal(title, fields.map((f, i) => h('div', { class: 'fld' }, h('label', {}, f.label), inputs[i])),
        [h('button', { class: 'btn', onclick: () => done(null) }, 'Cancelar'), h('button', { class: 'btn primary', onclick: ok }, okLabel || 'Aceptar')], true);
      inputs[0].focus();
    });
  }

  /* ---------- guardado y vista previa ---------- */
  function setSave(state, text) { $('saveChip').querySelector('.dot').className = 'dot ' + state; $('saveState').textContent = text; }
  const doSave = debounce(() => {
    if (!course || !projId) return;
    setSave('warn', 'Guardando…');
    saving = api('/api/project?id=' + encodeURIComponent(projId), { method: 'POST', body: JSON.stringify(course) }).then((r) =>
      r.ok ? setSave('ok', 'Guardado ' + new Date().toLocaleTimeString('es-MX', { hour12: false, hour: '2-digit', minute: '2-digit' })) : setSave('bad', 'No se pudo guardar'));
  }, 700);
  const flushSave = async () => { doSave.now(); await saving; };

  function previewIndex() {
    const before = (mi) => { let n = 1; for (let i = 0; i < mi; i++) n += mods()[i].pantallas.length; return n; };
    if (sel.t === 'pan') return before(sel.m) + sel.p;
    if (sel.t === 'mod') return before(sel.m);
    if (sel.t === 'q') return 1 + mods().reduce((a, m) => a + m.pantallas.length, 0) + sel.q;
    return 0;
  }
  const doPreview = debounce(async () => {
    if (!course) return;
    /* el lienzo tolera bloques a medio llenar: los muestra como aviso (conservando su posición) para que se puedan seleccionar */
    const pv = JSON.parse(JSON.stringify(course));
    pv.modulos.forEach((m) => m.pantallas.forEach((p) => { if (p.tipo === 'bloques') p.bloques = (p.bloques || []).map((b) => BL.validar(b, 'x').length
      ? { id: b.id, tipo: 'cita', estilo: 'nota', titulo: (BL.BLOQUES[b.tipo] || { label: b.tipo }).label, texto: 'Falta completar este bloque. Edítalo en Propiedades.', cols: b.cols } : b); }));
    const r = await api('/api/preview', { method: 'POST', body: JSON.stringify(pv) });
    const msg = $('pmsg');
    if (!r.ok) { msg.hidden = false; msg.textContent = 'Vista previa en pausa. Corrige: ' + (r.errors || [r.error]).slice(0, 2).join(' · '); return; }
    msg.hidden = true;
    const total = mods().reduce((a, m) => a + m.pantallas.length, 0) + course.evaluacion.preguntas.length + 2;
    $('pinfo').textContent = 'Pantalla ' + (previewIndex() + 1) + ' de ' + total;
    lastLaunch = r.launch;
    try { const w = $('pframe').contentWindow; keepScroll = w ? w.scrollY : 0; } catch (e) { keepScroll = 0; }
    $('pframe').src = '/pkg/prev/' + r.launch + '?t=' + Date.now() + '#p=' + previewIndex() + '&edit=1';
  }, 600);
  let lastLaunch = 'index.html', keepScroll = 0;
  function changed(structural) { $('projName').textContent = course.curso.titulo || projId; doSave(); doPreview(); renderOutline(); renderReview(); renderStatus(); if (structural) renderForm(); }

  /* ---------- lienzo: la lección se ve como la verá el alumno; clic en un bloque = editarlo ---------- */
  const curLesson = () => { if (sel.t !== 'pan') return null; const p = course.modulos[sel.m] && course.modulos[sel.m].pantallas[sel.p]; return p && p.tipo === 'bloques' ? p : null; };
  function canvasDoc() { try { return $('pframe').contentDocument; } catch (e) { return null; } }
  function markCanvasSel(scroll) {
    const d = canvasDoc(); if (!d) return;
    d.querySelectorAll('.blk.ed-sel').forEach((b) => b.classList.remove('ed-sel'));
    if (sel.t === 'pan' && sel.b != null) { const el = d.querySelector('.blk[data-b="' + sel.b + '"]'); if (el) { el.classList.add('ed-sel'); if (scroll && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }
  }
  $('pframe').addEventListener('load', () => {
    const d = canvasDoc(); if (!d || !d.body) return;
    const st = d.createElement('style');
    st.textContent = '.blk{cursor:pointer;border-radius:12px;transition:box-shadow .12s}.blk:hover{box-shadow:0 0 0 2px rgba(14,107,92,.35)}.blk.ed-sel{box-shadow:0 0 0 3px #0e6b5c}.nav,.top .ttl+*{display:none!important}.blk *{pointer-events:none}';
    d.head.appendChild(st);
    d.addEventListener('click', (e) => { const blk = e.target.closest && e.target.closest('.blk'); if (!blk) return; e.preventDefault(); e.stopPropagation(); selectBlock(+blk.getAttribute('data-b')); }, true);
    if (keepScroll) { try { $('pframe').contentWindow.scrollTo(0, keepScroll); } catch (e) { /* nada */ } }
    markCanvasSel(false);
  });
  function selectBlock(b) { const p = curLesson(); if (!p) return; sel = { t: 'pan', m: sel.m, p: sel.p, b: b }; renderOutline(); renderForm(); renderStatus(); markCanvasSel(false); setRightTab('prop'); }
  function addBlock(tipo, at) {
    const p = curLesson(); if (!p) { toast('Primero elige una lección de bloques en «Estructura».'); return; }
    if (modo() === 'guiado' && !p.objetivo) { sel = { t: 'pan', m: sel.m, p: sel.p }; renderForm(); setRightTab('prop'); toast('Antes de añadir bloques, liga esta lección a un objetivo (arriba, en Propiedades).'); return; }
    const nb = Modelo.nuevoObjeto(tipo, BL.nuevo(tipo));
    let idx = at != null ? at : (sel.b != null ? sel.b + 1 : p.bloques.length);
    idx = Math.max(0, Math.min(idx, p.bloques.length)); p.bloques.splice(idx, 0, nb);
    sel = { t: 'pan', m: sel.m, p: sel.p, b: idx }; setRightTab('prop'); changed(true); doPreview.now();
    setTimeout(() => markCanvasSel(true), 900);
  }
  /* arrastrar desde la paleta al lienzo */
  function dropIndex(clientY) {
    const d = canvasDoc(), f = $('pframe'); if (!d) return { idx: null, y: 0 };
    const fr = f.getBoundingClientRect(), ratio = fr.width / (f.clientWidth || fr.width) || 1;
    const blks = [...d.querySelectorAll('.blk')]; let idx = blks.length, y = null;
    for (let i = 0; i < blks.length; i++) { const r = blks[i].getBoundingClientRect(), mid = fr.top + (r.top + r.height / 2) * ratio; if (clientY < mid) { idx = i; y = fr.top + r.top * ratio - 6; break; } }
    if (y == null) { const l = blks[blks.length - 1]; y = l ? fr.top + (l.getBoundingClientRect().bottom) * ratio + 6 : fr.top + 40; }
    return { idx, y };
  }
  const dl = $('dropLayer');
  dl.addEventListener('dragover', (e) => { e.preventDefault(); const r = dropIndex(e.clientY), box = dl.getBoundingClientRect(); $('dropLine').style.top = Math.max(0, r.y - box.top) + 'px'; });
  dl.addEventListener('drop', (e) => { e.preventDefault(); const tipo = e.dataTransfer.getData('text/x-bloque'); dl.hidden = true; if (tipo) addBlock(tipo, dropIndex(e.clientY).idx); });
  document.addEventListener('dragend', () => { dl.hidden = true; });

  /* ---------- revisión ---------- */
  function problems() {
    const v = S.validateCourse(course);
    const guiado = modo() === 'guiado';
    return v.errors.map((m) => ({ level: 'error', msg: m })).concat(v.warnings.map((m) => ({ level: 'warn', msg: m })),
      Modelo.revisar(course).map((x) => ({ level: x.nivel === 'critico' && guiado ? 'error' : 'warn', msg: x.msg, t: x.target, ped: true })));
  }
  function target(msg) {
    let m = /modulos\[(\d+)\]\.pantallas\[(\d+)\]/.exec(msg); if (m) return { t: 'pan', m: +m[1], p: +m[2] };
    m = /^modulos\[(\d+)\]/.exec(msg); if (m) return { t: 'mod', m: +m[1] };
    m = /evaluacion\.preguntas\[(\d+)\]/.exec(msg); if (m) return { t: 'q', q: +m[1] };
    return { t: 'curso' };
  }
  function where(t) {
    if (t.t === 'pan') { const p = course.modulos[t.m] && course.modulos[t.m].pantallas[t.p]; return p ? course.modulos[t.m].titulo + ' › ' + (p.titulo || 'Pantalla sin título') : ''; }
    if (t.t === 'mod') return course.modulos[t.m] ? course.modulos[t.m].titulo : '';
    if (t.t === 'q') return 'Evaluación › Pregunta ' + (t.q + 1);
    return 'Datos del curso';
  }
  function renderReview() {
    const box = $('review'); box.innerHTML = '';
    const guiado = modo() === 'guiado', v = S.validateCourse(course), limpia = (m) => m.replace(/^[^:]*:\s*/, (m0) => (/^(modulos|evaluacion|curso)/.test(m0) ? '' : m0)), sch = v.errors.map((m) => ({ nivel: 'error', msg: limpia(m), target: target(m) })).concat(v.warnings.map((m) => ({ nivel: 'aviso', msg: limpia(m), target: target(m) })));
    const rules = Modelo.qa(course), lv = (it) => (it.nivel === 'critico' && guiado ? 'error' : 'aviso');
    const all = sch.concat(rules.flatMap((r) => r.items.map((it) => Object.assign({ nivel: lv(it) }, { msg: it.msg, target: it.target }))));
    const er = all.filter((p) => p.nivel === 'error').length, wr = all.length - er;
    $('btnReview').innerHTML = ''; $('btnReview').append(ic('shield', 15), 'Revisión', h('span', { class: 'badge ' + (er ? 'bad' : wr ? 'warn' : 'ok') }, er ? er : wr ? wr : '✓'));
    const total = rules.length + 1, ok = rules.filter((r) => !r.items.length).length + (sch.length ? 0 : 1);
    box.append(h('div', { class: 'qa-sum' }, h('b', {}, ok + ' de ' + total + ' comprobaciones superadas'), h('div', { class: 'qa-bar' }, h('i', { style: 'width:' + Math.round(ok * 100 / total) + '%' })),
      h('span', { class: 'muted' }, guiado ? 'Guiado: lo marcado en rojo bloquea la publicación.' : 'Experto: todo son advertencias; puedes publicar igual.')));
    const row = (it) => h('button', { class: 'rv ' + it.nivel, onclick: () => { irA(it.target); setPaneTab('prev'); } }, ic(it.nivel === 'error' ? 'x-circle' : 'alert', 16), h('span', {}, it.msg, h('small', {}, where(it.target))));
    const grp = (titulo, rs) => { const g = h('section', { class: 'qa-g' }, h('h4', {}, titulo));
      rs.forEach((r) => { const bad = r.items.length;
        g.append(h('div', { class: 'qa-r' + (bad ? '' : ' ok') }, h('div', { class: 'qa-t' }, ic(bad ? 'alert' : 'check-circle', 15), h('span', {}, r.titulo), bad ? h('span', { class: 'badge ' + (r.items.some((i) => lv(i) === 'error') ? 'bad' : 'warn') }, r.items.length) : null), bad ? r.items.map((it) => row({ nivel: lv(it), msg: it.msg, target: it.target })) : null)); });
      return g; };
    const cats = [];
    rules.forEach((r) => { let c = cats.find((x) => x.id === r.cat); if (!c) { c = { id: r.cat, nombre: r.catNombre, rs: [] }; cats.push(c); } c.rs.push(r); });
    box.append(grp('Paquete SCORM', [{ titulo: 'Los bloques y datos están completos y válidos', items: sch.map((x) => ({ nivel: x.nivel === 'error' ? 'critico' : 'aviso', msg: x.msg, target: x.target })) }]));
    cats.forEach((c) => box.append(grp(c.nombre, c.rs)));
  }
  function setPaneTab(k) { $('reviewDrawer').hidden = k !== 'rev'; }
  function setLeftTab(k) { document.querySelectorAll('[data-lt]').forEach((b) => b.classList.toggle('on', b.dataset.lt === k)); ['est', 'blq', 'cap'].forEach((x) => { $('lp-' + x).hidden = x !== k; }); if (k === 'blq') renderPalette(); }
  function setRightTab(k) { document.querySelectorAll('[data-rt]').forEach((b) => b.classList.toggle('on', b.dataset.rt === k)); ['prop', 'ia', 'log'].forEach((x) => { $('rp-' + x).hidden = x !== k; }); if (k === 'ia') renderIA(); }
  document.querySelectorAll('[data-lt]').forEach((b) => b.onclick = () => setLeftTab(b.dataset.lt));
  document.querySelectorAll('[data-rt]').forEach((b) => b.onclick = () => setRightTab(b.dataset.rt));

  /* ---------- modo Experto / Guiado: mismo motor, dos experiencias ---------- */
  const modo = () => (course && course.curso.ficha && course.curso.ficha.modo) || 'experto';
  function lastModo() { try { return localStorage.getItem('gs-modo') || 'guiado'; } catch (e) { return 'guiado'; } }
  function setModo(m) {
    course.curso.ficha = Object.assign({}, course.curso.ficha || {}, { modo: m });
    try { localStorage.setItem('gs-modo', m); } catch (e) { /* nada */ }
    applyModo(); doSave(); renderOutline(); renderReview(); renderForm();
  }
  const critPend = () => Modelo.revisar(course).filter((x) => x.nivel === 'critico');

  /* ---------- ruta del curso (los 7 pasos del diseñador instruccional): informa en Experto, guía y pone candados suaves en Guiado ---------- */
  function irA(t) { select(t); if (t.t !== 'pan' && !isEval()) setRightTab('prop'); }
  function rutaPanel() {
    const rt = Modelo.ruta(course), guiado = modo() === 'guiado', first = rt.find((x) => !x.hecho);
    const box = h('div', { class: 'ruta' }, h('div', { class: 'ruta-h' }, h('span', { class: 'kicker' }, 'Ruta del curso'),
      h('span', { class: 'grow' }), h('button', { class: 'btn ghost sm', title: 'Diseña el certificado que descarga el alumno al aprobar', onclick: () => openCertificado() }, ic('star', 13), 'Certificado'), h('button', { class: 'btn ghost sm', title: 'Objetivos, lecciones que los enseñan y preguntas que los miden', onclick: () => openMapa() }, ic('flag', 13), 'Mapa'),
      guiado ? h('button', { class: 'btn ghost sm', title: 'Responde una pregunta a la vez', onclick: () => wizard() }, ic('wand', 13), 'Asistente') : null));
    rt.forEach((x) => {
      const locked = guiado && first && x.n > first.n, cur = guiado && first && x.n === first.n, nc = x.criticos.length, na = x.avisos.length;
      const go = () => {
        if (locked) { toast('Antes completa «' + first.simple + '»: ' + first.criticos[0].msg); return; }
        if (x.n === 7) { $('reviewDrawer').hidden = false; return; }
        const t = (x.criticos[0] || x.avisos[0] || { target: { t: 'curso' } }).target; irA(t);
      };
      box.append(h('button', { class: 'rt-i' + (x.hecho ? ' done' : '') + (locked ? ' lock' : '') + (cur ? ' cur' : ''), onclick: go, title: locked ? 'Completa los pasos anteriores' : '' },
        h('span', { class: 'rt-n' }, x.hecho ? ic('check', 12) : locked ? ic('lock', 11) : x.n),
        h('span', { class: 'rt-t' }, guiado ? x.simple : x.titulo),
        !guiado && nc ? h('span', { class: 'rt-b warn', title: nc + ' pendientes críticos' }, nc) : null,
        !guiado && na ? h('span', { class: 'rt-b', title: na + ' sugerencias' }, na) : null));
      if (cur && x.criticos.length) box.append(h('div', { class: 'rt-msg' }, x.criticos.slice(0, 3).map((c) => h('div', {}, c.msg))));
    });
    return box;
  }
  /* asistente del modo Guiado: una pregunta a la vez, en lenguaje simple */
  function cursoVacio() { return mods().every((m) => m.pantallas.every((p) => (p.tipo === 'bloques' ? !(p.bloques || []).length : p.tipo === 'acordeon' ? (p.contenido.items || []).every((i) => !i.encabezado && !i.texto) : !(p.contenido.texto || '').trim()))); }
  function wizard(start) {
    const fi = course.curso.ficha;
    let plant = fi.plantilla || 'blanco';
    const pasos = [];
    if (cursoVacio()) pasos.push({ q: '¿Qué tipo de curso vas a hacer?', ayuda: 'Te armo una estructura de partida (módulos, lecciones y bloques) que luego puedes cambiar.', tipo: 'plantilla' });
    pasos.push({ q: '¿Cómo se llama el curso?', tipo: 'texto', obj: course.curso, k: 'titulo', ph: 'Ej. Servicio de vinos' },
      { q: 'En una frase, ¿de qué trata?', tipo: 'texto', obj: course.curso, k: 'descripcion', ph: 'Qué aprenderá el alumno y para quién es.' },
      { q: '¿Para quién es el curso?', ayuda: 'Piensa en una persona real que lo va a tomar.', tipo: 'texto', obj: fi, k: 'audiencia', ph: 'Ej. Meseros de nuevo ingreso, sin experiencia previa' },
      { q: '¿Qué deben saber antes de empezar?', ayuda: 'Opcional. Déjalo vacío si no hay requisitos.', tipo: 'texto', obj: fi, k: 'prerrequisitos', ph: 'Ej. Haber leído el manual de higiene', opc: true },
      { q: '¿Qué podrán hacer al terminar el curso?', ayuda: 'Empieza con un verbo: «Servir el vino a la temperatura correcta».', tipo: 'texto', obj: fi, k: 'objetivo_general', ph: 'Al terminar, el alumno podrá…' },
      { q: 'Escribe de 3 a 5 cosas concretas que aprenderán', ayuda: 'Una por línea, cada una con un verbo de acción. Después ligarás cada lección y cada pregunta a una de ellas.', tipo: 'objetivos' });
    let i = Math.max(0, start || 0);
    const draw = () => {
      const st = pasos[i], last = i === pasos.length - 1; let leer = () => true, ctl;
      if (st.tipo === 'plantilla') {
        ctl = h('div', { class: 'tiles' }, Object.entries(Modelo.PLANTILLAS).map(([k, v]) => h('button', { class: 'tile' + (plant === k ? ' on' : ''), onclick: (e) => { plant = k; [...e.currentTarget.parentNode.children].forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); } }, h('b', {}, v.nombre), h('small', {}, v.desc))));
        leer = () => { if (plant !== (fi.plantilla || 'blanco') || !course.objetivos.length) { Modelo.aplicarPlantilla(course, plant); sel = { t: 'curso' }; } return true; };
      } else if (st.tipo === 'objetivos') {
        ctl = h('textarea', { class: 'textarea', style: 'min-height:150px', placeholder: 'Servir el vino a la temperatura correcta\nDescribir las diferencias entre tinto y blanco\nResponder una queja con el protocolo' });
        ctl.value = course.objetivos.map((o) => o.texto).join('\n');
        leer = () => { Modelo.setObjetivos(course, ctl.value.split('\n')); return true; };
      } else {
        ctl = h(st.k === 'objetivo_general' || st.k === 'descripcion' ? 'textarea' : 'input', { class: st.k === 'objetivo_general' || st.k === 'descripcion' ? 'textarea' : 'input', placeholder: st.ph });
        ctl.value = st.obj[st.k] || '';
        leer = () => { st.obj[st.k] = ctl.value.trim(); return st.opc || !!ctl.value.trim() || (toast('Escribe una respuesta, o pulsa «Omitir» para volver luego.'), false); };
      }
      const avanzar = (omitir) => { if (!omitir && !leer()) return; if (last) { closeModal(); changed(true); doPreview.now(); toast('Listo. Sigue la ruta de la izquierda: lo que falte aparece ahí.'); } else { i++; draw(); } };
      openModal('Asistente · paso ' + (i + 1) + ' de ' + pasos.length, [h('p', { class: 'wz-q' }, st.q), st.ayuda ? h('p', { class: 'muted wz-h' }, st.ayuda) : null, ctl],
        [i > 0 ? h('button', { class: 'btn', onclick: () => { i--; draw(); } }, 'Atrás') : h('button', { class: 'btn', onclick: () => { closeModal(); changed(true); } }, 'Cerrar'), h('span', { class: 'grow' }),
          h('button', { class: 'btn ghost', onclick: () => avanzar(true) }, 'Omitir'), h('button', { class: 'btn primary', onclick: () => avanzar(false) }, last ? 'Terminar' : 'Siguiente')]);
      setTimeout(() => ctl.focus && ctl.focus(), 30);
    };
    draw();
  }
  function applyModo() {
    const m = modo(); document.body.classList.toggle('mode-guiado', m === 'guiado');
    document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    if (m === 'guiado') { if (!$('rp-log').hidden) setRightTab('prop'); if (!$('lp-cap').hidden) setLeftTab('est'); }
  }

  /* ---------- paleta de bloques (por intención) ---------- */
  function renderPalette() {
    const box = $('palette'); box.innerHTML = '';
    Modelo.PALETA.forEach((g) => {
      box.append(h('div', { class: 'pal-g' }, g.label));
      box.append(h('div', { class: 'pal-grid' }, g.tipos.map((t) => { const d = BL.BLOQUES[t];
        return h('button', { class: 'pal-i', draggable: 'true', title: d.desc, onclick: () => addBlock(t),
          ondragstart: (e) => { e.dataTransfer.setData('text/x-bloque', t); e.dataTransfer.effectAllowed = 'copy'; if (curLesson()) $('dropLayer').hidden = false; } }, ic(d.icon, 18), d.label, h('small', {}, d.desc)); })));
    });
    box.append(h('div', { class: 'pal-hint' }, 'Haz clic para añadir después del bloque seleccionado, o arrástralo al lienzo.'));
  }

  /* ---------- barra de estado de la lección ---------- */
  function renderStatus() {
    const b = $('statusbar'); if (!b || !course) return; b.innerHTML = '';
    const p = curLesson();
    if (p) {
      const e = Modelo.estadoLeccion(p), chip = (txt, cls) => h('span', { class: 'st ' + (cls || '') }, txt);
      b.append(chip('Lección: ' + (p.titulo || 'sin título')), chip(e.objetivos + (e.objetivos === 1 ? ' objetivo' : ' objetivos'), e.objetivos ? '' : 'warn'), chip(e.bloques + (e.bloques === 1 ? ' bloque' : ' bloques')),
        chip(e.interacciones + (e.interacciones === 1 ? ' interacción' : ' interacciones'), e.bloques >= 3 && !e.interacciones ? 'warn' : ''), chip(e.preguntas + ' preguntas', e.preguntas ? '' : 'warn'));
      e.aviso.forEach((a) => b.append(h('span', { class: 'st warn' }, ic('alert', 13), a)));
      if (!e.aviso.length) b.append(h('span', { class: 'st ok' }, ic('check-circle', 13), 'Sin pendientes en esta lección'));
    } else {
      const lec = mods().reduce((a, m) => a + m.pantallas.length, 0);
      b.append(h('span', { class: 'st' }, mods().length + ' módulos'), h('span', { class: 'st' }, lec + ' lecciones'), h('span', { class: 'st' }, course.evaluacion.preguntas.length + ' preguntas'), h('span', { class: 'muted' }, 'Elige una lección para ver su estado.'));
    }
  }

  /* ---------- IA asistente: panel lateral contextual. Solo tareas cerradas sobre contenido que ya existe; propone, tú editas y aceptas ---------- */
  const ia = { busy: null, result: null };
  const POR = { 4: 'Cada lección debe lograr una sola cosa que se pueda comprobar.', 5: 'Si el alumno solo lee, retiene poco: practicar fija lo aprendido.', 6: 'Una pregunta es útil cuando mide un objetivo concreto.', 1: 'Todo el curso se apoya en saber para quién es y qué lograrán.' };
  function iaAccion(label, icon, fn, por, ej) {
    const guiado = modo() === 'guiado';
    return h('div', { class: 'ia-act' }, h('button', { class: 'btn sm ai', onclick: fn }, ic(icon || 'sparkles', 14), label), guiado && por ? h('div', { class: 'hint' }, por, ej ? h('em', {}, ' Ej.: ' + ej) : null) : null);
  }
  function renderIA() {
    const bx = $('rp-ia'); bx.innerHTML = '';
    const wrap = h('div', { class: 'ia-box' }); bx.append(wrap);
    wrap.append(h('div', { class: 'aibar' }, h('span', { class: 'lbl' }, ic('sparkles', 13), 'IA local'), h('span', { class: 'muted', style: 'font-size:12px' }, 'solo asiste · tú decides')));
    if (ia.busy) {
      wrap.append(h('div', { class: 'ai-wait' }, h('span', { class: 'spin' }), h('div', {}, h('b', {}, ia.busy.label + '…'), h('div', { class: 'muted', id: 'iaTimer', style: 'margin-top:6px;font-size:13px' }, ''))),
        h('button', { class: 'btn sm', onclick: () => ia.busy && ia.busy.ac.abort() }, 'Cancelar'), h('p', { class: 'hint' }, 'Puedes seguir editando mientras trabaja.'));
      return markAI();
    }
    if (ia.result) {
      const r = ia.result;
      wrap.append(h('div', { class: 'ia-res' }, h('b', {}, r.title), r.fuente ? h('div', { class: 'ia-src' }, ic('file-text', 12), 'Fuente: ' + r.fuente) : null,
        h('p', { class: 'hint' }, r.custom ? 'Edita lo que quieras y pulsa «Usar esta». Nada cambia hasta que aceptes.' : 'Revisa antes de aceptar. Puede equivocarse: verifica contra tu fuente.'), r.node,
        h('div', { class: 'ia-btns' }, h('button', { class: 'btn sm', onclick: () => { ia.result = null; renderIA(); } }, 'Descartar'),
          r.onApply ? h('button', { class: 'btn sm primary', onclick: () => { const f = r.onApply; ia.result = null; f(); renderIA(); } }, ic('check', 14), r.applyLabel || 'Aceptar') : null)));
      return markAI();
    }
    const p = curLesson(), lesAny = sel.t === 'pan' ? course.modulos[sel.m] && course.modulos[sel.m].pantallas[sel.p] : null, b = p && sel.b != null ? p.bloques[sel.b] : null;
    const guiado = modo() === 'guiado';
    /* sugerencias proactivas (modo Guiado): salen de la revisión, con su porqué */
    if (guiado && lesAny) {
      const sug = Modelo.revisar(course).filter((x) => x.target.t === 'pan' && x.target.m === sel.m && x.target.p === sel.p).slice(0, 3);
      if (sug.length) wrap.append(h('div', { class: 'ia-sug' }, h('b', {}, 'Te sugiero revisar'), sug.map((x) => h('div', { class: 'ia-sug-i' }, x.msg.replace(/^[^:]*:\s*/, ''), h('small', {}, POR[x.paso] || '')))));
    }
    const TX = { parrafo: 'texto', cita: 'texto', encabezado: 'texto' };
    if (b && TX[b.tipo]) {
      wrap.append(h('p', {}, 'Bloque: ', h('b', {}, BL.BLOQUES[b.tipo].label)));
      const hay = String(b[TX[b.tipo]] || '').trim().length > 15;
      const ok = (fn) => () => hay ? fn() : toast('Escribe primero el texto de este bloque.');
      wrap.append(iaAccion('Acortar', 'text', ok(() => aiVariantes(p, b, 'acortar')), 'Deja lo esencial en menos palabras.', 'un párrafo de 120 palabras pasa a 50'),
        iaAccion('Simplificar', 'wand', ok(() => aiVariantes(p, b, 'simplificar')), 'Frases cortas y palabras sencillas.'),
        iaAccion('Tono profesional', 'sparkles', ok(() => aiVariantes(p, b, 'formal')), 'Mismo contenido con tono más formal.'));
      if (b.tipo === 'parrafo') wrap.append(iaAccion('Dividir en 2 bloques', 'layers', ok(() => dividirParrafo(p, sel.b)), 'Un bloque, una idea: se lee mejor.'));
    } else if (b && AI_BLK[b.tipo]) {
      wrap.append(h('p', {}, 'Bloque: ', h('b', {}, BL.BLOQUES[b.tipo].label)), iaAccion('Generar desde un texto', 'wand', () => aiBloque(p, b), 'Convierte el texto que pegues en este bloque.'));
    } else if (b) wrap.append(h('p', {}, 'Para «' + BL.BLOQUES[b.tipo].label + '» aún no hay acciones de IA.'));
    if (lesAny && !b && lesAny.tipo) {
      const tx = screenText(lesAny), ok = (fn) => () => tx.replace(/\s/g, '').length > 80 ? fn() : toast('Esta lección tiene muy poco texto. Escribe el contenido primero.');
      wrap.append(h('p', {}, 'Lección: ', h('b', {}, lesAny.titulo || 'sin título')),
        iaAccion('Crear preguntas de esta lección', 'help', ok(() => aiPreguntasLeccion(lesAny)), 'Redacta 3 preguntas con distractores, solo con el texto de la lección.'),
        iaAccion('Extraer objetivos del texto', 'flag', ok(() => aiObjetivos(tx, 'la lección «' + (lesAny.titulo || 'sin título') + '»')), 'Propone objetivos con verbo de acción para que elijas.'));
    }
    if (sel.t === 'curso' && !isEval()) {
      const ta = h('textarea', { class: 'textarea', style: 'min-height:110px', placeholder: 'Pega aquí el texto de tu documento (manual, SOP, guion…)' });
      wrap.append(h('p', {}, 'Curso'), h('div', { class: 'fld' }, h('label', {}, 'Extraer objetivos de un documento'), ta),
        iaAccion('Extraer objetivos', 'flag', () => ta.value.trim().length > 80 ? aiObjetivos(ta.value, 'el texto que pegaste') : toast('Pega un poco más de texto.'), 'Propone objetivos con verbo de acción tomados de tu documento.'),
        iaAccion('Crear preguntas de un texto…', 'help', aiDesdeTexto));
    }
    if (!b && !lesAny && sel.t !== 'curso') wrap.append(h('p', { class: 'hint' }, 'Selecciona un bloque, una lección o el curso para ver qué puede hacer la IA ahí.'));
    if (!b && lesAny && !lesAny.tipo) wrap.append(h('p', { class: 'hint' }, 'Selecciona una lección o un bloque.'));
    wrap.append(h('div', { class: 'ia-foot' }, 'La IA nunca crea el curso ni decide la pedagogía: solo reescribe, extrae y propone sobre lo que ya escribiste.'));
    markAI();
  }
  /* 3 versiones de un texto: editables, y solo se aplican con «Usar esta» */
  async function aiVariantes(p, b, modoV) {
    const key = 'texto', orig = String(b[key] || '');
    const r = await aiRun('variantes', { texto: orig, modo: modoV, titulo: p.titulo }); if (!r) return;
    iaOpciones('Opciones para el bloque', 'texto del bloque «' + (BL.BLOQUES[b.tipo].label) + '» (' + Modelo.palabras(orig) + ' palabras)', r.opciones.map((t) => ({ texto: t })), (t) => { b[key] = t; changed(true); doPreview.now(); });
  }
  function iaOpciones(title, fuente, ops, aceptar) {
    const node = h('div', { class: 'ia-ops' }, ops.map((o, i) => { const ta = h('textarea', { class: 'textarea', style: 'min-height:92px' }); ta.value = o.texto;
      return h('div', { class: 'ia-op' }, h('small', {}, 'Opción ' + (i + 1) + ' · ' + Modelo.palabras(o.texto) + ' palabras'), ta, h('button', { class: 'btn sm primary', onclick: () => { const t = ta.value.trim(); if (!t) return; ia.result = null; aceptar(t); renderIA(); } }, ic('check', 14), 'Usar esta')); }));
    ia.result = { title, fuente, node, custom: true }; setRightTab('ia');
  }
  async function aiPreguntasLeccion(les) {
    const r = await aiRun('preguntas', { texto: screenText(les), n: 3, tema: course.curso.titulo }); if (!r) return;
    if (!r.length) { toast('La IA no produjo preguntas válidas. Inténtalo de nuevo.'); return; }
    const sets = r.map((q) => { const o = { enunciado: q.enunciado, opciones: q.opciones.slice(), correcta: q.correcta, retroalimentacion: q.retroalimentacion }; return o; });
    const node = h('div', { class: 'ia-ops' }, sets.map((q, k) => {
      const en = h('textarea', { class: 'textarea', style: 'min-height:56px' }); en.value = q.enunciado; en.oninput = () => { q.enunciado = en.value; };
      const rows = q.opciones.map((o, i) => { const inp = h('input', { class: 'input', type: 'text', value: o }); inp.oninput = () => { q.opciones[i] = inp.value; }; const rd = h('input', { type: 'radio', name: 'iaq' + k, title: 'Respuesta correcta' }); rd.checked = i === q.correcta; rd.onchange = () => { q.correcta = i; }; return h('div', { class: 'ia-opt' }, rd, inp); });
      const inc = h('input', { type: 'checkbox' }); inc.checked = true; q._on = true; inc.onchange = () => { q._on = inc.checked; };
      return h('div', { class: 'ia-op' }, h('label', { class: 'chk' }, inc, ' Pregunta ' + (k + 1)), en, rows);
    }));
    iaOpcionesRes('Preguntas propuestas', 'texto de la lección «' + (les.titulo || 'sin título') + '» (' + Modelo.palabras(screenText(les)) + ' palabras)', node, () => {
      const ok = sets.filter((q) => q._on && q.enunciado.trim() && q.opciones.every((x) => x.trim())).map((q) => ({ enunciado: q.enunciado.trim(), opciones: q.opciones.map((x) => x.trim()), correcta: q.correcta, retroalimentacion: q.retroalimentacion, objetivo: les.objetivo || null }));
      if (!ok.length) { toast('Ninguna pregunta quedó completa.'); return; } addQuestions(ok); toast(ok.length + ' preguntas agregadas a la evaluación' + (les.objetivo ? ', ligadas al objetivo de la lección.' : '.'));
    }, 'Agregar a la evaluación');
  }
  function iaOpcionesRes(title, fuente, node, onApply, label) { ia.result = { title, fuente, node, onApply, applyLabel: label }; setRightTab('ia'); }
  async function aiObjetivos(texto, desde) {
    const r = await aiRun('objetivos', { texto, n: 5 }); if (!r) return;
    const sets = r.objetivos.map((t) => ({ t, on: true }));
    const node = h('div', { class: 'ia-ops' }, sets.map((o) => { const inp = h('input', { class: 'input', type: 'text', value: o.t }); inp.oninput = () => { o.t = inp.value; }; const cb = h('input', { type: 'checkbox' }); cb.checked = true; cb.onchange = () => { o.on = cb.checked; }; return h('div', { class: 'ia-opt' }, cb, inp); }));
    iaOpcionesRes('Objetivos propuestos', desde, node, () => {
      const nuevos = sets.filter((o) => o.on && o.t.trim()).map((o) => o.t.trim()); if (!nuevos.length) return;
      Modelo.setObjetivos(course, course.objetivos.map((o) => o.texto).concat(nuevos)); changed(true); toast(nuevos.length + ' objetivos agregados al curso.');
    }, 'Agregar al curso');
  }

  /* ---------- esquema ---------- */
  function select(s) {
    const mismo = sel && sameNode(sel, s); sel = s; if (!mismo && !ia.busy) ia.result = null; renderOutline(); renderForm(); renderStatus();
    if (!mismo) doPreview.now(); else markCanvasSel(true);
    if (!$('rp-ia').hidden) renderIA();
  }
  function addScreen(mi, tipo) { const m = course.modulos[mi]; m.pantallas.push(newScreen(m, tipo)); collapsed.delete(m.id); sel = { t: 'pan', m: mi, p: m.pantallas.length - 1 }; changed(true); doPreview.now(); setTimeout(() => { const t = document.querySelector('.title-input'); t && t.focus(); }, 30); }
  function addMenu(anchor, mi) {
    showMenu(anchor, [{ header: 'Añadir pantalla' }].concat(Object.entries(TIPOS).map(([k, v]) => ({ label: v.label, desc: v.desc, icon: v.icon, onclick: () => addScreen(mi, k) })),
      [{ sep: true }, { header: 'Próximamente' }], PROXIMAS.map((n) => ({ label: n, icon: 'plus', disabled: true }))));
  }
  function addQuestion() {
    course.evaluacion.preguntas.push({ id: genId('q'), tipo: 'opcion_multiple', enunciado: '', opciones: ['', '', ''], correcta: 0, retroalimentacion: '' });
    sel = { t: 'q', q: course.evaluacion.preguntas.length - 1 }; changed(true); doPreview.now();
  }
  function dupScreen(mi, pi) {
    const m = course.modulos[mi], c = JSON.parse(JSON.stringify(m.pantallas[pi]));
    c.id = genId(m.id + '-p'); c.titulo = (c.titulo || 'Pantalla') + ' (copia)';
    m.pantallas.splice(pi + 1, 0, c); sel = { t: 'pan', m: mi, p: pi + 1 }; changed(true);
  }
  const confirmDel = (what) => confirm('¿Eliminar ' + what + '? Esta acción no se puede deshacer.');
  function menuBtn(items) { return h('button', { class: 'btn ghost sm icon', title: 'Más acciones', onclick: (e) => { e.stopPropagation(); showMenu(e.currentTarget, items, { alignRight: true }); } }, ic('more', 16)); }

  function renderOutline() {
    const o = $('outline'); o.innerHTML = ''; $('btnAddModule').parentNode.style.display = isEval() ? 'none' : '';
    if (!isEval()) o.append(rutaPanel());
    const errs = S.validateCourse(course).errors.map(target);
    const bad = (t) => errs.some((e) => same(e, t));
    const dot = (t) => (bad(t) ? h('span', { class: 'bad-dot', title: 'Tiene errores' }) : null);
    o.append(h('div', { class: 'row' + (sel.t === 'curso' ? ' sel' : ''), onclick: () => select({ t: 'curso' }) },
      h('span', { class: 'ico t-curso' }, ic('sliders', 14)), h('span', { class: 't' }, course.curso.titulo || (isEval() ? 'Datos de la evaluación' : 'Datos del curso')), dot({ t: 'curso' })));

    mods().forEach((m, mi) => {
      const open = !collapsed.has(m.id), ms = { t: 'mod', m: mi };
      o.append(h('div', { class: 'mod-h' + (sameNode(sel, ms) ? ' sel' : ''), onclick: () => select(ms) },
        h('button', { class: 'tog', title: open ? 'Contraer' : 'Expandir', onclick: (e) => { e.stopPropagation(); open ? collapsed.add(m.id) : collapsed.delete(m.id); renderOutline(); } }, ic(open ? 'chevron-down' : 'chevron-right', 14)),
        h('span', { class: 't' }, m.titulo || 'Módulo sin título'), h('span', { class: 'cnt' }, m.pantallas.length), dot(ms),
        h('span', { class: 'act' },
          h('button', { class: 'btn ghost sm icon', title: 'Añadir pantalla', onclick: (e) => { e.stopPropagation(); addMenu(e.currentTarget, mi); } }, ic('plus', 15)),
          menuBtn([
            { label: 'Subir módulo', icon: 'arrow-up', disabled: mi === 0, onclick: () => { move(course.modulos, mi, -1); sel = { t: 'mod', m: mi - 1 }; changed(true); } },
            { label: 'Bajar módulo', icon: 'arrow-down', disabled: mi === course.modulos.length - 1, onclick: () => { move(course.modulos, mi, 1); sel = { t: 'mod', m: mi + 1 }; changed(true); } },
            { sep: true },
            { label: 'Eliminar módulo', icon: 'trash', danger: true, onclick: () => { if (confirmDel('el módulo "' + (m.titulo || 'sin título') + '" y sus pantallas')) { course.modulos.splice(mi, 1); sel = { t: 'curso' }; changed(true); } } }]))));
      if (!open) return;
      const kids = h('div', { class: 'kids' });
      if (!m.pantallas.length) kids.append(h('div', { class: 'empty-mini' }, 'Sin pantallas todavía.'));
      m.pantallas.forEach((p, pi) => {
        const ps = { t: 'pan', m: mi, p: pi };
        kids.append(h('div', { class: 'row' + (sameNode(sel, ps) ? ' sel' : ''), onclick: () => select(ps) },
          h('span', { class: 'ico t-' + p.tipo }, ic((TIPOS[p.tipo] || TIPOS.texto_imagen).icon, 14)),
          h('span', { class: 't' }, p.titulo || 'Pantalla sin título'), dot(ps),
          h('span', { class: 'act' }, menuBtn([
            { label: 'Subir', icon: 'arrow-up', disabled: pi === 0, onclick: () => { move(m.pantallas, pi, -1); sel = { t: 'pan', m: mi, p: pi - 1 }; changed(true); } },
            { label: 'Bajar', icon: 'arrow-down', disabled: pi === m.pantallas.length - 1, onclick: () => { move(m.pantallas, pi, 1); sel = { t: 'pan', m: mi, p: pi + 1 }; changed(true); } },
            { label: 'Duplicar', icon: 'file', onclick: () => dupScreen(mi, pi) },
            { sep: true },
            { label: 'Eliminar pantalla', icon: 'trash', danger: true, onclick: () => { if (confirmDel('la pantalla "' + (p.titulo || 'sin título') + '"')) { m.pantallas.splice(pi, 1); sel = { t: 'mod', m: mi }; changed(true); } } }]))));
      });
      o.append(kids);
    });

    o.append(h('div', { class: 'grp-h' }, h('span', { class: 'kicker' }, 'Evaluación'), h('span', { class: 'cnt' }, course.evaluacion.preguntas.length),
      h('button', { class: 'btn ghost sm icon', title: 'Añadir pregunta', onclick: addQuestion }, ic('plus', 15))));
    if (!course.evaluacion.preguntas.length) o.append(h('div', { class: 'empty-mini', style: 'margin-left:8px' }, isEval() ? 'Agrega preguntas con el botón + o desde «Datos de la evaluación».' : 'Sin preguntas: el curso se marcará solo como completado.'));
    course.evaluacion.preguntas.forEach((q, qi) => {
      const qs = { t: 'q', q: qi };
      o.append(h('div', { class: 'row' + (sameNode(sel, qs) ? ' sel' : ''), onclick: () => select(qs) },
        h('span', { class: 'ico t-pregunta' }, ic('help', 14)), h('span', { class: 't' }, q.enunciado || 'Pregunta ' + (qi + 1)), dot(qs),
        h('span', { class: 'act' }, menuBtn([
          { label: 'Subir', icon: 'arrow-up', disabled: qi === 0, onclick: () => { move(course.evaluacion.preguntas, qi, -1); sel = { t: 'q', q: qi - 1 }; changed(true); } },
          { label: 'Bajar', icon: 'arrow-down', disabled: qi === course.evaluacion.preguntas.length - 1, onclick: () => { move(course.evaluacion.preguntas, qi, 1); sel = { t: 'q', q: qi + 1 }; changed(true); } },
          { sep: true },
          { label: 'Eliminar pregunta', icon: 'trash', danger: true, onclick: () => { if (confirmDel('la pregunta')) { course.evaluacion.preguntas.splice(qi, 1); sel = { t: 'curso' }; changed(true); } } }]))));
    });
  }

  /* ---------- controles ---------- */
  const fld = (label, input, hint) => h('div', { class: 'fld' }, label ? h('label', {}, label) : null, input, hint ? h('div', { class: 'hint' }, hint) : null);
  const sec = (title, icon, ...kids) => h('section', { class: 'sec' }, h('div', { class: 'sec-h' }, ic(icon, 16), h('h3', {}, title)), h('div', { class: 'card' }, kids));
  function bindText(el, obj, key, number) {
    el.addEventListener('input', () => { obj[key] = number ? (el.value === '' ? null : Number(el.value)) : el.value; changed(false); });
    return el;
  }
  const text = (obj, key, opts = {}) => bindText(opts.area ? h('textarea', { class: 'textarea', value: obj[key] || '', style: opts.rows ? 'min-height:' + opts.rows * 24 + 'px' : null, placeholder: opts.ph || null })
    : h('input', { class: 'input', type: opts.number ? 'number' : 'text', value: obj[key] == null ? '' : obj[key], placeholder: opts.ph || null }), obj, key, opts.number);
  const titleInput = (obj, key, ph) => bindText(h('input', { class: 'title-input', type: 'text', value: obj[key] || '', placeholder: ph }), obj, key);
  function lines(obj, key, ph) {
    const el = h('textarea', { class: 'textarea', value: (obj[key] || []).join('\n'), style: 'min-height:84px', placeholder: ph });
    el.addEventListener('input', () => { obj[key] = el.value.split('\n').map((x) => x.trim()).filter(Boolean); changed(false); });
    return el;
  }
  function chips(obj, key, ph) {
    const wrap = h('div', { class: 'chips-in' }), inp = h('input', { placeholder: ph });
    const add = () => { const v = inp.value.replace(/,/g, '').trim().toLowerCase(); if (v) { obj[key] = (obj[key] || []).concat(v); inp.value = ''; draw(); changed(false); } };
    const draw = () => { wrap.innerHTML = ''; (obj[key] || []).forEach((t, i) => wrap.append(h('span', { class: 'chip' }, t, h('button', { title: 'Quitar', onclick: () => { obj[key].splice(i, 1); draw(); changed(false); } }, ic('x', 12))))); wrap.append(inp); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } else if (e.key === 'Backspace' && !inp.value && (obj[key] || []).length) { obj[key].pop(); draw(); changed(false); inp.focus(); } });
    inp.addEventListener('blur', add);
    draw(); return wrap;
  }
  function choose(obj, key, opts, after) {
    const el = h('select', { class: 'select' }, Object.entries(opts).map(([v, l]) => h('option', { value: v }, l)));
    el.value = obj[key] || Object.keys(opts)[0];
    el.addEventListener('change', () => { obj[key] = el.value; after ? after() : changed(false); });
    return el;
  }
  const crumb = (...parts) => h('div', { class: 'crumb' }, parts.flatMap((p, i) => [i ? ic('chevron-right', 12) : null, p.fn ? h('a', { onclick: p.fn }, p.t) : h('span', {}, p.t)]));

  /* ---------- IA local ---------- */
  const AI_LABEL = { variantes: 'Escribiendo 3 versiones', objetivos: 'Extrayendo objetivos', preguntas: 'Redactando preguntas', mejorar: 'Reescribiendo el texto', puntos: 'Buscando puntos clave', acordeon: 'Organizando el acordeón', bloque: 'Armando el bloque' };
  async function aiRun(tarea, args) {
    if (ia.busy) { toast('Ya hay una tarea de IA en curso.'); return null; }
    const st = await api('/api/ai/status');
    if (!st.disponible) { toast('IA local no disponible: no se encontró el modelo. Puedes seguir trabajando sin IA.'); return null; }
    const ac = new AbortController(), t0 = Date.now();
    ia.result = null; ia.busy = { label: AI_LABEL[tarea] || 'Trabajando', ac }; setRightTab('ia');
    const tm = setInterval(() => { const el = $('iaTimer'); if (el) el.textContent = (st.cargado ? '' : 'La primera vez el modelo tarda unos segundos en cargarse. ') + 'Todo ocurre en tu PC, sin internet. ' + Math.round((Date.now() - t0) / 1000) + ' s'; }, 500);
    try {
      const r = await fetch('/api/ai', { method: 'POST', signal: ac.signal, body: JSON.stringify({ tarea, args }) }).then((x) => x.json());
      if (!r.ok) { if (r.error !== 'Cancelado') toast('La IA no pudo completar la tarea: ' + r.error); return null; }
      return r.resultado;
    } catch (e) { return null; } finally { clearInterval(tm); ia.busy = null; renderIA(); }
  }
  function toast(msg) { const t = h('div', { class: 'toast', role: 'status' }, ic('info', 18), h('span', {}, msg), h('button', { onclick: () => t.remove() }, 'Cerrar')); document.body.append(t); setTimeout(() => t.remove(), 9000); }
  /* Muestra el resultado y deja decidir: aplicar o descartar */
  function aiReview(title, node, onApply, applyLabel) { ia.result = { title, node, onApply, applyLabel }; setRightTab('ia'); }
  const aiBtn = (label, fn, icon) => h('button', { class: 'btn sm ai', onclick: fn }, ic(icon || 'sparkles', 14), label);
  const screenText = (p) => p.tipo === 'bloques' ? BL.textoPantalla(p) : p.tipo === 'acordeon' ? (p.contenido.items || []).map((i) => (i.encabezado ? i.encabezado + ': ' : '') + i.texto).join('\n') : [p.contenido.texto].concat(p.contenido.puntos || []).join('\n');
  const moduleText = (m) => m.pantallas.map((p) => (p.titulo ? p.titulo + '\n' : '') + screenText(p)).join('\n\n');

  async function aiMejorar(p, modo) {
    const r = await aiRun('mejorar', { texto: p.contenido.texto, modo, titulo: p.titulo }); if (!r) return;
    aiReview('Texto propuesto', h('div', { class: 'cmp' }, h('div', {}, h('small', {}, 'Original'), h('p', {}, p.contenido.texto)), h('div', { class: 'new' }, h('small', {}, 'Propuesto'), h('p', {}, r.texto))), () => { p.contenido.texto = r.texto; changed(true); }, 'Usar este texto');
  }
  async function aiPuntos(p) {
    const r = await aiRun('puntos', { texto: p.contenido.texto, titulo: p.titulo }); if (!r) return;
    aiReview('Puntos clave propuestos', h('ul', { class: 'aiul' }, r.puntos.map((x) => h('li', {}, x))), () => { p.contenido.puntos = r.puntos; changed(true); }, 'Usar estos puntos');
  }
  async function aiAcordeon(p) {
    const r = await aiRun('acordeon', { texto: screenText(p), titulo: p.titulo }); if (!r) return;
    aiReview('Acordeón propuesto', h('div', {}, r.items.map((i) => h('div', { class: 'item', style: 'margin-bottom:8px' }, h('b', {}, i.encabezado), h('div', { class: 'muted', style: 'font-size:13px' }, i.texto)))), () => { p.contenido.items = r.items; changed(true); }, 'Reemplazar elementos');
  }
  function addQuestions(list) {
    const ps = course.evaluacion.preguntas;
    list.forEach((q) => { const blank = ps.find((x) => !String(x.enunciado || '').trim()); const obj = Object.assign({ tipo: 'opcion_multiple', retroalimentacion: '' }, q); if (blank) Object.assign(blank, obj); else ps.push(Object.assign({ id: genId('q') }, obj)); });
    changed(true);
  }
  function pegarPreguntas() {
    const ta = h('textarea', { class: 'textarea', style: 'min-height:260px;font-family:ui-monospace,Consolas,monospace;font-size:13px', placeholder: '1. ¿A qué temperatura se sirve un tinto?\na) 4 °C\n*b) 16-18 °C\nc) 30 °C\nRetro: Entre 16 y 18 grados.\n\n2. ¿Cuánto se llena la copa?\na) Hasta el borde\nb) Un tercio\nc) Dos tercios\nRespuesta: b' });
    const info = h('div', { class: 'hint', style: 'margin-top:8px' });
    const calc = () => { const r = QuizParse.parse(ta.value); info.textContent = ta.value.trim() ? r.preguntas.length + ' preguntas detectadas' + (r.warnings.length ? ' · ' + r.warnings.join(' · ') : '') : ''; return r; };
    ta.addEventListener('input', calc);
    openModal('Pegar preguntas', [h('p', { class: 'muted', style: 'font-size:13px;margin-bottom:10px' }, 'Pega tus preguntas desde Word o un documento. Marca la correcta con * al inicio, con «(correcta)» al final o con una línea «Respuesta: b». «Retro:» agrega la retroalimentación.'), ta, info],
      [h('button', { class: 'btn', onclick: closeModal }, 'Cancelar'), h('button', { class: 'btn primary', onclick: () => { const r = calc(); if (!r.preguntas.length) { info.textContent = 'No se detectó ninguna pregunta. Revisa el formato.'; return; } closeModal(); addQuestions(r.preguntas); toast(r.preguntas.length + ' preguntas agregadas.'); } }, ic('check', 15), 'Agregar')]);
    ta.focus();
  }
  function aiDesdeTexto() {
    const ta = h('textarea', { class: 'textarea', style: 'min-height:220px', placeholder: 'Pega aquí el material de estudio (un procedimiento, un manual, un artículo…). La IA redactará preguntas basadas solo en este texto.' });
    const nSel = h('select', { class: 'select sm' }, [3, 5, 8].map((n) => h('option', { value: n }, n + ' preguntas')));
    openModal('Redactar preguntas con IA local', [ta, h('div', { class: 'aibar', style: 'margin:12px 0 0' }, h('span', { class: 'lbl' }, 'Cantidad'), nSel, h('span', { class: 'muted', style: 'font-size:12px' }, 'Alrededor de 1 minuto por pregunta'))],
      [h('button', { class: 'btn', onclick: closeModal }, 'Cancelar'), h('button', { class: 'btn primary', onclick: () => { const t = ta.value; if (t.replace(/\s/g, '').length < 80) { toast('Pega al menos un par de párrafos de texto.'); return; } closeModal(); aiPreguntasDe(t, +nSel.value); } }, ic('sparkles', 15), 'Generar')]);
    ta.focus();
  }
  async function aiPreguntas(mi, n) {
    const fuente = mi === 'all' ? course.modulos.map(moduleText).join('\n\n') : moduleText(course.modulos[mi]);
    if (fuente.replace(/\s/g, '').length < 80) { toast('Escribe primero el contenido del curso: la IA necesita texto para redactar preguntas.'); return; }
    return aiPreguntasDe(fuente, n);
  }
  async function aiPreguntasDe(fuente, n) {
    const r = await aiRun('preguntas', { texto: fuente, n, tema: course.curso.titulo }); if (!r) return;
    if (!r.length) { toast('La IA no produjo preguntas válidas. Inténtalo de nuevo o con menos preguntas.'); return; }
    aiReview(r.length + ' preguntas propuestas', h('div', {}, r.map((q, k) => h('div', { class: 'item', style: 'margin-bottom:10px' }, h('b', {}, (k + 1) + '. ' + q.enunciado),
      h('ul', { class: 'aiul' }, q.opciones.map((o, i) => h('li', { class: i === q.correcta ? 'ok' : '' }, o))), h('div', { class: 'muted', style: 'font-size:12px' }, q.retroalimentacion)))),
      () => addQuestions(r), 'Agregar a la evaluación');
  }

  /* ---------- formularios ---------- */
  function renderForm() {
    const f = $('form'); f.innerHTML = '';
    if (sel.t === 'mod' && course.modulos[sel.m]) formMod(f, course.modulos[sel.m]);
    else if (sel.t === 'pan' && course.modulos[sel.m] && course.modulos[sel.m].pantallas[sel.p]) formPan(f, course.modulos[sel.m], course.modulos[sel.m].pantallas[sel.p]);
    else if (sel.t === 'q' && course.evaluacion.preguntas[sel.q]) formQ(f, course.evaluacion.preguntas[sel.q], sel.q);
    else { sel = { t: 'curso' }; formCurso(f); }
    $('rp-prop').scrollTop = 0;
    markAI(); renderStatus(); if (!$('rp-ia').hidden) renderIA();
  }
  /* botones de IA desactivados si el modelo no está instalado */
  function markAI() { const off = window.AIStatus && AIStatus.state.disponible === false; document.querySelectorAll('.btn.ai').forEach((b) => { b.disabled = !!off; b.title = off ? 'IA local no instalada: mira el estado en la barra superior' : ''; }); }
  window.AIStatus && AIStatus.onChange(markAI);
  function objSelect(obj) {
    if (!course.objetivos.length) return h('div', { class: 'hint' }, 'Aún no hay objetivos. ', h('a', { onclick: () => irA({ t: 'curso' }) }, 'Escríbelos en «Datos del curso»'), '.');
    const el = h('select', { class: 'select' }, [h('option', { value: '' }, '— Elige un objetivo —')].concat(course.objetivos.map((o, i) => h('option', { value: o.id }, (i + 1) + '. ' + o.texto))));
    el.value = obj.objetivo || ''; el.onchange = () => { obj.objetivo = el.value || null; changed(false); }; return el;
  }
  function secBrief() {
    const fi = course.curso.ficha;
    const ta = h('textarea', { class: 'textarea', style: 'min-height:110px', placeholder: 'Un objetivo por línea, con verbo de acción.\nEj.: Servir el vino a su temperatura correcta' });
    ta.value = course.objetivos.map((o) => o.texto).join('\n');
    ta.addEventListener('change', () => { Modelo.setObjetivos(course, ta.value.split('\n')); changed(true); });
    return sec('Brief y objetivos', 'flag',
      fld('¿Para quién es el curso?', text(fi, 'audiencia', { ph: 'Ej. Meseros de nuevo ingreso' })),
      fld('Prerrequisitos', text(fi, 'prerrequisitos', { ph: 'Qué deben saber antes (opcional)' })),
      fld('Objetivo general', text(fi, 'objetivo_general', { area: true, rows: 2, ph: 'Al terminar, el alumno podrá…' })),
      fld('Objetivos específicos', ta, 'De 3 a 5, con verbo de acción. Cada lección y cada pregunta se liga a uno.'));
  }
  function secFicha() {
    const fi = course.curso.ficha;
    return sec('Ficha del curso', 'file',
      h('div', { class: 'row2' }, fld('Autor', text(fi, 'autor', { ph: 'Quién lo elabora' })), fld('Categoría', text(fi, 'categoria', { ph: 'Ej. Servicio, Seguridad' }))),
      h('div', { class: 'row2' }, fld('Navegación', choose(fi, 'navegacion', { libre: 'Libre: el alumno salta donde quiera', lineal: 'Lineal: en orden' })),
        fld('Certificado', (() => { const el = h('select', { class: 'select' }, [h('option', { value: 'no' }, 'Sin certificado'), h('option', { value: 'si' }, 'Con certificado al aprobar')]); el.value = fi.certificado ? 'si' : 'no'; el.onchange = () => { fi.certificado = el.value === 'si'; changed(false); }; return el; })())));
  }
  function formCurso(f) {
    const c = course.curso;
    f.append(crumb({ t: 'Curso' }), titleInput(c, 'titulo', 'Título del curso'), h('div', { class: 'doc-sub' }, h('span', { class: 'badge brand' }, ic('package', 12), 'SCORM 1.2'), h('span', {}, (isEval() ? 'Evaluación · ' : course.modulos.length + ' módulos · ') + course.evaluacion.preguntas.length + ' preguntas')));
    if (!isEval()) f.append(secBrief());
    f.append(sec('General', 'sliders',
      fld('Descripción', text(c, 'descripcion', { area: true, rows: 3, ph: 'Qué aprenderá el alumno y para quién es.' })),
      h('div', { class: 'row2' },
        fld('Idioma', choose(c, 'idioma', { 'es-MX': 'Español (México)', 'es-ES': 'Español (España)', 'en-US': 'English (US)', 'pt-BR': 'Português (Brasil)' })),
        fld('Duración (min)', text(c, 'duracion_min', { number: true })),
        fld('Puntaje aprobatorio (%)', text(c, 'puntaje_aprobatorio', { number: true })))));
    if (!isEval()) f.append(secFicha());
    const sw = h('div', { class: 'swatches' });
    const drawSw = () => { sw.innerHTML = ''; Object.entries(COLORES).forEach(([k, [n, hex]]) => sw.append(h('button', { class: 'sw' + ((c.color || 'teal') === k ? ' on' : ''), onclick: () => { c.color = k; drawSw(); changed(false); } }, h('i', { style: 'background:' + hex }), n))); };
    drawSw();
    f.append(sec('Apariencia del curso', 'eye', fld('Color principal', sw, 'Se aplica a la portada, botones y barra de progreso que verá el alumno.')));
    const E = course.evaluacion;
    f.append(sec(isEval() ? 'Reglas de la evaluación' : 'Quiz final: reglas', 'sliders',
      h('div', { class: 'row2' },
        fld('Modo', choose(E, 'modo', { practica: 'Práctica: corrige al responder', examen: 'Examen: corrige al final' }), 'En examen el alumno no ve si acertó hasta terminar; al cierre se muestra la revisión (si aprueba o agota sus intentos).'),
        fld('Intentos', (() => { const el = h('select', { class: 'select' }, [[0, 'Ilimitados'], [1, '1 intento'], [2, '2 intentos'], [3, '3 intentos'], [5, '5 intentos']].map(([v, l]) => h('option', { value: v }, l))); el.value = String(E.intentos || 0); el.onchange = () => { E.intentos = +el.value; changed(false); }; return el; })(), 'Al agotarlos sin aprobar, el resultado queda como no aprobado.')),
      h('label', { class: 'chk', style: 'margin-top:12px' }, (() => { const cb = h('input', { type: 'checkbox' }); cb.checked = !!E.aleatorizar; cb.onchange = () => { E.aleatorizar = cb.checked; changed(false); }; return cb; })(), ' Barajar el orden de las opciones en cada intento'),
      fld('Preguntas que se muestran por intento', (() => { const tot = E.preguntas.length, vals = [3, 5, 8, 10, 15, 20, 30].filter((n) => n < tot); const el = h('select', { class: 'select' }, [h('option', { value: 0 }, 'Todas (' + tot + ')')].concat(vals.map((n) => h('option', { value: n }, n + ' al azar del banco')))); el.value = String(vals.includes(E.mostrar) ? E.mostrar : 0); el.onchange = () => { E.mostrar = +el.value || 0; changed(false); }; return el; })(), 'Tu banco tiene ' + E.preguntas.length + ' preguntas. Si eliges menos, cada intento sorteará un grupo distinto.'),
      h('label', { class: 'chk', style: 'margin-top:12px' }, (() => { const cb = h('input', { type: 'checkbox' }); cb.checked = E.mostrar_respuestas !== false; cb.onchange = () => { E.mostrar_respuestas = cb.checked; changed(false); }; return cb; })(), ' Mostrar las respuestas correctas al final (modo examen)')));
    const modSel = h('select', { class: 'select sm' }, [h('option', { value: 'all' }, 'Todo el curso')].concat(course.modulos.map((m, i) => h('option', { value: i }, m.titulo || 'Módulo ' + (i + 1)))));
    const nSel = h('select', { class: 'select sm' }, [3, 5, 8].map((n) => h('option', { value: n }, n + ' preguntas')));
    f.append(sec('Agregar preguntas', 'help',
      h('div', { class: 'aibar', style: 'margin-bottom:0' }, h('span', { class: 'lbl' }, 'Sin IA'), h('button', { class: 'btn sm', onclick: pegarPreguntas }, ic('copy', 14), 'Pegar preguntas…'), h('button', { class: 'btn sm', onclick: addQuestion }, ic('plus', 14), 'Pregunta en blanco')),
      h('div', { style: 'height:10px' }),
      h('div', { class: 'aibar', style: 'margin-bottom:0' }, h('span', { class: 'lbl' }, ic('sparkles', 13), 'IA local'), aiBtn('Desde un texto…', aiDesdeTexto, 'file-text'),
        isEval() ? null : [h('span', { class: 'muted', style: 'font-size:12px' }, 'o desde el curso:'), modSel, nSel, aiBtn('Generar', () => aiPreguntas(modSel.value === 'all' ? 'all' : +modSel.value, +nSel.value))]),
      h('div', { class: 'hint' }, 'La IA corre en tu PC, sin internet, y tarda alrededor de 1 minuto por pregunta. Siempre revisas lo que propone antes de agregarlo.')));
    f.append(sec('Identificación', 'file', fld('Identificador', h('input', { class: 'input', type: 'text', value: c.id || '', disabled: true }), 'Lo usa el LMS para reconocer el curso. Se fija al crear el proyecto.')));
  }
  function formMod(f, m) {
    const mi = sel.m;
    f.append(crumb({ t: 'Contenido' }), titleInput(m, 'titulo', 'Título del módulo'),
      h('div', { class: 'doc-sub' }, h('span', { class: 'badge' }, ic('layers', 12), 'Módulo ' + (mi + 1)), h('span', {}, m.pantallas.length + ' pantallas')));
    const tiles = h('div', { class: 'tiles' }, Object.entries(TIPOS).map(([k, v]) => h('button', { class: 'tile', onclick: () => addScreen(mi, k) }, ic(v.icon, 20), h('b', {}, '+ ' + v.label), h('small', {}, v.desc))));
    f.append(sec('Añadir pantalla', 'plus', tiles));
    if (m.pantallas.length) f.append(sec('Pantallas del módulo', 'list', ...m.pantallas.map((p, pi) => h('button', { class: 'rv', onclick: () => select({ t: 'pan', m: mi, p: pi }) },
      ic((TIPOS[p.tipo] || TIPOS.texto_imagen).icon, 16), h('span', {}, p.titulo || 'Pantalla sin título', h('small', {}, (TIPOS[p.tipo] || {}).label || p.tipo))))));
  }
  /* ---------- bloques de aprendizaje (formularios) ---------- */
  const BL = window.Bloques;
  const bCollapsed = new WeakSet();
  const optsObj = (pairs) => Object.fromEntries(pairs);
  function imgPick(obj, key, altKey) {
    const thumb = h('div', { class: 'thumb sm' + (obj[key] ? '' : ' empty') }, obj[key] ? null : [ic('image', 20), h('br'), 'Sin imagen']);
    if (obj[key]) thumb.style.backgroundImage = 'url("/stock/' + encodeURIComponent(obj[key]) + '")';
    const pick = (name) => { obj[key] = name; if (altKey && !obj[altKey]) obj[altKey] = name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '); changed(true); };
    return h('div', { class: 'imgrow' }, thumb, h('div', { class: 'rest' }, obj[key] ? h('div', {}, h('b', {}, obj[key])) : h('div', { class: 'muted' }, 'Elige una imagen del banco.'),
      h('div', { class: 'btns' }, h('button', { class: 'btn sm', onclick: () => openStock(pick) }, ic('image', 14), obj[key] ? 'Cambiar…' : 'Elegir del banco…'),
        obj[key] ? h('button', { class: 'btn sm danger', onclick: () => { obj[key] = ''; changed(true); } }, ic('trash', 14), 'Quitar') : null)));
  }
  /* documento descargable: se sube el archivo y se guarda en la carpeta del banco; el paquete lo incrusta */
  function docPick(obj, key) {
    const file = h('input', { type: 'file', accept: '.pdf,.doc,.docx,.xls,.xlsx', hidden: true });
    file.addEventListener('change', async () => {
      const f = file.files[0]; file.value = ''; if (!f) return;
      if (!/\.(pdf|docx?|xlsx?)$/i.test(f.name)) { toast('Solo PDF, Word (.doc, .docx) o Excel (.xls, .xlsx).'); return; }
      if (f.size > 25 * 1024 * 1024) { toast('El archivo pesa más de 25 MB.'); return; }
      const r = await api('/api/doc?name=' + encodeURIComponent(f.name), { method: 'POST', body: await f.arrayBuffer() });
      if (r.error) { toast(f.name + ': ' + r.error); return; }
      obj[key] = r.archivo; if (!obj.titulo) obj.titulo = r.archivo.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '); changed(true);
    });
    return h('div', { class: 'imgrow' }, h('div', { class: 'thumb sm' + (obj[key] ? '' : ' empty') }, ic('file', 22)),
      h('div', { class: 'rest' }, obj[key] ? h('div', {}, h('b', {}, obj[key])) : h('div', { class: 'muted' }, 'Sube un PDF, Word o Excel (máx. 25 MB).'),
        h('div', { class: 'btns' }, file, h('button', { class: 'btn sm', onclick: () => file.click() }, ic('upload', 14), obj[key] ? 'Cambiar…' : 'Subir documento…'),
          obj[key] ? h('button', { class: 'btn sm danger', onclick: () => { obj[key] = ''; changed(true); } }, ic('trash', 14), 'Quitar') : null)));
  }
  function campoUi(c, obj, hasAlt) {
    const lbl = c.label + (c.req ? ' *' : '');
    if (c.t === 'text') return fld(lbl, text(obj, c.k, { ph: c.ph }), c.hint);
    if (c.t === 'area') return fld(lbl, text(obj, c.k, { area: true, rows: c.rows || 3, ph: c.ph }), c.hint);
    if (c.t === 'choice') return fld(lbl, choose(obj, c.k, optsObj(c.opts)), c.hint);
    if (c.t === 'lines') { if (!Array.isArray(obj[c.k])) obj[c.k] = []; return fld(lbl, lines(obj, c.k, c.ph), c.hint); }
    if (c.t === 'img') return fld(lbl, imgPick(obj, c.k, hasAlt ? 'alt' : null), c.hint);
    if (c.t === 'doc') return fld(lbl, docPick(obj, c.k), c.hint);
    if (c.t === 'bool') {
      const cb = h('input', { type: 'checkbox' }); cb.checked = !!obj[c.k];
      cb.addEventListener('change', () => { obj[c.k] = cb.checked; changed(false); });
      return h('label', { class: 'chk-row' }, cb, h('span', {}, c.label));
    }
    return null;
  }
  function itemsUi(c, b, p) {
    if (!Array.isArray(b[c.k])) b[c.k] = [];
    const arr = b[c.k], box = h('div');
    arr.forEach((it, i) => {
      const itemBox = h('div', { class: 'item' }, h('div', { class: 'item-h' }, h('b', {}, (c.t === 'marcadores' ? 'Punto ' : c.label.replace(/s$/, '') + ' ') + (i + 1)),
        h('button', { class: 'btn ghost sm icon', title: 'Subir', disabled: i === 0, onclick: () => { move(arr, i, -1); changed(true); } }, ic('arrow-up', 14)),
        h('button', { class: 'btn ghost sm icon', title: 'Bajar', disabled: i === arr.length - 1, onclick: () => { move(arr, i, 1); changed(true); } }, ic('arrow-down', 14)),
        h('button', { class: 'btn ghost sm icon danger', title: 'Quitar', disabled: arr.length <= (c.min || 1), onclick: () => { arr.splice(i, 1); changed(true); } }, ic('trash', 14))),
        c.sub.map((s) => campoUi(s, it, false)));
      if (c.t === 'marcadores') itemBox.append(h('div', { class: 'muted', style: 'font-size:12px' }, 'Posición: ' + Math.round(it.x) + ' % · ' + Math.round(it.y) + ' % (haz clic en la imagen de arriba para moverlo)'));
      box.append(itemBox);
    });
    const addBtn = h('button', { class: 'btn sm', onclick: () => { arr.push(JSON.parse(JSON.stringify(c.nuevo))); changed(true); } }, ic('plus', 14), c.t === 'marcadores' ? 'Agregar punto' : 'Agregar');
    if (c.t === 'marcadores') {
      let curIdx = arr.length ? arr.length - 1 : -1;
      const hs = h('div', { class: 'hs-ed' });
      if (b.archivo) {
        hs.append(h('img', { src: '/stock/' + encodeURIComponent(b.archivo), alt: '' }));
        arr.forEach((m, i) => hs.append(h('span', { class: 'pin-ed', style: 'left:' + m.x + '%;top:' + m.y + '%' }, i + 1)));
        hs.addEventListener('click', (e) => {
          if (!arr.length) { arr.push(JSON.parse(JSON.stringify(c.nuevo))); }
          const r = hs.getBoundingClientRect(), m = arr[curIdx >= 0 && curIdx < arr.length ? curIdx : arr.length - 1];
          m.x = Math.round(Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100))); m.y = Math.round(Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100)));
          changed(true);
        });
        return h('div', {}, h('div', { class: 'hint', style: 'margin-bottom:8px' }, 'Agrega un punto y haz clic en la imagen para colocarlo. Se mueve el último punto agregado.'), hs, box, addBtn);
      }
      return h('div', {}, h('div', { class: 'hint' }, 'Primero elige la imagen.'));
    }
    return h('div', {}, box, addBtn);
  }
  function bloqueCard(p, b, bi, solo) {
    const d = BL.BLOQUES[b.tipo]; const arr = p.bloques;
    if (!d) return h('div', { class: 'item' }, 'Bloque desconocido: ' + b.tipo);
    const col = !solo && bCollapsed.has(b);
    const head = h('div', { class: 'blk-h' },
      h('button', { class: 'blk-t', onclick: () => { if (solo) return; col ? bCollapsed.delete(b) : bCollapsed.add(b); renderForm(); } }, ic(col ? 'chevron-right' : 'chevron-down', 14), ic(d.icon, 15), h('b', {}, d.label), d.inter ? h('span', { class: 'badge' }, 'Interactivo') : null),
      h('button', { class: 'btn ghost sm icon', title: 'Subir', disabled: bi === 0, onclick: () => { move(arr, bi, -1); changed(true); } }, ic('arrow-up', 14)),
      h('button', { class: 'btn ghost sm icon', title: 'Bajar', disabled: bi === arr.length - 1, onclick: () => { move(arr, bi, 1); changed(true); } }, ic('arrow-down', 14)),
      h('button', { class: 'btn ghost sm icon', title: 'Duplicar', onclick: () => { const c2 = JSON.parse(JSON.stringify(b)); c2.id = Modelo.nuevoObjeto(b.tipo).id; arr.splice(bi + 1, 0, c2); sel = { t: 'pan', m: sel.m, p: sel.p, b: bi + 1 }; changed(true); } }, ic('copy', 14)),
      h('button', { class: 'btn ghost sm icon danger', title: 'Eliminar bloque', onclick: () => { if (confirmDel('este bloque')) { arr.splice(bi, 1); sel = { t: 'pan', m: sel.m, p: sel.p }; changed(true); } } }, ic('trash', 14)));
    const card = h('div', { class: 'blk-card' + (col ? ' col' : '') }, head);
    if (col) { card.append(h('div', { class: 'blk-sum' }, (BL.texto(b) || '(vacío)').slice(0, 110))); return card; }
    const body = h('div', { class: 'blk-b' });
    const hasAlt = d.campos.some((c) => c.k === 'alt');
    const sel12 = (bp) => { const cur = window.Modelo.colsDe(b, bp); return h('select', { class: 'select sm', onchange: (e) => { b.cols = Object.assign({ d: 12, t: 12, m: 12 }, b.cols || {}); b.cols[bp] = +e.target.value; changed(false); } },
      window.Modelo.COLS_OPC.map((o) => h('option', { value: o[0], selected: o[0] === cur }, o[1]))); };
    body.append(h('div', { class: 'cols-ed' }, fld('Ancho en escritorio', sel12('d')), fld('Ancho en tableta', sel12('t')),
      h('div', { class: 'hint' }, 'Rejilla de 12 columnas: junta bloques en una fila (6 + 6, 4 + 4 + 4). En móvil todo se apila a ancho completo.')));
    d.campos.forEach((c) => {
      const el = (c.t === 'items' || c.t === 'marcadores') ? fld(c.label + (c.req ? ' *' : ''), itemsUi(c, b, p), c.hint) : campoUi(c, b, hasAlt);
      if (el) body.append(el);
    });
    if (AI_BLK[b.tipo]) body.append(h('div', { class: 'aibar' }, h('span', { class: 'lbl' }, ic('sparkles', 13), 'IA local'),
      aiBtn('Generar desde un texto', () => aiBloque(p, b), 'wand')));
    card.append(body); return card;
  }
  const AI_BLK = { pasos: 1, pestanas: 1, tarjetas: 1, linea_tiempo: 1, relacionar: 1, ordenar: 1, escenario: 1 };
  async function aiBloque(p, b) {
    const ta = h('textarea', { class: 'textarea', style: 'min-height:200px', placeholder: 'Pega aquí el texto del que saldrá este bloque (o usa el de la pantalla).' });
    const ctx = BL.textoPantalla(Object.assign({}, p, { bloques: p.bloques.filter((x) => x !== b) }));
    ta.value = ctx;
    const go = async () => {
      const texto = ta.value.trim(); if (texto.length < 40) { toast('Escribe o pega un poco más de texto.'); return; }
      closeModal();
      const r = await aiRun('bloque', { tipo: b.tipo, texto, titulo: p.titulo }); if (!r) return;
      const prev = h('pre', { class: 'aipre' }, JSON.stringify(r, null, 1).slice(0, 1800));
      aiReview('Propuesta para el bloque «' + BL.BLOQUES[b.tipo].label + '»', prev, () => { Object.assign(b, r); changed(true); }, 'Aplicar al bloque');
    };
    openModal('Generar «' + BL.BLOQUES[b.tipo].label + '» con IA', [h('p', { class: 'muted', style: 'margin-bottom:8px;font-size:13px' }, 'Texto de origen (ya se cargó el de esta pantalla; puedes editarlo):'), ta],
      [h('button', { class: 'btn', onclick: closeModal }, 'Cancelar'), h('button', { class: 'btn primary', onclick: go }, ic('sparkles', 15), 'Generar')]);
  }
  function addBlockMenu(anchor, p, at) {
    const items = [];
    Object.keys(BL.GRUPOS).forEach((g) => {
      items.push({ header: BL.GRUPOS[g] });
      BL.ORDEN.filter((t) => BL.BLOQUES[t].grupo === g).forEach((t) => items.push({ label: BL.BLOQUES[t].label, desc: BL.BLOQUES[t].desc, icon: BL.BLOQUES[t].icon, onclick: () => { const nb = BL.nuevo(t); if (at == null) p.bloques.push(nb); else p.bloques.splice(at, 0, nb); changed(true); } }));
    });
    showMenu(anchor, items);
  }
  function formBloques(f, p) {
    p.bloques = p.bloques || [];
    const n = BL.contarInter(p);
    const list = h('div', { class: 'blk-list' });
    if (!p.bloques.length) list.append(h('div', { class: 'empty-mini', style: 'margin-left:0' }, 'Esta lección está vacía. Abre la pestaña «Bloques» y añade el primero.'));
    p.bloques.forEach((b, bi) => { const d = BL.BLOQUES[b.tipo] || { label: b.tipo, icon: 'layers' };
      list.append(h('div', { class: 'blk-row' + (sel.b === bi ? ' sel' : ''), onclick: () => selectBlock(bi) }, ic(d.icon, 16), h('span', { class: 't' }, h('b', {}, d.label), h('small', {}, (BL.texto(b) || '(vacío)').slice(0, 70))),
        h('button', { class: 'btn ghost sm icon', title: 'Subir', disabled: bi === 0, onclick: (e) => { e.stopPropagation(); move(p.bloques, bi, -1); if (sel.b === bi) sel.b = bi - 1; changed(true); } }, ic('arrow-up', 13)),
        h('button', { class: 'btn ghost sm icon', title: 'Bajar', disabled: bi === p.bloques.length - 1, onclick: (e) => { e.stopPropagation(); move(p.bloques, bi, 1); if (sel.b === bi) sel.b = bi + 1; changed(true); } }, ic('arrow-down', 13)))); });
    f.append(sec('Bloques de la lección', 'layers',
      h('div', { class: 'hint', style: 'margin-bottom:12px' }, n ? 'Hay ' + n + ' elemento' + (n === 1 ? '' : 's') + ' interactivo' + (n === 1 ? '' : 's') + ': el alumno debe completarlos para continuar.' : 'Haz clic en un bloque (aquí o en el lienzo) para editarlo.'),
      list, h('button', { class: 'btn primary', onclick: () => setLeftTab('blq') }, ic('plus', 15), 'Añadir bloque')));
  }
  /* propiedades de UN bloque seleccionado en el lienzo */
  function formBloque(f, m, p, bi) {
    const b = p.bloques[bi], d = BL.BLOQUES[b.tipo];
    f.append(h('button', { class: 'btn ghost sm prop-back', onclick: () => select({ t: 'pan', m: sel.m, p: sel.p }) }, ic('arrow-left', 14), 'Volver a la lección'),
      h('div', { class: 'doc-sub' }, h('span', { class: 'badge brand' }, ic(d.icon, 12), d.label), h('span', { class: 'muted' }, Modelo.intencion(b.tipo).replace(/_/g, ' '))));
    f.append(bloqueCard(p, b, bi, true));
    f.append(movilUi(p, b, bi));
  }
  /* equivalencia escritorio → app móvil (sección 14): tabla fija; en Guiado se aplica sola, en Experto se puede cambiar */
  function dividirParrafo(p, bi) {
    const b = p.bloques[bi], sents = String(b.texto || '').split(/\n+/).flatMap((x) => x.split(/(?<=[.!?…])\s+/)).filter(Boolean), mid = Math.ceil(sents.length / 2);
    b.texto = sents.slice(0, mid).join(' ');
    p.bloques.splice(bi + 1, 0, Modelo.nuevoObjeto('parrafo', { texto: sents.slice(mid).join(' '), tamano: b.tamano, alinear: b.alinear }));
    sel = { t: 'pan', m: sel.m, p: sel.p, b: bi }; changed(true);
  }
  function movilUi(p, b, bi) {
    const q = Modelo.equivalencia(b), box = h('div', { class: 'mv-ed' }, h('div', { class: 'sec-h' }, ic('phone', 15), h('h3', {}, 'Cómo se verá en móvil')));
    box.append(h('div', { class: 'hint', style: 'margin:0 0 8px' }, Modelo.sugerencia(b)));
    const todas = q.sinEquivalente ? [] : [Modelo.EQUIV[b.tipo].movil].concat(Modelo.EQUIV[b.tipo].alt);
    if (todas.length > 1) {
      if (modo() === 'experto') {
        box.append(fld('Mostrar en móvil como', h('select', { class: 'select sm', onchange: (e) => { b.movil = e.target.value === todas[0] ? undefined : { equivalente: e.target.value }; if (!b.movil) delete b.movil; changed(true); } },
          todas.map((id, i) => h('option', { value: id, selected: id === q.id }, Modelo.MOVIL_ROTULO[id] + (i === 0 ? ' (sugerido)' : '')))), 'La equivalencia conserva lo que el alumno hace y lo que aprende.'));
      } else box.append(h('div', { class: 'hint' }, 'En modo Guiado se aplica la opción sugerida automáticamente. Cambia a Experto para elegir otra.'));
    }
    const w = Modelo.palabras(BL.texto(b));
    if (w > Modelo.MAX_PALABRAS_BLOQUE && b.tipo === 'parrafo') box.append(h('div', { class: 'pmsg', style: 'margin:8px 0' }, w + ' palabras: no cabe en una pantalla móvil (máx. ' + Modelo.MAX_PALABRAS_MOVIL + '). En móvil se partirá en ' + Math.ceil(w / 120) + ' pantallas por oraciones completas.'),
      h('button', { class: 'btn sm', onclick: () => dividirParrafo(p, bi) }, ic('copy', 14), 'Dividir en 2 bloques'));
    return box;
  }
  function convertirABloques(p) {
    if (p.tipo === 'bloques') return;
    const bl = [];
    if (p.tipo === 'acordeon') bl.push({ tipo: 'acordeon', items: (p.contenido.items || []).map((i) => ({ encabezado: i.encabezado || '', texto: i.texto || '' })) });
    else {
      if ((p.contenido.texto || '').trim()) bl.push({ tipo: 'parrafo', texto: p.contenido.texto });
      if ((p.contenido.puntos || []).length) bl.push({ tipo: 'lista', estilo: 'vinetas', items: p.contenido.puntos.slice() });
      if (p.imagen && p.imagen.archivo) bl.push({ tipo: 'imagen', archivo: p.imagen.archivo, alt: p.imagen.alt || '', pie: '', ancho: 'normal' });
    }
    p.tipo = 'bloques'; p.bloques = bl.length ? bl : [BL.nuevo('parrafo')]; p.contenido = {}; delete p.imagen;
    changed(true);
  }

  function cambiarTipo(p, nuevo) {
    if (nuevo === 'bloques') return convertirABloques(p);
    const vacio = (p.tipo === 'bloques' ? !(BL.textoPantalla(p)).trim() : p.tipo === 'acordeon' ? (p.contenido.items || []).every((i) => !i.encabezado && !i.texto) : !p.contenido.texto && !(p.contenido.puntos || []).length);
    if (!vacio && !confirm('Cambiar de plantilla reinicia el contenido de esta pantalla. ¿Continuar?')) return;
    p.tipo = nuevo; delete p.bloques;
    if (nuevo === 'acordeon') { p.contenido = { items: [{ encabezado: '', texto: '' }] }; delete p.imagen; }
    else { p.contenido = { texto: '', puntos: [] }; p.imagen = { etiquetas: [], archivo: null, alt: '' }; }
    changed(true);
  }
  function formPan(f, m, p) {
    if (p.tipo === 'bloques' && sel.b != null && p.bloques[sel.b]) return formBloque(f, m, p, sel.b);
    f.append(crumb({ t: m.titulo || 'Módulo', fn: () => select({ t: 'mod', m: sel.m }) }, { t: 'Pantalla' }), titleInput(p, 'titulo', 'Título de la pantalla'),
      h('div', { class: 'doc-sub' }, h('span', { class: 'badge brand' }, ic((TIPOS[p.tipo] || TIPOS.texto_imagen).icon, 12), (TIPOS[p.tipo] || {}).label || p.tipo), h('span', { class: 'muted' }, 'id ' + p.id)));
    p.guion = p.guion || {};
    f.append(sec('Objetivo de la lección', 'flag', fld('Esta lección logra…', objSelect(p), 'Una lección = un solo objetivo, de 5 a 7 minutos.')));
    f.append(sec('Guion de la lección', 'text',
      fld('¿Qué aprende?', text(p.guion, 'aprende', { ph: 'En una frase' })), fld('¿Con qué bloques?', text(p.guion, 'bloque', { ph: 'Ej. Texto, pasos y un escenario' })),
      fld('Recurso o fuente', text(p.guion, 'recurso', { ph: 'Manual, video, SOP…' })), fld('¿Cómo compruebas que lo aprendió?', text(p.guion, 'comprueba', { ph: 'Ej. Pregunta 2 de la evaluación' }))));
    if (p.tipo !== 'bloques') f.append(sec('Plantilla', 'layers', h('div', { class: 'tiles' }, Object.entries(TIPOS).map(([k, v]) =>
      h('button', { class: 'tile' + (p.tipo === k ? ' on' : ''), onclick: () => p.tipo !== k && cambiarTipo(p, k) }, ic(v.icon, 20), h('b', {}, v.label), h('small', {}, v.desc))))));
    if (p.tipo === 'bloques') formBloques(f, p);
    else if (p.tipo === 'texto_imagen') {
      const tiene = () => (p.contenido.texto || '').trim().length > 20;
      const aiBar = h('div', { class: 'aibar' }, h('span', { class: 'lbl' }, ic('sparkles', 13), 'IA local'),
        h('button', { class: 'btn sm ai', onclick: (e) => tiene() ? showMenu(e.currentTarget, [{ label: 'Más claro y sencillo', icon: 'wand', onclick: () => aiMejorar(p, 'claro') }, { label: 'Resumir', icon: 'text', onclick: () => aiMejorar(p, 'resumir') }, { label: 'Tono profesional', icon: 'sparkles', onclick: () => aiMejorar(p, 'formal') }]) : toast('Escribe o pega primero el texto de esta pantalla.') }, ic('wand', 14), 'Mejorar texto'),
        aiBtn('Sugerir puntos clave', () => tiene() ? aiPuntos(p) : toast('Escribe o pega primero el texto de esta pantalla.'), 'list'));
      f.append(sec('Contenido', 'text', aiBar,
        fld('Texto', text(p.contenido, 'texto', { area: true, rows: 6, ph: 'Escribe el contenido. Una línea nueva = un párrafo.' })),
        fld('Puntos clave (opcional)', lines(p.contenido, 'puntos', 'Uno por línea; se muestran como lista con viñetas.'))));
      f.append(imagenSec(p));
    } else if (p.tipo === 'acordeon') {
      const items = p.contenido.items, list = h('div');
      items.forEach((it, i) => list.append(h('div', { class: 'item' },
        h('div', { class: 'item-h' }, h('b', {}, 'Elemento ' + (i + 1)),
          h('button', { class: 'btn ghost sm icon', title: 'Subir', disabled: i === 0, onclick: () => { move(items, i, -1); changed(true); } }, ic('arrow-up', 14)),
          h('button', { class: 'btn ghost sm icon', title: 'Bajar', disabled: i === items.length - 1, onclick: () => { move(items, i, 1); changed(true); } }, ic('arrow-down', 14)),
          h('button', { class: 'btn ghost sm icon danger', title: 'Quitar', onclick: () => { items.splice(i, 1); changed(true); } }, ic('trash', 14))),
        fld('Encabezado', text(it, 'encabezado', { ph: 'Lo que el alumno ve antes de abrir' })), fld('Texto', text(it, 'texto', { area: true, rows: 3 })))));
      f.append(sec('Elementos del acordeón', 'list', h('div', { class: 'aibar' }, h('span', { class: 'lbl' }, ic('sparkles', 13), 'IA local'),
        aiBtn('Organizar contenido en elementos', () => screenText(p).replace(/\s/g, '').length > 40 ? aiAcordeon(p) : toast('Escribe o pega primero el contenido en los elementos.'), 'wand')), list,h('button', { class: 'btn', onclick: () => { items.push({ encabezado: '', texto: '' }); changed(true); } }, ic('plus', 15), 'Agregar elemento'),
        h('div', { class: 'hint' }, 'El alumno debe abrir todos los elementos para poder continuar.')));
    }
    f.append(sec('Ajustes', 'sliders',
      h('div', { class: 'row2' }, fld('Animación de entrada', choose(p, 'animacion', ANIM))),
      fld('Fuente (documento de origen)', text(p, 'fuente', { ph: 'libreria/higiene/lavado.md#cuando' }), 'Obligatoria. Permite rastrear de dónde salió el contenido y revisar si la IA inventó algo.')));
  }
  function imagenSec(p) {
    p.imagen = p.imagen || { etiquetas: [], archivo: null, alt: '' };
    const im = p.imagen;
    const pick = (name) => { im.archivo = name; if (!im.alt) im.alt = p.titulo || ''; changed(true); };
    const thumb = h('div', { class: 'thumb' + (im.archivo ? '' : ' empty') }, im.archivo ? null : [ic('image', 24), h('br'), 'Sin imagen']);
    if (im.archivo) thumb.style.backgroundImage = 'url("/stock/' + encodeURIComponent(im.archivo) + '")';
    return sec('Imagen', 'image',
      h('div', { class: 'imgrow' }, thumb, h('div', { class: 'rest' },
        im.archivo ? h('div', {}, h('b', {}, im.archivo), h('div', { class: 'muted', style: 'font-size:12px' }, 'Del banco de imágenes')) : h('div', { class: 'muted' }, 'Elige una imagen del banco o deja que la app sugiera una según las etiquetas.'),
        h('div', { class: 'btns' },
          h('button', { class: 'btn sm', onclick: () => openStock(pick) }, ic('image', 14), im.archivo ? 'Cambiar…' : 'Elegir del banco…'),
          h('button', { class: 'btn sm', onclick: () => sugerir(p, pick) }, ic('search', 14), 'Sugerir por etiquetas'),
          im.archivo ? h('button', { class: 'btn sm danger', onclick: () => { im.archivo = null; changed(true); } }, ic('trash', 14), 'Quitar') : null))),
      h('div', { style: 'height:16px' }),
      fld('Etiquetas de la pantalla', chips(im, 'etiquetas', 'Escribe y pulsa Enter…'), 'Se comparan con las etiquetas del banco para sugerir la imagen.'),
      fld('Texto alternativo', text(im, 'alt', { ph: 'Describe la imagen para lectores de pantalla' }), 'Accesibilidad: lo leen los lectores de pantalla.'));
  }
  function formQ(f, q, qi) {
    f.append(crumb({ t: 'Evaluación' }, { t: 'Pregunta ' + (qi + 1) }), h('div', { class: 'doc-sub', style: 'margin-top:4px' }, h('span', { class: 'badge warn' }, ic('help', 12), 'Opción múltiple'), h('span', { class: 'muted' }, 'id ' + q.id)));
    f.append(sec('Enunciado', 'text', text(q, 'enunciado', { area: true, rows: 3, ph: 'Escribe la pregunta' })));
    if (!isEval()) f.append(sec('Objetivo que mide', 'flag', objSelect(q)));
    const box = h('div');
    q.opciones.forEach((o, i) => {
      const inp = bindOpt(h('input', { class: 'input', type: 'text', value: o, placeholder: 'Opción ' + String.fromCharCode(65 + i) }), q, i);
      box.append(h('div', { class: 'opt-row' },
        h('button', { class: 'tick' + (q.correcta === i ? ' on' : ''), title: q.correcta === i ? 'Respuesta correcta' : 'Marcar como correcta', onclick: () => { q.correcta = i; changed(true); } }, ic('check', 16)),
        h('span', { class: 'let' }, String.fromCharCode(65 + i)), inp,
        q.opciones.length > 2 ? h('button', { class: 'btn ghost sm icon danger', title: 'Quitar opción', onclick: () => { q.opciones.splice(i, 1); if (q.correcta === i) q.correcta = 0; else if (q.correcta > i) q.correcta--; changed(true); } }, ic('trash', 14)) : null));
    });
    if (q.opciones.length < 6) box.append(h('button', { class: 'btn sm', onclick: () => { q.opciones.push(''); changed(true); } }, ic('plus', 14), 'Agregar opción'));
    f.append(sec('Opciones', 'list', box, h('div', { class: 'hint', style: 'margin-top:10px' }, 'Pulsa el círculo para marcar la respuesta correcta.')));
    f.append(sec('Retroalimentación', 'info', text(q, 'retroalimentacion', { area: true, rows: 3, ph: 'Se muestra al alumno después de responder.' })));
  }
  function bindOpt(el, q, i) { el.addEventListener('input', () => { q.opciones[i] = el.value; changed(false); }); return el; }

  /* ---------- banco de imágenes ---------- */
  async function loadStock() { stockCache = await api('/api/stock'); return stockCache; }
  function sugerir(p, pick) {
    loadStock().then((list) => {
      const toks = new Set((p.imagen.etiquetas || []).map((t) => t.toLowerCase()));
      String(p.titulo || '').toLowerCase().split(/[^a-záéíóúñü0-9]+/).filter((w) => w.length > 3).forEach((w) => toks.add(w));
      let best = null, bs = 0;
      list.forEach((it) => { const sc = (it.etiquetas || []).filter((t) => toks.has(t) || [...toks].some((k) => k.length > 3 && (t.includes(k) || k.includes(t)))).length; if (sc > bs) { bs = sc; best = it; } });
      if (best) pick(best.archivo); else alert('No hay coincidencias. Agrega etiquetas a la pantalla o a las imágenes del banco.');
    });
  }
  async function openStock(onPick) {
    await loadStock();
    const q = h('input', { class: 'input', type: 'search', placeholder: 'Buscar por nombre o etiqueta…' });
    const file = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    const grid = h('div', { class: 'grid' });
    const upload = async (files) => { for (const f of files) { if (!/^image\//.test(f.type)) continue; const r = await api('/api/stock?name=' + encodeURIComponent(f.name), { method: 'POST', body: await f.arrayBuffer() }); if (r.error) alert(f.name + ': ' + r.error); } await loadStock(); draw(); };
    const draw = () => {
      grid.innerHTML = ''; const term = q.value.trim().toLowerCase();
      const list = stockCache.filter((it) => !term || it.archivo.toLowerCase().includes(term) || it.etiquetas.some((t) => t.includes(term)));
      if (!list.length) grid.append(h('div', { class: 'empty-state', style: 'grid-column:1/-1' }, ic('image', 32), h('b', {}, stockCache.length ? 'Sin coincidencias' : 'El banco está vacío'), h('span', {}, 'Arrastra imágenes aquí o usa «Subir imágenes».')));
      list.forEach((it) => {
        const im = h('div', { class: 'im' }); im.style.backgroundImage = 'url("/stock/' + encodeURIComponent(it.archivo) + '")';
        const tg = h('input', { class: 'input', type: 'text', value: it.etiquetas.join(', '), placeholder: 'etiquetas, separadas por coma' });
        tg.addEventListener('click', (e) => e.stopPropagation());
        tg.addEventListener('change', () => { it.etiquetas = tg.value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean); api('/api/stock-meta', { method: 'POST', body: JSON.stringify({ archivo: it.archivo, etiquetas: it.etiquetas, descripcion: it.descripcion }) }); });
        grid.append(h('div', { class: 'gi' + (onPick ? ' pick' : ''), onclick: () => { if (onPick) { closeModal(); onPick(it.archivo); } } }, im, h('div', { class: 'nm' }, it.archivo), tg,
          h('button', { class: 'btn sm icon danger del', title: 'Quitar del banco', onclick: async (e) => { e.stopPropagation(); if (confirmDel('"' + it.archivo + '" del banco')) { await api('/api/stock?name=' + encodeURIComponent(it.archivo), { method: 'DELETE' }); await loadStock(); draw(); } } }, ic('trash', 14))));
      });
    };
    q.addEventListener('input', draw);
    file.addEventListener('change', async () => { await upload([...file.files]); file.value = ''; });
    const drop = h('div', { class: 'drop' }, ic('upload', 20), h('div', { style: 'flex:1' }, h('b', {}, 'Agrega imágenes al banco'), h('div', { class: 'muted', style: 'font-size:12px' }, 'PNG, JPG, SVG, WebP o GIF · máx. 10 MB. Etiquétalas para poder sugerirlas.')), h('button', { class: 'btn', onclick: () => file.click() }, 'Subir imágenes'), file);
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => upload([...e.dataTransfer.files]));
    draw();
    openModal(onPick ? 'Elegir imagen del banco' : 'Banco de imágenes', [drop, h('div', { style: 'margin-bottom:12px' }, q), grid], h('button', { class: 'btn', onclick: closeModal }, 'Cerrar'));
  }

  /* ---------- publicar (sección 10.8): formato, puntaje mínimo, intentos, respuestas al final ---------- */
  const FORMATOS = {
    scorm12: { n: 'SCORM 1.2', d: 'El más compatible: funciona en casi cualquier LMS.' },
    scorm2004: { n: 'SCORM 2004', d: '4.ª edición. Para LMS modernos; reporta completado y aprobado por separado.' },
    xapi: { n: 'xAPI', d: 'Envía sentencias a un LRS. El LMS lo lanza con endpoint, auth y actor.' },
    web: { n: 'Link web', d: 'Archivo .zip para subir a cualquier hosting. Sin LMS: el avance se guarda en el navegador del alumno.' }
  };
  function pubOpciones() {
    return new Promise((resolve) => {
      const cu = course.curso, ev = course.evaluacion = course.evaluacion || {}, hasQ = (ev.preguntas || []).length > 0;
      const st = { formato: FORMATOS[cu.formato] ? cu.formato : 'scorm12' };
      const pun = h('input', { class: 'input', type: 'number', min: 0, max: 100, value: cu.puntaje_aprobatorio == null ? 80 : cu.puntaje_aprobatorio });
      const intn = h('input', { class: 'input', type: 'number', min: 0, max: 20, value: ev.intentos || 0 });
      const resp = h('input', { type: 'checkbox' }); resp.checked = ev.mostrar_respuestas !== false;
      const tiles = h('div', { class: 'tiles' });
      const paint = () => { tiles.innerHTML = ''; Object.entries(FORMATOS).forEach(([k, v]) => tiles.append(h('button', { class: 'tile' + (st.formato === k ? ' on' : ''), onclick: () => { st.formato = k; paint(); } }, h('b', {}, v.n), h('small', {}, v.d)))); };
      paint();
      const cert = !!(cu.ficha && cu.ficha.certificado);
      const go = () => {
        cu.formato = st.formato;
        const p = parseInt(pun.value, 10); cu.puntaje_aprobatorio = isNaN(p) ? 80 : Math.max(0, Math.min(100, p));
        const n = parseInt(intn.value, 10); ev.intentos = isNaN(n) ? 0 : Math.max(0, Math.min(20, n));
        ev.mostrar_respuestas = resp.checked; changed(false); closeModal(); resolve(true);
      };
      openModal('Publicar', [
        h('p', { class: 'muted', style: 'margin-bottom:10px' }, 'Elige dónde se va a usar el curso.'), tiles,
        hasQ ? h('div', { style: 'margin-top:14px' }, h('div', { class: 'row2' }, fld('Puntaje mínimo para aprobar (%)', pun), fld('Intentos del quiz (0 = ilimitados)', intn)), h('label', { class: 'chk' }, resp, ' Mostrar las respuestas correctas al final'))
          : h('p', { class: 'hint', style: 'margin-top:12px' }, 'Este curso no tiene preguntas: se marcará como completado al llegar al final. Puntaje e intentos aplican cuando agregues un quiz.'),
        h('p', { class: 'hint', style: 'margin-top:10px' }, cert ? 'El certificado está activado: el alumno lo descarga al completar el curso.' : 'El certificado no está activado (botón «Certificado» de arriba).')],
        [h('button', { class: 'btn', onclick: () => { closeModal(); resolve(false); } }, 'Cancelar'), h('button', { class: 'btn primary', onclick: go }, ic('package', 15), 'Generar paquete')]);
    });
  }

  /* ---------- generar SCORM ---------- */
  async function build() {
    const crit = isEval() ? [] : critPend();
    if (crit.length) {
      if (modo() === 'guiado') {
        return openModal('Antes de publicar', [h('p', { class: 'muted', style: 'margin-bottom:10px' }, 'Falta lo esencial. Complétalo y vuelve a publicar:'),
          crit.slice(0, 8).map((c) => h('button', { class: 'rv error', onclick: () => { closeModal(); irA(c.target); } }, ic('x-circle', 16), h('span', {}, c.msg))), crit.length > 8 ? h('p', { class: 'hint' }, '…y ' + (crit.length - 8) + ' más.') : null],
          [h('button', { class: 'btn', onclick: closeModal }, 'Cerrar'), h('button', { class: 'btn primary', onclick: () => { closeModal(); irA(crit[0].target); } }, 'Ir al primero')], true);
      }
      if (!confirm('Hay ' + crit.length + ' pendientes críticos (por ejemplo: ' + crit[0].msg + '). ¿Publicar de todos modos?')) return;
    }
    if (!(await pubOpciones())) return;
    await flushSave();
    openModal('Generando paquete…', h('div', { class: 'empty-state' }, ic('package', 32), 'Un momento…'));
    const r = await api('/api/build', { method: 'POST', body: JSON.stringify(course) });
    const row = (c) => h('div', { class: 'check-row ' + c.level }, ic(c.level === 'ok' ? 'check-circle' : c.level === 'warn' ? 'alert' : 'x-circle', 16), h('span', {}, c.msg));
    if (!r.ok) {
      return openModal('No se puede generar todavía', [h('p', { class: 'muted', style: 'margin-bottom:10px' }, 'Corrige estos errores y vuelve a intentarlo:'), (r.errors || [r.error]).map((m) => row({ level: 'error', msg: m }))],
        h('button', { class: 'btn primary', onclick: () => { closeModal(); setPaneTab('rev'); } }, 'Ver en Revisión'));
    }
    const rep = r.report;
    openModal('Paquete listo', [
      h('div', { style: 'display:flex;align-items:center;gap:12px;margin-bottom:14px' }, h('span', { class: 'ico t-acordeon', style: 'width:44px;height:44px;border-radius:12px' }, ic('package', 22)),
        h('div', {}, h('b', {}, r.name), h('div', { class: 'muted' }, (r.size / 1024).toFixed(1) + ' KB · ' + (FORMATOS[r.formato] || FORMATOS.scorm12).n)), h('span', { class: 'grow' }), h('span', { class: 'badge ' + (rep.errors ? 'bad' : rep.warnings ? 'warn' : 'ok'), style: 'margin-left:auto' }, 'Estructura: ' + rep.status)),
      (r.warnings || []).map((m) => row({ level: 'warn', msg: m })), rep.checks.map(row),
      h('p', { class: 'hint', style: 'margin-top:10px' }, r.formato === 'scorm12' || !r.formato ? 'Siguiente paso: probar la comunicación en el player y, al final, en tu LMS real.' : r.formato === 'web' ? 'Sube el contenido del .zip a un hosting y comparte la dirección de index.html.' : r.formato === 'xapi' ? 'Súbelo a tu LMS/LRS compatible con xAPI. Pruébalo allí: aquí no hay LRS.' : 'Súbelo a tu LMS y revisa el reporte. Esta versión del player solo simula SCORM 1.2.')],
      [h('button', { class: 'btn', onclick: closeModal }, 'Cerrar'), h('a', { class: 'btn', href: '/download/' + encodeURIComponent(r.name), download: r.name }, ic('download', 15), 'Descargar .zip'),
        (!r.formato || r.formato === 'scorm12') ? h('button', { class: 'btn primary', onclick: () => { location.href = '/index.html?open=' + encodeURIComponent(r.name); } }, ic('play', 15), 'Validar en el player') : null]);
  }

  /* ---------- proyectos ---------- */
  async function listProjects() { projects = await api('/api/projects'); return projects; }
  async function openProject(id) {
    await flushSave();
    const c = await api('/api/project?id=' + encodeURIComponent(id));
    if (c.error) { alert(c.error); return; }
    course = normalize(c); projId = id; sel = { t: 'curso' };
    try { localStorage.setItem('gs-proj', id); } catch (e) {}
    $('projName').textContent = course.curso.titulo || id; setSave('', '—');
    applyModo(); renderOutline(); renderForm(); renderReview(); renderStatus(); doPreview.now();
  }
  async function uniqueId(base) { const ids = new Set((await api('/api/projects')).map((p) => p.id)); let id = slug(base) || 'curso', n = 2; const root = id; while (ids.has(id)) id = root + '-' + n++; return id; }
  async function createProject(c, id) { await api('/api/project?id=' + encodeURIComponent(id), { method: 'POST', body: JSON.stringify(c) }); await listProjects(); await openProject(id); }
  async function newProject() {
    const v = await ask('Nuevo curso', [{ key: 'titulo', label: 'Título del curso', placeholder: 'Ej. Servicio de vinos' }], 'Crear curso');
    if (!v || !v.titulo) return;
    await flushSave(); const id = await uniqueId(v.titulo); await createProject(newCourse(v.titulo, id), id);
    if (modo() === 'guiado') wizard();
  }
  async function deleteProject() {
    if (!projId || !confirmDel('el proyecto "' + course.curso.titulo + '"')) return;
    await api('/api/project?id=' + encodeURIComponent(projId), { method: 'DELETE' });
    course = null; projId = null; const list = await listProjects();
    if (list.length) await openProject(list[0].id); else newProject();
  }
  $('projBtn').onclick = async (e) => {
    await listProjects();
    showMenu(e.currentTarget, [{ header: 'Proyectos' }].concat(projects.map((p) => ({ label: p.titulo, icon: 'file', on: p.id === projId, onclick: () => p.id !== projId && openProject(p.id) })),
      [{ sep: true }, { label: 'Nuevo curso…', icon: 'plus', onclick: newProject }, { label: 'Importar JSON…', icon: 'upload', onclick: () => $('fileJson').click() },
        { label: 'Exportar JSON', icon: 'download', onclick: () => { h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(course, null, 2)], { type: 'application/json' })), download: projId + '.json' }).click(); } },
        { sep: true }, { label: 'Eliminar proyecto', icon: 'trash', danger: true, onclick: deleteProject }]));
  };
  $('fileJson').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const c = normalize(JSON.parse(await f.text())); if (!c.curso.titulo) c.curso.titulo = f.name.replace(/\.json$/i, '');
      const id = await uniqueId(c.curso.id || c.curso.titulo); c.curso.id = id; await flushSave(); await createProject(c, id);
    } catch (err) { alert('JSON no válido: ' + err.message); }
  };

  /* ---------- cabecera ---------- */
  $('logoIc').append(ic('cap', 17));
  $('tabHome').append(ic('home', 14), 'Inicio'); $('tabAut').append(ic('pencil', 14), 'Autoría'); $('tabPlay').append(ic('play', 14), 'Player'); $('tabUtil').append(ic('wand', 14), 'Utilidades');
  $('projBtn').prepend(ic('folder', 15)); $('projBtn').append(ic('chevron-down', 14));
  $('btnTheme').append(ic(Theme.current() === 'dark' ? 'sun' : 'moon', 16));
  $('btnTheme').onclick = () => { const t = Theme.toggle(); $('btnTheme').innerHTML = ''; $('btnTheme').append(ic(t === 'dark' ? 'sun' : 'moon', 16)); };
  $('btnStock').title = 'Banco de imágenes'; $('btnStock').append(ic('image', 16)); $('btnStock').onclick = () => openStock(null);
  $('btnBuild').onclick = build;
  $('btnAddModule').append(ic('plus', 14), 'Módulo');
  $('btnAddModule').onclick = () => { course.modulos.push({ id: genId('m'), titulo: '', pantallas: [] }); sel = { t: 'mod', m: course.modulos.length - 1 }; changed(true); doPreview.now(); setTimeout(() => { const t = document.querySelector('.title-input'); t && t.focus(); }, 30); };
  $('btnBuild').innerHTML = ''; $('btnBuild').append(ic('package', 16), 'Publicar');
  $('btnAlumno').title = 'Vista previa como alumno: el curso tal cual lo verá, en computadora y celular'; $('btnAlumno').append(ic('eye', 16), 'Vista previa'); $('btnAlumno').onclick = openAlumno;
  $('btnReview').onclick = () => { $('reviewDrawer').hidden = !$('reviewDrawer').hidden; }; $('btnCloseReview').append(ic('x', 16)); $('btnCloseReview').onclick = () => setPaneTab('prev');
  document.querySelector('[data-mode=guiado]').append(ic('book-open', 14), 'Guiado'); document.querySelector('[data-mode=experto]').append(ic('sliders', 14), 'Experto');
  document.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => course && setModo(b.dataset.mode));
  /* ---------- certificado (sección 15): plantillas + variables; vista previa con datos de ejemplo ---------- */
  function openCertificado() {
    if (isEval()) { toast('El certificado es para cursos con lecciones.'); return; }
    const C = window.Certificado, fi = course.curso.ficha; course.certificado = course.certificado || {};
    const cert = course.certificado, lim = () => C.cfg(cert);
    const ov = h('div', { class: 'mapa-ov cert-ov', role: 'dialog', 'aria-label': 'Certificado' });
    const wrap = h('div', { class: 'cert-fit' }), prev = h('div', { class: 'cert-pv' }, wrap), form = h('div', { class: 'cert-form' });
    C.ensureCss(document);
    const vars = () => Object.assign({}, C.EJEMPLO, { nombre_curso: course.curso.titulo || C.EJEMPLO.nombre_curso, duracion: fi.duracion || (course.curso.duracion_min ? course.curso.duracion_min + ' min' : C.EJEMPLO.duracion), instructor: C.EJEMPLO.instructor });
    const draw = () => {
      const c = Object.assign({}, lim()); wrap.innerHTML = C.html(c, Object.assign(vars(), { instructor: C.fill(c.instructor || '', {}) }), (n) => '/stock/' + encodeURIComponent(n));
      setTimeout(() => C.fit(wrap), 0);
    };
    const upd = (structural) => { changed(false); draw(); if (structural) build(); };
    const imgRow = (k, label) => { const row = h('div', { class: 'cert-img' }); const paint = () => { row.innerHTML = ''; row.append(h('span', {}, label + ': ', cert[k] ? h('b', {}, cert[k]) : h('i', { class: 'muted' }, 'ninguno')),
      h('button', { class: 'btn sm', onclick: () => openStock((a) => { cert[k] = a; paint(); upd(); }) }, ic('image', 13), cert[k] ? 'Cambiar…' : 'Elegir…'), cert[k] ? h('button', { class: 'btn sm ghost danger', title: 'Quitar', onclick: () => { cert[k] = ''; paint(); upd(); } }, ic('trash', 13)) : null); }; paint(); return row; };
    const ctext = (k, ph, area) => { const el = h(area ? 'textarea' : 'input', { class: area ? 'textarea' : 'input', placeholder: ph || '' }); el.value = cert[k] != null ? cert[k] : (C.DEF[k] || ''); el.addEventListener('input', () => { cert[k] = el.value; upd(); }); return el; };
    const color = (k) => { const el = h('input', { type: 'color', class: 'cert-color' }); el.value = lim()[k]; el.addEventListener('input', () => { cert[k] = el.value; upd(); }); return el; };
    function build() {
      form.innerHTML = '';
      const on = h('input', { type: 'checkbox' }); on.checked = !!fi.certificado; on.onchange = () => { fi.certificado = on.checked; changed(false); build(); };
      form.append(h('label', { class: 'chk cert-on' }, on, ' El curso entrega certificado al aprobar'));
      if (!fi.certificado) { form.append(h('p', { class: 'hint' }, 'Actívalo para que el alumno vea el botón «Descargar certificado en PDF» al terminar. Se desbloquea solo con el 100 % de avance y el puntaje mínimo.')); }
      form.append(sec('Plantilla', 'layers', h('div', { class: 'tiles' }, Object.entries(C.PLANTILLAS).map(([k, v]) => h('button', { class: 'tile' + (lim().plantilla === k ? ' on' : ''), onclick: () => { cert.plantilla = k; cert.color = v.color; cert.acento = v.acento; upd(true); } }, h('b', {}, v.nombre), h('small', {}, v.desc)))),
        h('div', { class: 'row2', style: 'margin-top:12px' }, fld('Tamaño', choose(cert, 'tamano', { carta: 'Carta (horizontal)', a4: 'A4 (horizontal)' }, () => upd())), fld('Colores', h('div', { class: 'cert-colors' }, h('label', {}, 'Principal ', color('color')), h('label', {}, 'Acento ', color('acento')))))));
      form.append(sec('Textos', 'text', fld('Título', ctext('titulo')), fld('Antes del nombre', ctext('intro')), fld('Texto principal', ctext('cuerpo', '', true), 'Variables: {{nombre_alumno}} {{nombre_curso}} {{fecha_termino}} {{duracion}} {{puntaje}} {{folio}} {{instructor}}'), fld('Instructor o área que firma', ctext('instructor', 'Ej.: Dirección de Capacitación')), fld('Pie (opcional)', ctext('pie', 'Ej.: Documento emitido por…'))));
      form.append(sec('Imágenes', 'image', imgRow('logo', 'Logo'), imgRow('fondo', 'Fondo (se verá tenue)'), imgRow('sello', 'Sello'), imgRow('firma', 'Firma escaneada')));
      form.append(h('p', { class: 'hint' }, 'El nombre del alumno, la fecha, el puntaje y el folio salen solos al descargarlo. La vista previa usa datos de ejemplo. El código QR de verificación llega en la v2.'));
    }
    build(); draw();
    ov.append(h('div', { class: 'mp-h' }, h('b', {}, 'Certificado'), h('span', { class: 'muted' }, 'Vista previa con datos de ejemplo'), h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: () => { ov.remove(); window.removeEventListener('resize', onr); } }, ic('x', 14), 'Cerrar')), h('div', { class: 'cert-body' }, form, prev));
    const onr = () => C.fit(wrap); window.addEventListener('resize', onr);
    document.body.append(ov); setTimeout(onr, 60);
  }
  /* ---------- mapa de objetivos (sección 10.5): objetivos → lecciones que los enseñan → preguntas que los miden ---------- */
  function openMapa() {
    if (isEval()) { toast('El mapa de objetivos es para cursos con lecciones.'); return; }
    const COL = ['#0e8a74', '#2f6fd6', '#c2540a', '#8a3fb5', '#c0398a', '#7a8a1a'];
    const objs = course.objetivos || [], les = [], pregs = course.evaluacion.preguntas;
    course.modulos.forEach((m, mi) => m.pantallas.forEach((p, pi) => les.push({ p, m, mi, pi })));
    const colorDe = (id) => { const k = objs.findIndex((o) => o.id === id); return k < 0 ? null : COL[k % COL.length]; };
    const ov = h('div', { class: 'mapa-ov', role: 'dialog', 'aria-label': 'Mapa de objetivos' });
    const close = () => { ov.remove(); window.removeEventListener('resize', draw); };
    const go = (t) => { close(); select(t); };
    const nodos = {}; // clave → elemento
    const node = (key, cls, color, titulo, sub, onclick) => { const n = h('button', { class: 'mp-n ' + cls, style: color ? '--c:' + color : '', onclick }, h('b', {}, titulo), sub ? h('small', {}, sub) : null); nodos[key] = n; return n; };
    const sinObj = les.filter((x) => !x.p.objetivo || !colorDe(x.p.objetivo)), sinObjQ = pregs.map((q, i) => ({ q, i })).filter((x) => !x.q.objetivo || !colorDe(x.q.objetivo));
    const colO = h('div', { class: 'mp-col' }, h('h4', {}, 'Objetivos'));
    objs.forEach((o, k) => {
      const tl = les.filter((x) => x.p.objetivo === o.id).length, tq = pregs.filter((q) => q.objetivo === o.id).length;
      const mal = !tq, sub = !tl ? 'Ninguna lección lo enseña' : !tq ? 'Sin pregunta que lo mida' : tl + (tl === 1 ? ' lección' : ' lecciones') + ' · ' + tq + (tq === 1 ? ' pregunta' : ' preguntas');
      colO.append(node('o' + o.id, 'obj' + (mal ? ' rojo' : !tl ? ' ambar' : ''), COL[k % COL.length], (k + 1) + '. ' + o.texto, sub, () => go({ t: 'curso' })));
    });
    if (!objs.length) colO.append(h('div', { class: 'mp-vacio' }, 'Aún no hay objetivos. Escríbelos en «Datos del curso».'));
    const colL = h('div', { class: 'mp-col' }, h('h4', {}, 'Lecciones'));
    les.forEach((x) => colL.append(node('l' + x.mi + '-' + x.pi, 'les' + (colorDe(x.p.objetivo) ? '' : ' ambar'), colorDe(x.p.objetivo), x.p.titulo || 'Lección sin título', colorDe(x.p.objetivo) ? x.m.titulo : 'Sin objetivo ligado', () => go({ t: 'pan', m: x.mi, p: x.pi }))));
    if (!les.length) colL.append(h('div', { class: 'mp-vacio' }, 'Sin lecciones.'));
    const colQ = h('div', { class: 'mp-col' }, h('h4', {}, 'Preguntas'));
    pregs.forEach((q, i) => colQ.append(node('q' + i, 'preg' + (colorDe(q.objetivo) ? '' : ' ambar'), colorDe(q.objetivo), (i + 1) + '. ' + (q.enunciado || 'Pregunta sin enunciado'), colorDe(q.objetivo) ? null : 'No mide ningún objetivo', () => go({ t: 'q', q: i }))));
    if (!pregs.length) colQ.append(h('div', { class: 'mp-vacio' }, 'Sin preguntas todavía.'));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'mp-svg');
    const cols = h('div', { class: 'mp-cols' }, svg, colO, colL, colQ);
    const resumen = objs.length ? (objs.filter((o) => !pregs.some((q) => q.objetivo === o.id)).length + ' de ' + objs.length + ' objetivos sin evaluación · ' + sinObj.length + ' lecciones y ' + sinObjQ.length + ' preguntas sin objetivo') : 'Define objetivos para ver el mapa.';
    ov.append(h('div', { class: 'mp-h' }, h('b', {}, 'Mapa de objetivos'), h('span', { class: 'muted' }, resumen), h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: close }, ic('x', 14), 'Cerrar')),
      h('div', { class: 'mp-b' }, cols), h('div', { class: 'mp-f' }, h('span', { class: 'mp-key rojo' }, 'Rojo: el objetivo no tiene pregunta que lo mida'), h('span', { class: 'mp-key ambar' }, 'Ámbar: falta ligarlo a un objetivo'), h('span', { class: 'muted' }, 'Haz clic en cualquier elemento para ir a editarlo.')));
    document.body.append(ov);
    function draw() {
      svg.innerHTML = ''; const base = cols.getBoundingClientRect(); svg.setAttribute('width', cols.scrollWidth); svg.setAttribute('height', cols.scrollHeight);
      const pt = (el, side) => { const r = el.getBoundingClientRect(); return [(side === 'r' ? r.right : r.left) - base.left, r.top + r.height / 2 - base.top]; };
      const line = (a, b, color, dim) => { const [x1, y1] = a, [x2, y2] = b, dx = Math.max(30, (x2 - x1) / 2); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', 'M' + x1 + ',' + y1 + ' C' + (x1 + dx) + ',' + y1 + ' ' + (x2 - dx) + ',' + y2 + ' ' + x2 + ',' + y2); p.setAttribute('fill', 'none'); p.setAttribute('stroke', color); p.setAttribute('stroke-width', '2.2'); p.setAttribute('opacity', dim ? '.35' : '.85'); svg.append(p); };
      objs.forEach((o, k) => {
        const c = COL[k % COL.length], oL = les.filter((x) => x.p.objetivo === o.id), oQ = pregs.map((q, i) => ({ q, i })).filter((x) => x.q.objetivo === o.id), a = nodos['o' + o.id];
        oL.forEach((x) => { const l = nodos['l' + x.mi + '-' + x.pi]; line(pt(a, 'r'), pt(l, 'l'), c); oQ.forEach((y) => line(pt(l, 'r'), pt(nodos['q' + y.i], 'l'), c)); });
        if (!oL.length) oQ.forEach((y) => line(pt(a, 'r'), pt(nodos['q' + y.i], 'l'), c, true));
      });
    }
    window.addEventListener('resize', draw); setTimeout(draw, 30); setTimeout(draw, 300);
    const esc = (e) => { if (e.key === 'Escape' && ov.isConnected) { close(); document.removeEventListener('keydown', esc); } }; document.addEventListener('keydown', esc);
    ov.querySelector('.mp-h .btn').focus();
  }
  document.addEventListener('keydown', (e) => {
    if (!course) return; const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); flushSave().then(() => toast('Guardado.')); return; }
    if (modo() !== 'experto') return;
    if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); openAlumno(); return; }
    const t = e.target; if (t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable)) return;
    const p = curLesson(); if (!p || sel.b == null || !p.bloques[sel.b]) return;
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); const c = JSON.parse(JSON.stringify(p.bloques[sel.b])); delete c.id; p.bloques.splice(sel.b + 1, 0, Modelo.nuevoObjeto(c.tipo, c)); sel.b++; changed(true); doPreview.now(); }
    else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); const d = e.key === 'ArrowUp' ? -1 : 1; if (move(p.bloques, sel.b, d)) { sel.b += d; changed(true); doPreview.now(); } }
  });
  /* vista previa como alumno: el curso tal cual, navegable y contestable */
  $('pvDesk').append(ic('monitor', 14), 'Escritorio'); $('pvTab').append(ic('tablet', 14), 'Tableta'); $('pvMob').append(ic('phone', 14), 'Móvil'); $('btnClosePv').append(ic('x', 14), 'Cerrar');
  function openAlumno() { $('pvFrame').src = '/pkg/prev/' + lastLaunch + '?t=' + Date.now() + '#p=' + previewIndex(); $('pvModal').hidden = false; }
  $('btnClosePv').onclick = () => { $('pvModal').hidden = true; $('pvFrame').src = 'about:blank'; };
  document.querySelectorAll('[data-pvdev]').forEach((b) => b.onclick = () => { document.querySelectorAll('[data-pvdev]').forEach((x) => x.classList.toggle('on', x === b)); $('pvFrame').className = 'pv-dev ' + b.dataset.pvdev; });
  $('devFluid').append(ic('monitor', 14), 'Escritorio'); $('devTablet').append(ic('tablet', 14), 'Tableta'); $('devMobile').append(ic('phone', 14), 'Móvil');
  /* La vista previa emula el ancho REAL del dispositivo (375 / 768 / 1024 px: móvil < 576, tableta 576–992, escritorio > 992) y lo reduce con zoom para que quepa en el panel. */
  const DEV_W = { desktop: 1024, tablet: 768, mobile: 375 };
  setLeftTab('est'); setRightTab('prop');
  function fitDevice() {
    const st = $('pstage'), dv = st.querySelector('.device'); if (!st || !dv) return;
    const mode = ['desktop', 'tablet', 'mobile'].find((c) => st.classList.contains(c)) || 'desktop', cs = getComputedStyle(st);
    const aw = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), ah = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (!DEV_W[mode]) { dv.style.flex = ''; dv.style.zoom = ''; dv.style.width = ''; dv.style.height = ''; st.style.alignItems = ''; return; }
    const bw = parseFloat(getComputedStyle(dv).borderLeftWidth) || 0, W = DEV_W[mode] + bw * 2;
    const z = Math.max(0.2, Math.min(1, aw / W));
    dv.style.flex = 'none'; dv.style.zoom = z; dv.style.width = W + 'px'; dv.style.height = Math.max(200, ah / z) + 'px';
    st.style.alignItems = 'flex-start';
  }
  document.querySelectorAll('[data-dev]').forEach((b) => b.onclick = () => { document.querySelectorAll('[data-dev]').forEach((x) => x.classList.toggle('on', x === b)); $('pstage').className = 'pstage ' + b.dataset.dev; fitDevice(); });
  if (window.ResizeObserver) new ResizeObserver(fitDevice).observe($('pstage')); window.addEventListener('resize', fitDevice); setTimeout(fitDevice, 50);
  window.addEventListener('beforeunload', () => { if (course && projId) navigator.sendBeacon('/api/project?id=' + encodeURIComponent(projId), JSON.stringify(course)); });

  (async function init() {
    const list = await listProjects(); let last = null; try { last = localStorage.getItem('gs-proj'); } catch (e) {}
    if (!list.length) { newProject(); return; }
    await openProject(list.some((p) => p.id === last) ? last : list[0].id);
  })();
  try {
    const fl = localStorage.getItem('gs-flash');
    if (fl) { localStorage.removeItem('gs-flash'); const t = h('div', { class: 'toast', role: 'status' }, ic('check-circle', 18), h('span', {}, fl), h('button', { onclick: () => t.remove() }, 'Entendido')); document.body.append(t); setTimeout(() => t.remove(), 12000); }
  } catch (e) {}
  window.__editor = { get course() { return course; }, select };
})();
