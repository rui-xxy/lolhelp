import { getCachedCredentials } from '../lcu/lockfile';
import { LcuClient } from '../lcu/client';
import { getQueueName } from './queueNames';
import type { PlayerActiveGame, PlayerActiveGamePlayer } from '../../shared/api';

// 当前对局：用观战接口（LCU /lol-spectator/v1/active-games/by-puuid）看这个人是不是正在游戏、玩什么、和谁一队。
// 好友栏「观战」用的是同一个接口。不同客户端版本返回的结构不完全一样（扁平 participants，
// 或旧版 game.teamOne / teamTwo + playerChampionSelections），这里两种都兼容；查不到就当作不在游戏中。

const CACHE_TTL_MS = 20_000;
const cache = new Map<string, { at: number; value: PlayerActiveGame }>();

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RawRecord) : {};
}

function readNumber(record: RawRecord, keys: string[]): number {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value) && value !== 0) return value;
  }
  return 0;
}

function readString(record: RawRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/** 在嵌套结构里按名字找第一个数组 / 值。 */
function findNested(value: unknown, key: string, depth = 0): unknown {
  if (!value || typeof value !== 'object' || depth > 4) return undefined;
  const record = value as RawRecord;
  if (key in record) return record[key];
  for (const child of Object.values(record)) {
    const found = findNested(child, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function riotIdOf(raw: RawRecord): string {
  const riotId = readString(raw, ['riotId']);
  if (riotId) return riotId;
  const gameName = readString(raw, ['gameName', 'summonerName', 'displayName', 'name']);
  const tagLine = readString(raw, ['tagLine', 'gameTag']);
  return gameName && tagLine && !gameName.includes('#') ? `${gameName}#${tagLine}` : gameName;
}

function parsePlayers(game: unknown): PlayerActiveGamePlayer[] {
  const players: PlayerActiveGamePlayer[] = [];
  const selections = findNested(game, 'playerChampionSelections');
  const championByKey = new Map<string, number>();
  if (Array.isArray(selections)) {
    for (const item of selections) {
      const raw = asRecord(item);
      const championId = readNumber(raw, ['championId']);
      for (const key of [readString(raw, ['puuid']), readString(raw, ['summonerInternalName'])]) {
        if (key && championId) championByKey.set(key, championId);
      }
    }
  }

  const push = (item: unknown, fallbackTeam: number) => {
    const raw = asRecord(item);
    const puuid = readString(raw, ['puuid']);
    const internal = readString(raw, ['summonerInternalName']);
    players.push({
      puuid,
      riotId: riotIdOf(raw),
      championId: readNumber(raw, ['championId']) || championByKey.get(puuid) || championByKey.get(internal) || 0,
      profileIconId: readNumber(raw, ['profileIconId', 'profileIcon', 'icon']),
      teamId: readNumber(raw, ['teamId', 'team']) || fallbackTeam,
    });
  };

  const participants = findNested(game, 'participants');
  if (Array.isArray(participants) && participants.length > 0) {
    for (const item of participants) push(item, 0);
    return players;
  }
  const teamOne = findNested(game, 'teamOne');
  const teamTwo = findNested(game, 'teamTwo');
  if (Array.isArray(teamOne)) for (const item of teamOne) push(item, 100);
  if (Array.isArray(teamTwo)) for (const item of teamTwo) push(item, 200);
  return players;
}

export async function fetchActiveGame(puuid: string): Promise<PlayerActiveGame> {
  const target = puuid.trim();
  if (!target) return { inGame: false, players: [] };
  const cached = cache.get(target);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const creds = getCachedCredentials();
  if (!creds) return { inGame: false, players: [], error: '未连接客户端' };

  let value: PlayerActiveGame;
  try {
    const game = await new LcuClient(creds).get<unknown>(
      `/lol-spectator/v1/active-games/by-puuid/${encodeURIComponent(target)}`,
    );
    const players = parsePlayers(game);
    const queueId = Number(findNested(game, 'gameQueueConfigId') ?? findNested(game, 'queueId') ?? 0) || 0;
    const startRaw = Number(findNested(game, 'gameStartTime') ?? 0);
    const lengthRaw = Number(findNested(game, 'gameLength') ?? 0);
    const startTime = Number.isFinite(startRaw) && startRaw > 1_000_000_000_000
      ? startRaw
      : Number.isFinite(lengthRaw) && lengthRaw > 0
        ? Date.now() - lengthRaw * 1000
        : 0;
    const me = players.find((player) => player.puuid === target);
    const gameId = Number(findNested(game, 'gameId') ?? findNested(game, 'id') ?? 0) || undefined;
    const inGame = Boolean(gameId || players.length > 0);
    value = {
      inGame,
      gameId,
      queueId: queueId || undefined,
      queueName: queueId ? getQueueName(queueId) : undefined,
      gameMode: String(findNested(game, 'gameMode') ?? '') || undefined,
      startTime: startTime || undefined,
      championId: me?.championId || undefined,
      teamId: me?.teamId || undefined,
      players,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 404 / 不在对局里都会走到这里，这是常态，不算错误。
    value = { inGame: false, players: [], ...(/HTTP 40[04]/.test(message) ? {} : { error: message }) };
  }
  cache.set(target, { at: Date.now(), value });
  return value;
}
