import type {
  ReplayActionResult,
  ReplayAvailability,
  ReplayAvailabilityRequest,
} from '../../shared/api';
import { LcuClient } from '../lcu/client';
import { getCachedCredentials } from '../lcu/lockfile';

export type ReplayAction = 'download' | 'watch';

export interface ReplayClient {
  post(requestPath: string, body: unknown): Promise<unknown>;
}

export interface ReplayMetadataClient {
  get(requestPath: string): Promise<unknown>;
  post?(requestPath: string, body: unknown): Promise<unknown>;
}

interface ReplayRegistration {
  gameVersion: string;
  gameType: string;
  queueId: number;
  gameEnd: number;
}

const REPLAY_REQUEST_BODY = {
  componentType: 'replay-button_match-history',
};

const REPLAY_STATES_BY_NUMBER: Record<number, string> = {
  0: 'checking',
  1: 'found',
  2: 'watch',
  3: 'download',
  4: 'downloading',
  5: 'incompatible',
  6: 'missingOrExpired',
  7: 'retryDownload',
  8: 'lost',
  9: 'unsupported',
  10: 'error',
};

const AVAILABLE_REPLAY_STATES = new Set([
  'found',
  'watch',
  'download',
  'downloading',
  'retryDownload',
]);

const REPLAY_STATE_MESSAGES: Record<string, string> = {
  checking: '正在检查回放',
  found: '回放文件可用',
  watch: '可以观看回放',
  download: '可以下载回放',
  downloading: '回放正在下载',
  incompatible: '回放与当前客户端版本不兼容',
  missingOrExpired: '回放已过期',
  retryDownload: '可以重新下载回放',
  lost: '回放文件已丢失',
  unsupported: '当前模式不支持回放',
  error: '回放状态异常',
};

function normalizeGameId(value: unknown): number | null {
  const gameId = Number(value);
  return Number.isSafeInteger(gameId) && gameId > 0 ? gameId : null;
}

function normalizeReplayState(value: unknown): string {
  if (typeof value === 'number') return REPLAY_STATES_BY_NUMBER[value] ?? 'error';
  const text = String(value ?? '').trim();
  return text || 'error';
}

function normalizeReplayRegistration(value: unknown): ReplayRegistration | null {
  if (!value || typeof value !== 'object') return null;
  const request = value as Partial<ReplayAvailabilityRequest>;
  const gameVersion = String(request.gameVersion ?? '').trim();
  const gameType = String(request.gameType ?? 'MATCHED_GAME').trim();
  const queueId = Number(request.queueId);
  const gameCreation = Number(request.gameCreation);
  const gameDuration = Number(request.gameDuration);
  const gameEnd = Math.trunc(gameCreation + gameDuration * 1000);

  if (
    !gameVersion ||
    !gameType ||
    !Number.isInteger(queueId) ||
    queueId < 0 ||
    !Number.isSafeInteger(gameEnd) ||
    gameEnd <= 0
  ) {
    return null;
  }

  return { gameVersion, gameType, queueId, gameEnd };
}

function replayAvailabilityFromMetadata(metadata: unknown): ReplayAvailability {
  const value = metadata as {
    state?: unknown;
    downloadProgress?: unknown;
  } | null;
  const state = normalizeReplayState(value?.state);
  const rawProgress = Number(value?.downloadProgress ?? 0);
  const reportedProgress = Number.isFinite(rawProgress)
    ? Math.min(100, Math.max(0, rawProgress))
    : 0;
  const downloadProgress = ['found', 'watch'].includes(state)
    ? 100
    : state === 'downloading'
      ? reportedProgress
      : 0;

  return {
    available: AVAILABLE_REPLAY_STATES.has(state),
    state,
    downloadProgress,
    message: REPLAY_STATE_MESSAGES[state] ?? '当前无法观看回放',
  };
}

async function registerReplayMetadata(
  client: ReplayMetadataClient,
  gameId: number,
  registration: ReplayRegistration,
): Promise<void> {
  if (!client.post) return;
  try {
    await client.post(`/lol-replays/v2/metadata/${gameId}/create`, registration);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (!/HTTP 404/i.test(detail)) throw error;
    const legacyPath =
      `/lol-replays/v1/metadata/${gameId}/create` +
      `/gameVersion/${encodeURIComponent(registration.gameVersion)}` +
      `/gameType/${encodeURIComponent(registration.gameType)}` +
      `/queueId/${registration.queueId}`;
    await client.post(legacyPath, undefined);
  }
}

export async function requestReplayAvailability(
  client: ReplayMetadataClient,
  rawGameId: unknown,
  context?: unknown,
): Promise<ReplayAvailability> {
  const gameId = normalizeGameId(rawGameId);
  if (!gameId) {
    return { available: false, state: 'error', downloadProgress: 0, message: '对局编号无效' };
  }

  try {
    let metadata: unknown;
    try {
      metadata = await client.get(`/lol-replays/v1/metadata/${gameId}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const registration = normalizeReplayRegistration(context);
      if (!/HTTP 404/i.test(detail) || !registration || !client.post) throw error;
      await registerReplayMetadata(client, gameId, registration);
      metadata = await client.get(`/lol-replays/v1/metadata/${gameId}`);
    }
    return replayAvailabilityFromMetadata(metadata);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const state = /HTTP 404|HTTP 422/i.test(detail) ? 'missingOrExpired' : 'error';
    return {
      available: false,
      state,
      downloadProgress: 0,
      message: REPLAY_STATE_MESSAGES[state],
    };
  }
}

function replayErrorMessage(action: ReplayAction, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  if (/HTTP 404|HTTP 422/i.test(detail)) {
    return '这场回放已过期，或与当前客户端版本不兼容';
  }
  if (/HTTP 409/i.test(detail)) {
    return '客户端当前无法启动回放，请先退出房间或正在进行的游戏';
  }
  if (/ECONNREFUSED|socket hang up|timed out/i.test(detail)) {
    return '无法连接英雄联盟客户端，请确认客户端已经启动';
  }
  return action === 'download' ? '回放下载失败，可能已过期' : '回放启动失败，请稍后重试';
}

export async function requestReplayAction(
  client: ReplayClient,
  rawGameId: unknown,
  action: ReplayAction,
): Promise<ReplayActionResult> {
  const gameId = normalizeGameId(rawGameId);
  if (!gameId) return { success: false, message: '对局编号无效，无法观看回放' };

  try {
    await client.post(`/lol-replays/v1/rofls/${gameId}/${action}`, REPLAY_REQUEST_BODY);
    return {
      success: true,
      message: action === 'download' ? '回放下载请求已发送' : '正在启动回放',
    };
  } catch (error) {
    return { success: false, message: replayErrorMessage(action, error) };
  }
}

function connectedReplayClient(): ReplayClient | null {
  const credentials = getCachedCredentials();
  return credentials ? new LcuClient(credentials) : null;
}

export async function getReplayAvailability(request: unknown): Promise<ReplayAvailability> {
  const credentials = getCachedCredentials();
  if (!credentials) {
    return { available: false, state: 'offline', downloadProgress: 0, message: '客户端未连接' };
  }
  const gameId = request && typeof request === 'object'
    ? (request as Partial<ReplayAvailabilityRequest>).gameId
    : request;
  return requestReplayAvailability(new LcuClient(credentials), gameId, request);
}

export async function downloadReplay(gameId: unknown): Promise<ReplayActionResult> {
  const client = connectedReplayClient();
  if (!client) return { success: false, message: '请先启动英雄联盟客户端' };
  return requestReplayAction(client, gameId, 'download');
}

export async function watchReplay(gameId: unknown): Promise<ReplayActionResult> {
  const client = connectedReplayClient();
  if (!client) return { success: false, message: '请先启动英雄联盟客户端' };
  return requestReplayAction(client, gameId, 'watch');
}
