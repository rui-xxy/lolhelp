import { describe, expect, it } from 'vitest';
import type { ChampionRankingEntry } from '../../../shared/api';
import {
  championVerdict,
  powerCurve,
  quadrantPosition,
  quadrantDomain,
  rankingAverages,
  rankingInsights,
  sortEntries,
  winBar,
} from './rankingModel';

function entry(id: number, patch: Partial<ChampionRankingEntry>): ChampionRankingEntry {
  return {
    champion: { id, alias: `C${id}`, name: `英雄${id}`, title: '', avatar: '', tags: [] },
    rank: id,
    previousRank: id,
    tier: 2,
    winRate: 50,
    pickRate: 5,
    banRate: 2,
    kda: 2,
    games: 10_000,
    firstPlaceRate: null,
    roleRate: 90,
    mainPosition: 'TOP',
    counters: [],
    ...patch,
  };
}

const board = [
  entry(1, { winRate: 52.5, pickRate: 9, banRate: 6 }),
  entry(2, { winRate: 50.2, pickRate: 7, banRate: 25 }),
  entry(3, { winRate: 49.8, pickRate: 6, previousRank: 12 }),
  entry(4, { winRate: 53.4, pickRate: 1, games: 2_000 }),
  entry(5, { winRate: 47, pickRate: 8 }),
  entry(6, { winRate: 50, pickRate: 4 }),
];

describe('ranking insights', () => {
  it('picks one champion per question without repeats', () => {
    const insights = rankingInsights(board, 'ranked');
    expect(insights.map((insight) => [insight.kind, insight.entry.champion.id])).toEqual([
      ['answer', 1],
      ['rising', 3],
      ['ban', 2],
      ['hidden', 4],
    ]);
  });

  it('uses first place rate instead of bans in arena', () => {
    const arena = board.map((item, index) => ({ ...item, banRate: null, firstPlaceRate: 10 + index }));
    const ban = rankingInsights(arena, 'arena').find((insight) => insight.kind === 'ban');
    expect(ban?.label).toBe('登顶专业户');
    expect(ban?.entry.champion.id).toBe(6);
  });
});

describe('champion verdict', () => {
  const averages = rankingAverages(board);

  it('calls a popular high win rate pick strong', () => {
    const verdict = championVerdict(board[0], averages, 'ranked');
    expect(verdict.tone).toBe('strong');
  });

  it('warns about popular champions that lose', () => {
    const verdict = championVerdict(board[4], averages, 'ranked');
    expect(verdict.tone).toBe('trap');
    expect(verdict.reasons[0]).toContain('低于平均');
  });

  it('mentions bans and rank climbs when they matter', () => {
    expect(championVerdict(board[1], averages, 'ranked').reasons.join()).toContain('禁用率');
    expect(championVerdict(board[2], averages, 'ranked').reasons.join()).toContain('上升 9 名');
  });
});

describe('ranking helpers', () => {
  it('reads early and late power from game length win rates', () => {
    expect(powerCurve([{ minute: 0, winRate: 53 }, { minute: 40, winRate: 48 }]).label).toBe('前期强势');
    expect(powerCurve([{ minute: 0, winRate: 47 }, { minute: 40, winRate: 52 }]).label).toBe('后期发力');
    expect(powerCurve([{ minute: 0, winRate: 50 }, { minute: 40, winRate: 50.5 }]).label).toBe('全程平稳');
  });

  it('draws win bars around the average and caps them', () => {
    expect(winBar(52, 50, 4)).toEqual({ side: 'up', width: 25 });
    expect(winBar(40, 50, 4)).toEqual({ side: 'down', width: 50 });
  });

  it('keeps quadrant points inside the plane', () => {
    const averages = rankingAverages(board);
    const domain = quadrantDomain(board, averages);
    for (const item of board) {
      const point = quadrantPosition(item, domain);
      expect(point.x).toBeGreaterThanOrEqual(2);
      expect(point.x).toBeLessThanOrEqual(98);
      expect(point.y).toBeGreaterThanOrEqual(3);
      expect(point.y).toBeLessThanOrEqual(97);
    }
  });

  it('sorts by the chosen column and falls back to rank', () => {
    expect(sortEntries(board, 'winRate', 'ranked')[0].champion.id).toBe(4);
    expect(sortEntries(board, 'trend', 'ranked')[0].champion.id).toBe(3);
    expect(sortEntries(board, 'rank', 'ranked').map((item) => item.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
