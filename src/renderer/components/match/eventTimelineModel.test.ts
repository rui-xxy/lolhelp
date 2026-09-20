import { describe, expect, it } from 'vitest';
import { nearestTimelinePoint, timelineBins, timelineTicks, timelineTime, type TimelinePoint } from './eventTimelineModel';
const point = (key: string, time: number, lane: TimelinePoint['lane']): TimelinePoint => ({ key, event: { type: 'CHAMPION_KILL', timestamp: time }, lane, label: key });
describe('event timeline navigation', () => {
  it('bins all simultaneous and end-boundary events without loss', () => {
    const bins = timelineBins([point('a', 0, 'blue'), point('b', 10000, 'red'), point('c', 10000, 'red'), point('d', 20000, 'objective')], 20000, 2);
    expect(bins).toEqual([{ blue: 1, red: 0, objective: 0 }, { blue: 0, red: 2, objective: 1 }]);
  });
  it('resolves nearest event in the hovered lane and falls back for an empty lane', () => {
    const points = [point('a', 2000, 'blue'), point('b', 7000, 'red')];
    expect(nearestTimelinePoint(points, 6900, 'blue')?.key).toBe('a');
    expect(nearestTimelinePoint(points, 6900, 'objective')?.key).toBe('b');
    expect(nearestTimelinePoint([], 0)).toBeUndefined();
  });
  it('keeps the final tick distinct on an 11:09 game', () => {
    const ticks = timelineTicks(669000);
    expect(ticks[0]).toBe(0); expect(ticks.at(-1)).toBe(669000);
    expect(ticks.length).toBeLessThanOrEqual(7); expect(new Set(ticks).size).toBe(ticks.length);
  });
  it('formats short, long and invalid times predictably', () => {
    expect(timelineTime(669000)).toBe('11:09'); expect(timelineTime(-10)).toBe('0:00'); expect(timelineTime(NaN)).toBe('0:00');
    expect(timelineBins([], 0)).toHaveLength(48);
  });
});
