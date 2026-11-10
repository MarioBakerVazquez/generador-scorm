/* Modelo de datos v1 (concepto-v1, secciones 8, 14 y 17.1)
   Curso > Módulo > Lección > Objeto de aprendizaje.
   En el JSON del curso:  modulos[] (Módulo)  >  pantallas[] (= Lección)  >  bloques[] (= Objeto de aprendizaje).
   Un objeto tiene UN solo id; el mismo objeto se dibuja con dos renderizadores (escritorio y app móvil), nunca dos copias.
   La intención y la equivalencia móvil salen de una tabla FIJA y determinista (no de la IA). UMD: editor, validador y empaquetador. */
(function (root) {
  'use strict';

  /* ---- Tabla de equivalencias escritorio → móvil (sección 14). intencion = lo que el alumno hace; movil = cómo se ve en la app. ---- */
  var EQUIV = {
    encabezado:       { intencion: 'informar',        movil: 'titulo_de_tarjeta',    funcion: 'Informar, dividido por ideas',               alt: [] },
    parrafo:          { intencion: 'informar',        movil: 'tarjetas_paginadas',   funcion: 'Informar, dividido por ideas (2-3 pantallas)', alt: [] },
    cita:             { intencion: 'destacar',        movil: 'tarjeta_destacada',    funcion: 'Resaltar una idea clave',                    alt: [] },
    lista:            { intencion: 'enumerar',        movil: 'lista_en_tarjeta',     funcion: 'Enumerar o marcar pendientes',               alt: [] },
    resumen:          { intencion: 'resumir',        movil: 'lista_en_tarjeta',     funcion: 'Repasar las ideas clave al cerrar',          alt: [] },
    recursos:         { intencion: 'profundizar',    movil: 'lista_en_tarjeta',     funcion: 'Profundizar con enlaces y lecturas',         alt: [] },
    tabla:            { intencion: 'comparar',        movil: 'tarjetas_swipe',       funcion: 'Comparar (1 fila = 1 tarjeta)',              alt: ['lista_en_tarjeta'] },
    imagen:           { intencion: 'mostrar',         movil: 'tarjeta_vertical',     funcion: 'Informar con apoyo visual',                  alt: [] },
    galeria:          { intencion: 'mostrar_ejemplos', movil: 'carrusel',            funcion: 'Mostrar ejemplos',                           alt: [] },
    video:            { intencion: 'ver_y_leer',      movil: 'video_con_transcripcion', funcion: 'Ver y leer',                              alt: [] },
    documento:        { intencion: 'descargar',       movil: 'tarjeta_descarga',     funcion: 'Entregar un archivo de apoyo',               alt: [] },
    audio:            { intencion: 'escuchar',        movil: 'audio_con_transcripcion', funcion: 'Escuchar y leer',                         alt: [] },
    divisor:          { intencion: 'separar',         movil: 'salto_de_pantalla',    funcion: 'Separar ideas',                              alt: [] },
    acordeon:         { intencion: 'explorar_partes', movil: 'lista_expandible',     funcion: 'Explorar por partes',                        alt: ['pasos_stepper'] },
    pestanas:         { intencion: 'comparar_o_explorar', movil: 'pasos_stepper',    funcion: 'Comparar / explorar por partes',             alt: ['lista_expandible'] },
    pasos:            { intencion: 'secuencia',       movil: 'pasos_numerados',      funcion: 'Secuencia (1 paso por pantalla)',            alt: ['timeline_vertical'] },
    linea_tiempo:     { intencion: 'secuencia',       movil: 'timeline_vertical',    funcion: 'Secuencia en el tiempo',                     alt: ['pasos_numerados'] },
    imagen_etiquetas: { intencion: 'explorar_partes', movil: 'imagen_zoom_y_lista',  funcion: 'Explorar las partes de una imagen',          alt: [] },
    revelar:          { intencion: 'revelar',        movil: 'tocar_para_revelar',  funcion: 'Pensar y descubrir al tocar',                alt: [] },
    tarjetas:         { intencion: 'memorizar',       movil: 'flashcards_swipe',     funcion: 'Memorizar / practicar vocabulario',          alt: [] },
    escenario:        { intencion: 'decidir',         movil: 'conversacion',         funcion: 'Decidir y ver la consecuencia',              alt: [] },
    vf:               { intencion: 'comprobar',      movil: 'dos_botones_grandes', funcion: 'Comprobar con verdadero o falso',            alt: [] },
    corta:            { intencion: 'recordar',       movil: 'campo_grande',        funcion: 'Recordar y escribir la respuesta',           alt: [] },
    arrastrar:        { intencion: 'clasificar',       movil: 'toca_y_elige',        funcion: 'Clasificar sin depender de arrastrar',       alt: [] },
    simulador:        { intencion: 'practicar_proceso', movil: 'toca_en_orden',     funcion: 'Practicar un proceso tocando en orden',      alt: [] },
    encuesta:         { intencion: 'reflexionar',    movil: 'pregunta_a_pantalla', funcion: 'Reflexionar y opinar, sin nota',            alt: [] },
    ordenar:          { intencion: 'ordenar',         movil: 'tocar_y_elegir',       funcion: 'Ordenar sin arrastrar (tocar para elegir)',  alt: [] },
    relacionar:       { intencion: 'clasificar',      movil: 'tocar_y_elegir',       funcion: 'Relacionar sin arrastrar (tocar y tocar)',   alt: [] }
  };
  var MOVIL_ROTULO = {
    titulo_de_tarjeta: 'título de la tarjeta', tarjetas_paginadas: 'tarjetas paginadas', tarjeta_destacada: 'tarjeta destacada', lista_en_tarjeta: 'lista en una tarjeta',
    tarjetas_swipe: 'tarjetas con swipe', tarjeta_vertical: 'tarjeta vertical (imagen arriba)', carrusel: 'carrusel a pantalla completa', video_con_transcripcion: 'video con transcripción',
    audio_con_transcripcion: 'audio con transcripción', toca_y_elige: 'toca el elemento y luego su zona', tarjeta_descarga: 'tarjeta con botón de descarga', salto_de_pantalla: 'salto a otra pantalla', lista_expandible: 'lista expandible', pasos_stepper: 'pasos (Paso 1, 2, 3)',
    pasos_numerados: 'pasos numerados, uno por pantalla', timeline_vertical: 'línea de tiempo vertical', imagen_zoom_y_lista: 'imagen con zoom y lista de puntos',
    flashcards_swipe: 'tarjetas para deslizar', conversacion: 'conversación con botones grandes', tocar_y_elegir: 'toca para elegir y toca el destino', tocar_para_revelar: 'botón grande que revela el contenido', dos_botones_grandes: 'dos botones grandes (Verdadero / Falso)', campo_grande: 'campo de texto grande', toca_en_orden: 'botones grandes que se tocan en orden', pregunta_a_pantalla: 'pregunta a pantalla completa'
  };

  /* Columnas de la rejilla de 12 (sección 12): d = escritorio, t = tablet, m = móvil. En móvil todo se apila a 12. */
  var COLS_BASE = { d: 12, t: 12, m: 12 };
  var COLS_DEF = {}; // por defecto todo ocupa 12; el diseñador junta bloques (6+6, 4+4+4) con el control Ancho
  var COLS_OPC = [[12, 'Ancho completo (12)'], [9, '3/4 (9)'], [8, '2/3 (8)'], [6, 'Mitad (6)'], [4, 'Un tercio (4)'], [3, 'Un cuarto (3)']];
  /* Paleta del editor, organizada por intención (sección 11) */
  var PALETA = [
    { id: 'contenido', label: 'Contenido', tipos: ['encabezado', 'parrafo', 'cita', 'resumen', 'recursos', 'imagen', 'galeria', 'video', 'audio', 'documento', 'divisor'] },
    { id: 'organizar', label: 'Organizar información', tipos: ['acordeon', 'pestanas', 'pasos', 'linea_tiempo', 'tabla', 'lista'] },
    { id: 'interactivo', label: 'Interactivo', tipos: ['imagen_etiquetas', 'revelar', 'tarjetas', 'escenario', 'simulador', 'arrastrar', 'encuesta'] },
    { id: 'evaluacion', label: 'Evaluación', tipos: ['vf', 'corta', 'ordenar', 'relacionar'] }
  ];
  var BREAKPOINTS = { movil: 576, escritorio: 992 }; // móvil < 576 · tablet 576–992 · escritorio > 992
  var MAX_PALABRAS_MOVIL = 150, MAX_PALABRAS_BLOQUE = 150, MIN_PUNTAJE = 80;

  var isStr = function (v) { return typeof v === 'string' && v.trim() !== ''; };
  var uid = function (p) { return p + '_' + Math.random().toString(36).slice(2, 8); };
  function palabras(t) { return (String(t || '').match(/\S+/g) || []).length; }

  /* Columnas (de 12) que ocupa un objeto en 'd' escritorio, 't' tablet o 'm' móvil (siempre 12) */
  function colsDe(b, bp) {
    if (bp === 'm') return 12;
    var v = b && b.cols && +b.cols[bp]; if (!(v >= 1 && v <= 12)) v = (COLS_DEF[b && b.tipo] || COLS_BASE)[bp] || 12;
    return Math.round(v);
  }
  function intencion(tipo) { return (EQUIV[tipo] || {}).intencion || null; }
  /* Qué verá el alumno en móvil: {id, rotulo, funcion, alternativas:[{id,rotulo}], sinEquivalente} */
  function equivalencia(obj) {
    var e = EQUIV[obj && obj.tipo];
    if (!e) return { id: null, rotulo: null, funcion: null, alternativas: [], sinEquivalente: true };
    var id = (obj.movil && obj.movil.equivalente && (obj.movil.equivalente === e.movil || e.alt.indexOf(obj.movil.equivalente) >= 0)) ? obj.movil.equivalente : e.movil;
    return { id: id, rotulo: MOVIL_ROTULO[id], funcion: e.funcion, elegido: id !== e.movil, alternativas: [e.movil].concat(e.alt).filter(function (x) { return x !== id; }).map(function (x) { return { id: x, rotulo: MOVIL_ROTULO[x] }; }), sinEquivalente: false };
  }
  /* Mensaje de la sección 14: "En móvil esto se verá como pasos. ¿Te late o prefieres acordeón?" */
  function sugerencia(obj) {
    var q = equivalencia(obj); if (q.sinEquivalente) return 'Esto no tiene equivalente directo en app. Te sugiero dejarlo como texto, ¿lo aceptas?';
    var s = 'En móvil esto se verá como ' + q.rotulo + '.';
    if (q.alternativas.length) s += ' ¿Te late o prefieres ' + q.alternativas.map(function (a) { return a.rotulo; }).join(' o ') + '?';
    return s;
  }

  /* ---- Fábricas ---- */
  function nuevoObjeto(tipo, datos) {
    var o = Object.assign({ id: uid('o'), tipo: tipo }, datos || {});
    o.cols = Object.assign({}, COLS_DEF[tipo] || COLS_BASE, o.cols || {});
    if (o.objetivo === undefined) o.objetivo = null; // id de un objetivo del curso
    return o;
  }
  function nuevaLeccion(titulo) {
    return { id: uid('l'), titulo: titulo || 'Nueva lección', tipo: 'bloques', fuente: 'manual', objetivo: null, duracion: 5, bloques: [] };
  }
  function fichaVacia() {
    return { autor: '', categoria: '', portada: '', audiencia: '', prerrequisitos: '', duracion: '', objetivo_general: '', idioma: 'es', navegacion: 'libre', certificado: false, puntaje_minimo: MIN_PUNTAJE, modo: 'guiado', plantilla: 'blanco' };
  }

  /* ---- Migración de cursos anteriores (idempotente): todo queda como Curso > Módulo > Lección > Objeto ---- */
  function legacyABloques(p) {
    var c = p.contenido || {}, bl = [];
    if (p.tipo === 'acordeon') { bl.push({ tipo: 'acordeon', items: (c.items || []).map(function (i) { return { encabezado: i.encabezado || '', texto: i.texto || '' }; }) }); return bl; }
    var parr = (c.parrafos && c.parrafos.length ? c.parrafos : (c.texto ? [c.texto] : [])).filter(isStr);
    if (parr.length) bl.push({ tipo: 'parrafo', texto: parr.join('\n') });
    if (p.imagen) bl.push({ tipo: 'imagen', archivo: p.imagen.archivo || '', alt: (p.imagen.etiquetas || []).join(', '), pie: '' });
    if (c.puntos && c.puntos.length) bl.push({ tipo: 'lista', estilo: 'vinetas', items: c.puntos.slice() });
    return bl;
  }
  function migrar(curso) {
    var c = curso; if (!c || typeof c !== 'object') return c;
    c.curso = c.curso || {};
    c.curso.ficha = Object.assign(fichaVacia(), c.curso.ficha || {});
    if (c.curso.puntaje_aprobatorio != null) c.curso.ficha.puntaje_minimo = c.curso.puntaje_aprobatorio;
    if (!Array.isArray(c.objetivos)) c.objetivos = []; // [{id, texto, modulo}]
    (c.modulos || []).forEach(function (m) {
      if (m.objetivo === undefined) m.objetivo = '';
      (m.pantallas || []).forEach(function (p) {
        if (p.tipo !== 'bloques') { p.bloques = legacyABloques(p); p.tipo = 'bloques'; delete p.contenido; delete p.imagen; }
        if (p.objetivo === undefined) p.objetivo = null;
        if (p.duracion === undefined) p.duracion = 5;
        p.bloques = (p.bloques || []).map(function (b) { return b.id && b.cols ? b : nuevoObjeto(b.tipo, b); });
      });
    });
    c.version_modelo = 1;
    return c;
  }

  /* ---- Estado de la lección para la barrita inferior del editor (sección 11) ---- */
  var INTER = ['acordeon', 'pestanas', 'pasos', 'linea_tiempo', 'imagen_etiquetas', 'revelar', 'tarjetas', 'escenario', 'simulador', 'arrastrar', 'encuesta', 'vf', 'corta', 'ordenar', 'relacionar'];
  function estadoLeccion(l) {
    var bl = l.bloques || [], inter = bl.filter(function (b) { return INTER.indexOf(b.tipo) >= 0; }).length;
    var aviso = [];
    if (!l.objetivo) aviso.push('Falta ligar la lección a un objetivo');
    if (bl.length >= 3 && !inter) aviso.push('Sin interacción (1 cada 3 pantallas)');
    else if (bl.length >= 3 && inter < Math.floor(bl.length / 3)) aviso.push('Conviene 1 interacción por cada 3 bloques');
    return { objetivos: l.objetivo ? 1 : 0, bloques: bl.length, interacciones: inter, preguntas: 0, aviso: aviso };
  }


  /* ---------- Plantillas pedagógicas por tipo de curso (sección 5, modo Guiado): estructura + bloques recomendados + pregunta tipo ---------- */
  var PLANTILLAS = {
    blanco: { nombre: 'En blanco', desc: 'Empiezas desde cero, con un módulo y una lección vacía.', modulos: [{ titulo: 'Módulo 1', lecciones: [{ titulo: 'Lección 1', bloques: ['encabezado', 'parrafo'] }] }], objetivos: [] },
    induccion: { nombre: 'Inducción', desc: 'Para que alguien nuevo entienda la empresa, su rol y a quién acudir.',
      objetivos: ['Describir la misión y los valores de la empresa', 'Identificar a quién acudir ante una duda o problema', 'Enumerar los procesos clave de su primera semana'],
      modulos: [{ titulo: 'Conoce la empresa', lecciones: [{ titulo: 'Bienvenida y cultura', bloques: ['encabezado', 'parrafo', 'tarjetas'] }, { titulo: 'Tu rol y tu equipo', bloques: ['encabezado', 'pasos', 'imagen_etiquetas'] }] },
        { titulo: 'Tus primeros días', lecciones: [{ titulo: 'Procesos clave', bloques: ['encabezado', 'linea_tiempo', 'acordeon'] }, { titulo: 'Dónde pedir ayuda', bloques: ['encabezado', 'pestanas', 'lista'] }] }],
      pregunta: 'Si tienes una duda sobre tu horario, ¿a quién acudes primero?' },
    compliance: { nombre: 'Compliance', desc: 'Para explicar una norma o política y qué hacer en casos reales.',
      objetivos: ['Explicar por qué aplica la norma y qué riesgos evita', 'Distinguir conductas permitidas de no permitidas', 'Aplicar el procedimiento correcto ante un incidente'],
      modulos: [{ titulo: 'Qué exige la norma', lecciones: [{ titulo: 'Por qué importa', bloques: ['encabezado', 'parrafo', 'cita'] }, { titulo: 'Reglas clave', bloques: ['encabezado', 'acordeon', 'lista'] }] },
        { titulo: 'Cómo actuar', lecciones: [{ titulo: 'Casos reales', bloques: ['encabezado', 'escenario'] }, { titulo: 'Qué hacer si ocurre un incidente', bloques: ['encabezado', 'pasos', 'cita'] }] }],
      pregunta: 'Detectas una conducta que incumple la norma. ¿Cuál es el primer paso correcto?' },
    ventas: { nombre: 'Ventas', desc: 'Para descubrir necesidades, responder objeciones y cerrar.',
      objetivos: ['Identificar las necesidades del cliente con preguntas abiertas', 'Responder las objeciones más comunes', 'Aplicar los pasos para cerrar una venta'],
      modulos: [{ titulo: 'Entender al cliente', lecciones: [{ titulo: 'Descubrir necesidades', bloques: ['encabezado', 'parrafo', 'pestanas'] }, { titulo: 'Objeciones comunes', bloques: ['encabezado', 'tarjetas', 'escenario'] }] },
        { titulo: 'Cerrar la venta', lecciones: [{ titulo: 'El proceso en pasos', bloques: ['encabezado', 'pasos'] }, { titulo: 'Practica el cierre', bloques: ['encabezado', 'ordenar'] }] }],
      pregunta: 'El cliente dice «está caro». ¿Cuál es la mejor respuesta inicial?' },
    blandas: { nombre: 'Habilidades blandas', desc: 'Para comunicación, escucha y manejo de conflictos.',
      objetivos: ['Aplicar técnicas de comunicación clara', 'Practicar la escucha activa', 'Manejar un conflicto sin perder la relación'],
      modulos: [{ titulo: 'Comunicación', lecciones: [{ titulo: 'Comunicación efectiva', bloques: ['encabezado', 'parrafo', 'tarjetas'] }, { titulo: 'Escucha activa', bloques: ['encabezado', 'pasos', 'relacionar'] }] },
        { titulo: 'Relaciones', lecciones: [{ titulo: 'Manejo de conflictos', bloques: ['encabezado', 'pestanas', 'escenario'] }] }],
      pregunta: 'Un compañero te interrumpe en la reunión. ¿Qué respuesta mantiene la buena relación?' },
    producto: { nombre: 'Producto', desc: 'Para conocer un producto y saber explicarlo al cliente.',
      objetivos: ['Describir qué es el producto y para qué sirve', 'Relacionar cada característica con su beneficio', 'Explicar el producto al cliente con sus palabras'],
      modulos: [{ titulo: 'Conoce el producto', lecciones: [{ titulo: 'Qué es y para qué sirve', bloques: ['encabezado', 'parrafo', 'galeria'] }, { titulo: 'Características y beneficios', bloques: ['encabezado', 'tabla', 'relacionar'] }] },
        { titulo: 'Véndelo bien', lecciones: [{ titulo: 'Cómo explicarlo al cliente', bloques: ['encabezado', 'escenario', 'tarjetas'] }] }],
      pregunta: '¿Cuál de estas características resuelve el problema principal del cliente?' }
  };
  function isStr(x) { return !!(x && String(x).trim()); }
  function BL() { return root.Bloques || (typeof require !== 'undefined' ? require('./bloques.js') : null); }
  function slugId(prefix, n) { return prefix + n; }
  /* Rellena un curso con la estructura de la plantilla (módulos, lecciones con bloques recomendados, objetivos). Devuelve el mismo curso. */
  function aplicarPlantilla(c, clave) {
    var pl = PLANTILLAS[clave] || PLANTILLAS.blanco, B = BL(); c.curso = c.curso || {}; c.curso.ficha = c.curso.ficha || {}; Object.assign(c.curso.ficha, Object.assign(fichaVacia(), c.curso.ficha), { plantilla: clave });
    c.objetivos = pl.objetivos.map(function (t, i) { return { id: slugId('ob', i + 1), texto: t }; });
    c.modulos = pl.modulos.map(function (m, mi) {
      return { id: slugId('m', mi + 1), titulo: m.titulo, objetivo: '', pantallas: m.lecciones.map(function (l, li) {
        var lec = nuevaLeccion(l.titulo); lec.id = 'm' + (mi + 1) + '-p' + (li + 1); lec.fuente = 'plantilla ' + pl.nombre; lec.animacion = 'fade-in';
        lec.bloques = l.bloques.map(function (t) { return nuevoObjeto(t, B ? B.nuevo(t) : {}); });
        if (lec.bloques[0] && lec.bloques[0].tipo === 'encabezado') lec.bloques[0].texto = l.titulo;
        return lec; }) };
    });
    c.evaluacion = c.evaluacion || { preguntas: [] };
    var k = 0; c.modulos.forEach(function (m) { m.pantallas.forEach(function (p) { if (c.objetivos.length) p.objetivo = c.objetivos[k % c.objetivos.length].id; k++; }); });
    return c;
  }
  /* Objetivos específicos del curso, editables como texto (una línea = un objetivo); conserva los ids por posición */
  function setObjetivos(c, lineas) {
    var old = c.objetivos || [], txt = lineas.map(function (x) { return String(x).trim(); }).filter(Boolean), used = {};
    old.forEach(function (o) { used[o.id] = 1; });
    c.objetivos = txt.map(function (t, i) { if (old[i]) return { id: old[i].id, texto: t }; var n = 1; while (used['ob' + n]) n++; used['ob' + n] = 1; return { id: 'ob' + n, texto: t }; });
    var ok = {}; c.objetivos.forEach(function (o) { ok[o.id] = 1; });
    (c.modulos || []).forEach(function (m) { (m.pantallas || []).forEach(function (p) { if (p.objetivo && !ok[p.objetivo]) p.objetivo = null; }); });
    ((c.evaluacion && c.evaluacion.preguntas) || []).forEach(function (q) { if (q.objetivo && !ok[q.objetivo]) q.objetivo = null; });
    return c.objetivos;
  }

  /* ---------- Revisión instruccional (secciones 5, 6 y 10.6). critico = en Guiado bloquea; en Experto solo advierte. paso = 1..7 de la ruta ---------- */
  function lecciones(c) { var out = []; (c.modulos || []).forEach(function (m, mi) { (m.pantallas || []).forEach(function (p, pi) { out.push({ m: m, p: p, mi: mi, pi: pi }); }); }); return out; }
  var CATS = { brief: 'Brief y ficha', estructura: 'Estructura', pedagogia: 'Pedagogía', contenido: 'Contenido', accesibilidad: 'Accesibilidad', evaluacion: 'Evaluación' };
  /* Reglas de la lista de chequeo (sección 10.6). critico = bloquea publicar en Guiado; en Experto solo advierte. paso = paso de la ruta (1..7). */
  var REGLAS = [
    ['audiencia', 'brief', 'Se sabe para quién es el curso', 1, true], ['objetivo_general', 'brief', 'Tiene objetivo general', 1, true], ['objetivos', 'brief', 'Tiene objetivos específicos', 1, true],
    ['objetivos_n', 'brief', 'De 3 a 5 objetivos específicos', 1, false], ['prerrequisitos', 'brief', 'Indica los prerrequisitos', 1, false],
    ['titulo', 'brief', 'Tiene título y descripción', 2, true], ['autor', 'brief', 'Tiene autor y categoría', 2, false],
    ['lecciones', 'estructura', 'Tiene al menos un módulo con una lección', 3, true],
    ['les_objetivo', 'pedagogia', 'Cada lección tiene un objetivo ligado', 4, true], ['les_vacia', 'pedagogia', 'Ninguna lección está vacía', 5, true], ['les_inter', 'pedagogia', 'Cada lección tiene al menos una interacción', 5, true],
    ['inter_ritmo', 'pedagogia', 'Hay una interacción por cada 3 bloques', 5, false], ['obj_eval', 'evaluacion', 'Cada objetivo tiene una pregunta que lo mide', 6, true], ['preguntas', 'evaluacion', 'El curso tiene preguntas', 6, true],
    ['preg_obj', 'evaluacion', 'Cada pregunta mide un objetivo', 6, false], ['quiz_cob', 'evaluacion', 'El quiz cubre todos los objetivos', 6, false],
    ['texto_largo', 'contenido', 'Ningún párrafo pasa de ' + MAX_PALABRAS_BLOQUE + ' palabras', 5, false], ['resumen_n', 'contenido', 'Los resúmenes tienen de 3 a 5 ideas', 5, false],
    ['img_alt', 'accesibilidad', 'Todas las imágenes tienen texto alternativo', 5, false], ['video_trans', 'accesibilidad', 'Los videos tienen transcripción', 5, false], ['audio_trans', 'accesibilidad', 'Los audios tienen transcripción', 5, false]
  ];
  function qa(c) {
    if (c.curso && c.curso.tipo === 'evaluacion') return [];
    var f = (c.curso && c.curso.ficha) || {}, obj = c.objetivos || [], preg = (c.evaluacion && c.evaluacion.preguntas) || [], L = lecciones(c), by = {};
    var out = REGLAS.map(function (r) { var o = { id: r[0], cat: r[1], catNombre: CATS[r[1]], titulo: r[2], paso: r[3], critico: r[4], items: [] }; by[r[0]] = o; return o; });
    var add = function (id, msg, target, critico) { var r = by[id]; r.items.push({ regla: id, cat: r.cat, paso: r.paso, nivel: (critico === undefined ? r.critico : critico) ? 'critico' : 'aviso', msg: msg, target: target || { t: 'curso' } }); };
    if (!isStr(f.audiencia)) add('audiencia', '¿Para quién es el curso? Falta la audiencia.');
    if (!isStr(f.objetivo_general)) add('objetivo_general', 'Falta el objetivo general del curso.');
    if (obj.length < 1) add('objetivos', 'Escribe al menos un objetivo específico (con verbo de acción).');
    else if (obj.length < 3 || obj.length > 5) add('objetivos_n', 'Lo recomendable son de 3 a 5 objetivos específicos (hoy hay ' + obj.length + ').');
    if (!isStr(f.prerrequisitos)) add('prerrequisitos', 'Conviene decir qué deben saber ya los alumnos (prerrequisitos).');
    if (!isStr(c.curso && c.curso.titulo)) add('titulo', 'Falta el título del curso.');
    if (!isStr(c.curso && c.curso.descripcion)) add('titulo', 'Falta la descripción corta del curso.');
    if (!isStr(f.autor)) add('autor', 'Falta el autor.');
    if (!isStr(f.categoria)) add('autor', 'Falta la categoría.');
    if (!(c.modulos || []).length || !L.length) add('lecciones', 'El curso necesita al menos un módulo con una lección.');
    L.forEach(function (x) {
      var tg = { t: 'pan', m: x.mi, p: x.pi }, nm = (x.m.titulo || 'Módulo') + ' › ' + (x.p.titulo || 'Lección sin título'), at = function (k) { return { t: 'pan', m: x.mi, p: x.pi, b: k }; };
      if (!x.p.objetivo) add('les_objetivo', nm + ': la lección no tiene un objetivo ligado.', tg);
      if (x.p.tipo !== 'bloques') return;
      var bl = x.p.bloques || [], inter = bl.filter(function (b) { return INTER.indexOf(b.tipo) >= 0; }).length;
      if (!bl.length) add('les_vacia', nm + ': la lección está vacía.', tg);
      else if (!inter) add('les_inter', nm + ': la lección no tiene ninguna interacción.', tg);
      else if (bl.length >= 3 && inter < Math.floor(bl.length / 3)) add('inter_ritmo', nm + ': conviene 1 interacción por cada 3 bloques.', tg);
      bl.forEach(function (b, k) {
        if (b.tipo === 'parrafo') { var w = palabras(textoBloque(b)); if (w > MAX_PALABRAS_BLOQUE) add('texto_largo', nm + ': un párrafo tiene ' + w + ' palabras (máx. recomendado ' + MAX_PALABRAS_BLOQUE + ').', at(k)); }
        if (b.tipo === 'resumen') { var ni = (b.items || []).filter(isStr).length; if (ni && (ni < 3 || ni > 5)) add('resumen_n', nm + ': el resumen debería tener de 3 a 5 ideas (tiene ' + ni + ').', at(k)); }
        if ((b.tipo === 'imagen' || b.tipo === 'imagen_etiquetas') && b.archivo && !isStr(b.alt)) add('img_alt', nm + ': una imagen no tiene texto alternativo.', at(k));
        if (b.tipo === 'galeria') (b.imagenes || []).forEach(function (im, j) { if (im.archivo && !isStr(im.alt)) add('img_alt', nm + ': la imagen ' + (j + 1) + ' de la galería no tiene texto alternativo.', at(k)); });
        if (b.tipo === 'video' && isStr(b.url) && !isStr(b.transcripcion)) add('video_trans', nm + ': un video no tiene transcripción.', at(k));
        if (b.tipo === 'audio' && isStr(b.url) && !isStr(b.transcripcion)) add('audio_trans', nm + ': un audio no tiene transcripción.', at(k));
      });
    });
    if (!preg.length) add('preguntas', 'El curso no tiene preguntas: no hay forma de saber si se cumplieron los objetivos.');
    obj.forEach(function (o, i) { if (!preg.some(function (q) { return q.objetivo === o.id; })) add('obj_eval', 'El objetivo ' + (i + 1) + ' no tiene ninguna pregunta que lo mida: «' + o.texto + '».', { t: 'curso' }, preg.length > 0); });
    var mo = c.evaluacion && +c.evaluacion.mostrar; if (mo > 0 && mo < preg.length && obj.length > mo) add('quiz_cob', 'El quiz muestra ' + mo + ' preguntas por intento y hay ' + obj.length + ' objetivos: algún objetivo puede quedar sin medirse.');
    preg.forEach(function (q, i) { if (!q.objetivo) add('preg_obj', 'La pregunta ' + (i + 1) + ' no mide ningún objetivo.', { t: 'q', q: i }); });
    return out;
  }
  function revisar(c) { var r = []; qa(c).forEach(function (x) { r = r.concat(x.items); }); r.sort(function (a, b) { return a.paso - b.paso; }); return r; }
  function textoBloque(b) { var B = BL(); return B ? B.texto(b) : ''; }
  /* La ruta de 7 pasos del diseñador instruccional (sección 6). hecho = sin críticos en ese paso (y con algo hecho) */
  var RUTA = [
    { n: 1, titulo: 'Brief y objetivos', simple: 'Para quién y qué lograrán' }, { n: 2, titulo: 'Ficha del curso', simple: 'Datos del curso' }, { n: 3, titulo: 'Estructura', simple: 'Módulos y lecciones' },
    { n: 4, titulo: 'Guion por lección', simple: 'Qué aprende cada lección' }, { n: 5, titulo: 'Construcción con bloques', simple: 'Armar las pantallas' }, { n: 6, titulo: 'Evaluación alineada', simple: 'Preguntas que miden los objetivos' }, { n: 7, titulo: 'Revisión y publicación', simple: 'Revisar y publicar' }
  ];
  function ruta(c) {
    var rv = revisar(c), crit = rv.filter(function (x) { return x.nivel === 'critico'; });
    return RUTA.map(function (p) {
      var cr = crit.filter(function (x) { return x.paso === p.n; }), av = rv.filter(function (x) { return x.nivel === 'aviso' && x.paso === p.n; });
      var previos = crit.filter(function (x) { return x.paso < p.n; });
      return { n: p.n, titulo: p.titulo, simple: p.simple, criticos: cr, avisos: av, hecho: p.n === 7 ? crit.length === 0 : cr.length === 0, bloqueadoPor: previos };
    });
  }

  var API = { EQUIV: EQUIV, MOVIL_ROTULO: MOVIL_ROTULO, COLS_BASE: COLS_BASE, MAX_PALABRAS_MOVIL: MAX_PALABRAS_MOVIL, MAX_PALABRAS_BLOQUE: MAX_PALABRAS_BLOQUE, MIN_PUNTAJE: MIN_PUNTAJE, COLS_OPC: COLS_OPC, PALETA: PALETA, BREAKPOINTS: BREAKPOINTS, colsDe: colsDe,
    intencion: intencion, equivalencia: equivalencia, sugerencia: sugerencia, nuevoObjeto: nuevoObjeto, nuevaLeccion: nuevaLeccion, fichaVacia: fichaVacia, migrar: migrar, estadoLeccion: estadoLeccion, palabras: palabras, PLANTILLAS: PLANTILLAS, aplicarPlantilla: aplicarPlantilla, setObjetivos: setObjetivos, revisar: revisar, qa: qa, CATS: CATS, ruta: ruta, RUTA: RUTA };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Modelo = API;
})(typeof window !== 'undefined' ? window : globalThis);
