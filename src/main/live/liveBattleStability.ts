import type { LiveBattleInfo } from '../../shared/api';

export interface StableLiveBattleSnapshot {
  value: LiveBattleInfo;
  expiresAt: number;
}

interface StabilizedLiveBattle {
  value: LiveBattleInfo;
  stable: StableLiveBattleSnapshot | null;
}

function playerCount(info: LiveBattleInfo): number {
  return info.myTeam.length + info.enemyTeam.length;
}

function hasPlayerIdentity(player: LiveBattleInfo['myTeam'][number]): boolean {
  if (player.puuid || player.summonerId > 0) return true;

  const riotId = player.riotId.trim();
  const gameName = player.gameName.trim();
  return Boolean(
    (riotId && !/^玩家(?:\?|？)?$/.test(riotId))
    || (gameName && !/^玩家(?:\?|？)?$/.test(gameName)),
  );
}

function identifiedPlayerCount(info: LiveBattleInfo): number {
  return [...info.myTeam, ...info.enemyTeam].filter(hasPlayerIdentity).length;
}

function samePlayer(
  left: LiveBattleInfo['myTeam'][number],
  right: LiveBattleInfo['myTeam'][number],
): boolean {
  if (left.puuid && right.puuid) return left.puuid === right.puuid;
  if (left.summonerId > 0 && right.summonerId > 0) {
    return left.summonerId === right.summonerId;
  }
  if (hasPlayerIdentity(left) && hasPlayerIdentity(right)) {
    return Boolean(left.riotId && right.riotId && left.riotId === right.riotId);
  }

  return left.championId > 0 && left.championId === right.championId;
}

function mergePlayer(
  fresh: LiveBattleInfo['myTeam'][number],
  previous: LiveBattleInfo['myTeam'][number],
): LiveBattleInfo['myTeam'][number] {
  const freshHasIdentity = hasPlayerIdentity(fresh);
  const previousHasIdentity = hasPlayerIdentity(previous);
  const freshHasHistory = fresh.history.length > 0;

  return {
    ...previous,
    ...fresh,
    puuid: fresh.puuid || previous.puuid,
    summonerId: fresh.summonerId || previous.summonerId,
    riotId: freshHasIdentity ? fresh.riotId : previous.riotId,
    gameName: freshHasIdentity ? fresh.gameName : previous.gameName,
    summonerLevel: fresh.summonerLevel || previous.summonerLevel,
    privacy: fresh.privacy || previous.privacy,
    rank: fresh.rank ?? previous.rank,
    kda: freshHasHistory ? fresh.kda : previous.kda,
    winRate: freshHasHistory ? fresh.winRate : previous.winRate,
    matchCount: freshHasHistory ? fresh.matchCount : previous.matchCount,
    history: freshHasHistory ? fresh.history : previous.history,
    ...(freshHasIdentity || !previousHasIdentity
      ? {}
      : {
          riotId: previous.riotId,
          gameName: previous.gameName,
        }),
  };
}

function mergeTeam(
  freshTeam: LiveBattleInfo['myTeam'],
  previousTeam: LiveBattleInfo['myTeam'],
): LiveBattleInfo['myTeam'] {
  const usedPrevious = new Set<number>();
  const merged = freshTeam.map((freshPlayer) => {
    const previousIndex = previousTeam.findIndex(
      (previousPlayer, index) => !usedPrevious.has(index) && samePlayer(freshPlayer, previousPlayer),
    );
    if (previousIndex < 0) return freshPlayer;

    usedPrevious.add(previousIndex);
    return mergePlayer(freshPlayer, previousTeam[previousIndex]);
  });

  for (let index = 0; index < previousTeam.length; index += 1) {
    if (usedPrevious.has(index)) continue;
    merged.push(previousTeam[index]);
  }

  return merged.slice(0, Math.max(freshTeam.length, previousTeam.length));
}

function mergeBattleInfo(fresh: LiveBattleInfo, previous: LiveBattleInfo): LiveBattleInfo {
  return {
    ...fresh,
    queueName: fresh.queueName || previous.queueName,
    myTeam: mergeTeam(fresh.myTeam, previous.myTeam),
    enemyTeam: mergeTeam(fresh.enemyTeam, previous.enemyTeam),
  };
}

export function stabilizeLiveBattle(
  fresh: LiveBattleInfo,
  previous: StableLiveBattleSnapshot | null,
  now: number,
  staleTtlMs: number,
): StabilizedLiveBattle {
  const stable = previous && previous.expiresAt > now ? previous : null;
  const freshPlayerCount = playerCount(fresh);

  if (fresh.inGame && freshPlayerCount > 0) {
    if (stable) {
      const previousPlayerCount = playerCount(stable.value);
      const freshIdentifiedCount = identifiedPlayerCount(fresh);
      const previousIdentifiedCount = identifiedPlayerCount(stable.value);

      if (
        freshPlayerCount < previousPlayerCount
        && freshIdentifiedCount <= previousIdentifiedCount
      ) {
        return {
          value: {
            ...stable.value,
            phase: fresh.phase || stable.value.phase,
          },
          stable,
        };
      }

      const merged = mergeBattleInfo(fresh, stable.value);
      return {
        value: merged,
        stable: {
          value: merged,
          expiresAt: now + staleTtlMs,
        },
      };
    }

    return {
      value: fresh,
      stable: {
        value: fresh,
        expiresAt: now + staleTtlMs,
      },
    };
  }

  if (stable && (fresh.inGame || Boolean(fresh.error))) {
    return {
      value: {
        ...stable.value,
        phase: fresh.inGame && fresh.phase ? fresh.phase : stable.value.phase,
      },
      stable,
    };
  }

  return {
    value: fresh,
    stable: fresh.inGame ? stable : null,
  };
}
