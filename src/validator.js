'use strict';
// Validación estática de un paquete SCORM 1.2 (manifiesto, archivos, recursos externos).

// Parser XML mínimo pero estricto con la buena formación (etiquetas balanceadas).
function parseXml(src) {
  src = src.replace(/^﻿/, '');
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|(<)/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[7]) throw new Error('XML mal formado cerca de la posición ' + m.index);
    if (m[6] !== undefined) { stack[stack.length - 1].text += m[6]; continue; }
    if (m[1] !== undefined) { stack[stack.length - 1].text += m[1]; continue; }
    if (!m[3]) continue; // comentario / PI
    if (m[2]) {
      const top = stack.pop();
      if (top.name !== m[3]) throw new Error(`Etiqueta de cierre </${m[3]}> no coincide con <${top.name}>`);
      continue;
    }
    const attrs = {};
    String(m[4]).replace(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (_, k, a, b) => { attrs[k] = a !== undefined ? a : b; });
    const node = { name: m[3], attrs, children: [], text: '' };
    stack[stack.length - 1].children.push(node);
    if (!m[5]) stack.push(node);
  }
  if (stack.length !== 1) throw new Error(`Etiqueta <${stack[stack.length - 1].name}> sin cerrar`);
  if (root.children.length !== 1) throw new Error('El XML debe tener exactamente un elemento raíz');
  return root.children[0];
}
const local = (n) => n.name.replace(/^.*:/, '');
const kids = (n, name) => n.children.filter((c) => local(c) === name);
const kid = (n, name) => kids(n, name)[0];

function validatePackage(entries, formato) {
  if (formato === 'xapi' || formato === 'web') return validateSimple(entries, formato);
  // entries: [{ name, data }]
  const checks = [];
  const add = (level, msg) => checks.push({ level, msg }); // level: ok | warn | error
  const byName = new Map(entries.map((e) => [e.name, e]));
  const info = { titulo: '', version: '', launch: null, masteryscore: null, org: '', scos: [] };

  const mf = byName.get('imsmanifest.xml');
  if (!mf) { add('error', 'Falta imsmanifest.xml en la raíz del paquete'); return finish(); }

  let root;
  try { root = parseXml(mf.data.toString('utf8')); add('ok', 'imsmanifest.xml bien formado'); }
  catch (e) { add('error', 'imsmanifest.xml mal formado: ' + e.message); return finish(); }

  if (local(root) !== 'manifest') add('error', 'La raíz del manifiesto debe ser <manifest>');
  if (!root.attrs.identifier) add('error', '<manifest> sin atributo identifier');

  const md = kid(root, 'metadata');
  const sv = md && kid(md, 'schemaversion');
  const sc = md && kid(md, 'schema');
  info.version = sv ? sv.text.trim() : '';
  if (!md || !sv) add('error', 'Falta <metadata><schemaversion>');
  else if (info.version === '2004 4th Edition') add('ok', 'Metadata: SCORM 2004 4.ª edición');
  else if (info.version !== '1.2') add('warn', `schemaversion "${info.version}": se esperaba 1.2 o 2004 4th Edition`);
  else add('ok', 'Metadata: SCORM 1.2');
  if (sc && sc.text.trim() !== 'ADL SCORM') add('warn', `<schema> es "${sc.text.trim()}", se espera "ADL SCORM"`);

  const orgs = kid(root, 'organizations');
  const res = kid(root, 'resources');
  if (!orgs) add('error', 'Falta <organizations>');
  if (!res) add('error', 'Falta <resources>');
  if (!orgs || !res) return finish();

  const orgList = kids(orgs, 'organization');
  const defId = orgs.attrs.default;
  const org = orgList.find((o) => o.attrs.identifier === defId);
  if (!defId) add('error', '<organizations> sin atributo default');
  else if (!org) add('error', `organización por defecto "${defId}" no existe`);
  else { info.org = org.attrs.identifier; const t = kid(org, 'title'); info.titulo = t ? t.text.trim() : ''; if (!info.titulo) add('warn', 'La organización no tiene <title>'); }

  const resources = new Map(kids(res, 'resource').map((r) => [r.attrs.identifier, r]));
  const referenced = new Set();
  const walkItems = (node) => {
    for (const it of kids(node, 'item')) {
      if (it.attrs.identifierref) {
        const r = resources.get(it.attrs.identifierref);
        if (!r) add('error', `item "${it.attrs.identifier}" apunta a recurso inexistente "${it.attrs.identifierref}"`);
        else {
          const ms = kid(it, 'masteryscore');
          const sq = kid(it, 'sequencing'), po = sq && kid(kid(sq, 'objectives') || { children: [] }, 'primaryObjective'), mm = po && kid(po, 'minNormalizedMeasure');
          if (mm) info.masteryscore = Math.round(Number(mm.text.trim()) * 100);
          const st = r.attrs['adlcp:scormtype'] || r.attrs.scormtype || r.attrs['adlcp:scormType'];
          info.scos.push({ item: it.attrs.identifier, resource: r.attrs.identifier, href: r.attrs.href, scormtype: st });
          if (ms) info.masteryscore = Number(ms.text.trim());
          if (!info.launch) info.launch = r.attrs.href;
        }
      }
      walkItems(it);
    }
  };
  if (org) { walkItems(org); if (!info.scos.length) add('error', 'La organización no tiene ningún item con recurso (SCO)'); }

  for (const r of resources.values()) {
    const st = r.attrs['adlcp:scormtype'] || r.attrs.scormtype || r.attrs['adlcp:scormType'];
    if (!st) add('error', `recurso "${r.attrs.identifier}" sin adlcp:scormtype`);
    else if (!['sco', 'asset'].includes(st)) add('error', `recurso "${r.attrs.identifier}": scormtype "${st}" inválido`);
    if (r.attrs.href) {
      const h = decodeURI(r.attrs.href.split('?')[0].split('#')[0]);
      referenced.add(h);
      if (!byName.has(h)) add('error', `Recurso de arranque inexistente: ${r.attrs.href}`);
    } else add('error', `recurso "${r.attrs.identifier}" sin href`);
    for (const f of kids(r, 'file')) {
      const h = decodeURI((f.attrs.href || '').split('?')[0]);
      referenced.add(h);
      if (!byName.has(h)) add('error', `Archivo referenciado no existe en el paquete: ${f.attrs.href}`);
    }
  }
  if (info.launch && byName.has(info.launch)) add('ok', `Recurso de arranque: ${info.launch}`);
  const missingBefore = checks.filter((c) => c.level === 'error' && /no existe|inexistente/.test(c.msg)).length;
  if (!missingBefore) add('ok', `Todos los archivos referenciados existen (${referenced.size})`);

  const orphans = entries.map((e) => e.name).filter((n) => n !== 'imsmanifest.xml' && !referenced.has(n) && !/\.xsd$/i.test(n));
  if (orphans.length) add('warn', `Archivos huérfanos (no listados en el manifiesto): ${orphans.join(', ')}`);
  else add('ok', 'Sin archivos huérfanos');

  // Recursos externos (requisito offline)
  const ext = [];
  for (const e of entries) {
    if (!/\.(html?|css|js|svg|xml)$/i.test(e.name) || e.name === 'imsmanifest.xml') continue;
    const txt = e.data.toString('utf8');
    const re = /(?:https?:)?\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}[^\s"'<>)]*/g;
    let m;
    while ((m = re.exec(txt))) {
      const u = m[0];
      if (/^https?:\/\/(www\.)?w3\.org\//.test(u) || /^https?:\/\/adlnet\.gov\/expapi\//.test(u)) continue; // namespaces XML/SVG, no se descargan
      ext.push(`${e.name}: ${u}`);
    }
  }
  if (ext.length) add('error', 'Referencias a recursos externos (el curso debe funcionar offline): ' + [...new Set(ext)].slice(0, 6).join(' | '));
  else add('ok', 'Sin referencias a recursos externos');

  // Responsividad: el SCO debe poder verse bien en móvil
  if (info.launch && byName.has(info.launch)) {
    const html = byName.get(info.launch).data.toString('utf8');
    const css = entries.filter((e) => /\.css$/i.test(e.name)).map((e) => e.data.toString('utf8')).join('\n');
    if (!/<meta[^>]+name=["']viewport["'][^>]*width\s*=\s*device-width/i.test(html)) add('warn', 'Responsivo: falta <meta viewport> con width=device-width; en móvil se verá como página de escritorio reducida');
    else if (/maximum-scale\s*=\s*1\b|user-scalable\s*=\s*no/i.test(html)) add('warn', 'Accesibilidad: el viewport bloquea el zoom del usuario');
    else if (!/@media/i.test(css) && !/clamp\(/i.test(css)) add('warn', 'Responsivo: la hoja de estilos no tiene reglas adaptables (@media/clamp)');
    else add('ok', 'Responsivo: viewport móvil y estilos adaptables (móvil, tableta y escritorio)');
  }

  // Heurística: el SCO debe usar la API
  if (info.launch && byName.has(info.launch)) {
    const all = entries.filter((e) => /\.(html?|js)$/i.test(e.name)).map((e) => e.data.toString('utf8')).join('\n');
    const v04 = info.version === '2004 4th Edition';
    if (!new RegExp(v04 ? 'API_1484_11' : 'LMSInitialize').test(all)) add('error', v04 ? 'Ningún archivo del SCO busca API_1484_11' : 'Ningún archivo del SCO llama a LMSInitialize');
    if (!new RegExp(v04 ? 'Terminate' : 'LMSFinish').test(all)) add('error', v04 ? 'Ningún archivo del SCO llama a Terminate' : 'Ningún archivo del SCO llama a LMSFinish');
    if (!/lesson_status|completion_status/.test(all)) add('warn', 'El SCO nunca reporta el estado de la lección');
    if (!new RegExp(v04 ? 'Commit' : 'LMSCommit').test(all)) add('warn', 'El SCO nunca hace commit');
  }
  return finish();

  function finish() {
    const errors = checks.filter((c) => c.level === 'error').length;
    const warns = checks.filter((c) => c.level === 'warn').length;
    return { checks, info, errors, warnings: warns, status: errors ? 'errores' : warns ? 'observaciones' : 'aprobado' };
  }
}

// xAPI (tincan.xml) y link web (sin manifiesto): comprobaciones propias
function validateSimple(entries, formato) {
  const checks = [], add = (level, msg) => checks.push({ level, msg });
  const byName = new Map(entries.map((e) => [e.name, e]));
  const info = { titulo: '', version: formato === 'xapi' ? 'xAPI' : 'web', launch: null, masteryscore: null, org: '', scos: [] };
  if (!byName.has('index.html')) add('error', 'Falta index.html en la raíz del paquete'); else { info.launch = 'index.html'; add('ok', 'Archivo de arranque: index.html'); }
  if (formato === 'xapi') {
    const t = byName.get('tincan.xml');
    if (!t) add('error', 'Falta tincan.xml en la raíz del paquete');
    else {
      try {
        const root = parseXml(t.data.toString('utf8')), acts = kid(root, 'activities'), a = acts && kid(acts, 'activity'), l = a && kid(a, 'launch');
        if (!a || !a.attrs.id) add('error', 'tincan.xml: la actividad no tiene id');
        else if (!l || l.text.trim() !== 'index.html') add('error', 'tincan.xml: falta <launch>index.html</launch>');
        else add('ok', 'tincan.xml bien formado (actividad ' + a.attrs.id + ')');
      } catch (e) { add('error', 'tincan.xml mal formado: ' + e.message); }
    }
  }
  const ext = [];
  for (const e of entries) {
    if (!/\.(html?|css|js|svg)$/i.test(e.name)) continue;
    const re = /(?:https?:)?\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}[^\s"'<>)]*/g; let m, txt = e.data.toString('utf8');
    while ((m = re.exec(txt))) { if (/^https?:\/\/(www\.)?w3\.org\//.test(m[0]) || /^https?:\/\/adlnet\.gov\/expapi\//.test(m[0])) continue; ext.push(`${e.name}: ${m[0]}`); }
  }
  if (ext.length) add('error', 'Referencias a recursos externos (el curso debe funcionar offline): ' + [...new Set(ext)].slice(0, 6).join(' | ')); else add('ok', 'Sin referencias a recursos externos');
  const html = byName.get('index.html') ? byName.get('index.html').data.toString('utf8') : '';
  if (html && !/<meta[^>]+name=["']viewport["'][^>]*width\s*=\s*device-width/i.test(html)) add('warn', 'Responsivo: falta <meta viewport> con width=device-width'); else if (html) add('ok', 'Responsivo: viewport móvil');
  add('ok', formato === 'xapi' ? 'El LRS se recibe por los parámetros de lanzamiento (endpoint, auth, actor)' : 'Sin LMS: el avance se guarda en el navegador del alumno');
  const errors = checks.filter((c) => c.level === 'error').length, warns = checks.filter((c) => c.level === 'warn').length;
  return { checks, info, errors, warnings: warns, status: errors ? 'errores' : warns ? 'observaciones' : 'aprobado' };
}

module.exports = { validatePackage, parseXml };
