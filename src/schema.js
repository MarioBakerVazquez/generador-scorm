'use strict';
// Validación del JSON del curso (esquema propuesto en el brief, sección 6).

const BL = (typeof module !== 'undefined' && module.exports) ? require('../shared/bloques.js') : window.Bloques;
const TIPOS_PANTALLA = ['texto_imagen', 'acordeon', 'bloques'];
const ANIMACIONES = ['ninguna', 'fade-in', 'slide-up', 'zoom', 'escalonada'];

function validateCourse(c) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);
  const isStr = (v) => typeof v === 'string' && v.trim() !== '';

  if (!c || typeof c !== 'object') return { errors: ['El JSON del curso no es un objeto'], warnings };

  const cu = c.curso;
  if (!cu || typeof cu !== 'object') err('Falta "curso"');
  else {
    if (!isStr(cu.id)) err('curso.id es obligatorio');
    if (!isStr(cu.titulo)) err('curso.titulo es obligatorio');
    if (cu.puntaje_aprobatorio != null && !(cu.puntaje_aprobatorio >= 0 && cu.puntaje_aprobatorio <= 100))
      err('curso.puntaje_aprobatorio debe estar entre 0 y 100');
    if (!isStr(cu.descripcion)) warn('curso.descripcion está vacía');
  }

  const ids = new Set();
  const uniq = (id, where) => {
    if (!isStr(id)) { err(`${where}: falta id`); return; }
    if (ids.has(id)) err(`${where}: id duplicado "${id}"`);
    ids.add(id);
  };

  const soloEval = !!(cu && cu.tipo === 'evaluacion');
  if (cu && cu.tipo != null && cu.tipo !== 'curso' && cu.tipo !== 'evaluacion') err('curso.tipo debe ser "curso" o "evaluacion"');
  if (soloEval) { if (Array.isArray(c.modulos) && c.modulos.length) warn('Es una evaluación: los módulos se ignoran'); }
  else if (!Array.isArray(c.modulos) || c.modulos.length === 0) err('"modulos" debe tener al menos un módulo');
  else {
    c.modulos.forEach((m, mi) => {
      const mw = `modulos[${mi}]`;
      uniq(m.id, mw);
      if (!isStr(m.titulo)) err(`${mw}: falta titulo`);
      if (!Array.isArray(m.pantallas) || m.pantallas.length === 0) { err(`${mw}: sin pantallas`); return; }
      m.pantallas.forEach((p, pi) => {
        const pw = `${mw}.pantallas[${pi}]`;
        uniq(p.id, pw);
        if (!isStr(p.titulo)) err(`${pw}: falta titulo`);
        if (!TIPOS_PANTALLA.includes(p.tipo)) err(`${pw}: tipo "${p.tipo}" no soportado (${TIPOS_PANTALLA.join(', ')})`);
        if (!isStr(p.fuente)) err(`${pw}: "fuente" es obligatorio (trazabilidad del contenido)`);
        if (p.animacion && !ANIMACIONES.includes(p.animacion)) warn(`${pw}: animación "${p.animacion}" desconocida; se usará fade-in`);
        const ct = p.contenido || {};
        if (p.tipo === 'bloques') {
          if (!Array.isArray(p.bloques) || p.bloques.length === 0) err(`${pw}: la lección no tiene bloques`);
          else p.bloques.forEach((b, k) => BL.validar(b, `${pw}.bloques[${k + 1}]`).forEach(err));
        }
        if (p.tipo === 'acordeon') {
          if (!Array.isArray(ct.items) || ct.items.length === 0) err(`${pw}: acordeón sin items`);
          else ct.items.forEach((it, k) => {
            if (!isStr(it.encabezado) || !isStr(it.texto)) err(`${pw}.items[${k}]: encabezado y texto son obligatorios`);
          });
        }
        if (p.tipo === 'texto_imagen') {
          const hay = isStr(ct.texto) || (Array.isArray(ct.parrafos) && ct.parrafos.length) || (Array.isArray(ct.puntos) && ct.puntos.length);
          if (!hay) err(`${pw}: texto_imagen requiere contenido.texto, parrafos o puntos`);
          if (p.imagen && !p.imagen.archivo) warn(`${pw}: imagen sin archivo (etiquetas: ${(p.imagen.etiquetas || []).join(', ')})`);
        }
      });
    });
  }

  const ev = c.evaluacion;
  if (ev) {
    if (c.curso && c.curso.formato != null && !['scorm12', 'scorm2004', 'xapi', 'web'].includes(c.curso.formato)) err('curso.formato debe ser scorm12, scorm2004, xapi o web');
    if (ev.modo != null && ev.modo !== 'practica' && ev.modo !== 'examen') err('evaluacion.modo debe ser "practica" o "examen"');
    if (ev.mostrar != null && !(Number.isInteger(ev.mostrar) && ev.mostrar >= 0 && ev.mostrar <= 200)) err('evaluacion.mostrar debe ser un entero (0 = todas las preguntas)');
    if (ev.intentos != null && !(Number.isInteger(ev.intentos) && ev.intentos >= 0 && ev.intentos <= 20)) err('evaluacion.intentos debe ser un entero entre 0 (ilimitados) y 20');
  }
  if (soloEval && (!ev || !Array.isArray(ev.preguntas) || ev.preguntas.length === 0)) err('Una evaluación necesita al menos una pregunta');
  else if (!ev || !Array.isArray(ev.preguntas) || ev.preguntas.length === 0) {
    warn('Sin evaluación: el curso se marcará como "completed" al terminar y no reportará puntaje');
  } else {
    ev.preguntas.forEach((q, qi) => {
      const qw = `evaluacion.preguntas[${qi}]`;
      uniq(q.id, qw);
      if (q.tipo !== 'opcion_multiple') err(`${qw}: solo se soporta tipo "opcion_multiple"`);
      if (!isStr(q.enunciado)) err(`${qw}: falta enunciado`);
      if (!Array.isArray(q.opciones) || q.opciones.length < 2 || q.opciones.some((o) => !isStr(o))) err(`${qw}: necesita >= 2 opciones no vacías`);
      else if (!Number.isInteger(q.correcta) || q.correcta < 0 || q.correcta >= q.opciones.length) err(`${qw}: "correcta" fuera de rango`);
      if (!isStr(q.retroalimentacion)) warn(`${qw}: sin retroalimentación`);
    });
  }
  return { errors, warnings };
}

const API = { validateCourse, TIPOS_PANTALLA, ANIMACIONES };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else window.Schema = API;
