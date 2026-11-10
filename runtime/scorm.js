/* Conector con el LMS. El curso habla siempre "SCORM 1.2" (cmi.core.*) y este archivo lo traduce según el formato publicado:
   scorm12 (API), scorm2004 (API_1484_11), xapi (sentencias a un LRS con los parámetros de lanzamiento) o web (solo guarda el avance en el navegador). */
var Scorm = (function () {
  var D = window.CURSO_DATA || {}, fmt = D.formato || 'scorm12';
  var B = null, inited = false, finished = false;

  function find(win, name) {
    var n = 0;
    while (win && !win[name] && win.parent && win.parent !== win && n < 500) { n++; win = win.parent; }
    return (win && win[name]) || null;
  }
  function locate(name) {
    var a = find(window, name);
    if (!a && window.opener) { try { a = find(window.opener, name); } catch (e) {} }
    return a;
  }
  function pad(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
  /* "0000:05:03.20" (SCORM 1.2) -> "PT0H5M3S" (ISO 8601) */
  function iso(ts) {
    var m = /^(\d+):(\d+):(\d+)/.exec(String(ts || ''));
    return m ? 'PT' + (+m[1]) + 'H' + (+m[2]) + 'M' + (+m[3]) + 'S' : 'PT0S';
  }

  /* ---------- SCORM 1.2 ---------- */
  function B12() {
    var api = null;
    function err(fn) { if (!api) return; var c = api.LMSGetLastError(); if (String(c) !== '0' && window.console) console.warn('[SCORM] ' + fn + ' error ' + c + ': ' + api.LMSGetErrorString(c)); }
    return {
      init: function () {
        api = locate('API');
        if (!api) { if (window.console) console.warn('[SCORM] API no encontrada: modo independiente'); return false; }
        var ok = String(api.LMSInitialize('')) === 'true'; if (!ok) err('LMSInitialize'); return ok;
      },
      get: function (k) { var v = api.LMSGetValue(k); err('LMSGetValue(' + k + ')'); return v; },
      set: function (k, v) { var r = String(api.LMSSetValue(k, String(v))) === 'true'; if (!r) err('LMSSetValue(' + k + ')'); return r; },
      commit: function () { var r = String(api.LMSCommit('')) === 'true'; if (!r) err('LMSCommit'); return r; },
      finish: function () { var r = String(api.LMSFinish('')) === 'true'; if (!r) err('LMSFinish'); return r; }
    };
  }

  /* ---------- SCORM 2004 (4.ª edición): se traducen las claves de 1.2 ---------- */
  function B2004() {
    var api = null;
    function err(fn) { if (!api) return; var c = api.GetLastError(); if (String(c) !== '0' && window.console) console.warn('[SCORM 2004] ' + fn + ' error ' + c + ': ' + api.GetErrorString(c)); }
    function put(k, v) { var r = String(api.SetValue(k, String(v))) === 'true'; if (!r) err('SetValue(' + k + ')'); return r; }
    var DIRECT = { 'cmi.core.student_name': 'cmi.learner_name', 'cmi.core.student_id': 'cmi.learner_id', 'cmi.core.lesson_location': 'cmi.location', 'cmi.core.entry': 'cmi.entry', 'cmi.core.score.min': 'cmi.score.min', 'cmi.core.score.max': 'cmi.score.max' };
    return {
      init: function () {
        api = locate('API_1484_11');
        if (!api) { if (window.console) console.warn('[SCORM 2004] API no encontrada: modo independiente'); return false; }
        var ok = String(api.Initialize('')) === 'true'; if (!ok) err('Initialize'); return ok;
      },
      get: function (k) {
        if (k === 'cmi.core.lesson_status') {
          var ss = api.GetValue('cmi.success_status'), cs = api.GetValue('cmi.completion_status');
          if (ss === 'passed' || ss === 'failed') return ss;
          return cs === 'completed' ? 'completed' : cs === 'incomplete' ? 'incomplete' : 'not attempted';
        }
        var kk = DIRECT[k] || k, v = api.GetValue(kk); err('GetValue(' + kk + ')'); return v;
      },
      set: function (k, v) {
        var m;
        if (k === 'cmi.core.lesson_status') {
          if (v === 'passed' || v === 'failed') return put('cmi.completion_status', 'completed') && put('cmi.success_status', v);
          if (v === 'completed') return put('cmi.completion_status', 'completed');
          if (v === 'incomplete') return put('cmi.completion_status', 'incomplete') && put('cmi.success_status', 'unknown');
          return true;
        }
        if (k === 'cmi.core.score.raw') return put('cmi.score.raw', v) && put('cmi.score.scaled', Math.max(-1, Math.min(1, (+v || 0) / 100)).toFixed(2));
        if (k === 'cmi.core.exit') return put('cmi.exit', v === '' ? 'normal' : v);
        if (k === 'cmi.core.session_time') return put('cmi.session_time', iso(v));
        if ((m = /^cmi\.interactions\.(\d+)\.(.+)$/.exec(k))) {
          var f = m[2] === 'student_response' ? 'learner_response' : m[2], val = (m[2] === 'result' && v === 'wrong') ? 'incorrect' : v;
          return put('cmi.interactions.' + m[1] + '.' + f, val);
        }
        return put(DIRECT[k] || k, v);
      },
      commit: function () { var r = String(api.Commit('')) === 'true'; if (!r) err('Commit'); return r; },
      finish: function () { var r = String(api.Terminate('')) === 'true'; if (!r) err('Terminate'); return r; }
    };
  }

  /* ---------- almacén local (avance en el navegador); lo usan "web" y "xapi" ---------- */
  function Local(name, hook) {
    var key = 'gsb:' + (D.id || 'curso') + ':' + name, d = {}, ls = null, entry = 'ab-initio';
    try { ls = window.localStorage; ls.setItem('gsb:t', '1'); ls.removeItem('gsb:t'); } catch (e) { ls = null; }
    function persist() { try { if (ls) ls.setItem(key, JSON.stringify(d)); } catch (e) {} }
    return {
      d: function () { return d; },
      init: function (who) {
        var raw = null; try { raw = ls && ls.getItem(key); } catch (e) {}
        try { d = raw ? JSON.parse(raw) : {}; } catch (e) { d = {}; }
        if (d['cmi.core.exit'] === 'suspend') entry = 'resume'; else d = {};
        d['cmi.core.exit'] = '';
        if (who) d['cmi.core.student_name'] = who;
        persist(); return true;
      },
      get: function (k) { if (k === 'cmi.core.entry') return entry; var v = d[k]; return v == null ? (k === 'cmi.core.lesson_status' ? 'not attempted' : '') : v; },
      set: function (k, v) { d[k] = String(v); if (hook && hook.set) hook.set(k, String(v), d); return true; },
      commit: function () { persist(); return true; },
      finish: function () { persist(); if (hook && hook.finish) hook.finish(d); return true; }
    };
  }
  function BWeb() { return Local('web', null); }

  /* ---------- xAPI: el LRS llega en los parámetros de lanzamiento (endpoint, auth, actor) ---------- */
  function BXapi() {
    var q = {}, sent = {};
    String(location.search || '').replace(/^\?/, '').split('&').forEach(function (p) { if (!p) return; var i = p.indexOf('='); try { q[decodeURIComponent(p.slice(0, i < 0 ? p.length : i))] = i < 0 ? '' : decodeURIComponent(p.slice(i + 1).replace(/\+/g, ' ')); } catch (e) {} });
    var ep = (q.endpoint || '').replace(/\/+$/, ''), actor = null;
    try { actor = JSON.parse(q.actor || ''); } catch (e) {}
    if (actor && actor.name instanceof Array) actor.name = actor.name[0];
    var act = q.activity_id || ('urn:generador-scorm:' + String(D.id || 'curso')), VB = 'http://adlnet.gov/expapi/verbs/';
    function stmt(verb, result, obj) {
      var s = { actor: actor, verb: { id: VB + verb, display: { 'en-US': verb } }, timestamp: new Date().toISOString(),
        object: obj || { objectType: 'Activity', id: act, definition: { type: 'http://adlnet.gov/expapi/activities/course', name: { es: D.titulo || '' } } } };
      if (result) s.result = result;
      if (q.registration) s.context = { registration: q.registration };
      var h = { 'Content-Type': 'application/json', 'X-Experience-API-Version': '1.0.3' }; if (q.auth) h.Authorization = q.auth;
      try {
        if (window.fetch) { fetch(ep + '/statements', { method: 'POST', headers: h, body: JSON.stringify(s), keepalive: true }).then(function () {}, function () {}); return; }
        var x = new XMLHttpRequest(); x.open('POST', ep + '/statements', true); for (var k in h) x.setRequestHeader(k, h[k]); x.send(JSON.stringify(s));
      } catch (e) {}
    }
    var L = Local('xapi', {
      set: function (k, v, d) {
        var m;
        if (k === 'cmi.core.lesson_status' && !sent[v] && (v === 'passed' || v === 'failed' || v === 'completed')) {
          sent[v] = 1; var raw = d['cmi.core.score.raw'];
          var res = { completion: true }; if (v !== 'completed') { res.success = v === 'passed'; if (raw != null && raw !== '') res.score = { raw: +raw, min: 0, max: 100, scaled: (+raw) / 100 }; }
          stmt(v, res); if (v !== 'completed' && !sent.completed) { sent.completed = 1; stmt('completed', { completion: true }); }
        } else if (k === 'cmi.core.lesson_status' && v === 'incomplete') { sent.passed = sent.failed = 0; }
        else if ((m = /^cmi\.interactions\.(\d+)\.result$/.exec(k))) {
          var p = 'cmi.interactions.' + m[1] + '.', pat = d[p + 'correct_responses.0.pattern'];
          stmt('answered', { response: d[p + 'student_response'] || '', success: v === 'correct' },
            { objectType: 'Activity', id: act + '/pregunta/' + encodeURIComponent(d[p + 'id'] || m[1]), definition: { type: 'http://adlnet.gov/expapi/activities/cmi.interaction', interactionType: 'choice', correctResponsesPattern: pat ? [pat] : [] } });
        }
      },
      finish: function (d) { stmt('terminated', { duration: iso(d['cmi.core.session_time']) }); }
    });
    return {
      init: function () { if (!ep || !actor) { if (window.console) console.warn('[xAPI] sin endpoint/actor de lanzamiento: modo independiente'); return false; } L.init(actor.name || (actor.account && actor.account.name) || ''); stmt('initialized'); return true; },
      get: L.get, set: L.set, commit: L.commit, finish: L.finish
    };
  }

  function make() { return fmt === 'scorm2004' ? B2004() : fmt === 'xapi' ? BXapi() : fmt === 'web' ? BWeb() : B12(); }
  void pad;

  return {
    available: function () { return inited; },
    init: function () { B = make(); inited = fmt === 'web' ? B.init('') : B.init(); return inited; },
    get: function (k) { if (!B || !inited || finished) return ''; return B.get(k); },
    set: function (k, v) { if (!B || !inited || finished) return false; return B.set(k, v); },
    commit: function () { if (!B || !inited || finished) return false; return B.commit(); },
    finish: function () { if (!B || !inited || finished) return false; finished = true; return B.finish(); },
    isFinished: function () { return finished; }
  };
})();
