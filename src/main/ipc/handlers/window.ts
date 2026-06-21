import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../../shared/channels';

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows().find((win) => win.getTitle() === 'LOL助手') ?? null;
}

// 注册 window 域 IPC 处理器。
// 好友面板现在是主窗口内的常驻第三栏，不再通过主进程创建子窗口。
// resize 仅保留给后续通用窗口能力使用。
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
    IPC_CHANNELS.WINDOW_SET_WIDTH,
    async (_event, nextWidth: number) => {
      const win = getMainWindow();
      if (!win || win.isDestroyed()) return;
      const [, height] = win.getSize();
      win.setSize(nextWidth, height);
    },
  );
}
