import { ipcMain } from 'electron';
import type { ChampionRankingRequest, ChampionRankingResult } from '../../../shared/api';
import { IPC_CHANNELS } from '../../../shared/channels';
import { getChampionRanking } from '../../ranking/championRanking';

export function registerRankingHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.RANKING_GET_CHAMPIONS,
    async (_event, request: ChampionRankingRequest): Promise<ChampionRankingResult> => {
      return getChampionRanking(request);
    },
  );
}
