import https from 'node:https';
import { getCachedCredentials } from '../lcu/lockfile';
import { LcuClient } from '../lcu/client';
import { getAllHeroes, getHeroByKey } from '../lcu/heroData';
import { getQueueName } from '../match/queueNames';
import { fetchPlayerRankByPuuid } from '../match/matchService';
import type { LiveBattleInfo, LiveBattlePlayer } from '../../shared/api';
import {
  stabilizeLiveBattle,
  type StableLiveBattleSnapshot,
} from './liveBattleStability';

// 实时对局服务：检测你是否在游戏中，拿 10 人骨架 + 并行战绩。
// 全程走 LCU 本地端点（不走 SGP/2999），因为只有你自己客户端知道你自己的对局。
//
// 流程（参考 my-app/src/main/playerAnalyzer/liveBattle.ts）：
// 1. GET /lol-gameflow/v1/gameflow-phase → 检测游戏阶段
// 2. GET /lol-summoner/v1/current-summoner → 你的 puuid
// 3. GET /lol-gameflow/v1/session → 10 人骨架（puuid/summonerId/championId/teamId）
//    或 ChampSelect 阶段 → GET /lol-champ-select/v1/session → myTeam/theirTeam
// 4. 并行 GET /lol-summoner/v1/summoners/{summonerId} → 10 人 Riot ID
// 5. 并行 GET /lol-match-history/.../matches → 10 人最近 24 场战绩（算 KDA/胜率 + 前端分页）

const RECENT_MATCH_COUNT = 24;
const LIVE_BATTLE_CACHE_TTL_MS = 15_000;
const LIVE_BATTLE_EMPTY_CACHE_TTL_MS = 2_000;
const LIVE_BATTLE_STALE_TTL_MS = 30_000;
const PLAYER_STATS_CACHE_TTL_MS = 120_000;
const PLAYER_STATS_QUICK_TIMEOUT_MS = 4_500;
const PLAYER_RANK_QUICK_TIMEOUT_MS = 3_200;
let liveBattleCache: { expiresAt: number; value: LiveBattleInfo } | null = null;
let liveBattleInFlight: Promise<LiveBattleInfo> | null = null;
let stableLiveBattle: StableLiveBattleSnapshot | null = null;
let liveBattleCacheVersion = 0;

type PlayerStatsSummary = {
  kda: number;
  winRate: number;
  history: LiveBattlePlayer['history'];
};

const EMPTY_PLAYER_STATS: PlayerStatsSummary = {
  kda: 0,
  winRate: 0,
  history: [],
};

const playerStatsCache = new Map<string, { expiresAt: number; value: PlayerStatsSummary }>();
const playerStatsInFlight = new Map<string, Promise<PlayerStatsSummary>>();

export function invalidateLiveBattleCache(): void {
  liveBattleCache = null;
  liveBattleCacheVersion += 1;
}

function createLcuClient(): LcuClient {
  const creds = getCachedCredentials();
  if (!creds) throw new Error('未检测到 LOL 客户端');
  return new LcuClient(creds);
}

// 计算时间显示（X天前/X小时前/X分钟前）
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

// 从 match-history 列表计算 KDA/胜率 + 提取历史摘要
function calcPlayerStats(
  matches: Array<Record<string, unknown>>,
  puuid: string,
): PlayerStatsSummary {
  let totalKills = 0;
  let totalDeaths = 0;
  let totalAssists = 0;
  let wins = 0;
  const history: LiveBattlePlayer['history'] = [];

  for (const match of matches) {
    const participants = (match.participants as Array<Record<string, unknown>>) ?? [];
    const participantIdentities = (match.participantIdentities as Array<Record<string, unknown>>) ?? [];

    // 找到自己的 participantId
    const identity = participantIdentities.find(
      (id) => ((id.player as Record<string, unknown>)?.puuid as string) === puuid,
    );
    const pid = identity?.participantId as number | undefined;
    const me = participants.find((p) => p.participantId === pid);
    if (!me) continue;

    const stats = (me.stats as Record<string, unknown>) ?? {};
    const kills = Number(stats.kills ?? 0);
    const deaths = Number(stats.deaths ?? 0);
    const assists = Number(stats.assists ?? 0);
    const win = Boolean(stats.win);

    totalKills += kills;
    totalDeaths += deaths;
    totalAssists += assists;
    if (win) wins++;

    const championId = Number(me.championId ?? 0);
    const hero = getHeroByKey(championId);
    const gameId = Number(match.gameId ?? 0);
    const teamId = Number(me.teamId ?? 0);
    const queueId = Number(match.queueId ?? 0);
    const creation = Number(match.gameCreation ?? 0);

    history.push({
      gameId,
      teamId,
      championId,
      championName: hero?.name ?? `英雄${championId}`,
      championAlias: hero?.alias ?? '',
      queueName: getQueueName(queueId),
      kills,
      deaths,
      assists,
      win,
      timeStr: formatTimeAgo(creation),
    });
  }

  const count = history.length || 1;
  const kda = Math.round(((totalKills + totalAssists) / Math.max(1, totalDeaths)) * 100) / 100;
  const winRate = Math.round((wins / count) * 100);

  return { kda, winRate, history };
}

// 从 gameflow session 解析玩家骨架
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    promise
      .then((value) => resolve(value))
      .catch(() => resolve(fallback))
      .finally(() => clearTimeout(timer));
  });
}

async function fetchPlayerStats(
  client: LcuClient,
  puuid: string,
): Promise<PlayerStatsSummary> {
  const matchResp = await client.get<Record<string, unknown>>(
    `/lol-match-history/v1/products/lol/${puuid}/matches?begIndex=0&endIndex=${RECENT_MATCH_COUNT}`,
  );
  const games = ((matchResp.games as Record<string, unknown>)?.games as Array<Record<string, unknown>>) ?? [];
  return calcPlayerStats(games, puuid);
}

function getCachedPlayerStats(puuid: string): PlayerStatsSummary | null {
  const cached = playerStatsCache.get(puuid);
  if (!cached || cached.expiresAt <= Date.now()) {
    if (cached) playerStatsCache.delete(puuid);
    return null;
  }
  return structuredClone(cached.value);
}

function getPlayerStats(client: LcuClient, puuid: string): Promise<PlayerStatsSummary> {
  const cached = getCachedPlayerStats(puuid);
  if (cached) return Promise.resolve(cached);

  const inFlight = playerStatsInFlight.get(puuid);
  if (inFlight) return inFlight;

  const request = fetchPlayerStats(client, puuid)
    .then((value) => {
      playerStatsCache.set(puuid, {
        expiresAt: Date.now() + PLAYER_STATS_CACHE_TTL_MS,
        value,
      });
      return value;
    })
    .catch(() => EMPTY_PLAYER_STATS)
    .finally(() => {
      playerStatsInFlight.delete(puuid);
    });

  playerStatsInFlight.set(puuid, request);
  return request;
}

interface PlayerSkeleton {
  puuid: string;
  summonerId: number;
  championId: number;
  teamId: number;
  riotIdHint?: string;
  gameNameHint?: string;
  premadeId?: string;
  position?: string;
}

interface LiveClientPlayer {
  team?: string;
  championName?: string;
  riotId?: string;
  summonerName?: string;
}

function fetchLiveClientPlayers(): Promise<LiveClientPlayer[]> {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: '127.0.0.1',
        port: 2999,
        path: '/liveclientdata/playerlist',
        method: 'GET',
        rejectUnauthorized: false,
      },
      (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          raw += chunk;
        });
        response.on('end', () => {
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Live Client Data HTTP ${response.statusCode ?? 0}`));
            return;
          }
          try {
            const parsed = JSON.parse(raw) as unknown;
            resolve(Array.isArray(parsed) ? parsed as LiveClientPlayer[] : []);
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.setTimeout(1_500, () => request.destroy(new Error('Live Client Data timeout')));
    request.on('error', reject);
    request.end();
  });
}

function liveChampionId(player: LiveClientPlayer): number {
  const name = String(player.championName ?? '').trim();
  if (!name) return 0;
  return getAllHeroes().find((hero) => hero.name === name || hero.alias === name)?.id ?? 0;
}

function liveRiotId(player: LiveClientPlayer): string {
  const riotId = String(player.riotId ?? '').trim();
  if (riotId && riotId !== '#' && !riotId.startsWith('#')) return riotId;

  const summonerName = String(player.summonerName ?? '').trim();
  return summonerName.includes('#') && !summonerName.startsWith('#') ? summonerName : '';
}

function supplementTeamFromLiveClient(
  skeletons: PlayerSkeleton[],
  livePlayers: LiveClientPlayer[],
  teamId: number,
): PlayerSkeleton[] {
  const usedLivePlayers = new Set<number>();

  for (const skeleton of skeletons) {
    const matchIndex = livePlayers.findIndex(
      (player, index) => !usedLivePlayers.has(index) && liveChampionId(player) === skeleton.championId,
    );
    if (matchIndex >= 0) usedLivePlayers.add(matchIndex);
  }

  const supplemented = [...skeletons];
  livePlayers.forEach((player, index) => {
    if (usedLivePlayers.has(index)) return;
    const championId = liveChampionId(player);
    const riotIdHint = liveRiotId(player);
    supplemented.push({
      puuid: '',
      summonerId: 0,
      championId,
      teamId,
      riotIdHint,
      gameNameHint: riotIdHint.split('#')[0] || '身份隐藏',
    });
  });

  return supplemented.slice(0, livePlayers.length || skeletons.length);
}

function supplementTeamsFromLiveClient(
  myTeam: PlayerSkeleton[],
  enemyTeam: PlayerSkeleton[],
  livePlayers: LiveClientPlayer[],
): { myTeam: PlayerSkeleton[]; enemyTeam: PlayerSkeleton[] } {
  const order = livePlayers.filter((player) => player.team === 'ORDER');
  const chaos = livePlayers.filter((player) => player.team === 'CHAOS');
  if (order.length === 0 || chaos.length === 0) return { myTeam, enemyTeam };

  const myChampionIds = new Set(myTeam.map((player) => player.championId).filter(Boolean));
  const overlap = (players: LiveClientPlayer[]) => players.reduce(
    (count, player) => count + (myChampionIds.has(liveChampionId(player)) ? 1 : 0),
    0,
  );
  const orderOverlap = overlap(order);
  const chaosOverlap = overlap(chaos);
  if (orderOverlap === chaosOverlap) return { myTeam, enemyTeam };

  const myLiveTeam = orderOverlap > chaosOverlap ? order : chaos;
  const enemyLiveTeam = orderOverlap > chaosOverlap ? chaos : order;
  return {
    myTeam: supplementTeamFromLiveClient(myTeam, myLiveTeam, myTeam[0]?.teamId ?? 100),
    enemyTeam: supplementTeamFromLiveClient(enemyTeam, enemyLiveTeam, enemyTeam[0]?.teamId ?? 200),
  };
}

function currentPartyId(player: Record<string, unknown>): string | undefined {
  const raw = player.teamParticipantId ?? player.premadeId ?? player.partyId;
  if (raw === undefined || raw === null) return undefined;
  const value = String(raw).trim();
  return value && value !== '0' ? value : undefined;
}

function currentPosition(player: Record<string, unknown>): string | undefined {
  const raw = player.assignedPosition ?? player.selectedPosition ?? player.position ?? player.lane;
  const value = String(raw ?? '').trim();
  return value || undefined;
}

function parseTeamFromGameflow(
  session: Record<string, unknown>,
  myPuuid: string,
): { myTeam: PlayerSkeleton[]; enemyTeam: PlayerSkeleton[] } {
  const gameData = (session.gameData as Record<string, unknown>) ?? {};
  const teamOne = (gameData.teamOne as Array<Record<string, unknown>>) ?? [];
  const teamTwo = (gameData.teamTwo as Array<Record<string, unknown>>) ?? [];

  const toSkeleton = (players: Array<Record<string, unknown>>, teamId: number): PlayerSkeleton[] =>
    players.map((p) => ({
      puuid: String(p.puuid ?? ''),
      summonerId: Number(p.summonerId ?? 0),
      championId: Number(p.championId ?? 0),
      teamId,
      premadeId: currentPartyId(p),
      position: currentPosition(p),
    }));

  const t1 = toSkeleton(teamOne, 100);
  const t2 = toSkeleton(teamTwo, 200);

  // 我在哪队
  const inT1 = t1.some((p) => p.puuid === myPuuid);
  return {
    myTeam: inT1 ? t1 : t2,
    enemyTeam: inT1 ? t2 : t1,
  };
}

// 从 ChampSelect session 解析
function parseTeamFromChampSelect(
  csSession: Record<string, unknown>,
): { myTeam: PlayerSkeleton[]; enemyTeam: PlayerSkeleton[] } {
  const myTeamRaw = (csSession.myTeam as Array<Record<string, unknown>>) ?? [];
  const theirTeamRaw = (csSession.theirTeam as Array<Record<string, unknown>>) ?? [];

  const toSkeleton = (players: Array<Record<string, unknown>>, teamId: number): PlayerSkeleton[] =>
    players
      .filter((p) => Number(p.cellId) >= 0 || Number(p.championId) > 0)
      .map((p) => ({
        puuid: String(p.puuid ?? ''),
        summonerId: Number(p.summonerId ?? 0),
        championId: Number(p.championId ?? 0),
        teamId,
        premadeId: currentPartyId(p),
        position: currentPosition(p),
      }));

  return {
    myTeam: toSkeleton(myTeamRaw, 100),
    enemyTeam: toSkeleton(theirTeamRaw, 200),
  };
}

// 并行补全玩家信息（Riot ID + 战绩）
async function enrichPlayers(
  client: LcuClient,
  skeletons: PlayerSkeleton[],
): Promise<LiveBattlePlayer[]> {
  // 并行拉每个玩家的召唤师名 + 战绩
  const enriched = await Promise.all(
    skeletons.map(async (s): Promise<LiveBattlePlayer> => {
      // 默认值
      let gameName = s.gameNameHint || `玩家${s.summonerId || '?'}`;
      const hintSeparator = s.riotIdHint?.lastIndexOf('#') ?? -1;
      let tagLine = hintSeparator > 0 ? s.riotIdHint?.slice(hintSeparator + 1) ?? '' : '';
      if (hintSeparator > 0) gameName = s.riotIdHint?.slice(0, hintSeparator) || gameName;
      let championName = `英雄${s.championId}`;
      let summonerLevel = 0;

      if (s.summonerId <= 0 && s.riotIdHint) {
        try {
          const sum = await client.get<Record<string, unknown>>(
            `/lol-summoner/v1/summoners?name=${encodeURIComponent(s.riotIdHint)}`,
          );
          s.summonerId = Number(sum.summonerId ?? sum.id ?? 0);
          s.puuid = String(sum.puuid ?? s.puuid);
          gameName = (sum.gameName as string) || (sum.name as string) || gameName;
          tagLine = (sum.tagLine as string) || tagLine;
          summonerLevel = Number(sum.summonerLevel ?? 0);
        } catch {
          // The live game API may intentionally hide an opponent's identity.
        }
      }

      // 召唤师名（通过 summonerId）
      if (s.summonerId > 0) {
        try {
          const sum = await client.get<Record<string, unknown>>(
            `/lol-summoner/v1/summoners/${s.summonerId}`,
          );
          gameName = (sum.gameName as string) || (sum.name as string) || gameName;
          tagLine = (sum.tagLine as string) || tagLine;
          summonerLevel = Number(sum.summonerLevel ?? 0);
          if (!s.puuid) s.puuid = (sum.puuid as string) ?? s.puuid;
        } catch {
          // 下方统一通过 PUUID 回退。
        }
      }

      // 部分客户端的 summonerId 接口只给名字，不给 tagLine。
      if (s.puuid && !tagLine && !gameName.includes('#')) {
        try {
          const sum = await client.get<Record<string, unknown>>(
            `/lol-summoner/v2/summoners/puuid/${encodeURIComponent(s.puuid)}`,
          );
          gameName = (sum.gameName as string) || (sum.name as string) || gameName;
          tagLine = (sum.tagLine as string) || tagLine;
          summonerLevel = Number(sum.summonerLevel ?? summonerLevel);
        } catch {
          // 保留 summonerId 接口已经拿到的名字。
        }
      }
      const riotId = tagLine && !gameName.includes('#') ? `${gameName}#${tagLine}` : gameName;

      // 英雄名
      const hero = getHeroByKey(s.championId);
      championName = hero?.name ?? championName;
      const championAlias = hero?.alias ?? '';

      // 战绩（最近 N 场）
      let kda = 0;
      let winRate = 0;
      let history: LiveBattlePlayer['history'] = [];
      let rank: LiveBattlePlayer['rank'] = null;
      if (s.puuid) {
        const cachedStats = getCachedPlayerStats(s.puuid);
        const [stats, fetchedRank] = await Promise.all([
          cachedStats
            ? Promise.resolve(cachedStats)
            : withTimeout(
              getPlayerStats(client, s.puuid),
              PLAYER_STATS_QUICK_TIMEOUT_MS,
              EMPTY_PLAYER_STATS,
            ),
          withTimeout(
            fetchPlayerRankByPuuid(s.puuid),
            PLAYER_RANK_QUICK_TIMEOUT_MS,
            null,
          ),
        ]);
        kda = stats.kda;
        winRate = stats.winRate;
        history = stats.history;
        rank = fetchedRank;
      }

      return {
        puuid: s.puuid,
        summonerId: s.summonerId,
        riotId,
        gameName,
        championId: s.championId,
        championName,
        championAlias,
        teamId: s.teamId,
        premadeId: s.premadeId,
        summonerLevel,
        position: s.position,
        rank,
        kda,
        winRate,
        matchCount: history.length,
        history,
      };
    }),
  );
  return enriched;
}

// 主入口
async function loadLiveBattle(): Promise<LiveBattleInfo> {
  let client: LcuClient;
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

  // 1. 检测游戏阶段
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

  // 去引号（LCU 可能返回带引号的字符串）
  phase = phase.replace(/"/g, '');

  const isInGame = ['InProgress', 'ChampSelect', 'GameStart', 'Reconnect'].includes(phase);
  if (!isInGame) {
    return { inGame: false, phase, queueName: '', myTeam: [], enemyTeam: [] };
  }

  // 2. 当前账号 puuid
  let myPuuid = '';
  try {
    const summoner = await client.get<Record<string, unknown>>(
      '/lol-summoner/v1/current-summoner',
    );
    myPuuid = (summoner.puuid as string) ?? '';
  } catch {
    // 继续
  }

  // 3. 拿对局骨架
  let myTeamSkeletons: PlayerSkeleton[] = [];
  let enemyTeamSkeletons: PlayerSkeleton[] = [];
  let queueName = '';

  if (phase === 'ChampSelect') {
    try {
      const cs = await client.get<Record<string, unknown>>(
        '/lol-champ-select/v1/session',
      );
      const parsed = parseTeamFromChampSelect(cs);
      myTeamSkeletons = parsed.myTeam;
      enemyTeamSkeletons = parsed.enemyTeam;
    } catch {
      // 选人阶段可能读不到
    }
  } else {
    try {
      const session = await client.get<Record<string, unknown>>(
        '/lol-gameflow/v1/session',
      );
      const parsed = parseTeamFromGameflow(session, myPuuid);
      myTeamSkeletons = parsed.myTeam;
      enemyTeamSkeletons = parsed.enemyTeam;
      const gameData = (session.gameData as Record<string, unknown>) ?? {};
      const queue = (gameData.queue as Record<string, unknown>) ?? {};
      queueName = getQueueName(Number(queue.id ?? 0));
    } catch {
      // 继续
    }

    if (myTeamSkeletons.length + enemyTeamSkeletons.length < 10) {
      try {
        const livePlayers = await fetchLiveClientPlayers();
        const supplemented = supplementTeamsFromLiveClient(
          myTeamSkeletons,
          enemyTeamSkeletons,
          livePlayers,
        );
        myTeamSkeletons = supplemented.myTeam;
        enemyTeamSkeletons = supplemented.enemyTeam;
      } catch {
        // Port 2999 is only available after the game process is ready.
      }
    }
  }

  // 4-5. 并行补全 10 人信息 + 战绩
  const [myTeam, enemyTeam] = await Promise.all([
    enrichPlayers(client, myTeamSkeletons),
    enrichPlayers(client, enemyTeamSkeletons),
  ]);

  return {
    inGame: true,
    phase,
    queueName,
    myTeam,
    enemyTeam,
  };
}

export async function getLiveBattle(): Promise<LiveBattleInfo> {
  if (liveBattleCache && liveBattleCache.expiresAt > Date.now()) {
    return structuredClone(liveBattleCache.value);
  }
  if (!liveBattleInFlight) {
    const version = liveBattleCacheVersion;
    liveBattleInFlight = loadLiveBattle()
      .then((value) => {
        const stabilized = stabilizeLiveBattle(
          value,
          stableLiveBattle,
          Date.now(),
          LIVE_BATTLE_STALE_TTL_MS,
        );
        stableLiveBattle = stabilized.stable;

        if (version === liveBattleCacheVersion) {
          liveBattleCache = {
            expiresAt: Date.now() + (
              stabilized.value.inGame
                ? LIVE_BATTLE_CACHE_TTL_MS
                : LIVE_BATTLE_EMPTY_CACHE_TTL_MS
            ),
            value: stabilized.value,
          };
        }
        return stabilized.value;
      })
      .finally(() => {
        liveBattleInFlight = null;
      });
  }
  return structuredClone(await liveBattleInFlight);
}
