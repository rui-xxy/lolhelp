import { getSgpAuth, invalidateSgpAuth } from '../sgp/auth';
import { SgpClient } from '../sgp/client';
import { getCachedCredentials } from '../lcu/lockfile';
import { LcuClient } from '../lcu/client';
import { getDataDragonVersion } from '../lcu/heroData';
import { getRegionConfig } from '../sgp/region';
import { extractMatchDetail, buildLookupSummary, type SgpGame } from './matchMapper';
import type {
  PlayerLookupRequest,
  PlayerLookupResult,
  PlayerMatchDetail,
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
// 注意：SGP 只能查当前登录账号（puuid 来自 current-summoner）。
// 按名查他人需要先注册玩家到 SGP（summoner-ledge），本阶段暂不做。

const DEFAULT_COUNT = 20;
const MAX_COUNT = 100; // 单次最多 100 场（可翻页拿更多）

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
      const newClient = new SgpClient(newAuth);
      return await newClient.get<T>(path, params);
    }
    throw err;
  }
}

// 按 Riot ID（名字#数字）查 puuid。
// 关键：必须传完整 Riot ID（gameName#tagLine），# 编码成 %23。
// 只传 gameName（不带 #tagLine）会返回 422（之前所有失败的根因）。
// 返回 { puuid, gameName } 或 null（没找到）。
async function lookupSummonerByRiotId(riotId: string): Promise<{ puuid: string; gameName: string; level: number; profileIconId: number } | null> {
  const creds = getCachedCredentials();
  if (!creds) return null;
  const client = new LcuClient(creds);
  // 传完整 Riot ID（含 #），encodeURIComponent 会把 # 编码成 %23
  const encoded = encodeURIComponent(riotId.trim());
  try {
    const summoner = await client.get<{ puuid?: string; gameName?: string; summonerLevel?: number; profileIconId?: number }>(
      `/lol-summoner/v1/summoners?name=${encoded}`,
    );
    if (summoner && summoner.puuid) {
      return {
        puuid: summoner.puuid,
        gameName: summoner.gameName ?? riotId,
        level: summoner.summonerLevel ?? 0,
        profileIconId: summoner.profileIconId ?? 0,
      };
    }
  } catch (err) {
    console.warn('[match] Riot ID 查询失败:', riotId, err);
  }
  return null;
}

// 主入口：查战绩。
// 输入为空/自己/我/me → 查当前登录账号；输入"名字#数字" → 查该玩家。
// 支持翻页：count 是本次拉取条数，startIndex 是偏移（0/100/200...）。
export async function searchPlayer(req: PlayerLookupRequest): Promise<PlayerLookupResult> {
  const count = Math.min(MAX_COUNT, Math.max(1, Math.floor(req.pageSize ?? req.maxMatches ?? DEFAULT_COUNT)));
  const startIndex = Math.max(0, Math.floor(req.startIndex ?? 0));
  const inputName = (req.name ?? '').trim();
  const isSelfQuery = ['', '自己', '我', 'me', 'self'].includes(inputName.toLowerCase());

  // 1. SGP 认证（同时拿到当前账号 puuid + 大区 + entitlements token）
  let auth;
  try {
    auth = await getSgpAuth();
  } catch (err) {
    return emptyResult(err instanceof Error ? err.message : String(err));
  }

  // 如果指定了目标大区，覆盖 auth 的 region（跨区查询）。
  // entitlements token 通用，能查任何大区；puuid 只在玩家注册的大区有数据。
  if (req.region) {
    const targetRegion = getRegionConfig(req.region);
    if (targetRegion) {
      auth = { ...auth, region: targetRegion };
    }
  }

  // 2. 确定查谁的 puuid
  let targetPuuid = auth.puuid;
  let displayName = '';
  let level = 0;
  let profileIconId = 0;
  if (!isSelfQuery) {
    // 输入了 Riot ID → 按 LCU 查 puuid
    const lookup = await lookupSummonerByRiotId(inputName);
    if (!lookup) {
      return emptyResult(`未找到玩家「${inputName}」，请确认 Riot ID 格式为 名字#数字（如 小猫猫拳#46662）`);
    }
    targetPuuid = lookup.puuid;
    displayName = lookup.gameName;
    level = lookup.level;
    profileIconId = lookup.profileIconId;
  }

  // 3. 请求战绩列表（用 targetPuuid，查自己或他人）
  let games: SgpGame[];
  try {
    const client = new SgpClient(auth);
    const resp = await requestWithRetry<{ games: SgpGame[] }>(
      client,
      '/match-history-query/v1/products/lol/player/' + targetPuuid + '/SUMMARY',
      { startIndex, count },
    );
    games = resp.games ?? [];
  } catch (err) {
    return emptyResult(`战绩获取失败：${err instanceof Error ? err.message : String(err)}`);
  }

  // 4. 字段映射（用 targetPuuid 标记当前查询的玩家）
  const ddVersion = getDataDragonVersion();
  const matches: PlayerMatchDetail[] = [];
  for (const game of games) {
    try {
      matches.push(extractMatchDetail(game, targetPuuid, ddVersion));
    } catch (err) {
      console.warn('[match] 单场映射失败，跳过:', err);
    }
  }

  // 5. 汇总
  const summary = buildLookupSummary(matches);

  return {
    profile: {
      riotId: displayName,
      puuid: targetPuuid,
      level,
      profileIconId,
      profileIconUrl: profileIconId
        ? `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/profileicon/${profileIconId}.png`
        : '',
    },
    matches,
    summary,
    totalMatches: matches.length,
  };
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
