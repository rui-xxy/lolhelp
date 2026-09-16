import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/channels';
import { fetchPlayerRanksByPuuid, searchPlayer } from '../../match/matchService';
import { getAllHeroes } from '../../lcu/heroData';
import { downloadReplay, getReplayAvailability, watchReplay } from '../../match/replayService';
import { getMatchTimeline } from '../../match/timelineService';
import {
  createSavedMatchGroup,
  deleteSavedMatch,
  deleteSavedMatchAccount,
  deleteSavedMatchGroup,
  getSavedMatchAccount,
  getSavedMatchesCatalog,
  getSavedMatchesSummary,
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

  ipcMain.handle(IPC_CHANNELS.MATCH_GET_SAVED_MATCHES_SUMMARY, async () => {
    return getSavedMatchesSummary();
  });

  ipcMain.handle(IPC_CHANNELS.MATCH_GET_SAVED_MATCHES_CATALOG, async () => {
    return getSavedMatchesCatalog();
  });

  ipcMain.handle(IPC_CHANNELS.MATCH_GET_SAVED_MATCH_ACCOUNT, async (_event, accountId) => {
    return getSavedMatchAccount(String(accountId ?? ''));
  });

  ipcMain.handle(IPC_CHANNELS.MATCH_IMPORT_SAVED_MATCHES, async (_event, state) => {
    return importSavedMatches(state);
  });

  ipcMain.handle(IPC_CHANNELS.MATCH_SAVE_MATCHES_FOR_PROFILE, async (_event, profile, region, matches, regionName) => {
    const account = await saveMatchesForProfile(profile, region, matches, regionName);
    return { accountId: account.id };
  });

  ipcMain.handle(IPC_CHANNELS.MATCH_CREATE_SAVED_GROUP, async (_event, name) => {
    await createSavedMatchGroup(String(name ?? ''));
    return getSavedMatchesCatalog();
  });

  ipcMain.handle(IPC_CHANNELS.MATCH_DELETE_SAVED_GROUP, async (_event, groupId) => {
    await deleteSavedMatchGroup(String(groupId ?? ''));
    return getSavedMatchesCatalog();
  });

  ipcMain.handle(IPC_CHANNELS.MATCH_SET_SAVED_ACCOUNT_GROUP, async (_event, accountId, groupId) => {
    await setSavedMatchAccountGroup(String(accountId ?? ''), groupId ? String(groupId) : undefined);
    return getSavedMatchesCatalog();
  });

  ipcMain.handle(IPC_CHANNELS.MATCH_SET_SAVED_ACCOUNT_FOLLOW, async (_event, accountId, enabled) => {
    await setSavedMatchAccountFollow(String(accountId ?? ''), Boolean(enabled));
    return getSavedMatchesCatalog();
  });

  ipcMain.handle(IPC_CHANNELS.MATCH_DELETE_SAVED_ACCOUNT, async (_event, accountId) => {
    await deleteSavedMatchAccount(String(accountId ?? ''));
    return getSavedMatchesCatalog();
  });

  ipcMain.handle(IPC_CHANNELS.MATCH_DELETE_SAVED_MATCH, async (_event, accountId, gameId) => {
    await deleteSavedMatch(String(accountId ?? ''), Number(gameId));
    return getSavedMatchesCatalog();
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

  ipcMain.handle(IPC_CHANNELS.MATCH_GET_TIMELINE, async (_event, gameId, region) => {
    return getMatchTimeline(Number(gameId), typeof region === 'string' ? region : undefined);
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
