import './safeConsole';
import { app, BrowserWindow, Menu } from 'electron';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { registerIpcHandlers } from './ipc';
// LCU game-data 预加载：启动后后台拉最新英雄/装备/技能/符文数据覆盖 datas.json 兜底
import { preloadGameData } from './lcu/gameData';
import { APP_LAYOUT } from '../shared/constants';
import { startAssistEngine, stopAssistEngine } from './assist/engine';
import { startLiveWatcher, stopLiveWatcher } from './live/liveWatcher';
import { startSavedMatchFollowWatcher, stopSavedMatchFollowWatcher } from './match/savedMatchFollowWatcher';

const APP_WINDOW_TITLE = 'LOL助手';
const DEFAULT_WINDOW_WIDTH = APP_LAYOUT.workspaceWidth + APP_LAYOUT.friendPanelWidth;
const MIN_WINDOW_WIDTH = APP_LAYOUT.workspaceWidth + APP_LAYOUT.hiddenFriendPanelWidth;

function writeRendererExitLog(
  details: { reason: string; exitCode: number },
  url: string,
): void {
  try {
    const logDirectory = path.join(app.getPath('userData'), 'logs');
    mkdirSync(logDirectory, { recursive: true });
    const metrics = app.getAppMetrics().map((metric) => ({
      pid: metric.pid,
      type: metric.type,
      memory: metric.memory,
      cpu: metric.cpu,
    }));
    appendFileSync(
      path.join(logDirectory, 'renderer-exits.jsonl'),
      `${JSON.stringify({ at: new Date().toISOString(), url, details, metrics })}\n`,
      'utf8',
    );
  } catch {
    // Diagnostics must never interfere with renderer recovery.
  }
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

Menu.setApplicationMenu(null);

function closeLegacyFriendWindows(mainWindow: BrowserWindow): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win === mainWindow || win.isDestroyed()) continue;

    const url = win.webContents.getURL();
    const { width } = win.getBounds();
    const isLegacyDevFriendWindow =
      Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL) &&
      width <= APP_LAYOUT.friendPanelWidth + 80 &&
      url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    const isLegacyFriendWindow =
      win.getTitle() === '好友' ||
      url.includes('panel=friends') ||
      isLegacyDevFriendWindow;

    if (isLegacyFriendWindow) {
      win.close();
    }
  }
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    title: APP_WINDOW_TITLE,
    width: DEFAULT_WINDOW_WIDTH,
    height: APP_LAYOUT.windowHeight,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: APP_LAYOUT.minWindowHeight,
    backgroundColor: '#0b0f14',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0d1219',
      symbolColor: '#c4ced9',
      height: 44,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // 显式锁定安全配置，不依赖 Electron 默认值（默认值可能随版本变化）。
      // renderer 不能直接用 Node，只能通过 preload 暴露的 window.lolHelper 白名单。
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  closeLegacyFriendWindows(mainWindow);
  let rendererRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  let lastRendererRecoveryAt = 0;
  mainWindow.webContents.once('did-finish-load', () => closeLegacyFriendWindows(mainWindow));
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeRendererExitLog(details, mainWindow.webContents.getURL());
    console.error('[main] renderer process gone', details);
    if (
      details.reason === 'clean-exit' ||
      mainWindow.isDestroyed() ||
      rendererRecoveryTimer !== null ||
      Date.now() - lastRendererRecoveryAt < 60_000
    ) {
      return;
    }

    lastRendererRecoveryAt = Date.now();
    rendererRecoveryTimer = setTimeout(() => {
      rendererRecoveryTimer = null;
      if (!mainWindow.isDestroyed()) mainWindow.reload();
    }, 350);
  });
  mainWindow.once('closed', () => {
    if (rendererRecoveryTimer !== null) clearTimeout(rendererRecoveryTimer);
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow.webContents.getURL();
    if (url !== currentUrl) event.preventDefault();
  });

  // 仅开发环境自动打开 DevTools；打包后（app.isPackaged === true）不再弹。
  if (!app.isPackaged && process.env.LOLHELP_OPEN_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
};

// 统一注册所有 IPC handler（按功能域拆分在 src/main/ipc/handlers/）。
// 在 app ready 前注册即可，与原内联 handler 时机等价。
registerIpcHandlers();

// 应用启动后后台预加载 LCU game-data（最新英雄/装备/技能/符文）。
// 不 await、不阻塞启动；失败静默（heroData 自动用 datas.json 兜底）。
// 延迟 3 秒，给 LCU 客户端 lockfile/日志就绪一点时间。
setTimeout(() => {
  void preloadGameData();
}, 3000);

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  createWindow();
  startLiveWatcher();
  startAssistEngine();
  startSavedMatchFollowWatcher();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopAssistEngine();
  stopLiveWatcher();
  stopSavedMatchFollowWatcher();
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
