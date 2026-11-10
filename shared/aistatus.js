/* Indicador de IA local en la barra superior. Expone window.AIStatus = {state, onChange}. */
(function () {
  'use strict';
  var st = { disponible: null }, listeners = [], chip, pop, timer;
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function view(s) {
    if (s.disponible === null) return { k: 'wait', t: 'IA local' };
    if (s.descarga && s.descarga.estado === 'descargando') return { k: 'load', t: 'IA local · descargando ' + pct(s.descarga) + ' %' };
    if (!s.disponible) return { k: 'off', t: 'IA local · no instalada' };
    if (s.error) return { k: 'err', t: 'IA local · error' };
    if (s.ocupado) return { k: 'busy', t: 'IA local · trabajando' };
    if (s.cargando) return { k: 'load', t: 'IA local · cargando' };
    return { k: 'on', t: 'IA local · lista' };
  }
  function paint() {
    if (!chip) return;
    var v = view(st);
    chip.className = 'ai-chip ' + v.k;
    chip.innerHTML = '<i class="d"></i><span>' + esc(v.t) + '</span>';
    chip.title = v.k === 'off' ? 'No se encontró el modelo. Pulsa para ver cómo instalarlo.' : 'Estado de la IA local';
    if (pop && !pop.hidden) paintPop();
  }
  function pct(d) { return d && d.total ? Math.min(100, Math.floor(d.recibido * 100 / d.total)) : 0; }
  function gb(n) { return n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GB' : Math.round(n / 1048576) + ' MB'; }
  function eta(sec) { if (sec == null) return ''; return sec > 90 ? 'quedan ~' + Math.ceil(sec / 60) + ' min' : 'quedan ~' + sec + ' s'; }
  var showList = false;
  function modelList() {
    var d = st.descarga || {}, bajando = d.estado === 'descargando', h = '';
    var eq = st.equipo;
    if (eq) h += '<div class="mdl-eq"><b>Tu equipo:</b> ' + eq.ramGB + ' GB de RAM · ' + eq.nucleos + ' núcleos' + (eq.gpu ? ' · GPU ' + esc(eq.gpu) : '') + '</div>';
    (st.catalogo || []).forEach(function (m) {
      var activo = bajando && d.id === m.id;
      h += '<div class="mdl' + (m.enUso ? ' en-uso' : '') + (m.apto ? '' : ' no-apto') + '"><div class="mdl-t"><b>' + esc(m.nombre) + '</b>' +
        (m.recomendado ? '<span class="badge ok">★ Recomendado</span>' : '') + (m.opcional ? '<span class="badge">Opcional · equipos potentes</span>' : '') +
        '<span class="badge ' + (m.comercial ? 'ok' : 'warn') + '">' + (m.comercial ? 'Uso comercial' : 'No comercial') + '</span></div>' +
        '<div class="mut">' + esc(m.nota) + ' <i>' + esc(m.motivo) + '</i> Licencia: ' + esc(m.licencia) + '. <a href="' + esc(m.pagina) + '" target="_blank" rel="noopener">Ver en Hugging Face</a></div>';
      if (activo) h += '<div class="bar"><i style="width:' + pct(d) + '%"></i></div><div class="mut">' + gb(d.recibido) + ' de ' + gb(d.total) + ' · ' + Math.round((d.velocidad || 0) / 1048576 * 10) / 10 + ' MB/s ' + (d.restante != null ? '· ' + eta(d.restante) : '') + '</div><button class="btn sm" data-ai="cancel">Cancelar</button>';
      else if (m.enUso) h += '<div class="mut" style="color:var(--ok)">✓ En uso</div>';
      else if (m.instalado) h += '<button class="btn sm primary" data-ai="use" data-id="' + esc(m.id) + '">Usar este modelo</button>';
      else h += '<button class="btn sm' + (m.recomendado ? ' primary' : '') + '" data-ai="dl" data-id="' + esc(m.id) + '"' + (bajando ? ' disabled' : '') + '>Descargar (' + gb(m.bytes) + ')</button>';
      h += '</div>';
    });
    if (d.estado === 'error') h += '<p class="mdl-err">' + esc(d.error) + '</p>';
    if (d.estado === 'cancelado') h += '<p class="mut">Descarga cancelada. Si vuelves a pulsar Descargar, continúa donde se quedó.</p>';
    return h;
  }
  function paintPop() {
    var v = view(st), h = '<b>IA local</b>';
    if (v.k === 'off' || showList || (st.descarga && st.descarga.estado === 'descargando')) {
      if (v.k === 'off') h += '<p>Aún no hay un modelo de IA en esta computadora. <b>Todo lo demás funciona igual</b>; solo los botones con ✦ están desactivados.</p>';
      h += '<p class="mut">Descárgalo una sola vez desde un repositorio abierto (Hugging Face): después la IA funciona <b>sin internet</b>, en tu PC. Se necesita conexión solo para esta descarga.</p>' + modelList() +
        '<details class="mdl-man"><summary>Prefiero instalarlo a mano</summary><p class="mut">Descarga el archivo <code>.gguf</code> de la página del modelo, cópialo en esta carpeta y reinicia la app:</p><code class="path">' + esc(st.carpeta) + '</code></details>';
    } else {
      h += '<dl><dt>Modelo</dt><dd>' + esc(st.modelo) + '</dd><dt>Tamaño</dt><dd>' + (st.tamano / 1073741824).toFixed(1) + ' GB</dd><dt>Estado</dt><dd>' +
        ({ on: st.cargado ? 'En memoria, lista para usar' : 'Instalada. Se carga en memoria la primera vez que la uses', busy: 'Trabajando en una tarea', load: 'Cargando en memoria…', err: 'Error: ' + esc(st.error) }[v.k]) + '</dd></dl>' +
        '<p class="mut">Funciona 100 % en esta PC, sin internet. Las propuestas siempre se revisan antes de aplicarse.</p>';
      if (st.cargado && !st.ocupado) h += '<button class="btn sm" id="aiFree">Liberar memoria</button> ';
      h += '<button class="btn sm ghost" data-ai="list">Cambiar o descargar modelos…</button>';
    }
    pop.innerHTML = h;
    var b = pop.querySelector('#aiFree');
    if (b) b.onclick = function () { fetch('/api/ai/unload', { method: 'POST' }).then(refresh); };
  }
  function popClick(e) {
    var t = e.target.closest && e.target.closest('[data-ai]'); if (!t) return;
    var a = t.getAttribute('data-ai');
    if (a === 'list') { showList = true; paintPop(); }
    else if (a === 'dl') { t.disabled = true; fetch('/api/ai/download?id=' + encodeURIComponent(t.getAttribute('data-id')), { method: 'POST' }).then(refresh); }
    else if (a === 'use') { t.disabled = true; t.textContent = 'Cambiando…'; fetch('/api/ai/select?id=' + encodeURIComponent(t.getAttribute('data-id')), { method: 'POST' }).then(function () { showList = false; return refresh(); }).then(function () { listeners.forEach(function (f) { try { f(st); } catch (e) {} }); }); }
    else if (a === 'cancel') { fetch('/api/ai/download/cancel', { method: 'POST' }).then(refresh); }
  }
  function refresh() {
    return fetch('/api/ai/status').then(function (r) { return r.json(); }).then(function (s) {
      var changed = JSON.stringify([st.disponible, st.cargado, st.cargando, st.ocupado, st.error]) !== JSON.stringify([s.disponible, s.cargado, s.cargando, s.ocupado, s.error]);
      st = s; paint(); if (changed) listeners.forEach(function (f) { try { f(st); } catch (e) {} });
      clearTimeout(timer); timer = setTimeout(refresh, (s.descarga && s.descarga.estado === 'descargando') ? 1000 : (s.ocupado || s.cargando) ? 1500 : 6000);
    }).catch(function () { clearTimeout(timer); timer = setTimeout(refresh, 8000); });
  }
  function mount() {
    var bar = document.querySelector('.appbar'); if (!bar) return;
    chip = el('button', 'ai-chip wait'); chip.type = 'button';
    pop = el('div', 'ai-pop'); pop.hidden = true;
    var theme = document.getElementById('btnTheme');
    bar.insertBefore(chip, theme || null); document.body.appendChild(pop);
    chip.onclick = function (e) { e.stopPropagation(); pop.hidden = !pop.hidden; if (!pop.hidden) { paintPop(); var r = chip.getBoundingClientRect(); pop.style.top = (r.bottom + 8) + 'px'; pop.style.right = Math.max(8, window.innerWidth - r.right) + 'px'; } };
    pop.addEventListener('click', popClick);
    document.addEventListener('click', function (e) { if (!e.target.isConnected) return; if (!pop.contains(e.target) && e.target !== chip && !chip.contains(e.target)) pop.hidden = true; });
    paint(); refresh();
  }
  window.AIStatus = { get state() { return st; }, onChange: function (f) { listeners.push(f); }, refresh: refresh };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
