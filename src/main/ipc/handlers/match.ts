import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/channels';
import { fetchPlayerRanksByPuuid, searchPlayer } from '../../match/matchService';
import { getAllHeroes } from '../../lcu/heroData';
import type {
  ChampionSummary,
  PlayerLookupRequest,
  PlayerLookupResult,
  PlayerRankSummary,
} from '../../../shared/api';
import { validatePlayerLookupRequest } from '../validation';

// 注册 match 域 IPC 处理器。
// - search：按召唤师名查战绩（列表 + 每场详情 + 汇总）。
// - getChampions：返回英雄列表（给前端英雄选择器用）。
export function registerMatchHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.MATCH_SEARCH,
    async (_event, req: PlayerLookupRequest): Promise<PlayerLookupResult> => {
      return searchPlayer(validatePlayerLookupRequest(req));
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.MATCH_GET_PLAYER_RANKS,
    async (_event, puuid: string): Promise<PlayerRankSummary[]> => {
      return fetchPlayerRanksByPuuid(String(puuid ?? ''));
    },
  );

  ipcMain.handle(IPC_CHANNELS.MATCH_GET_CHAMPIONS, async (): Promise<ChampionSummary[]> => {
    // HeroSummary 与 ChampionSummary 结构一致，直接映射
    return getAllHeroes().map((h) => ({
      id: h.id,
      alias: h.alias,
      name: h.name,
      title: h.title,
      avatar: h.avatar,
      tags: h.tags,
    }));
  });
}
