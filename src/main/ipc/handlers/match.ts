import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/channels';
import { fetchPlayerRanksByPuuid, searchPlayer } from '../../match/matchService';
import { getAllHeroes } from '../../lcu/heroData';
import { downloadReplay, getReplayAvailability, watchReplay } from '../../match/replayService';
import {
  createSavedMatchGroup,
  deleteSavedMatch,
  deleteSavedMatchAccount,
  deleteSavedMatchGroup,
  getSavedMatches,
  importSavedMatches,
  saveMatchesForProfile,
  setSavedMatchAccountFollow,
  setSavedMatchAccountGroup,
} from '../../match/savedMatchesStore';
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
    async (_event, puuid: string, region?: string): Promise<PlayerRankSummary[]> => {
      return fetchPlayerRanksByPuuid(String(puuid ?? ''), typeof region === 'string' ? region : undefined);
    },
  );

  ipcMain.handle(IPC_CHANNELS.MATCH_GET_SAVED_MATCHES, async () => {
    return getSavedMatches();
  });

  ipcMain.handle(IPC_CHANNELS.MATCH_IMPORT_SAVED_MATCHES, async (_event, state) => {
    return importSavedMatches(state);
  });

  ipcMain.handle(IPC_CHANNELS.MATCH_SAVE_MATCHES_FOR_PROFILE, async (_event, profile, region, matches, regionName) => {
    return saveMatchesForProfile(profile, region, matches, regionName);
  });

  ipcMain.handle(IPC_CHANNELS.MATCH_CREATE_SAVED_GROUP, async (_event, name) => {
    return createSavedMatchGroup(String(name ?? ''));
  });

  ipcMain.handle(IPC_CHANNELS.MATCH_DELETE_SAVED_GROUP, async (_event, groupId) => {
    return deleteSavedMatchGroup(String(groupId ?? ''));
  });

  ipcMain.handle(IPC_CHANNELS.MATCH_SET_SAVED_ACCOUNT_GROUP, async (_event, accountId, groupId) => {
    return setSavedMatchAccountGroup(String(accountId ?? ''), groupId ? String(groupId) : undefined);
  });

  ipcMain.handle(IPC_CHANNELS.MATCH_SET_SAVED_ACCOUNT_FOLLOW, async (_event, accountId, enabled) => {
    return setSavedMatchAccountFollow(String(accountId ?? ''), Boolean(enabled));
  });

  ipcMain.handle(IPC_CHANNELS.MATCH_DELETE_SAVED_ACCOUNT, async (_event, accountId) => {
    return deleteSavedMatchAccount(String(accountId ?? ''));
  });

  ipcMain.handle(IPC_CHANNELS.MATCH_DELETE_SAVED_MATCH, async (_event, accountId, gameId) => {
    return deleteSavedMatch(String(accountId ?? ''), Number(gameId));
  });

  ipcMain.handle(IPC_CHANNELS.MATCH_GET_REPLAY_AVAILABILITY, async (_event, request) => {
    return getReplayAvailability(request);
  });

  ipcMain.handle(IPC_CHANNELS.MATCH_DOWNLOAD_REPLAY, async (_event, gameId) => {
    return downloadReplay(gameId);
  });

  ipcMain.handle(IPC_CHANNELS.MATCH_WATCH_REPLAY, async (_event, gameId) => {
    return watchReplay(gameId);
  });

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
