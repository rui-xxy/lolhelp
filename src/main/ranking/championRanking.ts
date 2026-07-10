import type {
  ChampionCounterSummary,
  ChampionRankingEntry,
  ChampionRankingMode,
  ChampionRankingPosition,
  ChampionRankingRegion,
  ChampionRankingRequest,
  ChampionRankingResult,
  ChampionSummary,
} from '../../shared/api';
import { getHeroByKey } from '../lcu/heroData';

const OP_GG_BASE_URL = 'https://lol-api-champion.op.gg/api';
const HEXTECH_RANKING_URL = 'https://yuumi.s3.bitiful.net/datas/blitz/hex/champions.json';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const CACHE_TTL_MS = 5 * 60_000;

const VALID_MODES = new Set<ChampionRankingMode>(['ranked', 'aram', 'arena', 'hextech']);
const VALID_REGIONS = new Set<ChampionRankingRegion>(['global', 'na', 'kr', 'jp', 'tw']);
const VALID_POSITIONS = new Set<ChampionRankingPosition>(['ALL', 'TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT']);

interface OpggTierData {
  tier?: number;
  rank?: number;
  rank_prev_patch?: number;
}

interface OpggStats {
  play?: number;
  win?: number;
  win_rate?: number;
  pick_rate?: number;
  ban_rate?: number | null;
  kda?: number;
  kills?: number;
  assists?: number;
  deaths?: number;
  first_place?: number;
  tier?: number;
  rank?: number;
  tier_data?: OpggTierData;
}

interface OpggCounter {
  champion_id?: number;
  play?: number;
  win?: number;
}

interface OpggPosition {
  name?: string;
  stats?: OpggStats;
  counters?: OpggCounter[];
}

interface OpggChampion {
  id?: number;
  average_stats?: OpggStats | null;
  positions?: OpggPosition[] | null;
}

interface OpggResponse {
  data?: OpggChampion[];
  meta?: {
    version?: string;
    cached_at?: string;
    analyzed_at?: string;
    match_count?: number;
  };
}

interface HextechChampion {
  champion?: string;
  patch?: string;
  date?: string;
  data?: {
    tier?: string;
    num_games?: string;
    win_rate?: string;
    pick_rate?: string;
  };
}

interface CacheEntry {
  expiresAt: number;
  result: ChampionRankingResult;
}

const cache = new Map<string, CacheEntry>();

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rate(value: unknown): number {
  return Math.max(0, finiteNumber(value) * 100);
}

function championSummary(id: number): ChampionSummary {
  const hero = getHeroByKey(id);
  if (hero) return hero;
  return {
    id,
    alias: '',
    name: `英雄 ${id}`,
    title: '',
    avatar: '',
    tags: [],
  };
}

function normalizeRequest(request: ChampionRankingRequest): Required<Omit<ChampionRankingRequest, 'refresh'>> & { refresh: boolean } {
  const mode = VALID_MODES.has(request?.mode) ? request.mode : 'ranked';
  const region = request?.region && VALID_REGIONS.has(request.region) ? request.region : 'global';
  const position = request?.position && VALID_POSITIONS.has(request.position) ? request.position : 'ALL';
  const tier = typeof request?.tier === 'string' && /^[a-z_]+$/i.test(request.tier)
    ? request.tier
    : 'all';
  return { mode, region, position, tier, refresh: Boolean(request?.refresh) };
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'lolhelp/1.0',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
      throw new Error('排行数据超过大小限制');
    }
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeCounters(counters: OpggCounter[] | null | undefined): ChampionCounterSummary[] {
  return (counters ?? []).slice(0, 3).flatMap((counter) => {
    const championId = finiteNumber(counter.champion_id);
    const games = finiteNumber(counter.play);
    if (!championId || !games) return [];
    return [{
      champion: championSummary(championId),
      games,
      winRate: (finiteNumber(counter.win) / games) * 100,
    }];
  });
}

function statsRank(stats: OpggStats): number {
  return finiteNumber(stats.tier_data?.rank ?? stats.rank, Number.MAX_SAFE_INTEGER);
}

export function normalizeOpggRanking(
  payload: OpggResponse,
  mode: Exclude<ChampionRankingMode, 'hextech'>,
  position: ChampionRankingPosition,
): ChampionRankingEntry[] {
  const entries = (payload.data ?? []).flatMap((row): ChampionRankingEntry[] => {
    const championId = finiteNumber(row.id);
    if (!championId || !row.average_stats) return [];

    const matchingPosition = position === 'ALL'
      ? null
      : (row.positions ?? []).find((candidate) => candidate.name === position) ?? null;
    if (position !== 'ALL' && !matchingPosition?.stats) return [];

    const stats = matchingPosition?.stats ?? row.average_stats;
    const dominantPosition = matchingPosition ?? row.positions?.[0] ?? null;
    const games = finiteNumber(stats.play);
    const deaths = finiteNumber(stats.deaths);
    const calculatedKda = deaths > 0
      ? (finiteNumber(stats.kills) + finiteNumber(stats.assists)) / deaths
      : null;
    const previousRank = finiteNumber(stats.tier_data?.rank_prev_patch);

    return [{
      champion: championSummary(championId),
      rank: statsRank(stats),
      previousRank: previousRank > 0 ? previousRank : null,
      tier: finiteNumber(stats.tier_data?.tier ?? stats.tier, 5),
      winRate: stats.win_rate !== undefined
        ? rate(stats.win_rate)
        : games > 0 ? (finiteNumber(stats.win) / games) * 100 : 0,
      pickRate: rate(stats.pick_rate),
      banRate: stats.ban_rate === null || stats.ban_rate === undefined ? null : rate(stats.ban_rate),
      kda: stats.kda !== undefined ? finiteNumber(stats.kda) : calculatedKda,
      games,
      firstPlaceRate: mode === 'arena' && games > 0
        ? (finiteNumber(stats.first_place) / games) * 100
        : null,
      counters: normalizeCounters(dominantPosition?.counters),
    }];
  });

  return entries.sort((a, b) => a.rank - b.rank);
}

export function normalizeHextechRanking(payload: HextechChampion[]): ChampionRankingEntry[] {
  const entries = payload.flatMap((row): ChampionRankingEntry[] => {
    const championId = finiteNumber(row.champion);
    if (!championId || !row.data) return [];
    return [{
      champion: championSummary(championId),
      rank: 0,
      previousRank: null,
      tier: finiteNumber(row.data.tier, 5),
      winRate: rate(row.data.win_rate),
      pickRate: rate(row.data.pick_rate),
      banRate: null,
      kda: null,
      games: finiteNumber(row.data.num_games),
      firstPlaceRate: null,
      counters: [],
    }];
  });

  entries.sort((a, b) => a.tier - b.tier || b.winRate - a.winRate || b.games - a.games);
  return entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function opggUrl(mode: Exclude<ChampionRankingMode, 'hextech'>, region: ChampionRankingRegion, tier: string): string {
  const url = new URL(`${OP_GG_BASE_URL}/${region}/champions/${mode}`);
  if (mode !== 'arena') url.searchParams.set('tier', tier);
  return url.toString();
}

async function loadRanking(request: ReturnType<typeof normalizeRequest>): Promise<ChampionRankingResult> {
  if (request.mode === 'hextech') {
    const payload = await fetchJson<HextechChampion[]>(`${HEXTECH_RANKING_URL}?t=${Date.now()}`);
    const first = payload[0];
    return {
      entries: normalizeHextechRanking(payload),
      meta: {
        mode: request.mode,
        version: first?.patch ?? '',
        analyzedAt: first?.date ?? '',
        matchCount: null,
        source: 'Yuumi',
      },
    };
  }

  const payload = await fetchJson<OpggResponse>(opggUrl(request.mode, request.region, request.tier));
  return {
    entries: normalizeOpggRanking(payload, request.mode, request.mode === 'ranked' ? request.position : 'ALL'),
    meta: {
      mode: request.mode,
      version: payload.meta?.version ?? '',
      analyzedAt: payload.meta?.analyzed_at ?? payload.meta?.cached_at ?? '',
      matchCount: finiteNumber(payload.meta?.match_count) || null,
      source: 'OP.GG',
    },
  };
}

export async function getChampionRanking(rawRequest: ChampionRankingRequest): Promise<ChampionRankingResult> {
  const request = normalizeRequest(rawRequest);
  const key = `${request.mode}:${request.region}:${request.tier}:${request.position}`;
  const cached = cache.get(key);
  if (!request.refresh && cached && cached.expiresAt > Date.now()) return cached.result;

  try {
    const result = await loadRanking(request);
    cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (error) {
    if (cached) return { ...cached.result, error: '刷新失败，当前显示上一次的数据' };
    return {
      entries: [],
      meta: {
        mode: request.mode,
        version: '',
        analyzedAt: '',
        matchCount: null,
        source: request.mode === 'hextech' ? 'Yuumi' : 'OP.GG',
      },
      error: error instanceof Error ? error.message : '英雄排行获取失败',
    };
  }
}
