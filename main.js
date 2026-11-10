'use strict';
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { start } = require('./src/server');

let win;
let workDir;

app.whenReady().then(async () => {
  workDir = path.join(app.getPath('documents'), 'Generador SCORM');
  const seedDir = app.isPackaged ? path.join(process.resourcesPath, 'ejemplo') : path.join(__dirname, 'ejemplo');
  process.env.GS_MODEL_DIR = path.join(workDir, 'modelos');
  const s = await start({ port: 0, workDir, seedDir });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Archivo', submenu: [
      { label: 'Abrir carpeta de trabajo', click: () => shell.openPath(workDir) },
      { label: 'Inicio', accelerator: 'CmdOrCtrl+0', click: () => win && win.loadURL(s.url + 'home/') },
      { label: 'Autoría', accelerator: 'CmdOrCtrl+1', click: () => win && win.loadURL(s.url + 'editor/') },
      { label: 'Player', accelerator: 'CmdOrCtrl+2', click: () => win && win.loadURL(s.url + 'index.html') },
      { label: 'Utilidades (convertir PDF / escaneados)', accelerator: 'CmdOrCtrl+3', click: () => win && win.loadURL(s.url + 'utilidades/') },
      { type: 'separator' }, { role: 'quit', label: 'Salir' }] },
    { label: 'Ver', submenu: [{ role: 'reload', label: 'Recargar' }, { role: 'toggleDevTools', label: 'Herramientas de desarrollo' }, { role: 'togglefullscreen', label: 'Pantalla completa' }] }
  ]));
  // Ventana estilo Material: sin barra de título nativa; los botones de ventana se pintan con los colores de la barra de la app.
  win = new BrowserWindow({
    width: 1500, height: 900, minWidth: 900, minHeight: 600, title: 'Generador SCORM',
    icon: path.join(__dirname, 'shared', 'app-icon.png'), autoHideMenuBar: true,
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#ffffff', symbolColor: '#1c292c', height: 60 }
  });
  // los enlaces externos (p. ej. la página del modelo de IA) se abren en el navegador, no dentro de la app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL(s.url + 'home/');
  let lastBar = '';
  const syncBar = setInterval(async () => {
    if (!win || win.isDestroyed()) return;
    try {
      const v = await win.webContents.executeJavaScript("(function(){var a=document.querySelector('.appbar')||document.body;return getComputedStyle(a).backgroundColor+'|'+getComputedStyle(document.body).color})()");
      if (v !== lastBar) { lastBar = v; const [color, symbolColor] = v.split('|'); win.setTitleBarOverlay({ color, symbolColor, height: 60 }); }
    } catch (e) { /* la página aún no carga */ }
  }, 1000);
  win.on('close', () => clearInterval(syncBar));
  win.on('closed', () => { win = null; s.server.close(); });
});
app.on('window-all-closed', () => app.quit());
