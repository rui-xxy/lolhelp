import { describe, expect, it } from 'vitest';
import { metricBar, metricHasBar } from './matchStatsModel';

describe('match analytics visual values', () => {
  it('keeps a true zero baseline instead of hiding the lowest player', () => {
    expect(metricBar(20, [20, 50, 100])).toEqual({ left: 0, width: 20, signed: false });
  });
  it('handles equal nonzero values and all-zero values', () => {
    expect(metricBar(5, [5, 5]).width).toBe(100);
    expect(metricBar(0, [0, 0]).width).toBe(0);
  });
  it('centers signed values with a common magnitude scale', () => {
    expect(metricBar(-25, [-50, 100])).toEqual({ left: 37.5, width: 12.5, signed: true });
    expect(metricBar(100, [-50, 100])).toEqual({ left: 50, width: 50, signed: true });
  });
  it('never emits invalid CSS numbers for absent or nonfinite values', () => {
    for (const value of [null, NaN, Infinity]) expect(metricBar(value, [0, NaN, Infinity]).width).toBe(0);
  });
  it('does not invent quantitative bars for KDA or state metrics', () => {
    expect(metricHasBar({ key: 'kda', label: 'KDA', text: () => '1/2/3' }, '1/2/3')).toBe(false);
    expect(metricHasBar({ key: 'first', label: '一血', kind: 'boolean' }, 1)).toBe(false);
    expect(metricHasBar({ key: 'damage', label: '伤害' }, 0)).toBe(true);
  });
});
