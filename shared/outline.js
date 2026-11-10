/* Convierte bloques de documentos en un borrador de curso (sin IA). UMD: Node y navegador. */
(function (root) {
  'use strict';
  var STOP = 'para como esta este esto estos estas entre sobre desde hasta cada todo toda todos todas puede pueden debe deben sera seran donde cuando mientras tambien ademas segun otros otras tipo tipos'.split(' ');
  function slug(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48); }
  function words(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9ñ]+/).filter(function (w) { return w.length > 3 && STOP.indexOf(w) < 0; }); }
  function tagsFor() {
    var seen = {}, out = [];
    [].slice.call(arguments).forEach(function (t) { words(t).forEach(function (w) { if (!seen[w] && out.length < 4) { seen[w] = 1; out.push(w); } }); });
    return out;
  }

  /* docs: [{name,title,blocks}] ; opts: {accordion,split,maxChars} */
  function buildDraft(docs, opts) {
    opts = Object.assign({ accordion: true, split: true, maxChars: 750 }, opts || {});
    var modulos = [], mCount = 0;

    docs.forEach(function (doc) {
      var blocks = doc.blocks || [];
      var h1 = blocks.filter(function (b) { return b.t === 'h' && b.level === 1; }).length;
      var hasH2 = blocks.some(function (b) { return b.t === 'h' && b.level === 2; });
      var modLevel = h1 === 1 && hasH2 ? 2 : 1, scrLevel = modLevel + 1, subLevel = scrLevel + 1;

      var mods = [], mod = null, scr = null, sub = null;
      var newMod = function (t) { mod = { titulo: t, intro: { paras: [], lis: [] }, scrs: [] }; mods.push(mod); scr = null; sub = null; };
      var newScr = function (t) { if (!mod) newMod('Introducción'); scr = { titulo: t, paras: [], lis: [], subs: [] }; mod.scrs.push(scr); sub = null; };

      blocks.forEach(function (b) {
        if (b.t === 'h') {
          if (b.level < modLevel) { if (!mod && b.level === 1) { /* título del documento */ } return; }
          if (b.level === modLevel) newMod(b.text);
          else if (b.level === scrLevel) newScr(b.text);
          else { if (!scr) newScr(mod ? mod.titulo : 'Introducción'); sub = { titulo: b.text, paras: [], lis: [] }; scr.subs.push(sub); }
          return;
        }
        var target = sub || scr || (mod ? mod.intro : null);
        if (!target) { newMod('Introducción'); target = mod.intro; }
        (b.t === 'li' ? target.lis : target.paras).push(b.text);
      });

      mods.forEach(function (m) {
        var scrs = m.scrs.slice();
        if (m.intro.paras.length || m.intro.lis.length) scrs.unshift({ titulo: m.titulo, paras: m.intro.paras, lis: m.intro.lis, subs: [], intro: true });
        if (!scrs.length) return;
        mCount++;
        var mod = { id: 'm' + mCount, titulo: m.titulo, pantallas: [] };
        var pn = 0;
        var push = function (p) { pn++; p.id = mod.id + '-p' + pn; mod.pantallas.push(p); };
        var cortas = m.scrs.length >= 3 && m.scrs.every(function (x) { return !x.subs.length && (x.paras.join(' ').length + x.lis.join(' ').length) < 420 && (x.paras.length + x.lis.length) > 0; });
        if (opts.accordion && cortas) {
          var intro = scrs.filter(function (x) { return x.intro; })[0];
          if (intro) push(texto(m.titulo, intro.paras, intro.lis, doc.name + '#' + slug(m.titulo), m.titulo));
          push({ tipo: 'acordeon', titulo: m.titulo, contenido: { items: m.scrs.map(function (x) { return { encabezado: x.titulo, texto: x.paras.concat(x.lis).join('\n') }; }) }, animacion: 'escalonada', fuente: doc.name + '#' + slug(m.titulo) });
          scrs = [];
        }
        scrs.forEach(function (s) {
          var fuente = doc.name + '#' + slug(s.titulo);
          var subsOk = s.subs.filter(function (x) { return x.paras.length || x.lis.length; });
          if (opts.accordion && subsOk.length >= 3) {
            if (s.paras.length || s.lis.length) push(texto(s.titulo, s.paras, s.lis, fuente, m.titulo));
            push({ tipo: 'acordeon', titulo: s.titulo, contenido: { items: subsOk.map(function (x) { return { encabezado: x.titulo, texto: x.paras.concat(x.lis).join('\n') }; }) }, animacion: 'escalonada', fuente: fuente });
            return;
          }
          var paras = s.paras.slice(), lis = s.lis.slice();
          s.subs.forEach(function (x) { if (x.titulo) paras.push(x.titulo + ':'); paras = paras.concat(x.paras); lis = lis.concat(x.lis); });
          if (!paras.length && !lis.length) return;
          if (opts.split) {
            var chunks = [], cur = [], len = 0;
            paras.forEach(function (p) { if (len + p.length > opts.maxChars && cur.length) { chunks.push(cur); cur = []; len = 0; } cur.push(p); len += p.length; });
            if (cur.length || !chunks.length) chunks.push(cur);
            chunks.forEach(function (c, i) {
              var t = chunks.length > 1 ? s.titulo + ' (' + (i + 1) + '/' + chunks.length + ')' : s.titulo;
              push(texto(t, c, i === chunks.length - 1 ? lis : [], fuente, m.titulo));
            });
          } else push(texto(s.titulo, paras, lis, fuente, m.titulo));
        });
        if (mod.pantallas.length) modulos.push(mod); else mCount--;
      });
    });

    var palabras = 0;
    modulos.forEach(function (m) { m.pantallas.forEach(function (p) {
      var c = p.contenido; var txt = (c.texto || '') + ' ' + (c.puntos || []).join(' ') + ' ' + (c.items || []).map(function (i) { return i.encabezado + ' ' + i.texto; }).join(' ');
      palabras += txt.split(/\s+/).filter(Boolean).length;
    }); });
    var titulo = docs.length ? docs[0].title : 'Nuevo curso';
    return {
      course: { curso: { id: slug(titulo) || 'curso', titulo: titulo, descripcion: '', idioma: 'es-MX', duracion_min: Math.max(5, Math.round((palabras / 160 + modulos.length * 2) / 5) * 5), puntaje_aprobatorio: 80, color: 'teal' }, modulos: modulos, evaluacion: { preguntas: [] } },
      stats: { modulos: modulos.length, pantallas: modulos.reduce(function (a, m) { return a + m.pantallas.length; }, 0), palabras: palabras }
    };
  }
  function texto(titulo, paras, lis, fuente, modTitulo) {
    return { tipo: 'texto_imagen', titulo: titulo, contenido: { texto: paras.join('\n'), puntos: lis }, imagen: { etiquetas: tagsFor(titulo, modTitulo), archivo: null, alt: titulo }, animacion: 'fade-in', fuente: fuente };
  }

  /* Asigna imagen del banco por coincidencia de etiquetas. catalog: [{archivo, etiquetas}] */
  function assignImages(course, catalog) {
    var n = 0, usados = {};
    course.modulos.forEach(function (m) { m.pantallas.forEach(function (p) {
      if (p.tipo !== 'texto_imagen' || !p.imagen) return;
      var toks = (p.imagen.etiquetas || []).concat(words(p.titulo));
      var best = null, bs = 0;
      catalog.forEach(function (it) {
        var sc = (it.etiquetas || []).filter(function (t) { return toks.some(function (k) { return k === t || (k.length > 3 && (t.indexOf(k) >= 0 || k.indexOf(t) >= 0)); }); }).length;
        if (usados[it.archivo]) sc -= 0.5;
        if (sc > bs) { bs = sc; best = it; }
      });
      if (best) { p.imagen.archivo = best.archivo; usados[best.archivo] = 1; n++; }
    }); });
    return n;
  }

  var API = { buildDraft: buildDraft, assignImages: assignImages, slug: slug };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Outline = API;
})(typeof window !== 'undefined' ? window : globalThis);
