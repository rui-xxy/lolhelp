import type { MatchTimelineEvent } from '../../../shared/api';

export type BuildSkillKey = 'Q' | 'W' | 'E' | 'R' | '?';
export interface BuildSkillStep {
  sequence: number;
  key: BuildSkillKey;
  rank: number;
  timestamp: number;
}

/** Sequence is the order of spending points, not an inferred champion level. */
export function buildSkillMatrix(events: MatchTimelineEvent[]) {
  const keys: BuildSkillKey[] = ['Q', 'W', 'E', 'R'];
  const ranks = new Map<BuildSkillKey, number>();
  const steps: BuildSkillStep[] = events
    .filter(event => event.type === 'SKILL_LEVEL_UP' && event.levelUpType !== 'EVOLVE')
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((event, index) => {
      const key: BuildSkillKey = keys[(event.skillSlot ?? 0) - 1] ?? '?';
      const rank = (ranks.get(key) ?? 0) + 1;
      ranks.set(key, rank);
      return { sequence: index + 1, key, rank, timestamp: event.timestamp };
    });
  if (steps.some(step => step.key === '?')) keys.push('?');
  return { keys, steps, columnCount: Math.max(18, steps.length) };
}
