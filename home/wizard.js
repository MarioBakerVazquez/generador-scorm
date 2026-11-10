(function () {
  'use strict';
  const { h, ic, api, slug, COLORES, grad, toast, kb } = window.Home;
  /* las lecciones nuevas nacen como «bloques»: lo que arme un asistente se convierte antes de guardarse */
  const createAndOpen = (course, flash) => {
    if (window.Modelo) { window.Modelo.migrar(course); course.modulos.forEach((m) => m.pantallas.forEach((p) => { p.bloques = (p.bloques || []).filter((b) => !(b.tipo === 'imagen' && !b.archivo)); if (!p.bloques.length) p.bloques = [{ tipo: 'parrafo', texto: '' }]; })); }
    return window.Home.createAndOpen(course, flash);
  };
  const $ = (id) => document.getElementById(id);

  /* =============== marco del asistente =============== */
  function run(cfg) {
    const st = cfg.state; let i = 0; const done = new Set();
    const layer = $('layer');
    const stepsEl = h('div', { class: 'steps' });
    const body = h('div', { class: 'wbody' });
    const back = h('button', { class: 'btn' }, ic('arrow-left', 16), 'Atrás');
    const next = h('button', { class: 'btn primary' });
    const hint = h('span', { class: 'hintx' });
    const rail = h('aside', { class: 'rail', style: '--a1:' + cfg.a1 + ';--a2:' + cfg.a2 },
      h('div', { class: 'wlogo' }, ic(cfg.icon, 26)), h('h2', {}, cfg.title), h('div', { class: 'rsub' }, cfg.sub), stepsEl,
      h('button', { class: 'cancel', onclick: leave }, ic('x', 15), 'Cancelar'));
    const wiz = h('div', { class: 'wiz', role: 'dialog', 'aria-modal': 'true', 'aria-label': cfg.title }, rail,
      h('div', { class: 'wmain' }, body, h('div', { class: 'wfoot' }, back, hint, next)));
    layer.innerHTML = ''; layer.append(wiz);
    const api2 = { update, go };

    function leave() { if (confirm('¿Salir del asistente? Se perderá lo que llevas hasta ahora.')) { layer.innerHTML = ''; document.removeEventListener('keydown', esc); } }
    const esc = (e) => { if (e.key === 'Escape' && layer.firstChild) leave(); };
    document.addEventListener('keydown', esc);

    function go(k) { i = k; draw(); }
    function update() {
      const s = cfg.steps[i]; const ok = !s.can || s.can(st);
      next.disabled = !ok; hint.textContent = ok ? '' : (s.need || '');
      next.innerHTML = ''; next.append(...(i === cfg.steps.length - 1 ? [ic('sparkles', 16), cfg.finish] : ['Continuar', ic('arrow-right', 16)]));
      back.style.visibility = i === 0 ? 'hidden' : 'visible';
      if (s.after) s.after(st);
    }
    function draw() {
      stepsEl.innerHTML = '';
      cfg.steps.forEach((s, k) => stepsEl.append(h('div', { class: 'st' + (k === i ? ' on' : done.has(k) ? ' done' : ''), onclick: () => { if (done.has(k) && k < i) go(k); } },
        h('span', { class: 'n' }, done.has(k) && k !== i ? ic('check', 15) : String(k + 1)), h('b', {}, s.label))));
      const s = cfg.steps[i];
      body.innerHTML = '';
      body.append(h('div', { class: 'wstep' }, h('div', { class: 'kk' }, 'Paso ' + (i + 1) + ' de ' + cfg.steps.length), h('h1', {}, s.title), h('p', { class: 'lead' }, s.lead), s.render(st, api2)));
      body.scrollTop = 0; update();
      const f = body.querySelector('[data-focus]'); if (f) setTimeout(() => f.focus(), 60);
    }
    back.onclick = () => { if (i > 0) go(i - 1); };
    next.onclick = async () => {
      if (i < cfg.steps.length - 1) { done.add(i); go(i + 1); return; }
      next.disabled = true; next.textContent = 'Creando…';
      try { await cfg.onFinish(st); } catch (e) { toast('No se pudo crear el curso: ' + e.message, 'alert'); update(); }
    };
    draw();
  }

  /* =============== utilidades de formulario =============== */
  const bind = (el, st, key, after) => { el.addEventListener('input', () => { st[key] = el.value; after && after(); }); return el; };
  function swatches(st, onchange) {
    const row = h('div', { class: 'sw-row' });
    const draw = () => { row.innerHTML = ''; Object.entries(COLORES).forEach(([k, [n, c1]]) => row.append(h('button', { class: 'sw' + (st.color === k ? ' on' : ''), onclick: () => { st.color = k; draw(); onchange && onchange(); } }, h('i', { style: 'background:' + grad(k) }), n))); };
    draw(); return row;
  }
  function portadaMock(st, getTitle) {
    const mb = h('div', { class: 'mb' }, h('h3', {}, getTitle() || 'Título de tu curso'), h('p', {}, 'Así se verá la portada que recibe el alumno.'), h('span', { class: 'cta' }, 'Comenzar curso →'));
    const wrap = h('div', { class: 'mp' }, h('div', { class: 'mh' }, 'Vista previa de la portada'), mb);
    const upd = () => { mb.style.background = grad(st.color); mb.querySelector('h3').textContent = getTitle() || 'Título de tu curso'; };
    upd(); wrap.upd = upd; return wrap;
  }
  function optCards(items, cur, set, cls) {
    const box = h('div', { class: 'oc ' + (cls || '') });
    const draw = () => { box.innerHTML = ''; items.forEach((it) => box.append(h('button', { class: 'o' + (cur() === it.v ? ' on' : ''), disabled: it.disabled, onclick: () => { set(it.v); draw(); } },
      it.big != null ? h('span', { class: 'big-n' }, it.big) : (it.icon ? ic(it.icon, 22) : null), h('b', {}, it.label), it.sub ? h('small', {}, it.sub) : null))); };
    draw(); return box;
  }
  const blankQs = (n) => Array.from({ length: n }, (_, k) => ({ id: 'q' + (k + 1), tipo: 'opcion_multiple', enunciado: '', opciones: ['', '', ''], correcta: 0, retroalimentacion: '' }));
  const sumCard = (title, icon, body, full, editStep, go) => h('div', { class: 'sumc' + (full ? ' full' : '') }, h('h4', {}, ic(icon, 14), title, editStep != null ? h('button', { class: 'btn ghost sm', onclick: () => go(editStep) }, 'Editar') : null), body);

  /* =============== asistente: curso desde cero =============== */
  const MODOS = { mixto: 'Texto + acordeón', texto: 'Texto con imagen', acordeon: 'Acordeón' };
  const IDEAS = ['Servicio de vinos', 'Higiene en el manejo de alimentos', 'Coctelería clásica', 'Atención al huésped', 'Seguridad en cocina'];
  function pantallasDe(m, mi) {
    const mk = (n, tipo, titulo) => Object.assign({ id: 'm' + (mi + 1) + '-p' + n, tipo, titulo, animacion: tipo === 'acordeon' ? 'escalonada' : 'fade-in', fuente: 'autoría manual' },
      tipo === 'acordeon' ? { contenido: { items: [{ encabezado: '', texto: '' }, { encabezado: '', texto: '' }] } } : { contenido: { texto: '', puntos: [] }, imagen: { etiquetas: [], archivo: null, alt: '' } });
    if (m.modo === 'texto') return [mk(1, 'texto_imagen', m.titulo)];
    if (m.modo === 'acordeon') return [mk(1, 'acordeon', m.titulo)];
    return [mk(1, 'texto_imagen', m.titulo), mk(2, 'acordeon', 'Puntos clave')];
  }
  function cero() {
    const st = { titulo: '', descripcion: '', idioma: 'es-MX', duracion: 20, puntaje: 80, preguntas: 5, color: 'teal', modulos: [{ titulo: '', modo: 'mixto' }, { titulo: '', modo: 'mixto' }, { titulo: '', modo: 'mixto' }] };
    const mods = () => st.modulos.filter((m) => m.titulo.trim().length >= 2);
    run({
      title: 'Curso desde cero', sub: 'Te hacemos unas preguntas y dejamos la estructura lista para que solo escribas el contenido.', icon: 'sparkles', a1: '#0a5446', a2: '#1fa386', finish: 'Crear mi curso', state: st,
      steps: [
        { label: 'Tema', title: '¿Sobre qué será tu curso?', lead: 'Dale un nombre claro. Podrás cambiarlo cuando quieras.', can: (s) => s.titulo.trim().length >= 3, need: 'Escribe un título de al menos 3 letras.',
          render: (s, a) => {
            const t = bind(h('input', { class: 'big', type: 'text', value: s.titulo, placeholder: 'Ej. Servicio de vinos', 'data-focus': true }), s, 'titulo', a.update);
            return h('div', {}, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Título del curso'), t,
              h('div', { class: 'chips' }, h('span', { class: 'lead2' }, 'Ideas:'), IDEAS.map((x) => h('button', { class: 'ch', onclick: () => { s.titulo = x; t.value = x; a.update(); t.focus(); } }, x)))),
              h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Descripción (opcional)'), bind(h('textarea', { class: 'textarea', style: 'min-height:110px', value: s.descripcion, placeholder: 'Qué aprenderá el alumno y para quién es.' }), s, 'descripcion')),
              h('div', { class: 'field', style: 'max-width:280px' }, h('label', { class: 'lbl' }, 'Idioma'), (() => { const e = h('select', { class: 'select' }, [['es-MX', 'Español (México)'], ['es-ES', 'Español (España)'], ['en-US', 'English (US)'], ['pt-BR', 'Português (Brasil)']].map(([v, l]) => h('option', { value: v }, l))); e.value = s.idioma; e.onchange = () => (s.idioma = e.value); return e; })()));
          } },
        { label: 'Alcance', title: 'Define el alcance', lead: 'Estos datos se muestran en la portada y controlan cómo se aprueba el curso.',
          render: (s) => h('div', {},
            h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Duración estimada'), optCards([10, 20, 30, 45, 60].map((m) => ({ v: m, big: m, label: 'minutos' })), () => s.duracion, (v) => (s.duracion = v))),
            h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Evaluación final'), optCards([{ v: 0, icon: 'x-circle', label: 'Sin evaluación', sub: 'Se marca como completado al terminar.' }, { v: 5, icon: 'help', label: '5 preguntas', sub: 'Estructura lista para completar.' }, { v: 10, icon: 'help', label: '10 preguntas', sub: 'Evaluación más completa.' }], () => s.preguntas, (v) => { s.preguntas = v; const sl = document.getElementById('slWrap'); if (sl) sl.style.display = v ? '' : 'none'; }, 'c2')),
            (() => { const out = h('output', {}, s.puntaje + '%'); const r = h('input', { type: 'range', min: 50, max: 100, step: 5, value: s.puntaje }); r.oninput = () => { s.puntaje = +r.value; out.textContent = r.value + '%'; };
              return h('div', { class: 'field', id: 'slWrap', style: s.preguntas ? '' : 'display:none' }, h('label', { class: 'lbl' }, 'Calificación mínima para aprobar'), h('div', { class: 'slider' }, r, out)); })()) },
        { label: 'Estructura', title: 'Arma los módulos', lead: 'Un módulo es un tema grande. Para cada uno prepararemos las pantallas iniciales; después las editas a tu gusto.',
          can: () => mods().length >= 1, need: 'Escribe el nombre de al menos un módulo.',
          render: (s, a) => {
            const list = h('div'), info = h('div', { class: 'hint', style: 'margin-top:12px' });
            const draw = () => {
              list.innerHTML = '';
              s.modulos.forEach((m, k) => {
                const inp = h('input', { class: 'input', type: 'text', value: m.titulo, placeholder: ['Ej. Tipos de copa', 'Ej. Temperatura de servicio', 'Ej. Cómo descorchar'][k] || 'Nombre del módulo' }); inp.oninput = () => { m.titulo = inp.value; calc(); a.update(); };
                const sel = h('select', { class: 'select' }, Object.entries(MODOS).map(([v, l]) => h('option', { value: v }, l))); sel.value = m.modo; sel.onchange = () => { m.modo = sel.value; calc(); };
                list.append(h('div', { class: 'mrow' }, h('span', { class: 'num' }, k + 1), inp, sel, s.modulos.length > 1 ? h('button', { class: 'btn ghost sm icon danger', title: 'Quitar', onclick: () => { s.modulos.splice(k, 1); draw(); calc(); a.update(); } }, ic('trash', 15)) : null));
              });
              list.append(h('button', { class: 'btn', onclick: () => { s.modulos.push({ titulo: '', modo: 'mixto' }); draw(); const ins = list.querySelectorAll('.mrow .input'); ins[ins.length - 1].focus(); } }, ic('plus', 15), 'Agregar módulo'));
              calc();
            };
            const calc = () => { const n = mods().reduce((x, m) => x + pantallasDe(m, 0).length, 0); info.textContent = 'Resultado: ' + mods().length + ' módulos · ' + n + ' pantallas iniciales' + (s.preguntas ? ' · ' + s.preguntas + ' preguntas' : '') + '.'; };
            draw(); return h('div', {}, list, info);
          } },
        { label: 'Estilo', title: 'Elige el color de tu curso', lead: 'Se aplica a la portada, los botones y la barra de progreso que ve el alumno.',
          render: (s) => { const mock = portadaMock(s, () => s.titulo); return h('div', {}, swatches(s, () => mock.upd()), mock); } },
        { label: 'Resumen', title: 'Todo listo para empezar', lead: 'Revisa el resumen. Al crear el curso pasarás directo al editor.',
          render: (s, a) => h('div', { class: 'sum' },
            sumCard('Tema', 'book-open', h('div', {}, h('div', { class: 'v' }, s.titulo), s.descripcion ? h('div', { class: 'muted', style: 'margin-top:6px;font-size:13px' }, s.descripcion) : null), true, 0, a.go),
            sumCard('Alcance', 'clock', h('ul', {}, h('li', {}, s.duracion + ' minutos'), h('li', {}, s.preguntas ? s.preguntas + ' preguntas · aprueba con ' + s.puntaje + '%' : 'Sin evaluación')), false, 1, a.go),
            sumCard('Estilo', 'eye', h('div', { style: 'display:flex;align-items:center;gap:10px' }, h('i', { style: 'width:30px;height:30px;border-radius:50%;background:' + grad(s.color) }), COLORES[s.color][0]), false, 3, a.go),
            sumCard('Estructura', 'layers', h('ul', {}, mods().map((m) => h('li', {}, m.titulo, h('span', { class: 'muted' }, ' · ' + MODOS[m.modo])))), true, 2, a.go)) }
      ],
      onFinish: async (s) => {
        const course = { curso: { id: slug(s.titulo), titulo: s.titulo.trim(), descripcion: s.descripcion.trim(), idioma: s.idioma, duracion_min: s.duracion, puntaje_aprobatorio: s.puntaje, color: s.color },
          modulos: mods().map((m, k) => ({ id: 'm' + (k + 1), titulo: m.titulo.trim(), pantallas: pantallasDe(m, k) })), evaluacion: { preguntas: blankQs(s.preguntas) } };
        await createAndOpen(course, 'Curso creado. Completa el contenido de cada pantalla; los puntos rojos marcan lo que falta.');
      }
    });
  }

  /* =============== asistente: curso desde contenido =============== */
  const EXT = { docx: ['DOCX', '#2b579a'], md: ['MD', '#37474f'], markdown: ['MD', '#37474f'], html: ['HTML', '#d9622b'], htm: ['HTML', '#d9622b'], txt: ['TXT', '#6b7280'], pdf: ['PDF', '#c0392b'] };
  function contenido(opts) {
    opts = opts || {};
    const st = { pending: opts.prefill || [], files: [], opts: { accordion: true, split: true }, draft: null, edited: false, titulo: '', tituloTouched: false, descripcion: '', color: 'teal', puntaje: 80, preguntas: 5, imagenes: true, stock: null };
    const okDocs = () => st.files.filter((f) => f.status === 'ok').map((f) => f.doc);
    const regen = () => { st.draft = okDocs().length ? Outline.buildDraft(okDocs(), st.opts) : null; st.edited = false; if (st.draft && !st.tituloTouched) st.titulo = st.draft.course.curso.titulo; };
    const stats = () => { const c = st.draft.course; return { m: c.modulos.length, p: c.modulos.reduce((a, m) => a + m.pantallas.length, 0), acc: c.modulos.reduce((a, m) => a + m.pantallas.filter((p) => p.tipo === 'acordeon').length, 0) }; };

    run({
      title: 'Curso desde tu contenido', sub: 'Sube tus documentos y armamos la estructura del curso. Tú revisas y ajustas antes de crearlo.', icon: 'file-text', a1: '#3328a8', a2: '#7a5bf0', finish: 'Crear curso con este contenido', state: st,
      steps: [
        { label: 'Contenido', title: 'Sube tus documentos', lead: 'Usamos los títulos de tus documentos para formar módulos y pantallas. Cuanto mejor ordenado esté el original, mejor saldrá el curso.',
          can: (s) => okDocs().length > 0 && !s.files.some((f) => f.status === 'loading'), need: 'Agrega al menos un documento válido.',
          render: (s, a) => {
            const files = h('div', { class: 'files' }), pasteBox = h('div');
            const drawFiles = () => {
              files.innerHTML = '';
              s.files.forEach((f, k) => { const [lab, col] = EXT[(f.name.split('.').pop() || '').toLowerCase()] || ['DOC', '#6b7280'];
                files.append(h('div', { class: 'fl' + (f.status === 'error' ? ' bad' : '') }, h('span', { class: 'ico', style: 'background:' + col }, lab),
                  h('div', { class: 'tx' }, h('b', {}, f.name), h('span', {}, f.status === 'loading' ? 'Leyendo…' : f.status === 'error' ? f.error : kb(f.size) + ' · ' + f.doc.words + ' palabras · ' + f.doc.blocks.filter((b) => b.t === 'h').length + ' títulos detectados')),
                  f.status === 'loading' ? h('span', { class: 'spin' }) : f.status === 'ok' ? h('span', { class: 'badge ok' }, ic('check', 12), 'Listo') : null,
                  h('button', { class: 'btn ghost sm icon', title: 'Quitar', onclick: () => { s.files.splice(k, 1); s.draft = null; drawFiles(); a.update(); } }, ic('x', 15)))); });
            };
            const addFile = async (name, buf, size) => {
              const f = { name, size, status: 'loading' }; s.files.push(f); drawFiles(); a.update();
              let r, body = buf, qs = '';
              if (/\.pdf$/i.test(name)) {
                try {
                  const pr = await PdfTools.toMarkdown(buf);
                  if (pr.scanned) r = { error: 'Este PDF son hojas escaneadas (no trae texto). Digitalízalo primero en la pestaña Utilidades y vuelve con el texto.' };
                  else if (!pr.markdown.trim()) r = { error: 'No se encontró texto en el PDF.' };
                  else { body = new TextEncoder().encode(pr.markdown); qs = '&as=md'; }
                } catch (e) { r = { error: 'No se pudo leer el PDF: ' + e.message }; }
              }
              if (!r) r = await api('/api/parse-doc?name=' + encodeURIComponent(name) + qs, { method: 'POST', body });
              if (r.error) { f.status = 'error'; f.error = r.error; } else { f.status = 'ok'; f.doc = r; }
              s.draft = null; drawFiles(); a.update();
            };
            const pick = h('input', { type: 'file', multiple: true, accept: '.docx,.md,.markdown,.html,.htm,.txt,.pdf', hidden: true });
            (s.pending || []).splice(0).forEach((x) => addFile(x.name, x.buf, x.buf.byteLength));
            const take = async (list) => { for (const f of list) await addFile(f.name, await f.arrayBuffer(), f.size); };
            pick.onchange = () => { take([...pick.files]); pick.value = ''; };
            const dz = h('div', { class: 'dz' }, h('div', { class: 'circle' }, ic('upload', 32)), h('h3', {}, 'Arrastra tus documentos aquí'), h('p', {}, 'Word (.docx), PDF, Markdown, HTML o texto. Puedes subir varios. El PDF debe ser un documento con texto, no hojas escaneadas (esas se digitalizan en Utilidades).'),
              h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: () => pick.click() }, ic('file-text', 16), 'Elegir archivos'), h('button', { class: 'btn', onclick: togglePaste }, ic('pencil', 16), 'Pegar texto')), pick);
            ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
            ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
            dz.addEventListener('drop', (e) => take([...e.dataTransfer.files]));
            function togglePaste() {
              if (pasteBox.firstChild) { pasteBox.innerHTML = ''; return; }
              const ta = h('textarea', { class: 'textarea', placeholder: '# Título del curso\n\n## Primer tema\nTu texto aquí…\n- punto clave' });
              pasteBox.append(h('div', { class: 'paste' }, h('label', { class: 'lbl' }, 'Pega tu texto (usa # y ## para los títulos)'), ta,
                h('div', { style: 'margin-top:10px;display:flex;gap:8px;justify-content:flex-end' }, h('button', { class: 'btn', onclick: () => (pasteBox.innerHTML = '') }, 'Cancelar'),
                  h('button', { class: 'btn primary', onclick: () => { if (ta.value.trim()) { const b = new TextEncoder().encode(ta.value); addFile('texto-pegado.md', b, b.length); pasteBox.innerHTML = ''; } } }, 'Usar este texto'))));
              ta.focus();
            }
            drawFiles(); return h('div', {}, dz, pasteBox, files);
          } },
        { label: 'Estructura', title: 'Revisa la estructura propuesta', lead: 'Esto es lo que detectamos. Cambia nombres, quita lo que no quieras o ajusta las opciones.',
          can: (s) => s.draft && s.draft.course.modulos.length > 0, need: 'No se detectó contenido aprovechable.',
          render: (s, a) => {
            if (!s.draft) regen();
            const col = h('div'), chips = h('div', { class: 'stats' }), optcol = h('div', { class: 'opts-col' });
            const toggle = (key, title, sub) => { const b = h('button', { class: 'tg' + (s.opts[key] ? ' on' : ''), onclick: () => { if (s.edited && !confirm('Al cambiar esta opción se vuelve a generar la estructura y se perderán tus ediciones. ¿Continuar?')) return; s.opts[key] = !s.opts[key]; regen(); drawAll(); } }, h('span', { class: 'sw2' }), h('span', {}, h('b', {}, title), h('small', {}, sub))); return b; };
            const drawStats = () => { chips.innerHTML = ''; if (!s.draft) return; const k = stats(); chips.append(h('span', { class: 'badge brand' }, k.m + ' módulos'), h('span', { class: 'badge brand' }, k.p + ' pantallas'), k.acc ? h('span', { class: 'badge' }, k.acc + ' acordeones') : null, h('span', { class: 'badge' }, s.draft.stats.palabras + ' palabras')); };
            const drawOutline = () => {
              col.innerHTML = '';
              if (!s.draft || !s.draft.course.modulos.length) { col.append(h('div', { class: 'empty', style: 'display:grid;place-items:center;gap:8px;padding:40px 20px;text-align:center;border:2px dashed var(--line-strong);border-radius:18px;color:var(--ink-2)' }, ic('alert', 30), h('b', {}, 'No encontramos títulos ni secciones'), h('span', { style: 'font-size:13px;max-width:380px' }, 'Usa estilos de título en Word, «#» y «##» en Markdown, o etiquetas <h1>/<h2> en HTML para que podamos separar los temas.'))); return; }
              s.draft.course.modulos.forEach((m, mi) => {
                const mt = h('input', { class: 'input', type: 'text', value: m.titulo }); mt.oninput = () => { m.titulo = mt.value; s.edited = true; };
                const box = h('div', { class: 'mod' }, h('div', { class: 'mh2' }, h('span', { class: 'ico2 t2', style: 'display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--brand-50);color:var(--brand)' }, ic('layers', 15)), mt, h('span', { class: 'badge' }, m.pantallas.length),
                  h('button', { class: 'btn ghost sm icon danger xbtn', title: 'Quitar módulo', onclick: () => { s.draft.course.modulos.splice(mi, 1); s.edited = true; drawAll(); } }, ic('trash', 15))));
                m.pantallas.forEach((p, pi) => { const pt = h('input', { class: 'input', type: 'text', value: p.titulo }); pt.oninput = () => { p.titulo = pt.value; s.edited = true; };
                  box.append(h('div', { class: 'scr' }, h('span', { class: 'ico2 ' + (p.tipo === 'acordeon' ? 't2' : 't1') }, ic(p.tipo === 'acordeon' ? 'list' : 'text', 14)), pt,
                    h('small', {}, p.tipo === 'acordeon' ? p.contenido.items.length + ' elementos' : (p.contenido.texto || '').split(/\s+/).filter(Boolean).length + (p.contenido.puntos.length ? ' pal. + ' + p.contenido.puntos.length + ' puntos' : ' palabras')),
                    h('button', { class: 'btn ghost sm icon xbtn', title: 'Quitar pantalla', onclick: () => { m.pantallas.splice(pi, 1); if (!m.pantallas.length) s.draft.course.modulos.splice(mi, 1); s.edited = true; drawAll(); } }, ic('x', 14)))); });
                col.append(box);
              });
            };
            const drawOpts = () => { optcol.innerHTML = ''; optcol.append(toggle('accordion', 'Acordeones', 'Agrupa temas cortos relacionados en una sola pantalla.'), toggle('split', 'Dividir textos largos', 'Evita pantallas con demasiado texto.'),
              h('div', { class: 'engine' }, h('div', { class: 'row' }, ic('wand', 18), h('div', {}, h('b', {}, 'Estructura automática'), 'Usa los títulos de tu documento. Activo.')),
                h('div', { class: 'row' }, ic('cpu', 18), h('div', {}, h('b', {}, 'IA local ', h('span', { class: 'new' }, 'Disponible')), 'Redacta preguntas y mejora textos sin salir de tu PC. La usas en el paso 3 y dentro del editor.')))); };
            const drawAll = () => { drawStats(); drawOutline(); drawOpts(); a.update(); };
            drawAll();
            return h('div', {}, chips, h('div', { class: 'two' }, optcol, col));
          } },
        { label: 'Detalles', title: 'Últimos detalles', lead: 'Completa la información del curso. Todo se puede cambiar después en el editor.',
          can: (s) => s.titulo.trim().length >= 3, need: 'El curso necesita un título.',
          render: (s, a) => {
            const t = h('input', { class: 'big', type: 'text', value: s.titulo, 'data-focus': true }); t.oninput = () => { s.titulo = t.value; s.tituloTouched = true; mock.upd(); a.update(); };
            const mock = portadaMock(s, () => s.titulo);
            const imgInfo = h('div', { class: 'hint', style: 'margin-top:10px' });
            const calcImg = async () => {
              if (!s.stock) s.stock = await api('/api/stock');
              const n = s.imagenes ? Outline.assignImages(JSON.parse(JSON.stringify(s.draft.course)), s.stock) : 0, total = s.draft.course.modulos.reduce((x, m) => x + m.pantallas.filter((p) => p.tipo === 'texto_imagen').length, 0);
              imgInfo.textContent = !s.stock.length ? 'Tu banco de imágenes está vacío. Podrás subir imágenes desde el editor.' : s.imagenes ? 'Se asignarán ' + n + ' imágenes del banco a ' + total + ' pantallas de texto. Podrás cambiarlas.' : 'No se asignarán imágenes automáticamente.';
            };
            const tg = h('button', { class: 'tg' + (s.imagenes ? ' on' : ''), style: 'margin-top:8px', onclick: () => { s.imagenes = !s.imagenes; tg.classList.toggle('on', s.imagenes); calcImg(); } }, h('span', { class: 'sw2' }), h('span', {}, h('b', {}, 'Sugerir imágenes del banco'), h('small', {}, 'Compara los temas con las etiquetas de tus imágenes.')));
            calcImg();
            return h('div', {}, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Título del curso'), t),
              h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Descripción (opcional)'), bind(h('textarea', { class: 'textarea', style: 'min-height:90px', value: s.descripcion, placeholder: 'Qué aprenderá el alumno y para quién es.' }), s, 'descripcion')),
              h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Evaluación'), optCards([{ v: 0, icon: 'x-circle', label: 'Sin evaluación' }, { v: 5, icon: 'help', label: '5 preguntas', sub: 'En blanco, para completar.' }, { v: 10, icon: 'help', label: '10 preguntas', sub: 'En blanco, para completar.' }], () => s.preguntas, (v) => (s.preguntas = v), 'c2')),
              (() => { const box = h('div', { class: 'field' }); api('/api/ai/status').then((a) => { if (!a.disponible) return;
                const t2 = h('button', { class: 'tg' + (s.iaPreg ? ' on' : ''), onclick: () => { s.iaPreg = !s.iaPreg; t2.classList.toggle('on', s.iaPreg); } }, h('span', { class: 'sw2' }), h('span', {}, h('b', {}, 'Que la IA local redacte las preguntas'), h('small', {}, 'Usa el contenido de tus documentos. Tarda cerca de 1 minuto por pregunta y siempre podrás revisarlas. Si no, quedan en blanco.')));
                box.append(h('label', { class: 'lbl' }, 'Preguntas con IA'), t2); }); return box; })(),
              h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Imágenes'), tg, imgInfo),
              h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Color del curso'), swatches(s, () => mock.upd()), mock));
          } },
        { label: 'Resumen', title: 'Tu curso está casi listo', lead: 'Al crearlo pasarás al editor para revisar cada pantalla. Nada se publica hasta que generes el SCORM.',
          render: (s, a) => { const c = s.draft.course, k = stats(); return h('div', { class: 'sum' },
            sumCard('Curso', 'book-open', h('div', {}, h('div', { class: 'v' }, s.titulo), s.descripcion ? h('div', { class: 'muted', style: 'margin-top:6px;font-size:13px' }, s.descripcion) : null), true, 2, a.go),
            sumCard('Origen', 'file-text', h('ul', {}, s.files.filter((f) => f.status === 'ok').map((f) => h('li', {}, f.name, h('span', { class: 'muted' }, ' · ' + f.doc.words + ' palabras')))), false, 0, a.go),
            sumCard('Contenido', 'layers', h('ul', {}, h('li', {}, k.m + ' módulos'), h('li', {}, k.p + ' pantallas'), h('li', {}, s.preguntas ? s.preguntas + ' preguntas por completar' : 'Sin evaluación')), false, 1, a.go),
            sumCard('Módulos', 'list', h('ul', {}, c.modulos.map((m) => h('li', {}, m.titulo, h('span', { class: 'muted' }, ' · ' + m.pantallas.length + ' pant.')))), true, 1, a.go)); } }
      ],
      onFinish: async (s) => {
        const course = JSON.parse(JSON.stringify(s.draft.course));
        Object.assign(course.curso, { titulo: s.titulo.trim(), descripcion: s.descripcion.trim(), color: s.color, puntaje_aprobatorio: s.puntaje, id: slug(s.titulo) });
        course.evaluacion = { preguntas: blankQs(s.preguntas) };
        let iaMsg = '';
        if (s.iaPreg && s.preguntas) {
          const texto = course.modulos.map((m) => m.pantallas.map((p) => (p.titulo || '') + '\n' + (p.tipo === 'acordeon' ? p.contenido.items.map((i) => i.encabezado + ': ' + i.texto).join('\n') : p.contenido.texto + '\n' + (p.contenido.puntos || []).join('\n'))).join('\n')).join('\n\n');
          const r = await api('/api/ai', { method: 'POST', body: JSON.stringify({ tarea: 'preguntas', args: { texto, n: Math.min(s.preguntas, 5), tema: s.titulo } }) });
          if (r.ok && r.resultado.length) { r.resultado.forEach((q, k) => Object.assign(course.evaluacion.preguntas[k], q)); iaMsg = ' La IA redactó ' + r.resultado.length + ' preguntas: revísalas.'; }
          else iaMsg = ' La IA no pudo redactar las preguntas; quedaron en blanco.';
        }
        let img = 0; if (s.imagenes) { if (!s.stock) s.stock = await api('/api/stock'); img = Outline.assignImages(course, s.stock); }
        const k = course.modulos.reduce((a, m) => a + m.pantallas.length, 0);
        await createAndOpen(course, 'Borrador creado: ' + course.modulos.length + ' módulos y ' + k + ' pantallas' + (img ? ', ' + img + ' con imagen sugerida' : '') + '. Revisa cada pantalla: la «fuente» indica de qué documento salió.' + iaMsg);
      }
    });
  }

  /* =============== asistente: solo evaluación =============== */
  function evaluacion(opts) {
    opts = opts || {};
    const st = { titulo: opts.nombre ? opts.nombre.replace(/[-_]+/g, ' ') : '', descripcion: '', idioma: 'es-MX', puntaje: 80, modo: 'examen', intentos: 0, aleatorizar: true, fuente: 'pegar', pegado: '', iaTexto: '', iaN: 5, iaRes: null, nBlanco: 10, color: 'azul', ai: null };
    api('/api/ai/status').then((a) => { st.ai = a; if (opts.texto && !a.disponible && st.fuente === 'ia') { st.fuente = 'pegar'; st.pegado = ''; } });
    if (opts.texto) { st.iaTexto = opts.texto; st.pegado = ''; st.fuente = 'ia'; }
    const parsed = () => (st.pegado.trim() ? QuizParse.parse(st.pegado) : { preguntas: [], warnings: [] });
    const finales = () => (st.fuente === 'pegar' ? parsed().preguntas : st.fuente === 'ia' ? st.iaRes || [] : blankQs(st.nBlanco));
    const nF = () => finales().length;
    run({
      title: 'Solo evaluación', sub: 'Crea un examen SCORM con tus preguntas: sin lecciones, con reglas de aprobación, intentos y revisión final.', icon: 'help', a1: '#1a4aa8', a2: '#4a9bf0', finish: 'Crear evaluación', state: st,
      steps: [
        { label: 'Tema', title: '¿Qué vas a evaluar?', lead: 'Ponle un nombre claro; es lo que verá el alumno en la portada.', can: (s) => s.titulo.trim().length >= 3, need: 'Escribe un título de al menos 3 letras.',
          render: (s, a) => { const t = bind(h('input', { class: 'big', type: 'text', value: s.titulo, placeholder: 'Ej. Evaluación de servicio de vinos', 'data-focus': true }), s, 'titulo', a.update);
            return h('div', {}, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Título de la evaluación'), t,
              h('div', { class: 'chips' }, h('span', { class: 'lead2' }, 'Ideas:'), ['Evaluación de higiene', 'Examen de servicio de vinos', 'Prueba de coctelería', 'Certificación de atención al huésped'].map((x) => h('button', { class: 'ch', onclick: () => { s.titulo = x; t.value = x; a.update(); t.focus(); } }, x)))),
              h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Instrucciones para el alumno (opcional)'), bind(h('textarea', { class: 'textarea', style: 'min-height:100px', value: s.descripcion, placeholder: 'Qué mide esta evaluación y cómo se aprueba.' }), s, 'descripcion'))); } },
        { label: 'Reglas', title: 'Define las reglas', lead: 'Cómo se califica y cuántas oportunidades tiene el alumno.',
          render: (s) => h('div', {},
            h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Modo'), optCards([{ v: 'examen', icon: 'clipboard', label: 'Examen', sub: 'Corrige al final y muestra la revisión al aprobar o agotar intentos.' }, { v: 'practica', icon: 'help', label: 'Práctica', sub: 'Dice si acertó y explica en cada pregunta.' }], () => s.modo, (v) => (s.modo = v), 'c2')),
            (() => { const out = h('output', {}, s.puntaje + '%'); const r = h('input', { type: 'range', min: 50, max: 100, step: 5, value: s.puntaje }); r.oninput = () => { s.puntaje = +r.value; out.textContent = r.value + '%'; };
              return h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Calificación mínima para aprobar'), h('div', { class: 'slider' }, r, out)); })(),
            h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Intentos permitidos'), optCards([{ v: 0, big: '∞', label: 'Ilimitados' }, { v: 1, big: 1, label: 'intento' }, { v: 2, big: 2, label: 'intentos' }, { v: 3, big: 3, label: 'intentos' }], () => s.intentos, (v) => (s.intentos = v))),
            (() => { const tg = h('button', { class: 'tg' + (s.aleatorizar ? ' on' : ''), onclick: () => { s.aleatorizar = !s.aleatorizar; tg.classList.toggle('on', s.aleatorizar); } }, h('span', { class: 'sw2' }), h('span', {}, h('b', {}, 'Barajar las opciones'), h('small', {}, 'Cambia el orden de las respuestas en cada intento para evitar memorizar posiciones.'))); return tg; })()) },
        { label: 'Preguntas', title: '¿De dónde salen las preguntas?', lead: 'Elige la forma más cómoda. Después podrás editarlas una por una en el editor.',
          can: (s) => nF() > 0, need: 'Agrega al menos una pregunta.',
          render: (s, a) => {
            const area = h('div', { style: 'margin-top:18px' });
            const ai = () => st.ai && st.ai.disponible;
            const drawPegar = () => {
              const info = h('div', { class: 'hint', style: 'margin-top:8px' });
              const ta = h('textarea', { class: 'textarea', style: 'min-height:260px;font-family:ui-monospace,Consolas,monospace;font-size:13px', value: s.pegado, placeholder: '1. ¿A qué temperatura se sirve un tinto?\na) 4 °C\n*b) 16-18 °C\nc) 30 °C\nRetro: Entre 16 y 18 grados.\n\n2. ¿Cuánto se llena la copa?\na) Hasta el borde\nb) Un tercio\nc) Dos tercios\nRespuesta: b' });
              const calc = () => { const r = parsed(); info.textContent = s.pegado.trim() ? '✓ ' + r.preguntas.length + ' preguntas detectadas' + (r.warnings.length ? ' · ' + r.warnings.join(' · ') : '') : 'Marca la correcta con * al inicio, con «(correcta)» al final o con una línea «Respuesta: b». «Retro:» agrega la retroalimentación.'; a.update(); };
              ta.addEventListener('input', () => { s.pegado = ta.value; calc(); }); area.innerHTML = ''; area.append(h('label', { class: 'lbl' }, 'Pega tus preguntas (desde Word, correo o notas)'), ta, info); calc();
            };
            const drawIA = () => {
              area.innerHTML = '';
              if (st.ai && !st.ai.disponible) { area.append(h('div', { class: 'hint', style: 'padding:16px;border:1px dashed var(--line-strong);border-radius:14px' }, 'La IA local no está instalada en este equipo. Usa «Pegar mis preguntas» o empieza en blanco. Mira el estado en la barra superior.')); return; }
              const ta = h('textarea', { class: 'textarea', style: 'min-height:200px', value: s.iaTexto, placeholder: 'Pega aquí el material de estudio (procedimiento, manual, artículo). La IA redactará preguntas basadas solo en este texto.' });
              const res = h('div', { style: 'margin-top:16px' }), nSel = h('select', { class: 'select', style: 'width:auto' }, [3, 5, 8].map((n) => h('option', { value: n }, n + ' preguntas'))); nSel.value = s.iaN; nSel.onchange = () => (s.iaN = +nSel.value);
              const pick = h('input', { type: 'file', accept: '.docx,.md,.markdown,.html,.htm,.txt', hidden: true });
              pick.onchange = async () => { const f = pick.files[0]; if (!f) return; const d = await api('/api/parse-doc?name=' + encodeURIComponent(f.name), { method: 'POST', body: await f.arrayBuffer() }); if (d.error) { toast(d.error, 'alert'); return; } s.iaTexto = (s.iaTexto ? s.iaTexto + '\n\n' : '') + d.blocks.map((b) => b.text).join('\n'); ta.value = s.iaTexto; };
              ta.addEventListener('input', () => (s.iaTexto = ta.value));
              const paintRes = () => { res.innerHTML = ''; if (!s.iaRes) return; res.append(h('div', { class: 'stats' }, h('span', { class: 'badge ok' }, ic('check', 12), s.iaRes.length + ' preguntas listas')), s.iaRes.map((q, k) => h('div', { class: 'mod', style: 'padding:12px 14px;margin-top:8px' }, h('b', { style: 'font-size:14px' }, (k + 1) + '. ' + q.enunciado), h('ul', { style: 'margin:6px 0 0;padding-left:20px;font-size:13px;line-height:1.6' }, q.opciones.map((o, i) => h('li', { style: i === q.correcta ? 'color:var(--ok,#1f9e6a);font-weight:600' : '' }, o)))))); a.update(); };
              const gen = h('button', { class: 'btn primary', onclick: async () => {
                if (s.iaTexto.replace(/\s/g, '').length < 80) { toast('Pega al menos un par de párrafos de texto.', 'alert'); return; }
                const ac = new AbortController(); const t0 = Date.now(); const msg = h('span', { class: 'muted' }); const tm = setInterval(() => (msg.textContent = 'Todo ocurre en tu PC · ' + Math.round((Date.now() - t0) / 1000) + ' s (alrededor de 1 minuto por pregunta)'), 500);
                res.innerHTML = ''; res.append(h('div', { style: 'display:flex;align-items:center;gap:14px;padding:14px 0' }, h('span', { class: 'spin' }), h('div', {}, h('b', {}, 'La IA está redactando…'), h('div', {}, msg)), h('button', { class: 'btn sm', onclick: () => ac.abort() }, 'Cancelar')));
                gen.disabled = true;
                try { const r = await api('/api/ai', { method: 'POST', signal: ac.signal, body: JSON.stringify({ tarea: 'preguntas', args: { texto: s.iaTexto, n: s.iaN, tema: s.titulo } }) }); clearInterval(tm); gen.disabled = false;
                  if (!r.ok) { res.innerHTML = ''; toast('La IA no pudo completar la tarea: ' + (r.error || 'error'), 'alert'); return; }
                  s.iaRes = r.resultado; if (!s.iaRes.length) { res.innerHTML = ''; toast('La IA no produjo preguntas válidas. Inténtalo de nuevo.', 'alert'); return; } paintRes();
                } catch (e) { clearInterval(tm); gen.disabled = false; res.innerHTML = ''; } } }, ic('sparkles', 16), 'Generar preguntas');
              area.append(h('label', { class: 'lbl' }, 'Material de estudio'), ta, h('div', { style: 'display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap' }, h('button', { class: 'btn', onclick: () => pick.click() }, ic('file-text', 15), 'Cargar un documento'), pick, nSel, gen), res); paintRes();
            };
            const drawBlanco = () => { area.innerHTML = ''; area.append(h('label', { class: 'lbl' }, 'Cantidad de preguntas'), optCards([5, 10, 15, 20].map((n) => ({ v: n, big: n, label: 'preguntas' })), () => s.nBlanco, (v) => { s.nBlanco = v; a.update(); }), h('div', { class: 'hint', style: 'margin-top:10px' }, 'Se crean vacías para que las escribas en el editor.')); };
            const draw = () => (s.fuente === 'pegar' ? drawPegar() : s.fuente === 'ia' ? drawIA() : drawBlanco());
            const cards = optCards([{ v: 'pegar', icon: 'copy', label: 'Pegar mis preguntas', sub: 'Las detectamos solas. Rápido y sin IA.' }, { v: 'ia', icon: 'sparkles', label: 'Redactar con IA local', sub: 'A partir de tu material de estudio. Lento pero sin escribir.' }, { v: 'blanco', icon: 'pencil', label: 'Empezar en blanco', sub: 'Las escribes una por una en el editor.' }], () => s.fuente, (v) => { s.fuente = v; draw(); a.update(); }, 'c2');
            setTimeout(() => { if (s.fuente === 'ia') draw(); }, 0); api('/api/ai/status').then((x) => { st.ai = x; if (s.fuente === 'ia') draw(); });
            draw(); return h('div', {}, cards, area);
          } },
        { label: 'Estilo', title: 'Elige el color', lead: 'Se aplica a la portada, los botones y el resultado que ve el alumno.', render: (s) => { const mock = portadaMock(s, () => s.titulo); return h('div', {}, swatches(s, () => mock.upd()), mock); } },
        { label: 'Resumen', title: 'Tu evaluación está lista', lead: 'Al crearla pasarás al editor para revisar cada pregunta.',
          render: (s, a) => h('div', { class: 'sum' },
            sumCard('Evaluación', 'clipboard', h('div', {}, h('div', { class: 'v' }, s.titulo), s.descripcion ? h('div', { class: 'muted', style: 'margin-top:6px;font-size:13px' }, s.descripcion) : null), true, 0, a.go),
            sumCard('Reglas', 'sliders', h('ul', {}, h('li', {}, s.modo === 'examen' ? 'Examen: corrige al final' : 'Práctica: corrige al responder'), h('li', {}, 'Aprueba con ' + s.puntaje + '%'), h('li', {}, s.intentos ? s.intentos + (s.intentos === 1 ? ' intento' : ' intentos') : 'Intentos ilimitados'), h('li', {}, s.aleatorizar ? 'Opciones barajadas' : 'Opciones en orden fijo')), false, 1, a.go),
            sumCard('Preguntas', 'help', h('ul', {}, h('li', {}, nF() + (nF() === 1 ? ' pregunta' : ' preguntas')), h('li', {}, { pegar: 'Pegadas por ti', ia: 'Redactadas con IA local (revísalas)', blanco: 'En blanco, por completar' }[s.fuente])), false, 2, a.go),
            sumCard('Estilo', 'eye', h('div', { style: 'display:flex;align-items:center;gap:10px' }, h('i', { style: 'width:30px;height:30px;border-radius:50%;background:' + grad(s.color) }), COLORES[s.color][0]), false, 3, a.go)) }
      ],
      onFinish: async (s) => {
        const qs = finales().map((q, k) => Object.assign({ id: 'q' + (k + 1), tipo: 'opcion_multiple', retroalimentacion: '' }, q, { id: 'q' + (k + 1) }));
        const course = { curso: { id: slug(s.titulo), titulo: s.titulo.trim(), descripcion: s.descripcion.trim(), idioma: s.idioma, duracion_min: Math.max(5, Math.round(qs.length * 0.75)), puntaje_aprobatorio: s.puntaje, color: s.color, tipo: 'evaluacion' },
          modulos: [], evaluacion: { modo: s.modo, intentos: s.intentos, aleatorizar: s.aleatorizar, preguntas: qs } };
        await createAndOpen(course, 'Evaluación creada con ' + qs.length + ' preguntas.' + (s.fuente === 'ia' ? ' Las redactó la IA: revísalas antes de publicar.' : s.fuente === 'blanco' ? ' Completa cada pregunta; los puntos rojos marcan lo que falta.' : ''));
      }
    });
  }

  /* =============== asistente: crear con IA (manual → curso) =============== */
  const LARGO = { corto: { m: 2, p: 3, label: 'Corto', sub: '2 módulos · 6 pantallas' }, medio: { m: 3, p: 3, label: 'Medio', sub: '3 módulos · 9 pantallas' }, largo: { m: 4, p: 3, label: 'Largo', sub: '4 módulos · 12 pantallas' } };
  const fmtT = (s) => { s = Math.max(0, Math.round(s)); return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0') + ' s'; };
  const fmtEta = (s) => (s < 45 ? 'menos de 1 min' : '≈ ' + Math.max(1, Math.round(s / 60)) + ' min');
  /* Parte los documentos en secciones (por encabezado) para que la IA se apoye en cada una */

  window.Wizard = { cero, contenido, evaluacion };

  /* Texto que llega desde Utilidades (convertidor): abre el asistente ya con el contenido cargado */
  try {
    const imp = sessionStorage.getItem('gs-import');
    if (imp) {
      sessionStorage.removeItem('gs-import'); const o = JSON.parse(imp);
      if (o.tipo === 'evaluacion') evaluacion({ texto: o.markdown, nombre: o.nombre });
      else contenido({ prefill: [{ name: (o.nombre || 'documento') + '.md', buf: new TextEncoder().encode(o.markdown).buffer }] });
    }
  } catch (e) { /* sin importación */ }
})();
