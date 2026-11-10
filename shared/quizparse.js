/* Convierte texto pegado en preguntas de opción múltiple (sin IA). UMD: Node y navegador.
   Formato admitido (flexible):
     1. ¿Pregunta?            (número + . o ) ; o una línea que termina en «?»)
     a) Opción                (letra + ) o . ; o guion «-»)
     *b) Opción correcta      (asterisco o «✓» al inicio, o «(correcta)» al final)
     Respuesta: b             (alternativa para marcar la correcta)
     Retro: explicación       (también «Retroalimentación:» o «Explicación:»)
*/
(function (root) {
  'use strict';
  var RE_Q = /^\s*(?:\d{1,3}\s*[.)\-:]|P\d{1,3}\s*[.):]|Pregunta\s*\d*\s*[.:)])\s*(.+)$/i;
  var RE_OPT = /^\s*([*✓✔]\s*)?(?:\(?([a-fA-F])[.)]\s+|[-•–]\s+)([*✓✔]\s*)?(.+)$/;
  var RE_ANS = /^\s*(?:respuesta(?:\s+correcta)?|correcta|clave)\s*[:=]\s*\(?([a-fA-F])\)?\s*\.?\s*$/i;
  var RE_RETRO = /^\s*(?:retro(?:alimentaci[oó]n)?|explicaci[oó]n|justificaci[oó]n)\s*:\s*(.+)$/i;

  function parse(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var qs = [], cur = null, warnings = [];
    function close() {
      if (!cur) return;
      cur.enunciado = cur.enunciado.trim();
      if (cur.opciones.length < 2) warnings.push('«' + cur.enunciado.slice(0, 40) + '…» tiene menos de 2 opciones y se omitió');
      else {
        if (cur.letra != null) cur.correcta = Math.max(0, 'abcdef'.indexOf(cur.letra.toLowerCase()));
        if (cur.correcta == null) { warnings.push('«' + cur.enunciado.slice(0, 40) + '…» no indica la respuesta correcta; se marcó la A'); cur.correcta = 0; }
        if (cur.correcta >= cur.opciones.length) cur.correcta = 0;
        qs.push({ enunciado: cur.enunciado, opciones: cur.opciones, correcta: cur.correcta, retroalimentacion: (cur.retro || '').trim() });
      }
      cur = null;
    }
    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      var m;
      if ((m = RE_RETRO.exec(line)) && cur) { cur.retro = m[1]; cur.inRetro = true; return; }
      if ((m = RE_ANS.exec(line)) && cur) { cur.letra = m[1]; return; }
      if ((m = RE_OPT.exec(line)) && cur && !cur.inRetro) {
        var txt = m[4].trim(), mark = !!(m[1] || m[3]);
        var tail = /\s*\((?:correcta|correct)\)\s*$/i;
        if (tail.test(txt)) { txt = txt.replace(tail, ''); mark = true; }
        var tick = /\s*[✓✔]\s*$/; if (tick.test(txt)) { txt = txt.replace(tick, ''); mark = true; }
        cur.opciones.push(txt);
        if (mark) cur.correcta = cur.opciones.length - 1;
        return;
      }
      if ((m = RE_Q.exec(line))) { close(); cur = { enunciado: m[1], opciones: [], correcta: null }; return; }
      if (/\?\s*$/.test(line) && (!cur || (cur.opciones.length >= 2 && !cur.inRetro) || (cur.inRetro && cur.opciones.length >= 2))) { close(); cur = { enunciado: line, opciones: [], correcta: null }; return; }
      if (cur) { // continuación de la línea anterior
        if (cur.inRetro) cur.retro += ' ' + line;
        else if (!cur.opciones.length) cur.enunciado += ' ' + line;
        else cur.opciones[cur.opciones.length - 1] += ' ' + line;
      } else if (/\?\s*$/.test(line)) cur = { enunciado: line, opciones: [], correcta: null };
    });
    close();
    return { preguntas: qs, warnings: warnings };
  }

  var API = { parse: parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.QuizParse = API;
})(typeof window !== 'undefined' ? window : globalThis);
