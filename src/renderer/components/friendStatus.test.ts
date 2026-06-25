import { describe, expect, it } from 'vitest';
import type { FriendInfo } from '../../shared/api';
import { getFriendStatusDisplay } from './friendStatus';

function friend(lol: FriendInfo['lol']): FriendInfo {
  return {
    id: 'friend-1',
    puuid: 'test',
    gameName: '玩家',
    gameTag: '1234',
    summonerId: 1,
    icon: 1,
    availability: 'dnd',
    groupName: '**Default',
    note: '',
    statusMessage: '',
    lastSeenOnlineTimestamp: null,
    product: 'league_of_legends',
    lol,
  };
}

describe('friend status display', () => {
  it.each([
    [{ gameStatus: 'inGame', gameMode: 'CHERRY', gameQueueName: '斗魂竞技场 3x6' }, '斗魂竞技场 3x6', 'arena'],
    [{ gameStatus: 'inGame', gameMode: 'TFT', gameQueueName: '云顶之弈（排位）' }, '云顶之弈（排位）', 'tft'],
    [{ gameStatus: 'inGame', gameMode: 'KIWI', gameQueueName: '海克斯大乱斗' }, '海克斯大乱斗', 'aram'],
    [{ gameStatus: 'inGame', gameMode: 'CLASSIC', gameQueueName: '自定义对局' }, '自定义对局', 'normal-game'],
  ])('shows mode-specific in-game status', (lol, text, kind) => {
    expect(getFriendStatusDisplay(friend(lol))).toEqual({ text, kind });
  });

  it('includes the selected mode while queueing', () => {
    expect(
      getFriendStatusDisplay(
        friend({
          gameStatus: 'inQueue',
          gameMode: 'TFT',
          gameQueueName: '云顶之弈（排位）',
        }),
      ).text,
    ).toBe('云顶之弈（排位） · 排队中');
  });
});
