/* Limpia texto "sucio" (OCR, copiado de PDF, pegado) y lo convierte a Markdown con títulos y listas. Sin IA. UMD. */
(function (root) {
  'use strict';
  var BULLET = /^\s*([•·▪◦●○■□‣⁃∙*\-–—])\s+(.*)$/;
  var NUMLIST = /^\s*(\d{1,2})[.)]\s+(.*)$/;
  var PAGENUM = /^\s*(?:p[áa]g(?:ina)?\.?\s*)?\d{1,4}(?:\s*(?:de|\/)\s*\d{1,4})?\s*$/i;

  function fixChars(t) {
    return String(t || '').replace(/\r/g, '').replace(/ /g, ' ').replace(/[​­﻿]/g, '')
      .replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n')
      .replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'");
  }
  var isUpper = function (s) { var L = s.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, ''); return L.length >= 4 && L === L.toUpperCase(); };
  var endsSentence = function (s) { return /[.!?:;…)]\s*$/.test(s); };

  /* lineas -> párrafos: une saltos duros dentro de un párrafo y repara palabras cortadas con guion */
  function joinLines(lines) {
    var out = '';
    lines.forEach(function (l, i) {
      l = l.trim(); if (!l) return;
      if (!out) { out = l; return; }
      if (/[A-Za-zÁÉÍÓÚÑáéíóúñü]-$/.test(out) && /^[a-záéíóúñü]/.test(l)) out = out.slice(0, -1) + l; // pala-\nbra
      else out += ' ' + l;
    });
    return out;
  }

  /* titula: devuelve nivel 1..3 o 0 si no parece título */
  function headingLevel(line, nextLen, first) {
    var t = line.trim();
    if (t.length < 3 || t.length > 90 || /[.!?;,]$/.test(t)) return 0;
    var m;
    if ((m = /^(?:cap[ií]tulo|secci[oó]n|m[oó]dulo|unidad|tema)\s+(\d+|[IVXLC]+)\b/i.exec(t))) return 1;
    if ((m = /^(\d{1,2})(\.\d{1,2}){1,3}[.)]?\s+\S/.exec(t))) return Math.min(3, 1 + (t.match(/^[\d.]+/)[0].replace(/\.$/, '').split('.').length - 1) + 1);
    if (/^\d{1,2}[.)]\s+[A-ZÁÉÍÓÚÑ]/.test(t) && t.split(/\s+/).length <= 9) return 2;
    if (isUpper(t)) return first ? 1 : 2;
    if (nextLen > t.length * 1.4 && t.split(/\s+/).length <= 9 && /^[A-ZÁÉÍÓÚÑ0-9¿¡]/.test(t)) return 3;
    return 0;
  }

  /* texto plano -> markdown */
  function toMarkdown(text, opts) {
    opts = opts || {};
    var t = fixChars(text);
    var lines = t.split('\n');
    // encabezados/pies repetidos y números de página
    var freq = {};
    lines.forEach(function (l) { var k = l.trim().toLowerCase().replace(/\d+/g, '#'); if (k && k.length > 3) freq[k] = (freq[k] || 0) + 1; });
    var pages = Math.max(1, (t.match(/\f/g) || []).length + 1);
    lines = lines.filter(function (l) {
      var s = l.trim(); if (!s) return true;
      if (PAGENUM.test(s)) return false;
      var k = s.toLowerCase().replace(/\d+/g, '#');
      return !(pages >= 3 && freq[k] >= Math.max(3, pages * 0.6) && s.length < 80);
    });
    // bloques separados por línea en blanco
    var blocks = [], cur = [];
    lines.forEach(function (l) { if (!l.trim() || l === '\f') { if (cur.length) blocks.push(cur); cur = []; } else cur.push(l); });
    if (cur.length) blocks.push(cur);

    var md = [], firstHeading = true, i;
    for (i = 0; i < blocks.length; i++) {
      var b = blocks[i], nextLen = blocks[i + 1] ? blocks[i + 1].join(' ').length : 0;
      // ¿es lista?
      var items = b.filter(function (l) { return BULLET.test(l) || NUMLIST.test(l); }).length;
      var numOnly = !BULLET.test(b[0]) && NUMLIST.test(b[0]);
      var looksTitle = b.length === 1 && numOnly && (isUpper(b[0]) || (b[0].length < 70 && !endsSentence(b[0]) && b[0].split(/\s+/).length <= 9));
      if (!looksTitle && (!numOnly || items >= 2) && items >= Math.max(1, Math.ceil(b.length / 2)) && (BULLET.test(b[0]) || NUMLIST.test(b[0]))) {
        var list = [];
        b.forEach(function (l) {
          var m = BULLET.exec(l) || NUMLIST.exec(l);
          if (m) list.push('- ' + (m[2] || '').trim());
          else if (list.length) list[list.length - 1] += ' ' + l.trim();
        });
        md.push(list.join('\n')); continue;
      }
      // título en una sola línea
      if (b.length === 1) {
        var lvl = headingLevel(b[0], nextLen, firstHeading);
        if (lvl) { md.push(new Array(lvl + 1).join('#') + ' ' + b[0].trim().replace(/^\d+(\.\d+)*[.)]?\s+/, function (x) { return x; })); firstHeading = false; continue; }
      }
      // primera línea es título y el resto cuerpo
      if (b.length > 1 && b[0].trim().length < 80 && !endsSentence(b[0]) && (isUpper(b[0]) || /^(\d{1,2}(\.\d{1,2})*[.)]?)\s+[A-ZÁÉÍÓÚÑ]/.test(b[0]))) {
        var lv = headingLevel(b[0], 999, firstHeading) || 2; firstHeading = false;
        md.push(new Array(lv + 1).join('#') + ' ' + b[0].trim()); b = b.slice(1);
      }
      md.push(joinLines(b));
    }
    var out = md.filter(Boolean).join('\n\n');
    return out.replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  function stats(md) {
    var h = (md.match(/^#{1,4}\s/gm) || []).length, w = (md.match(/\S+/g) || []).length;
    return { titulos: h, palabras: w };
  }

  /* Revisión barata (sin IA) de qué tan "sucio" quedó el texto. Devuelve {limpiar, motivos[]}: limpiar=true sugiere pulirlo con IA. */
  var CORTAS = /^(a|e|o|u|y|y|de|en|el|la|lo|se|su|un|es|al|no|ni|me|mi|te|tu|si|sí|le|yo|ha|da|va|ve|di|fe|ir|ya|su|mas|más|con|por|los|las|una|que|qué|del|sin|sus|son|muy|hay|ser|fue|han|era|ese|esa|uno|dos|tres|mal|bar|vez|via|vía|ver|dar|haz|ten|usa|pon|ml|cl|kg|gr|lb|oz|hr|hrs|min|seg|etc|pm|am|no)$/i;
  function quality(md) {
    md = String(md || ''); var motivos = [], pts = 0;
    var words = md.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g) || [];
    if (words.length < 60) return { limpiar: false, motivos: [] };
    var frag = words.filter(function (w) { return w.length <= 2 && !CORTAS.test(w); }).length / words.length;
    if (frag > 0.06) { pts += 2; motivos.push('palabras partidas o letras sueltas'); }
    var raro = (md.match(/[�□■▯¤¦¬~|\\^`]/g) || []).length / md.length;
    if (raro > 0.004) { pts += 2; motivos.push('caracteres extraños'); }
    var guion = (md.match(/[a-záéíóúñ]-\s+[a-záéíóúñ]/g) || []).length;
    if (guion > words.length / 150) { pts += 1; motivos.push('palabras cortadas con guion'); }
    var sinAcento = (md.match(/\b(accion|operacion|informacion|atencion|seccion|produccion|preparacion|temperatura|limpieza)\b/gi) || []).length;
    var conAcento = (md.match(/\b(acción|operación|información|atención|sección|producción|preparación)\b/gi) || []).length;
    if (sinAcento > 4 && conAcento === 0) { pts += 1; motivos.push('acentos perdidos'); }
    var paras = md.split(/\n{2,}/).filter(function (p) { return !/^(#|- )/.test(p.trim()); });
    var minus = paras.filter(function (p) { return /^[a-záéíóúñ]/.test(p.trim()); }).length;
    if (paras.length > 8 && minus / paras.length > 0.35) { pts += 1; motivos.push('párrafos cortados a mitad de frase'); }
    var titulos = (md.match(/^#{1,4}\s/gm) || []).length;
    if (words.length > 600 && titulos === 0) { pts += 1; motivos.push('sin títulos detectados'); }
    return { limpiar: pts >= 2, motivos: motivos };
  }

  var API = { toMarkdown: toMarkdown, stats: stats, fixChars: fixChars, joinLines: joinLines, quality: quality };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.TextClean = API;
})(typeof window !== 'undefined' ? window : globalThis);
