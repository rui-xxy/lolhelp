import { describe, expect, it } from 'vitest';
import type { MatchParticipantSummary, PlayerMatchDetail } from '../../shared/api';
import { analyzeScoutSignals } from './scoutSignals';

const NOW = 1_800_000_000_000;

function player(
  puuid: string,
  championId: number,
  options: Partial<MatchParticipantSummary> = {},
): MatchParticipantSummary {
  return {
    puuid,
    riotId: `${puuid}#1000`,
    gameName: puuid,
    tagLine: '1000',
    summonerName: puuid,
    profileIconId: 1,
    profileIconUrl: '',
    teamId: 100,
    teamPosition: 'MIDDLE',
    championId,
    championName: `英雄${championId}`,
    championAvatar: '',
    champLevel: 18,
    kills: 5,
    deaths: 5,
    assists: 5,
    kda: 2,
    win: false,
    damage: 10_000,
    cs: 100,
    gold: 10_000,
    items: [],
    spells: [],
    primaryRune: null,
    secondaryRune: null,
    runes: [],
    augments: [],
    stats: {} as MatchParticipantSummary['stats'],
    ...options,
  };
}

function match(
  index: number,
  championId: number,
  kda: number,
  damage: number,
  win: boolean,
  targetOptions: Partial<MatchParticipantSummary> = {},
  teammates: MatchParticipantSummary[] = [],
): PlayerMatchDetail {
  const target = player('target', championId, {
    kda,
    damage,
    win,
    ...targetOptions,
  });
  return {
    gameId: index,
    queueId: 420,
    queueName: '单双排位',
    gameCreation: NOW - index * 60_000,
    gameDuration: 1_800,
    championId,
    championName: `英雄${championId}`,
    championAvatar: '',
    champLevel: 18,
    kills: Math.round(kda),
    deaths: 1,
    assists: 0,
    kda,
    win,
    damage,
    cs: 100,
    gold: 10_000,
    items: [],
    spells: [],
    flashKey: null,
    primaryRune: null,
    secondaryRune: null,
    runes: [],
    augments: [],
    stats: {} as PlayerMatchDetail['stats'],
    participants: [target, ...teammates],
  };
}

describe('analyzeScoutSignals', () => {
  it('finds a repeated premade partner without relying on recurring random teammates', () => {
    const duo = player('partner', 2, { premadeId: 'party-a' });
    const matches = [
      match(1, 1, 4, 20_000, true, { premadeId: 'party-a' }, [duo]),
      match(2, 1, 3, 18_000, false, { premadeId: 'party-a' }, [duo]),
      match(3, 1, 2, 15_000, false),
    ];

    expect(analyzeScoutSignals(matches, 'target')?.duo).toMatchObject({
      partnerPuuid: 'partner',
      gamesTogether: 2,
      checkedMatches: 3,
      evidence: 'premade',
      fixed: true,
      partySize: 2,
    });
  });

  it('uses repeated same-team appearances as a cautious fallback when premade ids are absent', () => {
    const recurringMate = player('recurring-partner', 2);
    const matches = [
      match(1, 1, 4, 20_000, true, {}, [recurringMate]),
      match(2, 1, 3, 18_000, false, {}, [recurringMate]),
      match(3, 1, 2, 15_000, false),
      match(4, 1, 2, 15_000, false),
      match(5, 1, 2, 15_000, false),
    ];

    expect(analyzeScoutSignals(matches, 'target')?.duo).toMatchObject({
      partnerPuuid: 'recurring-partner',
      gamesTogether: 2,
      evidence: 'recurring',
      fixed: false,
    });
  });

  it('marks a suspicious shift only when a new champion pool has supporting performance changes', () => {
    const matches = [
      match(1, 10, 9, 32_000, true, { teamPosition: 'JUNGLE' }),
      match(2, 11, 8, 30_000, true, { teamPosition: 'JUNGLE' }),
      match(3, 20, 2, 12_000, false),
      match(4, 20, 2.5, 13_000, false),
      match(5, 21, 1.5, 11_000, false),
    ];

    const shift = analyzeScoutSignals(matches, 'target')?.behaviorShift;
    expect(shift?.confidence).toBe('high');
    expect(shift?.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('英雄池'),
        expect.stringContaining('主要位置'),
        expect.stringContaining('平均 KDA'),
      ]),
    );
  });

  it('does not accuse a player merely for trying different champions', () => {
    const matches = [
      match(1, 10, 2.3, 14_000, false),
      match(2, 11, 2.1, 13_000, true),
      match(3, 20, 2.2, 14_000, false),
      match(4, 20, 2.4, 15_000, true),
      match(5, 21, 2, 13_000, false),
    ];

    expect(analyzeScoutSignals(matches, 'target')?.behaviorShift).toBeUndefined();
  });
});
