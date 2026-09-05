import { describe, expect, it } from 'vitest';
import {
  getSgpHttpStatus,
  isSameSgpSession,
  shouldForceRefreshSgpAuth,
} from './sessionPolicy';

const baseSession = {
  credentialKey: '100:1234:token:https',
  puuid: 'player-a',
  regionKey: 'HN10',
};

describe('SGP session policy', () => {
  it('keeps the cache only while credentials, account and region are unchanged', () => {
    expect(isSameSgpSession(baseSession, { ...baseSession })).toBe(true);
    expect(isSameSgpSession(baseSession, { ...baseSession, puuid: 'player-b' })).toBe(false);
    expect(isSameSgpSession(baseSession, { ...baseSession, regionKey: 'HN1' })).toBe(false);
    expect(isSameSgpSession(baseSession, { ...baseSession, credentialKey: '200:5678:new:https' })).toBe(false);
  });

  it('extracts SGP status codes and only force-refreshes rejected credentials', () => {
    expect(getSgpHttpStatus(new Error('SGP 请求失败：HTTP 400'))).toBe(400);
    expect(getSgpHttpStatus(new Error('network timeout'))).toBeNull();
    expect(shouldForceRefreshSgpAuth(new Error('SGP 请求失败：HTTP 401'))).toBe(true);
    expect(shouldForceRefreshSgpAuth(new Error('SGP 请求失败：HTTP 403'))).toBe(true);
    expect(shouldForceRefreshSgpAuth(new Error('SGP 请求失败：HTTP 400'))).toBe(false);
    expect(shouldForceRefreshSgpAuth(new Error('SGP 请求失败：HTTP 404'))).toBe(false);
  });
});
