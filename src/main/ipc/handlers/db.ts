import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/channels';
import { getSettings, saveSettings } from '../../settings/store';
import type { AppSettings } from '../../../shared/api';
import { validateAppSettings } from '../validation';

// 注册 db 域 IPC 处理器：本地设置读写。
// 实现 db:get-settings / db:save-settings（通道名之前已预留）。
export function registerDbHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.DB_GET_SETTINGS, async (): Promise<AppSettings> => {
    return getSettings();
  });

  ipcMain.handle(
    IPC_CHANNELS.DB_SAVE_SETTINGS,
    async (_event, settings: AppSettings): Promise<void> => {
      saveSettings(validateAppSettings(settings));
    },
  );
}
