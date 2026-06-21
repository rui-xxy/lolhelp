import { ipcMain, BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { IPC_CHANNELS } from '../../../shared/channels';

const FRIEND_PANEL_WIDTH = 288;
let friendWindow: BrowserWindow | null = null;
let ownerWindow: BrowserWindow | null = null;
let boundOwnerWindow: BrowserWindow | null = null;

function getMainWindow(): BrowserWindow | null {
  if (ownerWindow && !ownerWindow.isDestroyed()) return ownerWindow;
  return BrowserWindow.getAllWindows().find((win) => win !== friendWindow && win.getTitle() === 'LOL助手') ?? null;
}

function positionFriendWindow(): void {
  const mainWindow = getMainWindow();
  if (!mainWindow || !friendWindow || friendWindow.isDestroyed()) return;

  const mainBounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(mainBounds);
  const maxX = display.workArea.x + display.workArea.width - FRIEND_PANEL_WIDTH;
  const x = Math.min(mainBounds.x + mainBounds.width, maxX);

  friendWindow.setBounds({
    x,
    y: mainBounds.y,
    width: FRIEND_PANEL_WIDTH,
    height: mainBounds.height,
  });
}

function loadFriendWindow(win: BrowserWindow): void {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}?panel=friends`);
    return;
  }

  win.loadFile(
    path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    { query: { panel: 'friends' } },
  );
}

function closeFriendWindow(): void {
  if (friendWindow && !friendWindow.isDestroyed()) {
    friendWindow.close();
  }
  friendWindow = null;
}

function handleOwnerMinimize(): void {
  if (friendWindow && !friendWindow.isDestroyed()) friendWindow.hide();
}

function handleOwnerRestore(): void {
  if (friendWindow && !friendWindow.isDestroyed()) {
    positionFriendWindow();
    friendWindow.showInactive();
  }
}

function handleOwnerClosed(): void {
  closeFriendWindow();
  ownerWindow = null;
  boundOwnerWindow = null;
}

function bindOwnerWindow(mainWindow: BrowserWindow): void {
  if (boundOwnerWindow === mainWindow) return;
  if (boundOwnerWindow && !boundOwnerWindow.isDestroyed()) {
    boundOwnerWindow.off('move', positionFriendWindow);
    boundOwnerWindow.off('resize', positionFriendWindow);
    boundOwnerWindow.off('minimize', handleOwnerMinimize);
    boundOwnerWindow.off('restore', handleOwnerRestore);
    boundOwnerWindow.off('closed', handleOwnerClosed);
  }

  mainWindow.on('move', positionFriendWindow);
  mainWindow.on('resize', positionFriendWindow);
  mainWindow.on('minimize', handleOwnerMinimize);
  mainWindow.on('restore', handleOwnerRestore);
  mainWindow.on('closed', handleOwnerClosed);
  boundOwnerWindow = mainWindow;
}

function createFriendWindow(mainWindow: BrowserWindow): BrowserWindow | null {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  ownerWindow = mainWindow;

  const win = new BrowserWindow({
    title: '好友',
    parent: mainWindow,
    width: FRIEND_PANEL_WIDTH,
    height: mainWindow.getBounds().height,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    frame: false,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  friendWindow = win;
  positionFriendWindow();
  loadFriendWindow(win);

  let revealed = false;
  const reveal = () => {
    if (revealed || win.isDestroyed()) return;
    revealed = true;
    positionFriendWindow();
    win.show();
    win.moveTop();
  };

  win.once('ready-to-show', reveal);
  win.webContents.once('did-finish-load', reveal);
  setTimeout(reveal, 500);

  win.on('closed', () => {
    friendWindow = null;
  });

  bindOwnerWindow(mainWindow);

  return win;
}

// 注册 window 域 IPC 处理器。
// resize：保留通用窗口宽度调整能力。
// 好友面板不再通过 resize/flex 插入主窗口，而是创建贴在主窗口右侧的子窗口；
// 主窗口尺寸、战绩布局和原生窗口控制按钮都保持不变。
// 主窗口由触发 IPC 的 webContents 绑定，避免开发环境 DevTools 干扰窗口定位。
export function registerWindowHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.WINDOW_RESIZE,
    async (_event, deltaWidth: number) => {
      const win = getMainWindow();
      if (!win || win.isDestroyed()) return;
      const [width, height] = win.getSize();
      win.setSize(width + deltaWidth, height);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_TOGGLE_FRIEND_PANEL,
    async (event): Promise<boolean> => {
      if (friendWindow && !friendWindow.isDestroyed()) {
        closeFriendWindow();
        return false;
      }

      const mainWindow = BrowserWindow.fromWebContents(event.sender);
      return mainWindow ? Boolean(createFriendWindow(mainWindow)) : false;
    },
  );

  ipcMain.on(IPC_CHANNELS.WINDOW_FRIEND_SEARCH, (_event, riotId: string) => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(IPC_CHANNELS.WINDOW_FRIEND_SEARCH, riotId);
    mainWindow.focus();
  });
}
