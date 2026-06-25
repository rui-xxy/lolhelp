import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSIST_SETTINGS } from '../../shared/assist';
import {
  findLocalAction,
  firstAvailableChampion,
  getPreferredBan,
  getPreferredPicks,
} from './championActions';

describe('assist champion actions', () => {
  it('finds the active local action', () => {
    expect(
      findLocalAction(
        [[
          { id: 1, actorCellId: 2, type: 'pick', isInProgress: true },
          { id: 2, actorCellId: 3, type: 'pick', isInProgress: true },
        ]],
        3,
      )?.id,
    ).toBe(2);
  });

  it('selects role and mode-specific preferences', () => {
    const preferences = structuredClone(DEFAULT_ASSIST_SETTINGS.champions);
    preferences.byRole.top = [86, 24];
    preferences.aram = [22];
    preferences.arena = [238];
    preferences.bans.top = 122;
    preferences.bans.arena = 157;

    expect(getPreferredPicks(preferences, 420, 'top')).toEqual([86, 24]);
    expect(getPreferredPicks(preferences, 450, 'top')).toEqual([22]);
    expect(getPreferredPicks(preferences, 1750, 'top')).toEqual([238]);
    expect(getPreferredBan(preferences, 420, 'top')).toBe(122);
    expect(getPreferredBan(preferences, 1750, 'top')).toBe(157);
  });

  it('uses the first available preferred champion', () => {
    expect(firstAvailableChampion([1, 2, 3], [3, 4])).toBe(3);
    expect(firstAvailableChampion([1, 2], [3, 4])).toBe(0);
  });
});
