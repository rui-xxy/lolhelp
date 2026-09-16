// - 选人阶段：从 champ-select session 解析 puuid，存成快照
// - 进入对局：优先用快照（puuid 齐全），session 数据只作补充
//
// 快照带 gameId 校验：只有 gameId 对得上才复用，避免上一局的名单串到这一局。

import https from 'node:https';
import { getCachedCredentials } from '../lcu/lockfile';
import { LcuClient } from '../lcu/client';
import { getAllHeroes } from '../lcu/heroData';

export interface RosterPlayer {
  puuid: string;
  summonerId: number;
  championId: number;
  teamId: number;
  premadeId?: string;
  position?: string;
  // 名字线索：Live Client Data（2999）在身份隐藏时只能给到这些
  riotIdHint?: string;
  gameNameHint?: string;
}

export interface RosterSnapshot {
  gameId: number;
  capturedAt: number;
  myTeam: RosterPlayer[];
  enemyTeam: RosterPlayer[];
  queueId: number;
}

// 快照有效期：选人结束到进游戏通常几十秒，给 10 分钟余量覆盖重连。
const SNAPSHOT_TTL_MS = 10 * 60 * 1000;

let snapshot: RosterSnapshot | null = null;

export function clearRosterSnapshot(): void {
  snapshot = null;
}

export function getRosterSnapshot(activeGameId?: number): RosterSnapshot | null {
  if (!snapshot) return null;
  if (Date.now() - snapshot.capturedAt > SNAPSHOT_TTL_MS) {
    snapshot = null;
    return null;
  }
  // 调用方明确要求校验时，拿不到有效 gameId 也不能冒险复用旧快照。
  if (activeGameId !== undefined && activeGameId <= 0) return null;
  if (activeGameId !== undefined && snapshot.gameId !== activeGameId) {
    snapshot = null;
    return null;
  }
  return snapshot;
}

function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

// 队伍标识：LCU 里 100 是蓝方，200 是红方；champ-select 用 cellId 区分。
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

function toRosterPlayer(
  player: Record<string, unknown>,
  teamId: number,
): RosterPlayer {
  return {
    puuid: String(player.puuid ?? ''),
    summonerId: toNumber(player.summonerId),
    championId: toNumber(player.championId),
    teamId,
    premadeId: currentPartyId(player),
    position: currentPosition(player),
  };
}

// 从 champ-select session 解析名单。选人阶段 theirTeam 常常是空的，
// LCU 的 map 对象 → 本地化地图名。取不到就返回空串，调用方自行降级。
function toMapName(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const map = raw as Record<string, unknown>;
  return String(map.name ?? map.gameModeName ?? '').trim();
}

// 从选人 session 解析名单（双方可见，但敌方通常只有 championId）。
// 此时只拿 myTeam，敌方等对局开始再补。
export function parseRosterFromChampSelect(
  session: Record<string, unknown>,
): {
  myTeam: RosterPlayer[];
  enemyTeam: RosterPlayer[];
  gameId: number;
  queueId: number;
  mapName: string;
} {
  const myTeamRaw = (session.myTeam as Array<Record<string, unknown>>) ?? [];
  const theirTeamRaw = (session.theirTeam as Array<Record<string, unknown>>) ?? [];
  const gameData = (session.gameData as Record<string, unknown>) ?? {};

  const keep = (player: Record<string, unknown>) =>
    toNumber(player.cellId) >= 0 || toNumber(player.championId) > 0;

  return {
    myTeam: myTeamRaw.filter(keep).map((player) => toRosterPlayer(player, 100)),
    enemyTeam: theirTeamRaw.filter(keep).map((player) => toRosterPlayer(player, 200)),
    gameId: toNumber(session.gameId),
    queueId: toNumber(session.queueId ?? gameData.queueId),
    mapName: toMapName(gameData.map),
  };
}

// 从 gameflow session 解析名单。这是进游戏后最可靠的一份（含双方 10 人）。
export function parseRosterFromGameflow(
  session: Record<string, unknown>,
  myPuuid: string,
): {
  myTeam: RosterPlayer[];
  enemyTeam: RosterPlayer[];
  queueId: number;
  gameId: number;
  mapName: string;
} {
  const gameData = (session.gameData as Record<string, unknown>) ?? {};
  const teamOne = (gameData.teamOne as Array<Record<string, unknown>>) ?? [];
  const teamTwo = (gameData.teamTwo as Array<Record<string, unknown>>) ?? [];

  const team1 = teamOne.map((player) => toRosterPlayer(player, 100));
  const team2 = teamTwo.map((player) => toRosterPlayer(player, 200));

  // 我在哪队：以 puuid 判定。双方暂时都没有 puuid 时不能误判到 teamTwo，
  // 保持 LCU 的默认语义（teamOne 是自己这边）。
  const inTeamOneByPuuid = Boolean(myPuuid && team1.some((player) => player.puuid === myPuuid));
  const inTeamTwoByPuuid = Boolean(myPuuid && team2.some((player) => player.puuid === myPuuid));
  const inTeamOne = inTeamOneByPuuid || !inTeamTwoByPuuid;
  const queue = (gameData.queue as Record<string, unknown>) ?? {};

  return {
    myTeam: inTeamOne ? team1 : team2,
    enemyTeam: inTeamOne ? team2 : team1,
    queueId: toNumber(queue.id ?? gameData.queueId ?? session.queueId),
    gameId: toNumber(gameData.gameId ?? session.gameId),
    mapName: toMapName(session.map ?? gameData.map),
  };
}

// 从 lobby（大厅/匹配中）解析名单。
export function parseRosterFromLobby(
  lobby: Record<string, unknown>,
  myPuuid: string,
  mySummonerId = 0,
): { myTeam: RosterPlayer[]; enemyTeam: RosterPlayer[]; queueId: number } {
  const members = (lobby.members as Array<Record<string, unknown>>) ?? [];
  const gameConfig = (lobby.gameConfig as Record<string, unknown>) ?? {};

  const myTeam: RosterPlayer[] = [];
  members.forEach((member) => {
    const player: RosterPlayer = {
      puuid: String(member.puuid ?? ''),
      summonerId: toNumber(member.summonerId),
      championId: toNumber(member.championId),
      teamId: 100,
      position:
        currentPosition(member)
        ?? (String(member.firstPositionPreference ?? '') || undefined),
    };
    const duplicateIndex = myTeam.findIndex((candidate) => Boolean(
      (player.puuid && candidate.puuid === player.puuid)
      || (player.summonerId > 0 && candidate.summonerId === player.summonerId),
    ));
    if (duplicateIndex < 0) {
      myTeam.push(player);
    } else {
      myTeam[duplicateIndex] = {
        ...myTeam[duplicateIndex],
        ...player,
        puuid: player.puuid || myTeam[duplicateIndex].puuid,
        summonerId: player.summonerId || myTeam[duplicateIndex].summonerId,
      };
    }
  });

  // 保证自己在名单里（部分客户端 lobby.members 不含自己）。
  const containsSelf = myTeam.some((player) => Boolean(
    (myPuuid && player.puuid === myPuuid)
    || (mySummonerId > 0 && player.summonerId === mySummonerId),
  ));
  if (myPuuid && !containsSelf) {
    myTeam.unshift({
      puuid: myPuuid,
      summonerId: mySummonerId,
      championId: 0,
      teamId: 100,
    });
  }

  return {
    myTeam,
    enemyTeam: [],
    queueId: toNumber(gameConfig.queueId),
  };
}

// 选人阶段结束时保存快照，供对局阶段复用。
export function captureRosterSnapshot(
  myTeam: RosterPlayer[],
  enemyTeam: RosterPlayer[],
  gameId: number,
  queueId: number,
): void {
  if (gameId <= 0 || myTeam.length + enemyTeam.length === 0) return;
  snapshot = {
    gameId,
    capturedAt: Date.now(),
    myTeam,
    enemyTeam,
    queueId,
  };
}

// 用快照补全对局阶段解析出的名单：以快照里的 puuid 为准（快照更全），
// 对局数据里才有的字段（如 championId 变化）做覆盖。
export function mergeWithSnapshot(
  fresh: { myTeam: RosterPlayer[]; enemyTeam: RosterPlayer[] },
  snapshotValue: RosterSnapshot,
): { myTeam: RosterPlayer[]; enemyTeam: RosterPlayer[] } {
  const mergeTeam = (freshTeam: RosterPlayer[], snapshotTeam: RosterPlayer[]) => {
    if (freshTeam.length === 0) return snapshotTeam;
    if (snapshotTeam.length === 0) return freshTeam;

    const usedSnapshotIndexes = new Set<number>();
    const merged = freshTeam.map((player, freshIndex) => {
      const matchIndex = snapshotTeam.findIndex((candidate, index) => {
        if (usedSnapshotIndexes.has(index)) return false;
        return Boolean(
          (player.puuid && candidate.puuid === player.puuid)
          || (player.summonerId > 0 && candidate.summonerId === player.summonerId)
          || (player.position && candidate.position === player.position)
          || (player.championId > 0 && candidate.championId === player.championId)
          // 身份完全隐藏且英雄刚变化时，以队伍槽位作最后兜底。
          || (!player.puuid && player.summonerId <= 0 && index === freshIndex),
        );
      });
      if (matchIndex < 0) return player;

      usedSnapshotIndexes.add(matchIndex);
      const cached = snapshotTeam[matchIndex];
      return {
        ...cached,
        ...player,
        puuid: player.puuid || cached.puuid,
        summonerId: player.summonerId || cached.summonerId,
        championId: player.championId || cached.championId,
        premadeId: player.premadeId ?? cached.premadeId,
        position: player.position ?? cached.position,
        riotIdHint: player.riotIdHint || cached.riotIdHint,
        gameNameHint: player.gameNameHint || cached.gameNameHint,
      };
    });

    // GameStart 偶尔只返回部分玩家；把快照中未命中的成员补回，避免名单闪少、
    // 误取消正在加载的请求。fresh 已完整时这里不会追加任何人。
    snapshotTeam.forEach((player, index) => {
      if (!usedSnapshotIndexes.has(index)) merged.push(player);
    });
    return merged.slice(0, Math.max(freshTeam.length, snapshotTeam.length));
  };

  return {
    myTeam: mergeTeam(fresh.myTeam, snapshotValue.myTeam),
    enemyTeam: mergeTeam(fresh.enemyTeam, snapshotValue.enemyTeam),
  };
}

// ---------------------------------------------------------------------------
// Live Client Data（2999）兜底
// ---------------------------------------------------------------------------
// 游戏进程起来后，2999 能给出双方 10 人（含身份隐藏时的名字线索）。
// 它只在 InProgress 之后可用，因此作为补充而非主数据源。

export interface LiveClientPlayer {
  team?: string;
  championName?: string;
  riotId?: string;
  summonerName?: string;
}

export function liveChampionId(player: LiveClientPlayer): number {
  const name = String(player.championName ?? '').trim();
  if (!name) return 0;
  return getAllHeroes().find((hero) => hero.name === name || hero.alias === name)?.id ?? 0;
}

export function liveRiotId(player: LiveClientPlayer): string {
  const riotId = String(player.riotId ?? '').trim();
  if (riotId && riotId !== '#' && !riotId.startsWith('#')) return riotId;

  const summonerName = String(player.summonerName ?? '').trim();
  return summonerName.includes('#') && !summonerName.startsWith('#') ? summonerName : '';
}

export function supplementTeamsFromLiveClient(
  myTeam: RosterPlayer[],
  enemyTeam: RosterPlayer[],
  livePlayers: LiveClientPlayer[],
): { myTeam: RosterPlayer[]; enemyTeam: RosterPlayer[] } {
  const order = livePlayers.filter((player) => player.team === 'ORDER');
  const chaos = livePlayers.filter((player) => player.team === 'CHAOS');
  if (order.length === 0 || chaos.length === 0) return { myTeam, enemyTeam };

  // 用英雄重合度判断哪边是"我队"。
  const myChampionIds = new Set(myTeam.map((player) => player.championId).filter(Boolean));
  const overlap = (players: LiveClientPlayer[]) =>
    players.reduce(
      (count, player) => count + (myChampionIds.has(liveChampionId(player)) ? 1 : 0),
      0,
    );

  const orderOverlap = overlap(order);
  const chaosOverlap = overlap(chaos);
  if (orderOverlap === chaosOverlap) return { myTeam, enemyTeam };

  const myLiveTeam = orderOverlap > chaosOverlap ? order : chaos;
  const enemyLiveTeam = orderOverlap > chaosOverlap ? chaos : order;
  const supplement = (skeletons: RosterPlayer[], live: LiveClientPlayer[], teamId: number) => {
    const used = new Set<number>();
    for (const skeleton of skeletons) {
      const index = live.findIndex(
        (player, i) => !used.has(i) && liveChampionId(player) === skeleton.championId,
      );
      if (index >= 0) used.add(index);
    }

    const result = [...skeletons];
    live.forEach((player, index) => {
      if (used.has(index)) return;
      const riotIdHint = liveRiotId(player);
      result.push({
        puuid: '',
        summonerId: 0,
        championId: liveChampionId(player),
        teamId,
        riotIdHint,
        gameNameHint: riotIdHint.split('#')[0] || '身份隐藏',
      });
    });

    return result.slice(0, live.length || skeletons.length);
  };

  return {
    myTeam: supplement(myTeam, myLiveTeam, myTeam[0]?.teamId ?? 100),
    enemyTeam: supplement(enemyTeam, enemyLiveTeam, enemyTeam[0]?.teamId ?? 200),
  };
}

// 拉取 2999 的玩家列表。只在游戏进程就绪后可用，失败由调用方忽略。
export function fetchLiveClientPlayers(): Promise<LiveClientPlayer[]> {
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
            resolve(Array.isArray(parsed) ? (parsed as LiveClientPlayer[]) : []);
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

// 便捷方法：拿一个可用的 LCU 客户端。
export function createLcuClient(): LcuClient {
  const creds = getCachedCredentials();
  if (!creds) throw new Error('未检测到 LOL 客户端');
  return new LcuClient(creds);
}
