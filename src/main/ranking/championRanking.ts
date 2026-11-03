import type {
  ChampionCounterSummary,
  ChampionDetail,
  ChampionDetailBuild,
  ChampionDetailItem,
  ChampionDetailRequest,
  ChampionDetailResult,
  ChampionDetailRunePage,
  ChampionRankingEntry,
  ChampionRankingMode,
  ChampionRankingPosition,
  ChampionRankingRegion,
  ChampionRankingRequest,
  ChampionRankingResult,
  ChampionSummary,
} from '../../shared/api';
import { getHeroByKey, getItemById, getRuneById, getSummonerSpellById } from '../lcu/heroData';

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
  stats?: OpggStats & { role_rate?: number };
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

function positionName(value: string | undefined): ChampionRankingPosition | null {
  return value && VALID_POSITIONS.has(value as ChampionRankingPosition) && value !== 'ALL'
    ? value as ChampionRankingPosition
    : null;
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
      roleRate: matchingPosition?.stats?.role_rate !== undefined ? rate(matchingPosition.stats.role_rate) : null,
      mainPosition: positionName(dominantPosition?.name),
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
      roleRate: null,
      mainPosition: null,
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

// ---------------------------------------------------------------------------
// 英雄详情（OP.GG 单英雄接口）：出装、符文、加点、版本走势、时长胜率、对位
// ---------------------------------------------------------------------------

interface OpggBuildRow {
  ids?: Array<number | string>;
  play?: number;
  win?: number;
  pick_rate?: number;
}

interface OpggRuneRow extends OpggBuildRow {
  primary_page_id?: number;
  primary_rune_ids?: number[];
  secondary_page_id?: number;
  secondary_rune_ids?: number[];
}

interface OpggSkillMastery extends OpggBuildRow {
  builds?: Array<OpggBuildRow & { order?: string[] }>;
}

interface OpggTrendRow {
  version?: string;
  rate?: number;
  rank?: number;
}

interface OpggDetailResponse {
  data?: {
    summoner_spells?: OpggBuildRow[];
    starter_items?: OpggBuildRow[];
    boots?: OpggBuildRow[];
    core_items?: OpggBuildRow[];
    runes?: OpggRuneRow[];
    skill_masteries?: OpggSkillMastery[];
    trends?: { win?: OpggTrendRow[]; pick?: OpggTrendRow[]; ban?: OpggTrendRow[] };
    game_lengths?: Array<{ game_length?: number; rate?: number }>;
    counters?: OpggCounter[];
  };
}

// 符文系的图标不在 datas.json 里，五系固定，直接写死。
const RUNE_STYLES: Record<number, { name: string; icon: string }> = {
  8000: { name: '精密', icon: 'perk-images/Styles/7201_Precision.png' },
  8100: { name: '主宰', icon: 'perk-images/Styles/7200_Domination.png' },
  8200: { name: '巫术', icon: 'perk-images/Styles/7202_Sorcery.png' },
  8300: { name: '启迪', icon: 'perk-images/Styles/7203_Whimsy.png' },
  8400: { name: '坚决', icon: 'perk-images/Styles/7204_Resolve.png' },
};

const OPGG_POSITION_PATHS: Partial<Record<ChampionRankingPosition, string>> = {
  TOP: 'top',
  JUNGLE: 'jungle',
  MID: 'mid',
  ADC: 'adc',
  SUPPORT: 'support',
};

const detailCache = new Map<string, { expiresAt: number; result: ChampionDetailResult }>();

function itemSummary(rawId: number | string): ChampionDetailItem | null {
  const numeric = finiteNumber(rawId);
  if (!numeric) return null;
  // 斗魂竞技场的装备 ID 带 22 前缀（223031 = 3031），名字和图标按原装备取。
  const id = numeric > 220000 && numeric < 230000 ? numeric - 220000 : numeric;
  const item = getItemById(id);
  return { id, name: item?.name || `装备 ${id}`, icon: item?.icon ?? '' };
}

function spellSummary(rawId: number | string): ChampionDetailItem | null {
  const id = finiteNumber(rawId);
  const spell = id ? getSummonerSpellById(id) : null;
  return spell ? { id, name: spell.name, icon: spell.icon } : null;
}

function runeSummary(rawId: number | undefined): ChampionDetailItem | null {
  const id = finiteNumber(rawId);
  if (!id) return null;
  const style = RUNE_STYLES[id];
  if (style) return { id, name: style.name, icon: `https://ddragon.leagueoflegends.com/cdn/img/${style.icon}` };
  const rune = getRuneById(id);
  return rune ? { id, name: rune.name, icon: rune.icon } : null;
}

function buildRows(
  rows: OpggBuildRow[] | undefined,
  resolve: (id: number | string) => ChampionDetailItem | null,
  limit: number,
): ChampionDetailBuild[] {
  return (rows ?? []).slice(0, limit).flatMap((row) => {
    const items = (row.ids ?? []).map(resolve).filter((item): item is ChampionDetailItem => item !== null);
    const games = finiteNumber(row.play);
    if (!items.length || !games) return [];
    return [{
      items,
      games,
      winRate: (finiteNumber(row.win) / games) * 100,
      pickRate: rate(row.pick_rate),
    }];
  });
}

export function normalizeChampionDetail(
  payload: OpggDetailResponse,
  request: { championId: number; mode: ChampionDetailRequest['mode']; position: ChampionRankingPosition },
): ChampionDetail {
  const data = payload.data ?? {};
  const runes: ChampionDetailRunePage[] = (data.runes ?? []).slice(0, 3).flatMap((row) => {
    const games = finiteNumber(row.play);
    const primary = (row.primary_rune_ids ?? []).map(runeSummary).filter((rune): rune is ChampionDetailItem => rune !== null);
    if (!games || !primary.length) return [];
    return [{
      keystone: primary[0] ?? null,
      primary: primary.slice(1),
      secondary: (row.secondary_rune_ids ?? []).map(runeSummary).filter((rune): rune is ChampionDetailItem => rune !== null),
      primaryStyle: runeSummary(row.primary_page_id),
      secondaryStyle: runeSummary(row.secondary_page_id),
      games,
      winRate: (finiteNumber(row.win) / games) * 100,
      pickRate: rate(row.pick_rate),
    }];
  });

  const skills = (data.skill_masteries ?? []).slice(0, 3).flatMap((mastery) => {
    const games = finiteNumber(mastery.play);
    const priority = (mastery.ids ?? []).map(String).filter((key) => /^[QWER]$/.test(key));
    if (!games || priority.length < 3) return [];
    const order = (mastery.builds?.[0]?.order ?? []).map(String).filter((key) => /^[QWER]$/.test(key));
    return [{
      priority,
      order,
      winRate: (finiteNumber(mastery.win) / games) * 100,
      pickRate: rate(mastery.pick_rate),
    }];
  });

  const pickByVersion = new Map((data.trends?.pick ?? []).map((row) => [row.version ?? '', rate(row.rate)]));
  const banByVersion = new Map((data.trends?.ban ?? []).map((row) => [row.version ?? '', rate(row.rate)]));
  const trend = (data.trends?.win ?? []).slice(0, 10).flatMap((row) => {
    if (!row.version) return [];
    return [{
      version: row.version,
      winRate: rate(row.rate),
      pickRate: pickByVersion.get(row.version) ?? null,
      banRate: banByVersion.get(row.version) ?? null,
      rank: row.rank ? finiteNumber(row.rank) : null,
    }];
  }).reverse();

  const matchups = (data.counters ?? []).flatMap((counter) => {
    const championId = finiteNumber(counter.champion_id);
    const games = finiteNumber(counter.play);
    if (!championId || games < 30) return [];
    return [{ champion: championSummary(championId), games, winRate: (finiteNumber(counter.win) / games) * 100 }];
  });
  // 样本太少的对位不可信：只看样本量排在前面的那一批。
  const reliable = matchups.sort((a, b) => b.games - a.games).slice(0, 30);

  return {
    championId: request.championId,
    mode: request.mode,
    position: request.position,
    spells: buildRows(data.summoner_spells, spellSummary, 2),
    starters: buildRows(data.starter_items, itemSummary, 2),
    boots: buildRows(data.boots, itemSummary, 3),
    core: buildRows(data.core_items, itemSummary, 4),
    runes,
    skills,
    trend,
    gameLengths: (data.game_lengths ?? []).flatMap((row) => (
      row.rate === undefined ? [] : [{ minute: finiteNumber(row.game_length), winRate: rate(row.rate) }]
    )),
    toughMatchups: [...reliable].sort((a, b) => a.winRate - b.winRate).slice(0, 4),
    easyMatchups: [...reliable].sort((a, b) => b.winRate - a.winRate).slice(0, 4),
  };
}

export async function getChampionDetail(rawRequest: ChampionDetailRequest): Promise<ChampionDetailResult> {
  const championId = Math.trunc(finiteNumber(rawRequest?.championId));
  const mode = rawRequest?.mode === 'aram' || rawRequest?.mode === 'arena' ? rawRequest.mode : 'ranked';
  const region = rawRequest?.region && VALID_REGIONS.has(rawRequest.region) ? rawRequest.region : 'global';
  const tier = typeof rawRequest?.tier === 'string' && /^[a-z_]+$/i.test(rawRequest.tier) ? rawRequest.tier : 'all';
  const requested = rawRequest?.position && VALID_POSITIONS.has(rawRequest.position) ? rawRequest.position : 'TOP';
  const position: ChampionRankingPosition = mode === 'ranked' && requested !== 'ALL' ? requested : mode === 'ranked' ? 'TOP' : 'ALL';
  if (championId <= 0 || championId > 100_000) return { detail: null, error: '英雄编号无效' };

  const key = `${mode}:${region}:${tier}:${position}:${championId}`;
  const cached = detailCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const path = mode === 'ranked'
    ? `ranked/${championId}/${OPGG_POSITION_PATHS[position] ?? 'top'}`
    : mode === 'aram' ? `aram/${championId}/none` : `arena/${championId}`;
  const url = new URL(`${OP_GG_BASE_URL}/${region}/champions/${path}`);
  if (mode !== 'arena') url.searchParams.set('tier', tier);

  try {
    const payload = await fetchJson<OpggDetailResponse>(url.toString());
    const result = { detail: normalizeChampionDetail(payload, { championId, mode, position }) };
    detailCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (error) {
    if (cached) return { ...cached.result, error: '刷新失败，当前显示上一次的数据' };
    return { detail: null, error: error instanceof Error ? error.message : '英雄详情获取失败' };
  }
}
