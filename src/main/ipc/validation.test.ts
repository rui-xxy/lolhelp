import { describe, expect, it } from 'vitest';
import {
  validatePlayerLookupRequest,
  validateRootPath,
  validateScoutConfig,
} from './validation';

describe('IPC validation', () => {
  it('accepts valid player lookup requests', () => {
    expect(
      validatePlayerLookupRequest({
        name: '玩家#12345',
        pageSize: 20,
        startIndex: 0,
        region: 'HN10',
      }),
    ).toMatchObject({ name: '玩家#12345', pageSize: 20, region: 'HN10' });
  });

  it('rejects invalid lookup and path payloads', () => {
    expect(() => validatePlayerLookupRequest({ name: 123 })).toThrow();
    expect(() => validatePlayerLookupRequest({ name: '', pageSize: 1000 })).toThrow();
    expect(() => validateRootPath({ path: 'D:\\LOL' })).toThrow();
  });

  it('bounds long-running scout inputs', () => {
    expect(() =>
      validateScoutConfig({
        seedId: '',
        championIds: [1],
        kdaThreshold: 5,
        hoursWindow: 3,
        targetCount: 1000,
      }),
    ).toThrow(/目标人数/);
  });
});
