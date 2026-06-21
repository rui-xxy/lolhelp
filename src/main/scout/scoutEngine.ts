// 高手扩散搜索核心引擎（BFS + 并发控制 + 目标人数早停）。
//
// 算法（v3，严格按用户确认：只 MVP 扩散）：
//   队列从种子开始。每个「种子节点」查 30 场，做三件事：
//     a) 自己是否达标（用指定英雄 + 时间窗内 + KDA 够）
//     b) 收集场里其他用过指定英雄的人作为「候选」→ 并发查 5 场判定达标（候选不扩散）
//     c) 每场综合分前 N 名（MVP，不论英雄）→ 加入队列作下一轮种子
//   凑够目标人数即停 / 种子耗尽即停 / 取消即停。
//
// 依赖注入：SGP 细节（resolvePuuid / fetchMatches）通过 ScoutDeps 传入，
// 引擎本身不 import SGP，方便单测。Profile 从 participants 派生，省额外请求。

import type {
  PlayerMatchDetail,
  PlayerProfile,
  ScoutConfig,
  ScoutHit,
  ScoutProgress,
  ScoutResult,
} from '../../shared/api';
import { pickSeeds } from './scoutScore';
import { collectCandidates, countChampionGames, filterQualifying } from './scoutFilter';

// 引擎依赖（SGP 细节隔离在外，便于单测注入 mock）
export interface ScoutDeps {
  // Riot ID（名字#数字，空=自己）→ puuid + 显示名
  resolvePuuid: (seedId: string) => Promise<{ puuid: string; riotId: string } | null>;
  // 查某人战绩（已映射好的 PlayerMatchDetail[]），带模式 tag
  fetchMatches: (puuid: string, count: number, tag?: string) => Promise<PlayerMatchDetail[]>;
}

// 引擎运行参数
export interface RunScoutParams {
  config: ScoutConfig;
  deps: ScoutDeps;
  onProgress?: (p: ScoutProgress) => void;
  shouldCancel?: () => boolean;
  now?: number; // 注入当前时间（测试用）
}

// 搜索边界：不按请求数、种子数、扩散深度提前截断，持续跑到目标人数、队列耗尽或用户取消。
const CONCURRENCY = 5; // 候选查询并发数
const SEED_FETCH_COUNT = 30; // 种子查 30 场
const CANDIDATE_FETCH_COUNT = 5; // 候选查 5 场

// 简易并发池：items 并发跑 fn，最多 concurrency 个同时
async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const worker = async () => {
    while (index < items.length) {
      const i = index++;
      try {
        await fn(items[i]);
      } catch {
        // 单个失败不阻断整体
      }
    }
  };
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
}

// 从战绩的 participants 里派生玩家 profile（避免再发一次请求查资料）
function deriveProfile(puuid: string, matches: PlayerMatchDetail[]): PlayerProfile {
  for (const m of matches) {
    const p = (m.participants ?? []).find((x) => x.puuid === puuid);
    if (p) {
      return {
        riotId: p.riotId || p.gameName || '',
        puuid,
        level: 0,
        profileIconId: p.profileIconId ?? 0,
        profileIconUrl: p.profileIconUrl ?? '',
      };
    }
  }
  return { riotId: '', puuid, level: 0, profileIconId: 0, profileIconUrl: '' };
}

// 构建一个达标者
function buildHit(
  puuid: string,
  allMatches: PlayerMatchDetail[],
  qualifying: PlayerMatchDetail[],
  championIds: number[],
): ScoutHit {
  return {
    profile: deriveProfile(puuid, allMatches),
    qualifyingMatches: qualifying,
    totalChampionGames: countChampionGames(allMatches, championIds),
  };
}

// 主入口
export async function runScout(params: RunScoutParams): Promise<ScoutResult> {
  const { config, deps, onProgress, shouldCancel } = params;
  const now = params.now ?? Date.now();
  const topN = config.topSeedsPerGame ?? 2;
  const excludedPuuids = new Set(config.excludePuuids ?? []);

  const stats = { totalRequests: 0, totalSeeds: 0, totalCandidates: 0, depth: 0 };
  const hits: ScoutHit[] = [];
  const cancel = () => (shouldCancel?.() ?? false);

  const pushProgress = (phase: ScoutProgress['phase'], latestHit?: ScoutHit) => {
    onProgress?.({
      phase,
      checked: stats.totalCandidates,
      hits: hits.length,
      target: config.targetCount,
      seedQueueRemaining: queue.length,
      latestHit,
    });
  };

  // 种子队列：{ puuid, depth }
  const queue: Array<{ puuid: string; depth: number }> = [];
  const visited = new Set<string>(); // 已查战绩的 puuid（种子）
  const queued = new Set<string>(); // 已进入过扩散队列的 puuid，避免重复入队导致队列膨胀
  const candidateChecked = new Set<string>(); // 已判定达标的 puuid（候选+种子自己）

  const enqueueSeed = (puuid: string, depth: number) => {
    if (!puuid || visited.has(puuid) || queued.has(puuid)) return;
    queued.add(puuid);
    queue.push({ puuid, depth });
  };


  // 1. 解析种子 Riot ID → puuid
  pushProgress('seeding');
  const seed = await deps.resolvePuuid(config.seedId);
  if (!seed) {
    return {
      hits: [],
      aborted: false,
      error: `未找到种子玩家「${config.seedId || '自己'}」`,
      stats,
    };
  }
  enqueueSeed(seed.puuid, 0);

  // 2. BFS 主循环
  while (queue.length > 0) {
    if (cancel() || hits.length >= config.targetCount) break;

    const node = queue.shift();
    if (!node) break;
    if (visited.has(node.puuid)) continue;
    visited.add(node.puuid);
    stats.totalSeeds++;
    if (node.depth > stats.depth) stats.depth = node.depth;

    // 2a. 种子查 30 场
    let seedMatches: PlayerMatchDetail[];
    try {
      seedMatches = await deps.fetchMatches(node.puuid, SEED_FETCH_COUNT, config.tag);
      stats.totalRequests++;
    } catch {
      continue; // 种子战绩拉取失败，跳过
    }

    // 2b. 种子自己判定达标（已有 30 场，直接筛）
    if (!candidateChecked.has(node.puuid)) {
      candidateChecked.add(node.puuid);
      stats.totalCandidates++;
      const qualifying = filterQualifying(seedMatches, config, now);
      if (qualifying.length > 0 && hits.length < config.targetCount && !excludedPuuids.has(node.puuid)) {
        const hit = buildHit(node.puuid, seedMatches, qualifying, config.championIds);
        hits.push(hit);
        pushProgress('scanning', hit);
      }
    }

    // 2c. 收集候选（场里其他用过指定英雄的人）→ 并发查 5 场判定
    const candidatePuuids = collectCandidates(seedMatches, config.championIds, node.puuid)
      .filter((p) => !candidateChecked.has(p));
    candidatePuuids.forEach((p) => candidateChecked.add(p));
    stats.totalCandidates += candidatePuuids.length;
    pushProgress('scanning');

    await mapPool(candidatePuuids, CONCURRENCY, async (candPuuid) => {
      if (cancel() || hits.length >= config.targetCount) return;
      let candMatches: PlayerMatchDetail[];
      try {
        candMatches = await deps.fetchMatches(candPuuid, CANDIDATE_FETCH_COUNT, config.tag);
        stats.totalRequests++;
      } catch {
        return; // 单候选失败跳过
      }
      const qualifying = filterQualifying(candMatches, config, now);
      if (qualifying.length > 0 && hits.length < config.targetCount && !excludedPuuids.has(candPuuid)) {
        const hit = buildHit(candPuuid, candMatches, qualifying, config.championIds);
        hits.push(hit);
        pushProgress('scanning', hit);
      }
    });
    pushProgress('scanning');
    if (hits.length >= config.targetCount) break;

    // 2d. 扩散线：每场综合分前 N 名（MVP）→ 下一轮种子
    for (const m of seedMatches) {
      for (const seedPuuid of pickSeeds(m, topN)) {
          enqueueSeed(seedPuuid, node.depth + 1);
      }
    }
  }

  pushProgress(cancel() ? 'aborted' : 'done');

  return {
    hits,
    aborted: cancel(),
    stats,
  };
}
