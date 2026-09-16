import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerRankSummary } from '../../shared/api';
import { LivePlayerStore, EMPTY_PLAYER_STATS, type PlayerIdentity } from './liveStore';

function identity(puuid: string): PlayerIdentity {
  return {
    puuid,
    summonerId: 1,
    riotId: `${puuid}#0001`,
    gameName: puuid,
    tagLine: '0001',
    summonerLevel: 100,
    profileIconId: 1,
  };
}

describe('LivePlayerStore', () => {
  afterEach(() => vi.useRealTimers());

  it('按 puuid 存取身份与战绩分片', () => {
    const store = new LivePlayerStore();
    store.setIdentity('a', identity('a'));
    store.setMatchHistory('a', { kda: 3, winRate: 60, history: [] });

    expect(store.getIdentity('a')?.riotId).toBe('a#0001');
    expect(store.getMatchHistory('a')?.kda).toBe(3);
  });

  it('retain 只清理不在名单里的玩家', () => {
    const store = new LivePlayerStore();
    store.setIdentity('a', identity('a'));
    store.setIdentity('b', identity('b'));
    store.setMatchHistory('a', { ...EMPTY_PLAYER_STATS, kda: 5 });
    store.setMatchHistory('b', { ...EMPTY_PLAYER_STATS, kda: 9 });

    const removed = store.retain(['a']);

    expect(removed).toEqual(['b']);
    expect(store.getIdentity('a')).not.toBeNull();
    expect(store.getMatchHistory('a')?.kda).toBe(5);
  });

  it('retain 保留的玩家数据不受影响（换人不重拉的基础）', () => {
    const store = new LivePlayerStore();
    store.setMatchHistory('keep', { ...EMPTY_PLAYER_STATS, kda: 7 });

    store.retain(['keep']);
    // 仍在名单里 → 分片保留，后续读取应命中缓存而不是空值。
    expect(store.getMatchHistory('keep')?.kda).toBe(7);
  });

  it('clearSession 重置会话级加载态', () => {
    const store = new LivePlayerStore();
    store.setLoadState('a:history', 'loading');
    store.setLoadState('a:rank', 'failed');

    store.clearSession();

    // 加载态是会话级的，不进 LRU —— 新一局必须重新判定。
    expect(store.getLoadState('a:history')).toBe('idle');
    expect(store.getLoadState('a:rank')).toBe('idle');
  });

  it('加载态可读写', () => {
    const store = new LivePlayerStore();
    expect(store.getLoadState('a:history')).toBe('idle');

    store.setLoadState('a:history', 'loading');
    expect(store.getLoadState('a:history')).toBe('loading');
  });

  it('clearSession 后仍能命中跨会话 LRU 缓存（Akari 的复用来源）', () => {
    const store = new LivePlayerStore();
    store.setMatchHistory('recurring', { ...EMPTY_PLAYER_STATS, kda: 4 });

    // clearSession 只清当前会话分片，LRU 保留 → 下一局遇到同一玩家可直接命中。
    store.clearSession();

    expect(store.getMatchHistory('recurring')?.kda).toBe(4);
  });

  it('跨会话缓存能区分“未定级”和“尚未查询”', () => {
    const store = new LivePlayerStore();
    store.setRankedStats('unranked', null);
    store.clearSession();

    expect(store.getRankedStats('unranked')).toBeNull();
    expect(store.getRankedStats('unknown')).toBeUndefined();
  });

  it('段位列表分片与首选段位分片各自独立', () => {
    const store = new LivePlayerStore();
    const solo: PlayerRankSummary = {
      queueType: 'RANKED_SOLO_5x5',
      queueName: '单双',
      tier: 'PLATINUM',
      division: 'II',
      leaguePoints: 57,
      wins: 40,
      losses: 30,
      displayText: '单双 铂金 II 57',
    };
    const flex: PlayerRankSummary = { ...solo, queueType: 'RANKED_FLEX_SR', queueName: '灵活' };

    store.setRankedList('dual', [solo, flex]);
    store.setRankedStats('dual', solo);

    expect(store.getRankedList('dual')).toEqual([solo, flex]);
    expect(store.getRankedStats('dual')).toEqual(solo);

    // 换人时列表分片也要跟着清，避免下一局读到上一局的双段位行。
    store.retain([]);
    expect(store.getRankedList('dual')).toBeUndefined();
  });

  it('短时战绩缓存过期后会重新查询', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T00:00:00Z'));
    const store = new LivePlayerStore();
    store.setMatchHistory('stale', { ...EMPTY_PLAYER_STATS, kda: 8 });
    store.clearSession();

    vi.advanceTimersByTime(2 * 60 * 1000 + 1);

    expect(store.getMatchHistory('stale')).toBeNull();
  });
});
