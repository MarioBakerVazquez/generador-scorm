// Genera el icono de la aplicación (build/icon.ico, build/icon.png, shared/app-icon.png, shared/favicon.png).
// Uso:  <electron.exe> build/gen-app-icon.js <carpeta con node_modules/@material-symbols/svg-400>
// Se ejecuta con Electron porque usa su motor para rasterizar el SVG (sin dependencias nativas extra).
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');
const root = process.env.GS_ROOT || path.join(__dirname, '..');
const ms = path.join(process.argv[process.argv.length - 1], 'node_modules', '@material-symbols', 'svg-400', 'rounded', 'school-fill.svg');
const cap = /<path d="([^"]+)"/.exec(fs.readFileSync(ms, 'utf8'))[1];

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="100%" height="100%">
<defs>
  <clipPath id="c"><rect x="40" y="40" width="944" height="944" rx="220"/></clipPath>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b5a4d"/><stop offset=".5" stop-color="#12806b"/><stop offset="1" stop-color="#2b7fa3"/></linearGradient>
  <radialGradient id="h" cx=".85" cy=".1" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <filter id="s" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="22" stdDeviation="22" flood-color="#04261f" flood-opacity=".38"/></filter>
</defs>
<rect x="40" y="40" width="944" height="944" rx="220" fill="url(#g)"/>
<rect x="40" y="40" width="944" height="944" rx="220" fill="url(#h)"/>
<g clip-path="url(#c)"><circle cx="880" cy="170" r="210" fill="#fff" opacity=".07"/><circle cx="150" cy="940" r="190" fill="#000" opacity=".09"/></g>
<g filter="url(#s)"><g transform="translate(128 96) scale(.8)"><svg viewBox="0 -960 960 960" width="960" height="960"><path fill="#fff" d="${cap}"/></svg></g></g>
<path fill="#ffd54f" d="M812 168 L836 238 L906 262 L836 286 L812 356 L788 286 L718 262 L788 238 Z"/>
<path fill="#ffe9a3" d="M680 120 L691 152 L723 163 L691 174 L680 206 L669 174 L637 163 L669 152 Z"/>
</svg>`;

app.on('window-all-closed', () => {}); // al destruir cada ventana de render no debe cerrarse la app
async function render(size) {
  const w = new BrowserWindow({ width: 400, height: 400 });
  await w.loadURL('data:text/html,<body></body>');
  const b64 = await w.webContents.executeJavaScript(`new Promise((res, rej) => {
    const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = ${size};
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, ${size}, ${size}); res(c.toDataURL('image/png').split(',')[1]); };
    img.onerror = () => rej(new Error('svg')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(SVG.replace('width="100%" height="100%"', 'width="1024" height="1024"'))}); })`);
  w.destroy();
  return Buffer.from(b64, 'base64');
}

app.whenReady().then(async () => { try {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = {};
  for (const s of sizes.concat([512])) pngs[s] = await render(s);
  // ICO con PNG incrustados (Windows Vista+)
  const n = sizes.length, head = Buffer.alloc(6 + 16 * n); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(n, 4);
  let off = head.length; const parts = [];
  sizes.forEach((s, i) => { const b = pngs[s], e = 6 + 16 * i; head[e] = s === 256 ? 0 : s; head[e + 1] = s === 256 ? 0 : s; head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(b.length, e + 8); head.writeUInt32LE(off, e + 12); off += b.length; parts.push(b); });
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), Buffer.concat([head, ...parts]));
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), pngs[512]);
  fs.writeFileSync(path.join(root, 'shared', 'app-icon.png'), pngs[256]);
  fs.writeFileSync(path.join(root, 'shared', 'favicon.png'), pngs[64]);
  fs.writeFileSync(path.join(root, 'build', 'icon.svg'), SVG);
  console.log('ok'); } catch (e) { fs.writeFileSync(path.join(root, 'build', 'icon-error.txt'), String(e.stack)); } app.quit();
});
