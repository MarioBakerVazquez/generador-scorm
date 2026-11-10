/* Certificado (sección 15): 4 plantillas base + variables. No es un editor tipo Canva: se elige plantilla, se cambian colores, logo, fondo, sello, firma y textos.
   ES5 (UMD): lo usan el editor (vista previa) y el curso empaquetado (descarga en PDF = imprimir esta misma página a PDF). */
(function (root) {
  'use strict';
  var PLANTILLAS = {
    clasico:  { nombre: 'Clásico corporativo', desc: 'Marco doble, serif, centrado.', color: '#1f3a5f', acento: '#b8892b' },
    moderno:  { nombre: 'Moderno minimalista', desc: 'Barra de color, mucho aire.', color: '#0e6b5c', acento: '#e0b341' },
    elegante: { nombre: 'Elegante con marco', desc: 'Marco ornamental con esquinas.', color: '#6b2f4a', acento: '#b8892b' },
    oficial:  { nombre: 'Compliance / oficial', desc: 'Formal, con datos en tabla y folio.', color: '#243447', acento: '#c0392b' }
  };
  var DEF = { plantilla: 'clasico', tamano: 'carta', color: '#1f3a5f', acento: '#b8892b', titulo: 'Certificado de finalización', intro: 'Se otorga el presente certificado a',
    cuerpo: 'por haber completado el curso {{nombre_curso}} con un puntaje de {{puntaje}}%.', pie: '', instructor: '', logo: '', firma: '', sello: '', fondo: '' };
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var EJEMPLO = { nombre_alumno: 'María Pérez', nombre_curso: 'Curso de Seguridad', fecha_termino: '10 nov 2026', duracion: '30 min', puntaje: '92', folio: '2026-0042', instructor: 'Dirección de Capacitación' };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function cfg(c) { var o = {}, k; for (k in DEF) o[k] = DEF[k]; if (c) for (k in c) if (c[k] != null && c[k] !== '') o[k] = c[k]; return o; }
  function fill(t, v) { return String(t == null ? '' : t).replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, k) { return v && v[k] != null ? v[k] : ''; }); }
  function fecha(d) { return d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear(); }
  function folio(nombre, cursoId, d) {
    var s = String(nombre) + '|' + String(cursoId), h = 2166136261, i;
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    var n = String((h >>> 0) % 100000); while (n.length < 5) n = '0' + n;
    return (d || new Date()).getFullYear() + '-' + n;
  }
  /* html del certificado a tamaño natural (carta 1056×816 o A4 1123×794). img(nombre) devuelve la URL de una imagen. */
  function html(c, v, img) {
    c = cfg(c); v = v || {}; img = img || function (x) { return x; };
    var im = function (k, cls) { return c[k] ? '<img class="' + cls + '" src="' + esc(img(c[k])) + '" alt="">' : ''; };
    var meta = [['Fecha de término', v.fecha_termino], ['Duración', v.duracion], ['Puntaje', v.puntaje !== '' && v.puntaje != null ? v.puntaje + '%' : ''], ['Folio', v.folio]].filter(function (x) { return x[1]; })
      .map(function (x) { return '<div><small>' + x[0] + '</small><b>' + esc(x[1]) + '</b></div>'; }).join('');
    var inst = fill(c.instructor, v);
    return '<div class="cert c-' + esc(c.plantilla) + ' s-' + (c.tamano === 'a4' ? 'a4' : 'carta') + '" style="--c1:' + esc(c.color) + ';--c2:' + esc(c.acento) + '">' +
      (c.fondo ? '<img class="cert-bg" src="' + esc(img(c.fondo)) + '" alt="">' : '') + '<div class="cert-fr"></div><div class="cert-in">' +
      '<div class="cert-top">' + im('logo', 'cert-logo') + '<div class="cert-t">' + esc(fill(c.titulo, v)) + '</div></div>' +
      '<div class="cert-mid"><div class="cert-i">' + esc(fill(c.intro, v)) + '</div><div class="cert-n">' + esc(v.nombre_alumno || '') + '</div><div class="cert-b">' + esc(fill(c.cuerpo, v)) + '</div></div>' +
      '<div class="cert-meta">' + meta + '</div>' +
      '<div class="cert-bot"><div class="cert-sig">' + im('firma', 'cert-firma') + '<i></i><span>' + esc(inst) + '</span></div>' + im('sello', 'cert-seal') + (c.pie ? '<div class="cert-p">' + esc(fill(c.pie, v)) + '</div>' : '') + '</div></div></div>';
  }
  var CSS = '.cert{position:relative;overflow:hidden;box-sizing:border-box;background:#fff;color:#222;font-family:Georgia,"Times New Roman",serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.cert *{box-sizing:border-box}.cert.s-carta{width:1056px;height:816px}.cert.s-a4{width:1123px;height:794px}' +
    '.cert-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.18}.cert-fr{position:absolute;pointer-events:none}.cert-in{position:relative;height:100%;display:flex;flex-direction:column;padding:70px 90px;text-align:center}' +
    '.cert-top{display:flex;flex-direction:column;align-items:center;gap:14px}.cert-logo{max-height:84px;max-width:260px;object-fit:contain}.cert-t{font-size:40px;letter-spacing:.05em;color:var(--c1);text-transform:uppercase;font-weight:700}' +
    '.cert-mid{flex:1;display:flex;flex-direction:column;justify-content:center;gap:12px}.cert-i{font-size:20px;font-style:italic;color:#555}.cert-n{font-size:58px;line-height:1.1;color:var(--c1);font-weight:700;border-bottom:2px solid var(--c2);padding:0 40px 8px;align-self:center;max-width:100%}' +
    '.cert-b{font-size:21px;line-height:1.5;color:#333;max-width:760px;align-self:center}.cert-meta{display:flex;justify-content:center;gap:44px;margin:10px 0 24px;font-family:"Segoe UI",Arial,sans-serif}' +
    '.cert-meta div{display:grid;gap:2px}.cert-meta small{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#777}.cert-meta b{font-size:16px;color:#222}' +
    '.cert-bot{display:flex;align-items:flex-end;justify-content:center;gap:60px;position:relative;min-height:90px}.cert-sig{display:grid;justify-items:center;gap:4px;min-width:240px}.cert-firma{max-height:56px;max-width:220px;object-fit:contain}' +
    '.cert-sig i{display:block;width:240px;border-top:1.5px solid #444}.cert-sig span{font-size:14px;color:#444;font-family:"Segoe UI",Arial,sans-serif}.cert-seal{max-height:96px;max-width:96px;object-fit:contain}.cert-p{position:absolute;left:0;right:0;bottom:-34px;font-size:12px;color:#777;font-family:"Segoe UI",Arial,sans-serif}' +
    /* clásico: doble marco */
    '.c-clasico{background:#fffdf6}.c-clasico .cert-fr{inset:26px;border:3px solid var(--c1);outline:1.5px solid var(--c2);outline-offset:-12px}' +
    /* moderno: barra lateral, alineado a la izquierda */
    '.c-moderno{font-family:"Segoe UI",Arial,sans-serif;background:#fff}.c-moderno .cert-fr{left:0;top:0;bottom:0;width:34px;background:var(--c1)}.c-moderno .cert-fr::after{content:"";position:absolute;left:34px;top:0;bottom:0;width:8px;background:var(--c2)}' +
    '.c-moderno .cert-in{text-align:left;padding-left:130px}.c-moderno .cert-top{align-items:flex-start}.c-moderno .cert-t{font-size:30px;letter-spacing:.14em;font-weight:600}.c-moderno .cert-n{font-size:54px;border-bottom:0;padding:0;align-self:flex-start;font-weight:600}' +
    '.c-moderno .cert-b{align-self:flex-start;max-width:700px;font-size:20px}.c-moderno .cert-mid{align-items:flex-start}.c-moderno .cert-meta{justify-content:flex-start}.c-moderno .cert-bot{justify-content:flex-start}.c-moderno .cert-p{left:0;text-align:left}' +
    /* elegante: marco con esquinas */
    '.c-elegante{background:#fbf6ea}.c-elegante .cert-fr{inset:22px;border:2px solid var(--c2)}.c-elegante .cert-fr::before{content:"";position:absolute;inset:8px;border:6px double var(--c1)}' +
    '.c-elegante .cert-fr::after{content:"❖";position:absolute;left:50%;top:-16px;transform:translateX(-50%);background:#fbf6ea;color:var(--c2);padding:0 12px;font-size:26px}.c-elegante .cert-t{font-style:italic;text-transform:none;font-size:46px;letter-spacing:.02em;font-weight:400}' +
    '.c-elegante .cert-n{font-style:italic;font-weight:400;font-size:62px}' +
    /* oficial: encabezado de color, datos en tabla */
    '.c-oficial{font-family:"Segoe UI",Arial,sans-serif;background:#fff}.c-oficial .cert-fr{inset:0;border:10px solid var(--c1)}.c-oficial .cert-in{padding:0 0 46px}.c-oficial .cert-top{flex-direction:row;justify-content:space-between;background:var(--c1);color:#fff;padding:26px 56px;margin:10px 10px 0}' +
    '.c-oficial .cert-t{color:#fff;font-size:28px;letter-spacing:.12em;text-align:right;flex:1}.c-oficial .cert-logo{background:#fff;padding:6px 10px;border-radius:6px;max-height:64px}.c-oficial .cert-n{font-size:48px;border-bottom:2px solid var(--c2)}' +
    '.c-oficial .cert-meta{margin:0 70px 22px;gap:0;border:1px solid #bbb}.c-oficial .cert-meta div{flex:1;padding:10px 14px;border-right:1px solid #bbb}.c-oficial .cert-meta div:last-child{border-right:0}.c-oficial .cert-bot{padding:0 70px}.c-oficial .cert-p{bottom:-34px}' +
    '.cert-fit{position:relative;width:100%;overflow:hidden}.cert-fit>.cert{position:absolute;left:0;top:0;transform-origin:0 0}';
  function ensureCss(doc) { doc = doc || document; if (doc.getElementById('cert-css')) return; var s = doc.createElement('style'); s.id = 'cert-css'; s.textContent = CSS; doc.head.appendChild(s); }
  /* escala el certificado para que quepa en su caja (vista previa) */
  function fit(box) { var c = box.firstChild; if (!c) return; var w = c.offsetWidth, h = c.offsetHeight, s = Math.min(1.5, box.clientWidth / w); c.style.transform = 'scale(' + s + ')'; box.style.height = Math.round(h * s) + 'px'; }

  var API = { PLANTILLAS: PLANTILLAS, DEF: DEF, EJEMPLO: EJEMPLO, cfg: cfg, fill: fill, fecha: fecha, folio: folio, html: html, CSS: CSS, ensureCss: ensureCss, fit: fit };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Certificado = API;
})(typeof window !== 'undefined' ? window : globalThis);
