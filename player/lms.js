/* Emulador de LMS SCORM 1.2 (API + modelo de datos + comprobaciones de ejecución).
   Sin dependencias del DOM: se usa en el player y se puede probar en Node. */
(function (root) {
  'use strict';

  var ERR = {
    0: 'No error', 101: 'General exception', 201: 'Invalid argument error', 202: 'Element cannot have children',
    203: 'Element not an array - cannot have count', 301: 'Not initialized', 401: 'Not implemented error',
    402: 'Invalid set value, element is a keyword', 403: 'Element is read only', 404: 'Element is write only',
    405: 'Incorrect data type'
  };
  var STATUS = ['passed', 'completed', 'failed', 'incomplete', 'browsed', 'not attempted'];
  var EXITS = ['time-out', 'suspend', 'logout', ''];
  var ITYPES = ['true-false', 'choice', 'fill-in', 'matching', 'performance', 'sequencing', 'likert', 'numeric'];
  var IRESULTS = ['correct', 'wrong', 'unanticipated', 'neutral'];
  var SUSPEND_LIMIT = 4096;

  var isTimespan = function (v) { return /^\d{2,4}:\d{2}:\d{2}(\.\d{1,2})?$/.test(v) && +v.split(':')[1] < 60 && parseFloat(v.split(':')[2]) < 60; };
  var isDecimal = function (v) { return /^-?\d+(\.\d+)?$/.test(v); };
  var isScore = function (v) { return v === '' || (isDecimal(v) && +v >= 0 && +v <= 100); };
  var isTime = function (v) { return /^\d{2}:\d{2}:\d{2}(\.\d{1,2})?$/.test(v); };
  function toSec(ts) { var p = ts.split(':'); return (+p[0]) * 3600 + (+p[1]) * 60 + parseFloat(p[2]); }
  function fromSec(s) {
    var h = Math.floor(s / 3600); s -= h * 3600; var m = Math.floor(s / 60); s -= m * 60;
    var pad = function (n, l) { n = String(n); while (n.length < l) n = '0' + n; return n; };
    return pad(h, 4) + ':' + pad(m, 2) + ':' + s.toFixed(2).padStart(5, '0');
  }

  // Elementos escalares: [lectura, escritura, validador(valor)->bool, descripción de tipo]
  var SCALAR = {
    'cmi.core._children': { r: 1, w: 0, keyword: 1 },
    'cmi.core.student_id': { r: 1, w: 0 },
    'cmi.core.student_name': { r: 1, w: 0 },
    'cmi.core.lesson_location': { r: 1, w: 1, v: function (v) { return v.length <= 255; } },
    'cmi.core.credit': { r: 1, w: 0 },
    'cmi.core.lesson_status': { r: 1, w: 1, v: function (v) { return STATUS.indexOf(v) >= 0; } },
    'cmi.core.entry': { r: 1, w: 0 },
    'cmi.core.score._children': { r: 1, w: 0, keyword: 1 },
    'cmi.core.score.raw': { r: 1, w: 1, v: isScore },
    'cmi.core.score.max': { r: 1, w: 1, v: isScore },
    'cmi.core.score.min': { r: 1, w: 1, v: isScore },
    'cmi.core.total_time': { r: 1, w: 0 },
    'cmi.core.lesson_mode': { r: 1, w: 0 },
    'cmi.core.exit': { r: 0, w: 1, v: function (v) { return EXITS.indexOf(v) >= 0; } },
    'cmi.core.session_time': { r: 0, w: 1, v: isTimespan },
    'cmi.suspend_data': { r: 1, w: 1, v: function (v) { return v.length <= SUSPEND_LIMIT; }, limit: SUSPEND_LIMIT },
    'cmi.launch_data': { r: 1, w: 0 },
    'cmi.comments': { r: 1, w: 1, v: function (v) { return v.length <= 4096; } },
    'cmi.comments_from_lms': { r: 1, w: 0 },
    'cmi.student_data._children': { r: 1, w: 0, keyword: 1 },
    'cmi.student_data.mastery_score': { r: 1, w: 0 },
    'cmi.student_data.max_time_allowed': { r: 1, w: 0 },
    'cmi.student_data.time_limit_action': { r: 1, w: 0 },
    'cmi.student_preference._children': { r: 1, w: 0, keyword: 1 },
    'cmi.student_preference.audio': { r: 1, w: 1, v: isDecimal },
    'cmi.student_preference.language': { r: 1, w: 1 },
    'cmi.student_preference.speed': { r: 1, w: 1, v: isDecimal },
    'cmi.student_preference.text': { r: 1, w: 1, v: isDecimal },
    'cmi.objectives._children': { r: 1, w: 0, keyword: 1 },
    'cmi.interactions._children': { r: 1, w: 0, keyword: 1 }
  };
  var CHILDREN = {
    'cmi.core._children': 'student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,lesson_mode,exit,session_time',
    'cmi.core.score._children': 'raw,min,max',
    'cmi.student_data._children': 'mastery_score,max_time_allowed,time_limit_action',
    'cmi.student_preference._children': 'audio,language,speed,text',
    'cmi.objectives._children': 'id,score,status',
    'cmi.interactions._children': 'id,objectives,time,type,correct_responses,weighting,student_response,result,latency'
  };

  function freshModel(student, mastery) {
    return {
      student: student,
      v: {
        'cmi.core.student_id': student.id, 'cmi.core.student_name': student.name, 'cmi.core.lesson_location': '',
        'cmi.core.credit': 'credit', 'cmi.core.lesson_status': 'not attempted', 'cmi.core.entry': 'ab-initio',
        'cmi.core.score.raw': '', 'cmi.core.score.max': '', 'cmi.core.score.min': '', 'cmi.core.total_time': '0000:00:00.00',
        'cmi.core.lesson_mode': 'normal', 'cmi.suspend_data': '', 'cmi.launch_data': '', 'cmi.comments': '',
        'cmi.comments_from_lms': '', 'cmi.student_data.mastery_score': mastery == null ? '' : String(mastery),
        'cmi.student_data.max_time_allowed': '', 'cmi.student_data.time_limit_action': '',
        'cmi.student_preference.audio': '0', 'cmi.student_preference.language': '', 'cmi.student_preference.speed': '0',
        'cmi.student_preference.text': '0'
      },
      exit: '', sessionTime: '', interactions: [], attempts: 0
    };
  }

  function createLms(opts) {
    opts = opts || {};
    var log = [];
    var onLog = opts.onLog || function () {};
    var mastery = opts.mastery == null ? null : opts.mastery;
    var students = [{ id: 'alumno-001', name: 'Rivera, Ana' }, { id: 'alumno-002', name: 'Gómez, Luis' }, { id: 'alumno-003', name: 'Ortiz, Marta' }];
    var sIdx = 0;
    var model = freshModel(students[0], mastery);
    var att; // estado del intento actual
    var errCode = 0;
    var t0 = Date.now();

    function newAttempt() {
      att = { initialized: false, finished: false, calls: 0, order: [], violations: [], commits: 0, sets: 0, maxSuspend: 0, statusAtFinish: null, scoreAtFinish: null, finalSession: null, rejectedSuspend: false, apiSeen: false };
    }
    newAttempt();

    function rec(fn, el, val, ret, code) {
      var e = { t: Date.now() - t0, time: new Date().toLocaleTimeString('es-MX', { hour12: false }), fn: fn, el: el == null ? '' : el, val: val == null ? '' : val, ret: ret, err: code };
      log.push(e); onLog(e); return e;
    }
    function fail(code) { errCode = code; return code; }
    function viol(msg) { if (att.violations.indexOf(msg) < 0) att.violations.push(msg); }

    function interactionIndex(el) { var m = /^cmi\.interactions\.(\d+)\.(.+)$/.exec(el); return m ? { n: +m[1], rest: m[2] } : null; }

    function getV(el) {
      if (el === 'cmi.interactions._count') return String(model.interactions.length);
      if (el === 'cmi.objectives._count') return '0';
      if (CHILDREN[el]) return CHILDREN[el];
      return model.v[el];
    }

    var api = {
      LMSInitialize: function (p) {
        att.apiSeen = true; att.calls++;
        var ret, code = 0;
        if (p !== '') { ret = 'false'; code = fail(201); }
        else if (att.initialized) { ret = 'false'; code = fail(101); viol('LMSInitialize llamado más de una vez'); }
        else if (att.finished) { ret = 'false'; code = fail(101); }
        else {
          att.initialized = true; ret = 'true'; errCode = 0;
          model.attempts++;
          att.order.push('init');
        }
        rec('LMSInitialize', '', p, ret, code); return ret;
      },
      LMSFinish: function (p) {
        att.apiSeen = true; att.calls++;
        var ret, code = 0;
        if (!att.initialized) { ret = 'false'; code = fail(301); viol('LMSFinish llamado sin LMSInitialize previo'); }
        else if (att.finished) { ret = 'false'; code = fail(301); viol('LMSFinish llamado más de una vez'); }
        else {
          att.finished = true; att.initialized = false; ret = 'true'; errCode = 0;
          att.order.push('finish');
          att.statusAtFinish = model.v['cmi.core.lesson_status'];
          att.scoreAtFinish = model.v['cmi.core.score.raw'];
          att.finalSession = model.sessionTime;
          if (model.sessionTime) model.v['cmi.core.total_time'] = fromSec(toSec(model.v['cmi.core.total_time']) + toSec(model.sessionTime));
          if (model.exit === 'suspend') model.v['cmi.core.entry'] = 'resume';
          else { model.v['cmi.core.entry'] = 'ab-initio'; model.v['cmi.suspend_data'] = ''; model.v['cmi.core.lesson_location'] = ''; }
        }
        rec('LMSFinish', '', p, ret, code); return ret;
      },
      LMSGetValue: function (el) {
        att.apiSeen = true; att.calls++;
        var ret = '', code = 0;
        if (!att.initialized) { code = fail(301); viol('LMSGetValue llamado fuera de una sesión inicializada'); }
        else {
          errCode = 0;
          var ix = interactionIndex(el);
          if (/^cmi\.objectives\.\d+\./.test(el)) code = fail(401);
          else if (ix) code = fail(404);
          else if (/_count$/.test(el) && el !== 'cmi.interactions._count' && el !== 'cmi.objectives._count') code = fail(203);
          else if (/_children$/.test(el) && !CHILDREN[el]) code = fail(202);
          else {
            var def = SCALAR[el];
            if (!def && el !== 'cmi.interactions._count' && el !== 'cmi.objectives._count') code = fail(/^cmi\./.test(el) ? 201 : 201);
            else if (def && !def.r) code = fail(404);
            else ret = getV(el);
          }
        }
        rec('LMSGetValue', el, ret, ret, code); return ret;
      },
      LMSSetValue: function (el, val) {
        att.apiSeen = true; att.calls++; att.sets++;
        var ret = 'false', code = 0;
        val = val == null ? '' : String(val);
        if (!att.initialized) { code = fail(301); viol('LMSSetValue llamado fuera de una sesión inicializada'); }
        else {
          errCode = 0;
          var ix = interactionIndex(el);
          if (ix) code = setInteraction(ix, val);
          else if (/^cmi\.objectives\./.test(el)) code = fail(el.indexOf('_children') > 0 || el.indexOf('_count') > 0 ? 402 : 401);
          else if (el === 'cmi.interactions._count' || el === 'cmi.objectives._count') code = fail(402);
          else {
            var def = SCALAR[el];
            if (!def) code = fail(201);
            else if (def.keyword) code = fail(402);
            else if (!def.w) code = fail(403);
            else if (def.v && !def.v(val)) {
              if (def.limit) { att.rejectedSuspend = true; viol('cmi.suspend_data excede ' + def.limit + ' caracteres (' + val.length + ')'); }
              code = fail(405);
            } else {
              if (el === 'cmi.core.exit') model.exit = val;
              else if (el === 'cmi.core.session_time') model.sessionTime = val;
              else model.v[el] = val;
              if (el === 'cmi.suspend_data') att.maxSuspend = Math.max(att.maxSuspend, val.length);
              ret = 'true';
            }
          }
          if (code) ret = 'false';
          else ret = 'true';
        }
        rec('LMSSetValue', el, val, ret, code); return ret;
      },
      LMSCommit: function (p) {
        att.apiSeen = true; att.calls++;
        var ret, code = 0;
        if (!att.initialized) { ret = 'false'; code = fail(301); viol('LMSCommit llamado fuera de una sesión inicializada'); }
        else if (p !== '') { ret = 'false'; code = fail(201); }
        else { ret = 'true'; errCode = 0; att.commits++; }
        rec('LMSCommit', '', p, ret, code); return ret;
      },
      LMSGetLastError: function () { return String(errCode); },
      LMSGetErrorString: function (c) { return ERR[+c] || ''; },
      LMSGetDiagnostic: function (c) { return (ERR[+(c === '' || c == null ? errCode : c)] || '') + (c === '' || c == null ? '' : ''); }
    };

    function setInteraction(ix, val) {
      var n = ix.n, rest = ix.rest;
      if (n > model.interactions.length) return fail(201);
      var simple = ['id', 'time', 'type', 'weighting', 'student_response', 'result', 'latency'];
      var rm = /^(objectives|correct_responses)\.(\d+)\.(id|pattern)$/.exec(rest);
      if (simple.indexOf(rest) < 0 && !rm) return fail(201);
      if (rest === 'type' && ITYPES.indexOf(val) < 0) return fail(405);
      if (rest === 'result' && IRESULTS.indexOf(val) < 0 && !isDecimal(val)) return fail(405);
      if (rest === 'time' && !isTime(val)) return fail(405);
      if (rest === 'latency' && !isTimespan(val)) return fail(405);
      if (rest === 'weighting' && !isDecimal(val)) return fail(405);
      if (rest === 'id' && val.length > 255) return fail(405);
      if (n === model.interactions.length) model.interactions.push({});
      model.interactions[n][rest] = val;
      return 0;
    }

    function evaluate(closed) {
      var out = [], add = function (l, m) { out.push({ level: l, msg: m }); };
      if (!att.apiSeen) {
        add(closed ? 'error' : 'warn', closed ? 'El curso nunca llamó a la API (¿no encontró window.API?)' : 'Aún no hay llamadas a la API');
        return out;
      }
      add(att.order.indexOf('init') >= 0 ? 'ok' : 'error', att.order.indexOf('init') >= 0 ? 'LMSInitialize llamado antes que cualquier otra función' : 'No se llamó a LMSInitialize');
      if (att.violations.length) att.violations.forEach(function (v) { add('error', v); });
      else add('ok', 'Orden de llamadas correcto (sin llamadas fuera de sesión)');
      if (att.finished) add('ok', 'LMSFinish llamado al cerrar');
      else add(closed ? 'error' : 'warn', closed ? 'El curso se cerró sin llamar a LMSFinish' : 'LMSFinish aún no llamado (se evalúa al cerrar el curso)');
      if (att.finished) {
        var st = att.statusAtFinish, sc = att.scoreAtFinish;
        var done = st === 'passed' || st === 'failed' || st === 'completed';
        if (done) add('ok', 'Estado final reportado: ' + st);
        else add('warn', 'Salió con estado "' + st + '" (normal si el alumno cerró a la mitad; incorrecto si terminó el curso)');
        if (mastery != null) {
          if (sc !== '' && sc != null) add('ok', 'Puntaje reportado: ' + sc + ' (mínimo ' + mastery + ')');
          else add(done ? 'error' : 'warn', 'No se reportó cmi.core.score.raw' + (done ? ' pese a haber terminado' : ''));
        }
        if (model.exit === 'suspend' && !model.v['cmi.suspend_data']) add('warn', 'exit=suspend pero sin suspend_data: no podrá reanudar con detalle');
      }
      if (att.commits === 0 && att.sets > 0) add('warn', 'Nunca se llamó a LMSCommit (se pierden datos si la ventana se cierra a la fuerza)');
      if (att.rejectedSuspend) add('error', 'suspend_data superó el límite de ' + SUSPEND_LIMIT + ' caracteres');
      else add('ok', 'suspend_data dentro del límite (máx. usado: ' + att.maxSuspend + ' / ' + SUSPEND_LIMIT + ')');
      return out;
    }

    return {
      api: api,
      getLog: function () { return log; },
      clearLog: function () { log.length = 0; },
      getModel: function () {
        var rows = {}; Object.keys(model.v).forEach(function (k) { rows[k] = model.v[k]; });
        Object.keys(CHILDREN).forEach(function (k) { rows[k] = CHILDREN[k]; });
        rows['cmi.interactions._count'] = String(model.interactions.length);
        model.interactions.forEach(function (it, n) { Object.keys(it).forEach(function (k) { rows['cmi.interactions.' + n + '.' + k] = it[k]; }); });
        rows['(interno) cmi.core.exit'] = model.exit; rows['(interno) cmi.core.session_time'] = model.sessionTime;
        return rows;
      },
      student: function () { return model.student; },
      attempt: function () { return att; },
      /* Llamar cuando el curso se descarga (iframe cerrado). */
      closeAttempt: function () { var r = evaluate(true); return r; },
      evaluate: function () { return evaluate(false); },
      /* Nuevo intento sobre el mismo alumno (conserva datos, cambia entry según exit). */
      beginAttempt: function () {
        if (att.initialized && !att.finished) { api.LMSFinish(''); }
        newAttempt();
      },
      /* Reiniciar intento: borra todo el progreso del alumno actual. */
      resetStudent: function () { model = freshModel(students[sIdx], mastery); newAttempt(); errCode = 0; },
      /* Simular alumno distinto: otro modelo limpio. */
      nextStudent: function () { sIdx = (sIdx + 1) % students.length; model = freshModel(students[sIdx], mastery); newAttempt(); errCode = 0; return model.student; },
      setMastery: function (m) { mastery = m == null ? null : m; model.v['cmi.student_data.mastery_score'] = m == null ? '' : String(m); },
      errorString: function (c) { return ERR[+c] || ''; }
    };
  }

  var exp = { createLms: createLms, SUSPEND_LIMIT: SUSPEND_LIMIT };
  if (typeof module !== 'undefined' && module.exports) module.exports = exp; else root.LmsEmu = exp;
})(typeof window !== 'undefined' ? window : globalThis);
