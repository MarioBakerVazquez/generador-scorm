'use strict';
// Empaquetador SCORM 1.2: JSON del curso -> lista de archivos -> .zip
const fs = require('fs');
const path = require('path');
const { validateCourse, ANIMACIONES } = require('./schema');
const Modelo = require('../shared/modelo.js');
const { PLANTILLAS, pregunta, esc } = require('./templates');
const { writeZip } = require('./zip');

const RUNTIME_DIR = path.join(__dirname, '..', 'runtime');
const MIME_IMG = /\.(png|jpe?g|gif|svg|webp)$/i;
const DOC_RE = /\.(pdf|docx?|xlsx?)$/i;

const xml = esc;
const PALETAS = { teal: ['#0e6b5c', '#0a5a4d', '#e6f2ef'], azul: ['#1d5fbf', '#164c9a', '#e7effb'], vino: ['#8a1f3d', '#701832', '#f8e9ee'], naranja: ['#c2540a', '#a14407', '#fcefe4'], grafito: ['#35434a', '#27333a', '#ecf0f2'] };
const SVG = {
  cap: '<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5zM6 12v5c3 3 9 3 12 0v-5M22 10v6"/></svg>',
  left: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  right: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'
};
const safeId = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '_');

function buildFiles(course, opts = {}) {
  course = Modelo.migrar(JSON.parse(JSON.stringify(course))); // Curso > Módulo > Lección > Objeto (todo queda como bloques)
  const baseDir = opts.baseDir || process.cwd();
  const stockDir = opts.stockDir || baseDir;
  const { errors, warnings } = validateCourse(course);
  if (errors.length) {
    const e = new Error('El curso no es válido:\n - ' + errors.join('\n - '));
    e.errors = errors; e.warnings = warnings;
    throw e;
  }

  const cu = course.curso;
  const FORMATOS = ['scorm12', 'scorm2004', 'xapi', 'web'];
  const formato = FORMATOS.includes(opts.formato) ? opts.formato : FORMATOS.includes(cu.formato) ? cu.formato : 'scorm12';
  const aprob = cu.puntaje_aprobatorio == null ? 80 : cu.puntaje_aprobatorio;
  const soloEval = cu.tipo === 'evaluacion';
  const modulos = soloEval ? [] : (course.modulos || []);
  const ev = course.evaluacion || {};
  const preguntas = ev.preguntas || [];
  const files = [];
  const media = new Map(); // origen absoluto -> ruta en el paquete
  const add = (name, data) => files.push({ name, data: Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8') });

  function resolveImage(img) {
    if (!img || !img.archivo) return null;
    const cands = [path.resolve(stockDir, img.archivo), path.resolve(baseDir, img.archivo)];
    const src = cands.find((p) => fs.existsSync(p));
    if (!src) { warnings.push(`Imagen no encontrada: ${img.archivo}`); return null; }
    if (!MIME_IMG.test(src)) { warnings.push(`Formato de imagen no soportado: ${img.archivo}`); return null; }
    if (!media.has(src)) {
      let name = 'media/' + path.basename(src).replace(/[^A-Za-z0-9._-]/g, '_');
      const used = new Set(media.values());
      for (let n = 2; used.has(name); n++) name = name.replace(/(-\d+)?(\.[^.]+)$/, `-${n}$2`);
      media.set(src, name);
    }
    return media.get(src);
  }

  // documentos descargables: se incrustan en el paquete (docs/…)
  function resolveDoc(archivo) {
    if (!archivo) return null;
    const src = [path.resolve(stockDir, archivo), path.resolve(baseDir, archivo)].find((p) => fs.existsSync(p));
    if (!src) { warnings.push(`Documento no encontrado: ${archivo}`); return null; }
    if (!DOC_RE.test(src)) { warnings.push(`Formato de documento no soportado: ${archivo}`); return null; }
    if (!media.has(src)) {
      let name = 'docs/' + path.basename(src).replace(/[^A-Za-z0-9._-]/g, '_');
      const used = new Set(media.values());
      for (let n = 2; used.has(name); n++) name = name.replace(/(-\d+)?(\.[^.]+)$/, `-${n}$2`);
      media.set(src, name);
    }
    return { href: media.get(src), size: fs.statSync(src).size };
  }

  // ---- pantallas ----
  const sections = [];
  const meta = [];
  const push = (sec) => sections.push(sec);
  const anim = (a) => 'a-' + (ANIMACIONES.includes(a) && a !== 'ninguna' ? a : a === 'ninguna' ? 'none' : 'fade-in');
  const sec = (i, id, tipo, a, inner) =>
    `<section class="screen ${anim(a)}${tipo === 'portada' ? ' portada-s' : ''}" id="s-${esc(safeId(id))}" data-i="${i}" data-tipo="${tipo}"${i ? ' hidden' : ''}>${inner}</section>`;

  let i = 0;
  const nPant = modulos.reduce((a, m) => a + m.pantallas.length, 0);
  push(sec(i, 'portada', 'portada', 'zoom',
    `<div class="hero"><div class="logo" aria-hidden="true">${SVG.cap}</div><h1>${esc(cu.titulo)}</h1>` +
    (cu.descripcion ? `<p>${esc(cu.descripcion)}</p>` : '') +
    `<div class="chips">${cu.duracion_min ? `<span>${esc(cu.duracion_min)} min</span>` : ''}${soloEval ? '' : `<span>${nPant} pantallas</span>`}${preguntas.length ? `<span>${(+ev.mostrar > 0 && +ev.mostrar < preguntas.length) ? `${+ev.mostrar} preguntas (de un banco de ${preguntas.length})` : `${preguntas.length} preguntas`} · aprueba con ${aprob}%</span>` : ''}</div>` +
    `<button type="button" class="cta" id="start">${soloEval ? 'Comenzar evaluación' : 'Comenzar curso'} ${SVG.right}</button></div>`));
  meta.push({ id: 'portada', tipo: 'portada' });
  i++;

  for (const m of modulos) {
    for (const p of m.pantallas) {
      const mediaPath = resolveImage(p.imagen);
      const inner = `<span class="kicker">${esc(m.titulo)}</span><h2>${esc(p.titulo)}</h2>` + PLANTILLAS[p.tipo](p, { mediaPath, img: (a) => resolveImage({ archivo: a }), doc: resolveDoc });
      push(sec(i, p.id, p.tipo, p.animacion || 'fade-in', inner));
      const nInter = p.tipo === 'bloques' ? require('../shared/bloques.js').contarInter(p) : 0;
      meta.push(p.tipo === 'acordeon'
        ? { id: p.id, tipo: 'acordeon', req: 'items', n: p.contenido.items.length }
        : p.tipo === 'bloques' ? Object.assign({ id: p.id, tipo: 'bloques' }, nInter ? { req: 'bloques', n: nInter } : {})
        : { id: p.id, tipo: p.tipo });
      i++;
    }
  }

  preguntas.forEach((q, qn) => {
    push(sec(i, q.id, 'pregunta', 'slide-up',
      `<span class="kicker">Evaluación · Pregunta ${qn + 1} de ${preguntas.length}</span><h2>${esc(q.enunciado)}</h2>` + pregunta(q)));
    meta.push({ id: q.id, tipo: 'pregunta', req: 'pregunta', qid: q.id, qn });
    i++;
  });

  push(sec(i, 'cierre', 'cierre', 'zoom',
    `<div class="cierre"><span class="kicker">Resultado</span><div class="resultado"></div><button type="button" class="btn sec reintentar" hidden>Reintentar evaluación</button></div>`));
  meta.push({ id: 'cierre', tipo: 'cierre' });

  // ---- archivos del paquete ----
  const fi = cu.ficha || {};
  let cert = null;
  if (fi.certificado === true && !soloEval) {
    cert = Object.assign({}, course.certificado || {});
    ['logo', 'firma', 'sello', 'fondo'].forEach((k) => { cert[k] = cert[k] ? (resolveImage({ archivo: cert[k] }) || '') : ''; });
    cert.activo = true; cert.duracion = fi.duracion || (cu.duracion_min ? cu.duracion_min + ' min' : '');
  }
  const data = {
    cert, formato,
    id: cu.id, titulo: cu.titulo, aprobatorio: aprob,
    screens: meta,
    examen: { modo: ev.modo === 'examen' ? 'examen' : 'practica', intentos: ev.intentos || 0, aleatorizar: !!ev.aleatorizar, mostrar: Math.max(0, Math.min(+ev.mostrar || 0, preguntas.length)), respuestas: ev.mostrar_respuestas !== false },
    preguntas: preguntas.map((q) => ({ id: q.id, correcta: q.correcta, retro: q.retroalimentacion || '' }))
  };
  const pal = PALETAS[cu.color] || PALETAS.teal;
  const html = `<!DOCTYPE html>
<html lang="${esc((cu.idioma || 'es').split('-')[0])}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="${pal[0]}">
<title>${esc(cu.titulo)}</title>
<link rel="stylesheet" href="assets/course.css">
<style>:root{--brand:${pal[0]};--brand-d:${pal[1]};--brand-50:${pal[2]}}</style>
</head>
<body>
<div class="top"><span class="ttl">${esc(cu.titulo)}</span><span id="counter" aria-live="polite"></span></div>
<div class="prog"><div id="bar"></div></div>
<main id="stage">
${sections.join('\n')}
</main>
<div class="nav" id="nav">
<button type="button" class="btn sec" id="prev">${SVG.left}Anterior</button>
<button type="button" class="btn" id="next">Siguiente${SVG.right}</button>
</div>
<script src="assets/data.js"></script>
<script src="assets/scorm.js"></script>
${cert ? '<script src="assets/certificado.js"></script>\n' : ''}
<script src="assets/course.js"></script>
</body>
</html>
`;
  add('index.html', html);
  add('assets/data.js', 'window.CURSO_DATA = ' + JSON.stringify(data) + ';\n');
  for (const f of ['course.css', 'scorm.js', 'course.js']) add('assets/' + f, fs.readFileSync(path.join(RUNTIME_DIR, f)));
  if (cert) add('assets/certificado.js', fs.readFileSync(path.join(__dirname, '..', 'shared', 'certificado.js')));
  for (const [src, name] of media) add(name, fs.readFileSync(src));

  // ---- manifiesto / descriptor según el formato de publicación ----
  const resFiles = files.map((f) => f.name);
  const mid = safeId(cu.id);
  if (formato === 'scorm12') {
    const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="MANIFEST-${mid}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG-${mid}">
    <organization identifier="ORG-${mid}">
      <title>${xml(cu.titulo)}</title>
      <item identifier="ITEM-1" identifierref="RES-1" isvisible="true">
        <title>${xml(cu.titulo)}</title>${preguntas.length ? `\n        <adlcp:masteryscore>${aprob}</adlcp:masteryscore>` : ''}
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco" href="index.html">
${resFiles.map((f) => `      <file href="${xml(f)}"/>`).join('\n')}
    </resource>
  </resources>
</manifest>
`;
    files.unshift({ name: 'imsmanifest.xml', data: Buffer.from(manifest, 'utf8') });
  } else if (formato === 'scorm2004') {
    const seq = preguntas.length ? `
      <imsss:sequencing>
        <imsss:objectives>
          <imsss:primaryObjective objectiveID="PRIMARY" satisfiedByMeasure="true">
            <imsss:minNormalizedMeasure>${(aprob / 100).toFixed(2)}</imsss:minNormalizedMeasure>
          </imsss:primaryObjective>
        </imsss:objectives>
      </imsss:sequencing>` : '';
    const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="MANIFEST-${mid}" version="1.0"
  xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
  xmlns:adlseq="http://www.adlnet.org/xsd/adlseq_v1p3"
  xmlns:adlnav="http://www.adlnet.org/xsd/adlnav_v1p3"
  xmlns:imsss="http://www.imsglobal.org/xsd/imsss"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 4th Edition</schemaversion>
  </metadata>
  <organizations default="ORG-${mid}">
    <organization identifier="ORG-${mid}">
      <title>${xml(cu.titulo)}</title>
      <item identifier="ITEM-1" identifierref="RES-1" isvisible="true">
        <title>${xml(cu.titulo)}</title>${seq}
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" adlcp:scormType="sco" href="index.html">
${resFiles.map((f) => `      <file href="${xml(f)}"/>`).join('\n')}
    </resource>
  </resources>
</manifest>
`;
    files.unshift({ name: 'imsmanifest.xml', data: Buffer.from(manifest, 'utf8') });
  } else if (formato === 'xapi') {
    const tincan = `<?xml version="1.0" encoding="utf-8"?>
<tincan xmlns="http://projecttincan.com/tincan.xsd">
  <activities>
    <activity id="urn:generador-scorm:${mid}" type="http://adlnet.gov/expapi/activities/course">
      <name lang="es">${xml(cu.titulo)}</name>
      <description lang="es">${xml(cu.descripcion || cu.titulo)}</description>
      <launch lang="es">index.html</launch>
    </activity>
  </activities>
</tincan>
`;
    files.unshift({ name: 'tincan.xml', data: Buffer.from(tincan, 'utf8') });
  }
  return { files, warnings, formato };
}

function buildZip(course, opts) {
  const { files, warnings, formato } = buildFiles(course, opts);
  return { zip: writeZip(files), files, warnings, formato };
}

module.exports = { buildFiles, buildZip };
