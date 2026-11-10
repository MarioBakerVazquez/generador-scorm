/* Runtime del curso: navegación, acordeones, evaluación, SCORM 1.2. */
(function () {
  'use strict';
  var D = window.CURSO_DATA;
  var screens = [].slice.call(document.querySelectorAll('.screen'));
  var btnPrev = document.getElementById('prev');
  var btnNext = document.getElementById('next');
  var counter = document.getElementById('counter');
  var bar = document.getElementById('bar');
  var startTime = Date.now();

  var cur = 0;
  var st = { a: {}, v: {}, t: 0, fin: 0 }; // a: respuestas; v: acordeones; t: intentos usados; fin: intento terminado
  var EX = D.examen || { modo: 'practica', intentos: 0, aleatorizar: false, mostrar: 0, respuestas: true };
  var ALL = { s: screens.slice(), d: D.screens.slice() }; // todas las pantallas; el banco de preguntas puede mostrar solo algunas por intento
  var examen = EX.modo === 'examen';
  var scorm = false;

  /* ---------- utilidades ---------- */
  function pad(n, l) { n = String(n); while (n.length < l) n = '0' + n; return n; }
  function timespan(ms) {
    var cs = Math.floor(ms / 10), h = Math.floor(cs / 360000); cs -= h * 360000;
    var m = Math.floor(cs / 6000); cs -= m * 6000;
    var s = Math.floor(cs / 100); cs -= s * 100;
    return pad(h, 4) + ':' + pad(m, 2) + ':' + pad(s, 2) + '.' + pad(cs, 2);
  }
  function save() {
    if (!scorm) return;
    Scorm.set('cmi.core.lesson_location', String(cur));
    Scorm.set('cmi.suspend_data', JSON.stringify(st));
    Scorm.commit();
  }

  /* ---------- finalización de pantallas ---------- */
  function openedSet(i) { return (st.v[i] || '').split(',').filter(Boolean); }
  function isComplete(i) {
    if (!scorm) return true; // vista previa del autor: sin bloqueos
    var d = D.screens[i];
    if (d.req === 'items' || d.req === 'bloques') return openedSet(i).length >= d.n;
    if (d.req === 'pregunta') return st.a[d.qid] !== undefined;
    return true;
  }

  /* ---------- acordeón ---------- */
  function setupAccordion(sec, i) {
    [].forEach.call(sec.querySelectorAll('.acc-h'), function (h) {
      h.addEventListener('click', function () {
        var open = h.getAttribute('aria-expanded') === 'true';
        h.setAttribute('aria-expanded', String(!open));
        h.parentNode.querySelector('.acc-b').hidden = open;
        if (!open) {
          var set = openedSet(i), k = h.getAttribute('data-k');
          if (set.indexOf(k) < 0) { set.push(k); st.v[i] = set.join(','); save(); }
          refreshNav();
        }
      });
    });
  }
  function restoreAccordion(sec, i) {
    openedSet(i).forEach(function (k) {
      var h = sec.querySelector('.acc-h[data-k="' + k + '"]');
      if (h) { h.setAttribute('aria-expanded', 'true'); h.parentNode.querySelector('.acc-b').hidden = false; }
    });
  }

  /* ---------- bloques de aprendizaje ---------- */
  function $$(root, sel) { return [].slice.call(root.querySelectorAll(sel)); }
  function shuffleArr(a) { for (var k = a.length - 1; k > 0; k--) { var j = Math.floor(Math.random() * (k + 1)), t = a[k]; a[k] = a[j]; a[j] = t; } return a; }
  function markBlock(sec, i, idx) {
    var set = openedSet(i), k = String(idx);
    if (set.indexOf(k) < 0) { set.push(k); st.v[i] = set.join(','); save(); }
    var b = sec.querySelector('.blk[data-i="' + idx + '"]'); if (b) b.classList.add('done');
    refreshNav();
  }
  var BSETUP = {
    acordeon: function (b, done) {
      var hs = $$(b, '.acc-h'), seen = {};
      hs.forEach(function (h) { h.addEventListener('click', function () {
        var open = h.getAttribute('aria-expanded') === 'true';
        h.setAttribute('aria-expanded', String(!open)); h.parentNode.querySelector('.acc-b').hidden = open;
        if (!open) { seen[h.getAttribute('data-k')] = 1; if (Object.keys(seen).length >= hs.length) done(); }
      }); });
    },
    pestanas: function (b, done) {
      var tabs = $$(b, '.tab-b'), seen = {};
      function pick(k) {
        tabs.forEach(function (t, n) { var on = n === k; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
        $$(b, '.tab-p').forEach(function (p, n) { p.hidden = n !== k; });
        seen[k] = 1; if (Object.keys(seen).length >= tabs.length) done();
      }
      tabs.forEach(function (t, n) {
        t.addEventListener('click', function () { pick(n); });
        t.addEventListener('keydown', function (e) { var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d) { e.preventDefault(); var m = (n + d + tabs.length) % tabs.length; pick(m); tabs[m].focus(); } });
      });
      seen[0] = 1; if (tabs.length === 1) done();
    },
    pasos: function (b, done) {
      var box = b.querySelector('.b-steps'), n = +box.getAttribute('data-n'), cur = 0, prev = box.querySelector('[data-st="-1"]'), next = box.querySelector('[data-st="1"]');
      function paint() {
        $$(box, '.st-p').forEach(function (p, k) { p.hidden = k !== cur; });
        $$(box, '.st-dots i').forEach(function (d, k) { d.className = k === cur ? 'on' : k < cur ? 'pas' : ''; });
        box.querySelector('.st-count').textContent = 'Paso ' + (cur + 1) + ' de ' + n;
        prev.disabled = cur === 0; next.disabled = cur === n - 1; next.textContent = cur === n - 2 ? 'Último paso' : 'Siguiente paso';
        if (cur === n - 1) done();
      }
      prev.addEventListener('click', function () { if (cur > 0) { cur--; paint(); } });
      next.addEventListener('click', function () { if (cur < n - 1) { cur++; paint(); } });
      if (n <= 1) done();
    },
    imagen_etiquetas: function (b, done) {
      var pins = $$(b, '.pin'), seen = {}, lis = $$(b, '.hl button'), hz = b.querySelector('.hz'), zb = b.querySelector('.hzb');
      pins.forEach(function (p) { p.addEventListener('click', function () {
        var k = p.getAttribute('data-k');
        $$(b, '.hp').forEach(function (h) { h.hidden = h.getAttribute('data-k') !== k; });
        pins.forEach(function (q) { q.classList.toggle('cur', q === p); }); p.classList.add('seen');
        lis.forEach(function (l) { l.classList.toggle('cur', l.getAttribute('data-k') === k); if (l.getAttribute('data-k') === k) l.classList.add('seen'); });
        seen[k] = 1; if (Object.keys(seen).length >= pins.length) done();
      }); });
      /* móvil: la lista de puntos hace lo mismo que tocar el punto; "Ampliar" deja mover la imagen con el dedo */
      lis.forEach(function (l) { l.addEventListener('click', function () { pins[+l.getAttribute('data-k')].click(); }); });
      if (zb) zb.addEventListener('click', function () { var on = !hz.classList.contains('zoom'); hz.classList.toggle('zoom', on); zb.setAttribute('aria-pressed', String(on)); zb.textContent = on ? 'Reducir imagen' : 'Ampliar imagen'; });
    },
    revelar: function (b, done) {
      var bt = b.querySelector('.rev-b'), c = b.querySelector('.rev-c');
      bt.addEventListener('click', function () { var open = bt.getAttribute('aria-expanded') === 'true'; bt.setAttribute('aria-expanded', String(!open)); c.hidden = open; if (!open) { b.classList.add('revealed'); done(); } });
    },
    tarjetas: function (b, done) {
      var cs = $$(b, '.flipc'), seen = {};
      cs.forEach(function (c) { c.addEventListener('click', function () {
        var on = !c.classList.contains('on'); c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on));
        if (on) { seen[c.getAttribute('data-k')] = 1; if (Object.keys(seen).length >= cs.length) done(); }
      }); });
    },
    escenario: function (b, done) {
      var os = $$(b, '.eopt'), any = os.some(function (o) { return o.getAttribute('data-ok') === '1'; });
      os.forEach(function (o) { o.addEventListener('click', function () {
        if (b.classList.contains('solved')) return;
        var k = o.getAttribute('data-k');
        os.forEach(function (x) { x.classList.remove('sel'); }); o.classList.add('sel');
        var me = b.querySelector('.esc-me'); if (me) { me.textContent = o.querySelector('span').textContent; me.hidden = false; }
        $$(b, '.esc-r').forEach(function (r) { r.hidden = r.getAttribute('data-k') !== k; });
        if (o.getAttribute('data-ok') === '1' || !any) { b.classList.add('solved'); os.forEach(function (x) { x.classList.add(x.getAttribute('data-ok') === '1' ? 'ok' : 'off'); }); done(); }
        else o.classList.add('bad');
      }); });
    },
    vf: function (b, done) {
      var box = b.querySelector('.b-vf'), ok = box.getAttribute('data-ok'), fb = b.querySelector('.fbk'), os = $$(b, '.eopt');
      os.forEach(function (o) { o.addEventListener('click', function () {
        if (b.classList.contains('solved')) return;
        var v = o.getAttribute('data-v'), good = v === ok, retro = box.getAttribute('data-retro') || '';
        b.classList.add('solved'); os.forEach(function (x) { var k = x.getAttribute('data-v'); x.classList.add(k === ok ? 'ok' : (k === v ? 'bad' : 'off')); x.disabled = true; });
        fb.hidden = false; fb.className = 'fbk ' + (good ? 'good' : 'bad');
        fb.textContent = (good ? '¡Correcto! ' : 'No exactamente: la afirmación es ' + (ok === 'v' ? 'verdadera' : 'falsa') + '. ') + retro; done();
      }); });
    },
    corta: function (b, done) {
      var box = b.querySelector('.b-cor'), inp = b.querySelector('.cor-i'), chk = b.querySelector('[data-chk]'), fb = b.querySelector('.fbk'), tries = 0, ans = [];
      try { ans = JSON.parse(box.getAttribute('data-ans')); } catch (e) { ans = []; }
      function norm(s) { s = String(s).toLowerCase(); try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { /* nada */ } return s.replace(/[^a-z0-9]+/g, ' ').replace(/^ +| +$/g, ''); }
      function fin(good) { b.classList.add('solved'); inp.disabled = true; chk.disabled = true; inp.classList.add(good ? 'ok' : 'bad'); done(); }
      function go() {
        if (b.classList.contains('solved')) return;
        var v = norm(inp.value); if (!v) { fb.hidden = false; fb.className = 'fbk bad'; fb.textContent = 'Escribe tu respuesta primero.'; inp.focus(); return; }
        tries++; fb.hidden = false;
        if (ans.some(function (a) { return norm(a) === v; })) { fb.className = 'fbk good'; fb.textContent = '¡Correcto! ' + (box.getAttribute('data-retro') || ''); fin(true); }
        else if (tries >= 3) { fb.className = 'fbk bad'; fb.textContent = 'La respuesta era: ' + ans[0] + '. ' + (box.getAttribute('data-retro') || ''); fin(false); }
        else { fb.className = 'fbk bad'; fb.textContent = 'Todavía no. Revisa tu respuesta e inténtalo de nuevo (' + (3 - tries) + (3 - tries === 1 ? ' intento restante' : ' intentos restantes') + ').'; inp.focus(); }
      }
      chk.addEventListener('click', go);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    },
    simulador: function (b, done) {
      var box = b.querySelector('.b-sim'), l = b.querySelector('.sim-l'), bs = $$(l, '.sim-b'), n = bs.length, cnt = b.querySelector('.sim-c'), fb = b.querySelector('.fbk'), next = 0, errs = 0;
      var mix = bs.slice(), tries = 0, ordered = function (a) { return a.every(function (x, k) { return +x.getAttribute('data-o') === k; }); };
      do { shuffleArr(mix); tries++; } while (ordered(mix) && n > 1 && tries < 8);
      mix.forEach(function (x) { l.appendChild(x); });
      bs.forEach(function (bt) { bt.addEventListener('click', function () {
        if (bt.classList.contains('ok') || next >= n) return;
        var o = +bt.getAttribute('data-o'); fb.hidden = false;
        if (o === next) {
          next++; bt.classList.remove('bad'); bt.classList.add('ok'); bt.disabled = true; bt.querySelector('b').textContent = next;
          if (next >= n) { cnt.textContent = '¡Completado!'; fb.className = 'fbk good'; fb.textContent = (box.getAttribute('data-retro') || '¡Lo hiciste en el orden correcto!') + (errs ? ' (Errores: ' + errs + ')' : ' Sin errores.'); b.classList.add('solved'); done(); }
          else { cnt.textContent = 'Paso ' + (next + 1) + ' de ' + n; fb.className = 'fbk good'; fb.textContent = 'Bien. ¿Y ahora?'; }
        } else {
          errs++; bt.classList.add('bad'); setTimeout(function () { bt.classList.remove('bad'); }, 700);
          var hint = bs.filter(function (x) { return +x.getAttribute('data-o') === o; })[0].getAttribute('data-hint');
          fb.className = 'fbk bad'; fb.textContent = hint ? 'Todavía no. ' + hint : 'Todavía no: esa acción va después. Piensa qué se hace en el paso ' + (next + 1) + '.';
        }
      }); });
    },
    arrastrar: function (b, done) {
      var box = b.querySelector('.b-dd'), pool = box.querySelector('.dd-pool'), items = $$(box, '.dd-i'), zones = $$(box, '.dd-z'), chk = box.querySelector('.dd-chk'), fb = box.querySelector('.fbk');
      var max = +box.getAttribute('data-int') || 0, tries = 0, sel = null, drag = null, mix = items.slice();
      shuffleArr(mix); mix.forEach(function (x) { pool.appendChild(x); });
      function paint() {
        var left = pool.querySelectorAll('.dd-i').length, fin = box.classList.contains('done');
        chk.disabled = left > 0 || fin; pool.classList.toggle('empty', !left);
        $$(box, '.dd-put').forEach(function (p) { p.disabled = !sel || fin; });
        box.classList.toggle('has-sel', !!sel);
      }
      function pick(it) { items.forEach(function (x) { x.classList.remove('sel'); x.setAttribute('aria-pressed', 'false'); }); sel = (sel === it) ? null : it; if (sel) { it.classList.add('sel'); it.setAttribute('aria-pressed', 'true'); } paint(); }
      function put(it, target) { if (!it || box.classList.contains('done')) return; target.appendChild(it); it.classList.remove('sel', 'bad', 'ok'); it.setAttribute('aria-pressed', 'false'); sel = null; fb.hidden = true; paint(); }
      items.forEach(function (it) {
        it.addEventListener('click', function () { if (!box.classList.contains('done')) pick(it); });
        it.addEventListener('dragstart', function (e) { drag = it; try { e.dataTransfer.setData('text/plain', it.textContent); e.dataTransfer.effectAllowed = 'move'; } catch (x) {} });
        it.addEventListener('dragend', function () { drag = null; });
      });
      function target(el, getEl) {
        el.addEventListener('dragover', function (e) { if (drag) { e.preventDefault(); el.classList.add('over'); } });
        el.addEventListener('dragleave', function () { el.classList.remove('over'); });
        el.addEventListener('drop', function (e) { e.preventDefault(); el.classList.remove('over'); put(drag, getEl()); });
        el.addEventListener('click', function (e) { if (sel && !(e.target.closest && e.target.closest('.dd-i'))) put(sel, getEl()); });
      }
      zones.forEach(function (z) { var d = z.querySelector('.dd-drop'); target(z, function () { return d; }); });
      target(pool, function () { return pool; });
      chk.addEventListener('click', function () {
        tries++; var wrong = 0;
        items.forEach(function (it) { var z = it.parentNode.closest ? it.parentNode.closest('.dd-z') : null, ok = !!z && z.getAttribute('data-k') === it.getAttribute('data-z'); it.classList.toggle('ok', ok); it.classList.toggle('bad', !ok); if (!ok) wrong++; });
        fb.hidden = false;
        if (!wrong) { fb.className = 'fbk good'; fb.textContent = box.getAttribute('data-ok') || '¡Todo en su lugar!'; }
        else if (max && tries >= max) {
          items.forEach(function (it) { zones[+it.getAttribute('data-z')].querySelector('.dd-drop').appendChild(it); it.classList.remove('bad'); it.classList.add('ok'); });
          fb.className = 'fbk bad'; fb.textContent = (box.getAttribute('data-mal') || 'Hay elementos que no iban ahí.') + ' Así queda correcto.';
        } else { fb.className = 'fbk bad'; fb.textContent = (box.getAttribute('data-mal') || 'Hay elementos mal ubicados.') + ' Muévelos e inténtalo de nuevo' + (max ? ' (intento ' + tries + ' de ' + max + ').' : '.'); return; }
        box.classList.add('done'); b.classList.add('solved'); items.forEach(function (it) { it.disabled = true; it.draggable = false; }); paint(); done();
      });
      paint();
    },
    encuesta: function (b, done) {
      var box = b.querySelector('.b-enc'), fb = b.querySelector('.fbk');
      function fin() { b.classList.add('solved'); fb.hidden = false; fb.textContent = box.getAttribute('data-gracias'); done(); }
      if (box.getAttribute('data-modo') === 'escala') {
        var ns = $$(b, '.enc-n');
        ns.forEach(function (n) { n.addEventListener('click', function () { ns.forEach(function (x) { var on = x === n; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }); fin(); }); });
      } else {
        var ta = b.querySelector('.enc-t'), sv = b.querySelector('[data-save]');
        sv.addEventListener('click', function () { if (!ta.value.replace(/\s/g, '')) { fb.hidden = false; fb.className = 'fbk bad'; fb.textContent = 'Escribe unas palabras primero.'; ta.focus(); return; } fb.className = 'fbk good'; ta.readOnly = true; sv.disabled = true; fin(); });
      }
    },
    ordenar: function (b, done) {
      var ol = b.querySelector('.ord-l'), items = $$(ol, 'li'), fb = b.querySelector('.fbk'), chk = b.querySelector('[data-chk]');
      var sorted = function (a) { return a.every(function (li, k) { return +li.getAttribute('data-o') === k; }); };
      var mix = items.slice(), tries = 0; do { shuffleArr(mix); tries++; } while (sorted(mix) && items.length > 1 && tries < 8);
      mix.forEach(function (li) { ol.appendChild(li); });
      ol.addEventListener('click', function (e) {
        var bt = e.target.closest('[data-mv]'); if (!bt || b.classList.contains('solved')) return;
        var li = bt.closest('li'), d = +bt.getAttribute('data-mv');
        if (d < 0 && li.previousElementSibling) ol.insertBefore(li, li.previousElementSibling);
        else if (d > 0 && li.nextElementSibling) ol.insertBefore(li.nextElementSibling, li);
        $$(ol, 'li').forEach(function (x) { x.classList.remove('ok', 'bad'); }); fb.hidden = true; bt.focus();
      });
      chk.addEventListener('click', function () {
        var cur = $$(ol, 'li');
        cur.forEach(function (li, k) { li.classList.toggle('ok', +li.getAttribute('data-o') === k); li.classList.toggle('bad', +li.getAttribute('data-o') !== k); });
        fb.hidden = false;
        if (sorted(cur)) { fb.className = 'fbk good'; fb.textContent = b.querySelector('.b-ord').getAttribute('data-retro') || '¡Correcto! El orden es ese.'; b.classList.add('solved'); chk.disabled = true; done(); }
        else { fb.className = 'fbk bad'; fb.textContent = 'Todavía no. Los que están en verde ya van en su lugar; mueve los demás con las flechas.'; }
      });
    },
    relacionar: function (b, done) {
      var rows = $$(b, '.rel-r'), fb = b.querySelector('.fbk'), chk = b.querySelector('[data-chk]');
      rows.forEach(function (r) { var sel = r.querySelector('select'), ops = $$(sel, 'option').slice(1); shuffleArr(ops).forEach(function (o) { sel.appendChild(o); }); });
      chk.addEventListener('click', function () {
        var ok = 0, all = true;
        rows.forEach(function (r) { var v = r.querySelector('select').value, good = v !== '' && +v === +r.getAttribute('data-o'); r.classList.toggle('ok', good); r.classList.toggle('bad', !good); if (good) ok++; else all = false; });
        fb.hidden = false;
        if (all) { fb.className = 'fbk good'; fb.textContent = b.querySelector('.b-rel').getAttribute('data-retro') || '¡Correcto! Todas las parejas son esas.'; b.classList.add('solved'); chk.disabled = true; $$(b, 'select').forEach(function (s) { s.disabled = true; }); done(); }
        else { fb.className = 'fbk bad'; fb.textContent = ok + ' de ' + rows.length + ' correctas. Corrige las marcadas en rojo e inténtalo de nuevo.'; }
      });
    },
    galeria: function (b) {
      var t = b.querySelector('.gal-t'), n = $$(b, '.gal-s').length, lab = b.querySelector('.gal-n');
      $$(b, '[data-gal]').forEach(function (bt) { bt.addEventListener('click', function () { t.scrollBy({ left: +bt.getAttribute('data-gal') * t.clientWidth, behavior: 'smooth' }); }); });
      t.addEventListener('scroll', function () { lab.textContent = (Math.round(t.scrollLeft / Math.max(1, t.clientWidth)) + 1) + ' / ' + n; });
    }
  };
  function setupMvAcc(sec, i) {
    $$(sec, '.mv-acc .acc-h').forEach(function (h) { h.addEventListener('click', function () {
      var open = h.getAttribute('aria-expanded') === 'true'; h.setAttribute('aria-expanded', String(!open)); h.parentNode.querySelector('.acc-b').hidden = open; }); });
  }
  function setupBloques(sec, i) {
    setupMvAcc(sec, i);
    $$(sec, '.blk').forEach(function (blk) {
      var t = blk.getAttribute('data-bt'), idx = blk.getAttribute('data-i');
      if (BSETUP[t]) BSETUP[t](blk, function () { if (idx !== null) markBlock(sec, i, idx); });
    });
    // «Continuar»: lo que sigue aparece al pulsar el botón (en la vista previa del autor se muestra todo)
    var gate = null, gates = [];
    $$(sec, '.blk').forEach(function (blk) {
      if (gate) gate.group.push(blk);
      var bt = blk.querySelector('[data-cont]');
      if (bt) {
        var g = { blk: blk, btn: bt, group: [] }; gates.push(g); gate = g;
        bt.addEventListener('click', function () {
          g.group.forEach(function (x) { x.hidden = false; }); bt.disabled = true; blk.classList.add('done');
          var idx = blk.getAttribute('data-i'); if (idx !== null) markBlock(sec, i, idx);
          var first = g.group[0]; if (first && first.scrollIntoView) first.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    });
    sec._gates = gates;
  }
  function restoreBloques(sec, i) {
    var set = openedSet(i);
    set.forEach(function (k) { var b = sec.querySelector('.blk[data-i="' + k + '"]'); if (b) b.classList.add('done'); });
    (sec._gates || []).forEach(function (g) {
      var open = !scorm || set.indexOf(g.blk.getAttribute('data-i')) >= 0;
      g.group.forEach(function (x) { x.hidden = !open; });
      if (open && scorm) g.btn.disabled = true;
    });
  }

  /* ---------- preguntas ---------- */
  function questionByIndex(idx) { return D.preguntas[idx]; }
  function paintQuestion(sec, d) {
    var q = D.preguntas[d.qn];
    var chosen = st.a[q.id];
    var fb = sec.querySelector('.fb');
    if (examen) { // modo examen: solo se marca la elección; la corrección llega al cierre
      [].forEach.call(sec.querySelectorAll('.opt'), function (o) {
        var k = +o.getAttribute('data-k');
        o.classList.remove('ok', 'bad', 'sel');
        if (chosen === k) o.classList.add('sel');
        o.setAttribute('aria-checked', String(chosen === k));
        o.disabled = !!st.fin;
      });
      fb.hidden = true; return;
    }
    [].forEach.call(sec.querySelectorAll('.opt'), function (o) {
      var k = +o.getAttribute('data-k');
      o.classList.remove('ok', 'bad', 'sel');
      o.setAttribute('aria-checked', String(chosen === k));
      if (chosen !== undefined) {
        o.disabled = true;
        if (k === q.correcta) o.classList.add('ok');
        else if (k === chosen) o.classList.add('bad');
      } else { o.disabled = false; }
    });
    if (chosen === undefined) { fb.hidden = true; return; }
    fb.hidden = false;
    fb.className = 'fb ' + (chosen === q.correcta ? 'ok' : 'bad');
    fb.textContent = (chosen === q.correcta ? '¡Correcto! ' : 'Incorrecto. ') + (q.retro || '');
  }
  function setupQuestion(sec, d) {
    var q = D.preguntas[d.qn];
    [].forEach.call(sec.querySelectorAll('.opt'), function (o) {
      o.addEventListener('click', function () {
        if (st.fin || (!examen && st.a[q.id] !== undefined)) return;
        var k = +o.getAttribute('data-k');
        st.a[q.id] = k;
        if (scorm) {
          var p = 'cmi.interactions.' + d.qn + '.';
          Scorm.set(p + 'id', q.id);
          Scorm.set(p + 'type', 'choice');
          Scorm.set(p + 'student_response', String.fromCharCode(97 + k));
          Scorm.set(p + 'correct_responses.0.pattern', String.fromCharCode(97 + q.correcta));
          Scorm.set(p + 'result', k === q.correcta ? 'correct' : 'wrong');
        }
        paintQuestion(sec, d);
        save();
        refreshNav();
      });
    });
  }

  /* ---------- opciones aleatorias (estables por pregunta e intento) ---------- */
  function seeded(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return function () { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }
  function shuffleAll() {
    if (!EX.aleatorizar) return;
    D.screens.forEach(function (d, i) {
      if (d.tipo !== 'pregunta') return;
      var box = screens[i].querySelector('.opts'), opts = [].slice.call(box.children), rnd = seeded(d.qid + ':' + (st.t || 0));
      for (var k = opts.length - 1; k > 0; k--) { var j = Math.floor(rnd() * (k + 1)); var tmp = opts[k]; opts[k] = opts[j]; opts[j] = tmp; }
      opts.forEach(function (o, n) { box.appendChild(o); o.querySelector('b').textContent = String.fromCharCode(65 + n); });
    });
  }

  /* ---------- cierre / calificación ---------- */
  /* ---------- banco de preguntas: «cuántas se muestran» (Quiz final) ---------- */
  function seedRnd(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return function () { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }
  function applySubset() {
    var qIdx = []; ALL.d.forEach(function (d, i) { if (d.tipo === 'pregunta') qIdx.push(i); });
    var n = !EDIT && EX.mostrar > 0 && EX.mostrar < qIdx.length ? EX.mostrar : qIdx.length, keep = {};
    if (!st.sd) st.sd = Math.floor(Math.random() * 1e9) + 1;
    var pool = qIdx.slice(), rnd = seedRnd('q:' + st.sd + ':' + (st.t || 0));
    for (var k = pool.length - 1; k > 0; k--) { var j = Math.floor(rnd() * (k + 1)), tmp = pool[k]; pool[k] = pool[j]; pool[j] = tmp; }
    pool.slice(0, n).forEach(function (i) { keep[i] = 1; });
    var cierre = ALL.s[ALL.s.length - 1], parent = cierre.parentNode;
    screens.length = 0; var dd = [], qn = 0;
    ALL.s.forEach(function (sec, i) {
      var d = ALL.d[i];
      if (d.tipo === 'pregunta') {
        if (!keep[i]) { if (sec.parentNode) sec.parentNode.removeChild(sec); return; }
        if (!sec.parentNode) parent.insertBefore(sec, cierre);
        qn++; var kk = sec.querySelector('.kicker'); if (kk) kk.textContent = 'Evaluación · Pregunta ' + qn + ' de ' + n;
      }
      screens.push(sec); dd.push(d);
    });
    // las preguntas reinsertadas deben quedar en su orden original, antes del cierre
    ALL.s.forEach(function (sec, i) { if (ALL.d[i].tipo === 'pregunta' && sec.parentNode) parent.insertBefore(sec, cierre); });
    D.screens = dd;
  }
  function activeQs() { var out = []; D.screens.forEach(function (d) { if (d.tipo === 'pregunta') out.push(D.preguntas[d.qn]); }); return out; }
  function score() {
    var qs = activeQs(), total = qs.length, ok = 0;
    qs.forEach(function (q) { if (st.a[q.id] === q.correcta) ok++; });
    return { ok: ok, total: total, pct: total ? Math.round((ok * 100) / total) : 100 };
  }
  /* ---------- certificado (sección 15): se desbloquea con 100 % de avance y el puntaje mínimo; se descarga imprimiendo a PDF ---------- */
  function lmsName() {
    if (!scorm) return '';
    var n = String(Scorm.get('cmi.core.student_name') || '').replace(/^\s+|\s+$/g, ''), m = /^([^,]+),\s*(.+)$/.exec(n);
    return m ? (m[2] + ' ' + m[1]) : n;
  }
  function printCert(nombre, pct) {
    var C = window.Certificado; C.ensureCss(document);
    var v = { nombre_alumno: nombre, nombre_curso: D.titulo, fecha_termino: C.fecha(new Date()), duracion: D.cert.duracion || '', puntaje: pct === '' ? '' : String(pct), folio: C.folio(nombre, D.id, new Date()), instructor: D.cert.instructor || '' };
    var old = document.getElementById('certPrint'); if (old) old.parentNode.removeChild(old);
    var w = document.createElement('div'); w.id = 'certPrint'; w.innerHTML = C.html(D.cert, v, function (x) { return x; });
    var css = document.getElementById('certPrintCss'); if (css) css.parentNode.removeChild(css);
    css = document.createElement('style'); css.id = 'certPrintCss';
    css.textContent = '@page{size:' + (D.cert.tamano === 'a4' ? 'A4' : 'letter') + ' landscape;margin:0}#certPrint{display:none}@media print{body>*:not(#certPrint){display:none!important}#certPrint{display:block}html,body{background:#fff!important;margin:0}}';
    document.head.appendChild(css); document.body.appendChild(w);
    var clean = function () { window.removeEventListener('afterprint', clean); setTimeout(function () { if (w.parentNode) w.parentNode.removeChild(w); }, 300); };
    window.addEventListener('afterprint', clean);
    setTimeout(function () { window.print(); }, 120);
  }
  function certBlock(box, passed, pct, hasQ) {
    if (!D.cert || !D.cert.activo || !window.Certificado) return;
    var old = box.parentNode.querySelector('.cert-box'); if (old) old.parentNode.removeChild(old);
    var pend = 0; D.screens.forEach(function (d, i) { if (d.tipo !== 'cierre' && d.tipo !== 'portada' && !isComplete(i)) pend++; });
    var miss = []; if (pend) miss.push('completar todas las actividades del curso'); if (hasQ && !passed) miss.push('aprobar con ' + D.aprobatorio + '% (llevas ' + pct + '%)');
    var ok = !miss.length, nm = lmsName(), el = document.createElement('div'); el.className = 'cert-box' + (ok ? ' ok' : '');
    el.innerHTML = (ok ? '<p class="big ok">¡Felicidades, completaste el curso!</p>' : '<p class="muted">Tu certificado se desbloquea cuando termines el curso.</p>') +
      (ok && !nm ? '<label class="cert-l">Tu nombre completo, como saldrá en el certificado<input type="text" class="cert-nm" autocomplete="name" maxlength="80"></label>' : '') +
      '<button type="button" class="btn cert-btn"' + (ok ? '' : ' disabled') + '>Descargar certificado en PDF</button>' + (ok ? '<p class="muted cert-h">Se abrirá la ventana de impresión: elige «Guardar como PDF».</p>' : '<p class="muted cert-miss">Te falta: ' + miss.join(' y ') + '.</p>');
    box.parentNode.insertBefore(el, box.nextSibling);
    var bt = el.querySelector('.cert-btn'), inp = el.querySelector('.cert-nm');
    if (ok) bt.addEventListener('click', function () {
      var name = nm || (inp && inp.value.replace(/^\s+|\s+$/g, ''));
      if (!name) { if (inp) { inp.focus(); inp.classList.add('bad'); } return; }
      printCert(name, hasQ ? pct : '');
    });
  }
  function paintClosing(sec) {
    var box = sec.querySelector('.resultado');
    var btnRetry = sec.querySelector('.reintentar');
    btnRetry.hidden = true;
    if (!D.preguntas.length) {
      box.innerHTML = '<p class="big ok">¡Curso completado!</p><p>Has terminado todas las pantallas.</p>';
      if (scorm) { Scorm.set('cmi.core.lesson_status', 'completed'); save(); }
      certBlock(box, true, '', false);
      return;
    }
    var s = score();
    var passed = s.pct >= D.aprobatorio;
    if (!st.fin) { st.fin = 1; st.t = (st.t || 0) + 1; }
    var agotados = !passed && EX.intentos > 0 && st.t >= EX.intentos;
    var terminado = passed || agotados;
    var C = 2 * Math.PI * 54;
    box.innerHTML = '<div class="ring ' + (passed ? 'ok' : 'bad') + '"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="bg" cx="60" cy="60" r="54"/><circle class="fg" cx="60" cy="60" r="54" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '"/></svg><b>' + s.pct + '%</b></div>' +
      '<p class="big ' + (passed ? 'ok' : 'bad') + '">' + (passed ? '¡Aprobado!' : 'No aprobado') + '</p>' +
      '<p>' + s.ok + ' de ' + s.total + ' respuestas correctas</p>' +
      '<p class="muted">Puntaje mínimo para aprobar: ' + D.aprobatorio + '%' + (EX.intentos > 0 ? ' · Intento ' + Math.min(st.t, EX.intentos) + ' de ' + EX.intentos : '') + '</p>' +
      (agotados ? '<p class="muted">Has agotado tus intentos.</p>' : '') +
      (examen && terminado ? (EX.respuestas === false ? '' : review()) : (examen && EX.respuestas !== false ? '<p class="muted">Podrás ver las respuestas correctas cuando termines tus intentos o apruebes.</p>' : ''));
    setTimeout(function () { var fg = box.querySelector('.fg'); if (fg) fg.style.strokeDashoffset = C * (1 - s.pct / 100); }, 60);
    if (scorm) {
      Scorm.set('cmi.core.score.min', '0');
      Scorm.set('cmi.core.score.max', '100');
      Scorm.set('cmi.core.score.raw', String(s.pct));
      Scorm.set('cmi.core.lesson_status', passed ? 'passed' : 'failed');
      save();
    }
    certBlock(box, passed, s.pct, true);
    if (!passed && !agotados) btnRetry.hidden = false;
    refreshNav();
  }
  function review() {
    var out = '<div class="rev"><h3>Revisión de respuestas</h3>';
    D.screens.forEach(function (d, i) {
      if (d.tipo !== 'pregunta') return;
      var q = D.preguntas[d.qn], sec = screens[i], ch = st.a[q.id];
      var ops = []; [].forEach.call(sec.querySelectorAll('.opt'), function (o) { ops[+o.getAttribute('data-k')] = o.querySelector('span').textContent; }); // por índice original, no por posición
      var ok = ch === q.correcta;
      out += '<div class="ri ' + (ok ? 'ok' : 'bad') + '"><b>' + (d.qn + 1) + '. ' + sec.querySelector('h2').textContent.replace(/</g, '&lt;') + '</b>' +
        '<span>Tu respuesta: ' + (ch === undefined ? 'sin responder' : String(ops[ch]).replace(/</g, '&lt;')) + (ok ? ' ✓' : ' ✗') + '</span>' +
        (ok ? '' : '<span>Correcta: ' + String(ops[q.correcta]).replace(/</g, '&lt;') + '</span>') +
        (q.retro ? '<small>' + String(q.retro).replace(/</g, '&lt;') + '</small>' : '') + '</div>';
    });
    return out + '</div>';
  }

  /* ---------- app móvil: una idea por pantalla (sección 13) ----------
     En móvil (< 576 px) cada lección de bloques se pagina en «unidades»: un encabezado se pega al bloque que le sigue, cada bloque es una unidad,
     y los objetos con equivalencia propia (texto largo, pestañas, tabla…) traen sus .mv-step ya armados en el empaquetado. */
  var MQ = window.matchMedia ? window.matchMedia('(max-width:575px)') : { matches: false };
  var EDIT = /[#&]edit/.test(location.hash); // el lienzo del editor muestra todo seguido
  if (EDIT) document.documentElement.classList.add('ed');
  function mvOn(i) { return !EDIT && MQ.matches && D.screens[i] && D.screens[i].tipo === 'bloques'; }
  function mvBuild(sec) {
    var units = [], pend = [];
    $$(sec, '.blk').forEach(function (blk) {
      var mv = blk.getAttribute('data-mv'), steps = $$(blk, '.mv-step');
      if (mv === 'titulo_de_tarjeta') { pend.push(blk); return; }
      if (mv === 'salto_de_pantalla' && !blk.querySelector('[data-cont]')) { if (pend.length) { units.push({ els: pend }); pend = []; } return; }
      var els = pend.concat([blk]); pend = [];
      if (steps.length) steps.forEach(function (s, n) { units.push({ els: n === 0 ? els.concat([s]) : [blk, s], blk: blk, step: s, last: n === steps.length - 1 }); });
      else units.push({ els: els, blk: blk, last: true });
    });
    if (pend.length) units.push({ els: pend });
    return units;
  }
  function mvState(i) { return mvOn(i) && screens[i]._mv && screens[i]._mv.units.length ? screens[i]._mv : null; }
  function mvUnitDone(u) { return !scorm || !u.blk || !u.last || !u.blk.classList.contains('is-inter') || u.blk.classList.contains('done'); }
  function mvShow(i) {
    var sec = screens[i], m = sec._mv; if (!m) return;
    $$(sec, '.mv-cur').forEach(function (x) { x.classList.remove('mv-cur'); });
    var u = m.units[m.k]; u.els.forEach(function (x) { x.classList.add('mv-cur'); });
    sec.classList.add('mv-paged');
    if (u.step && u.step.getAttribute('data-mvdone') && u.blk && u.blk.getAttribute('data-i') !== null) markBlock(sec, i, u.blk.getAttribute('data-i'));
  }
  function mvPrepare(i, fromEnd) {
    var sec = screens[i];
    if (!mvOn(i)) { sec.classList.remove('mv-paged'); $$(sec, '.mv-cur').forEach(function (x) { x.classList.remove('mv-cur'); }); delete sec._mv; return; }
    var units = mvBuild(sec); sec._mv = { units: units, k: fromEnd ? Math.max(0, units.length - 1) : 0 };
    mvShow(i);
  }
  function mvStep(d) {
    var m = mvState(cur); if (!m) return false;
    var k = m.k + d; if (k < 0 || k >= m.units.length) return false;
    if (d > 0 && !mvUnitDone(m.units[m.k])) return true;
    m.k = k; mvShow(cur); refreshNav(); window.scrollTo(0, 0); return true;
  }
  var mvInfo = document.createElement('div'); mvInfo.id = 'mvInfo'; mvInfo.setAttribute('aria-live', 'polite');
  var navEl = document.getElementById('nav'); navEl.insertBefore(mvInfo, btnNext);
  var topEl = document.querySelector('.top'), ttlEl = topEl.querySelector('.ttl'), ttlCurso = ttlEl.textContent;
  var xBtn = document.createElement('button'); xBtn.type = 'button'; xBtn.className = 'mv-x'; xBtn.setAttribute('aria-label', 'Salir del curso'); xBtn.textContent = '✕';
  xBtn.addEventListener('click', function () { exit(); try { window.close(); } catch (e) { /* nada */ } }); topEl.insertBefore(xBtn, ttlEl);
  function mvChange() { screens.forEach(function (sec, i) { sec.classList.remove('mv-paged'); delete sec._mv; $$(sec, '.mv-cur').forEach(function (x) { x.classList.remove('mv-cur'); }); }); show(cur, true); }
  if (MQ.addEventListener) MQ.addEventListener('change', mvChange); else if (MQ.addListener) MQ.addListener(mvChange);

  /* ---------- navegación ---------- */
  function refreshNav() {
    var m = mvState(cur), n = m ? m.units.length : 1, k = m ? m.k : 0, last = cur === screens.length - 1 && (!m || k === n - 1);
    btnPrev.disabled = cur === 0 && k === 0;
    btnNext.hidden = last;
    btnNext.disabled = m && k < n - 1 ? !mvUnitDone(m.units[k]) : !isComplete(cur);
    document.getElementById('nav').hidden = cur === 0;
    counter.textContent = cur === 0 ? '' : (m ? 'Paso ' + (k + 1) + ' de ' + n : 'Pantalla ' + (cur + 1) + ' de ' + screens.length);
    bar.style.width = (((cur + (m ? (k + 1) / n : 1)) * 100) / screens.length) + '%';
    if (m) { var dots = ''; if (n <= 10) for (var q = 0; q < n; q++) dots += '<i' + (q === k ? ' class="on"' : '') + '></i>'; mvInfo.innerHTML = '<span class="mv-dots" aria-hidden="true">' + dots + '</span><span class="mv-lbl">Paso ' + (k + 1) + ' de ' + n + '</span>'; }
    else mvInfo.innerHTML = '';
    var h2 = screens[cur].querySelector('h2'); ttlEl.textContent = m && h2 ? h2.textContent : ttlCurso;
  }
  function show(i, silent, fromEnd) {
    if (i < 0 || i >= screens.length) return;
    cur = i;
    mvPrepare(i, fromEnd);
    screens.forEach(function (s, k) {
      var on = k === i;
      s.hidden = !on;
      if (on) { s.classList.remove('run'); void s.offsetWidth; s.classList.add('run'); }
    });
    var d = D.screens[i];
    if (d.tipo === 'cierre') paintClosing(screens[i]);
    refreshNav();
    if (!silent) save();
    window.scrollTo(0, 0);
    var h = screens[i].querySelector('h1,h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  /* ---------- salida ---------- */
  function exit() {
    if (!scorm || Scorm.isFinished()) return;
    var status = Scorm.get('cmi.core.lesson_status');
    var done = status === 'passed' || status === 'failed' || status === 'completed';
    Scorm.set('cmi.core.session_time', timespan(Date.now() - startTime));
    Scorm.set('cmi.core.exit', done ? '' : 'suspend');
    save();
    Scorm.finish();
  }

  /* ---------- init ---------- */
  screens.forEach(function (sec, i) {
    var d = D.screens[i];
    if (d.tipo === 'acordeon') setupAccordion(sec, i);
    if (d.tipo === 'bloques') setupBloques(sec, i);
    if (d.tipo === 'pregunta') setupQuestion(sec, d);
  });
  var startBtn = document.getElementById('start'); if (startBtn) startBtn.addEventListener('click', function () { show(1); });
  btnPrev.addEventListener('click', function () { if (mvStep(-1)) return; show(cur - 1, false, true); });
  btnNext.addEventListener('click', function () { if (mvStep(1)) return; if (isComplete(cur)) show(cur + 1); });
  document.querySelector('.reintentar').addEventListener('click', function () {
    D.preguntas.forEach(function (q) { delete st.a[q.id]; });
    st.fin = 0; applySubset(); shuffleAll(); save();
    screens.forEach(function (sec, i) { if (D.screens[i].tipo === 'pregunta') paintQuestion(sec, D.screens[i]); });
    var first = 0;
    D.screens.forEach(function (d, i) { if (!first && d.tipo === 'pregunta') first = i; });
    Scorm.set('cmi.core.lesson_status', 'incomplete');
    show(first);
  });

  /* ---------- navegación táctil y por teclado (respeta el bloqueo de pantallas) ---------- */
  (function () {
    var x0 = 0, y0 = 0, t0 = 0, on = false;
    var main = document.getElementById('stage');
    main.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { on = false; return; }
      var t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); on = true;
    }, { passive: true });
    main.addEventListener('touchend', function (e) {
      if (!on) return; on = false;
      var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (Date.now() - t0 > 700 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      if (String(window.getSelection && window.getSelection()).length) return; // no interferir con selección de texto
      if (dx < 0) { if (cur > 0 && !btnNext.hidden && !btnNext.disabled) btnNext.click(); }
      else if (cur > 1) btnPrev.click();
    }, { passive: true });
    document.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) return;
      if (e.key === 'ArrowRight' && !btnNext.hidden && !btnNext.disabled && cur > 0) { e.preventDefault(); btnNext.click(); }
      else if (e.key === 'ArrowLeft' && cur > 1) { e.preventDefault(); btnPrev.click(); }
    });
  })();

  scorm = Scorm.init();
  if (scorm) {
    var status = Scorm.get('cmi.core.lesson_status');
    if (status === 'not attempted' || status === '') Scorm.set('cmi.core.lesson_status', 'incomplete');
    if (Scorm.get('cmi.core.entry') === 'resume') {
      try { var sd = JSON.parse(Scorm.get('cmi.suspend_data') || '{}'); if (sd && sd.a) st = { a: sd.a, v: sd.v || {}, t: sd.t || 0, fin: sd.fin || 0, sd: sd.sd || 0 }; } catch (e) {}
      var loc = parseInt(Scorm.get('cmi.core.lesson_location'), 10);
      if (!isNaN(loc) && loc >= 0 && loc < screens.length) cur = loc;
    }
  }
  applySubset(); if (cur >= screens.length) cur = screens.length - 1;
  if (!scorm) { var hm = /#p=(\d+)/.exec(location.hash); if (hm) cur = Math.min(+hm[1], screens.length - 1); }
  screens.forEach(function (sec, i) {
    var d = D.screens[i];
    if (d.tipo === 'acordeon') restoreAccordion(sec, i);
    if (d.tipo === 'bloques') restoreBloques(sec, i);
    if (d.tipo === 'pregunta') paintQuestion(sec, d);
  });
  shuffleAll();
  show(cur, true);
  Scorm.commit();

  window.addEventListener('pagehide', exit);
  window.addEventListener('beforeunload', exit);
})();
