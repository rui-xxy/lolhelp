import { describe, expect, it } from 'vitest';
import type {
  MatchParticipantSummary,
  PlayerMatchDetail,
  ScoutConfig,
  ScoutPlayerEvent,
} from '../../shared/api';
import { runScout } from './scoutEngine';

const NOW = 1_800_000_000_000;

function participant(
  puuid: string,
  riotId: string,
  championId: number,
  kda: number,
): MatchParticipantSummary {
  return {
    puuid,
    riotId,
    gameName: riotId.split('#')[0],
    profileIconId: 10,
    profileIconUrl: `https://example.test/${puuid}.png`,
    championId,
    kda,
    teamDamagePercentage: 0.1,
  } as MatchParticipantSummary;
}

function match(
  targetPuuid: string,
  championId: number,
  kda: number,
  participants: MatchParticipantSummary[],
): PlayerMatchDetail {
  const target = participants.find((player) => player.puuid === targetPuuid);
  return {
    gameId: Math.floor(Math.random() * 100_000),
    queueId: 450,
    queueName: '极地大乱斗',
    gameCreation: NOW - 60_000,
    gameDuration: 1_200,
    championId,
    championName: `英雄${championId}`,
    championAvatar: `https://example.test/champion-${championId}.png`,
    champLevel: 18,
    kills: Math.round(kda),
    deaths: 1,
    assists: 0,
    kda,
    win: true,
    damage: 10_000,
    cs: 20,
    gold: 12_000,
    items: [],
    spells: [],
    flashKey: null,
    primaryRune: null,
    secondaryRune: null,
    runes: [],
    augments: [],
    stats: {},
    participants: target ? participants : [],
  } as unknown as PlayerMatchDetail;
}

describe('scout player progress events', () => {
  it('streams every real candidate through queued, checking and matched states', async () => {
    const seedPlayer = participant('seed-puuid', '种子#0001', 2, 2);
    const candidatePlayer = participant('candidate-puuid', '高手#9527', 1, 20);
    const seedMatch = match('seed-puuid', 2, 2, [seedPlayer, candidatePlayer]);
    const candidateMatch = match('candidate-puuid', 1, 20, [candidatePlayer]);
    const events: ScoutPlayerEvent[] = [];
    const config: ScoutConfig = {
      seedId: '种子#0001',
      championIds: [1],
      kdaThreshold: 10,
      hoursWindow: 1,
      targetCount: 1,
      tag: 'q_450',
      topSeedsPerGame: 0,
    };

    const result = await runScout({
      config,
      now: NOW,
      deps: {
        resolvePuuid: async () => ({ puuid: 'seed-puuid', riotId: '种子#0001' }),
        fetchMatches: async (puuid) =>
          puuid === 'candidate-puuid' ? [candidateMatch] : [seedMatch],
      },
      onProgress: (progress) => {
        if (progress.latestPlayer) events.push(progress.latestPlayer);
      },
    });

    const candidateEvents = events.filter((event) => event.puuid === 'candidate-puuid');
    expect(candidateEvents.map((event) => event.state)).toEqual([
      'queued',
      'checking',
      'matched',
    ]);
    expect(candidateEvents[0]).toMatchObject({
      parentPuuid: 'seed-puuid',
      source: 'candidate',
      depth: 1,
    });
    expect(candidateEvents[2].profile?.riotId).toBe('高手#9527');
    expect(candidateEvents[2].recentChampionId).toBe(1);
    expect(result.hits).toHaveLength(1);
  });
});
