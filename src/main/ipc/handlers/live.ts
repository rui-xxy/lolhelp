import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/channels';
import { getLiveBattle } from '../../live/liveBattle';
import type { LiveBattleInfo } from '../../../shared/api';

// 注册 live 域 IPC 处理器。
// getBattle：检测当前是否在游戏中，返回 10 人对局信息（含战绩）。
export function registerLiveHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.LIVE_GET_BATTLE,
    async (): Promise<LiveBattleInfo> => {
      return getLiveBattle();
    },
  );
}
