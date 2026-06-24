import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../../shared/channels';

const MIN_WINDOW_WIDTH = 800;
const MAX_WINDOW_WIDTH = 3200;

function safeWidth(value: number): number {
  if (!Number.isFinite(value)) throw new Error('窗口宽度必须是有效数字');
  return Math.round(Math.min(MAX_WINDOW_WIDTH, Math.max(MIN_WINDOW_WIDTH, value)));
}

// 注册 window 域 IPC 处理器。渲染进程只能请求受边界约束的主窗口宽度。
export function registerWindowHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.WINDOW_SET_WIDTH,
    async (event, nextWidth: number) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return;
      const [, height] = win.getSize();
      win.setSize(safeWidth(nextWidth), height);
    },
  );
}
