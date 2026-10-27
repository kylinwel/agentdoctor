const { app, BrowserWindow, shell, dialog } = require('electron');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
let runtime;
let mainWindow;
app.disableHardwareAcceleration();
// A GUI launched from Explorer may inherit closed stdout/stderr pipes.
for (const stream of [process.stdout, process.stderr]) {
  stream?.on('error', error => { if (error.code !== 'EPIPE') throw error; });
}
app.whenReady().then(async () => {
  const { createApp } = await import(pathToFileURL(path.join(__dirname, '../server/serve.mjs')).href);
  runtime = await createApp({ port: 0, stateDir: path.join(app.getPath('userData'), 'state') });
  const win = mainWindow = new BrowserWindow({
    width: 1440, height: 960, minWidth: 940, minHeight: 680,
    title: 'AgentDoctor · AI 开发环境体检', backgroundColor: '#f6f7f9', autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/github\.com\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(runtime.url + '/')) event.preventDefault(); });
  await win.loadURL(runtime.url);
  win.on('closed', () => { mainWindow = null; });
}).catch(error => { dialog.showErrorBox('AgentDoctor 无法启动', String(error.message || error)); app.quit(); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => runtime?.server.close());
