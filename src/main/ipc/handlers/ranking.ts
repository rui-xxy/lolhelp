import { ipcMain, shell } from 'electron';
import type {
  ChampionDetailRequest,
  ChampionDetailResult,
  ChampionRankingRequest,
  ChampionRankingResult,
  MayhemAugmentDetailResult,
  MayhemChampionBuildResult,
  MayhemAugmentRankingResult,
  MayhemComboResult,
  MayhemTierListResult,
} from '../../../shared/api';
import { IPC_CHANNELS } from '../../../shared/channels';
import { getChampionDetail, getChampionRanking } from '../../ranking/championRanking';
import {
  getMayhemAugmentDetail,
  getMayhemAugmentRanking,
  getMayhemChampionBuild,
  getMayhemCombos,
  getMayhemTierList,
  isMayhemSourceUrl,
} from '../../ranking/mayhemGuide';

export function registerRankingHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.RANKING_GET_CHAMPIONS,
    async (_event, request: ChampionRankingRequest): Promise<ChampionRankingResult> => {
      return getChampionRanking(request);
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.RANKING_GET_CHAMPION_DETAIL,
    async (_event, request: ChampionDetailRequest): Promise<ChampionDetailResult> => {
      return getChampionDetail(request);
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
      return getMayhemChampionBuild(String(slug ?? ''), Boolean(refresh));
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.RANKING_GET_MAYHEM_AUGMENTS,
    async (_event, refresh?: boolean): Promise<MayhemAugmentRankingResult> => {
      return getMayhemAugmentRanking(Boolean(refresh));
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.RANKING_GET_MAYHEM_AUGMENT_DETAIL,
    async (_event, slug: string, refresh?: boolean): Promise<MayhemAugmentDetailResult> => {
      return getMayhemAugmentDetail(String(slug ?? ''), Boolean(refresh));
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.RANKING_GET_MAYHEM_COMBOS,
    async (_event, refresh?: boolean): Promise<MayhemComboResult> => {
      return getMayhemCombos(Boolean(refresh));
    },
  );
  // 只放行数据源自己的网页，避免渲染进程借这个口子打开任意链接。
  ipcMain.handle(
    IPC_CHANNELS.RANKING_OPEN_SOURCE,
    async (_event, url: string): Promise<boolean> => {
      if (typeof url !== 'string' || !isMayhemSourceUrl(url)) return false;
      await shell.openExternal(url);
      return true;
    },
  );
}
