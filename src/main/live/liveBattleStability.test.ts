import { describe, expect, it } from 'vitest';
import type { LiveBattleInfo, LiveBattlePlayer } from '../../shared/api';
import { stabilizeLiveBattle, type StableLiveBattleSnapshot } from './liveBattleStability';

function player(id: string, teamId: number): LiveBattlePlayer {
  return {
    puuid: id,
    summonerId: 1,
    riotId: id,
    gameName: id,
    championId: 1,
    championName: '测试英雄',
    championAlias: 'Annie',
    teamId,
    summonerLevel: 1,
    rank: null,
    kda: 0,
    winRate: 0,
    matchCount: 0,
    history: [],
  };
}

function anonymousPlayer(championId: number, teamId: number): LiveBattlePlayer {
  return {
    ...player('', teamId),
    puuid: '',
    summonerId: 0,
    riotId: '玩家?',
    gameName: '玩家?',
    championId,
  };
}

function battle(playerTotal = 10): LiveBattleInfo {
  const myTeam = Array.from(
    { length: Math.min(5, playerTotal) },
    (_, index) => player(`my-${index}`, 100),
  );
  const enemyCount = Math.max(0, playerTotal - myTeam.length);
  const enemyTeam = Array.from(
    { length: enemyCount },
    (_, index) => player(`enemy-${index}`, 200),
  );

  return {
    inGame: true,
    phase: 'InProgress',
    queueName: '单双排',
    myTeam,
    enemyTeam,
  };
}

function stable(value: LiveBattleInfo): StableLiveBattleSnapshot {
  return { value, expiresAt: 40_000 };
}

describe('stabilizeLiveBattle', () => {
  it('keeps the complete roster when a live refresh is temporarily empty', () => {
    const complete = battle(10);
    const result = stabilizeLiveBattle(
      { ...battle(0), myTeam: [], enemyTeam: [] },
      stable(complete),
      10_000,
      30_000,
    );

    expect(result.value.myTeam).toHaveLength(5);
    expect(result.value.enemyTeam).toHaveLength(5);
  });

  it('keeps the complete roster when a refresh is temporarily partial', () => {
    const complete = battle(10);
    const result = stabilizeLiveBattle(battle(6), stable(complete), 10_000, 30_000);

    expect(result.value.myTeam).toHaveLength(5);
    expect(result.value.enemyTeam).toHaveLength(5);
  });

  it('accepts a smaller roster when it replaces anonymous enemies with real identities', () => {
    const previous: LiveBattleInfo = {
      ...battle(5),
      phase: 'ChampSelect',
      enemyTeam: Array.from(
        { length: 5 },
        (_, index) => anonymousPlayer(10 + index, 200),
      ),
    };
    const fresh: LiveBattleInfo = {
      ...battle(5),
      enemyTeam: Array.from(
        { length: 4 },
        (_, index) => ({ ...player(`enemy-real-${index}`, 200), championId: 10 + index }),
      ),
    };

    const result = stabilizeLiveBattle(fresh, stable(previous), 10_000, 30_000);

    expect(result.value.enemyTeam).toHaveLength(5);
    expect(result.value.enemyTeam.slice(0, 4).map((entry) => entry.riotId)).toEqual([
      'enemy-real-0',
      'enemy-real-1',
      'enemy-real-2',
      'enemy-real-3',
    ]);
    expect(result.value.enemyTeam[4].riotId).toBe('玩家?');
  });

  it('keeps the stable roster during a transient status error', () => {
    const complete = battle(10);
    const result = stabilizeLiveBattle(
      {
        inGame: false,
        phase: 'Unavailable',
        queueName: '',
        myTeam: [],
        enemyTeam: [],
        error: '状态暂时不可用',
      },
      stable(complete),
      10_000,
      30_000,
    );

    expect(result.value.inGame).toBe(true);
    expect(result.value.myTeam).toHaveLength(5);
  });

  it('clears immediately when the client confirms a real non-live phase', () => {
    const result = stabilizeLiveBattle(
      {
        inGame: false,
        phase: 'None',
        queueName: '',
        myTeam: [],
        enemyTeam: [],
      },
      stable(battle(10)),
      10_000,
      30_000,
    );

    expect(result.value.inGame).toBe(false);
    expect(result.stable).toBeNull();
  });
});
