import { beforeEach, describe, expect, it } from 'vitest';
import {
  captureRosterSnapshot,
  clearRosterSnapshot,
  getRosterSnapshot,
  mergeWithSnapshot,
  parseRosterFromChampSelect,
  parseRosterFromGameflow,
  parseRosterFromLobby,
  type RosterPlayer,
} from './liveRoster';

function rosterPlayer(puuid: string): RosterPlayer {
  return {
    puuid,
    summonerId: 1,
    championId: 1,
    teamId: 100,
  };
}

describe('live roster', () => {
  beforeEach(() => clearRosterSnapshot());

  it('当前账号在 teamTwo 时仍把 teamTwo 返回为我方', () => {
    const result = parseRosterFromGameflow(
      {
        gameData: {
          gameId: 123,
          queue: { id: 420 },
          teamOne: [{ puuid: 'blue', summonerId: 1, championId: 10 }],
          teamTwo: [{ puuid: 'me', summonerId: 2, championId: 20 }],
        },
      },
      'me',
    );

    expect(result.myTeam.map((player) => player.puuid)).toEqual(['me']);
    expect(result.myTeam[0].teamId).toBe(200);
    expect(result.enemyTeam.map((player) => player.puuid)).toEqual(['blue']);
    expect(result.gameId).toBe(123);
  });

  it('双方都暂缺 puuid 时不会把我方误判成 teamTwo', () => {
    const result = parseRosterFromGameflow(
      {
        gameData: {
          teamOne: [{ summonerId: 1, championId: 10 }],
          teamTwo: [{ summonerId: 2, championId: 20 }],
        },
      },
      'not-yet-exposed',
    );

    expect(result.myTeam[0].championId).toBe(10);
    expect(result.enemyTeam[0].championId).toBe(20);
  });

  it('只复用与当前 gameId 一致的选人快照', () => {
    captureRosterSnapshot([rosterPlayer('me')], [], 123, 420);

    expect(getRosterSnapshot(123)?.queueId).toBe(420);
    expect(getRosterSnapshot(456)).toBeNull();
    expect(getRosterSnapshot()).toBeNull();
  });

  it('不保存缺少有效 gameId 的快照', () => {
    captureRosterSnapshot([rosterPlayer('me')], [], 0, 420);
    expect(getRosterSnapshot()).toBeNull();
  });

  it('调用方没有有效 gameId 时不复用未校验快照', () => {
    captureRosterSnapshot([rosterPlayer('me')], [], 123, 420);

    expect(getRosterSnapshot(0)).toBeNull();
    // 只是本次不能验证，不销毁快照；之后拿到真实 gameId 仍可使用。
    expect(getRosterSnapshot(123)).not.toBeNull();
  });

  it('GameStart 只返回部分成员时用同局快照补齐', () => {
    const me = rosterPlayer('me');
    const teammate = { ...rosterPlayer('teammate'), championId: 2 };
    const merged = mergeWithSnapshot(
      { myTeam: [{ ...me, championId: 99 }], enemyTeam: [] },
      {
        gameId: 123,
        capturedAt: Date.now(),
        myTeam: [me, teammate],
        enemyTeam: [],
        queueId: 420,
      },
    );

    expect(merged.myTeam.map((player) => player.puuid)).toEqual(['me', 'teammate']);
    expect(merged.myTeam[0].championId).toBe(99);
  });

  it('从选人会话带出 queueId', () => {
    const result = parseRosterFromChampSelect({
      gameId: 123,
      queueId: 440,
      myTeam: [{ cellId: 0, puuid: 'me', summonerId: 1, championId: 10 }],
      theirTeam: [],
    });

    expect(result.gameId).toBe(123);
    expect(result.queueId).toBe(440);
  });

  it('大厅成员缺少 puuid 时按 summonerId 识别自己，不重复补一张卡', () => {
    const result = parseRosterFromLobby(
      {
        members: [{ summonerId: 123, championId: 10 }],
        gameConfig: { queueId: 450 },
      },
      'my-puuid',
      123,
    );

    expect(result.myTeam).toHaveLength(1);
    expect(result.myTeam[0]).toMatchObject({ summonerId: 123, championId: 10 });
  });

  it('大厅接口返回重复成员时只保留一个玩家', () => {
    const result = parseRosterFromLobby(
      {
        members: [
          { puuid: 'same-player', summonerId: 123, championId: 10 },
          { puuid: 'same-player', summonerId: 123, championId: 10 },
        ],
      },
      'same-player',
      123,
    );

    expect(result.myTeam).toHaveLength(1);
  });
});
