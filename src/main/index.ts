import './safeConsole';
import { app, BrowserWindow, Menu } from 'electron';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { registerIpcHandlers } from './ipc';
// LCU game-data 预加载：启动后后台拉最新英雄/装备/技能/符文数据覆盖 datas.json 兜底
import { preloadGameData } from './lcu/gameData';
import { startLeagueDiscoveryLoop } from './lcu/discover';
import { APP_LAYOUT } from '../shared/constants';
import { startAssistEngine, stopAssistEngine } from './assist/engine';
import { startLiveWatcher, stopLiveWatcher } from './live/liveWatcher';
import { startSavedMatchFollowWatcher, stopSavedMatchFollowWatcher } from './match/savedMatchFollowWatcher';
import { loadWindowState, trackWindowState } from './windowState';
import { loadWindowChrome } from './windowChrome';

const APP_WINDOW_TITLE = 'LOL助手';
// 旧版独立好友窗口的最大宽度（288px 面板 + 边距），仅用于启动时关闭遗留窗口。
const LEGACY_FRIEND_WINDOW_MAX_WIDTH = 368;

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

// 单实例锁：已有实例运行时，二次启动把已有窗口拉回前台后自行退出。
// 避免旧实例（比如挂掉的开发窗口）与新实例叠在桌面上造成困惑，也防两个实例同时写设置文件。
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = mainWindowRef;
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

Menu.setApplicationMenu(null);

function closeLegacyFriendWindows(mainWindow: BrowserWindow): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win === mainWindow || win.isDestroyed()) continue;

    const url = win.webContents.getURL();
    const { width } = win.getBounds();
    const isLegacyDevFriendWindow =
      Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL) &&
      width <= LEGACY_FRIEND_WINDOW_MAX_WIDTH &&
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

// 主窗口引用提升到模块级：单实例锁的 second-instance 回调需要把它拉回前台。
let mainWindowRef: BrowserWindow | null = null;

const createWindow = () => {
  const windowState = loadWindowState({
    width: APP_LAYOUT.defaultWindowWidth,
    height: APP_LAYOUT.defaultWindowHeight,
    minWidth: APP_LAYOUT.minWindowWidth,
    minHeight: APP_LAYOUT.minWindowHeight,
  });
  // 窗口底色与系统按钮区要和顶栏同色；颜色随外观设置变化，见 windowChrome.ts。
  const chrome = loadWindowChrome();
  const mainWindow = new BrowserWindow({
    title: APP_WINDOW_TITLE,
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: APP_LAYOUT.minWindowWidth,
    minHeight: APP_LAYOUT.minWindowHeight,
    backgroundColor: chrome.color,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: chrome.color,
      symbolColor: chrome.symbolColor,
      height: APP_LAYOUT.topbarHeight,
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

  if (windowState.maximized) mainWindow.maximize();
  trackWindowState(mainWindow);
  mainWindowRef = mainWindow;

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  closeLegacyFriendWindows(mainWindow);
  if (!app.isPackaged) {
    mainWindow.webContents.on('console-message', (_event, _level, message) => {
      if (message.startsWith('[input-probe]')) console.log(message);
    });
    mainWindow.webContents.on('did-finish-load', () => {
      void mainWindow.webContents.executeJavaScript(`
        for (const type of ['focusin', 'focusout', 'keydown', 'beforeinput', 'input', 'selectionchange']) {
          document.addEventListener(type, (event) => {
            console.log('[input-probe]' + JSON.stringify({type, target:event.target?.tagName, active:document.activeElement?.tagName, length:document.querySelector('.shell-search input')?.value.length, selection:window.getSelection()?.anchorNode?.nodeName}));
          }, true);
        }
      `);
    });
  }
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
    if (mainWindowRef === mainWindow) mainWindowRef = null;
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
  // 后台发现英雄联盟安装位置（运行中客户端的进程命令行 + 手动设置），
  // 让装在非默认盘符/目录的客户端也能被识别。
  startLeagueDiscoveryLoop();
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
