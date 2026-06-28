import { describe, expect, it } from 'vitest';
import { extractRegionFromLocation, getAllRegions, getRegionConfig } from './region';

describe('SGP region mapping', () => {
  it('uses merged Tencent query regions', () => {
    expect(getAllRegions().map((region) => region.key)).toEqual([
      'HN1',
      'HN10',
      'BGP2',
      'NJ100',
      'GZ100',
      'CQ100',
      'TJ100',
      'TJ101',
    ]);
  });

  it('maps legacy regions to their merged query region', () => {
    expect(getRegionConfig('HN19')?.key).toBe('CQ100');
    expect(getRegionConfig('BGP1')?.key).toBe('NJ100');
    expect(getRegionConfig('WT1')?.key).toBe('TJ100');
  });

  it('normalizes Tencent-prefixed and log location regions', () => {
    expect(getRegionConfig('TENCENT_HN10')?.key).toBe('HN10');
    expect(extractRegionFromLocation('loltencent.cqhequ.cq100')).toBe('CQ100');
  });
});
