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

export interface ScoutSessionState {
  initialized: boolean;
  queue: Array<{ puuid: string; depth: number }>;
  visited: Set<string>;
  queued: Set<string>;
  pendingCandidates: string[];
  candidateQueued: Set<string>;
  candidateChecked: Set<string>;
}

export function createScoutSessionState(): ScoutSessionState {
  return {
    initialized: false,
    queue: [],
    visited: new Set<string>(),
    queued: new Set<string>(),
    pendingCandidates: [],
    candidateQueued: new Set<string>(),
    candidateChecked: new Set<string>(),
  };
}

export function getScoutSessionKey(config: ScoutConfig): string {
  return JSON.stringify({
    seedId: config.seedId.trim(),
    championIds: [...config.championIds].sort((a, b) => a - b),
    kdaThreshold: config.kdaThreshold,
    hoursWindow: config.hoursWindow,
    region: config.region ?? '',
    tag: config.tag ?? '',
    topSeedsPerGame: config.topSeedsPerGame ?? 2,
  });
}

function enqueueSeed(session: ScoutSessionState, puuid: string, depth: number) {
  if (!puuid || session.visited.has(puuid) || session.queued.has(puuid)) return;
  session.queued.add(puuid);
  session.queue.push({ puuid, depth });
}

function enqueueCandidate(session: ScoutSessionState, puuid: string) {
  if (!puuid || session.candidateChecked.has(puuid) || session.candidateQueued.has(puuid)) return;
  session.candidateQueued.add(puuid);
  session.pendingCandidates.push(puuid);
}

// 主入口
export async function runScout(params: RunScoutParams): Promise<ScoutResult> {
  return runScoutSession({
    ...params,
    session: createScoutSessionState(),
  });
}

export async function runScoutSession(
  params: RunScoutParams & { session: ScoutSessionState },
): Promise<ScoutResult> {
  const { config, deps, onProgress, shouldCancel, session } = params;
  const now = params.now ?? Date.now();
  const topN = config.topSeedsPerGame ?? 2;
  const targetCount = Math.max(1, Math.floor(config.targetCount || 1));
  const excludedPuuids = new Set(config.excludePuuids ?? []);
  for (const puuid of excludedPuuids) {
    session.candidateChecked.add(puuid);
  }

  const stats = { totalRequests: 0, totalSeeds: 0, totalCandidates: 0, depth: 0 };
  const hits: ScoutHit[] = [];
  const cancel = () => (shouldCancel?.() ?? false);

  const pushProgress = (phase: ScoutProgress['phase'], latestHit?: ScoutHit) => {
    onProgress?.({
      phase,
      checked: stats.totalCandidates,
      hits: hits.length,
      target: targetCount,
      seedQueueRemaining: session.queue.length,
      latestHit,
    });
  };

  async function processPendingCandidates(): Promise<void> {
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, session.pendingCandidates.length) },
      async () => {
        while (!cancel() && hits.length < targetCount && session.pendingCandidates.length > 0) {
          const candPuuid = session.pendingCandidates.shift();
          if (!candPuuid || session.candidateChecked.has(candPuuid)) continue;

          session.candidateChecked.add(candPuuid);
          stats.totalCandidates++;

          let candMatches: PlayerMatchDetail[];
          try {
            candMatches = await deps.fetchMatches(candPuuid, CANDIDATE_FETCH_COUNT, config.tag);
            stats.totalRequests++;
          } catch {
            continue;
          }

          const qualifying = filterQualifying(candMatches, config, now);
          if (qualifying.length > 0 && hits.length < targetCount && !excludedPuuids.has(candPuuid)) {
            const hit = buildHit(candPuuid, candMatches, qualifying, config.championIds);
            hits.push(hit);
            pushProgress('scanning', hit);
          }
        }
      },
    );
    await Promise.all(workers);
  }

  // 1. 解析种子 Riot ID → puuid。session 已初始化时说明这是下一批，直接沿用队列。
  pushProgress(session.initialized ? 'scanning' : 'seeding');
  if (!session.initialized) {
    const seed = await deps.resolvePuuid(config.seedId);
    if (!seed) {
      return {
        hits: [],
        aborted: false,
        error: `未找到种子玩家「${config.seedId || '自己'}」`,
        stats,
      };
    }
    enqueueSeed(session, seed.puuid, 0);
    session.initialized = true;
  }

  // 2. BFS 主循环：先消费上一批留下的候选，再继续取种子扩散。
  while (!cancel() && hits.length < targetCount) {
    if (session.pendingCandidates.length > 0) {
      await processPendingCandidates();
      pushProgress('scanning');
      continue;
    }

    const node = session.queue.shift();
    if (!node) break;
    if (session.visited.has(node.puuid)) continue;
    session.visited.add(node.puuid);
    stats.totalSeeds++;
    if (node.depth > stats.depth) stats.depth = node.depth;

    let seedMatches: PlayerMatchDetail[];
    try {
      seedMatches = await deps.fetchMatches(node.puuid, SEED_FETCH_COUNT, config.tag);
      stats.totalRequests++;
    } catch {
      continue;
    }

    if (!session.candidateChecked.has(node.puuid)) {
      session.candidateChecked.add(node.puuid);
      stats.totalCandidates++;
      const qualifying = filterQualifying(seedMatches, config, now);
      if (qualifying.length > 0 && hits.length < targetCount && !excludedPuuids.has(node.puuid)) {
        const hit = buildHit(node.puuid, seedMatches, qualifying, config.championIds);
        hits.push(hit);
        pushProgress('scanning', hit);
      }
    }

    for (const candPuuid of collectCandidates(seedMatches, config.championIds, node.puuid)) {
      enqueueCandidate(session, candPuuid);
    }

    for (const m of seedMatches) {
      for (const seedPuuid of pickSeeds(m, topN)) {
        enqueueSeed(session, seedPuuid, node.depth + 1);
      }
    }

    pushProgress('scanning');
  }

  pushProgress(cancel() ? 'aborted' : 'done');

  return {
    hits,
    aborted: cancel(),
    stats,
  };
}
