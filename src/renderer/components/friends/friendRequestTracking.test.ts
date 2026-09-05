import { describe, expect, it } from 'vitest';
import type { FriendRequestInfo } from '../../../shared/api';
import { createAcceptedAlerts, mergeAcceptedAlerts } from './friendRequestTracking';

function request(puuid: string, gameName: string): FriendRequestInfo {
  return {
    id: puuid,
    puuid,
    gameName,
    gameTag: '1234',
    summonerId: 1,
    icon: 10,
    direction: 'out',
    note: '',
  };
}

describe('friend request tracking', () => {
  it('only turns removed requests that became friends into alerts', () => {
    const alerts = createAcceptedAlerts(
      [request('accepted', '已通过'), request('rejected', '已拒绝')],
      new Set(['accepted']),
      1000,
    );

    expect(alerts).toEqual([
      expect.objectContaining({ puuid: 'accepted', riotId: '已通过#1234', acceptedAt: 1000, read: false }),
    ]);
  });

  it('keeps the latest alert for the same player', () => {
    const older = createAcceptedAlerts([request('same', '玩家')], new Set(['same']), 1000);
    const newer = createAcceptedAlerts([request('same', '玩家')], new Set(['same']), 2000);
    const merged = mergeAcceptedAlerts(older, newer);

    expect(merged).toHaveLength(1);
    expect(merged[0].acceptedAt).toBe(2000);
  });
});
