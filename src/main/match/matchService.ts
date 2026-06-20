import { getCachedCredentials, invalidateCredentialsCache } from '../lcu/lockfile';
import { LcuClient } from '../lcu/client';
import { getDataDragonVersion } from '../lcu/heroData';
import { extractMatchDetail, buildLookupSummary, type RawMatchGame } from './matchMapper';
import type {
  PlayerLookupRequest,
  PlayerLookupResult,
  PlayerProfile,
  PlayerMatchDetail,
} from '../../shared/api';

// 战绩查询服务：按召唤师名查战绩。
// 流程：取凭证 → LcuClient → 按名查 puuid → 拉战绩列表 → 并发拉详情 → 字段映射。
//
// 国服关键点（实测）：
// - 凭证来自 LeagueClientUx.log（lockfile 国服为空），见 lockfile.ts
// - 按名查询端点 lol-summoner/v1/summoners?name=xxx（name 需 URL 编码）
// - 战绩列表端点 lol-match-history/v1/products/lol/{puuid}/matches
// - 单局详情端点 lol-match-history/v1/games/{gameId}
// - LCU 缓存约 100 场，更早的拿不到（SGP 不稳定已禁用）

const DEFAULT_PAGE_SIZE = 12;
const MAX_LCU_MATCHES = 100;
const CONCURRENT_DETAIL_LIMIT = 5; // 并发拉详情上限，避免压垮 LCU

// 创建 LCU 客户端（带缓存凭证）。客户端未运行时抛错。
function createClient(): LcuClient {
  const creds = getCachedCredentials();
  if (!creds) {
    throw new Error('未检测到 LOL 客户端（请先启动并登录客户端）');
  }
  return new LcuClient(creds);
}

// 带凭证失效重试的请求：401/403 时清缓存重读一次。
async function requestWithRetry<T>(client: LcuClient, path: string): Promise<T> {
  try {
    return await client.get<T>(path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 401/403 可能是 token 过期（客户端重启过），清缓存重建客户端重试一次
    if (msg.includes('401') || msg.includes('403')) {
      invalidateCredentialsCache();
      const newClient = createClient();
      return await newClient.get<T>(path);
    }
    throw err;
  }
}

// 查召唤师拿 puuid + 基本资料。
// 国服（腾讯）关键限制：?name= 和 by-riot-id 端点均不可用（422/404），
// 只能查当前登录账号。策略：
// - name 为空或等于"自己/我/me"等关键词 → 查 current-summoner
// - name 非空 → 先试 ?name= 查他人，失败则回退 current-summoner（提示用户）
async function lookupSummoner(
  client: LcuClient,
  name: string,
): Promise<{ profile: PlayerProfile; isSelf: boolean }> {
  const trimmed = name.trim();
  const isSelfQuery = ['', '自己', '我', 'me', 'self'].includes(trimmed.toLowerCase());

  // 自己：直接 current-summoner（国服最可靠）
  if (isSelfQuery) {
    return { profile: await fetchCurrentSummoner(client), isSelf: true };
  }

  // 他人：尝试 ?name= 端点（国际服有效，国服可能 422）
  try {
    const encoded = encodeURIComponent(trimmed);
    const summoner = await requestWithRetry<Record<string, unknown>>(
      client,
      `/lol-summoner/v1/summoners?name=${encoded}`,
    );
    if (summoner && Object.keys(summoner).length > 0 && summoner.puuid) {
      return { profile: profileFromSummoner(summoner, trimmed), isSelf: false };
    }
  } catch {
    // 国服 ?name= 常失败，落到下面的回退
  }

  // 回退：查当前账号（国服查他人受限时的降级）
  const selfProfile = await fetchCurrentSummoner(client);
  return {
    profile: selfProfile,
    isSelf: true,
  };
}

// 从 current-summoner 端点拿当前登录账号资料。
async function fetchCurrentSummoner(client: LcuClient): Promise<PlayerProfile> {
  const summoner = await requestWithRetry<Record<string, unknown>>(
    client,
    '/lol-summoner/v1/current-summoner',
  );
  return profileFromSummoner(summoner, '');
}

// 从召唤师对象构造 PlayerProfile。
function profileFromSummoner(
  summoner: Record<string, unknown>,
  fallbackName: string,
): PlayerProfile {
  const gameName = (summoner.gameName as string) ?? '';
  const tagLine = (summoner.tagLine as string) ?? '';
  const riotId = gameName ? `${gameName}${tagLine ? '#' + tagLine : ''}` : fallbackName;
  const profileIconId = (summoner.profileIconId as number) ?? 0;
  const version = getDataDragonVersion();
  return {
    riotId,
    puuid: (summoner.puuid as string) ?? '',
    level: (summoner.summonerLevel as number) ?? 0,
    profileIconId,
    profileIconUrl: profileIconId
      ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${profileIconId}.png`
      : '',
  };
}

// 拉战绩列表（gameId 数组）。
async function fetchMatchIds(
  client: LcuClient,
  puuid: string,
  page: number,
  pageSize: number,
): Promise<{ gameIds: number[]; totalMatches: number }> {
  const begIndex = Math.min((page - 1) * pageSize, MAX_LCU_MATCHES);
  const endIndex = Math.min(begIndex + pageSize, MAX_LCU_MATCHES); // LCU 上限约 100
  const resp = await requestWithRetry<{
    games?: { games?: Array<{ gameId: number }>; gameCount?: number };
  }>(client, `/lol-match-history/v1/products/lol/${puuid}/matches?begIndex=${begIndex}&endIndex=${endIndex}`);

  const games = resp?.games?.games ?? [];
  const gameIds = games.map((g) => g.gameId).filter((id) => id);
  const totalMatches = resp?.games?.gameCount ?? gameIds.length;

  return { gameIds, totalMatches };
}

// 并发拉取单局详情（限制并发数）。
async function fetchMatchDetails(
  client: LcuClient,
  gameIds: number[],
  puuid: string,
): Promise<PlayerMatchDetail[]> {
  const ddVersion = getDataDragonVersion();
  const results: PlayerMatchDetail[] = [];
  // 分批并发
  for (let i = 0; i < gameIds.length; i += CONCURRENT_DETAIL_LIMIT) {
    const batch = gameIds.slice(i, i + CONCURRENT_DETAIL_LIMIT);
    const settled = await Promise.allSettled(
      batch.map((gameId) =>
        requestWithRetry<RawMatchGame>(client, `/lol-match-history/v1/games/${gameId}`),
      ),
    );
    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value) {
        try {
          results.push(extractMatchDetail(s.value, puuid, ddVersion));
        } catch (err) {
          console.warn('[match] 单局详情映射失败，跳过:', err);
        }
      }
    }
  }
  return results;
}

// 主入口：按名查战绩。
// 失败时返回 error 字段（不抛异常），便于前端统一展示。
export async function searchPlayer(req: PlayerLookupRequest): Promise<PlayerLookupResult> {
  const { name } = req;
  const page = Math.max(1, Math.floor(req.page ?? 1));
  const pageSize = Math.min(
    20,
    Math.max(1, Math.floor(req.pageSize ?? req.maxMatches ?? DEFAULT_PAGE_SIZE)),
  );

  let client: LcuClient;
  try {
    client = createClient();
  } catch (err) {
    return emptyResult(err instanceof Error ? err.message : String(err));
  }

  // 1. 查召唤师拿 puuid
  let profile: PlayerProfile;
  let isSelf = false;
  try {
    const lookup = await lookupSummoner(client, name);
    profile = lookup.profile;
    isSelf = lookup.isSelf;
    if (!profile.puuid) {
      return emptyResult(`无法获取召唤师「${name}」的 puuid`);
    }
  } catch (err) {
    return emptyResult(err instanceof Error ? err.message : String(err));
  }

  // 国服查他人受限时回退到自己，附加提示
  const fallbackNote = !isSelf ? '' : (name.trim() && !['自己', '我', 'me', 'self'].includes(name.trim().toLowerCase())
    ? `（国服暂不支持按名查他人，已显示当前登录账号「${profile.riotId}」的战绩）`
    : '');

  // 2. 拉战绩列表
  let gameIds: number[];
  let totalMatches: number;
  try {
    const list = await fetchMatchIds(client, profile.puuid, page, pageSize);
    gameIds = list.gameIds;
    totalMatches = list.totalMatches;
  } catch (err) {
    return {
      profile,
      matches: [],
      summary: { wins: 0, losses: 0, averageKda: 0, averageDamage: 0, averageCs: 0 },
      totalMatches: 0,
      error: `战绩列表获取失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 3. 并发拉详情
  let matches: PlayerMatchDetail[];
  try {
    matches = await fetchMatchDetails(client, gameIds, profile.puuid);
  } catch (err) {
    return {
      profile,
      matches: [],
      summary: { wins: 0, losses: 0, averageKda: 0, averageDamage: 0, averageCs: 0 },
      totalMatches,
      error: `对局详情获取失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 4. 汇总统计
  const summary = buildLookupSummary(matches);

  return { profile, matches, summary, totalMatches, ...(fallbackNote ? { error: fallbackNote } : {}) };
}

function emptyResult(error: string): PlayerLookupResult {
  return {
    profile: { riotId: '', puuid: '', level: 0, profileIconId: 0, profileIconUrl: '' },
    matches: [],
    summary: { wins: 0, losses: 0, averageKda: 0, averageDamage: 0, averageCs: 0 },
    totalMatches: 0,
    error,
  };
}
