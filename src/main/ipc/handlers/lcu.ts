import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/channels';
import { readLockfile, getCachedCredentials } from '../../lcu/lockfile';
import { LcuClient } from '../../lcu/client';
import { getCurrentRegionFromLog, getSgpAuth } from '../../sgp/auth';
import type {
  FriendActionResult,
  FriendInfo,
  LcuConnection,
  LcuRegion,
} from '../../../shared/api';
import {
  buildChampionSplashCandidatesByAlias,
  buildProfileIconCandidates,
} from '../../../shared/gameAssets';
import { getHeroByKey } from '../../lcu/heroData';
import { resolveChampionSkinId } from '../../lcu/championSkins';
import { getQueueCatalog, getQueueDisplayName } from '../../lcu/queueCatalog';
import {
  getChatConversations,
  sendChatMessage,
} from '../../lcu/chatSessions';

const ACTIVE_GAME_CHAMPION_CACHE_TTL_MS = 30_000;
const ACTIVE_GAME_MISS_CACHE_TTL_MS = 8_000;
const ACTIVE_GAME_CHAMPION_CACHE_MAX_ENTRIES = 1000;
const FRIEND_ENRICH_CONCURRENCY = 8;
const activeGameChampionCache = new Map<string, { championId: number; expiresAt: number }>();

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function pruneActiveGameChampionCache(now: number): void {
  for (const [key, value] of activeGameChampionCache) {
    if (value.expiresAt <= now) activeGameChampionCache.delete(key);
  }
  while (activeGameChampionCache.size > ACTIVE_GAME_CHAMPION_CACHE_MAX_ENTRIES) {
    const oldestKey = activeGameChampionCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    activeGameChampionCache.delete(oldestKey);
  }
}

function readStringField(source: Record<string, unknown>, keys: string[]): string | number {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value as string | number;
    }
  }
  return '';
}

function readLolPayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') {
    return { ...(value as Record<string, unknown>) };
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' ? { ...(parsed as Record<string, unknown>) } : {};
    } catch {
      return {};
    }
  }
  return {};
}

function readNumberField(source: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = source[key];
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
}

function normalizeTimestamp(value: string | number | null | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' || /^\d+$/.test(String(value).trim())) {
    let timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
    if (timestamp < 1_000_000_000_000) timestamp *= 1000;
    return timestamp;
  }

  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function readFriendSince(source: Record<string, unknown>): string | number | null {
  const value = readStringField(source, [
    'friendsSince',
    'friendSince',
    'friendSinceTimestamp',
    'createdAt',
    'created',
    'addedAt',
    'dateAdded',
    'time',
    'timestamp',
  ]);
  return value === '' ? null : value;
}

function getFriendChampionId(rawLol: Record<string, unknown>): number {
  const explicit = readNumberField(rawLol, [
    'championId',
    'championID',
    'champion_id',
    'selectedChampionId',
    'selectedChampionID',
    'selectedChampion',
    'champion',
  ]);
  if (explicit > 0) return explicit;

  for (const [key, value] of Object.entries(rawLol)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
    if (!['championid', 'selectedchampionid'].includes(normalizedKey)) continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
}

function isFriendInGame(rawLol: Record<string, unknown>): boolean {
  return String(rawLol.gameStatus ?? '') === 'inGame';
}

function buildActiveGamePaths(friend: {
  summonerId: number;
  puuid: string;
  gameName: string;
  gameTag: string;
}): string[] {
  const paths: string[] = [];
  if (friend.summonerId > 0) {
    paths.push(`/lol-spectator/v1/active-games/by-summoner/${friend.summonerId}`);
  }
  if (friend.puuid) {
    paths.push(`/lol-spectator/v1/active-games/by-puuid/${encodeURIComponent(friend.puuid)}`);
  }
  if (friend.gameName) {
    paths.push(
      `/lol-spectator/v1/active-games/by-summoner-name/${encodeURIComponent(friend.gameName)}`,
    );
    if (friend.gameTag) {
      paths.push(
        `/lol-spectator/v1/active-games/by-summoner-name/${encodeURIComponent(
          `${friend.gameName}#${friend.gameTag}`,
        )}`,
      );
    }
  }
  return paths;
}

function pickActiveGameChampionId(
  activeGame: Record<string, unknown>,
  friend: { summonerId: number; puuid: string; gameName: string },
): number {
  const participants =
    (activeGame.participants as Array<Record<string, unknown>> | undefined) ?? [];
  const participant =
    participants.find((p) => Number(p.summonerId ?? 0) === friend.summonerId) ??
    participants.find((p) => String(p.puuid ?? '') === friend.puuid) ??
    participants.find((p) => String(p.summonerName ?? '') === friend.gameName);
  const championId = Number(participant?.championId ?? 0);
  return Number.isFinite(championId) && championId > 0 ? championId : 0;
}

function findNestedValue(
  value: unknown,
  keys: Set<string>,
): string | number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(key) && (typeof child === 'string' || typeof child === 'number')) {
      return child;
    }
    const nested = findNestedValue(child, keys);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

async function getActiveGameChampionId(
  client: LcuClient,
  friend: { summonerId: number; puuid: string; gameName: string; gameTag: string },
): Promise<number> {
  if (friend.summonerId <= 0 && !friend.puuid && !friend.gameName) return 0;

  const now = Date.now();
  pruneActiveGameChampionCache(now);
  const cacheKey = [friend.summonerId, friend.puuid, friend.gameName, friend.gameTag].join('|');
  const cached = activeGameChampionCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.championId;

  for (const path of buildActiveGamePaths(friend)) {
    try {
      const activeGame = await client.get<Record<string, unknown>>(path);
      const championId = pickActiveGameChampionId(activeGame, friend);
      if (championId > 0) {
        activeGameChampionCache.set(cacheKey, {
          championId,
          expiresAt: now + ACTIVE_GAME_CHAMPION_CACHE_TTL_MS,
        });
        return championId;
      }
    } catch {
      // Different regions/client builds expose different spectator helpers.
    }
  }

  activeGameChampionCache.set(cacheKey, {
    championId: 0,
    expiresAt: now + ACTIVE_GAME_MISS_CACHE_TTL_MS,
  });
  return 0;
}

// 注册 lcu 域 IPC 处理器。
// 当前实现 detect-client：lockfile 读取 + 真实 LCU 请求验证连通。
// 后续 connect/getCurrentSummoner/getLobby/getChampSelectSession 在此追加。
export function registerLcuHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.LCU_DETECT_CLIENT,
    async (): Promise<LcuConnection> => {
      // 1. 读 lockfile（客户端没跑则找不到）
      let creds;
      try {
        creds = readLockfile();
      } catch (err) {
        return {
          found: false,
          connected: false,
          error: `lockfile 解析失败：${err instanceof Error ? err.message : String(err)}`,
        };
      }
      if (!creds) {
        return {
          found: false,
          connected: false,
          error: '未检测到 LOL 客户端（lockfile 不存在或为空）',
        };
      }

      // 2. 用凭证发验证请求（current-summoner 是文档唯一给完整字段的端点）
      try {
        const client = new LcuClient(creds);
        // 国服把召唤师名放在 gameName（displayName 为空），国际服在 displayName。
        // 按 gameName > displayName > name 优先级取第一个非空的。
        const summoner = await client.get<{
          gameName?: string;
          displayName?: string;
          name?: string;
        }>('/lol-summoner/v1/current-summoner');
        const summonerName =
          summoner.gameName || summoner.displayName || summoner.name || '';
        return {
          found: true,
          connected: true,
          summonerName,
        };
      } catch (err) {
        return {
          found: true,
          connected: false,
          error: `连接失败：${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.LCU_GET_CURRENT_REGION,
    async (): Promise<LcuRegion> => {
      const region = getCurrentRegionFromLog();
      if (region) {
        return { key: region.key, name: region.name };
      }

      try {
        const auth = await getSgpAuth();
        return { key: auth.region.key, name: auth.region.name };
      } catch (err) {
        return {
          key: '',
          name: '',
          error: `无法读取当前登录大区：${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  );

  // 好友列表：从 LCU lol-chat/v1/friends 拉取，映射成 FriendInfo[]
  ipcMain.handle(IPC_CHANNELS.LCU_GET_FRIENDS, async () => {
    let creds;
    try {
      creds = getCachedCredentials();
    } catch {
      return [];
    }
    if (!creds) return [];
    const client = new LcuClient(creds);
    try {
      const raw = await client.get<Record<string, unknown>[]>(
        '/lol-chat/v1/friends',
      );
      if (!Array.isArray(raw)) return [];
      const queueCatalog = await getQueueCatalog(client);
      const friendSinceBySummonerId = new Map<number, string | number>();
      try {
        const giftableFriends = await client.get<Record<string, unknown>[]>(
          '/lol-store/v1/giftablefriends',
        );
        if (Array.isArray(giftableFriends)) {
          for (const friend of giftableFriends) {
            const summonerId = Number(friend.summonerId ?? 0);
            const friendsSince = readFriendSince(friend);
            if (summonerId > 0 && friendsSince !== null) {
              friendSinceBySummonerId.set(summonerId, friendsSince);
            }
          }
        }
      } catch {
        // Some clients/regions may reject the store endpoint. Friend list still works without it.
      }
      return mapWithConcurrency(raw, FRIEND_ENRICH_CONCURRENCY, async (f) => {
        const icon = Number(f.icon ?? 0);
        const iconUrls = buildProfileIconCandidates(icon);
        const rawLol = readLolPayload(f.lol);
        const summonerId = Number(f.summonerId ?? 0);
        const puuid = String(f.puuid ?? '');
        const gameName = String(f.gameName ?? '');
        const gameTag = String(f.gameTag ?? '');
        const friendSince = friendSinceBySummonerId.get(summonerId) ?? readFriendSince(f);
        const friendSinceTimestamp = normalizeTimestamp(friendSince);
        let championId = getFriendChampionId(rawLol);
        if ((!Number.isFinite(championId) || championId <= 0) && isFriendInGame(rawLol)) {
          championId = await getActiveGameChampionId(client, {
            summonerId,
            puuid,
            gameName,
            gameTag,
          });
        }
        const championSkinId = readStringField(rawLol, [
          'skinVariant',
          'skinId',
          'championSkinId',
          'selectedSkinId',
          'selectedSkin',
          'skinIndex',
        ]);
        const hero = championId > 0 ? getHeroByKey(championId) : null;
        const lol = Object.keys(rawLol).length > 0 ? (rawLol as FriendInfo['lol']) : undefined;
        const queueId = Number(rawLol.queueId ?? 0);
        const queue = queueCatalog.get(queueId);
        if (lol && queue) {
          lol.queueId = queueId;
          lol.mapId = Number(rawLol.mapId ?? 0);
          lol.gameQueueName = getQueueDisplayName(queue);
          lol.gameQueueRanked = queue.isRanked;
        }
        const championAlias =
          hero?.alias ||
          String(readStringField(rawLol, ['skinname', 'championName', 'championAlias']));
        if (lol && championId > 0 && championAlias) {
          const resolvedSkinId = await resolveChampionSkinId(
            client,
            championId,
            championSkinId,
          );
          const championSplashUrls = buildChampionSplashCandidatesByAlias(
            championAlias,
            championId,
            resolvedSkinId,
          );
          lol.championId = championId;
          lol.championSplashUrl = championSplashUrls[0] ?? '';
          lol.championSplashUrls = championSplashUrls;
        }

        return {
          id: String(f.id ?? f.puuid ?? f.summonerId ?? ''),
          puuid,
          gameName,
          gameTag,
          summonerId,
          icon,
          iconUrl: iconUrls[0] ?? '',
          iconUrls,
          availability: String(f.availability ?? 'offline'),
          groupName: String(f.groupName ?? '**Default'),
          note: String(f.note ?? ''),
          statusMessage: String(f.statusMessage ?? ''),
          friendSince,
          friendSinceTimestamp,
          lastSeenOnlineTimestamp: (f.lastSeenOnlineTimestamp as number) ?? null,
          product: String(f.product ?? ''),
          lol,
        };
      });
    } catch {
      return [];
    }
  });

  ipcMain.handle(IPC_CHANNELS.LCU_GET_CHAT_CONVERSATIONS, async () => {
    const creds = getCachedCredentials();
    if (!creds) {
      throw new Error('英雄联盟客户端未连接');
    }
    return getChatConversations(new LcuClient(creds));
  });

  ipcMain.handle(
    IPC_CHANNELS.LCU_SEND_CHAT_MESSAGE,
    async (
      _event,
      conversationId: string,
      body: string,
    ): Promise<FriendActionResult> => {
      if (typeof conversationId !== 'string' || typeof body !== 'string') {
        return { success: false, message: '消息参数无效' };
      }
      const creds = getCachedCredentials();
      if (!creds) {
        return { success: false, message: '英雄联盟客户端未连接' };
      }
      return sendChatMessage(new LcuClient(creds), conversationId, body);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.LCU_SPECTATE_FRIEND,
    async (_event, puuid: string): Promise<FriendActionResult> => {
      if (typeof puuid !== 'string' || !puuid.trim()) {
        return { success: false, message: '好友信息无效' };
      }
      const creds = getCachedCredentials();
      if (!creds) return { success: false, message: '英雄联盟客户端未连接' };
      const client = new LcuClient(creds);
      try {
        const activeGame = await client.get<Record<string, unknown>>(
          `/lol-spectator/v1/active-games/by-puuid/${encodeURIComponent(puuid)}`,
        );
        const spectatorKey = String(findNestedValue(
          activeGame,
          new Set(['spectatorsEncryptionKey', 'encryptionKey', 'observerEncryptionKey']),
        ) ?? '');
        const gameQueueType = String(findNestedValue(
          activeGame,
          new Set(['gameQueueType', 'queueType']),
        ) ?? '');
        await client.post('/lol-spectator/v1/spectate/launch', {
          puuid,
          spectatorKey,
          gameQueueType,
          allowObserveMode: 'ALL',
          dropInSpectateGameId: '',
        });
        return { success: true, message: '正在启动观战' };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : '观战失败',
        };
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.LCU_DELETE_FRIEND,
    async (_event, friendId: string): Promise<FriendActionResult> => {
      if (typeof friendId !== 'string' || !friendId.trim()) {
        return { success: false, message: '好友信息无效' };
      }
      const creds = getCachedCredentials();
      if (!creds) return { success: false, message: '英雄联盟客户端未连接' };
      try {
        await new LcuClient(creds).delete(
          `/lol-chat/v1/friends/${encodeURIComponent(friendId)}`,
        );
        return { success: true, message: '好友已删除' };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : '删除失败',
        };
      }
    },
  );
}
