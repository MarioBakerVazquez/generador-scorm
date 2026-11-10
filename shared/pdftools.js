/* PDF e imágenes -> Markdown, 100% en el navegador y sin internet.
   - toMarkdown(): lee el texto de un PDF digital con pdf.js y reconstruye títulos/listas por tamaño de letra.
   - ocr(): digitaliza PDFs escaneados o imágenes con tesseract.js (español). */
(function (root) {
  'use strict';
  var pdfjs = null, tess = null;

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
  }
  function lib() {
    if (pdfjs) return Promise.resolve(pdfjs);
    return import('/vendor/pdfjs/build/pdf.min.mjs').then(function (m) {
      m.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/build/pdf.worker.min.mjs';
      pdfjs = m; return m;
    });
  }
  function open(buf) {
    return lib().then(function (m) {
      return m.getDocument({
        data: new Uint8Array(buf.slice ? buf.slice(0) : buf),
        wasmUrl: '/vendor/pdfjs/wasm/', cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true,
        standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', iccUrl: '/vendor/pdfjs/iccs/', useSystemFonts: false
      }).promise;
    });
  }

  /* líneas de una página, agrupando por posición vertical */
  function pageLines(tc) {
    var rows = [];
    tc.items.forEach(function (it) {
      if (!it.str && !it.hasEOL) return;
      var y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 10, x = it.transform[4];
      var r = null;
      for (var i = rows.length - 1; i >= 0 && i > rows.length - 6; i--) if (Math.abs(rows[i].y - y) < h * 0.4) { r = rows[i]; break; }
      if (!r) { r = { y: y, parts: [], size: 0 }; rows.push(r); }
      r.parts.push({ x: x, s: it.str, w: it.width || 0 }); r.size = Math.max(r.size, h);
    });
    rows.forEach(function (r) {
      r.parts.sort(function (a, b) { return a.x - b.x; });
      var t = '', end = null;
      r.parts.forEach(function (p) {
        if (end !== null && p.x - end > r.size * 0.15 && !/\s$/.test(t) && !/^\s/.test(p.s)) t += ' ';
        t += p.s; end = p.x + p.w;
      });
      r.text = t.replace(/\s+/g, ' ').trim();
    });
    return rows.filter(function (r) { return r.text; }).sort(function (a, b) { return b.y - a.y; });
  }

  function mode(arr) { var c = {}, best = 0, bv = 0; arr.forEach(function (v) { v = Math.round(v * 2) / 2; c[v] = (c[v] || 0) + 1; if (c[v] > best) { best = c[v]; bv = v; } }); return bv; }

  /* Lee un PDF con texto. onProgress(0..1, mensaje). Devuelve {markdown, pages, scanned, avgChars} */
  function toMarkdown(buf, onProgress) {
    onProgress = onProgress || function () {};
    return open(buf).then(function (doc) {
      var n = doc.numPages, pages = [], chain = Promise.resolve(), total = 0;
      for (var p = 1; p <= n; p++) (function (p) {
        chain = chain.then(function () { return doc.getPage(p); }).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
          var lines = pageLines(tc); pages.push(lines); lines.forEach(function (l) { total += l.text.length; });
          onProgress(p / n, 'Leyendo página ' + p + ' de ' + n);
        });
      })(p);
      return chain.then(function () {
        var avg = total / Math.max(1, n);
        var scanned = avg < 40;
        if (scanned) return { markdown: '', pages: n, scanned: true, avgChars: avg };
        // tamaño de cuerpo = el más frecuente (ponderado por caracteres)
        var sizes = []; pages.forEach(function (ls) { ls.forEach(function (l) { for (var k = 0; k < Math.min(40, Math.ceil(l.text.length / 8)); k++) sizes.push(l.size); }); });
        var body = mode(sizes) || 10;
        var big = {}; pages.forEach(function (ls) { ls.forEach(function (l) { if (l.size > body * 1.15) big[Math.round(l.size)] = 1; }); });
        var ranks = Object.keys(big).map(Number).sort(function (a, b) { return b - a; });
        // pies/encabezados repetidos
        var freq = {}; pages.forEach(function (ls) { var seen = {}; ls.forEach(function (l) { var k = l.text.toLowerCase().replace(/\d+/g, '#'); if (!seen[k]) { seen[k] = 1; freq[k] = (freq[k] || 0) + 1; } }); });
        var out = [];
        pages.forEach(function (ls) {
          var prev = null, para = [];
          function flush() {
            if (!para.length) return;
            // 3 o más líneas cortas seguidas, sin punto final: es una lista cuyas viñetas no vienen como texto
            var lista = para.length >= 3 && para.every(function (t) { return t.length < 60 && !/[.!?]$/.test(t); });
            if (lista) out.push(para.map(function (t) { return '- ' + t; }).join('\n')); else out.push(TextClean.joinLines(para));
            para = [];
          }
          ls.forEach(function (l, i) {
            var key = l.text.toLowerCase().replace(/\d+/g, '#');
            if (n >= 3 && freq[key] >= Math.max(3, n * 0.6) && l.text.length < 80) return;
            if (/^\s*(?:p[áa]g(?:ina)?\.?\s*)?\d{1,4}(\s*(de|\/)\s*\d{1,4})?\s*$/i.test(l.text)) return;
            var gap = prev ? prev.y - l.y : 0, isBig = ranks.indexOf(Math.round(l.size)) >= 0 && l.size > body * 1.15;
            var bullet = /^\s*([•·▪◦●○■□‣⁃∙\-–—*])\s+/.test(l.text) || /^\s*\d{1,2}[.)]\s+/.test(l.text);
            if (isBig) {
              flush(); var lv = Math.min(3, ranks.indexOf(Math.round(l.size)) + 1);
              out.push(new Array(lv + 1).join('#') + ' ' + l.text);
            } else if (bullet) {
              flush(); out.push('- ' + l.text.replace(/^\s*([•·▪◦●○■□‣⁃∙\-–—*]|\d{1,2}[.)])\s+/, ''));
            } else {
              if (prev && gap > body * 1.9) flush();
              para.push(l.text);
            }
            prev = l;
          });
          flush();
        });
        // listas consecutivas sin línea en blanco
        var md = out.join('\n\n').replace(/(\n- [^\n]*)\n\n(?=- )/g, '$1\n');
        return { markdown: TextClean.toMarkdown(md), pages: n, scanned: false, avgChars: avg };
      });
    });
  }

  /* ---------- OCR ---------- */
  function ocrLib() {
    if (tess) return Promise.resolve(tess);
    return (root.Tesseract ? Promise.resolve() : loadScript('/vendor/tesseract/dist/tesseract.min.js')).then(function () { tess = root.Tesseract; return tess; });
  }
  function makeWorker(onProgress) {
    return ocrLib().then(function (T) {
      return T.createWorker('spa', 1, {
        workerPath: '/vendor/tesseract/dist/worker.min.js', corePath: '/vendor/tesseract/core/', langPath: '/vendor/tesseract/lang/',
        gzip: true, workerBlobURL: false,
        logger: function (m) { if (m && m.status === 'recognizing text' && onProgress) onProgress.page(m.progress); }
      });
    });
  }
  function imgToCanvas(blob) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(blob), im = new Image();
      im.onload = function () { var c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); URL.revokeObjectURL(u); res(c); };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('No se pudo abrir la imagen')); }; im.src = u;
    });
  }
  /* fuentes: [{tipo:'pdf', buf}] o [{tipo:'img', blob}]. ctl.cancel = true para detener. onProgress(0..1, mensaje) */
  function ocr(sources, onProgress, ctl) {
    ctl = ctl || {}; onProgress = onProgress || function () {};
    var worker, texts = [], jobs = [];
    return Promise.all(sources.map(function (s) {
      if (s.tipo === 'pdf') return open(s.buf).then(function (doc) { for (var p = 1; p <= doc.numPages; p++) jobs.push({ doc: doc, p: p, name: s.name }); });
      jobs.push({ blob: s.blob, name: s.name }); return null;
    })).then(function () {
      var done = 0, cur = 0;
      return makeWorker({ page: function (f) { onProgress((done + f) / jobs.length, 'Reconociendo ' + (done + 1) + ' de ' + jobs.length); } }).then(function (w) {
        worker = w;
        var chain = Promise.resolve();
        jobs.forEach(function (j) {
          chain = chain.then(function () {
            if (ctl.cancel) return;
            var cv;
            if (j.doc) {
              return j.doc.getPage(j.p).then(function (pg) {
                var vp = pg.getViewport({ scale: 2.2 }); cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
                var ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
                return pg.render({ canvas: cv, viewport: vp }).promise;
              }).then(function () { return worker.recognize(cv); }).then(function (r) { texts.push(r.data.text); done++; onProgress(done / jobs.length, 'Reconociendo ' + done + ' de ' + jobs.length); });
            }
            return imgToCanvas(j.blob).then(function (c) { return worker.recognize(c); }).then(function (r) { texts.push(r.data.text); done++; onProgress(done / jobs.length, 'Reconociendo ' + done + ' de ' + jobs.length); });
          });
        });
        return chain;
      }).then(function () { return worker.terminate(); }, function (e) { try { worker && worker.terminate(); } catch (x) {} throw e; })
        .then(function () { return { texto: texts.join('\n\n'), paginas: jobs.length, cancelado: !!ctl.cancel }; });
    });
  }

  root.PdfTools = { toMarkdown: toMarkdown, ocr: ocr };
})(window);
