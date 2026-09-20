import type { MatchTimelineEvent } from '../../../shared/api';

export type TimelineLane = 'blue' | 'red' | 'objective';
export interface TimelinePoint {
  key: string;
  event: MatchTimelineEvent;
  lane: TimelineLane;
  label: string;
}
export interface TimelineBin { blue: number; red: number; objective: number }

export function timelineTime(timestamp: number): string {
  const seconds = Math.floor(Math.max(0, Number.isFinite(timestamp) ? timestamp : 0) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function timelineBins(points: TimelinePoint[], duration: number, count = 48): TimelineBin[] {
  const size = Math.max(1, Math.min(120, Math.floor(count) || 48));
  const end = Math.max(1, Number.isFinite(duration) ? duration : 1);
  const bins = Array.from({ length: size }, () => ({ blue: 0, red: 0, objective: 0 }));
  for (const point of points) {
    if (!Number.isFinite(point.event.timestamp)) continue;
    const index = Math.max(0, Math.min(size - 1, Math.floor(point.event.timestamp / end * size)));
    bins[index][point.lane]++;
  }
  return bins;
}

export function timelineTicks(duration: number): number[] {
  const end = Math.max(1, Number.isFinite(duration) ? duration : 1);
  const step = [15000, 30000, 60000, 120000, 300000, 600000, 900000, 1800000]
    .find((value) => end / value <= 5) ?? Math.ceil(end / 5);
  const ticks = [0];
  for (let time = step; time < end - step * 0.45; time += step) ticks.push(time);
  ticks.push(end);
  return ticks;
}

// In a dense bin, resolve by time within the hovered lane. Keyboard navigation
// remains event-by-event so simultaneous events never become inaccessible.
export function nearestTimelinePoint(points: TimelinePoint[], timestamp: number, lane?: TimelineLane): TimelinePoint | undefined {
  const scoped = lane ? points.filter((point) => point.lane === lane) : points;
  const candidates = scoped.length ? scoped : points;
  return candidates.reduce<TimelinePoint | undefined>((best, point) => (
    !best || Math.abs(point.event.timestamp - timestamp) < Math.abs(best.event.timestamp - timestamp) ? point : best
  ), undefined);
}
