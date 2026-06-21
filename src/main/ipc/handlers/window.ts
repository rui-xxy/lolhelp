import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../../shared/channels';

// 注册 window 域 IPC 处理器。
// resize：调整窗口宽度（deltaWidth 正=变宽，负=变窄），用于好友面板开关时补偿宽度，
// 使面板从战绩区右侧“推出”而不挤压战绩区。
// 用 getAllWindows()[0] 取主窗口（单窗口应用），避免 getFocusedWindow 在窗口失焦时
// 返回 null 导致补偿丢失、面板永久挤压战绩区。
export function registerWindowHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.WINDOW_RESIZE,
    async (_event, deltaWidth: number) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win || win.isDestroyed()) return;
      const [width, height] = win.getSize();
      win.setSize(width + deltaWidth, height);
    },
  );
}
