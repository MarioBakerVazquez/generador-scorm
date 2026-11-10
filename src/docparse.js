'use strict';
// Lee documentos (.docx, .md, .txt, .html) y devuelve bloques: {t:'h',level,text} | {t:'p',text} | {t:'li',text}
const { readZip } = require('./zip');

const ent = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const clean = (s) => s.replace(/\s+/g, ' ').trim();

function parseMarkdown(txt) {
  const blocks = []; let para = [];
  const inline = (s) => s.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(\*|_)(.*?)\1/g, '$2').replace(/`([^`]*)`/g, '$1');
  const flush = () => { if (para.length) { blocks.push({ t: 'p', text: clean(inline(para.join(' '))) }); para = []; } };
  for (const raw of txt.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    let m;
    if ((m = /^(#{1,4})\s+(.*?)\s*#*$/.exec(line))) { flush(); blocks.push({ t: 'h', level: m[1].length, text: clean(inline(m[2])) }); }
    else if ((m = /^\s*(?:[-*+•]|\d+[.)])\s+(.*)$/.exec(line))) { flush(); blocks.push({ t: 'li', text: clean(inline(m[1])) }); }
    else if (/^\s*$/.test(line)) flush();
    else if (/^(-{3,}|={3,}|\*{3,})$/.test(line.trim())) flush();
    else para.push(line.trim());
  }
  flush();
  return blocks.filter((b) => b.text);
}

function parseText(txt) {
  const chunks = txt.replace(/\r/g, '').split(/\n\s*\n/).map((c) => c.trim()).filter(Boolean);
  const blocks = [];
  chunks.forEach((c, i) => {
    const lines = c.split('\n').map((l) => l.trim()).filter(Boolean);
    const isHead = (l) => l.length < 80 && !/[.:;,]$/.test(l);
    if (lines.length === 1 && isHead(lines[0]) && i < chunks.length - 1) { blocks.push({ t: 'h', level: i === 0 ? 1 : 2, text: lines[0] }); return; }
    if (lines.every((l) => /^([-*•]|\d+[.)])\s+/.test(l))) { lines.forEach((l) => blocks.push({ t: 'li', text: l.replace(/^([-*•]|\d+[.)])\s+/, '') })); return; }
    if (isHead(lines[0]) && lines.length > 1) { blocks.push({ t: 'h', level: 2, text: lines.shift() }); }
    blocks.push({ t: 'p', text: clean(lines.join(' ')) });
  });
  return blocks;
}

function parseHtml(html) {
  html = html.replace(/<(script|style|head|nav|footer)[\s\S]*?<\/\1>/gi, '');
  const blocks = []; const re = /<(h[1-4]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi; let m;
  while ((m = re.exec(html))) {
    const text = clean(ent(m[2].replace(/<[^>]+>/g, ' ')));
    if (!text) continue;
    const tag = m[1].toLowerCase();
    blocks.push(tag === 'p' ? { t: 'p', text } : tag === 'li' ? { t: 'li', text } : { t: 'h', level: +tag[1], text });
  }
  return blocks;
}

function parseDocx(buf) {
  const entries = readZip(buf);
  const f = entries.find((e) => e.name === 'word/document.xml');
  if (!f) throw new Error('No parece un .docx válido (falta word/document.xml)');
  const xml = f.data.toString('utf8');
  const blocks = [];
  const paras = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
  for (const p of paras) {
    const text = clean(ent((p.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>|<w:tab\/>/g) || []).map((x) => (x === '<w:tab/>' ? ' ' : x.replace(/<[^>]+>/g, ''))).join('')));
    if (!text) continue;
    const style = (/<w:pStyle w:val="([^"]+)"/.exec(p) || [])[1] || '';
    const outline = /<w:outlineLvl w:val="(\d)"/.exec(p);
    let hm = /^(?:heading|ttulo|t[ií]tulo|titulo)\s*(\d)$/i.exec(style);
    if (hm) blocks.push({ t: 'h', level: Math.min(4, +hm[1]), text });
    else if (/^(title|ttulo|t[ií]tulo)$/i.test(style)) blocks.push({ t: 'h', level: 1, text });
    else if (outline && +outline[1] < 4) blocks.push({ t: 'h', level: +outline[1] + 1, text });
    else if (/<w:numPr>/.test(p) || /^(listparagraph|prrafodelista|párrafodelista)/i.test(style.replace(/\s/g, ''))) blocks.push({ t: 'li', text });
    else blocks.push({ t: 'p', text });
  }
  return blocks;
}

function parseDoc(name, buf, displayName) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  let blocks;
  if (ext === 'docx') blocks = parseDocx(buf);
  else if (ext === 'md' || ext === 'markdown') blocks = parseMarkdown(buf.toString('utf8'));
  else if (ext === 'html' || ext === 'htm') blocks = parseHtml(buf.toString('utf8'));
  else if (ext === 'txt') blocks = parseText(buf.toString('utf8'));
  else if (ext === 'pdf') throw new Error('El PDF se lee en el navegador; no llegó convertido.');
  else throw new Error('Formato no soportado: .' + ext + ' (usa .docx, .pdf, .md, .html o .txt)');
  name = displayName || name;
  const h1 = blocks.find((b) => b.t === 'h' && b.level === 1);
  return { name, title: h1 ? h1.text : name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), blocks, words: blocks.reduce((a, b) => a + b.text.split(/\s+/).length, 0) };
}

module.exports = { parseDoc, parseMarkdown, parseText, parseHtml };
