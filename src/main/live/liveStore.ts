// 核心思路：数据按 puuid 存，而不是每次整体重算。
// - 玩家离开名单 → 只删他那条，其他人不动
// - 玩家重新入场 → 命中缓存直接返回，不发请求
// - 前端可以按 puuid 拿到"某个字段是否还在加载"，实现卡片逐个补齐
//
// 缓存分两层：
// - 内存分片（summoner / rankedStats / matchHistory）：本次对局内复用
// - LRU（跨对局）：身份/段位可以较长复用；战绩只做短时复用，避免漏掉刚结束的比赛。

import type { LiveMatchPerformanceStats, PlayerRankSummary } from '../../shared/api';

export interface PlayerStatsSummary {
  kda: number;
  winRate: number;
  history: PlayerHistoryEntry[];
}

export interface PlayerHistoryEntry {
  gameId?: number;
  teamId?: number;
  championId: number;
  championName: string;
  championAlias: string;
  queueName: string;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  timeStr: string;
  performance?: LiveMatchPerformanceStats;
}

export interface PlayerIdentity {
  puuid: string;
  summonerId: number;
  riotId: string;
  gameName: string;
  tagLine: string;
  summonerLevel: number;
  profileIconId: number;
  privacy?: string;
}

export type LoadState = 'idle' | 'loading' | 'loaded' | 'failed';

export const EMPTY_PLAYER_STATS: PlayerStatsSummary = {
  kda: 0,
  winRate: 0,
  history: [],
};

const PROFILE_CACHE_TTL_MS = 30 * 60 * 1000;
const HISTORY_CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_MAX_ENTRIES = 400;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// 极简 LRU：Map 的插入顺序即访问顺序，命中时重新 set 一次即可提升热度。
class LruCache<T> {
  private readonly _map = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly _maxEntries: number,
    private readonly _ttlMs: number,
  ) {}

  get(key: string): T | undefined {
    const entry = this._map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this._map.delete(key);
      return undefined;
    }
    // 重新插入以刷新 LRU 顺序。
    this._map.delete(key);
    this._map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this._map.has(key)) this._map.delete(key);
    this._map.set(key, { value, expiresAt: Date.now() + this._ttlMs });

    while (this._map.size > this._maxEntries) {
      const oldest = this._map.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this._map.delete(oldest);
    }
  }

  delete(key: string): void {
    this._map.delete(key);
  }

  clear(): void {
    this._map.clear();
  }
}

// 分片状态：键是 puuid，值是那一项数据。加载态单独一张表，便于前端渲染骨架。
export class LivePlayerStore {
  private readonly _identity = new Map<string, PlayerIdentity>();
  private readonly _rankedStats = new Map<string, PlayerRankSummary | null>();
  private readonly _rankedList = new Map<string, PlayerRankSummary[]>();
  private readonly _matchHistory = new Map<string, PlayerStatsSummary>();
  private readonly _loadState = new Map<string, LoadState>();

  private readonly _identityLru = new LruCache<PlayerIdentity>(
    CACHE_MAX_ENTRIES,
    PROFILE_CACHE_TTL_MS,
  );
  private readonly _rankedLru = new LruCache<PlayerRankSummary | null>(
    CACHE_MAX_ENTRIES,
    PROFILE_CACHE_TTL_MS,
  );
  private readonly _rankedListLru = new LruCache<PlayerRankSummary[]>(
    CACHE_MAX_ENTRIES,
    PROFILE_CACHE_TTL_MS,
  );
  private readonly _historyLru = new LruCache<PlayerStatsSummary>(
    CACHE_MAX_ENTRIES,
    HISTORY_CACHE_TTL_MS,
  );

  getIdentity(puuid: string): PlayerIdentity | null {
    return this._identity.get(puuid) ?? this._identityLru.get(puuid) ?? null;
  }

  setIdentity(puuid: string, identity: PlayerIdentity): void {
    this._identity.set(puuid, identity);
    this._identityLru.set(puuid, identity);
  }

  getRankedStats(puuid: string): PlayerRankSummary | null | undefined {
    if (this._rankedStats.has(puuid)) return this._rankedStats.get(puuid);
    return this._rankedLru.get(puuid);
  }

  setRankedStats(puuid: string, rank: PlayerRankSummary | null): void {
    this._rankedStats.set(puuid, rank);
    this._rankedLru.set(puuid, rank);
  }

  // 全部队列段位（单双排在前）。与 setRankedStats 一起写，
  // 前者供卡片双段位行使用，后者保持"首选段位"的既有语义。
  getRankedList(puuid: string): PlayerRankSummary[] | undefined {
    if (this._rankedList.has(puuid)) return this._rankedList.get(puuid);
    return this._rankedListLru.get(puuid);
  }

  setRankedList(puuid: string, ranks: PlayerRankSummary[]): void {
    this._rankedList.set(puuid, ranks);
    this._rankedListLru.set(puuid, ranks);
  }

  getMatchHistory(puuid: string): PlayerStatsSummary | null {
    return this._matchHistory.get(puuid) ?? this._historyLru.get(puuid) ?? null;
  }

  setMatchHistory(puuid: string, stats: PlayerStatsSummary): void {
    this._matchHistory.set(puuid, stats);
    this._historyLru.set(puuid, stats);
  }

  getLoadState(key: string): LoadState {
    return this._loadState.get(key) ?? 'idle';
  }

  setLoadState(key: string, state: LoadState): void {
    this._loadState.set(key, state);
  }

  // 名单变化时调用：只清理已经不在场上的玩家，其余分片原地保留。
  retain(puuids: string[]): string[] {
    const keep = new Set(puuids);
    const removed: string[] = [];

    for (const puuid of [...this._identity.keys()]) {
      if (keep.has(puuid)) continue;
      this._identity.delete(puuid);
      removed.push(puuid);
    }
    for (const puuid of [...this._rankedStats.keys()]) {
      if (!keep.has(puuid)) this._rankedStats.delete(puuid);
    }
    for (const puuid of [...this._rankedList.keys()]) {
      if (!keep.has(puuid)) {
        this._rankedList.delete(puuid);
        // 同一会话换人时不能让刚离开的玩家从 LRU 回灌到当前名单。
        // 新会话的 clearSession 不删 LRU，跨局复用仍然保留。
        this._rankedListLru.delete(puuid);
      }
    }
    for (const puuid of [...this._matchHistory.keys()]) {
      if (!keep.has(puuid)) this._matchHistory.delete(puuid);
    }
    for (const key of [...this._loadState.keys()]) {
      const puuid = key.split(':')[0];
      if (!keep.has(puuid)) this._loadState.delete(key);
    }

    return removed;
  }

  clearSession(): void {
    this._identity.clear();
    this._rankedStats.clear();
    this._rankedList.clear();
    this._matchHistory.clear();
    this._loadState.clear();
  }
}
