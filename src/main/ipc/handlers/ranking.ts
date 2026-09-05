import { ipcMain } from 'electron';
import type {
  ChampionRankingRequest,
  ChampionRankingResult,
  MayhemChampionBuildResult,
  MayhemAugmentRankingResult,
  MayhemComboResult,
  MayhemTierListResult,
} from '../../../shared/api';
import { IPC_CHANNELS } from '../../../shared/channels';
import { getChampionRanking } from '../../ranking/championRanking';
import {
  getMayhemAugmentRanking,
  getMayhemChampionBuild,
  getMayhemCombos,
  getMayhemTierList,
} from '../../ranking/mayhemGuide';

export function registerRankingHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.RANKING_GET_CHAMPIONS,
    async (_event, request: ChampionRankingRequest): Promise<ChampionRankingResult> => {
      return getChampionRanking(request);
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.RANKING_GET_MAYHEM_TIER_LIST,
    async (_event, refresh?: boolean): Promise<MayhemTierListResult> => {
      return getMayhemTierList(Boolean(refresh));
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.RANKING_GET_MAYHEM_BUILD,
    async (_event, slug: string, refresh?: boolean): Promise<MayhemChampionBuildResult> => {
      return getMayhemChampionBuild(slug, Boolean(refresh));
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.RANKING_GET_MAYHEM_AUGMENTS,
    async (_event, refresh?: boolean): Promise<MayhemAugmentRankingResult> => {
      return getMayhemAugmentRanking(Boolean(refresh));
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.RANKING_GET_MAYHEM_COMBOS,
    async (_event, refresh?: boolean): Promise<MayhemComboResult> => {
      return getMayhemCombos(Boolean(refresh));
    },
  );
}
