// Pone el icono propio al .exe (electron-builder lo omite con signAndEditExecutable:false).
const path = require('path');
module.exports = async function (ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  const m = require('rcedit'); const rcedit = m.rcedit || m.default || m;
  const exe = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + '.exe');
  await rcedit(exe, { icon: path.join(ctx.packager.projectDir, 'build', 'icon.ico'), 'version-string': { ProductName: 'Generador SCORM', FileDescription: 'Generador SCORM' } });
};
