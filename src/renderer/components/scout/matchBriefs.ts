import type { PlayerMatchBrief, PlayerMatchBriefResult } from '../../../shared/api';

// 高手雷达的战绩速览：按 大区 + puuid 缓存几分钟，同一个人反复点开不再请求；
// 悬停在卡片上稍作停留就预取，点开时通常已经到手。

const BRIEF_COUNT = 20;
const CACHE_TTL_MS = 3 * 60 * 1000;
const CACHE_MAX_ENTRIES = 60;

interface CacheEntry {
  at: number;
  promise: Promise<PlayerMatchBriefResult>;
  result?: PlayerMatchBriefResult;
}

const cache = new Map<string, CacheEntry>();

const cacheKey = (puuid: string, region: string) => `${region || '-'}|${puuid}`;

// 主进程 / preload 还是旧版本（只刷新了界面、没整体重启）时，接口不存在或没有注册处理器
const RESTART_HINT = '战绩速览需要把应用完全关掉再重新打开一次才能使用';

function failed(puuid: string, err: unknown): PlayerMatchBriefResult {
  const message = err instanceof Error ? err.message : String(err);
  const error = /No handler registered|is not a function/i.test(message) ? RESTART_HINT : message;
  return { puuid, matches: [], mates: [], error };
}

// 任何情况下都返回一个 Promise，不同步抛错（同步抛错会让 React 整页白屏）
function requestBriefs(puuid: string, region: string): Promise<PlayerMatchBriefResult> {
  try {
    const getMatchBriefs = window.lolHelper?.match?.getMatchBriefs;
    if (typeof getMatchBriefs !== 'function') return Promise.resolve(failed(puuid, RESTART_HINT));
    return Promise.resolve(getMatchBriefs({ puuid, region: region || undefined, count: BRIEF_COUNT }))
      .catch((err: unknown) => failed(puuid, err));
  } catch (err) {
    return Promise.resolve(failed(puuid, err));
  }
}

export function loadMatchBriefs(puuid: string, region = ''): Promise<PlayerMatchBriefResult> {
  const key = cacheKey(puuid, region);
  const existing = cache.get(key);
  if (existing && Date.now() - existing.at < CACHE_TTL_MS) return existing.promise;

  const entry = { at: Date.now() } as CacheEntry;
  entry.promise = requestBriefs(puuid, region).then((result) => {
    // 失败的不留缓存，下次点开会重新请求
    if (result.error) cache.delete(key);
    else entry.result = result;
    return result;
  });
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return entry.promise;
}

// 已经拿到且未过期的结果（同步读取，点开时直接渲染，不闪加载态）
export function peekMatchBriefs(puuid: string, region = ''): PlayerMatchBriefResult | null {
  const entry = cache.get(cacheKey(puuid, region));
  if (!entry?.result || Date.now() - entry.at >= CACHE_TTL_MS) return null;
  return entry.result;
}

export function prefetchMatchBriefs(puuid: string, region = ''): void {
  if (!puuid) return;
  void loadMatchBriefs(puuid, region);
}

export function dropMatchBriefs(puuid: string, region = ''): void {
  cache.delete(cacheKey(puuid, region));
}

export interface MatchBriefSummary {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  kda: number;
  topChampions: Array<{ championId: number; championName: string; championAvatar: string; games: number; wins: number }>;
}

export function summarizeMatchBriefs(matches: PlayerMatchBrief[]): MatchBriefSummary {
  const wins = matches.filter((match) => match.win).length;
  const kills = matches.reduce((sum, match) => sum + match.kills, 0);
  const deaths = matches.reduce((sum, match) => sum + match.deaths, 0);
  const assists = matches.reduce((sum, match) => sum + match.assists, 0);
  const champions = new Map<number, MatchBriefSummary['topChampions'][number]>();
  for (const match of matches) {
    const known = champions.get(match.championId);
    if (known) {
      known.games += 1;
      if (match.win) known.wins += 1;
    } else {
      champions.set(match.championId, {
        championId: match.championId,
        championName: match.championName,
        championAvatar: match.championAvatar,
        games: 1,
        wins: match.win ? 1 : 0,
      });
    }
  }
  return {
    games: matches.length,
    wins,
    losses: matches.length - wins,
    winRate: matches.length > 0 ? Math.round((wins / matches.length) * 100) : 0,
    kda: (kills + assists) / Math.max(1, deaths),
    topChampions: [...champions.values()].sort((a, b) => b.games - a.games || b.wins - a.wins).slice(0, 3),
  };
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// 与战绩页列表一致：1 小时内显示分钟，1 天内显示小时，再早显示日期
export function formatPlayedAt(gameCreation: number): string {
  const elapsed = Math.max(0, Date.now() - gameCreation);
  if (elapsed < HOUR_MS) return `${Math.max(1, Math.floor(elapsed / MINUTE_MS))}分钟`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}小时`;
  const date = new Date(gameCreation);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}分${String(total % 60).padStart(2, '0')}秒`;
}
