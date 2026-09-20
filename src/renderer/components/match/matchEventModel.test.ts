import { describe, expect, it } from 'vitest';
import type { MatchTimelineEvent } from '../../../shared/api';
import { isMultiKillEvent, prepareEventTimeline, multiKillLabel } from './matchEventModel';
const kill = (timestamp: number, killerId = 1, victimId = 6): MatchTimelineEvent => ({ type: 'CHAMPION_KILL', timestamp, killerId, victimId });
const award = (timestamp: number, killerId = 1, length = 2): MatchTimelineEvent => ({ type: 'CHAMPION_SPECIAL_KILL', timestamp, killerId, killType: 'KILL_MULTI', multiKillLength: length });
describe('explicit multi-kill notifications', () => {
  it('joins a separate award without duplicating the kill or losing its damage and assists', () => {
    const source = [{...kill(8000), assistingParticipantIds:[2], victimDamageReceived:[{damage:123}]}, award(8000)];
    const result = prepareEventTimeline(source);
    expect(result).toHaveLength(1); expect(result[0]).toMatchObject({victimId:6,multiKillLength:2,assistingParticipantIds:[2],victimDamageReceived:[{damage:123}]});
    expect(source[0].multiKillLength).toBeUndefined();
  });
  it('handles cross-frame or reversed-order notifications and a small timestamp offset', () => {
    expect(prepareEventTimeline([award(8000), kill(8000)])[0]).toMatchObject({type:'CHAMPION_KILL',multiKillLength:2});
    expect(prepareEventTimeline([kill(8000), award(8001)]).filter(isMultiKillEvent)).toHaveLength(1);
  });
  it('does not double count inline, duplicate, and standalone notifications', () => {
    const result = prepareEventTimeline([{...kill(8000),multiKillLength:2}, award(8000), award(8000), award(17000,2,3)]);
    expect(result.filter(isMultiKillEvent)).toHaveLength(2); expect(result.at(-1)?.victimId).toBeUndefined();
  });
  it('never treats different players, first blood, kill streaks or adjacent plain kills as a multi-kill', () => {
    const result = prepareEventTimeline([kill(8000,1),kill(8001,2),{...award(8001,2),killType:'KILL_FIRST_BLOOD'},{...kill(9000),killStreakLength:4} as MatchTimelineEvent]);
    expect(result.filter(isMultiKillEvent)).toHaveLength(0);
  });
  it('keeps an unmatched award instead of assigning a wrong victim or a distant kill', () => {
    const result = prepareEventTimeline([kill(8000,1),kill(18000,2),award(18000,1)]);
    expect(result).toHaveLength(3); expect(result[2].type).toBe('CHAMPION_SPECIAL_KILL');
  });
  it('keeps simultaneous multi-kill milestones distinct and supports a notification without length', () => {
    const result = prepareEventTimeline([kill(8000,1,6),award(8000,1,2),kill(8000,1,7),award(8000,1,3)]);
    expect(result.map(e=>e.multiKillLength)).toEqual([2,3]);
    expect(isMultiKillEvent({...award(2),multiKillLength:undefined})).toBe(true);
    expect(multiKillLabel(award(2,1,5))).toBe('五杀');
  });
});
