import { getSgpAuth, invalidateSgpAuth } from '../sgp/auth';
import { SgpClient } from '../sgp/client';
import { getDataDragonVersion } from '../lcu/heroData';
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

// 主入口：查战绩（当前登录账号）。
// 支持翻页：count 是本次拉取条数，startIndex 是偏移（0/100/200...）。
// 前端首次 startIndex=0, count=100；点"加载更多"startIndex+=100 再拉一批。
export async function searchPlayer(req: PlayerLookupRequest): Promise<PlayerLookupResult> {
  const count = Math.min(MAX_COUNT, Math.max(1, Math.floor(req.pageSize ?? req.maxMatches ?? DEFAULT_COUNT)));
  const startIndex = Math.max(0, Math.floor(req.startIndex ?? 0));

  // 1. SGP 认证
  let auth;
  try {
    auth = await getSgpAuth();
  } catch (err) {
    return emptyResult(err instanceof Error ? err.message : String(err));
  }

  // 2. 请求战绩列表（一次拿 N 场，每场含 10 人详情）
  let games: SgpGame[];
  try {
    const client = new SgpClient(auth);
    const resp = await requestWithRetry<{ games: SgpGame[] }>(
      client,
      '/match-history-query/v1/products/lol/player/' + auth.puuid + '/SUMMARY',
      { startIndex, count },
    );
    games = resp.games ?? [];
  } catch (err) {
    return emptyResult(`战绩获取失败：${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. 字段映射
  const ddVersion = getDataDragonVersion();
  const matches: PlayerMatchDetail[] = [];
  for (const game of games) {
    try {
      matches.push(extractMatchDetail(game, auth.puuid, ddVersion));
    } catch (err) {
      console.warn('[match] 单场映射失败，跳过:', err);
    }
  }

  // 4. 汇总
  const summary = buildLookupSummary(matches);

  return {
    profile: {
      riotId: '',
      puuid: auth.puuid,
      level: 0,
      profileIconId: 0,
      profileIconUrl: '',
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
