import { getSgpAuth } from '../sgp/auth';
import { SgpClient } from '../sgp/client';
import { getHeroByKey } from '../lcu/heroData';
import { getQueueName } from '../match/queueNames';
import { fetchMatchesByPuuid, fetchPlayerRanksByPuuid } from '../match/matchService';
import type {
  LiveBattleInfo,
  LiveBattlePlayer,
  LiveBattleUpdateEvent,
  PlayerMatchDetail,
  PlayerRankSummary,
} from '../../shared/api';
import {
  EMPTY_PLAYER_STATS,
  LivePlayerStore,
  type PlayerHistoryEntry,
  type PlayerStatsSummary,
} from './liveStore';
import { LIVE_PRIORITY, LiveQueue, isLiveQueueAbortError } from './liveQueue';
import {
  captureRosterSnapshot,
  clearRosterSnapshot,
  createLcuClient,
  fetchLiveClientPlayers,
  getRosterSnapshot,
  mergeWithSnapshot,
  parseRosterFromChampSelect,
  parseRosterFromGameflow,
  parseRosterFromLobby,
  supplementTeamsFromLiveClient,
  type RosterPlayer,
} from './liveRoster';
import { stabilizeLiveBattle, type StableLiveBattleSnapshot } from './liveBattleStability';

// 会触发预取的阶段（与 liveWatcher 的 PREFETCH_PHASES 对齐）。
const PREFETCH_PHASES = ['Lobby', 'Matchmaking', 'ReadyCheck', 'ChampSelect'];
// 真正处于对局中的阶段（实时对局页展示这些阶段的数据）。
const LIVE_PHASES = ['ChampSelect', 'GameStart', 'InProgress', 'Reconnect'];
// 已经进入游戏的阶段（不含选人）。
const IN_GAME_PHASES = ['GameStart', 'InProgress', 'Reconnect'];

const RECENT_MATCH_COUNT = 50;
const LIVE_BATTLE_STALE_TTL_MS = 30_000;
const PLAYER_IDENTITY_TIMEOUT_MS = 5_000;
const PLAYER_STATS_TIMEOUT_MS = 8_000;
const PLAYER_RANK_TIMEOUT_MS = 5_000;

const QUEUE_LIMITS = { 'match-history': 2, misc: 4 } as const;

const store = new LivePlayerStore();
const queue = new LiveQueue(QUEUE_LIMITS);

let stableSnapshot: StableLiveBattleSnapshot | null = null;
let currentPhase = 'None';
let currentQueueName = '';
let currentMapName = '';
let currentMyPuuid = '';
// 当前名单所属的对局 id（选人 / 对局阶段才有，大厅阶段为 0）。
let currentGameId = 0;
let currentRoster: { myTeam: RosterPlayer[]; enemyTeam: RosterPlayer[] } = {
  myTeam: [],
  enemyTeam: [],
};
let loadGeneration = 0;
let loading = false;
let pendingPhase: string | null = null;
const pendingPlayers = new Set<string>();
const listeners = new Set<(event: LiveBattleUpdateEvent) => void>();
const matchDetailCache = new Map<string, PlayerMatchDetail>();

function matchDetailKey(gameId: number, puuid: string): string {
  return `${gameId}:${puuid}`;
}

// 战绩行点击后再取完整 10 人数据。首次查询写入本次会话缓存，后续重复打开不再请求。
export async function getLiveMatchDetail(
  gameId: number,
  puuid: string,
): Promise<PlayerMatchDetail | null> {
  const key = matchDetailKey(gameId, puuid);
  const cached = matchDetailCache.get(key);
  if (cached) return cached;

  const matches = await fetchMatchesByPuuid(puuid, RECENT_MATCH_COUNT);
  const match = matches.find((candidate) => candidate.gameId === gameId) ?? null;
  if (match) matchDetailCache.set(key, match);
  return match;
}

export function subscribeLiveBattleUpdates(
  listener: (event: LiveBattleUpdateEvent) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// 每条推送都带上当前会话编号，前端用它丢掉上一局迟到的数据。
function emitUpdate(event: LiveBattleUpdateEvent): void {
  const stamped: LiveBattleUpdateEvent = { ...event, session: loadGeneration };
  for (const listener of listeners) {
    try {
      listener(stamped);
    } catch (error) {
      console.warn('[live] update listener failed:', error);
    }
  }
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}时`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天`;
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}-${date.getDate()}`;
}

class LiveRequestTimeoutError extends Error {
  constructor(label: string) {
    super(`${label} timed out`);
    this.name = 'LiveRequestTimeoutError';
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  onTimeout: () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new LiveRequestTimeoutError(label));
      onTimeout();
    }, timeoutMs);
    promise
      .then((value) => resolve(value))
      .catch(reject)
      .finally(() => clearTimeout(timer));
  });
}

// ---------------------------------------------------------------------------
// SGP 战绩：一次请求拿回该玩家近期全部战绩
// ---------------------------------------------------------------------------

interface SgpLiveParticipant {
  [key: string]: unknown;
  puuid?: string;
  kills?: number;
  deaths?: number;
  assists?: number;
  win?: boolean;
  championId?: number;
  championName?: string;
  teamId?: number;
  challenges?: Record<string, unknown>;
}

interface SgpLiveGame {
  json?: {
    gameId?: number;
    gameCreation?: number;
    gameDuration?: number;
    queueId?: number;
    participants?: SgpLiveParticipant[];
  };
}

function liveStat(participant: SgpLiveParticipant, key: string): number {
  const rawValue = participant[key] ?? participant.challenges?.[key];
  const value = Number(rawValue ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function liveCs(participant: SgpLiveParticipant): number {
  return liveStat(participant, 'totalMinionsKilled') + liveStat(participant, 'neutralMinionsKilled');
}

function ratio(value: number, total: number): number {
  return total > 0 ? value / total : 0;
}

// 只取目标玩家那一条，避免为 10 个参与者做完整字段映射（原实现的开销来源之一）。
function buildHistoryFromSgp(games: SgpLiveGame[], puuid: string): PlayerStatsSummary {
  let totalKills = 0;
  let totalDeaths = 0;
  let totalAssists = 0;
  let wins = 0;
  const history: PlayerHistoryEntry[] = [];

  for (const game of games) {
    const json = game.json;
    if (!json) continue;
    const me = (json.participants ?? []).find((p) => p.puuid === puuid);
    if (!me) continue;

    const kills = Number(me.kills ?? 0);
    const deaths = Number(me.deaths ?? 0);
    const assists = Number(me.assists ?? 0);
    const win = Boolean(me.win);

    totalKills += kills;
    totalDeaths += deaths;
    totalAssists += assists;
    if (win) wins += 1;

    const championId = Number(me.championId ?? 0);
    const hero = getHeroByKey(championId);
    const allParticipants = json.participants ?? [];
    const teammates = allParticipants.filter((participant) => Number(participant.teamId ?? 0) === Number(me.teamId ?? 0));
    const duration = Math.max(1, Number(json.gameDuration ?? 0));
    const championDamage = liveStat(me, 'totalDamageDealtToChampions');
    const damageTaken = liveStat(me, 'totalDamageTaken');
    const goldEarned = liveStat(me, 'goldEarned');
    const cs = liveCs(me);
    const turretDamage = liveStat(me, 'damageDealtToTurrets');
    const visionScore = liveStat(me, 'visionScore');
    const teamKills = teammates.reduce((sum, participant) => sum + liveStat(participant, 'kills'), 0);
    const teamDamage = teammates.reduce((sum, participant) => sum + liveStat(participant, 'totalDamageDealtToChampions'), 0);
    const teamDamageTaken = teammates.reduce((sum, participant) => sum + liveStat(participant, 'totalDamageTaken'), 0);
    const teamGold = teammates.reduce((sum, participant) => sum + liveStat(participant, 'goldEarned'), 0);
    const teamCs = teammates.reduce((sum, participant) => sum + liveCs(participant), 0);
    const teamVision = teammates.reduce((sum, participant) => sum + liveStat(participant, 'visionScore'), 0);
    const teamTurretDamage = teammates.reduce((sum, participant) => sum + liveStat(participant, 'damageDealtToTurrets'), 0);
    const max = (list: SgpLiveParticipant[], getter: (participant: SgpLiveParticipant) => number) => Math.max(0, ...list.map(getter));

    history.push({
      gameId: Number(json.gameId ?? 0),
      teamId: Number(me.teamId ?? 0),
      championId,
      championName: hero?.name || me.championName || `英雄${championId}`,
      championAlias: hero?.alias ?? '',
      queueName: getQueueName(Number(json.queueId ?? 0)),
      kills,
      deaths,
      assists,
      win,
      timeStr: formatTimeAgo(Number(json.gameCreation ?? 0)),
      performance: {
        duration,
        championDamage,
        damageTaken,
        goldEarned,
        cs,
        turretDamage,
        visionScore,
        killParticipation: liveStat(me, 'killParticipation') || ratio(kills + assists, teamKills),
        soloKills: liveStat(me, 'soloKills'),
        enemyMissingPings: liveStat(me, 'enemyMissingPings'),
        teamVisionPercentage: ratio(visionScore, teamVision),
        damageGoldEfficiency: ratio(championDamage, goldEarned),
        teamDamagePercentage: ratio(championDamage, teamDamage),
        relativeTeamDamage: ratio(championDamage, max(teammates, (participant) => liveStat(participant, 'totalDamageDealtToChampions'))),
        relativeGlobalDamage: ratio(championDamage, max(allParticipants, (participant) => liveStat(participant, 'totalDamageDealtToChampions'))),
        teamDamageTakenPercentage: ratio(damageTaken, teamDamageTaken),
        relativeTeamDamageTaken: ratio(damageTaken, max(teammates, (participant) => liveStat(participant, 'totalDamageTaken'))),
        relativeGlobalDamageTaken: ratio(damageTaken, max(allParticipants, (participant) => liveStat(participant, 'totalDamageTaken'))),
        teamGoldPercentage: ratio(goldEarned, teamGold),
        relativeTeamGold: ratio(goldEarned, max(teammates, (participant) => liveStat(participant, 'goldEarned'))),
        relativeGlobalGold: ratio(goldEarned, max(allParticipants, (participant) => liveStat(participant, 'goldEarned'))),
        csPerMinute: cs / Math.max(1, duration / 60),
        teamCsPercentage: ratio(cs, teamCs),
        relativeTeamCs: ratio(cs, max(teammates, liveCs)),
        relativeGlobalCs: ratio(cs, max(allParticipants, liveCs)),
        teamTurretDamagePercentage: ratio(turretDamage, teamTurretDamage),
        relativeTeamTurretDamage: ratio(turretDamage, max(teammates, (participant) => liveStat(participant, 'damageDealtToTurrets'))),
        relativeGlobalTurretDamage: ratio(turretDamage, max(allParticipants, (participant) => liveStat(participant, 'damageDealtToTurrets'))),
      },
    });
  }

  const count = history.length || 1;
  return {
    kda: Math.round(((totalKills + totalAssists) / Math.max(1, totalDeaths)) * 100) / 100,
    winRate: Math.round((wins / count) * 100),
    history,
  };
}

async function fetchMatchHistoryFromSgp(
  puuid: string,
  signal: AbortSignal,
): Promise<PlayerStatsSummary> {
  const auth = await getSgpAuth({ validateSession: false });
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  const client = new SgpClient(auth);
  const resp = await client.get<{ games?: SgpLiveGame[] }>(
    `/match-history-query/v1/products/lol/player/${encodeURIComponent(puuid)}/SUMMARY`,
    { startIndex: 0, count: RECENT_MATCH_COUNT },
    { signal },
  );

  return buildHistoryFromSgp(resp.games ?? [], puuid);
}

function buildHistoryFromLcu(
  matches: Array<Record<string, unknown>>,
  puuid: string,
): PlayerStatsSummary {
  const games: SgpLiveGame[] = matches.map((match) => {
    const participants = (match.participants as Array<Record<string, unknown>>) ?? [];
    const identities = (match.participantIdentities as Array<Record<string, unknown>>) ?? [];
    const identity = identities.find(
      (entry) => ((entry.player as Record<string, unknown>)?.puuid as string) === puuid,
    );
    const participantId = Number(identity?.participantId ?? 0);

    return {
      json: {
        gameId: Number(match.gameId ?? 0),
        gameCreation: Number(match.gameCreation ?? 0),
        queueId: Number(match.queueId ?? 0),
        gameDuration: Number(match.gameDuration ?? 0),
        participants: participants.map((participant) => {
          const currentId = Number(participant.participantId ?? 0);
          const currentIdentity = identities.find((entry) => Number(entry.participantId ?? 0) === currentId);
          const currentPlayer = (currentIdentity?.player as Record<string, unknown>) ?? {};
          const currentStats = (participant.stats as Record<string, unknown>) ?? {};
          return {
            ...currentStats,
            puuid: String(currentPlayer.puuid ?? (currentId === participantId ? puuid : '')),
            championId: Number(participant.championId ?? 0),
            teamId: Number(participant.teamId ?? 0),
          };
        }),
      },
    };
  });

  return buildHistoryFromSgp(games, puuid);
}

async function fetchMatchHistoryFromLcu(
  puuid: string,
  signal: AbortSignal,
): Promise<PlayerStatsSummary> {
  const client = createLcuClient();
  const response = await client.get<Record<string, unknown>>(
    `/lol-match-history/v1/products/lol/${encodeURIComponent(puuid)}/matches?begIndex=0&endIndex=${RECENT_MATCH_COUNT}`,
    { signal },
  );
  const games = ((response.games as Record<string, unknown>)?.games as Array<Record<string, unknown>>)
    ?? [];
  return buildHistoryFromLcu(games, puuid);
}

async function fetchMatchHistory(
  puuid: string,
  signal: AbortSignal,
): Promise<PlayerStatsSummary> {
  try {
    return await fetchMatchHistoryFromSgp(puuid, signal);
  } catch (error) {
    if (signal.aborted) throw error;
    console.warn('[live] SGP 战绩不可用，回退 LCU:', puuid, error);
    return fetchMatchHistoryFromLcu(puuid, signal);
  }
}

// 战绩拉取：命中缓存直接返回，否则走队列（限流 + 可取消）。
async function loadMatchHistory(
  puuid: string,
  generation: number,
  rosterKey: string,
): Promise<PlayerStatsSummary> {
  const cached = store.getMatchHistory(puuid);
  if (cached) {
    store.setLoadState(`${puuid}:history`, 'loaded');
    return cached;
  }

  const stateKey = `${puuid}:history`;
  store.setLoadState(stateKey, 'loading');

  const taskId = `match-history:${puuid}`;
  const task = queue.add(
    'match-history',
    taskId,
    (signal) => fetchMatchHistory(puuid, signal),
    {
      priority: LIVE_PRIORITY.MATCH_HISTORY,
      tags: [puuid, rosterKey, 'roster-player', 'match-history'],
    },
  );

  // 同 id 任务已在队列中（另一路已经发起），等它即可。
  if (!task) return store.getMatchHistory(puuid) ?? EMPTY_PLAYER_STATS;

  try {
    const stats = await withTimeout(
      task,
      PLAYER_STATS_TIMEOUT_MS,
      taskId,
      () => queue.cancelById(taskId),
    );
    if (generation !== loadGeneration) return stats;
    store.setMatchHistory(puuid, stats);
    store.setLoadState(stateKey, 'loaded');
    return stats;
  } catch (error) {
    // 名单变化/离开对局导致的取消不是失败，尤其不能在 reset 清空后再写回 failed。
    if (isLiveQueueAbortError(error) || generation !== loadGeneration) {
      return store.getMatchHistory(puuid) ?? EMPTY_PLAYER_STATS;
    }
    console.warn('[live] 战绩拉取失败:', puuid, error);
    store.setLoadState(stateKey, 'failed');
    return store.getMatchHistory(puuid) ?? EMPTY_PLAYER_STATS;
  }
}

// ---------------------------------------------------------------------------
// 玩家身份 + 段位
// ---------------------------------------------------------------------------

interface ResolvedIdentity {
  puuid: string;
  summonerId: number;
  riotId: string;
  gameName: string;
  tagLine: string;
  summonerLevel: number;
  profileIconId: number;
  privacy?: string;
}

function fallbackIdentity(roster: RosterPlayer): ResolvedIdentity {
  const hint = roster.riotIdHint ?? '';
  const separator = hint.lastIndexOf('#');
  const gameName = separator > 0 ? hint.slice(0, separator) : roster.gameNameHint || '';
  const tagLine = separator > 0 ? hint.slice(separator + 1) : '';

  return {
    puuid: roster.puuid,
    summonerId: roster.summonerId,
    riotId: hint || gameName || `玩家${roster.summonerId || '?'}`,
    gameName: gameName || `玩家${roster.summonerId || '?'}`,
    tagLine,
    summonerLevel: 0,
    profileIconId: 0,
    privacy: '',
  };
}

// 一次调用解决身份：优先 puuid 查（最全），再退到 summonerId，最后用 roster 线索。
// 原实现是 3 次串行尝试，这里改成按可用信息直接选路，去掉不必要的往返。
async function resolveIdentity(
  roster: RosterPlayer,
  rosterKey: string,
): Promise<ResolvedIdentity> {
  const cached = roster.puuid ? store.getIdentity(roster.puuid) : null;
  if (cached) return cached;

  const fallback = fallbackIdentity(roster);

  const applySummoner = (sum: Record<string, unknown>): ResolvedIdentity => ({
    puuid: String(sum.puuid ?? fallback.puuid),
    summonerId: Number(sum.summonerId ?? fallback.summonerId ?? 0),
    riotId: '',
    gameName: String(sum.gameName ?? sum.displayName ?? sum.name ?? fallback.gameName),
    tagLine: String(sum.tagLine ?? fallback.tagLine ?? ''),
    summonerLevel: Number(sum.summonerLevel ?? 0),
    profileIconId: Number(sum.profileIconId ?? 0),
    privacy: String(sum.privacy ?? ''),
  });

  const finalize = (identity: ResolvedIdentity): ResolvedIdentity => {
    const riotId = identity.tagLine && !identity.gameName.includes('#')
      ? `${identity.gameName}#${identity.tagLine}`
      : identity.gameName;
    const resolved = { ...identity, riotId };
    if (resolved.puuid) store.setIdentity(resolved.puuid, resolved);
    return resolved;
  };

  const taskId = `summoner:${roster.puuid || roster.summonerId || rosterKey}`;
  const task = queue.add(
    'misc',
    taskId,
    async (signal) => {
      const client = createLcuClient();

      // 1. 有 puuid 就走 puuid 端点（能一次拿到名字 + 等级 + 头像）。
      if (roster.puuid) {
        for (const path of [
          `/lol-summoner/v2/summoners/puuid/${encodeURIComponent(roster.puuid)}`,
          `/lol-summoner/v1/summoners/puuid/${encodeURIComponent(roster.puuid)}`,
        ]) {
          try {
            return finalize(applySummoner(await client.get<Record<string, unknown>>(path, { signal })));
          } catch {
            if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
            // 不同客户端版本支持的路径不同，继续尝试下一个。
          }
        }
      }

      // 2. 只有 summonerId 就用 summonerId 端点。
      if (roster.summonerId > 0) {
        try {
          const sum = await client.get<Record<string, unknown>>(
            `/lol-summoner/v1/summoners/${roster.summonerId}`,
            { signal },
          );
          const identity = applySummoner(sum);
          return finalize({
            ...identity,
            tagLine: identity.tagLine || fallback.tagLine,
          });
        } catch {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          // 落到线索兜底。
        }
      }

      // 兜底身份不写入长 TTL 缓存，否则一次瞬时 LCU 失败会让占位名保留 30 分钟。
      return fallback;
    },
    {
      priority: LIVE_PRIORITY.SUMMONER,
      tags: [rosterKey, 'roster-player', 'summoner'],
    },
  );

  if (!task) return fallback;

  try {
    return await withTimeout(
      task,
      PLAYER_IDENTITY_TIMEOUT_MS,
      taskId,
      () => queue.cancelById(taskId),
    );
  } catch (error) {
    if (!isLiveQueueAbortError(error) && !(error instanceof LiveRequestTimeoutError)) {
      console.warn('[live] 玩家身份拉取失败:', roster.puuid || roster.summonerId, error);
    }
    return fallback;
  }
}

// 拉取玩家全部队列段位（单双排 / 灵活组排）。
// matchService 内部有缓存与在途去重，多要几个队列不会多打请求。
async function loadRanks(
  puuid: string,
  generation: number,
  rosterKey: string,
): Promise<PlayerRankSummary[]> {
  if (!puuid) return [];
  const cached = store.getRankedList(puuid);
  if (cached !== undefined) {
    store.setLoadState(`${puuid}:rank`, 'loaded');
    return cached;
  }

  const stateKey = `${puuid}:rank`;
  store.setLoadState(stateKey, 'loading');

  const taskId = `rank:${puuid}`;
  const task = queue.add(
    'misc',
    taskId,
    (signal) => fetchPlayerRanksByPuuid(puuid, undefined, { signal }),
    {
      priority: LIVE_PRIORITY.RANK,
      tags: [puuid, rosterKey, 'roster-player', 'ranked-stats'],
    },
  );
  if (!task) return store.getRankedList(puuid) ?? [];

  try {
    const ranks = await withTimeout(
      task,
      PLAYER_RANK_TIMEOUT_MS,
      taskId,
      () => queue.cancelById(taskId),
    );
    if (generation !== loadGeneration) return ranks;
    store.setRankedList(puuid, ranks);
    store.setRankedStats(puuid, pickDisplayRank(ranks));
    store.setLoadState(stateKey, 'loaded');
    return ranks;
  } catch (error) {
    if (isLiveQueueAbortError(error) || generation !== loadGeneration) {
      return store.getRankedList(puuid) ?? [];
    }
    console.warn('[live] 段位拉取失败:', puuid, error);
    store.setLoadState(stateKey, 'failed');
    return [];
  }
}

// 卡片主段位：优先单双排，其次灵活组排，再退到任意一条。
function pickDisplayRank(ranks: PlayerRankSummary[]): PlayerRankSummary | null {
  return (
    ranks.find((rank) => rank.queueType === 'RANKED_SOLO_5x5')
    ?? ranks.find((rank) => rank.queueType === 'RANKED_FLEX_SR')
    ?? ranks[0]
    ?? null
  );
}

// ---------------------------------------------------------------------------
// 组装单个玩家
// ---------------------------------------------------------------------------

function assemblePlayer(
  roster: RosterPlayer,
  identity: ResolvedIdentity,
  stats: PlayerStatsSummary,
  ranks: PlayerRankSummary[],
): LiveBattlePlayer {
  const hero = getHeroByKey(roster.championId);
  const statePuuid = identity.puuid || roster.puuid;

  return {
    puuid: identity.puuid || roster.puuid,
    summonerId: identity.summonerId || roster.summonerId,
    riotId: identity.riotId,
    gameName: identity.gameName,
    championId: roster.championId,
    championName: hero?.name ?? `英雄${roster.championId}`,
    championAlias: hero?.alias ?? '',
    teamId: roster.teamId,
    premadeId: roster.premadeId,
    summonerLevel: identity.summonerLevel,
    profileIconId: identity.profileIconId,
    privacy: identity.privacy,
    position: roster.position,
    rank: pickDisplayRank(ranks),
    ranks,
    kda: stats.kda,
    winRate: stats.winRate,
    matchCount: stats.history.length,
    loadState: {
      history: statePuuid ? store.getLoadState(`${statePuuid}:history`) : 'idle',
      rank: statePuuid ? store.getLoadState(`${statePuuid}:rank`) : 'idle',
    },
    history: stats.history,
  };
}

type LiveBattleSide = 'my' | 'enemy';

function findCurrentRosterPlayer(
  side: LiveBattleSide,
  rosterKey: string,
): RosterPlayer | null {
  const team = side === 'my' ? currentRoster.myTeam : currentRoster.enemyTeam;
  return team.find((candidate, index) => rosterTaskKey(side, candidate, index) === rosterKey) ?? null;
}

function emitCurrentPlayer(
  side: LiveBattleSide,
  rosterKey: string,
  identity: ResolvedIdentity,
  generation: number,
): boolean {
  if (generation !== loadGeneration) return false;
  const roster = findCurrentRosterPlayer(side, rosterKey);
  if (!roster) return false;

  const puuid = identity.puuid || roster.puuid;
  const stats = (puuid ? store.getMatchHistory(puuid) : null) ?? EMPTY_PLAYER_STATS;
  const ranks = puuid ? store.getRankedList(puuid) ?? [] : [];
  emitUpdate({
    type: 'player',
    side,
    puuid,
    player: assemblePlayer(roster, identity, stats, ranks),
  });
  return true;
}

// 身份先到先显示；战绩和段位各自完成后再独立推送，避免整张卡等待最慢字段。
async function loadPlayer(
  roster: RosterPlayer,
  side: LiveBattleSide,
  rosterKey: string,
  generation: number,
): Promise<void> {
  if (generation !== loadGeneration) return;

  try {
    const identity = await resolveIdentity(roster, rosterKey);
    if (!findCurrentRosterPlayer(side, rosterKey) || generation !== loadGeneration) return;

    const statsPuuid = identity.puuid || roster.puuid;
    if (!statsPuuid) {
      emitCurrentPlayer(side, rosterKey, identity, generation);
      return;
    }

    const historyPromise = loadMatchHistory(statsPuuid, generation, rosterKey);
    const rankPromise = loadRanks(statsPuuid, generation, rosterKey);

    // 两个加载函数会先同步写入 loading 状态，因此这次推送可以立即展示身份和骨架。
    emitCurrentPlayer(side, rosterKey, identity, generation);

    await Promise.allSettled([
      historyPromise.then(() => emitCurrentPlayer(side, rosterKey, identity, generation)),
      rankPromise.then(() => emitCurrentPlayer(side, rosterKey, identity, generation)),
    ]);
  } catch (error) {
    if (isLiveQueueAbortError(error)) return;
    console.warn('[live] 玩家加载失败:', roster.puuid || roster.summonerId, error);
  } finally {
    pendingPlayers.delete(rosterKey);
  }
}

// ---------------------------------------------------------------------------
// 名单获取
// ---------------------------------------------------------------------------

async function loadRoster(
  phase: string,
): Promise<{
  myTeam: RosterPlayer[];
  enemyTeam: RosterPlayer[];
  queueName: string;
  mapName: string;
  myPuuid: string;
  gameId: number;
}> {
  const client = createLcuClient();
  let myPuuid = '';
  let mySummonerId = 0;
  try {
    const summoner = await client.get<Record<string, unknown>>(
      '/lol-summoner/v1/current-summoner',
    );
    myPuuid = String(summoner.puuid ?? '');
    mySummonerId = Number(summoner.summonerId) || 0;
  } catch {
    // 拿不到 puuid 时用 teamOne 兜底。
  }

  let myTeam: RosterPlayer[] = [];
  let enemyTeam: RosterPlayer[] = [];
  let queueName = '';
  let mapName = '';
  let queueId = 0;
  let gameId = 0;

  if (phase === 'ChampSelect') {
    try {
      const cs = await client.get<Record<string, unknown>>('/lol-champ-select/v1/session');
      const parsed = parseRosterFromChampSelect(cs);
      myTeam = parsed.myTeam;
      enemyTeam = parsed.enemyTeam;
      queueId = parsed.queueId;
      queueName = getQueueName(queueId);
      mapName = parsed.mapName;
      gameId = parsed.gameId;
      if (myTeam.length > 0) {
        captureRosterSnapshot(myTeam, enemyTeam, parsed.gameId, parsed.queueId);
      }
    } catch {
      // 选人阶段偶发读不到，交给对局阶段补。
    }
  } else if (PREFETCH_PHASES.includes(phase)) {
    // 大厅/匹配阶段：先把队友（和自己）的战绩预热起来。
    try {
      const lobby = await client.get<Record<string, unknown>>('/lol-lobby/v2/lobby');
      const parsed = parseRosterFromLobby(lobby, myPuuid, mySummonerId);
      myTeam = parsed.myTeam;
      enemyTeam = parsed.enemyTeam;
      queueName = getQueueName(parsed.queueId);
    } catch {
      // 大厅阶段可能还没建立 lobby。
    }
  } else {
    try {
      const session = await client.get<Record<string, unknown>>('/lol-gameflow/v1/session');
      const parsed = parseRosterFromGameflow(session, myPuuid);
      myTeam = parsed.myTeam;
      enemyTeam = parsed.enemyTeam;
      queueId = parsed.queueId;
      queueName = getQueueName(queueId);
      mapName = parsed.mapName;
      gameId = parsed.gameId;

      // 对局数据缺 puuid 时，用选人阶段存的快照补齐。
      const snapshot = getRosterSnapshot(parsed.gameId);
      if (snapshot) {
        const merged = mergeWithSnapshot({ myTeam, enemyTeam }, snapshot);
        myTeam = merged.myTeam;
        enemyTeam = merged.enemyTeam;
        if (!queueName && snapshot.queueId) queueName = getQueueName(snapshot.queueId);
      }
    } catch {
      // GameStart 阶段 gameflow session 可能短暂不可用，先接住选人快照。
      const snapshot = getRosterSnapshot();
      if (snapshot) {
        myTeam = snapshot.myTeam;
        enemyTeam = snapshot.enemyTeam;
        queueId = snapshot.queueId;
        queueName = getQueueName(queueId);
      }
    }

    // 人数不足 10 人时用 Live Client Data 补（敌方身份隐藏的常见场景）。
    if (myTeam.length + enemyTeam.length < 10) {
      try {
        const livePlayers = await fetchLiveClientPlayers();
        const supplemented = supplementTeamsFromLiveClient(myTeam, enemyTeam, livePlayers);
        myTeam = supplemented.myTeam;
        enemyTeam = supplemented.enemyTeam;
      } catch {
        // 2999 只在游戏进程就绪后可用。
      }
    }
  }

  if (!queueName && queueId) queueName = getQueueName(queueId);
  return { myTeam, enemyTeam, queueName, mapName, myPuuid, gameId };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function rosterTaskKey(side: LiveBattleSide, player: RosterPlayer, index: number): string {
  if (player.puuid) return `${side}:puuid:${player.puuid}`;
  if (player.summonerId > 0) return `${side}:summoner:${player.summonerId}`;
  return `${side}:anonymous:${player.championId}:${player.riotIdHint || index}`;
}

// 启动一轮加载。加载期间收到的新相位只保留最新值，避免 Lobby 请求完成后
// 覆盖已经到来的 ChampSelect / GameStart 状态。
export async function startLiveLoad(phase: string): Promise<void> {
  if (loading) {
    pendingPhase = phase;
    return;
  }
  loading = true;
  let phaseToLoad: string | null = phase;

  try {
    while (phaseToLoad) {
      const requestedPhase = phaseToLoad;
      phaseToLoad = null;
      const requestedGeneration = loadGeneration;
      const loadedRoster = await loadRoster(requestedPhase);

      // 读取期间又有更新：旧结果不落地，直接处理最新阶段/名单。
      if (requestedGeneration !== loadGeneration || pendingPhase) {
        phaseToLoad = pendingPhase;
        pendingPhase = null;
        continue;
      }

      // 对局 id 变了却没经过结算阶段（相位事件漏了）：说明已经是新的一局，
      // 先把上一局的名单和缓存清掉，再落新名单。选人快照属于新的一局，保留。
      if (loadedRoster.gameId > 0 && currentGameId > 0 && loadedRoster.gameId !== currentGameId) {
        resetLiveBattle({ keepRosterSnapshot: true });
      }
      if (loadedRoster.gameId > 0) currentGameId = loadedRoster.gameId;
      const generation = loadGeneration;

      const previousTotal = currentRoster.myTeam.length + currentRoster.enemyTeam.length;
      const loadedTotal = loadedRoster.myTeam.length + loadedRoster.enemyTeam.length;
      const keepPreviousRoster = LIVE_PHASES.includes(requestedPhase)
        && previousTotal > 0
        && loadedTotal === 0;
      const roster = keepPreviousRoster
        ? {
            myTeam: currentRoster.myTeam,
            enemyTeam: currentRoster.enemyTeam,
            queueName: loadedRoster.queueName || currentQueueName,
            mapName: loadedRoster.mapName || currentMapName,
            myPuuid: loadedRoster.myPuuid || currentMyPuuid,
          }
        : loadedRoster;

      currentPhase = requestedPhase;
      currentQueueName = roster.queueName;
      currentMapName = roster.mapName;
      if (roster.myPuuid) currentMyPuuid = roster.myPuuid;
      currentRoster = { myTeam: roster.myTeam, enemyTeam: roster.enemyTeam };

      const allPuuids = [...roster.myTeam, ...roster.enemyTeam]
        .map((player) => player.puuid)
        .filter(Boolean);

      // 只清理已经不在场上的玩家；在场玩家的分片原地保留（这就是换人不重拉）。
      const removed = store.retain(allPuuids);
      for (const puuid of removed) {
        emitUpdate({ type: 'removed', puuid });
      }

      const rosterEntries = [
        ...roster.myTeam.map((player, index) => ({ player, side: 'my' as const, index })),
        ...roster.enemyTeam.map((player, index) => ({ player, side: 'enemy' as const, index })),
      ];
      const activeRosterKeys = rosterEntries.map(({ player, side, index }) =>
        rosterTaskKey(side, player, index));

      // 名单一变，取消已下场玩家的身份/战绩/段位任务；运行中的 HTTP 请求也会收到 signal。
      queue.cancelByTagsNotIn('roster-player', activeRosterKeys);

      const tasks: Promise<void>[] = [];
      for (const { player, side, index } of rosterEntries) {
        const key = rosterTaskKey(side, player, index);
        if (pendingPlayers.has(key)) continue;
        pendingPlayers.add(key);
        tasks.push(loadPlayer(player, side, key, generation));
      }

      // 不 await 全部：让每个玩家各自完成各自推送（增量渲染）。
      void Promise.allSettled(tasks);

      phaseToLoad = pendingPhase;
      pendingPhase = null;
    }
  } catch (error) {
    console.warn('[live] 名单加载失败:', error);
  } finally {
    loading = false;
    if (pendingPhase) {
      const latestPhase = pendingPhase;
      pendingPhase = null;
      void startLiveLoad(latestPhase);
    }
  }
}

// 从分片状态组装完整对局信息（给 getBattle 与前端首屏用）。
function assembleBattle(): LiveBattleInfo {
  const toPlayer = (roster: RosterPlayer): LiveBattlePlayer => {
    const identity = (roster.puuid ? store.getIdentity(roster.puuid) : null)
      ?? fallbackIdentity(roster);
    const stats = (roster.puuid ? store.getMatchHistory(roster.puuid) : null)
      ?? EMPTY_PLAYER_STATS;
    const ranks = roster.puuid ? store.getRankedList(roster.puuid) ?? [] : [];
    return assemblePlayer(roster, identity, stats, ranks);
  };

  return {
    inGame: true,
    phase: currentPhase,
    queueName: currentQueueName,
    mapName: currentMapName,
    myPuuid: currentMyPuuid,
    myTeam: currentRoster.myTeam.map(toPlayer),
    enemyTeam: currentRoster.enemyTeam.map(toPlayer),
    session: loadGeneration,
  };
}

// 对外主入口：返回当前快照。数据由 startLiveLoad 在后台增量填充，
// 这里只做组装，不阻塞等待网络。
export async function getLiveBattle(): Promise<LiveBattleInfo> {
  let client;
  try {
    client = createLcuClient();
  } catch (err) {
    return {
      inGame: false,
      phase: 'None',
      queueName: '',
      myTeam: [],
      enemyTeam: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let phase: string;
  try {
    phase = await client.get<string>('/lol-gameflow/v1/gameflow-phase');
  } catch {
    return {
      inGame: false,
      phase: 'Unavailable',
      queueName: '',
      myTeam: [],
      enemyTeam: [],
      error: '实时对局状态暂时不可用',
    };
  }

  phase = phase.replace(/"/g, '');
  const isInGame = LIVE_PHASES.includes(phase);
  if (!isInGame) {
    if (PREFETCH_PHASES.includes(phase)) {
      const hadRoster = currentRoster.myTeam.length + currentRoster.enemyTeam.length > 0;
      await startLiveLoad(phase);
      if (!hadRoster) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      const lobby = assembleBattle();
      return { ...lobby, inGame: false, phase };
    }
    return { inGame: false, phase, queueName: '', myTeam: [], enemyTeam: [], session: loadGeneration };
  }

  // 名单还没建立（首次进入该阶段）→ 触发加载并返回已就绪的部分。
  if (currentRoster.myTeam.length + currentRoster.enemyTeam.length === 0) {
    void startLiveLoad(phase);
    // 给首个玩家一点时间，让首屏尽量不是空的；超时也不阻塞。
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  const battle = assembleBattle();
  const stabilized = stabilizeLiveBattle(
    battle,
    stableSnapshot,
    Date.now(),
    LIVE_BATTLE_STALE_TTL_MS,
  );
  stableSnapshot = stabilized.stable;
  return stabilized.value;
}

// 离开对局/大厅时彻底重置：递增 generation 让在途回调失效，清空分片状态。
// generation 同时就是推给前端的会话编号。
export function resetLiveBattle(options: { keepRosterSnapshot?: boolean } = {}): void {
  loadGeneration += 1;
  queue.clear();
  store.clearSession();
  currentRoster = { myTeam: [], enemyTeam: [] };
  currentQueueName = '';
  currentMapName = '';
  currentMyPuuid = '';
  currentGameId = 0;
  matchDetailCache.clear();
  stableSnapshot = null;
  pendingPhase = null;
  pendingPlayers.clear();
  if (!options.keepRosterSnapshot) clearRosterSnapshot();
  emitUpdate({ type: 'reset' });
}

// 相位变化时调用（由 liveWatcher 驱动）。
//
// 关键设计：Lobby → ChampSelect → GameStart → InProgress 视为同一次会话，
// 期间不清缓存、不递增 generation —— 这样大厅/选人阶段预取到的数据能一路
export function onPhaseChanged(phase: string): void {
  const isLive = LIVE_PHASES.includes(phase);
  const isPrefetch = PREFETCH_PHASES.includes(phase);

  if (!isLive && !isPrefetch) {
    currentPhase = phase;
    resetLiveBattle();
    return;
  }

  // 从对局中直接回到大厅 / 匹配（结算阶段的相位事件漏掉了）：上一局已经结束，先清掉。
  if (IN_GAME_PHASES.includes(currentPhase) && ['Lobby', 'Matchmaking', 'ReadyCheck'].includes(phase)) {
    resetLiveBattle();
  }

  currentPhase = phase;
  void startLiveLoad(phase);
}
