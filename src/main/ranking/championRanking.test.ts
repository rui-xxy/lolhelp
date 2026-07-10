import { describe, expect, it } from 'vitest';
import { normalizeHextechRanking, normalizeOpggRanking } from './championRanking';

describe('champion ranking normalization', () => {
  it('uses position stats and keeps ban rate separate from pick rate', () => {
    const entries = normalizeOpggRanking({
      data: [{
        id: 86,
        average_stats: {
          play: 1_000,
          win_rate: 0.51,
          pick_rate: 0.08,
          ban_rate: 0.09,
          tier_data: { tier: 2, rank: 8, rank_prev_patch: 7 },
        },
        positions: [{
          name: 'TOP',
          stats: {
            play: 900,
            win_rate: 0.523,
            pick_rate: 0.101,
            ban_rate: 0.088,
            tier_data: { tier: 1, rank: 1, rank_prev_patch: 3 },
          },
          counters: [{ champion_id: 10, play: 100, win: 45 }],
        }],
      }],
    }, 'ranked', 'TOP');

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      rank: 1,
      previousRank: 3,
      tier: 1,
      games: 900,
    });
    expect(entries[0].winRate).toBeCloseTo(52.3);
    expect(entries[0].pickRate).toBeCloseTo(10.1);
    expect(entries[0].banRate).toBeCloseTo(8.8);
    expect(entries[0].counters[0]).toMatchObject({ games: 100, winRate: 45 });
  });

  it('orders hextech champions by tier and then win rate', () => {
    const entries = normalizeHextechRanking([
      { champion: '86', data: { tier: '2', num_games: '100', win_rate: '0.55', pick_rate: '0.1' } },
      { champion: '10', data: { tier: '1', num_games: '80', win_rate: '0.51', pick_rate: '0.08' } },
      { champion: '23', data: { tier: '1', num_games: '90', win_rate: '0.53', pick_rate: '0.09' } },
    ]);

    expect(entries.map((entry) => entry.champion.id)).toEqual([23, 10, 86]);
    expect(entries.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });
});
