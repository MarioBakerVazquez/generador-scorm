'use strict';
// HTML (build-time) de los bloques de aprendizaje. Los interactivos se activan en runtime/course.js (setupBloques).
const { esc } = require('./esc');
const BL = require('../shared/bloques.js');
const Modelo = require('../shared/modelo.js');

/* Formato en línea seguro: **negrita**, *cursiva*, [texto](https://enlace). Primero se escapa todo el HTML. */
const inline = (t) => esc(t)
  .replace(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)/g, (m, a, u) => `<a href="${u}" target="_blank" rel="noopener">${a}</a>`)
  .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[\s(])\*([^*\s][^*\n]*?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
const paras = (t, cls) => String(t || '').split(/\n+/).map((x) => x.trim()).filter(Boolean).map((x) => `<p${cls ? ` class="${cls}"` : ''}>${inline(x)}</p>`).join('');
const okUrl = (u) => /^https?:\/\//i.test(String(u || '').trim());
const ICON = (() => { const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'shared', 'icons.js'), 'utf8'), o = {}; ['info', 'alert', 'bolt'].forEach((k) => { const m = new RegExp('"' + k + '": ?"([^"]+)"').exec(src); o[k] = m ? m[1] : ''; }); return o; })();
const L = (k) => String.fromCharCode(65 + k);

function videoHtml(b) {
  const url = String(b.url || '').trim(); let m;
  const ttl = esc(b.titulo || 'Video');
  if (!okUrl(url)) return `<p class="hint">Falta la dirección del video.</p>`;
  if ((m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/.exec(url))) return `<div class="vid"><iframe src="https://www.youtube-nocookie.com/embed/${m[1]}" title="${ttl}" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"></iframe></div>`;
  if ((m = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url))) return `<div class="vid"><iframe src="https://player.vimeo.com/video/${m[1]}" title="${ttl}" loading="lazy" allow="fullscreen; picture-in-picture"></iframe></div>`;
  if (/\.(mp4|webm|ogv)(\?.*)?$/i.test(url)) return `<div class="vid"><video controls playsinline preload="metadata" src="${esc(url)}" aria-label="${ttl}"></video></div>`;
  return `<p><a class="btn sec" href="${esc(url)}" target="_blank" rel="noopener">Abrir video</a></p>`;
}

const transHtml = (b) => (String(b.transcripcion || '').trim() ? `<details class="b-trans"><summary>Ver transcripción</summary>${paras(b.transcripcion)}</details>` : '');
const HINT = { acordeon: 'Abre cada elemento para continuar.', pestanas: 'Revisa todas las pestañas para continuar.', pasos: 'Recorre todos los pasos para continuar.', imagen_etiquetas: 'Toca cada punto de la imagen para continuar.', tarjetas: 'Toca cada tarjeta para girarla.', revelar: 'Toca el botón para continuar.', escenario: 'Elige la decisión que tomarías.', vf: 'Responde para continuar.', corta: 'Escribe tu respuesta para continuar.', simulador: 'Toca las acciones en el orden correcto para continuar.', encuesta: 'Responde para continuar. No tiene calificación.', arrastrar: 'Coloca todos los elementos y pulsa Comprobar.' };

const R = {
  encabezado: (b) => { const t = b.nivel === '3' ? 'h4' : 'h3', c = 'b-h' + (b.nivel === '3' ? ' sm' : '') + (b.alinear === 'centro' ? ' ctr' : ''); const sub = String(b.sub || '').trim(); return sub ? `<div class="b-hg${b.alinear === 'centro' ? ' ctr' : ''}"><${t} class="${c}">${esc(b.texto)}</${t}><p class="b-sub">${esc(sub)}</p></div>` : `<${t} class="${c}">${esc(b.texto)}</${t}>`; },
  parrafo: (b) => paras(b.texto, ((b.tamano === 'grande' ? 'lead ' : '') + (b.alinear === 'centro' ? 'ctr' : '')).trim()),
  cita: (b) => {
    if (b.estilo === 'cita') return `<blockquote class="b-q">${paras(b.texto)}${b.autor ? `<cite>${esc(b.autor)}</cite>` : ''}</blockquote>`;
    const est = { destacado: 'hi', consejo: 'tip' }[b.estilo] || 'nt', ic = { hi: 'alert', tip: 'bolt', nt: 'info' }[est];
    const rot = { hi: 'Importante', tip: 'Consejo', nt: 'Nota' }[est], tit = String(b.titulo || '').trim();
    return `<aside class="b-note ${est}" role="note"><svg class="b-ic" viewBox="0 -960 960 960" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="${ICON[ic]}"/></svg><div class="b-nb">${tit ? `<b class="b-nt">${esc(tit)}</b>` : `<span class="sr-only">${rot}: </span>`}${paras(b.texto)}</div></aside>`;
  },
  lista: (b) => {
    const it = (b.items || []).filter((x) => String(x).trim());
    if (b.estilo === 'numerada') return `<ol class="b-list">${it.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>`;
    if (b.estilo === 'casillas') return `<ul class="b-list checks">${it.map((x) => `<li><label><input type="checkbox"><span>${inline(x)}</span></label></li>`).join('')}</ul>`;
    if (b.estilo === 'si' || b.estilo === 'no') return `<ul class="b-list mk ${b.estilo}">${it.map((x) => `<li><span class="sr-only">${b.estilo === 'si' ? 'Sí: ' : 'No: '}</span>${inline(x)}</li>`).join('')}</ul>`;
    return `<ul class="b-list">${it.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`;
  },
  resumen: (b) => `<section class="b-sum" aria-label="${esc(b.titulo || 'Ideas clave')}"><h4 class="sum-t">${esc(b.titulo || 'Ideas clave')}</h4><ul>${(b.items || []).filter((x) => String(x).trim()).map((x) => `<li>${inline(x)}</li>`).join('')}</ul></section>`,
  recursos: (b) => { const ok = (b.items || []).filter((x) => okUrl(x.url)), rot = { video: 'Video', lectura: 'Lectura' };
    return `<section class="b-rec" aria-label="${esc(b.titulo || 'Recursos extra')}"><h4 class="rec-t">${esc(b.titulo || 'Recursos extra')}</h4><ul>${ok.map((x) => `<li><a class="rec-a" href="${esc(String(x.url).trim())}" target="_blank" rel="noopener"><span class="rec-k">${rot[x.tipo] || 'Enlace'}</span><b>${esc(x.titulo)}</b>${x.desc ? `<small>${esc(x.desc)}</small>` : ''}</a></li>`).join('')}</ul></section>`; },
  tabla: (b) => {
    const cols = (s) => String(s).split('|').map((x) => x.trim());
    const head = String(b.encabezados || '').trim() ? `<thead><tr>${cols(b.encabezados).map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>` : '';
    const rows = (b.filas || []).filter((r) => String(r).trim()).map((r) => `<tr>${cols(r).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
    return `<div class="b-table"><table>${head}<tbody>${rows}</tbody></table></div>`;
  },
  imagen: (b, ctx) => { const src = ctx.img(b.archivo); return src ? `<figure class="b-fig${b.ancho === 'completa' ? ' full' : ''}"><img src="${esc(src)}" alt="${esc(b.alt || b.pie || '')}" loading="lazy">${b.pie ? `<figcaption>${esc(b.pie)}</figcaption>` : ''}</figure>` : `<p class="hint">Imagen no disponible.</p>`; },
  galeria: (b, ctx) => {
    const sl = (b.imagenes || []).map((im) => ({ im, src: ctx.img(im.archivo) })).filter((x) => x.src);
    if (!sl.length) return `<p class="hint">Galería sin imágenes.</p>`;
    return `<div class="b-gal" role="group" aria-roledescription="carrusel"><div class="gal-t">${sl.map((x, k) => `<figure class="gal-s" data-k="${k}"><img src="${esc(x.src)}" alt="${esc(x.im.alt || x.im.pie || '')}" loading="lazy">${x.im.pie ? `<figcaption>${esc(x.im.pie)}</figcaption>` : ''}</figure>`).join('')}</div>` +
      `<div class="gal-c"><button type="button" class="btn sec sm" data-gal="-1" aria-label="Anterior">‹</button><span class="gal-n">1 / ${sl.length}</span><button type="button" class="btn sec sm" data-gal="1" aria-label="Siguiente">›</button></div></div>`;
  },
  video: (b) => videoHtml(b) + (b.titulo ? `<p class="cap">${esc(b.titulo)}</p>` : '') + transHtml(b),
  documento: (b, ctx) => {
    const d = ctx.doc(b.archivo); if (!d) return `<p class="hint">Falta el archivo del documento.</p>`;
    const ext = (String(b.archivo).match(/\.(\w+)$/) || [, ''])[1].toLowerCase(), kind = ext === 'pdf' ? 'PDF' : /^docx?$/.test(ext) ? 'Word' : /^xlsx?$/.test(ext) ? 'Excel' : ext.toUpperCase();
    const kb = d.size >= 1048576 ? (d.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(d.size / 1024)) + ' KB';
    return `<a class="b-doc" href="${esc(d.href)}" download target="_blank" rel="noopener"><span class="doc-k doc-${esc(ext.slice(0, 3))}" aria-hidden="true">${esc(kind)}</span><span class="doc-t"><b>${esc(b.titulo || b.archivo)}</b>${b.desc ? `<small>${esc(b.desc)}</small>` : ''}<em>${esc(kind)} · ${kb}</em></span><span class="doc-d">Descargar</span></a>`;
  },
  audio: (b) => (okUrl(b.url) ? `${b.titulo ? `<p class="cap">${esc(b.titulo)}</p>` : ''}<audio controls preload="none" src="${esc(String(b.url).trim())}"></audio>${transHtml(b)}` : `<p class="hint">Falta la dirección del audio.</p>`),
  divisor: (b) => (b.estilo === 'continuar' ? `<div class="b-cont"><button type="button" class="btn" data-cont>${esc(b.etiqueta || 'Continuar')}</button></div>` : `<hr class="b-hr">`),

  acordeon: (b, ctx, k) => `<div class="acc">${(b.items || []).map((it, i) => { const id = `${ctx.pid}-b${k}-a${i}`;
    return `<div class="acc-item"><button type="button" class="acc-h" data-k="${i}" aria-expanded="false" aria-controls="${esc(id)}"><span>${esc(it.encabezado)}</span><i aria-hidden="true"></i></button><div class="acc-b" id="${esc(id)}" hidden>${paras(it.texto)}</div></div>`; }).join('')}</div>`,
  pestanas: (b, ctx, k) => `<div class="b-tabs"><div class="tab-h" role="tablist">${(b.items || []).map((it, i) => `<button type="button" role="tab" class="tab-b" data-k="${i}" id="${ctx.pid}-b${k}-t${i}" aria-selected="${i === 0}" aria-controls="${ctx.pid}-b${k}-p${i}">${esc(it.titulo)}</button>`).join('')}</div>` +
    (b.items || []).map((it, i) => `<div class="tab-p" role="tabpanel" id="${ctx.pid}-b${k}-p${i}" data-k="${i}" aria-labelledby="${ctx.pid}-b${k}-t${i}"${i ? ' hidden' : ''}>${paras(it.texto)}</div>`).join('') + `</div>`,
  pasos: (b) => { const it = b.items || []; return `<div class="b-steps" data-n="${it.length}"><div class="st-top"><span class="st-count">Paso 1 de ${it.length}</span><span class="st-dots" aria-hidden="true">${it.map((x, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</span></div>` +
    it.map((s, i) => `<div class="st-p" data-k="${i}"${i ? ' hidden' : ''}><h4><span class="st-n">${i + 1}</span>${esc(s.titulo)}</h4>${paras(s.texto)}</div>`).join('') +
    `<div class="st-nav"><button type="button" class="btn sec" data-st="-1" disabled>Anterior</button><button type="button" class="btn" data-st="1">Siguiente paso</button></div></div>`; },
  linea_tiempo: (b) => `<ol class="b-tl">${(b.items || []).map((it) => `<li><span class="tl-d">${esc(it.fecha)}</span><div class="tl-b"><b>${esc(it.titulo)}</b>${it.texto ? paras(it.texto) : ''}</div></li>`).join('')}</ol>`,
  imagen_etiquetas: (b, ctx) => { const src = ctx.img(b.archivo); const mk = b.marcadores || [];
    if (!src) return `<p class="hint">Imagen no disponible.</p>`;
    return `<div class="b-hot"><div class="hz"><div class="hs"><img src="${esc(src)}" alt="${esc(b.alt || '')}" loading="lazy">${mk.map((m, i) => `<button type="button" class="pin" data-k="${i}" style="left:${Math.max(0, Math.min(100, +m.x || 0))}%;top:${Math.max(0, Math.min(100, +m.y || 0))}%" aria-label="Punto ${i + 1}: ${esc(m.titulo)}">${i + 1}</button>`).join('')}</div></div><button type="button" class="hzb" aria-pressed="false">Ampliar imagen</button>` +
      `<ul class="hl">${mk.map((m, i) => `<li><button type="button" data-k="${i}"><b>${i + 1}</b><span>${esc(m.titulo)}</span></button></li>`).join('')}</ul>` +
      `<div class="hp-box" aria-live="polite">${mk.map((m, i) => `<div class="hp" data-k="${i}" hidden><b>${esc(m.titulo)}</b>${paras(m.texto)}</div>`).join('')}</div></div>`; },
  revelar: (b, ctx, k) => { const id = `${ctx.pid}-b${k}-r`; return `<div class="b-rev"><button type="button" class="btn rev-b" aria-expanded="false" aria-controls="${esc(id)}">${esc(b.boton || 'Toca para ver')}</button><div class="rev-c" id="${esc(id)}" role="region" hidden>${b.titulo ? `<b class="rev-t">${esc(b.titulo)}</b>` : ''}${paras(b.texto)}</div></div>`; },
  tarjetas: (b) => `<div class="b-cards">${(b.items || []).map((it, i) => `<button type="button" class="flipc" data-k="${i}" aria-pressed="false"><span class="fr">${esc(it.frente)}</span><span class="bk">${esc(it.reverso)}</span></button>`).join('')}</div>`,
  escenario: (b) => `<div class="b-esc"><div class="esc-s">${paras(b.situacion)}</div><div class="esc-me" hidden></div><div class="esc-o">${(b.opciones || []).map((o, i) => `<button type="button" class="eopt" data-k="${i}" data-ok="${o.correcta ? 1 : 0}"><b>${L(i)}</b><span>${esc(o.texto)}</span></button>`).join('')}</div>` +
    (b.opciones || []).map((o, i) => `<div class="esc-r ${o.correcta ? 'good' : 'bad'}" data-k="${i}" role="status" hidden><b>${o.correcta ? 'Buena decisión' : 'No es la mejor opción'}</b>${paras(o.resultado)}</div>`).join('') + `</div>`,
  vf: (b) => `<div class="b-vf" data-ok="${b.correcta === 'f' ? 'f' : 'v'}" data-retro="${esc(b.retro || '')}"><p class="q">${esc(b.afirmacion)}</p><div class="vf-o"><button type="button" class="eopt" data-v="v"><b>V</b><span>Verdadero</span></button><button type="button" class="eopt" data-v="f"><b>F</b><span>Falso</span></button></div><div class="fbk" role="status" hidden></div></div>`,
  corta: (b, ctx, k) => { const id = `${ctx.pid}-b${k}-c`, ans = [b.respuesta].concat(b.variantes || []).map((x) => String(x || '').trim()).filter(Boolean);
    const inp = `<input type="text" class="cor-i" id="${esc(id)}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Tu respuesta">`, m = /_{3,}/.exec(String(b.enunciado || ''));
    const q = m ? `<p class="q cor-f">${esc(b.enunciado.slice(0, m.index))}${inp}${esc(b.enunciado.slice(m.index + m[0].length))}</p>` : `<label class="q" for="${esc(id)}">${esc(b.enunciado)}</label>${inp}`;
    return `<div class="b-cor" data-ans="${esc(JSON.stringify(ans))}" data-retro="${esc(b.retro || '')}">${q}<button type="button" class="btn" data-chk>Comprobar</button><div class="fbk" role="status" hidden></div></div>`; },
  simulador: (b) => { const it = (b.items || []).filter((x) => String(x.texto || '').trim());
    return `<div class="b-sim" data-n="${it.length}" data-retro="${esc(b.retro || '')}">${b.enunciado ? `<p class="q">${esc(b.enunciado)}</p>` : ''}<p class="sim-c" aria-live="polite">Paso 1 de ${it.length}</p><div class="sim-l">${it.map((x, i) => `<button type="button" class="sim-b" data-o="${i}" data-hint="${esc(x.pista || '')}"><b></b><span>${esc(x.texto)}</span></button>`).join('')}</div><div class="fbk" role="status" hidden></div></div>`; },
  arrastrar: (b) => { const zs = (b.zonas || []).filter((z) => String(z.nombre || '').trim());
    const els = []; zs.forEach((z, zi) => (z.elementos || []).filter((t) => String(t || '').trim()).forEach((t) => els.push({ t, zi })));
    return `<div class="b-dd" data-int="${+b.intentos >= 0 ? +b.intentos : 2}" data-ok="${esc(b.ok || '')}" data-mal="${esc(b.mal || '')}">${b.enunciado ? `<p class="q">${esc(b.enunciado)}</p>` : ''}` +
      `<p class="hint dd-h">Arrastra cada elemento a su zona, o toca el elemento y luego la zona.</p>` +
      `<div class="dd-pool" aria-label="Elementos por colocar">${els.map((e) => `<button type="button" class="dd-i" draggable="true" data-z="${e.zi}" aria-pressed="false">${esc(e.t)}</button>`).join('')}</div>` +
      `<div class="dd-zones">${zs.map((z, zi) => `<div class="dd-z" data-k="${zi}"><div class="dd-zh"><b>${esc(z.nombre)}</b><button type="button" class="dd-put" aria-label="Colocar aquí: ${esc(z.nombre)}" disabled>Colocar aquí</button></div><div class="dd-drop"></div></div>`).join('')}</div>` +
      `<button type="button" class="btn dd-chk" disabled>Comprobar</button><div class="fbk" role="status" hidden></div></div>`; },
  encuesta: (b, ctx, k) => { const id = `${ctx.pid}-b${k}-e`, esc5 = b.modo === 'escala';
    const cuerpo = esc5 ? `<div class="enc-s" role="group" aria-labelledby="${esc(id)}-q">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="enc-n" data-v="${n}" aria-pressed="false">${n}</button>`).join('')}</div>${b.bajo || b.alto ? `<div class="enc-l"><span>${esc(b.bajo || '')}</span><span>${esc(b.alto || '')}</span></div>` : ''}`
      : `<textarea class="enc-t" id="${esc(id)}-t" rows="4" aria-labelledby="${esc(id)}-q" placeholder="Escribe aquí tu reflexión…"></textarea><button type="button" class="btn" data-save>Guardar reflexión</button>`;
    return `<div class="b-enc" data-modo="${esc5 ? 'escala' : 'abierta'}" data-gracias="${esc(b.gracias || 'Gracias por responder.')}"><p class="q" id="${esc(id)}-q">${esc(b.pregunta)}</p>${cuerpo}<div class="fbk good" role="status" hidden></div></div>`; },
  ordenar: (b) => `<div class="b-ord" data-retro="${esc(b.retro || '')}">${b.enunciado ? `<p class="q">${esc(b.enunciado)}</p>` : ''}<ol class="ord-l">${(b.items || []).filter((x) => String(x).trim()).map((x, i) => `<li data-o="${i}"><span class="t">${esc(x)}</span><span class="mv"><button type="button" data-mv="-1" aria-label="Subir">↑</button><button type="button" data-mv="1" aria-label="Bajar">↓</button></span></li>`).join('')}</ol>` +
    `<button type="button" class="btn" data-chk>Comprobar orden</button><div class="fbk" role="status" hidden></div></div>`,
  relacionar: (b) => { const pr = (b.pares || []).filter((p) => String(p.izq).trim() && String(p.der).trim());
    return `<div class="b-rel" data-retro="${esc(b.retro || '')}">${b.enunciado ? `<p class="q">${esc(b.enunciado)}</p>` : ''}<div class="rel-l">${pr.map((p, i) => `<div class="rel-r" data-o="${i}"><span class="t">${esc(p.izq)}</span><select aria-label="Pareja de ${esc(p.izq)}"><option value="">Elige…</option>${pr.map((q, j) => `<option value="${j}">${esc(q.der)}</option>`).join('')}</select></div>`).join('')}</div>` +
    `<button type="button" class="btn" data-chk>Comprobar</button><div class="fbk" role="status" hidden></div></div>`; }
};


/* ---------- versión APP MÓVIL de un objeto (sección 14: equivalencia pedagógica, tabla fija en shared/modelo.js) ----------
   Devuelve null si el objeto se ve igual en móvil, o un arreglo de pantallas (.mv-step) que el runtime pagina de una en una. */
function chunkTexto(txt, max) {
  const out = []; let cur = [], n = 0;
  String(txt || '').split(/\n+/).map((x) => x.trim()).filter(Boolean).forEach((par) => {
    par.split(/(?<=[.!?…])\s+/).forEach((sent) => {
      const w = Modelo.palabras(sent);
      if (cur.length && n + w > max) { out.push(cur.join(' ')); cur = []; n = 0; }
      cur.push(sent); n += w;
    });
    cur.push('\n');
  });
  if (cur.length) out.push(cur.join(' '));
  return out.map((c) => c.replace(/ ?\n ?/g, '\n').trim()).filter(Boolean);
}
function movilAlt(b, inter) {
  const eq = Modelo.equivalencia(b).id, it = (b.items || []);
  const mk = (htmls) => htmls.map((x, i) => `<div class="mv-step"${inter && i === htmls.length - 1 ? ' data-mvdone="1"' : ''}>${x}</div>`);
  const pasos = (arr) => mk(arr.map((x, i) => `<p class="mv-n">Paso ${i + 1} de ${arr.length}</p>${x.sub ? `<p class="mv-s">${esc(x.sub)}</p>` : ''}<h3 class="mv-t">${esc(x.t)}</h3>${paras(x.x)}`));
  switch (b.tipo) {
    case 'parrafo': return Modelo.palabras(b.texto) > Modelo.MAX_PALABRAS_MOVIL ? mk(chunkTexto(b.texto, 120).map((c) => paras(c))) : null;
    case 'tabla': {
      const cols = (x) => String(x).split('|').map((c) => c.trim()), head = String(b.encabezados || '').trim() ? cols(b.encabezados) : [];
      const rows = (b.filas || []).filter((r) => String(r).trim()).map(cols); if (!rows.length) return null;
      if (eq === 'lista_en_tarjeta') return mk([`<ul class="b-list">${rows.map((r) => `<li>${r.map((c, j) => (head[j] ? `<b>${esc(head[j])}:</b> ` : '') + esc(c)).join(' · ')}</li>`).join('')}</ul>`]);
      return mk([`<p class="hint">Desliza para ver cada fila →</p><div class="mv-cards">${rows.map((r) => `<div class="mv-card">${r.map((c, j) => `<p>${head[j] ? `<b>${esc(head[j])}</b>` : ''}${esc(c)}</p>`).join('')}</div>`).join('')}</div>`]);
    }
    case 'pestanas':
      if (eq === 'lista_expandible') return mk([`<div class="acc mv-acc">${it.map((x, i) => `<div class="acc-item"><button type="button" class="acc-h" aria-expanded="false"><span>${esc(x.titulo)}</span><i aria-hidden="true"></i></button><div class="acc-b" hidden>${paras(x.texto)}</div></div>`).join('')}</div>`]);
      return pasos(it.map((x) => ({ t: x.titulo, x: x.texto })));
    case 'acordeon':
      return eq === 'pasos_stepper' ? pasos(it.map((x) => ({ t: x.encabezado, x: x.texto }))) : null;
    case 'pasos':
      if (eq === 'timeline_vertical') return mk([`<ol class="b-tl">${it.map((x) => `<li><span class="tl-d">${esc(x.titulo)}</span><div class="tl-b">${x.texto ? paras(x.texto) : ''}</div></li>`).join('')}</ol>`]);
      return pasos(it.map((x) => ({ t: x.titulo, x: x.texto })));
    case 'linea_tiempo':
      return eq === 'pasos_numerados' ? pasos(it.map((x) => ({ sub: x.fecha, t: x.titulo, x: x.texto }))) : null;
    default: return null;
  }
}

function renderBloquesInner(p, ctx) {
  let n = 0;
  const c2 = { img: ctx.img || (() => null), doc: ctx.doc || (() => null), pid: String(p.id).replace(/[^A-Za-z0-9_-]/g, '_') };
  return (p.bloques || []).map((b, k) => {
    const f = R[b.tipo]; if (!f) return '';
    const inter = BL.esInter(b); const idx = inter ? n++ : -1;
    const hint = inter && HINT[b.tipo] ? `<p class="hint">${HINT[b.tipo]}</p>` : '';
    const cd = Modelo.colsDe(b, 'd'), ct = Modelo.colsDe(b, 't');
    const alt = movilAlt(b, inter), eqm = Modelo.equivalencia(b).id || '';
    const body = alt ? `<div class="mv-d">${hint}${f(b, c2, k)}</div><div class="mv-m">${alt.join('')}</div>` : `${hint}${f(b, c2, k)}`;
    return `<div class="blk b-${b.tipo}${inter ? ' is-inter' : ''}${alt ? ' has-mv' : ''}" data-b="${k}" data-bt="${b.tipo}" data-mv="${eqm}"${b.id ? ` data-oid="${esc(b.id)}"` : ''}${inter ? ` data-i="${idx}"` : ''} style="--cd:${cd};--ct:${ct}">${body}</div>`;
  }).join('');
}
function renderBloques(p, ctx) {
  return `<div class="bl-grid">${renderBloquesInner(p, ctx)}</div>`;
}

module.exports = { renderBloques };
