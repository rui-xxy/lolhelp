import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/channels';
import {
  getLiveBattle,
  getLiveMatchDetail,
  subscribeLiveBattleUpdates,
} from '../../live/liveBattle';
import type { LiveBattleInfo, PlayerMatchDetail } from '../../../shared/api';

// 把主进程的增量更新广播到所有渲染进程窗口。
// 订阅只建立一次，避免重复注册导致同一事件推多份。
let broadcasting = false;

function startBroadcasting(): void {
  if (broadcasting) return;
  broadcasting = true;

  subscribeLiveBattleUpdates((event) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed() || win.webContents.isDestroyed()) continue;
      win.webContents.send(IPC_CHANNELS.LIVE_BATTLE_UPDATE, event);
    }
  });
}

// 注册 live 域 IPC 处理器。
// getBattle：检测当前是否在游戏中，返回 10 人对局信息（含战绩）。
export function registerLiveHandlers(): void {
  startBroadcasting();

  ipcMain.handle(
    IPC_CHANNELS.LIVE_GET_BATTLE,
    async (): Promise<LiveBattleInfo> => {
      return getLiveBattle();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.LIVE_GET_MATCH_DETAIL,
    async (_event, gameId: number, puuid: string): Promise<PlayerMatchDetail | null> => {
      if (!Number.isFinite(gameId) || gameId <= 0 || !puuid) return null;
      return getLiveMatchDetail(gameId, puuid);
    },
  );
}
