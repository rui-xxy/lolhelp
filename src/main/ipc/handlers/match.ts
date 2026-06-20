import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/channels';
import { searchPlayer } from '../../match/matchService';
import type { PlayerLookupRequest, PlayerLookupResult } from '../../../shared/api';

// 注册 match 域 IPC 处理器。
// 当前实现 search：按召唤师名查战绩（列表 + 每场详情 + 汇总）。
export function registerMatchHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.MATCH_SEARCH,
    async (_event, req: PlayerLookupRequest): Promise<PlayerLookupResult> => {
      return searchPlayer(req);
    },
  );
}
