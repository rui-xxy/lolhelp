// 达标判定 & 候选收集（纯函数，可单测）。
//
// 达标场（qualifying match）三要素全部满足：
//   1. 目标玩家用了指定英雄（championId ∈ config.championIds）
//   2. 在时间窗内（gameCreation >= now - hoursWindow）
//   3. KDA ≥ 阈值
// 任一玩家有≥1个达标场即算"达标者"，达标场全部展示。
//
// 候选收集（collectCandidates）：不卡时间，凡是历史一起玩过指定英雄的人，
// 现在可能正热。卡时间只在达标判定那一步。

import type { PlayerMatchDetail, ScoutConfig } from '../../shared/api';

// 判断某玩家在某场是否达标（用指定英雄 + 时间窗内 + KDA 够）。
// 注意：match 是该玩家的战绩（targetPuuid 视角），所以判定就看 match 顶层字段。
export function isQualifying(
  match: PlayerMatchDetail,
  config: ScoutConfig,
  now: number = Date.now(),
): boolean {
  // 1. 用指定英雄
  if (!config.championIds.includes(match.championId)) return false;
  // 2. 在时间窗内
  const cutoff = now - config.hoursWindow * 3600 * 1000;
  if (match.gameCreation < cutoff) return false;
  // 3. KDA 够
  if (match.kda < config.kdaThreshold) return false;
  return true;
}

// 从一批场里筛出所有达标场。
export function filterQualifying(
  matches: PlayerMatchDetail[],
  config: ScoutConfig,
  now: number = Date.now(),
): PlayerMatchDetail[] {
  return matches.filter((m) => isQualifying(m, config, now));
}

// 从一批场里收集用过指定英雄的其他玩家 puuid（候选池来源）。
// 不卡时间（历史一起玩过也算）。targetPuuid 自己排除掉。
export function collectCandidates(
  matches: PlayerMatchDetail[],
  championIds: number[],
  excludePuuid?: string,
): string[] {
  const set = new Set<string>();
  for (const m of matches) {
    for (const p of m.participants ?? []) {
      if (!p.puuid || p.puuid === excludePuuid) continue;
      if (championIds.includes(p.championId)) {
        set.add(p.puuid);
      }
    }
  }
  return [...set];
}

// 统计某玩家用指定英雄的总场次（仅用于 ScoutHit.totalChampionGames 展示）。
// 这里 counts 的是他战绩里所有指定英雄的场，不限时间。
export function countChampionGames(
  matches: PlayerMatchDetail[],
  championIds: number[],
): number {
  let n = 0;
  for (const m of matches) {
    if (championIds.includes(m.championId)) n++;
  }
  return n;
}
