// Genera shared/icons.js a partir de Material Symbols (Rounded, peso 400, Apache-2.0).
// Uso:  node build/gen-icons.js <carpeta con node_modules/@material-symbols/svg-400>
const fs = require('fs'), path = require('path');
const base = path.join(process.argv[2] || '.', 'node_modules', '@material-symbols', 'svg-400', 'rounded');
// nombre en la app -> nombre en Material Symbols
const MAP = {
  plus: 'add', check: 'check', x: 'close', 'chevron-down': 'keyboard_arrow_down', 'chevron-right': 'chevron_right', 'chevron-left': 'chevron_left',
  'arrow-up': 'arrow_upward', 'arrow-down': 'arrow_downward', 'arrow-right': 'arrow_forward', 'arrow-left': 'arrow_back',
  trash: 'delete', image: 'image', text: 'notes', list: 'format_list_bulleted', help: 'help', sliders: 'tune', play: 'play_arrow',
  download: 'download', upload: 'upload', alert: 'warning', 'x-circle': 'cancel', 'check-circle': 'check_circle', info: 'info',
  layers: 'layers', eye: 'visibility', monitor: 'desktop_windows', phone: 'mobile', tablet: 'tablet_mac', search: 'search',
  folder: 'folder', refresh: 'refresh', 'rotate-ccw': 'restart_alt', user: 'person', repeat: 'repeat', exit: 'logout',
  maximize: 'fullscreen', clipboard: 'content_paste', pencil: 'edit', cap: 'school', file: 'description', 'file-text': 'article',
  shield: 'verified_user', sun: 'light_mode', moon: 'dark_mode', home: 'home', sparkles: 'wand_stars', copy: 'content_copy',
  clock: 'schedule', grid: 'grid_view', 'book-open': 'menu_book', wand: 'wand_shine', cpu: 'memory', package: 'inventory_2', more: 'more_horiz',
  // extras disponibles para nuevos botones
  save: 'save', settings: 'settings', link: 'link', lock: 'lock', star: 'star', flag: 'flag', bolt: 'bolt', quiz: 'quiz', video: 'videocam',
  audio: 'headphones', table: 'table_chart', timeline: 'timeline', 'drag': 'drag_indicator', undo: 'undo', redo: 'redo', share: 'share', add_circle: 'add_circle'
};
const out = {};
for (const [k, m] of Object.entries(MAP)) {
  const f = path.join(base, m + '.svg');
  if (!fs.existsSync(f)) { console.error('FALTA', k, m); process.exitCode = 1; continue; }
  const d = /<path d="([^"]+)"/.exec(fs.readFileSync(f, 'utf8'));
  if (!d) { console.error('SIN PATH', k); process.exitCode = 1; continue; }
  out[k] = d[1];
}
const src = `/* Iconos: Material Symbols Rounded (Google, licencia Apache-2.0), incrustados para uso sin conexión.
   GENERADO por build/gen-icons.js — no editar a mano. Icon.svg(nombre, tamaño) -> string; Icon.el(nombre, tamaño) -> nodo. */
(function () {
  var P = ${JSON.stringify(out, null, 1).replace(/\n\s*/g, '\n  ').replace(/^\{\n/, '{\n  ')};
  function svg(name, size, extra) {
    size = Math.round((size || 16) * 1.2); // el glifo de Material ocupa ~80 % de su caja
    var d = P[name] || P.info;
    return '<svg class="ic ' + (extra || '') + '" width="' + size + '" height="' + size + '" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="' + d + '"/></svg>';
  }
  function el(name, size, extra) { var t = document.createElement('template'); t.innerHTML = svg(name, size, extra); return t.content.firstChild; }
  window.Icon = { svg: svg, el: el, names: Object.keys(P) };
})();
`;
fs.writeFileSync(path.join(__dirname, '..', 'shared', 'icons.js'), src);
console.log('iconos:', Object.keys(out).length, 'bytes:', src.length);
