'use strict';
/* IA local (100 % offline) con node-llama-cpp + modelo GGUF. Carga perezosa: no consume RAM hasta el primer uso. */
const fs = require('fs');
const path = require('path');

const modeldl = require('./modeldl');

/* Modelos que la app sabe descargar de repositorios abiertos (Hugging Face).
   nivel: ligero / equilibrado / potente (opcional, para equipos con mucha RAM). ramMin = RAM total recomendada en GB. */
const HF = 'https://huggingface.co/Qwen/', BA = 'https://huggingface.co/bartowski/';
const CATALOGO = [
  { id: 'qwen2.5-1.5b', nivel: 'ligero', nombre: 'Qwen2.5 1.5B Instruct (Q4)', archivo: 'qwen2.5-1.5b-instruct-q4_k_m.gguf', bytes: 1117320736, ramMin: 4, recMin: 4, nucleosMin: 2,
    url: HF + 'Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf', pagina: HF + 'Qwen2.5-1.5B-Instruct-GGUF',
    licencia: 'Apache-2.0 (uso comercial permitido)', comercial: true, nota: 'Rápido y ligero para equipos modestos; redacta con menos calidad.' },
  { id: 'qwen2.5-3b', nivel: 'equilibrado', nombre: 'Qwen2.5 3B Instruct (Q4)', archivo: 'qwen2.5-3b-instruct-q4_k_m.gguf', bytes: Number(process.env.GS_MODEL_BYTES) || 2104932768, ramMin: 6, recMin: 8, nucleosMin: 4,
    url: process.env.GS_MODEL_URL || HF + 'Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf', pagina: HF + 'Qwen2.5-3B-Instruct-GGUF',
    licencia: 'Qwen Research (solo uso no comercial)', comercial: false, nota: 'Buen equilibrio entre calidad y velocidad.' },
  { id: 'qwen2.5-7b', nivel: 'potente', opcional: true, nombre: 'Qwen2.5 7B Instruct (Q4)', archivo: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf', bytes: 4683074240, ramMin: 12, recMin: 24, nucleosMin: 8,
    url: BA + 'Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf', pagina: BA + 'Qwen2.5-7B-Instruct-GGUF',
    licencia: 'Apache-2.0 (uso comercial permitido)', comercial: true, nota: 'Opcional, para equipos potentes: redacción notablemente mejor, pero más lento.' },
  { id: 'qwen2.5-14b', nivel: 'muy potente', opcional: true, nombre: 'Qwen2.5 14B Instruct (Q4)', archivo: 'Qwen2.5-14B-Instruct-Q4_K_M.gguf', bytes: 8988110976, ramMin: 24, recMin: 48, nucleosMin: 8,
    url: BA + 'Qwen2.5-14B-Instruct-GGUF/resolve/main/Qwen2.5-14B-Instruct-Q4_K_M.gguf', pagina: BA + 'Qwen2.5-14B-Instruct-GGUF',
    licencia: 'Apache-2.0 (uso comercial permitido)', comercial: true, nota: 'Opcional, solo para equipos muy potentes (32 GB de RAM o más).' }
];
const MODEL_FILE = CATALOGO[1].archivo;
let llama = null, model = null, loading = null, lastError = null, busy = 0, activeFile = null, loadedId = null;

/* Carpetas donde se busca el modelo (la primera es donde se descarga) */
function modelDirs() {
  const dirs = [process.env.GS_MODEL_DIR, process.resourcesPath && path.join(process.resourcesPath, 'models'), path.join(__dirname, '..', 'models')];
  if (process.env.LOCALAPPDATA) dirs.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'Generador SCORM', 'resources', 'models'));
  return dirs.filter(Boolean);
}
function modelDir() { return process.env.GS_MODEL_DIR || (process.resourcesPath ? path.join(process.resourcesPath, 'models') : path.join(__dirname, '..', 'models')); }
function pathOf(m) { for (const d of modelDirs()) { const p = path.join(d, m.archivo); if (fs.existsSync(p)) return p; } return null; }

/* Elección del usuario (se guarda junto a los modelos) */
const selFile = () => path.join(modelDir(), 'modelo-elegido.json');
let eleccion;
function elegido() {
  if (eleccion === undefined) { try { eleccion = JSON.parse(fs.readFileSync(selFile(), 'utf8')).id || null; } catch (e) { eleccion = null; } }
  return eleccion;
}
async function elegir(id) {
  const m = CATALOGO.find((x) => x.id === id);
  if (!m) throw new Error('Modelo desconocido.');
  if (!pathOf(m)) throw new Error('Ese modelo aún no está instalado.');
  eleccion = id;
  try { fs.mkdirSync(modelDir(), { recursive: true }); fs.writeFileSync(selFile(), JSON.stringify({ id })); } catch (e) { /* queda solo en memoria durante esta sesión */ }
  lastError = null;
  await unload();
  return status();
}

/* Equipo: RAM, núcleos y (si el modelo ya se cargó alguna vez) la tarjeta gráfica detectada */
let gpuInfo = null;
function equipo() {
  const os = require('os'), cpus = os.cpus() || [];
  return { ramGB: Math.round(os.totalmem() / 1073741824 * 10) / 10, libreGB: Math.round(os.freemem() / 1073741824 * 10) / 10, nucleos: cpus.length, cpu: ((cpus[0] && cpus[0].model) || '').replace(/\s+/g, ' ').trim(), gpu: gpuInfo };
}
function apto(m, eq) { return eq.ramGB >= m.ramMin * 0.95 && eq.nucleos >= m.nucleosMin; }
/* Recomendado = el más grande que el equipo mueve con holgura (RAM total y núcleos). */
function recomendarId(eq) {
  let best = null;
  for (const m of CATALOGO) if (eq.ramGB >= m.recMin * 0.95 && eq.nucleos >= m.nucleosMin) best = m;
  return (best || CATALOGO[0]).id;
}
function motivo(m, eq, rec) {
  if (m.id === rec) return 'Recomendado para tu equipo (' + eq.ramGB + ' GB de RAM, ' + eq.nucleos + ' núcleos).';
  if (eq.ramGB < m.ramMin * 0.95) return 'Necesita ~' + m.ramMin + ' GB de RAM; tu equipo tiene ' + eq.ramGB + ' GB: iría muy lento o podría fallar.';
  if (eq.nucleos < m.nucleosMin) return 'Tu procesador (' + eq.nucleos + ' núcleos) quedaría justo para este modelo.';
  return m.nivel === 'ligero' ? 'Más rápido, con menos calidad.' : 'Tu equipo puede con él; será más lento pero redacta mejor.';
}
/* Modelo que se usa: el elegido si está instalado; si no, el instalado más cercano al recomendado */
function activo() {
  const sel = CATALOGO.find((x) => x.id === elegido());
  if (sel && pathOf(sel)) return sel;
  const rec = CATALOGO.findIndex((x) => x.id === recomendarId(equipo()));
  const inst = CATALOGO.filter((x) => pathOf(x));
  inst.sort((a, b) => Math.abs(CATALOGO.indexOf(a) - rec) - Math.abs(CATALOGO.indexOf(b) - rec));
  return inst[0] || null;
}
function modelPath() { const m = activo(); activeFile = m; return m ? pathOf(m) : null; }
function status() {
  const p = modelPath(), eq = equipo(), rec = recomendarId(eq);
  const act = activeFile || CATALOGO[1];
  return { disponible: !!p, modelo: act.nombre, modeloId: act.id, archivo: act.archivo, carpeta: modelDir(), cargado: !!model, cargando: !!loading && !model, ocupado: busy > 0, error: lastError, tamano: p ? fs.statSync(p).size : 0,
    equipo: eq, recomendado: rec, elegido: elegido(),
    catalogo: CATALOGO.map((m) => ({ id: m.id, nombre: m.nombre, nivel: m.nivel, opcional: !!m.opcional, archivo: m.archivo, bytes: m.bytes, ramMin: m.ramMin, pagina: m.pagina, licencia: m.licencia, comercial: m.comercial, nota: m.nota,
      instalado: !!pathOf(m), enUso: !!p && m.id === act.id, recomendado: m.id === rec, apto: apto(m, eq), motivo: motivo(m, eq, rec) })),
    descarga: modeldl.progress() };
}
function descargar(id) {
  const m = CATALOGO.find((x) => x.id === id) || CATALOGO[1];
  return modeldl.start(m, modelDir(), () => { lastError = null; if (!model) loading = null; });
}
function cancelarDescarga() { return modeldl.cancel(); }

async function ensure() {
  const want = modelPath();
  if (model && loadedId !== (activeFile && activeFile.id)) await unload();
  if (model) return model;
  if (!loading) loading = (async () => {
    if (!want) throw new Error('No se encontró ningún modelo de IA instalado.');
    const { getLlama } = await import('node-llama-cpp');
    llama = await getLlama({ logLevel: 'error' });
    try { const g = llama.gpu; gpuInfo = g && g !== 'false' ? String(g) : null; } catch (e) { /* nada */ }
    model = await llama.loadModel({ modelPath: want });
    loadedId = activeFile && activeFile.id;
    return model;
  })().catch((e) => { lastError = e.message; loading = null; throw e; });
  await loading; return model;
}

let queue = Promise.resolve(); // una tarea de IA a la vez
function serial(fn) { busy++; const r = queue.then(fn, fn); queue = r.catch(() => {}); r.then(() => busy--, () => busy--); return r; }

async function chat(system, user, { json, maxTokens = 700, temperature = 0.4, onToken, signal, ctx: ctxSize = 2048 } = {}) {
  await ensure();
  const { LlamaChatSession } = await import('node-llama-cpp');
  const ctx = await model.createContext({ contextSize: ctxSize });
  try {
    const session = new LlamaChatSession({ contextSequence: ctx.getSequence(), systemPrompt: system });
    const opts = { maxTokens, temperature, signal, onTextChunk: onToken };
    if (json) opts.grammar = await llama.createGrammarForJsonSchema(json);
    const out = await session.prompt(user, opts);
    return json ? JSON.parse(out) : out.trim();
  } finally { await ctx.dispose(); }
}

const SYS = 'Eres un diseñador instruccional experto en capacitación de alimentos y bebidas (restaurantes, hoteles, bar, cocina). Escribes en español claro, directo y profesional, sin inventar datos que no estén en el texto fuente. Escribes SIEMPRE y únicamente en español: nunca uses palabras en inglés.';
const corta = (t, n = 6000) => String(t || '').slice(0, n);

const tareas = {
  /* Genera preguntas de opción múltiple a partir del contenido del curso */
  async preguntas({ texto, n = 3, tema }, o) {
    n = Math.min(10, Math.max(1, +n || 3));
    const S = { type: 'string', minLength: 4, maxLength: 160 };
    const schema = { type: 'object', properties: { preguntas: { type: 'array', minItems: n, maxItems: n, items: { type: 'object', properties: {
      enunciado: S, respuesta_correcta: S, respuestas_incorrectas: { type: 'array', minItems: 3, maxItems: 3, items: S }, explicacion: S },
      required: ['enunciado', 'respuesta_correcta', 'respuestas_incorrectas', 'explicacion'] } } }, required: ['preguntas'] };
    const r = await chat(SYS, 'Con base SOLO en este contenido' + (tema ? ' del curso «' + tema + '»' : '') + ', redacta ' + n + ' preguntas de opción múltiple distintas entre sí. Cada una tiene: enunciado (pregunta completa), respuesta_correcta, 3 respuestas_incorrectas plausibles pero claramente erróneas según el contenido, y una explicacion de una frase. Las respuestas son solo el texto de la opción (máximo 12 palabras), SIN notas, aclaraciones ni la palabra «correcta/incorrecta». Las 4 opciones deben ser del mismo tipo y longitud similar.\n\nCONTENIDO:\n' + corta(texto), { json: schema, maxTokens: 260 * n, ...o });
    return r.preguntas.map((q) => {
      const limpia = (x) => String(x).replace(/^\s*(nota|incorrecta|correcta)\s*:\s*/i, '').trim();
      q.respuesta_correcta = limpia(q.respuesta_correcta); q.respuestas_incorrectas = q.respuestas_incorrectas.map(limpia);
      if ([q.respuesta_correcta].concat(q.respuestas_incorrectas).some((x) => x.split(/\s+/).length > 22 || /\b(no es|incorrect)/i.test(x))) return null;
      const ops = [q.respuesta_correcta].concat(q.respuestas_incorrectas).map((x) => x.trim());
      if (new Set(ops.map((x) => x.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, ''))).size < ops.length) return null; // opciones repetidas: se descarta
      const pos = Math.floor(Math.random() * ops.length); ops.splice(0, 1); ops.splice(pos, 0, q.respuesta_correcta.trim());
      return { enunciado: q.enunciado.trim(), opciones: ops, correcta: pos, retroalimentacion: q.explicacion.trim() };
    }).filter(Boolean);
  },
  /* Reescribe o resume un texto */
  async mejorar({ texto, modo = 'claro', titulo }, o) {
    const instr = { claro: 'Reescríbelo con frases cortas y lenguaje sencillo para un alumno de operación (mesero, barista, cocinero), conservando todos los datos.', resumir: 'Resúmelo en un párrafo breve (máximo 60 palabras) conservando los datos clave.', formal: 'Reescríbelo con un tono profesional y cordial, conservando todos los datos.' }[modo] || '';
    return { texto: await chat(SYS, instr + ' Devuelve únicamente el texto final, sin comillas ni explicaciones.' + (titulo ? '\nTema: ' + titulo : '') + '\n\nTEXTO:\n' + corta(texto, 3500), { maxTokens: 450, ...o }) };
  },
  /* Pule un fragmento de texto digitalizado (OCR): corrige errores evidentes y lo deja en Markdown, SIN resumir ni inventar.
     El cliente lo llama por fragmentos (~1200 caracteres) para mostrar avance y poder cancelar. */
  async formatear({ texto }, o) {
    const src = String(texto || '').trim().slice(0, 2400);
    if (!src) return { texto: '', cambiado: false };
    const out = await chat('Eres un corrector de textos digitalizados por OCR en español. No resumes, no inventas y no agregas información.',
      'Corrige este fragmento: une líneas cortadas, arregla errores evidentes de reconocimiento (letras confundidas, palabras partidas, acentos perdidos) y dale formato Markdown: títulos con # o ##, listas con "- ", párrafos separados por una línea en blanco. Conserva TODO el contenido y los datos (cifras, nombres, temperaturas). Devuelve únicamente el texto corregido.\n\nTEXTO:\n' + src,
      { maxTokens: Math.min(1100, Math.ceil(src.length / 2.4) + 120), temperature: 0.1, ...o });
    const limpio = out.replace(/^```(?:markdown|md)?\s*|\s*```$/g, '').trim();
    // red de seguridad: si la IA recortó o inventó demasiado, se conserva el original
    const r = limpio.length / src.length;
    if (!limpio || r < 0.7 || r > 1.4) return { texto: src, cambiado: false };
    return { texto: limpio, cambiado: true };
  },
  /* Propone el esquema del curso (módulos y pantallas). Si hay manual, cada pantalla apunta a las secciones del manual que la sustentan. */
  async esquema({ tema, secciones = [], publico, nivel, tono, nModulos = 3, porModulo = 3 }, o) {
    nModulos = Math.min(6, Math.max(1, +nModulos || 3)); porModulo = Math.min(5, Math.max(1, +porModulo || 3));
    const hayFuente = secciones.length > 0, validas = new Set(secciones.map((x) => x.i));
    const lista = secciones.map((x) => '[' + x.i + '] ' + x.titulo + (x.resumen ? ' — ' + x.resumen : '')).join('\n');
    const NL = String.fromCharCode(10); const ej = ['CURSO: <título del curso>', 'DESCRIPCION: <una frase sobre lo que aprenderá>', 'MODULO: <título del módulo>', '- <título concreto de la pantalla> | texto' + (hayFuente ? ' | 0,1' : ''), '- <título concreto de la pantalla> | acordeon' + (hayFuente ? ' | 2' : ''), 'MODULO: <título del siguiente módulo>', '- ...'].join(NL);
    const txt = await chat(SYS, 'Diseña la estructura de un curso e-learning' + (tema ? ' sobre «' + tema + '»' : '') + ' para ' + (publico || 'personal de operación') + ', nivel ' + (nivel || 'básico') + ', tono ' + (tono || 'cercano') + '.\nDebe tener exactamente ' + nModulos + ' módulos y ' + porModulo + ' pantallas por módulo. Cada pantalla trata una sola idea, con título corto y concreto (máx. 8 palabras). El tipo es "texto" (explica) o "acordeon" (listas de pasos, tipos o errores).' +
      (hayFuente ? ' Basa todo SOLO en las secciones del manual y, en cada pantalla, escribe al final los números de las secciones que la sustentan, separados por comas.' : '') +
      '\n\nResponde ÚNICAMENTE con este formato (reemplaza lo que va entre < > por títulos reales del tema; no los copies), una línea por elemento y exactamente ' + nModulos + ' módulos de ' + porModulo + ' pantallas cada uno:\n' + ej + (hayFuente ? '\n\nSECCIONES DEL MANUAL:\n' + lista : ''),
      { maxTokens: 120 + nModulos * (25 + porModulo * 32), ctx: 3072, temperature: 0.3, ...o });
    const plan = { titulo: '', descripcion: '', modulos: [] };
    let cur = null;
    txt.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
      let m;
      if ((m = /^curso\s*:\s*(.+)$/i.exec(l))) plan.titulo = m[1].replace(/^["«]|["»]$/g, '').trim();
      else if ((m = /^descripci[oó]n\s*:\s*(.+)$/i.exec(l))) plan.descripcion = m[1].trim();
      else if ((m = /^m[oó]dulo\s*\d*\s*[:.\-–]\s*(.+)$/i.exec(l))) { cur = { titulo: m[1].trim().replace(/^<|>$/g, ''), pantallas: [] }; plan.modulos.push(cur); }
      else if ((m = /^(?:[-*•]|\d+[.)])\s*(.+)$/.exec(l))) {
        if (!cur) { cur = { titulo: tema || 'Módulo 1', pantallas: [] }; plan.modulos.push(cur); }
        const parts = m[1].split('|').map((x) => x.trim());
        const titulo = parts[0].replace(/^["«]|["»]$/g, '').slice(0, 80); if (!titulo || titulo === '...' || /^<|pantalla>|^título (de la|concreto)|^otra pantalla/i.test(titulo)) return;
        const tipo = /acord/i.test(parts[1] || '') ? 'acordeon' : 'texto';
        const sec = ((parts[2] || '').match(/\d+/g) || []).map(Number).filter((n) => validas.has(n)).slice(0, 2);
        cur.pantallas.push({ titulo, tipo, secciones: sec });
      }
    });
    plan.modulos = plan.modulos.filter((m) => m.pantallas.length).slice(0, nModulos);
    plan.modulos.forEach((m) => { m.pantallas = m.pantallas.slice(0, porModulo); });
    if (!plan.modulos.length) throw new Error('La IA no devolvió una estructura utilizable.');
    // la IA elige mal los números de sección: se reasigna por coincidencia de palabras con el título de la pantalla (y del módulo)
    if (hayFuente) {
      const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 4).map((w) => w.replace(/(es|s)$/, ''));
      const idxs = secciones.map((x) => ({ i: x.i, t: new Set(norm(x.titulo)), r: new Set(norm(x.resumen)) }));
      plan.modulos.forEach((m) => m.pantallas.forEach((p) => {
        const w = norm(p.titulo), wm = norm(m.titulo);
        const sc = idxs.map((x) => ({ i: x.i, v: w.reduce((a, k) => a + (x.t.has(k) ? 3 : x.r.has(k) ? 1 : 0), 0) + wm.reduce((a, k) => a + (x.t.has(k) ? 1 : 0), 0) })).sort((a, b) => b.v - a.v);
        if (sc[0] && sc[0].v > 0) p.secciones = sc.filter((x) => x.v >= Math.max(1, sc[0].v - 1)).slice(0, 2).map((x) => x.i);
      }));
    }
    // sin sección asignada: reparte las del manual en orden, para que cada pantalla tenga fuente
    if (hayFuente) { let k = 0; const ids = secciones.map((x) => x.i); plan.modulos.forEach((m) => m.pantallas.forEach((p) => { if (!p.secciones.length) { p.secciones = [ids[Math.min(ids.length - 1, Math.floor(k * ids.length / (nModulos * porModulo)))]]; } k++; })); }
    return plan;
  },
  /* Redacta UNA pantalla a partir del fragmento del manual. */
  async pantalla({ tipo = 'texto', titulo, modulo, curso, publico, nivel, tono, fuente, instruccion }, o) {
    const ctxTxt = fuente ? '\n\nFRAGMENTO DEL MANUAL (usa solo esta información; no inventes cifras, marcas ni pasos que no aparezcan):\n' + corta(fuente, 1500) : '\n\nNo hay manual: escribe solo conocimiento general y seguro del tema, sin cifras específicas dudosas.';
    const base = 'Curso «' + (curso || '') + '», módulo «' + (modulo || '') + '». Escribe la pantalla «' + titulo + '» para ' + (publico || 'personal de operación') + ', nivel ' + (nivel || 'básico') + ', tono ' + (tono || 'cercano') + ', en español. ' + (instruccion ? 'Indicación extra: ' + instruccion + '. ' : '');
    if (tipo === 'acordeon') {
      const schema = { type: 'object', properties: { items: { type: 'array', minItems: 3, maxItems: 4, items: { type: 'object', properties: { encabezado: { type: 'string', maxLength: 50 }, texto: { type: 'string', maxLength: 260 } }, required: ['encabezado', 'texto'] } } }, required: ['items'] };
      const r = await chat(SYS, base + 'Entrega de 3 a 4 elementos de acordeón: cada uno con un encabezado corto y 1–2 frases claras.' + ctxTxt, { json: schema, maxTokens: 420, ctx: 3072, temperature: 0.3, ...o });
      return { items: r.items.map((x) => ({ encabezado: x.encabezado.trim(), texto: x.texto.trim() })).filter((x) => x.encabezado && x.texto) };
    }
    const schema = { type: 'object', properties: { texto: { type: 'string', minLength: 60, maxLength: 700 }, puntos: { type: 'array', minItems: 3, maxItems: 4, items: { type: 'string', maxLength: 90 } } }, required: ['texto', 'puntos'] };
    const r = await chat(SYS, base + 'Entrega "texto": una explicación de 50 a 90 palabras en 1–2 párrafos cortos, y "puntos": 3 o 4 ideas clave de máximo 12 palabras cada una.' + ctxTxt, { json: schema, maxTokens: 400, ctx: 3072, temperature: 0.3, ...o });
    return { texto: r.texto.trim(), puntos: r.puntos.map((x) => x.trim().replace(/^(these|the|this|those)\s+/i, '')).map((x) => x.charAt(0).toUpperCase() + x.slice(1)).filter(Boolean) };
  },
  /* Extrae puntos clave */
  async puntos({ texto, n = 4, titulo }, o) {
    const schema = { type: 'object', properties: { puntos: { type: 'array', minItems: 2, maxItems: 6, items: { type: 'string' } } }, required: ['puntos'] };
    const r = await chat(SYS, 'Extrae ' + n + ' puntos clave, cada uno de máximo 14 palabras, del siguiente texto' + (titulo ? ' sobre «' + titulo + '»' : '') + '.\n\nTEXTO:\n' + corta(texto, 3500), { json: schema, maxTokens: 350, ...o });
    return { puntos: r.puntos.map((x) => x.trim().replace(/^(these|the|this|those)\s+/i, '')).map((x) => x.charAt(0).toUpperCase() + x.slice(1)).filter(Boolean) };
  },
  /* Propone encabezados + texto para un acordeón */
  async acordeon({ texto, titulo }, o) {
    const schema = { type: 'object', properties: { items: { type: 'array', minItems: 3, maxItems: 6, items: { type: 'object', properties: { encabezado: { type: 'string' }, texto: { type: 'string' } }, required: ['encabezado', 'texto'] } } }, required: ['items'] };
    const r = await chat(SYS, 'Organiza el siguiente contenido en 3 a 5 elementos de un acordeón. Cada uno con un encabezado corto (máx. 6 palabras) y 1-2 frases de explicación' + (titulo ? '. Tema: ' + titulo : '') + '.\n\nCONTENIDO:\n' + corta(texto, 3500), { json: schema, maxTokens: 900, ...o });
    return { items: r.items };
  },
  /* Reescribe un texto dado en 3 variantes distintas (acortar / simplificar / tono profesional). No agrega datos nuevos. */
  async variantes({ texto, modo, titulo }, o) {
    const M = { acortar: 'más corto (mitad de palabras o menos), conservando todos los datos importantes', simplificar: 'más simple y claro, con frases cortas y palabras sencillas, sin perder ningún dato', formal: 'con tono profesional y cordial, sin volverlo rígido' }[modo] || 'más claro';
    const schema = { type: 'object', properties: { opciones: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string', minLength: 8, maxLength: 900 } } }, required: ['opciones'] };
    const r = await chat(SYS, 'Reescribe el siguiente texto' + (titulo ? ' (tema: ' + titulo + ')' : '') + ' de 3 formas distintas entre sí, todas ' + M + '. NO agregues datos, cifras ni ejemplos que no estén en el texto. Entrega "opciones" con las 3 versiones.\n\nTEXTO:\n' + corta(texto, 2500), { json: schema, maxTokens: 700, ctx: 3072, temperature: 0.6, ...o });
    const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, '');
    const seen = new Set([norm(texto)]), out = [];
    r.opciones.map((x) => String(x).trim().replace(/^[*•\-\s]+/, '')).forEach((x) => { if (x && !seen.has(norm(x))) { seen.add(norm(x)); out.push(x); } });
    if (!out.length) throw new Error('La IA no propuso versiones distintas. Intenta de nuevo.');
    return { opciones: out };
  },
  /* Extrae objetivos de aprendizaje con verbo de acción a partir de un texto dado */
  async objetivos({ texto, n = 4 }, o) {
    n = Math.min(6, Math.max(2, +n || 4));
    const schema = { type: 'object', properties: { objetivos: { type: 'array', minItems: 3, maxItems: n + 1, items: { type: 'string', minLength: 12, maxLength: 120 } } }, required: ['objetivos'] };
    const r = await chat(SYS, 'Del siguiente material, extrae de 3 a ' + n + ' objetivos de aprendizaje medibles. Cada uno empieza con un verbo de acción en infinitivo (Identificar, Aplicar, Explicar, Distinguir, Preparar…) y describe algo que el alumno podrá hacer, tomado SOLO del material. Máximo 18 palabras cada uno.\n\nMATERIAL:\n' + corta(texto, 3500), { json: schema, maxTokens: 400, ctx: 3072, temperature: 0.3, ...o });
    const lim = r.objetivos.map((x) => String(x).trim().replace(/^[-*•\d.)\s]+/, '').replace(/\.$/, '')).filter(Boolean);
    const verbo = lim.filter((x) => /^[A-Za-zÁÉÍÓÚáéíóúñ]+(ar|er|ir|ír)\b/i.test(x));
    const res = (verbo.length >= 2 ? verbo : lim).map((x) => x.charAt(0).toUpperCase() + x.slice(1));
    if (!res.length) throw new Error('La IA no encontró objetivos en ese texto.');
    return { objetivos: Array.from(new Set(res)) };
  },
  /* Convierte un texto en la estructura de un bloque interactivo (formato de líneas compacto). */
  async bloque({ tipo, texto, titulo }, o) {
    const NL = String.fromCharCode(10);
    const F = {
      pasos: { n: '3 a 6', fmt: 'Título corto del paso | explicación de una frase', uso: 'los pasos de un proceso, en orden' },
      pestanas: { n: '2 a 4', fmt: 'Título de la pestaña | explicación de 1-2 frases', uso: 'categorías o tipos distintos' },
      tarjetas: { n: '3 a 6', fmt: 'Concepto o pregunta corta | respuesta o definición breve', uso: 'conceptos para repasar' },
      linea_tiempo: { n: '3 a 6', fmt: 'Fecha o etapa | Título corto | una frase', uso: 'hechos o etapas en orden cronológico' },
      relacionar: { n: '3 a 5', fmt: 'Concepto | su pareja correcta', uso: 'parejas concepto-definición que no se repitan' },
      ordenar: { n: '4 a 6', fmt: 'Paso corto', uso: 'los pasos de un proceso, en el orden correcto' },
      escenario: { n: '3', fmt: 'Decisión que puede tomar | qué ocurre si la toma | BUENA o MALA', uso: 'decisiones ante una situación real; solo una es BUENA' }
    }[tipo];
    if (!F) throw new Error('Bloque no soportado por la IA: ' + tipo);
    const pie = tipo === 'escenario' ? 'Primero una línea "SITUACION: ..." con la situación (2 frases) y luego las decisiones.' : '';
    const txt = await chat(SYS, 'Con el siguiente contenido' + (titulo ? ' (tema: ' + titulo + ')' : '') + ' prepara ' + F.n + ' elementos de ' + F.uso + '. Usa SOLO información del contenido. Una línea por elemento, con este formato exacto y sin numerar:' + NL + F.fmt + NL + pie + NL + NL + 'CONTENIDO:' + NL + corta(texto, 3000), { maxTokens: tipo === 'escenario' ? 420 : 520, ctx: 3072, temperature: 0.3, ...o });
    const plantilla = F.fmt.split('|')[0].trim().toLowerCase();
    const rows = String(txt).split(NL).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter((l) => l && l.toLowerCase().split('|')[0].trim() !== plantilla && !/^[<\[].*[>\]]$/.test(l.split('|')[0].trim()));
    const cols = (l) => l.split('|').map((x) => x.trim());
    if (tipo === 'pasos' || tipo === 'pestanas') {
      const it = rows.map(cols).filter((c) => c.length >= 2 && c[0] && c[1]).map((c) => ({ titulo: c[0], texto: c.slice(1).join(' ') }));
      if (it.length < 2) throw new Error('La IA no entregó suficientes elementos. Intenta de nuevo.'); return { items: it };
    }
    if (tipo === 'tarjetas') {
      const it = rows.map(cols).filter((c) => c.length >= 2 && c[0] && c[1]).map((c) => ({ frente: c[0], reverso: c.slice(1).join(' ') }));
      if (it.length < 2) throw new Error('La IA no entregó suficientes elementos. Intenta de nuevo.'); return { items: it };
    }
    if (tipo === 'linea_tiempo') {
      const it = rows.map(cols).filter((c) => c.length >= 2 && c[0] && c[1]).map((c) => ({ fecha: c[0], titulo: c[1], texto: c.slice(2).join(' ') }));
      if (it.length < 2) throw new Error('La IA no entregó suficientes elementos. Intenta de nuevo.'); return { items: it };
    }
    if (tipo === 'relacionar') {
      const pares = rows.map(cols).filter((c) => c.length >= 2 && c[0] && c[1]).map((c) => ({ izq: c[0], der: c.slice(1).join(' ') }));
      if (pares.length < 2) throw new Error('La IA no entregó suficientes parejas. Intenta de nuevo.'); return { pares };
    }
    if (tipo === 'ordenar') {
      const items = rows.map((l) => l.replace(/\|.*$/, '').trim()).filter(Boolean);
      if (items.length < 2) throw new Error('La IA no entregó suficientes pasos. Intenta de nuevo.'); return { items };
    }
    // escenario
    let situacion = '';
    const opciones = [];
    rows.forEach((l) => {
      const m = /^SITUACI[OÓ]N\s*:\s*(.+)$/i.exec(l);
      if (m) { situacion = m[1].trim(); return; }
      const c = cols(l); if (c.length >= 3 && c[0] && c[1]) opciones.push({ texto: c[0], resultado: c[1], correcta: /^buena/i.test(c[c.length - 1]) });
    });
    if (!situacion || opciones.length < 2) throw new Error('La IA no pudo armar el escenario. Intenta de nuevo.');
    if (!opciones.some((x) => x.correcta)) opciones[0].correcta = true;
    return { situacion, opciones };
  }
};

function run(tarea, args, opts) {
  if (!tareas[tarea]) return Promise.reject(new Error('Tarea de IA desconocida: ' + tarea));
  return serial(() => tareas[tarea](args || {}, opts || {}));
}
async function unload() { if (loading && !model) { try { await loading; } catch (e) { /* nada */ } } if (model) { await model.dispose(); model = null; } loading = null; loadedId = null; }

module.exports = { status, run, unload, ensure, MODEL_FILE, descargar, cancelarDescarga, elegir };
