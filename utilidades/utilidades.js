(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const ic = (n, s) => Icon.el(n, s);
  const files = []; let busy = false, ctl = null, prev = null, baseName = 'documento';
  const kb = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const put = (el, icon, text, sz) => { el.innerHTML = ''; if (icon) el.append(ic(icon, sz || 16)); if (text) el.append(text); };

  /* ---------- cabecera ---------- */
  $('logoIc').append(ic('cap', 17));
  $('tabHome').append(ic('home', 14), 'Inicio'); $('tabAut').append(ic('pencil', 14), 'Autoría'); $('tabPlay').append(ic('play', 14), 'Player'); $('tabUtil').append(ic('wand', 14), 'Utilidades');
  $('btnTheme').append(ic(Theme.current() === 'dark' ? 'sun' : 'moon', 16));
  $('btnTheme').onclick = () => { const t = Theme.toggle(); $('btnTheme').innerHTML = ''; $('btnTheme').append(ic(t === 'dark' ? 'sun' : 'moon', 16)); };
  $('dzIc').append(ic('upload', 30));
  put($('btnPick'), 'file-text', 'Elegir archivos'); put($('btnPaste'), 'pencil', 'Pegar texto');
  put($('btnGo'), 'wand', 'Convertir'); put($('btnStop'), 'x', 'Detener');
  put($('btnFmt'), 'list', 'Dar formato automático'); put($('btnAI'), 'sparkles', 'Pulir con IA local'); put($('btnUndo'), 'rotate-ccw', 'Deshacer');
  put($('btnCopy'), 'copy', 'Copiar'); put($('btnDl'), 'download', 'Descargar .md');
  put($('btnCurso'), 'book-open', 'Crear curso con este texto'); put($('btnEval'), 'clipboard', 'Crear evaluación con este texto');
  $('btnAI').classList.add('ai');
  $('tip').innerHTML = '<b>¿PDF o foto?</b> Si el PDF fue creado desde Word o un programa (se puede seleccionar el texto), se convierte al instante. Si son <b>hojas escaneadas o fotos</b>, se leen con reconocimiento de texto (OCR): tarda unos segundos por página y conviene revisar el resultado.';

  function toast(msg) { const t = $('toast'); t.textContent = ''; t.append(ic('check-circle', 18), document.createTextNode(' ' + msg)); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3500); }

  /* ---------- archivos ---------- */
  function drawFiles() {
    const ul = $('files'); ul.innerHTML = '';
    files.forEach((f, i) => {
      const tag = f.kind === 'pdf' ? ['PDF', '#c0392b'] : ['IMG', '#2b7a78'];
      const li = document.createElement('li'); li.innerHTML = '<span class="tag" style="background:' + tag[1] + '">' + tag[0] + '</span><div class="tx"><b></b><span></span></div>';
      li.querySelector('b').textContent = f.name; const sp = li.querySelector('span:not(.tag)'); sp.textContent = f.note || kb(f.size); if (f.cls) sp.className = f.cls;
      const x = document.createElement('button'); x.className = 'btn ghost sm icon'; x.title = 'Quitar'; x.append(ic('x', 15)); x.disabled = busy; x.onclick = () => { files.splice(i, 1); drawFiles(); };
      li.append(x); ul.append(li);
    });
    $('btnGo').disabled = busy || !files.length;
  }
  async function add(list) {
    for (const f of list) {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (ext === 'pdf') files.push({ name: f.name, kind: 'pdf', size: f.size, buf: await f.arrayBuffer() });
      else if (/^(png|jpe?g|webp|bmp)$/.test(ext)) files.push({ name: f.name, kind: 'img', size: f.size, blob: f });
      else toast('«' + f.name + '» no es PDF ni imagen. Para Word, Markdown o HTML usa «Curso desde mi contenido».');
    }
    if (files.length && baseName === 'documento') baseName = files[0].name.replace(/\.[^.]+$/, '');
    drawFiles();
  }
  $('btnPick').onclick = () => $('file').click();
  $('file').onchange = () => { add([...$('file').files]); $('file').value = ''; };
  const dz = $('dz');
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', (e) => add([...e.dataTransfer.files]));
  $('btnPaste').onclick = () => { $('out').focus(); toast('Pega tu texto abajo y pulsa «Dar formato automático».'); };

  /* ---------- progreso ---------- */
  function progress(on, f, msg) { $('prog').hidden = !on; if (on) { $('barI').style.width = Math.round(Math.max(0, Math.min(1, f || 0)) * 100) + '%'; $('progT').textContent = msg || ''; } }
  function setBusy(b) { busy = b; $('btnGo').hidden = b; $('btnStop').hidden = !b; $('btnFmt').disabled = b; $('btnAI').disabled = b || (window.AIStatus && AIStatus.state.disponible === false); drawFiles(); }

  /* ---------- convertir ---------- */
  $('btnGo').onclick = async () => {
    if (busy || !files.length) return;
    ctl = { cancel: false }; setBusy(true); const parts = []; const forzar = $('force').checked; let usoOcr = false;
    try {
      for (let i = 0; i < files.length && !ctl.cancel; i++) {
        const f = files[i]; f.cls = ''; f.note = 'Leyendo…'; drawFiles();
        let md = '';
        if (f.kind === 'pdf' && !forzar) {
          const r = await PdfTools.toMarkdown(f.buf, (p, m) => progress(true, (i + p) / files.length, f.name + ': ' + m));
          if (!r.scanned) { md = r.markdown; f.note = 'Texto leído directamente · ' + r.pages + ' pág.'; f.cls = 'ok'; }
          else f.note = 'Sin texto (escaneado): usando OCR…';
        }
        if (!md) {
          usoOcr = true; drawFiles();
          const src = f.kind === 'pdf' ? { tipo: 'pdf', buf: f.buf, name: f.name } : { tipo: 'img', blob: f.blob, name: f.name };
          const r = await PdfTools.ocr([src], (p, m) => progress(true, (i + p) / files.length, f.name + ': ' + m + ' · la primera vez la app prepara el lector de texto y puede tardar un par de minutos; después es rápido'), ctl);
          md = TextClean.toMarkdown(r.texto); f.note = 'Digitalizado con OCR · ' + r.paginas + ' pág.'; f.cls = 'warn';
          if (!md.trim()) { f.note = 'No se encontró texto legible.'; f.cls = 'bad'; }
        }
        if (md) parts.push(files.length > 1 ? '# ' + f.name.replace(/\.[^.]+$/, '') + '\n\n' + md.replace(/^# /gm, '## ').replace(/^(#{4,}) /gm, '### ') : md);
        drawFiles();
      }
      if (parts.length) { prev = $('out').value || null; $('out').value = parts.join('\n\n'); showStats(); const q = TextClean.quality($('out').value); $('btnAI').classList.toggle('primary', usoOcr || q.limpiar);
        if (usoOcr) $('aiHint').hidden = false, $('aiHint').textContent = 'Texto digitalizado con OCR: revísalo. «Pulir con IA local» corrige errores de lectura, pero es lento.';
        else if (q.limpiar) $('aiHint').hidden = false, $('aiHint').textContent = 'El texto salió con problemas de formato (' + q.motivos.join(', ') + '). Te recomendamos «Pulir con IA local»; es lento, así que puedes detenerlo cuando quieras.';
        else $('aiHint').hidden = true; toast(ctl.cancel ? 'Detenido. Se conservó lo ya convertido.' : 'Listo: texto convertido.'); }
      else if (!ctl.cancel) toast('No se pudo obtener texto de los archivos.');
    } catch (e) { toast('Error: ' + e.message); }
    progress(false); setBusy(false); ctl = null;
  };
  $('btnStop').onclick = () => { if (ctl) ctl.cancel = true; if (ctl && ctl.abort) ctl.abort.abort(); };

  /* ---------- resultado ---------- */
  function showStats() { const s = TextClean.stats($('out').value); $('stats').textContent = $('out').value.trim() ? s.palabras + ' palabras · ' + s.titulos + ' títulos detectados' : 'Aún no hay resultado.'; $('btnUndo').hidden = prev == null; }
  $('out').oninput = showStats;
  $('btnFmt').onclick = () => { if (!$('out').value.trim()) return; prev = $('out').value; $('out').value = TextClean.toMarkdown(prev); showStats(); toast('Formato aplicado (títulos, listas y párrafos).'); };
  $('btnUndo').onclick = () => { if (prev == null) return; const cur = $('out').value; $('out').value = prev; prev = cur; showStats(); };
  $('btnCopy').onclick = async () => { try { await navigator.clipboard.writeText($('out').value); toast('Texto copiado.'); } catch (e) { $('out').select(); document.execCommand('copy'); toast('Texto copiado.'); } };
  $('btnDl').onclick = () => { const v = $('out').value; if (!v.trim()) return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([v], { type: 'text/markdown' })); a.download = baseName.replace(/[^\w.-]+/g, '_') + '.md'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };

  /* ---------- pulir con IA (por fragmentos, con avance y cancelación) ---------- */
  function chunks(md, max) {
    const out = []; let cur = '';
    md.split(/\n{2,}/).forEach((p) => { if (cur && (cur.length + p.length) > max) { out.push(cur); cur = ''; } cur += (cur ? '\n\n' : '') + p; });
    if (cur) out.push(cur); return out;
  }
  $('btnAI').onclick = async () => {
    const txt = $('out').value.trim(); if (!txt || busy) return;
    const parts = chunks(txt, 1100), est = Math.max(1, Math.round(parts.length * 2));
    if (!confirm('La IA local corregirá el texto por fragmentos (' + parts.length + ' en total). En esta computadora tarda aproximadamente ' + est + ' min. Puedes detenerlo en cualquier momento y se conserva lo avanzado.\n\n¿Continuar?')) return;
    const ac = new AbortController(); ctl = { cancel: false, abort: ac }; setBusy(true); prev = $('out').value; const res = []; let cambios = 0;
    try {
      for (let i = 0; i < parts.length && !ctl.cancel; i++) {
        progress(true, i / parts.length, 'Puliendo fragmento ' + (i + 1) + ' de ' + parts.length + '…');
        let r; try { r = await (await fetch('/api/ai', { method: 'POST', signal: ac.signal, body: JSON.stringify({ tarea: 'formatear', args: { texto: parts[i] } }) })).json(); } catch (e) { r = { ok: false, error: 'Cancelado' }; }
        if (!r.ok) { if (ctl.cancel) { res.push(parts[i]); break; } throw new Error(r.error); }
        res.push(r.resultado.texto); if (r.resultado.cambiado) cambios++;
        $('out').value = res.concat(parts.slice(i + 1)).join('\n\n'); showStats();
      }
      if (ctl.cancel) res.push(...parts.slice(res.length));
      $('out').value = res.join('\n\n'); showStats();
      toast(ctl.cancel ? 'Detenido. Se conservó lo avanzado.' : 'IA terminó: ' + cambios + ' de ' + parts.length + ' fragmentos mejorados. Revísalos antes de usarlos.');
    } catch (e) { $('out').value = prev; showStats(); toast('La IA no pudo continuar: ' + e.message); }
    progress(false); setBusy(false); ctl = null;
  };
  if (window.AIStatus) AIStatus.onChange(() => { const off = AIStatus.state.disponible === false; $('btnAI').disabled = busy || off; $('btnAI').title = off ? 'IA local no instalada: mira el estado en la barra superior' : ''; });

  /* ---------- crear curso / evaluación ---------- */
  function go(tipo) {
    const v = $('out').value.trim(); if (!v) { toast('Primero convierte o pega un texto.'); return; }
    try { sessionStorage.setItem('gs-import', JSON.stringify({ tipo, nombre: baseName, markdown: v })); } catch (e) { toast('No se pudo pasar el texto.'); return; }
    location.href = '/home/';
  }
  $('btnCurso').onclick = () => go('contenido');
  $('btnEval').onclick = () => go('evaluacion');
  drawFiles(); showStats();
})();
