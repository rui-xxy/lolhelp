import { describe, expect, it } from 'vitest';
import type { MatchParticipantSummary, MatchTimeline, MatchTimelineEvent } from '../../../shared/api';
import {
  buildCast,
  buildFacts,
  buildFocusSummary,
  buildGoldSeries,
  buildMoments,
  buildPhases,
  buildStoryEvents,
  leadChanges,
  objectiveLabel,
} from './matchStoryModel';

const players = Array.from({ length: 10 }, (_, index) => ({
  participantId: index + 1,
  puuid: `p${index + 1}`,
  gameName: `玩家${index + 1}`,
  riotId: `玩家${index + 1}#1`,
  teamId: index < 5 ? 100 : 200,
  championName: '英雄',
  win: index < 5,
})) as unknown as MatchParticipantSummary[];
const cast = buildCast(players);

const kill = (seconds: number, killerId: number, victimId: number, assistingParticipantIds: number[] = []): MatchTimelineEvent => ({
  type: 'CHAMPION_KILL', timestamp: seconds * 1000, killerId, victimId, assistingParticipantIds,
});
const timelineOf = (events: Array<MatchTimelineEvent & { killerTeamId?: number }>, gold: Array<[number, number]> = []): MatchTimeline => ({
  frameInterval: 60000,
  frames: [
    { timestamp: 0, events, participantFrames: {} },
    ...gold.map(([minute, diff]) => ({
      timestamp: minute * 60000,
      events: [],
      participantFrames: Object.fromEntries(players.map((player, index) => [String(index + 1), {
        participantId: index + 1, totalGold: 1000 + (index < 5 ? diff / 5 : 0), currentGold: 0, level: 1, xp: 0, minionsKilled: 0, jungleMinionsKilled: 0,
      }])),
    })),
  ],
});

describe('match story', () => {
  it('works out which side gained from each event', () => {
    const events = buildStoryEvents(timelineOf([
      kill(60, 2, 7),
      kill(120, 0, 3),
      { type: 'BUILDING_KILL', timestamp: 180000, killerId: 0, teamId: 200, buildingType: 'TOWER_BUILDING', laneType: 'TOP_LANE' },
      { type: 'ELITE_MONSTER_KILL', timestamp: 240000, killerId: 8, killerTeamId: 200, monsterType: 'DRAGON', monsterSubType: 'FIRE_DRAGON' },
      { type: 'TURRET_PLATE_DESTROYED', timestamp: 250000, teamId: 200 },
    ]), cast);
    expect(events.map((item) => item.side)).toEqual(['blue', 'red', 'blue', 'red']);
  });

  it('groups a fight with the objective taken right after it, and tells who won', () => {
    const events = buildStoryEvents(timelineOf([
      kill(1000, 1, 6), kill(1004, 2, 7), kill(1008, 3, 8, [1]), kill(1011, 9, 4), kill(1015, 4, 9), kill(1020, 5, 10),
      { type: 'ELITE_MONSTER_KILL', timestamp: 1048000, killerId: 2, killerTeamId: 100, monsterType: 'BARON_NASHOR' },
      kill(1300, 6, 1),
    ]), cast);
    const moments = buildMoments(events, cast);
    expect(moments).toHaveLength(2);
    expect(moments[0].type).toBe('teamfight');
    expect(moments[0].kills).toEqual({ blue: 5, red: 1 });
    expect(moments[0].ace).toBe('blue');
    expect(moments[0].title).toBe('蓝方团灭对手，随后蓝方拿下纳什男爵');
    expect(moments[1].type).toBe('pick');
  });

  it('merges a set of void grubs into one line', () => {
    const grub = (seconds: number) => ({ type: 'ELITE_MONSTER_KILL', timestamp: seconds * 1000, killerId: 2, killerTeamId: 100, monsterType: 'HORDE' });
    const moments = buildMoments(buildStoryEvents(timelineOf([grub(340), grub(352), grub(363)]), cast), cast);
    expect(moments).toHaveLength(1);
    expect(moments[0].events).toHaveLength(1);
    expect(objectiveLabel(moments[0].events[0])).toBe(' 3 只虚空巢虫');
  });

  it('builds a gold difference line and counts real lead changes only', () => {
    const series = buildGoldSeries(timelineOf([], [[1, 200], [10, 2500], [15, -400], [20, -3000], [28, 5000]]), cast);
    expect(series.map((point) => point.diff)).toEqual([200, 2500, -400, -3000, 5000]);
    expect(leadChanges(series)).toBe(2);
    expect(buildGoldSeries(timelineOf([]), cast)).toEqual([]);
  });

  it('summarises a player: who killed them and which fights they joined', () => {
    const events = buildStoryEvents(timelineOf([
      kill(200, 6, 1), kill(500, 6, 1), kill(800, 7, 1), kill(900, 1, 8),
      kill(1500, 2, 9), kill(1503, 3, 10), kill(1506, 4, 6),
    ]), cast);
    const moments = buildMoments(events, cast);
    const summary = buildFocusSummary(1, events, moments);
    expect(summary.deaths).toBe(3);
    expect(summary.killedBy[0]).toEqual({ id: 6, count: 2 });
    expect(summary.firstDeath).toBe(200000);
    expect(summary.fights).toEqual({ joined: 0, total: 1 });
    expect(summary.soloKills).toBe(1);
  });

  it('gives every headline fact a time so all of them can be clicked', () => {
    const timeline = timelineOf([
      kill(200, 1, 6),
      { type: 'ELITE_MONSTER_KILL', timestamp: 400000, killerId: 2, killerTeamId: 100, monsterType: 'DRAGON', monsterSubType: 'FIRE_DRAGON' },
      kill(1000, 1, 6), kill(1004, 2, 7), kill(1008, 8, 3),
    ], [[1, 200], [10, 2500], [20, -3000], [28, 5000]]);
    const events = buildStoryEvents(timeline, cast);
    const moments = buildMoments(events, cast);
    const facts = buildFacts(events, moments, buildGoldSeries(timeline, cast), cast);
    expect(facts.map((fact) => fact.key)).toEqual(['first-blood', 'first-dragon', 'blue-lead', 'red-lead', 'swings', 'decisive']);
    expect(facts.every((fact) => Number.isFinite(fact.time))).toBe(true);
    expect(facts.find((fact) => fact.key === 'red-lead')?.value).toBe('+3.0k');
    expect(facts.find((fact) => fact.key === 'swings')?.value).toBe('2 次');
  });

  it('splits the game into laning, mid and late phases with scores', () => {
    const events = buildStoryEvents(timelineOf([kill(100, 1, 6), kill(1000, 6, 1), kill(1600, 2, 7)]), cast);
    const phases = buildPhases(buildMoments(events, cast), events, 1700000);
    expect(phases.map((phase) => phase.label)).toEqual(['对线期', '中期', '后期']);
    expect(phases.map((phase) => phase.kills)).toEqual([{ blue: 1, red: 0 }, { blue: 0, red: 1 }, { blue: 1, red: 0 }]);
  });
});
