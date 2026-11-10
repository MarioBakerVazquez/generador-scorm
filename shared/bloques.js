/* Catálogo de bloques de aprendizaje (estilo Rise). UMD: lo usan el esquema, el empaquetador, el editor y la IA.
   Una pantalla tipo "bloques" lleva  bloques: [{ tipo, ...campos }]  apilados en orden. */
(function (root) {
  'use strict';
  var GRUPOS = { texto: 'Texto', media: 'Imagen y multimedia', inter: 'Interactivos', eval: 'Para practicar' };
  var NIVELES = [['2', 'Grande'], ['3', 'Mediano']];
  var ALINEAR = [['izq', 'Izquierda'], ['centro', 'Centrado']];
  var T = function (k, label, extra) { return Object.assign({ k: k, t: 'text', label: label }, extra); };
  var A = function (k, label, extra) { return Object.assign({ k: k, t: 'area', label: label }, extra); };

  /* campos: t = text | area | choice | lines | items | img | bool | num | marcadores
     req:true  → obligatorio.  items: { sub:[campos], min, nuevo:{...} }  */
  var BLOQUES = {
    encabezado: { grupo: 'texto', label: 'Encabezado', desc: 'Título de una sección', icon: 'text',
      def: function () { return { texto: '', sub: '', nivel: '2', alinear: 'izq' }; },
      campos: [T('texto', 'Texto del encabezado', { req: true }), T('sub', 'Subtítulo (opcional)', { ph: 'Una frase breve debajo del título' }), { k: 'nivel', t: 'choice', label: 'Tamaño', opts: NIVELES }, { k: 'alinear', t: 'choice', label: 'Alineación', opts: ALINEAR }] },
    parrafo: { grupo: 'texto', label: 'Párrafo', desc: 'Texto corrido', icon: 'text',
      def: function () { return { texto: '', tamano: 'normal', alinear: 'izq' }; },
      campos: [A('texto', 'Texto', { req: true, rows: 5, ph: 'Una línea nueva = un párrafo nuevo. Formato: **negrita**, *cursiva*, [texto](https://enlace)' }), { k: 'tamano', t: 'choice', label: 'Tamaño', opts: [['normal', 'Normal'], ['grande', 'Destacado (más grande)']] }, { k: 'alinear', t: 'choice', label: 'Alineación', opts: ALINEAR }] },
    cita: { grupo: 'texto', label: 'Cita o nota', desc: 'Cita, nota o idea destacada', icon: 'clipboard',
      def: function () { return { texto: '', titulo: '', autor: '', estilo: 'nota' }; },
      campos: [{ k: 'estilo', t: 'choice', label: 'Estilo', opts: [['nota', 'Nota'], ['consejo', 'Consejo'], ['destacado', 'Importante'], ['cita', 'Cita']] }, T('titulo', 'Título (opcional, en notas)', { ph: 'Ej.: Consejo del chef' }), A('texto', 'Texto', { req: true, rows: 3, ph: 'Admite **negrita**, *cursiva* y [enlaces](https://...)' }), T('autor', 'Autor (solo en citas)')] },
    lista: { grupo: 'texto', label: 'Lista', desc: 'Viñetas, numerada o con casillas', icon: 'list',
      def: function () { return { estilo: 'vinetas', items: [] }; },
      campos: [{ k: 'estilo', t: 'choice', label: 'Tipo de lista', opts: [['vinetas', 'Viñetas'], ['numerada', 'Numerada'], ['casillas', 'Casillas (el alumno marca)'], ['si', 'Sí / hacer ✓'], ['no', 'No / evitar ✕']] }, { k: 'items', t: 'lines', label: 'Elementos', req: true, ph: 'Un elemento por línea. Admite **negrita**, *cursiva* y [enlaces](https://...)' }] },
    resumen: { grupo: 'texto', label: 'Resumen', desc: 'Las 3 a 5 ideas clave al cerrar la lección', icon: 'check-circle',
      def: function () { return { titulo: 'Ideas clave', items: [] }; },
      campos: [T('titulo', 'Título', { ph: 'Ideas clave' }), { k: 'items', t: 'lines', label: 'Ideas clave', req: true, ph: 'Una idea por línea (de 3 a 5). Frases cortas. Admite **negrita**.' }] },
    recursos: { grupo: 'texto', label: 'Recursos extra', desc: 'Enlaces, videos y lecturas para profundizar', icon: 'link',
      def: function () { return { titulo: 'Para profundizar', items: [{ tipo: 'enlace', titulo: '', url: '', desc: '' }] }; },
      campos: [T('titulo', 'Título', { ph: 'Para profundizar' }), { k: 'items', t: 'items', label: 'Recursos', min: 1, nuevo: { tipo: 'enlace', titulo: '', url: '', desc: '' },
        sub: [{ k: 'tipo', t: 'choice', label: 'Tipo', opts: [['enlace', 'Enlace'], ['video', 'Video'], ['lectura', 'Lectura / documento']] }, T('titulo', 'Nombre del recurso', { req: true }), T('url', 'Dirección (https://…)', { req: true }), T('desc', 'Para qué sirve (opcional)')] }] },
    tabla: { grupo: 'texto', label: 'Tabla', desc: 'Datos en filas y columnas', icon: 'grid',
      def: function () { return { encabezados: '', filas: [] }; },
      campos: [T('encabezados', 'Encabezados de columna', { ph: 'Vino | Temperatura | Copa' }), { k: 'filas', t: 'lines', label: 'Filas', req: true, ph: 'Una fila por línea, columnas separadas con |  Ej.: Tinto | 16–18 °C | Boca amplia' }] },
    imagen: { grupo: 'media', label: 'Imagen', desc: 'Una imagen con pie de foto', icon: 'image',
      def: function () { return { archivo: '', alt: '', pie: '', ancho: 'normal' }; },
      campos: [{ k: 'archivo', t: 'img', label: 'Imagen', req: true }, T('alt', 'Texto alternativo', { hint: 'Lo leen los lectores de pantalla.' }), T('pie', 'Pie de foto'), { k: 'ancho', t: 'choice', label: 'Ancho', opts: [['normal', 'Normal'], ['completa', 'Completo']] }] },
    documento: { grupo: 'media', label: 'Documento descargable', desc: 'PDF, Word o Excel para que el alumno lo descargue', icon: 'file',
      def: function () { return { archivo: '', titulo: '', desc: '' }; },
      campos: [{ k: 'archivo', t: 'doc', label: 'Archivo (PDF, Word o Excel)', req: true }, T('titulo', 'Título', { req: true, ph: 'Ej.: Guía rápida de lavado de manos' }), A('desc', 'Descripción', { rows: 2, ph: 'Para qué le sirve al alumno. Opcional.' })] },
    galeria: { grupo: 'media', label: 'Galería', desc: 'Carrusel de imágenes', icon: 'image',
      def: function () { return { imagenes: [{ archivo: '', alt: '', pie: '' }, { archivo: '', alt: '', pie: '' }] }; },
      campos: [{ k: 'imagenes', t: 'items', label: 'Imágenes', min: 2, nuevo: { archivo: '', alt: '', pie: '' }, sub: [{ k: 'archivo', t: 'img', label: 'Imagen', req: true }, T('alt', 'Texto alternativo'), T('pie', 'Pie de foto')] }] },
    video: { grupo: 'media', label: 'Video', desc: 'YouTube, Vimeo o archivo .mp4', icon: 'play',
      def: function () { return { url: '', titulo: '' }; },
      campos: [T('url', 'Dirección del video', { req: true, ph: 'https://www.youtube.com/watch?v=…  ·  https://vimeo.com/…  ·  https://…/video.mp4', hint: 'El alumno necesita internet para verlo.' }), T('titulo', 'Título del video'), A('transcripcion', 'Transcripción', { rows: 4, ph: 'Texto de lo que se dice en el video. Es obligatoria para accesibilidad; la revisión avisa si falta.' })] },
    audio: { grupo: 'media', label: 'Audio', desc: 'Un archivo de audio (.mp3)', icon: 'play',
      def: function () { return { url: '', titulo: '' }; },
      campos: [T('url', 'Dirección del audio', { req: true, ph: 'https://…/audio.mp3' }), T('titulo', 'Título'), A('transcripcion', 'Transcripción', { rows: 4, ph: 'Texto de lo que se dice en el audio. La revisión avisa si falta.' })] },
    divisor: { grupo: 'media', label: 'Divisor', desc: 'Línea o botón «Continuar» que revela lo siguiente', icon: 'sliders',
      def: function () { return { estilo: 'linea', etiqueta: 'Continuar' }; },
      campos: [{ k: 'estilo', t: 'choice', label: 'Estilo', opts: [['linea', 'Línea'], ['continuar', 'Botón Continuar']] }, T('etiqueta', 'Texto del botón', { hint: 'Con el botón, lo que sigue aparece cuando el alumno lo pulsa.' })] },

    acordeon: { grupo: 'inter', inter: true, label: 'Acordeón', desc: 'Elementos que se abren y cierran', icon: 'layers',
      def: function () { return { items: [{ encabezado: '', texto: '' }, { encabezado: '', texto: '' }] }; },
      campos: [{ k: 'items', t: 'items', label: 'Elementos', min: 1, nuevo: { encabezado: '', texto: '' }, sub: [T('encabezado', 'Encabezado', { req: true }), A('texto', 'Texto', { req: true, rows: 3 })] }] },
    pestanas: { grupo: 'inter', inter: true, label: 'Pestañas', desc: 'Contenido en pestañas', icon: 'layers',
      def: function () { return { items: [{ titulo: '', texto: '' }, { titulo: '', texto: '' }] }; },
      campos: [{ k: 'items', t: 'items', label: 'Pestañas', min: 2, nuevo: { titulo: '', texto: '' }, sub: [T('titulo', 'Título de la pestaña', { req: true }), A('texto', 'Texto', { req: true, rows: 3 })] }] },
    pasos: { grupo: 'inter', inter: true, label: 'Proceso por pasos', desc: 'Pasos que se recorren uno a uno', icon: 'repeat',
      def: function () { return { items: [{ titulo: '', texto: '' }, { titulo: '', texto: '' }, { titulo: '', texto: '' }] }; },
      campos: [{ k: 'items', t: 'items', label: 'Pasos', min: 2, nuevo: { titulo: '', texto: '' }, sub: [T('titulo', 'Título del paso', { req: true }), A('texto', 'Descripción', { req: true, rows: 3 })] }] },
    linea_tiempo: { grupo: 'inter', label: 'Línea de tiempo', desc: 'Hechos en orden cronológico', icon: 'clock',
      def: function () { return { items: [{ fecha: '', titulo: '', texto: '' }, { fecha: '', titulo: '', texto: '' }] }; },
      campos: [{ k: 'items', t: 'items', label: 'Hitos', min: 2, nuevo: { fecha: '', titulo: '', texto: '' }, sub: [T('fecha', 'Fecha o etapa', { req: true }), T('titulo', 'Título', { req: true }), A('texto', 'Texto', { rows: 2 })] }] },
    imagen_etiquetas: { grupo: 'inter', inter: true, label: 'Imagen con puntos', desc: 'Puntos sobre una imagen que muestran información', icon: 'search',
      def: function () { return { archivo: '', alt: '', marcadores: [] }; },
      campos: [{ k: 'archivo', t: 'img', label: 'Imagen', req: true }, T('alt', 'Texto alternativo'), { k: 'marcadores', t: 'marcadores', label: 'Puntos', min: 1, nuevo: { x: 50, y: 50, titulo: '', texto: '' }, sub: [T('titulo', 'Título', { req: true }), A('texto', 'Texto', { req: true, rows: 2 })] }] },
    revelar: { grupo: 'inter', inter: true, label: 'Haz clic para revelar', desc: 'Un botón que muestra contenido oculto', icon: 'eye',
      def: function () { return { boton: 'Toca para ver la respuesta', titulo: '', texto: '' }; },
      campos: [T('boton', 'Texto del botón', { req: true, ph: 'Ej.: ¿Qué harías tú? Toca para ver' }), T('titulo', 'Título del contenido oculto (opcional)'), A('texto', 'Contenido que se revela', { req: true, rows: 4, ph: 'Admite **negrita**, *cursiva* y [enlaces](https://...)' })] },
    arrastrar: { grupo: 'inter', inter: true, label: 'Arrastrar y soltar', desc: 'El alumno lleva cada elemento a su zona (arrastrando o tocando)', icon: 'grid',
      def: function () { return { enunciado: '', zonas: [{ nombre: '', elementos: [] }, { nombre: '', elementos: [] }], ok: '', mal: '', intentos: '2' }; },
      campos: [A('enunciado', 'Instrucción', { req: true, rows: 2, ph: 'Lleva cada práctica a la columna correcta.' }),
        { k: 'zonas', t: 'items', label: 'Zonas destino', min: 2, nuevo: { nombre: '', elementos: [] }, sub: [T('nombre', 'Nombre de la zona', { req: true, ph: 'Ej.: Correcto' }), { k: 'elementos', t: 'lines', label: 'Elementos que van en esta zona', req: true, ph: 'Uno por línea. El alumno los verá mezclados.' }] },
        T('ok', 'Mensaje si acierta', { ph: '¡Todo en su lugar!' }), T('mal', 'Mensaje si falla', { ph: 'Hay elementos mal ubicados.' }),
        { k: 'intentos', t: 'choice', label: 'Intentos para comprobar', opts: [['1', '1 intento'], ['2', '2 intentos'], ['3', '3 intentos'], ['0', 'Ilimitados']] }] },
    tarjetas: { grupo: 'inter', inter: true, label: 'Tarjetas giratorias', desc: 'Tarjetas con frente y reverso', icon: 'repeat',
      def: function () { return { items: [{ frente: '', reverso: '' }, { frente: '', reverso: '' }] }; },
      campos: [{ k: 'items', t: 'items', label: 'Tarjetas', min: 2, nuevo: { frente: '', reverso: '' }, sub: [T('frente', 'Frente', { req: true }), A('reverso', 'Reverso', { req: true, rows: 2 })] }] },
    escenario: { grupo: 'inter', inter: true, label: 'Escenario', desc: 'Una situación con decisiones y consecuencias', icon: 'user',
      def: function () { return { situacion: '', opciones: [{ texto: '', resultado: '', correcta: true }, { texto: '', resultado: '', correcta: false }] }; },
      campos: [A('situacion', 'Situación', { req: true, rows: 3, ph: 'Un huésped se queja de que su vino llegó caliente…' }), { k: 'opciones', t: 'items', label: 'Decisiones', min: 2, nuevo: { texto: '', resultado: '', correcta: false }, sub: [T('texto', 'Lo que el alumno puede hacer', { req: true }), A('resultado', 'Qué pasa si lo hace', { req: true, rows: 2 }), { k: 'correcta', t: 'bool', label: 'Es la decisión correcta' }] }] },
    vf: { grupo: 'eval', inter: true, label: 'Verdadero / Falso', desc: 'El alumno juzga si una afirmación es cierta', icon: 'help',
      def: function () { return { afirmacion: '', correcta: 'v', retro: '' }; },
      campos: [A('afirmacion', 'Afirmación', { req: true, rows: 2, ph: 'La leche abierta puede guardarse a temperatura ambiente un día.' }), { k: 'correcta', t: 'choice', label: 'La afirmación es', opts: [['v', 'Verdadera'], ['f', 'Falsa']] }, A('retro', 'Explica por qué', { req: true, rows: 2, ph: 'Se muestra al responder, sea correcta o no.' })] },
    corta: { grupo: 'eval', inter: true, label: 'Respuesta corta', desc: 'El alumno escribe una palabra o frase (rellenar hueco)', icon: 'pencil',
      def: function () { return { enunciado: '', respuesta: '', variantes: [], retro: '' }; },
      campos: [A('enunciado', 'Pregunta o frase con hueco', { req: true, rows: 2, ph: 'La leche abierta se guarda a ___ °C.  (escribe ___ donde va el hueco)' }), T('respuesta', 'Respuesta correcta', { req: true, ph: 'Ej.: 4' }), { k: 'variantes', t: 'lines', label: 'Otras respuestas aceptadas (opcional)', ph: 'Una por línea. Ej.: cuatro. No importan mayúsculas, acentos ni signos.' }, T('retro', 'Mensaje al acertar')] },
    simulador: { grupo: 'inter', inter: true, label: 'Simulador', desc: 'El alumno toca los pasos en el orden correcto; si se equivoca, recibe una pista', icon: 'repeat',
      def: function () { return { enunciado: '', items: [{ texto: '', pista: '' }, { texto: '', pista: '' }, { texto: '', pista: '' }], retro: '' }; },
      campos: [A('enunciado', 'Situación o instrucción', { req: true, rows: 2, ph: 'Vas a abrir una botella de vino en la mesa. Toca cada acción en el orden en que la harías.' }),
        { k: 'items', t: 'items', label: 'Acciones en el orden correcto', min: 3, nuevo: { texto: '', pista: '' }, sub: [T('texto', 'Acción', { req: true }), T('pista', 'Pista si la toca antes de tiempo (opcional)', { ph: 'Ej.: Primero hay que presentar la botella.' })] },
        T('retro', 'Mensaje al terminar')] },
    encuesta: { grupo: 'inter', inter: true, label: 'Encuesta / Reflexión', desc: 'Pregunta abierta o escala del 1 al 5, sin calificación', icon: 'info',
      def: function () { return { pregunta: '', modo: 'abierta', bajo: '', alto: '', gracias: '' }; },
      campos: [A('pregunta', 'Pregunta', { req: true, rows: 2, ph: 'Piensa en tu última semana de trabajo: ¿en qué momento aplicaste esto?' }), { k: 'modo', t: 'choice', label: 'Cómo responde el alumno', opts: [['abierta', 'Escribe su reflexión'], ['escala', 'Escala del 1 al 5']] },
        T('bajo', 'Etiqueta del 1 (solo escala)', { ph: 'Nada seguro' }), T('alto', 'Etiqueta del 5 (solo escala)', { ph: 'Muy seguro' }), T('gracias', 'Mensaje al responder (opcional)', { ph: 'Gracias por compartirlo.' })] },
    ordenar: { grupo: 'eval', inter: true, label: 'Ordenar', desc: 'El alumno ordena los pasos correctamente', icon: 'arrow-down',
      def: function () { return { enunciado: '', items: [], retro: '' }; },
      campos: [A('enunciado', 'Instrucción', { req: true, rows: 2, ph: 'Ordena los pasos para abrir una botella de vino.' }), { k: 'items', t: 'lines', label: 'Elementos en el orden correcto', req: true, min: 2, ph: 'Uno por línea, en el orden CORRECTO; el alumno los verá mezclados.' }, T('retro', 'Mensaje al acertar')] },
    relacionar: { grupo: 'eval', inter: true, label: 'Relacionar', desc: 'El alumno une cada concepto con su pareja', icon: 'repeat',
      def: function () { return { enunciado: '', pares: [{ izq: '', der: '' }, { izq: '', der: '' }], retro: '' }; },
      campos: [A('enunciado', 'Instrucción', { req: true, rows: 2, ph: 'Relaciona cada vino con su temperatura de servicio.' }), { k: 'pares', t: 'items', label: 'Parejas', min: 2, nuevo: { izq: '', der: '' }, sub: [T('izq', 'Concepto', { req: true }), T('der', 'Pareja correcta', { req: true })] }, T('retro', 'Mensaje al acertar')] }
  };
  var ORDEN = ['encabezado', 'parrafo', 'cita', 'lista', 'resumen', 'recursos', 'tabla', 'imagen', 'galeria', 'video', 'audio', 'documento', 'divisor', 'acordeon', 'pestanas', 'pasos', 'linea_tiempo', 'imagen_etiquetas', 'revelar', 'tarjetas', 'escenario', 'simulador', 'arrastrar', 'encuesta', 'vf', 'corta', 'ordenar', 'relacionar'];
  var isStr = function (v) { return typeof v === 'string' && v.trim() !== ''; };
  var esInter = function (b) { var d = BLOQUES[b && b.tipo]; return !!(d && (d.inter || (b.tipo === 'divisor' && b.estilo === 'continuar'))); };

  function nuevo(tipo) { var d = BLOQUES[tipo]; return Object.assign({ tipo: tipo }, d ? d.def() : {}); }
  function vacioCampo(c, v) { if (c.t === 'items' || c.t === 'marcadores' || c.t === 'lines') return !Array.isArray(v) || v.filter(function (x) { return c.t === 'lines' ? isStr(x) : true; }).length === 0; return !isStr(v); }

  /* errores del bloque (para el validador); where = texto de ubicación */
  function validar(b, where) {
    var out = [], d = BLOQUES[b && b.tipo];
    if (!d) { out.push(where + ': tipo de bloque "' + (b && b.tipo) + '" no soportado'); return out; }
    d.campos.forEach(function (c) {
      var v = b[c.k];
      if (c.t === 'items' || c.t === 'marcadores') {
        var n = Array.isArray(v) ? v.length : 0;
        if (n < (c.min || 1)) { out.push(where + ' (' + d.label + '): necesita al menos ' + (c.min || 1) + ' ' + c.label.toLowerCase()); return; }
        v.forEach(function (it, i) { c.sub.forEach(function (s) { if (s.req && vacioCampo(s, it[s.k])) out.push(where + ' (' + d.label + ') ' + c.label.toLowerCase() + ' ' + (i + 1) + ': falta ' + s.label.toLowerCase()); }); });
      } else if (c.t === 'lines') {
        var m = Array.isArray(v) ? v.filter(isStr).length : 0;
        if (c.req && m < (c.min || 1)) out.push(where + ' (' + d.label + '): ' + (c.min > 1 ? 'necesita al menos ' + c.min + ' ' : 'falta: ') + c.label.toLowerCase());
      } else if (c.req && vacioCampo(c, v)) out.push(where + ' (' + d.label + '): falta ' + c.label.toLowerCase());
    });
    if (b.tipo === 'escenario' && Array.isArray(b.opciones) && b.opciones.length && !b.opciones.some(function (o) { return o.correcta; })) out.push(where + ' (Escenario): marca al menos una decisión como correcta');
    return out;
  }

  /* texto plano del bloque (IA, búsquedas, vista de revisión) */
  function texto(b) {
    var d = BLOQUES[b && b.tipo]; if (!d) return '';
    var parts = [];
    d.campos.forEach(function (c) {
      var v = b[c.k];
      if (c.t === 'text' || c.t === 'area') { if (isStr(v) && c.k !== 'url') parts.push(v); }
      else if (c.t === 'lines') { if (Array.isArray(v)) parts.push(v.filter(isStr).join('\n')); }
      else if ((c.t === 'items' || c.t === 'marcadores') && Array.isArray(v)) v.forEach(function (it) { parts.push(c.sub.filter(function (s) { return s.t === 'text' || s.t === 'area'; }).map(function (s) { return it[s.k]; }).filter(isStr).join(': ')); });
    });
    return parts.filter(Boolean).join('\n');
  }
  function textoPantalla(p) { return (p.bloques || []).map(texto).filter(Boolean).join('\n\n'); }
  function contarInter(p) { return (p.bloques || []).filter(esInter).length; }

  var API = { BLOQUES: BLOQUES, ORDEN: ORDEN, GRUPOS: GRUPOS, nuevo: nuevo, validar: validar, texto: texto, textoPantalla: textoPantalla, esInter: esInter, contarInter: contarInter };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Bloques = API;
})(typeof window !== 'undefined' ? window : globalThis);
