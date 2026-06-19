import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { registerIpcHandlers } from './ipc';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// 隐藏 Electron 默认菜单栏（File/Edit/View/Window），避免破坏现代桌面应用感。
Menu.setApplicationMenu(null);

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    title: 'LOL助手',
    width: 800,
    height: 600,
    // 隐藏系统标题栏文字区，用自己的顶部标题栏；保留原生最小化/最大化/关闭按钮。
    // 拖拽窗口/双击最大化/Windows Snap 仍由原生支持，零 bug 风险。
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#faf9f7', // 控制按钮区背景，与右侧顶栏 app-surface 同色
      symbolColor: '#25201a', // 控制按钮符号色，与 app-text 同色
      height: 48, // 与顶部栏 h-12（48px）对齐
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // 显式锁定安全配置，不依赖 Electron 默认值（默认值可能随版本变化）。
      // renderer 不能直接用 Node，只能通过 preload 暴露的 window.lolHelper 白名单。
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // 仅开发环境自动打开 DevTools；打包后（app.isPackaged === true）不再弹。
  // 用 'detach' 模式：DevTools 作为独立浮窗，不 dock 在应用窗口内（避免占用右侧/底部布局空间）。
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
};

// 统一注册所有 IPC handler（按功能域拆分在 src/main/ipc/handlers/）。
// 在 app ready 前注册即可，与原内联 handler 时机等价。
registerIpcHandlers();

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
