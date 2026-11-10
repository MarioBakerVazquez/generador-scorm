'use strict';
/* Descarga del modelo de IA local desde un repositorio abierto (Hugging Face) con progreso, cancelación y reanudación.
   Solo se usa si el usuario lo pide; después la IA funciona 100 % sin internet. */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

let job = null; // { id, archivo, recibido, total, estado, error, t0, base, req, ws }

function get(url, headers, redirects) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: Object.assign({ 'User-Agent': 'GeneradorSCORM-ModelDownloader' }, headers) }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirects <= 0) return reject(new Error('Demasiadas redirecciones'));
        return resolve(get(new URL(res.headers.location, url).href, headers, redirects - 1));
      }
      resolve(res);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('El servidor no responde. Revisa tu conexión a internet.')));
    if (job) job.req = req;
  });
}

function progress() {
  if (!job) return { estado: 'inactivo' };
  const seg = Math.max(1, (Date.now() - job.t0) / 1000);
  const vel = (job.recibido - job.base) / seg;
  return { estado: job.estado, id: job.id, archivo: job.archivo, recibido: job.recibido, total: job.total, velocidad: Math.round(vel), restante: vel > 1 ? Math.round((job.total - job.recibido) / vel) : null, error: job.error || null };
}

function enCurso() { return !!job && job.estado === 'descargando'; }

/* modelo: { id, archivo, bytes, url } ; dir: carpeta destino */
async function start(modelo, dir, onDone) {
  if (enCurso()) return progress();
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, modelo.archivo), part = dest + '.part';
  job = { id: modelo.id, archivo: modelo.archivo, recibido: 0, total: modelo.bytes, estado: 'descargando', error: null, t0: Date.now(), base: 0, req: null, ws: null };
  const mine = job;
  const fail = (m) => { if (job === mine && mine.estado === 'descargando') { mine.estado = 'error'; mine.error = m; } try { mine.ws && mine.ws.destroy(); } catch (e) { /* nada */ } };
  (async () => {
    try {
      // espacio libre (con 5 % de margen)
      try { const f = fs.statfsSync(dir); if (f.bavail * f.bsize < modelo.bytes * 1.05) return fail('No hay espacio suficiente en el disco (se necesitan ' + (modelo.bytes / 1073741824).toFixed(1) + ' GB libres).'); } catch (e) { /* statfs no disponible */ }
      let have = fs.existsSync(part) ? fs.statSync(part).size : 0;
      if (have >= modelo.bytes) have = 0;
      const res = await get(modelo.url, have ? { Range: 'bytes=' + have + '-' } : {}, 6);
      if (res.statusCode !== 200 && res.statusCode !== 206) { res.resume(); return fail('El repositorio respondió con el error ' + res.statusCode + '. Intenta más tarde o descarga el archivo a mano.'); }
      const append = res.statusCode === 206 && have > 0;
      if (!append) have = 0;
      const len = Number(res.headers['content-length'] || 0);
      mine.total = len ? have + len : modelo.bytes; mine.recibido = have; mine.base = have; mine.t0 = Date.now();
      if (Math.abs(mine.total - modelo.bytes) > 1024 * 1024) { res.resume(); return fail('El archivo del repositorio no tiene el tamaño esperado; puede haber cambiado. Descárgalo a mano.'); }
      const ws = fs.createWriteStream(part, { flags: append ? 'a' : 'w' });
      mine.ws = ws;
      res.on('data', (c) => { mine.recibido += c.length; });
      res.on('error', (e) => fail('Se interrumpió la descarga: ' + e.message + '. Vuelve a pulsar Descargar para continuar donde se quedó.'));
      ws.on('error', (e) => fail('No se pudo escribir el archivo: ' + e.message));
      ws.on('close', () => {
        if (mine.estado !== 'descargando') return;
        let size = 0; try { size = fs.statSync(part).size; } catch (e) { /* nada */ }
        if (size !== modelo.bytes) return fail('La descarga quedó incompleta (' + Math.round(size / 1048576) + ' de ' + Math.round(modelo.bytes / 1048576) + ' MB). Pulsa Descargar para continuar.');
        try { fs.renameSync(part, dest); } catch (e) { return fail('No se pudo guardar el modelo: ' + e.message); }
        mine.estado = 'listo'; mine.recibido = mine.total;
        try { onDone && onDone(); } catch (e) { /* nada */ }
      });
      res.pipe(ws);
    } catch (e) { fail(e.message || String(e)); }
  })();
  return progress();
}

function cancel() {
  if (!enCurso()) return progress();
  job.estado = 'cancelado';
  try { job.req && job.req.destroy(); } catch (e) { /* nada */ }
  try { job.ws && job.ws.destroy(); } catch (e) { /* nada */ }
  return progress();
}

module.exports = { start, cancel, progress, enCurso };
