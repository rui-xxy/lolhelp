import { describe, expect, it } from 'vitest';
import { normalizeChampionDetail, normalizeHextechRanking, normalizeOpggRanking } from './championRanking';

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
    expect(entries[0].mainPosition).toBe('TOP');
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

  it('turns the champion detail payload into builds, trend and reliable matchups', () => {
    const detail = normalizeChampionDetail({
      data: {
        core_items: [{ ids: [6631, 3046, 3033], play: 200, win: 110, pick_rate: 0.22 }],
        boots: [{ ids: [223006], play: 100, win: 50, pick_rate: 0.6 }],
        runes: [{
          primary_page_id: 8000,
          primary_rune_ids: [8010, 9111, 9105, 8299],
          secondary_page_id: 8200,
          secondary_rune_ids: [8224, 8234],
          play: 500,
          win: 260,
          pick_rate: 0.35,
        }],
        skill_masteries: [{ ids: ['E', 'Q', 'W'], play: 400, win: 220, pick_rate: 0.9, builds: [{ order: ['E', 'Q', 'W', 'E'] }] }],
        trends: {
          win: [{ version: '16.21', rate: 0.51, rank: 17 }, { version: '16.20', rate: 0.5, rank: 19 }],
          pick: [{ version: '16.21', rate: 0.06 }],
        },
        game_lengths: [{ game_length: 25, rate: 0.52 }],
        counters: [
          { champion_id: 17, play: 2000, win: 940 },
          { champion_id: 24, play: 3000, win: 1700 },
          { champion_id: 1, play: 10, win: 0 },
        ],
      },
    }, { championId: 86, mode: 'ranked', position: 'TOP' });

    expect(detail.core[0].items.map((item) => item.id)).toEqual([6631, 3046, 3033]);
    expect(detail.core[0].winRate).toBeCloseTo(55);
    // 斗魂竞技场的 22 前缀装备按原装备展示。
    expect(detail.boots[0].items[0].id).toBe(3006);
    expect(detail.runes[0]).toMatchObject({ keystone: { id: 8010 }, primaryStyle: { id: 8000, name: '精密' } });
    expect(detail.runes[0].primary.map((rune) => rune.id)).toEqual([9111, 9105, 8299]);
    expect(detail.skills[0]).toMatchObject({ priority: ['E', 'Q', 'W'], order: ['E', 'Q', 'W', 'E'] });
    expect(detail.trend.map((point) => point.version)).toEqual(['16.20', '16.21']);
    expect(detail.trend[1]).toMatchObject({ winRate: 51, pickRate: 6, rank: 17 });
    expect(detail.gameLengths).toEqual([{ minute: 25, winRate: 52 }]);
    // 样本不足 30 场的对位被丢掉。
    expect(detail.toughMatchups.map((matchup) => matchup.champion.id)).toEqual([17, 24]);
    expect(detail.easyMatchups[0].champion.id).toBe(24);
  });
});
