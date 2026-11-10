'use strict';
// Servidor local: editor de autoría + player SCORM + API de proyectos, banco de imágenes y generación.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { readZip } = require('./zip');
const { validatePackage } = require('./validator');
const { validateCourse } = require('./schema');
const { buildZip, buildFiles } = require('./packager');
const { parseDoc } = require('./docparse');
const ai = require('./ai');

const ROOT = path.join(__dirname, '..');
const PLAYER_DIR = path.join(ROOT, 'player');
const EDITOR_DIR = path.join(ROOT, 'editor');
const HOME_DIR = path.join(ROOT, 'home');
const UTIL_DIR = path.join(ROOT, 'utilidades');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'text/xml; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
  '.zip': 'application/zip', '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.gz': 'application/octet-stream', '.pfb': 'application/octet-stream', '.bcmap': 'application/octet-stream', '.icc': 'application/octet-stream'
};
// Librerías locales (100 % offline) que usa el navegador: lector de PDF y OCR. Solo se sirven estas carpetas.
const VENDOR = {
  '/vendor/pdfjs/': ['pdfjs-dist', '', ['build', 'wasm', 'cmaps', 'standard_fonts', 'iccs']],
  '/vendor/tesseract/dist/': ['tesseract.js', 'dist', null],
  '/vendor/tesseract/core/': ['tesseract.js-core', '', null],
  '/vendor/tesseract/lang/': ['@tesseract.js-data/spa', '4.0.0_best_int', null]
};
function vendorFile(p) {
  for (const [prefix, [pkg, sub, allow]] of Object.entries(VENDOR)) {
    if (!p.startsWith(prefix)) continue;
    let rel; try { rel = decodeURIComponent(p.slice(prefix.length)); } catch (e) { return null; }
    if (!rel || rel.includes('..') || rel.includes('\\')) return null;
    if (allow && !allow.includes(rel.split('/')[0])) return null;
    let base;
    try { base = path.join(path.dirname(require.resolve(pkg + '/package.json')), sub); }
    catch (e) {
      // al empaquetar, tesseract.js-core queda anidado dentro de tesseract.js
      try { const from = path.dirname(require.resolve('tesseract.js/package.json')); base = path.join(path.dirname(require.resolve(pkg + '/package.json', { paths: [from] })), sub); } catch (e2) { return null; }
    }
    const f = path.resolve(base, rel);
    return f.startsWith(path.resolve(base) + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile() ? f : null;
  }
  return null;
}
const IMG_RE = /\.(png|jpe?g|gif|svg|webp)$/i;
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const safeFile = (s) => path.basename(String(s || '')).replace(/[^A-Za-z0-9._ -]/g, '_');

function readDirEntries(dir, base = dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) readDirEntries(p, base, out);
    else out.push({ name: path.relative(base, p).split(path.sep).join('/'), data: fs.readFileSync(p) });
  }
  return out;
}

/* Primera ejecución: copia el curso y las imágenes de ejemplo y genera su paquete. */
function seed(workDir, seedDir) {
  const d = dirsOf(workDir);
  Object.values(d).forEach((p) => fs.mkdirSync(p, { recursive: true }));
  if (!seedDir || !fs.existsSync(seedDir)) return;
  if (fs.readdirSync(d.proyectos).some((f) => f.endsWith('.json'))) return;
  const jsonSrc = path.join(seedDir, 'curso-higiene.json');
  if (!fs.existsSync(jsonSrc)) return;
  const course = JSON.parse(fs.readFileSync(jsonSrc, 'utf8'));
  fs.writeFileSync(path.join(d.proyectos, slug(course.curso.id) + '.json'), JSON.stringify(course, null, 2));
  const st = path.join(seedDir, 'stock');
  if (fs.existsSync(st)) for (const f of fs.readdirSync(st)) fs.copyFileSync(path.join(st, f), path.join(d.stock, f));
  try {
    const { zip } = buildZip(course, { baseDir: d.stock, stockDir: d.stock });
    fs.writeFileSync(path.join(d.cursos, slug(course.curso.id) + '.zip'), zip);
  } catch (e) { /* el ejemplo es opcional */ }
}
const dirsOf = (w) => ({ cursos: path.join(w, 'cursos'), proyectos: path.join(w, 'proyectos'), stock: path.join(w, 'stock') });

function start({ port = 4173, workDir = path.join(process.cwd(), 'datos'), host = '127.0.0.1', seedDir } = {}) {
  seed(workDir, seedDir);
  const dirs = dirsOf(workDir);
  const catalogFile = path.join(dirs.stock, 'catalogo.json');
  const sessions = new Map();
  let seq = 0;

  const readCatalog = () => { try { return JSON.parse(fs.readFileSync(catalogFile, 'utf8')); } catch (e) { return {}; } };
  const writeCatalog = (c) => fs.writeFileSync(catalogFile, JSON.stringify(c, null, 2));

  function register(entries, label, fixedId) {
    const id = fixedId || 'p' + ++seq;
    sessions.set(id, { map: new Map(entries.map((e) => [e.name, e.data])), label });
    const report = validatePackage(entries);
    return { id, label, report, launch: report.info.launch, mastery: report.info.masteryscore, title: report.info.titulo };
  }

  const send = (res, code, body, type) => { res.writeHead(code, { 'Content-Type': type || MIME['.json'], 'Cache-Control': 'no-store' }); res.end(body); };
  const json = (res, code, obj) => send(res, code, JSON.stringify(obj));
  const body = (req, limit = 25 * 1024 * 1024) => new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error('Archivo demasiado grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
  const sendFile = (res, file, dl) => {
    const h = { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' };
    if (dl) h['Content-Disposition'] = `attachment; filename="${path.basename(file)}"`;
    res.writeHead(200, h); res.end(fs.readFileSync(file));
  };
  const within = (dir, file) => { const f = path.resolve(dir, file); return f.startsWith(path.resolve(dir) + path.sep) ? f : null; };

  async function api(req, res, p, q) {
    const m = req.method;
    // ----- proyectos -----
    if (p === '/api/projects' && m === 'GET') {
      const list = fs.readdirSync(dirs.proyectos).filter((f) => f.endsWith('.json')).map((f) => {
        const st = fs.statSync(path.join(dirs.proyectos, f));
        const o = { id: f.replace(/\.json$/, ''), titulo: f, mtime: st.mtimeMs, modulos: 0, pantallas: 0, preguntas: 0, color: 'teal', descripcion: '' };
        try {
          const c = JSON.parse(fs.readFileSync(path.join(dirs.proyectos, f), 'utf8'));
          o.titulo = (c.curso && c.curso.titulo) || f; o.color = (c.curso && c.curso.color) || 'teal'; o.descripcion = (c.curso && c.curso.descripcion) || '';
          o.tipo = (c.curso || {}).tipo || 'curso'; o.modulos = (c.modulos || []).length; o.pantallas = (c.modulos || []).reduce((a, mm) => a + (mm.pantallas || []).length, 0);
          o.preguntas = ((c.evaluacion || {}).preguntas || []).length;
          o.errores = validateCourse(c).errors.length;
        } catch (e) {}
        return o;
      }).sort((a, b) => b.mtime - a.mtime);
      return json(res, 200, list);
    }
    if (p === '/api/packages-info') {
      return json(res, 200, fs.readdirSync(dirs.cursos).filter((f) => /\.zip$/i.test(f)).map((f) => { const st = fs.statSync(path.join(dirs.cursos, f)); return { name: f, size: st.size, mtime: st.mtimeMs }; }).sort((a, b) => b.mtime - a.mtime));
    }
    if (p === '/api/package' && m === 'DELETE') {
      const f = within(dirs.cursos, safeFile(q.get('name'))); if (f && fs.existsSync(f)) fs.unlinkSync(f); return json(res, 200, { ok: true });
    }
    if (p === '/api/ai/status') return json(res, 200, ai.status());
    if (p === '/api/ai/download' && m === 'POST') return json(res, 200, ai.descargar(q.get('id')));
    if (p === '/api/ai/download' && m === 'GET') return json(res, 200, require('./modeldl').progress());
    if (p === '/api/ai/download/cancel' && m === 'POST') return json(res, 200, ai.cancelarDescarga());
    if (p === '/api/ai/select' && m === 'POST') { try { return json(res, 200, await ai.elegir(q.get('id'))); } catch (e) { return json(res, 400, { error: e.message }); } }
    if (p === '/api/ai/unload' && m === 'POST') { await ai.unload(); return json(res, 200, ai.status()); }
    if (p === '/api/ai' && m === 'POST') {
      const { tarea, args } = JSON.parse((await body(req)).toString('utf8'));
      const ac = new AbortController(); res.on('close', () => { if (!res.writableEnded) ac.abort(); });
      try { return json(res, 200, { ok: true, resultado: await ai.run(tarea, args, { signal: ac.signal }) }); }
      catch (e) { return json(res, 200, { ok: false, error: ac.signal.aborted ? 'Cancelado' : e.message }); }
    }
    if (p === '/api/parse-doc' && m === 'POST') {
      try { const nm = q.get('name') || 'documento'; return json(res, 200, parseDoc(q.get('as') === 'md' ? nm.replace(/\.[^.]+$/, '') + '.md' : nm, await body(req), q.get('as') === 'md' ? nm : null)); }
      catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (p === '/api/project') {
      const id = slug(q.get('id'));
      if (!id) return json(res, 400, { error: 'id requerido' });
      const file = path.join(dirs.proyectos, id + '.json');
      if (m === 'GET') return fs.existsSync(file) ? sendFile(res, file) : json(res, 404, { error: 'No existe' });
      if (m === 'POST') {
        const data = JSON.parse((await body(req)).toString('utf8'));
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        return json(res, 200, { ok: true, id });
      }
      if (m === 'DELETE') { if (fs.existsSync(file)) fs.unlinkSync(file); return json(res, 200, { ok: true }); }
    }
    // ----- vista previa y generación -----
    if (p === '/api/preview' && m === 'POST') {
      const course = JSON.parse((await body(req)).toString('utf8'));
      // vista previa tolerante con borradores: se omiten preguntas aún incompletas
      if (course.evaluacion && Array.isArray(course.evaluacion.preguntas)) course.evaluacion.preguntas = course.evaluacion.preguntas.filter((q) => q && String(q.enunciado || '').trim() && (q.opciones || []).filter((o) => String(o || '').trim()).length >= 2);
      const v = validateCourse(course);
      if (v.errors.length) return json(res, 200, { ok: false, errors: v.errors });
      const { files } = buildFiles(course, { baseDir: dirs.stock, stockDir: dirs.stock, formato: 'scorm12' }); // la vista previa no exige LMS
      const r = register(files, 'vista previa', 'prev');
      return json(res, 200, { ok: true, launch: r.launch });
    }
    if (p === '/api/build' && m === 'POST') {
      const course = JSON.parse((await body(req)).toString('utf8'));
      const v = validateCourse(course);
      if (v.errors.length) return json(res, 200, { ok: false, errors: v.errors, warnings: v.warnings });
      const { zip, warnings, formato } = buildZip(course, { baseDir: dirs.stock, stockDir: dirs.stock });
      const name = slug(course.curso.id) + (formato === 'scorm12' ? '' : '-' + formato) + '.zip';
      fs.writeFileSync(path.join(dirs.cursos, name), zip);
      const report = validatePackage(readZip(zip), formato);
      return json(res, 200, { ok: true, name, size: zip.length, formato, warnings: [...new Set(warnings)], report });
    }
    // ----- banco de imágenes -----
    if (p === '/api/stock' && m === 'GET') {
      const cat = readCatalog();
      const list = fs.readdirSync(dirs.stock).filter((f) => IMG_RE.test(f)).map((f) => ({
        archivo: f, etiquetas: (cat[f] && cat[f].etiquetas) || [], descripcion: (cat[f] && cat[f].descripcion) || ''
      }));
      return json(res, 200, list);
    }
    if (p === '/api/stock' && m === 'POST') {
      const name = safeFile(q.get('name'));
      if (!IMG_RE.test(name)) return json(res, 400, { error: 'Formato no soportado (png, jpg, gif, svg, webp)' });
      fs.writeFileSync(path.join(dirs.stock, name), await body(req, 10 * 1024 * 1024));
      return json(res, 200, { ok: true, archivo: name });
    }
    if (p === '/api/doc' && m === 'POST') { // documentos descargables (PDF, Word, Excel)
      const name = safeFile(q.get('name'));
      if (!/\.(pdf|docx?|xlsx?)$/i.test(name)) return json(res, 400, { error: 'Formato no soportado (pdf, doc, docx, xls, xlsx)' });
      const buf = await body(req, 25 * 1024 * 1024);
      fs.writeFileSync(path.join(dirs.stock, name), buf);
      return json(res, 200, { ok: true, archivo: name, size: buf.length });
    }
    if (p === '/api/stock' && m === 'DELETE') {
      const f = within(dirs.stock, safeFile(q.get('name')));
      if (f && fs.existsSync(f)) fs.unlinkSync(f);
      return json(res, 200, { ok: true });
    }
    if (p === '/api/stock-meta' && m === 'POST') {
      const d = JSON.parse((await body(req)).toString('utf8'));
      const cat = readCatalog(); const k = safeFile(d.archivo);
      cat[k] = { etiquetas: (d.etiquetas || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean), descripcion: String(d.descripcion || '') };
      writeCatalog(cat); return json(res, 200, { ok: true });
    }
    // ----- player -----
    if (p === '/api/packages') return json(res, 200, fs.readdirSync(dirs.cursos).filter((f) => /\.zip$/i.test(f)));
    if (p === '/api/load-local') {
      const file = within(dirs.cursos, safeFile(q.get('name')));
      if (!file || !fs.existsSync(file)) return json(res, 404, { error: 'No existe ' + q.get('name') });
      return json(res, 200, register(readZip(fs.readFileSync(file)), path.basename(file)));
    }
    if (p === '/api/load-zip' && m === 'POST') {
      return json(res, 200, register(readZip(await body(req)), q.get('name') || 'paquete.zip'));
    }
    return json(res, 404, { error: 'Ruta desconocida' });
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    const fail = (e) => { if (!res.headersSent) json(res, 500, { error: e.message }); };
    try {
      if (p.startsWith('/api/')) { api(req, res, p, url.searchParams).catch(fail); return; }
      if (p === '/') { res.writeHead(302, { Location: '/home/' }); return res.end(); }
      if (p === '/download/' || p.startsWith('/download/')) {
        const f = within(dirs.cursos, safeFile(p.slice(10)));
        if (!f || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
        return sendFile(res, f, true);
      }
      if (p.startsWith('/stock/')) {
        const f = within(dirs.stock, safeFile(p.slice(7)));
        if (!f || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
        return sendFile(res, f);
      }
      if (p.startsWith('/vendor/')) { const f = vendorFile(p); if (!f) { res.writeHead(404); return res.end('404'); } return sendFile(res, f); }
      if (p === '/shared/schema.js') return sendFile(res, path.join(ROOT, 'src', 'schema.js'));
      if (p.startsWith('/shared/')) {
        const f = within(path.join(ROOT, 'shared'), p.slice(8));
        if (!f || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
        return sendFile(res, f);
      }
      if (p.startsWith('/pkg/')) {
        const [, , id, ...rest] = p.split('/');
        const s = sessions.get(id);
        if (!s) { res.writeHead(404); return res.end('Sesión no encontrada'); }
        const name = rest.join('/');
        const data = s.map.get(name);
        if (!data) { res.writeHead(404); return res.end('No existe en el paquete: ' + name); }
        return send(res, 200, data, MIME[path.extname(name).toLowerCase()] || 'application/octet-stream');
      }
      let base = PLAYER_DIR;
      if (p.startsWith('/editor/')) { base = EDITOR_DIR; p = p.slice(7); }
      else if (p.startsWith('/home/')) { base = HOME_DIR; p = p.slice(5); }
      else if (p.startsWith('/utilidades/')) { base = UTIL_DIR; p = p.slice(11); }
      if (p.endsWith('/')) p += 'index.html';
      const file = within(base, p.replace(/^\/+/, ''));
      if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('404'); }
      sendFile(res, file);
    } catch (e) { fail(e); }
  });

  return new Promise((resolve) => server.listen(port, host, () => resolve({ server, dirs, url: `http://${host}:${server.address().port}/`, register })));
}

module.exports = { start, readDirEntries, seed };
