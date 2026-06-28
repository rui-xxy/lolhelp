import { getSgpAuth, invalidateSgpAuth } from '../sgp/auth';
import { SgpClient } from '../sgp/client';
import { getCachedCredentials } from '../lcu/lockfile';
import { LcuClient } from '../lcu/client';
import { buildProfileIcon } from '../lcu/gameData';
import { getRegionConfig } from '../sgp/region';
import {
  lookupRiotAccountByRiotId,
  normalizeRiotIdInput,
} from '../riot/playerAccount';
import { extractMatchDetail, buildLookupSummary, type SgpGame } from './matchMapper';
import type {
  PlayerLookupRequest,
  PlayerLookupResult,
  PlayerMatchDetail,
  PlayerRankSummary,
} from '../../shared/api';

// 战绩查询服务（SGP 版）：走腾讯云端 SGP，能查完整历史（不受 LCU 21 场缓存限制）。
//
// 流程（已 curl 验证全部可用）：
// 1. getSgpAuth：读日志拿大区码 + LCU 拿 entitlements token + puuid
// 2. SgpClient 请求 SGP SUMMARY 端点：一次返回 N 场，每场含完整 10 人详情
// 3. extractMatchDetail 字段映射 → 前端结构
//
// SGP 端点：GET {大区域名}/match-history-query/v1/products/lol/player/{puuid}/SUMMARY
//           ?startIndex={偏移}&count={条数}
// 认证：Bearer {entitlements token}
//
// 注意：SGP 按 puuid 查历史；自己的 puuid 来自 current-summoner，
// 他人的 puuid 先通过 LCU 的 Riot ID 查询拿到。

const DEFAULT_COUNT = 20;
const MAX_COUNT = 100; // 单次最多 100 场（可翻页拿更多）

interface LcuRankQueue {
  queueType?: string;
  queue?: string;
  tier?: string;
  ratedTier?: string;
  division?: string;
  rank?: string;
  leaguePoints?: number;
  ratedRating?: number;
  wins?: number;
  losses?: number;
}

interface LcuRankedStats {
  queueMap?: Record<string, LcuRankQueue>;
  queues?: LcuRankQueue[];
  highestRankedEntry?: LcuRankQueue;
  rankedEntry?: LcuRankQueue;
}

const RANK_QUEUE_NAMES: Record<string, string> = {
  RANKED_SOLO_5x5: '单双',
  RANKED_FLEX_SR: '灵活',
};

const RANK_TIER_NAMES: Record<string, string> = {
  CHALLENGER: '王者',
  GRANDMASTER: '宗师',
  MASTER: '大师',
  DIAMOND: '钻石',
  EMERALD: '翡翠',
  PLATINUM: '铂金',
  GOLD: '黄金',
  SILVER: '白银',
  BRONZE: '黄铜',
  IRON: '黑铁',
};

// 带凭证失效重试的请求：401/403 时清缓存重新认证。
async function requestWithRetry<T>(
  client: SgpClient,
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  try {
    return await client.get<T>(path, params);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('401') || msg.includes('403')) {
      invalidateSgpAuth();
      const newAuth = await getSgpAuth();
      const newClient = new SgpClient({ ...newAuth, region: client.auth.region });
      return await newClient.get<T>(path, params);
    }
    throw err;
  }
}

async function getSgpAuthForRegion(region?: string) {
  let auth = await getSgpAuth();
  if (region) {
    const targetRegion = getRegionConfig(region);
    if (targetRegion) {
      auth = { ...auth, region: targetRegion };
    }
  }
  return auth;
}

function collectRankQueues(stats: LcuRankedStats | LcuRankQueue[] | null | undefined): LcuRankQueue[] {
  if (!stats) return [];
  if (Array.isArray(stats)) return stats;

  const queues: LcuRankQueue[] = [];
  if (stats.highestRankedEntry) {
    queues.push(stats.highestRankedEntry);
  }
  if (stats.rankedEntry) {
    queues.push(stats.rankedEntry);
  }
  if (Array.isArray(stats.queues)) {
    queues.push(...stats.queues);
  }
  if (stats.queueMap) {
    for (const [queueType, queue] of Object.entries(stats.queueMap)) {
      queues.push({ ...queue, queueType: queue.queueType ?? queueType });
    }
  }
  const possibleQueue = stats as LcuRankQueue;
  if (possibleQueue.tier || possibleQueue.ratedTier) {
    queues.push(possibleQueue);
  }
  return queues;
}

function normalizeRankTier(rawTier?: string): string {
  const tier = String(rawTier ?? '').toUpperCase();
  if (!tier || tier === 'NONE' || tier === 'NA' || tier === 'UNRANKED') return '';
  return tier;
}

function normalizeRankDivision(rawDivision?: string): string {
  const division = String(rawDivision ?? '').toUpperCase();
  if (!division || division === 'NONE' || division === 'NA') return '';
  return division;
}

function toFiniteNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function mapRankQueue(queue: LcuRankQueue): PlayerRankSummary | null {
  const tier = normalizeRankTier(queue.tier ?? queue.ratedTier);
  if (!tier) return null;

  const queueType = queue.queueType ?? queue.queue ?? '';
  if (queueType !== 'RANKED_SOLO_5x5' && queueType !== 'RANKED_FLEX_SR') return null;
  const queueName = RANK_QUEUE_NAMES[queueType] ?? '';
  const division = normalizeRankDivision(queue.division ?? queue.rank);
  const leaguePoints = toFiniteNumber(queue.leaguePoints ?? queue.ratedRating);
  const tierText = RANK_TIER_NAMES[tier] ?? tier;
  const divisionText = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier) ? '' : division;
  const displayText = [
    queueName,
    tierText,
    divisionText,
    leaguePoints > 0 ? String(leaguePoints) : '',
  ].filter(Boolean).join(' ');

  return {
    queueType,
    queueName,
    tier,
    division,
    leaguePoints,
    wins: toFiniteNumber(queue.wins),
    losses: toFiniteNumber(queue.losses),
    displayText,
  };
}

function pickPreferredRank(ranks: PlayerRankSummary[]): PlayerRankSummary | null {
  return (
    ranks.find((rank) => rank.queueType === 'RANKED_SOLO_5x5') ??
    ranks.find((rank) => rank.queueType === 'RANKED_FLEX_SR') ??
    ranks[0] ??
    null
  );
}

function getRankSummaries(stats: LcuRankedStats | LcuRankQueue[] | null | undefined): PlayerRankSummary[] {
  const seen = new Set<string>();
  const queueOrder: Record<string, number> = {
    RANKED_SOLO_5x5: 0,
    RANKED_FLEX_SR: 1,
  };

  return collectRankQueues(stats)
    .map((queue) => mapRankQueue(queue))
    .filter((rank): rank is PlayerRankSummary => Boolean(rank))
    .filter((rank) => {
      const key = rank.queueType || rank.displayText;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (queueOrder[a.queueType] ?? 99) - (queueOrder[b.queueType] ?? 99));
}

function pickRankSummary(stats: LcuRankedStats | LcuRankQueue[] | null | undefined): PlayerRankSummary | null {
  return pickPreferredRank(getRankSummaries(stats));
}

// challenges 端点里 playerChallenges 数组项
interface ChallengePlayerData {
  id: number;
  currentValue?: number;
}

interface ChallengesAllPlayerData {
  playerChallenges?: ChallengePlayerData[];
}

// challenge id → 收藏字段的映射（与 SQGG 一致，已实测验证）。
// 这些 id 在 playerChallenges 数组里，currentValue 就是该玩家拥有的数量。
const COLLECTION_CHALLENGE_IDS = {
  champion: 505001, // 英雄数
  skin: 510001, // 皮肤数
  chroma: 510011, // 炫彩数（暂未展示，预留）
  icon: 504002, // 召唤师图标数
  emote: 504004, // 表情数
  ward: 504003, // 守卫皮肤数
} as const;

// 用 SGP challenges 端点查玩家的游戏资产数量（英雄/皮肤等）。
// 走 SGP 而非 LCU，因此能查任意玩家（传其 puuid）。POST /challenges-client/v2/all-player-data。
// 失败返回 null（不阻塞战绩查询）。
async function fetchCollectionCounts(
  puuid?: string,
): Promise<{ championCount: number | null; skinCount: number | null }> {
  if (!puuid) return { championCount: null, skinCount: null };
  try {
    const auth = await getSgpAuth();
    const client = new SgpClient(auth);
    const data = await client.post<ChallengesAllPlayerData>(
      '/challenges-client/v2/all-player-data',
      [],
      { puuid },
    );
    const list = data?.playerChallenges ?? [];
    const byId = new Map<number, number>();
    for (const c of list) {
      if (typeof c?.id === 'number' && typeof c.currentValue === 'number') {
        byId.set(c.id, c.currentValue);
      }
    }
    return {
      championCount: byId.get(COLLECTION_CHALLENGE_IDS.champion) ?? null,
      skinCount: byId.get(COLLECTION_CHALLENGE_IDS.skin) ?? null,
    };
  } catch (err) {
    console.warn('[match] 查询资产数量失败:', err);
    return { championCount: null, skinCount: null };
  }
}

async function fetchRankByPuuid(
  client: LcuClient,
  puuid: string,
  summonerId?: number,
): Promise<PlayerRankSummary | null> {
  const paths = [
    puuid ? `/lol-ranked/v1/ranked-stats/${encodeURIComponent(puuid)}` : '',
    summonerId ? `/lol-ranked/v1/ranked-stats/${summonerId}` : '',
  ].filter(Boolean);

  for (const path of paths) {
    try {
      const stats = await client.get<LcuRankedStats | LcuRankQueue[]>(path);
      const rank = pickRankSummary(stats);
      if (rank) return rank;
    } catch {
      // 段位只是附加信息，失败不能影响战绩查询。
    }
  }
  return null;
}

async function fetchRanksByPuuid(
  client: LcuClient,
  puuid: string,
  summonerId?: number,
): Promise<PlayerRankSummary[]> {
  const paths = [
    puuid ? `/lol-ranked/v1/ranked-stats/${encodeURIComponent(puuid)}` : '',
    summonerId ? `/lol-ranked/v1/ranked-stats/${summonerId}` : '',
  ].filter(Boolean);

  for (const path of paths) {
    try {
      const stats = await client.get<LcuRankedStats | LcuRankQueue[]>(path);
      const ranks = getRankSummaries(stats);
      if (ranks.length > 0) return ranks;
    } catch {
      // 段位只是附加信息，失败不能影响战绩查询。
    }
  }
  return [];
}

async function fetchCurrentRanks(
  client: LcuClient,
  puuid?: string,
  summonerId?: number,
): Promise<PlayerRankSummary[]> {
  try {
    const stats = await client.get<LcuRankedStats | LcuRankQueue[]>('/lol-ranked/v1/current-ranked-stats');
    const ranks = getRankSummaries(stats);
    if (ranks.length > 0) return ranks;
  } catch {
    // 国服/版本差异下可能没有 current-ranked-stats，继续用 ranked-stats 兜底。
  }
  return fetchRanksByPuuid(client, puuid ?? '', summonerId);
}

async function fetchSgpRanksByPuuid(
  auth: Awaited<ReturnType<typeof getSgpAuth>>,
  puuid: string,
): Promise<PlayerRankSummary[]> {
  if (!puuid) return [];
  try {
    const client = new SgpClient(auth);
    const stats = await requestWithRetry<LcuRankedStats | LcuRankQueue[]>(
      client,
      `/leagues-ledge/v2/rankedStats/puuid/${encodeURIComponent(puuid)}`,
    );
    return getRankSummaries(stats);
  } catch (err) {
    console.warn('[match] SGP 段位查询失败:', puuid, err);
    return [];
  }
}

async function fetchLcuSummonerProfileByPuuid(
  client: LcuClient,
  puuid: string,
): Promise<{
  riotId: string;
  level: number;
  profileIconId: number;
  summonerId?: number;
} | null> {
  const paths = [
    `/lol-summoner/v2/summoners/puuid/${encodeURIComponent(puuid)}`,
    `/lol-summoner/v1/summoners/puuid/${encodeURIComponent(puuid)}`,
  ];

  for (const path of paths) {
    try {
      const summoner = await client.get<{
        gameName?: string;
        tagLine?: string;
        displayName?: string;
        name?: string;
        summonerId?: number;
        summonerLevel?: number;
        profileIconId?: number;
      }>(path);
      const gameName = summoner.gameName || summoner.displayName || summoner.name || '';
      const riotId = gameName && summoner.tagLine && !gameName.includes('#')
        ? `${gameName}#${summoner.tagLine}`
        : gameName;
      return {
        riotId,
        level: summoner.summonerLevel ?? 0,
        profileIconId: summoner.profileIconId ?? 0,
        summonerId: summoner.summonerId,
      };
    } catch {
      // Some clients only support one of the two puuid endpoints.
    }
  }
  return null;
}

async function fetchSummonerIdByPuuid(client: LcuClient, puuid: string): Promise<number | undefined> {
  const paths = [
    `/lol-summoner/v2/summoners/puuid/${encodeURIComponent(puuid)}`,
    `/lol-summoner/v1/summoners/puuid/${encodeURIComponent(puuid)}`,
  ];

  for (const path of paths) {
    try {
      const summoner = await client.get<{ summonerId?: number }>(path);
      if (typeof summoner.summonerId === 'number') return summoner.summonerId;
    } catch {
      // 不同客户端版本可能只支持其中一个路径，继续尝试。
    }
  }
  return undefined;
}

const PLAYER_RANK_CACHE_TTL_MS = 5 * 60 * 1000;
const PLAYER_RANK_CACHE_MAX_ENTRIES = 500;
const playerRankCache = new Map<
  string,
  { value: PlayerRankSummary[]; expiresAt: number }
>();

function cachePlayerRanks(puuid: string, value: PlayerRankSummary[]): void {
  if (playerRankCache.size >= PLAYER_RANK_CACHE_MAX_ENTRIES) {
    const oldestKey = playerRankCache.keys().next().value as string | undefined;
    if (oldestKey) playerRankCache.delete(oldestKey);
  }
  playerRankCache.set(puuid, {
    value,
    expiresAt: Date.now() + PLAYER_RANK_CACHE_TTL_MS,
  });
}

export async function fetchPlayerRanksByPuuid(
  puuid: string,
  region?: string,
): Promise<PlayerRankSummary[]> {
  if (!puuid) return [];
  const cacheKey = `${region ? getRegionConfig(region)?.key ?? region : 'current'}:${puuid}`;
  const cached = playerRankCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  if (cached) {
    playerRankCache.delete(cacheKey);
  }

  if (region) {
    try {
      const auth = await getSgpAuthForRegion(region);
      const ranks = await fetchSgpRanksByPuuid(auth, puuid);
      cachePlayerRanks(cacheKey, ranks);
      return ranks;
    } catch {
      // Fall back to local LCU below.
    }
  }

  const creds = getCachedCredentials();
  if (!creds) {
    return [];
  }

  const client = new LcuClient(creds);
  let ranks = await fetchRanksByPuuid(client, puuid);
  if (ranks.length === 0) {
    const summonerId = await fetchSummonerIdByPuuid(client, puuid);
    if (summonerId) {
      ranks = await fetchRanksByPuuid(client, '', summonerId);
    }
  }
  if (ranks.length === 0) {
    try {
      const auth = await getSgpAuthForRegion(region);
      ranks = await fetchSgpRanksByPuuid(auth, puuid);
    } catch {
      // Rank is optional.
    }
  }
  cachePlayerRanks(cacheKey, ranks);
  return ranks;
}

export async function fetchPlayerRankByPuuid(puuid: string): Promise<PlayerRankSummary | null> {
  const ranks = await fetchPlayerRanksByPuuid(puuid);
  const preferred = pickPreferredRank(ranks);
  if (preferred || !puuid) return preferred;

  const creds = getCachedCredentials();
  if (!creds) return null;
  return fetchRankByPuuid(new LcuClient(creds), puuid);
}

// 按 Riot ID（名字#数字）查 puuid。
// 关键：必须传完整 Riot ID（gameName#tagLine），# 编码成 %23。
// 只传 gameName（不带 #tagLine）会返回 422（之前所有失败的根因）。
// 返回 { puuid, riotId } 或 null（没找到）。
async function lookupSummonerByRiotId(riotId: string): Promise<{
  puuid: string;
  riotId: string;
  level: number;
  profileIconId: number;
  rank: PlayerRankSummary | null;
  ranks: PlayerRankSummary[];
  championCount: number | null;
  skinCount: number | null;
} | null> {
  try {
    const riotAccount = await lookupRiotAccountByRiotId(riotId);
    if (riotAccount?.puuid) {
      const creds = getCachedCredentials();
      const client = creds ? new LcuClient(creds) : null;
      const lcuProfile = client
        ? await fetchLcuSummonerProfileByPuuid(client, riotAccount.puuid)
        : null;
      const ranks = client && lcuProfile
        ? await fetchRanksByPuuid(client, riotAccount.puuid, lcuProfile.summonerId)
        : [];
      const counts = await fetchCollectionCounts(riotAccount.puuid);
      return {
        puuid: riotAccount.puuid,
        riotId: lcuProfile?.riotId || riotAccount.riotId,
        level: lcuProfile?.level ?? 0,
        profileIconId: lcuProfile?.profileIconId ?? 0,
        rank: pickPreferredRank(ranks),
        ranks,
        championCount: counts.championCount,
        skinCount: counts.skinCount,
      };
    }
  } catch (err) {
    console.warn('[match] RiotClient Riot ID 查询失败，回退到 LCU:', riotId, err);
  }

  const creds = getCachedCredentials();
  if (!creds) return null;
  const client = new LcuClient(creds);
  // 传完整 Riot ID（含 #），encodeURIComponent 会把 # 编码成 %23
  const encoded = encodeURIComponent(riotId.trim());
  try {
    const summoner = await client.get<{
      puuid?: string;
      gameName?: string;
      tagLine?: string;
      summonerId?: number;
      summonerLevel?: number;
      profileIconId?: number;
    }>(`/lol-summoner/v1/summoners?name=${encoded}`);
    if (summoner && summoner.puuid) {
      const gameName = summoner.gameName ?? riotId;
      const fullRiotId = summoner.tagLine && !gameName.includes('#')
        ? `${gameName}#${summoner.tagLine}`
        : gameName;
      const [ranks, counts] = await Promise.all([
        fetchRanksByPuuid(client, summoner.puuid, summoner.summonerId),
        fetchCollectionCounts(summoner.puuid),
      ]);
      return {
        puuid: summoner.puuid,
        riotId: fullRiotId,
        level: summoner.summonerLevel ?? 0,
        profileIconId: summoner.profileIconId ?? 0,
        rank: pickPreferredRank(ranks),
        ranks,
        championCount: counts.championCount,
        skinCount: counts.skinCount,
      };
    }
  } catch (err) {
    console.warn('[match] Riot ID 查询失败:', riotId, err);
  }
  return null;
}

async function fetchCurrentSummonerProfile(): Promise<{
  riotId: string;
  level: number;
  profileIconId: number;
  rank: PlayerRankSummary | null;
  ranks: PlayerRankSummary[];
  championCount: number | null;
  skinCount: number | null;
}> {
  const creds = getCachedCredentials();
  if (!creds) {
    return {
      riotId: '',
      level: 0,
      profileIconId: 0,
      rank: null,
      ranks: [],
      championCount: null,
      skinCount: null,
    };
  }
  const client = new LcuClient(creds);
  const summoner = await client.get<{
    puuid?: string;
    summonerId?: number;
    gameName?: string;
    tagLine?: string;
    displayName?: string;
    name?: string;
    summonerLevel?: number;
    profileIconId?: number;
  }>('/lol-summoner/v1/current-summoner');
  const gameName = summoner.gameName || summoner.displayName || summoner.name || '';
  const riotId = gameName && summoner.tagLine && !gameName.includes('#')
    ? `${gameName}#${summoner.tagLine}`
    : gameName;
  const [ranks, counts] = await Promise.all([
    fetchCurrentRanks(client, summoner.puuid, summoner.summonerId),
    fetchCollectionCounts(summoner.puuid),
  ]);
  return {
    riotId,
    level: summoner.summonerLevel ?? 0,
    profileIconId: summoner.profileIconId ?? 0,
    rank: pickPreferredRank(ranks),
    ranks,
    championCount: counts.championCount,
    skinCount: counts.skinCount,
  };
}

// 主入口：查战绩。
// 输入为空/自己/我/me → 查当前登录账号；输入"名字#数字" → 查该玩家。
// 支持翻页：count 是本次拉取条数，startIndex 是偏移（0/100/200...）。
export async function searchPlayer(req: PlayerLookupRequest): Promise<PlayerLookupResult> {
  const count = Math.min(MAX_COUNT, Math.max(1, Math.floor(req.pageSize ?? req.maxMatches ?? DEFAULT_COUNT)));
  const startIndex = Math.max(0, Math.floor(req.startIndex ?? 0));
  // 清洗输入：去不可见字符，统一各种 # 变体为标准 #，去多余空格。
  const rawName = normalizeRiotIdInput(req.name ?? '');
  const inputName = rawName;
  const isSelfQuery = ['', '自己', '我', 'me', 'self'].includes(inputName.toLowerCase());

  // 1. SGP 认证（同时拿到当前账号 puuid + 大区 + entitlements token）
  let auth;
  try {
    auth = await getSgpAuthForRegion(req.region);
  } catch (err) {
    return emptyResult(err instanceof Error ? err.message : String(err));
  }

  // 2. 确定查谁的 puuid
  let targetPuuid = auth.puuid;
  let displayName = '';
  let level = 0;
  let profileIconId = 0;
  let rank: PlayerRankSummary | null = null;
  let ranks: PlayerRankSummary[] = [];
  let championCount: number | null = null;
  let skinCount: number | null = null;
  if (isSelfQuery) {
    try {
      const selfProfile = await fetchCurrentSummonerProfile();
      displayName = selfProfile.riotId;
      level = selfProfile.level;
      profileIconId = selfProfile.profileIconId;
      rank = selfProfile.rank;
      ranks = selfProfile.ranks;
      championCount = selfProfile.championCount;
      skinCount = selfProfile.skinCount;
    } catch (err) {
      console.warn('[match] 当前账号资料获取失败:', err);
    }
  } else {
    // 输入了 Riot ID → 按 LCU 查 puuid
    const lookup = await lookupSummonerByRiotId(inputName);
    if (!lookup) {
      return emptyResult(`未找到玩家「${inputName}」，请确认 Riot ID 格式为 名字#数字`);
    }
    targetPuuid = lookup.puuid;
    displayName = lookup.riotId;
    level = lookup.level;
    profileIconId = lookup.profileIconId;
    rank = lookup.rank;
    ranks = lookup.ranks;
    championCount = lookup.championCount;
    skinCount = lookup.skinCount;
  }

  if (targetPuuid && ranks.length === 0) {
    ranks = await fetchSgpRanksByPuuid(auth, targetPuuid);
    rank = pickPreferredRank(ranks);
  }

  // 3. 请求战绩列表（用 targetPuuid，查自己或他人）
  let games: SgpGame[];
  try {
    const client = new SgpClient(auth);
    const params: Record<string, string | number> = { startIndex, count };
    if (req.tag) params.tag = req.tag; // 模式筛选（q_420 等）
    const resp = await requestWithRetry<{ games: SgpGame[] }>(
      client,
      '/match-history-query/v1/products/lol/player/' + targetPuuid + '/SUMMARY',
      params,
    );
    games = resp.games ?? [];
  } catch (err) {
    return emptyResult(`战绩获取失败：${err instanceof Error ? err.message : String(err)}`);
  }

  // 4. 字段映射（用 targetPuuid 标记当前查询的玩家）
  const matches: PlayerMatchDetail[] = [];
  for (const game of games) {
    try {
      matches.push(extractMatchDetail(game, targetPuuid));
    } catch (err) {
      console.warn('[match] 单场映射失败，跳过:', err);
    }
  }

  const targetParticipant = matches
    .flatMap((match) => match.participants)
    .find((participant) => participant.puuid === targetPuuid);

  if (!displayName) {
    displayName = targetParticipant?.riotId || targetParticipant?.summonerName || '';
  }
  if (!profileIconId && targetParticipant?.profileIconId) {
    profileIconId = targetParticipant.profileIconId;
  }

  // 5. 汇总
  const summary = buildLookupSummary(matches);

  return {
    profile: {
      riotId: displayName,
      puuid: targetPuuid,
      level,
      profileIconId,
      profileIconUrl: profileIconId ? buildProfileIcon(profileIconId) : '',
      rank,
      ranks,
      championCount,
      skinCount,
    },
    matches,
    summary,
    totalMatches: matches.length,
  };
}

function emptyResult(error: string): PlayerLookupResult {
  return {
    profile: {
      riotId: '',
      puuid: '',
      level: 0,
      profileIconId: 0,
      profileIconUrl: '',
      rank: null,
      ranks: [],
      championCount: null,
      skinCount: null,
    },
    matches: [],
    summary: { wins: 0, losses: 0, averageKda: 0, averageDamage: 0, averageCs: 0 },
    totalMatches: 0,
    error,
  };
}

// ============================================================================
// 以下两个导出函数供 scout 引擎复用（共享 SGP 认证链 + 字段映射）。
// searchPlayer 走"Riot ID→puuid→战绩→组装 Result"完整链路；
// scout 需要把这两步拆开：先解析种子 puuid，再批量按 puuid 查战绩。
// ============================================================================

// 按 Riot ID（或空=自己）解析 puuid + 显示名。复用 searchPlayer 的输入清洗。
// region 可选（跨区查询）。返回 null 表示未找到。
export async function resolvePuuid(
  seedId: string,
  region?: string,
): Promise<{ puuid: string; riotId: string } | null> {
  let auth;
  try {
    auth = await getSgpAuthForRegion(region);
  } catch {
    return null;
  }

  const rawName = normalizeRiotIdInput(seedId ?? '');
  const isSelf = ['', '自己', '我', 'me', 'self'].includes(rawName.toLowerCase());

  if (isSelf) {
    return { puuid: auth.puuid, riotId: '' };
  }
  const lookup = await lookupSummonerByRiotId(rawName);
  if (!lookup) return null;
  return { puuid: lookup.puuid, riotId: lookup.riotId };
}

// 按 puuid + count 查战绩（已字段映射好）。带模式 tag、可选跨区 region。
// 复用 requestWithRetry 的 401/403 重试。返回空数组表示拉取失败或无数据。
export async function fetchMatchesByPuuid(
  puuid: string,
  count: number,
  tag?: string,
  region?: string,
): Promise<PlayerMatchDetail[]> {
  let auth;
  try {
    auth = await getSgpAuthForRegion(region);
  } catch {
    return [];
  }

  const safeCount = Math.min(MAX_COUNT, Math.max(1, Math.floor(count)));
  const client = new SgpClient(auth);
  const params: Record<string, string | number> = { startIndex: 0, count: safeCount };
  if (tag) params.tag = tag;
  try {
    const resp = await requestWithRetry<{ games: SgpGame[] }>(
      client,
      '/match-history-query/v1/products/lol/player/' + puuid + '/SUMMARY',
      params,
    );
    const games = resp.games ?? [];
    const matches: PlayerMatchDetail[] = [];
    for (const game of games) {
      try {
        matches.push(extractMatchDetail(game, puuid));
      } catch (err) {
        console.warn('[match] 单场映射失败，跳过:', err);
      }
    }
    return matches;
  } catch (err) {
    console.warn('[match] puuid 战绩拉取失败:', puuid, err);
    return [];
  }
}
