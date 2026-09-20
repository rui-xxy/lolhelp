import { describe, expect, it } from 'vitest';
import type { MatchTimelineEvent } from '../../../shared/api';
import { buildSkillMatrix } from './buildSkillMatrixModel';

const upgrade = (skillSlot: number, timestamp: number, levelUpType = 'NORMAL'): MatchTimelineEvent => ({
  type: 'SKILL_LEVEL_UP', participantId: 1, timestamp, skillSlot, levelUpType,
});

describe('buildSkillMatrix', () => {
  it('keeps chronological point order and per-skill rank without mutating input', () => {
    const events = [upgrade(3, 30), upgrade(2, 10), upgrade(3, 20), upgrade(4, 40)];
    const result = buildSkillMatrix(events);
    expect(result.steps.map(({ key, rank, sequence }) => [key, rank, sequence])).toEqual([
      ['W', 1, 1], ['E', 1, 2], ['E', 2, 3], ['R', 1, 4],
    ]);
    expect(events[0].timestamp).toBe(30);
  });

  it('does not count evolutions or purchases as normal skill upgrades', () => {
    const result = buildSkillMatrix([upgrade(1, 1), upgrade(1, 2, 'EVOLVE'), { type: 'ITEM_PURCHASED', timestamp: 3 }]);
    expect(result.steps).toHaveLength(1);
    expect(result.keys).toEqual(['Q', 'W', 'E', 'R']);
  });

  it('retains unknown slots as explicit unknowns rather than shifting subsequent columns', () => {
    const result = buildSkillMatrix([upgrade(0, 1), upgrade(99, 2), upgrade(1, 3)]);
    expect(result.keys).toEqual(['Q', 'W', 'E', 'R', '?']);
    expect(result.steps.map(step => [step.sequence, step.key])).toEqual([[1, '?'], [2, '?'], [3, 'Q']]);
  });

  it('preserves a stable 18-column scale when data is missing or incomplete', () => {
    expect(buildSkillMatrix([])).toMatchObject({ columnCount: 18, steps: [] });
    expect(buildSkillMatrix([upgrade(4, 900000)]).steps[0]).toMatchObject({ sequence: 1, rank: 1, key: 'R' });
  });

  it('never discards upgrades after the eighteenth point in special modes', () => {
    const result = buildSkillMatrix(Array.from({ length: 24 }, (_, index) => upgrade(index % 4 + 1, index)));
    expect(result.columnCount).toBe(24);
    expect(result.steps).toHaveLength(24);
    expect(result.steps[23]).toMatchObject({ sequence: 24, rank: 6, key: 'R' });
  });
});
