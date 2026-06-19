import { ipcMain, app } from 'electron';
import { IPC_CHANNELS } from '../../../shared/channels';
import type { AppStatus } from '../../../shared/api';

// 注册 app 域 IPC 处理器。
// 当前只有 getStatus；后续 app 级功能（如打开外部链接、检查更新）加在这里。
export function registerAppHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APP_GET_STATUS, async (): Promise<AppStatus> => {
    return {
      appName: app.getName(),
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      uptime: Math.floor(process.uptime()),
      serverTime: new Date().toISOString(),
      lcuConnected: false, // 占位：后续阶段接入 LCU 后改为真实状态
    };
  });
}
