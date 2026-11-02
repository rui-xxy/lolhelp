import { describe, expect, it } from 'vitest';
import type { MatchParticipantSummary } from '../../../shared/api';
import { buildDetailContext, buildDetailGroups, buildDetailSections, formatDetailValue, type DetailKind } from './detailedStatsModel';

function player(index: number, teamId: number, rawStats: Record<string, number | string | boolean> = {}): MatchParticipantSummary {
  return {
    puuid: `p${index}`,
    riotId: `玩家${index}#1`,
    gameName: `玩家${index}`,
    tagLine: '1',
    summonerName: '',
    profileIconId: 0,
    profileIconUrl: '',
    teamId,
    teamPosition: ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'][index % 5],
    championId: 1,
    championName: '英雄',
    championAvatar: '',
    champLevel: 15,
    kills: index,
    deaths: 2,
    assists: 3,
    kda: 1,
    win: teamId === 100,
    damage: 1000 * (index + 1),
    cs: 100,
    gold: 10000,
    items: [],
    spells: [],
    primaryRune: null,
    secondaryRune: null,
    runes: [],
    augments: [],
    stats: { totalDamageTaken: 5000, wardsPlaced: 0 } as unknown as MatchParticipantSummary['stats'],
    rawStats,
  };
}

const format = (kind: DetailKind, value: number) => formatDetailValue({ key: 'k', label: 'l', kind, read: () => null }, value);

describe('detailed stats model', () => {
  const players = Array.from({ length: 10 }, (_, index) => player(
    index,
    index < 5 ? 100 : 200,
    index === 0 ? { soloKills: 2, mysteryKey: 5, perfectGame: true } : { soloKills: 0 },
  ));
  const groups = buildDetailGroups(players);
  const ctx = buildDetailContext(groups, 1800);
  const sections = buildDetailSections(players);
  const metric = (key: string) => sections.flatMap((section) => [...section.core, ...section.more]).find((item) => item.key === key);

  it('splits a normal game into blue and red teams', () => {
    expect(groups.map((group) => group.label)).toEqual(['蓝方', '红方']);
    expect(groups[0].win).toBe(true);
  });

  it('reads the game length in seconds or milliseconds', () => {
    expect(ctx.minutes).toBe(30);
    expect(buildDetailContext(groups, 1_800_000).minutes).toBe(30);
  });

  it('derives kill participation from the team total', () => {
    expect(metric('killParticipation')?.read(players[4], ctx)).toBeCloseTo(7 / 10);
  });

  it('only lists raw fields that have a readable label', () => {
    expect(metric('mysteryKey')).toBe(undefined);
    expect(metric('perfectGame')?.label).toBe('完美对局');
  });

  it('treats a missing field as absent instead of zero', () => {
    expect(metric('riftHeraldTakedowns')?.read(players[1], ctx)).toBe(null);
    expect(metric('wardsPlaced')?.read(players[1], ctx)).toBe(0);
  });

  it('formats values the way players read them', () => {
    expect(format('percent', 0.274)).toBe('27%');
    expect(format('percent', 0.066)).toBe('6.6%');
    expect(format('duration', 125)).toBe('2:05');
    expect(format('multikill', 3)).toBe('三杀');
    expect(format('multikill', 1)).toBe('—');
    expect(format('int', 29229)).toBe('29,229');
  });

  it('groups arena games by duo, best placement first', () => {
    const arena = Array.from({ length: 16 }, (_, index) => player(index, 0, {
      playerSubteamId: Math.floor(index / 2) + 1,
      subteamPlacement: 8 - Math.floor(index / 2),
    }));
    const arenaGroups = buildDetailGroups(arena);
    expect(arenaGroups.length).toBe(8);
    expect(arenaGroups[0].label).toBe('第 1 名');
    expect(arenaGroups[0].win).toBe(true);
  });
});
