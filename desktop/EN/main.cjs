const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');

app.setPath('userData', path.join(app.getPath('appData'), app.getName()));
if (!app.requestSingleInstanceLock()) app.quit();
else {
  let window;
  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    window = new BrowserWindow({
      width: 1000, height: 750, useContentSize: true,
      minWidth: 640, minHeight: 510,
      title: app.getName(), backgroundColor: '#000000',
      icon: path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
      show: false, autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false, contextIsolation: true, sandbox: true,
        devTools: false, spellcheck: false,
        autoplayPolicy: 'no-user-gesture-required'
      }
    });
    window.setMenu(null);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('page-title-updated', event => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    window.once('ready-to-show', () => window.show());
    window.on('closed', () => { window = null; });
    window.loadFile(path.join(__dirname, 'game', 'index.html'));
  });
  app.on('window-all-closed', () => app.quit());
}
