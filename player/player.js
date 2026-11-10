(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var pkg = null, lms = null, frame = null, closedChecks = null, lastResources = [];
  var btns = ['btnLaunch', 'btnClose', 'btnResume', 'btnReset', 'btnStudent', 'btnExport'];
  var I = function (n, s) { return Icon.el(n, s || 15); };
  function label(id, icon, text) { var b = $(id); b.innerHTML = ''; b.append(I(icon, 15), text); }
  $('logoIc').append(I('cap', 17));
  $('tabHome').append(I('home', 14), 'Inicio'); $('tabAut').append(I('pencil', 14), 'Autoría'); $('tabPlay').append(I('play', 14), 'Player'); $('tabUtil').append(I('wand', 14), 'Utilidades');
  label('btnOpen', 'folder', 'Abrir'); $('lblFile').append(I('upload', 15), 'Subir .zip', $('fileIn'));
  label('btnLaunch', 'play', 'Lanzar'); label('btnClose', 'exit', 'Cerrar'); label('btnResume', 'refresh', 'Cerrar y reanudar');
  label('btnReset', 'rotate-ccw', 'Reiniciar intento'); label('btnStudent', 'repeat', 'Alumno distinto');
  label('btnExport', 'download', 'Exportar reporte');
  $('szD').append(I('monitor', 14), 'Escritorio'); $('szT').append(I('tablet', 14), 'Tablet'); $('szM').append(I('phone', 14), 'Móvil');
  function tab(id, icon, text) { var b = $(id); b.append(I(icon, 15), text, ' '); var c = document.createElement('span'); c.className = 'pillc'; c.textContent = '0'; b.append(c); return c; }
  var cLog = tab('tLog', 'list', 'Log'); tab('tData', 'layers', 'Datos').remove(); var cVal = tab('tVal', 'shield', 'Validación'); cVal.textContent = '–';
  $('btnTheme').append(I(Theme.current() === 'dark' ? 'sun' : 'moon', 16));
  $('btnTheme').onclick = function () { var t = Theme.toggle(); $('btnTheme').innerHTML = ''; $('btnTheme').append(I(t === 'dark' ? 'sun' : 'moon', 16)); };
  function emptyStage(title, sub) {
    var st = $('stage'); st.innerHTML = '';
    var d = el('div', 'empty'); d.append(I('play', 40), el('b', '', title), el('span', '', sub)); st.append(d);
  }
  emptyStage('Ningún curso cargado', 'Elige un paquete de la lista o sube un .zip para empezar.');

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function enable(on) { btns.forEach(function (b) { $(b).disabled = !on; }); }

  /* ---------- carga de paquetes ---------- */
  function refreshList() {
    fetch('/api/packages').then(function (r) { return r.json(); }).then(function (list) {
      var s = $('pkgSel'); s.innerHTML = '';
      if (!list.length) s.appendChild(new Option('(sin paquetes todavía)', ''));
      list.forEach(function (n) { s.appendChild(new Option(n, n)); });
    });
  }
  function adopt(info) {
    if (info.error) { alert('No se pudo abrir el paquete: ' + info.error); return; }
    pkg = info; closedChecks = null;
    lms = LmsEmu.createLms({ mastery: info.mastery, onLog: onLog });
    window.API = lms.api;
    enable(true); renderAll();
    launch(true);
  }
  $('btnOpen').onclick = function () {
    var n = $('pkgSel').value; if (!n) return;
    fetch('/api/load-local?name=' + encodeURIComponent(n)).then(function (r) { return r.json(); }).then(adopt);
  };
  $('fileIn').onchange = function (e) {
    var f = e.target.files[0]; if (!f) return;
    f.arrayBuffer().then(function (buf) {
      return fetch('/api/load-zip?name=' + encodeURIComponent(f.name), { method: 'POST', body: buf });
    }).then(function (r) { return r.json(); }).then(adopt);
    e.target.value = '';
  };

  /* ---------- ciclo de vida del curso ---------- */
  function mount() {
    var stage = $('stage'); stage.innerHTML = '';
    frame = document.createElement('iframe');
    frame.title = 'Curso SCORM';
    stage.appendChild(frame);
  }
  function launch(fresh) {
    if (!pkg) return;
    closedChecks = null;
    if (lms.attempt().initialized && !lms.attempt().finished) lms.beginAttempt(); else lms.beginAttempt();
    mount();
    frame.src = '/pkg/' + pkg.id + '/' + pkg.launch;
    frame.onload = function () { setTimeout(snapshotResources, 600); };
    renderAll();
  }
  function snapshotResources() {
    try {
      var w = frame.contentWindow;
      lastResources = w.performance.getEntriesByType('resource').map(function (r) { return r.name; });
    } catch (e) { lastResources = []; }
    renderValidation();
  }
  function closeCourse(cb) {
    if (!frame) { if (cb) cb(); return; }
    snapshotResources();
    var f = frame;
    f.onload = function () {
      f.onload = null;
      closedChecks = lms.closeAttempt();
      if (f.parentNode) f.parentNode.removeChild(f);
      if (frame === f) frame = null;
      emptyStage('Curso cerrado', 'Pulsa «Lanzar» para reanudar donde se quedó el alumno.');
      renderAll();
      if (cb) cb();
    };
    f.src = 'about:blank';
  }
  $('btnLaunch').onclick = function () { if (frame) closeCourse(function () { launch(); }); else launch(); };
  $('btnClose').onclick = function () { closeCourse(); };
  $('btnResume').onclick = function () { closeCourse(function () { launch(); }); };
  $('btnReset').onclick = function () {
    var go = function () { lms.resetStudent(); closedChecks = null; launch(); };
    if (frame) closeCourse(go); else go();
  };
  $('btnStudent').onclick = function () {
    var go = function () { lms.nextStudent(); closedChecks = null; launch(); };
    if (frame) closeCourse(go); else go();
  };
  [].forEach.call(document.querySelectorAll('[data-size]'), function (b) {
    b.onclick = function () {
      [].forEach.call(document.querySelectorAll('[data-size]'), function (x) { x.classList.toggle('on', x === b); });
      $('stage').className = 'stage ' + b.getAttribute('data-size');
    };
  });

  /* ---------- pestañas ---------- */
  [].forEach.call(document.querySelectorAll('.tabs button'), function (t) {
    t.onclick = function () {
      [].forEach.call(document.querySelectorAll('.tabs button'), function (x) { x.classList.toggle('on', x === t); });
      ['log', 'data', 'val'].forEach(function (k) { $('pane-' + k).classList.toggle('on', k === t.getAttribute('data-t')); });
    };
  });

  /* ---------- log ---------- */
  function onLog(e) {
    appendLog(e); cLog.textContent = lms.getLog().length;
    scheduleRender();
  }
  function appendLog(e) {
    if ($('onlyErr').checked && !e.err) return;
    var tr = el('tr', e.err ? 'err' : '');
    [e.time, e.fn, e.el, e.val, e.ret, e.err ? e.err + ' ' + lms.errorString(e.err) : '0'].forEach(function (v, i) {
      var td = el('td', i === 1 ? 'fn' : '', String(v)); tr.appendChild(td);
    });
    var tb = $('logTbl').tBodies[0]; tb.appendChild(tr);
    var sc = $('logScroll'); sc.scrollTop = sc.scrollHeight;
  }
  function rebuildLog() { $('logTbl').tBodies[0].innerHTML = ''; if (lms) lms.getLog().forEach(appendLog); }
  $('onlyErr').onchange = rebuildLog;
  $('btnClearLog').onclick = function () { if (lms) lms.clearLog(); cLog.textContent = '0'; rebuildLog(); };

  /* ---------- datos / estado ---------- */
  function renderData() {
    var tb = $('dataTbl').tBodies[0]; tb.innerHTML = '';
    if (!lms) return;
    var m = lms.getModel();
    Object.keys(m).sort().forEach(function (k) {
      var tr = el('tr'); tr.appendChild(el('td', 'k', k)); tr.appendChild(el('td', '', m[k])); tb.appendChild(tr);
    });
  }
  function renderStatus() {
    var s = $('status'); s.innerHTML = '';
    var pill = function (k, v, cls) { var p = el('span', 'pill' + (cls ? ' ' + cls : '')); if (k) p.append(el('span', 'k', k)); p.append(el('b', '', v)); s.appendChild(p); };
    if (!pkg) { s.appendChild(el('span', 'muted', 'Sin paquete cargado.')); return; }
    var m = lms.getModel(), a = lms.attempt(), st = m['cmi.core.lesson_status'];
    pill('', pkg.label + (pkg.title ? ' · ' + pkg.title : ''));
    pill('Alumno', lms.student().name);
    pill('Entry', m['cmi.core.entry']);
    pill('Estado', st, st === 'passed' || st === 'completed' ? 'ok' : st === 'failed' ? 'bad' : st === 'incomplete' ? 'warn' : '');
    pill('Puntaje', m['cmi.core.score.raw'] || '–');
    pill('Ubicación', m['cmi.core.lesson_location'] || '–');
    pill('Sesión', a.initialized ? 'activa' : a.finished ? 'finalizada' : 'sin iniciar', a.initialized ? 'ok' : '');
  }

  /* ---------- validación ---------- */
  function externalChecks() {
    var origin = location.origin;
    var ext = lastResources.filter(function (u) { return u.indexOf(origin) !== 0 && !/^(data|blob|about):/.test(u); });
    return ext.length
      ? [{ level: 'error', msg: 'Peticiones externas en ejecución: ' + ext.slice(0, 5).join(', ') }]
      : [{ level: lastResources.length ? 'ok' : 'warn', msg: lastResources.length ? 'Sin peticiones externas en ejecución (' + lastResources.length + ' recursos locales)' : 'Aún no se midieron peticiones de red' }];
  }
  function allChecks() {
    if (!pkg) return { static: [], runtime: [], verdict: null };
    var rt = (closedChecks || lms.evaluate()).concat(externalChecks());
    var st = pkg.report.checks;
    var all = st.concat(rt);
    var e = all.filter(function (c) { return c.level === 'error'; }).length;
    var w = all.filter(function (c) { return c.level === 'warn'; }).length;
    return { static: st, runtime: rt, errors: e, warns: w, verdict: e ? 'errores' : w ? 'observaciones' : 'aprobado', closed: !!closedChecks };
  }
  function section(box, title, list) {
    box.appendChild(el('div', 'sec', title));
    if (!list.length) box.appendChild(el('div', 'chk-r', '(sin comprobaciones)'));
    list.forEach(function (c) {
      var d = el('div', 'chk-r ' + c.level);
      d.appendChild(I(c.level === 'ok' ? 'check-circle' : c.level === 'warn' ? 'alert' : 'x-circle', 16)); d.appendChild(el('span', '', c.msg)); box.appendChild(d);
    });
  }
  function renderValidation() {
    var box = $('valBox'); box.innerHTML = '';
    if (!pkg) { cVal.textContent = '–'; cVal.className = 'pillc'; box.appendChild(el('div', 'sec', 'Carga un paquete para ver la validación.')); return; }
    var r = allChecks();
    var cls = r.errors ? 'bad' : r.warns ? 'warn' : 'ok';
    var v = el('div', 'verdict ' + cls);
    v.appendChild(I(r.errors ? 'x-circle' : r.warns ? 'alert' : 'check-circle', 26));
    var t = el('div', '', r.errors ? r.errors + ' errores' + (r.warns ? ' y ' + r.warns + ' observaciones' : '') : r.warns ? r.warns + ' observaciones' : 'Aprobado');
    t.appendChild(el('small', '', r.closed ? 'Curso cerrado: validación completa.' : 'Curso en ejecución: las comprobaciones de cierre se completan al cerrarlo.'));
    v.appendChild(t); box.appendChild(v);
    section(box, 'Paquete (estático)', r.static);
    section(box, 'Comunicación SCORM (ejecución)', r.runtime);
    cVal.textContent = r.errors ? r.errors : r.warns ? r.warns : '✓';
    cVal.className = 'pillc ' + cls;
  }

  var pending = null;
  function scheduleRender() { if (pending) return; pending = setTimeout(function () { pending = null; renderData(); renderStatus(); renderValidation(); }, 120); }
  function renderAll() { rebuildLog(); cLog.textContent = lms ? lms.getLog().length : 0; renderData(); renderStatus(); renderValidation(); }

  /* ---------- exportar ---------- */
  $('btnExport').onclick = function () {
    if (!pkg) return;
    var r = allChecks();
    var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
    var rows = function (l) { return l.map(function (c) { return '<li class="' + c.level + '">[' + ({ ok: 'OK', warn: 'OBSERVACIÓN', error: 'ERROR' })[c.level] + '] ' + esc(c.msg) + '</li>'; }).join(''); };
    var logRows = lms.getLog().map(function (e) { return '<tr' + (e.err ? ' class="e"' : '') + '><td>' + e.time + '</td><td>' + e.fn + '</td><td>' + esc(e.el) + '</td><td>' + esc(String(e.val).slice(0, 200)) + '</td><td>' + e.ret + '</td><td>' + e.err + '</td></tr>'; }).join('');
    var html = '<!DOCTYPE html><meta charset="utf-8"><title>Reporte de validación</title><style>body{font:14px system-ui;max-width:900px;margin:24px auto;padding:0 16px}li.ok{color:#1b7f3b}li.warn{color:#a15c00}li.error{color:#b3261e}table{border-collapse:collapse;font:12px monospace;width:100%}td,th{border:1px solid #ddd;padding:2px 6px;text-align:left}tr.e{background:#fdeceb}</style>' +
      '<h1>Reporte de validación SCORM 1.2</h1><p>Paquete: <b>' + esc(pkg.label) + '</b> — ' + esc(pkg.title || '') + '<br>Fecha: ' + new Date().toLocaleString('es-MX') + '<br>Alumno simulado: ' + esc(lms.student().name) + '</p>' +
      '<h2>Resultado: ' + r.verdict.toUpperCase() + ' (' + r.errors + ' errores, ' + r.warns + ' observaciones)</h2>' +
      (r.closed ? '' : '<p><i>El curso seguía en ejecución al exportar: las comprobaciones de cierre pueden estar pendientes.</i></p>') +
      '<h3>Paquete</h3><ul>' + rows(r.static) + '</ul><h3>Comunicación SCORM</h3><ul>' + rows(r.runtime) + '</ul>' +
      '<h3>Log de la API</h3><table><tr><th>Hora</th><th>Función</th><th>Elemento</th><th>Valor</th><th>Ret.</th><th>Err</th></tr>' + logRows + '</table>' +
      '<p><i>El player valida estructura y comunicación; la prueba final siempre es en el LMS real.</i></p>';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = 'reporte-' + pkg.label.replace(/\.zip$/i, '') + '.html'; a.click();
  };

  window.__player = { get lms() { return lms; }, get pkg() { return pkg; }, closeCourse: closeCourse, launch: launch };
  refreshList();
  var qo = new URLSearchParams(location.search).get('open');
  if (qo) fetch('/api/load-local?name=' + encodeURIComponent(qo)).then(function (r) { return r.json(); }).then(adopt);
})();
