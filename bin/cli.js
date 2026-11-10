#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { buildZip } = require('../src/packager');
const { readZip } = require('../src/zip');
const { validatePackage } = require('../src/validator');
const { start, readDirEntries } = require('../src/server');

const [cmd, ...args] = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };

function printReport(r) {
  for (const c of r.checks) console.log(({ ok: ' OK  ', warn: 'WARN ', error: 'ERROR' })[c.level] + ' ' + c.msg);
  console.log(`\nResultado: ${r.status.toUpperCase()} (${r.errors} errores, ${r.warnings} observaciones)`);
}

(async () => {
  if (cmd === 'build') {
    const src = path.resolve(args[0] || '');
    if (!args[0] || !fs.existsSync(src)) { console.error('Uso: build <curso.json> [--stock carpeta] [--out archivo.zip]'); process.exit(2); }
    const course = JSON.parse(fs.readFileSync(src, 'utf8'));
    const stockDir = path.resolve(flag('stock', path.dirname(src)));
    const out = path.resolve(flag('out', path.join('out', `${course.curso.id}.zip`)));
    const { zip, files, warnings } = buildZip(course, { baseDir: path.dirname(src), stockDir });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, zip);
    warnings.forEach((w) => console.log('AVISO ' + w));
    console.log(`Paquete SCORM 1.2: ${out} (${files.length} archivos, ${(zip.length / 1024).toFixed(1)} KB)`);
    printReport(validatePackage(readZip(zip)));
  } else if (cmd === 'validate') {
    const t = path.resolve(args[0] || '');
    if (!args[0] || !fs.existsSync(t)) { console.error('Uso: validate <paquete.zip | carpeta>'); process.exit(2); }
    const entries = fs.statSync(t).isDirectory() ? readDirEntries(t) : readZip(fs.readFileSync(t));
    const r = validatePackage(entries);
    printReport(r);
    process.exit(r.errors ? 1 : 0);
  } else if (cmd === 'player') {
    const s = await start({ port: Number(flag('port', 4173)), workDir: path.resolve(flag('work', 'datos')), seedDir: path.join(__dirname, '..', 'ejemplo') });
    console.log('Generador SCORM en ' + s.url + '  (Ctrl+C para salir)');
  } else {
    console.log('Comandos:\n  build <curso.json> [--stock dir] [--out zip]\n  validate <zip|carpeta>\n  player [--port 4173] [--dir out]');
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
