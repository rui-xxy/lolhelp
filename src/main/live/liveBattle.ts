import { getCachedCredentials } from '../lcu/lockfile';
import { LcuClient } from '../lcu/client';
import { getHeroByKey } from '../lcu/heroData';
import { getQueueName } from '../match/queueNames';
import type { LiveBattleInfo, LiveBattlePlayer } from '../../shared/api';

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
let liveBattleCache: { expiresAt: number; value: LiveBattleInfo } | null = null;
let liveBattleInFlight: Promise<LiveBattleInfo> | null = null;

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
): { kda: number; winRate: number; history: LiveBattlePlayer['history'] } {
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
    const queueId = Number(match.queueId ?? 0);
    const creation = Number(match.gameCreation ?? 0);

    history.push({
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
interface PlayerSkeleton {
  puuid: string;
  summonerId: number;
  championId: number;
  teamId: number;
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
      let gameName = `玩家${s.summonerId || '?'}`;
      let championName = `英雄${s.championId}`;

      // 召唤师名（通过 summonerId）
      if (s.summonerId > 0) {
        try {
          const sum = await client.get<Record<string, unknown>>(
            `/lol-summoner/v1/summoners/${s.summonerId}`,
          );
          gameName = (sum.gameName as string) || (sum.name as string) || gameName;
          if (!s.puuid) s.puuid = (sum.puuid as string) ?? s.puuid;
        } catch {
          // 回退：通过 puuid 查
          if (s.puuid) {
            try {
              const sum = await client.get<Record<string, unknown>>(
                `/lol-summoner/v2/summoners/puuid/${s.puuid}`,
              );
              gameName = (sum.gameName as string) || gameName;
            } catch {
              // 放弃
            }
          }
        }
      }

      // 英雄名
      const hero = getHeroByKey(s.championId);
      championName = hero?.name ?? championName;
      const championAlias = hero?.alias ?? '';

      // 战绩（最近 N 场）
      let kda = 0;
      let winRate = 0;
      let history: LiveBattlePlayer['history'] = [];
      if (s.puuid) {
        try {
          const matchResp = await client.get<Record<string, unknown>>(
            `/lol-match-history/v1/products/lol/${s.puuid}/matches?begIndex=0&endIndex=${RECENT_MATCH_COUNT}`,
          );
          const games = ((matchResp.games as Record<string, unknown>)?.games as Array<Record<string, unknown>>) ?? [];
          const stats = calcPlayerStats(games, s.puuid);
          kda = stats.kda;
          winRate = stats.winRate;
          history = stats.history;
        } catch {
          // 战绩拿不到就留默认值
        }
      }

      return {
        puuid: s.puuid,
        summonerId: s.summonerId,
        riotId: gameName,
        gameName,
        championId: s.championId,
        championName,
        championAlias,
        teamId: s.teamId,
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
    phase = 'None';
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
    liveBattleInFlight = loadLiveBattle()
      .then((value) => {
        liveBattleCache = {
          expiresAt: Date.now() + LIVE_BATTLE_CACHE_TTL_MS,
          value,
        };
        return value;
      })
      .finally(() => {
        liveBattleInFlight = null;
      });
  }
  return structuredClone(await liveBattleInFlight);
}
