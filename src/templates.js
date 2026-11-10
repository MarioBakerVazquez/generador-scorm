'use strict';
// Plantillas HTML (build-time). Cada una recibe la pantalla del JSON y devuelve el HTML interno.

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const paras = (t) => String(t).split(/\n{1,}/).map((x) => x.trim()).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join('');

function textoImagen(p, ctx) {
  const c = p.contenido || {};
  let html = '';
  if (c.texto) html += paras(c.texto);
  if (Array.isArray(c.parrafos)) html += c.parrafos.map((x) => `<p>${esc(x)}</p>`).join('');
  if (Array.isArray(c.puntos) && c.puntos.length) html += `<ul class="puntos">${c.puntos.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const img = ctx.mediaPath
    ? `<figure class="fig"><img src="${esc(ctx.mediaPath)}" alt="${esc((p.imagen && p.imagen.alt) || p.titulo)}"></figure>`
    : '';
  return `<div class="ti${img ? '' : ' sin-img'}"><div class="txt">${html}</div>${img}</div>`;
}

function acordeon(p) {
  const items = p.contenido.items.map((it, k) => {
    const id = `${p.id}-a${k}`;
    return `<div class="acc-item"><button type="button" class="acc-h" data-k="${k}" aria-expanded="false" aria-controls="${esc(id)}"><span>${esc(it.encabezado)}</span><i aria-hidden="true"></i></button>` +
      `<div class="acc-b" id="${esc(id)}" hidden>${paras(it.texto)}</div></div>`;
  }).join('');
  return `<p class="hint">Abre cada elemento para continuar.</p><div class="acc">${items}</div>`;
}

function pregunta(q) {
  const opts = q.opciones.map((o, k) => `<button type="button" class="opt" role="radio" aria-checked="false" data-k="${k}"><b>${String.fromCharCode(65 + k)}</b><span>${esc(o)}</span></button>`).join('');
  return `<div class="opts" role="radiogroup" aria-label="${esc(q.enunciado)}">${opts}</div><div class="fb" role="status" hidden></div>`;
}

const { renderBloques } = require('./bloques-html');
const PLANTILLAS = { texto_imagen: textoImagen, acordeon, bloques: (p, ctx) => renderBloques(p, ctx) };

module.exports = { PLANTILLAS, pregunta, esc, paras };
