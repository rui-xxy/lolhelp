import { BrowserWindow } from 'electron';
import WebSocket from 'ws';
import { IPC_CHANNELS } from '../../shared/channels';
import type { LiveStateChangeEvent } from '../../shared/api';
import { LcuClient } from '../lcu/client';
import { getCachedCredentials, type LcuCredentials } from '../lcu/lockfile';
import { invalidateLiveBattleCache } from './liveBattle';

const GAMEFLOW_PHASE_URI = '/lol-gameflow/v1/gameflow-phase';
const CHAMP_SELECT_SESSION_URI = '/lol-champ-select/v1/session';
const POLL_INTERVAL_MS = 2_500;
const RECONNECT_DELAY_MS = 2_000;
const CHAMP_SELECT_REFRESH_THROTTLE_MS = 900;
const LIVE_HEARTBEAT_MS = 10_000;

let running = false;
let socket: WebSocket | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let champSelectRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let connectedCredentialKey = '';
let lastPhase = 'None';
let lastLiveHeartbeatAt = 0;

function normalizePhase(value: unknown): string {
  if (typeof value !== 'string') return 'None';
  return value.replace(/"/g, '') || 'None';
}

function isLivePhase(phase: string): boolean {
  return ['ChampSelect', 'GameStart', 'InProgress', 'Reconnect'].includes(phase);
}

function credentialKey(creds: LcuCredentials): string {
  return `${creds.port}:${creds.token}`;
}

function emitLiveState(event: Omit<LiveStateChangeEvent, 'at'>): void {
  const payload: LiveStateChangeEvent = {
    ...event,
    at: Date.now(),
  };

  invalidateLiveBattleCache();

  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue;
    win.webContents.send(IPC_CHANNELS.LIVE_STATE_CHANGED, payload);
  }
}

function emitPhaseIfChanged(
  phase: string,
  source: LiveStateChangeEvent['source'],
  uri = GAMEFLOW_PHASE_URI,
): void {
  const normalized = normalizePhase(phase);
  if (normalized === lastPhase) {
    if (!isLivePhase(normalized) || Date.now() - lastLiveHeartbeatAt < LIVE_HEARTBEAT_MS) {
      return;
    }
  } else {
    lastPhase = normalized;
  }
  lastLiveHeartbeatAt = Date.now();
  emitLiveState({
    phase: normalized,
    inGame: isLivePhase(normalized),
    source,
    uri,
  });
}

function scheduleChampSelectRefresh(): void {
  if (champSelectRefreshTimer) return;
  champSelectRefreshTimer = setTimeout(() => {
    champSelectRefreshTimer = null;
    emitLiveState({
      phase: lastPhase === 'None' ? 'ChampSelect' : lastPhase,
      inGame: true,
      source: 'websocket',
      uri: CHAMP_SELECT_SESSION_URI,
    });
  }, CHAMP_SELECT_REFRESH_THROTTLE_MS);
}

async function pollPhase(source: LiveStateChangeEvent['source'] = 'poll'): Promise<void> {
  const creds = getCachedCredentials();
  if (!creds) {
    connectedCredentialKey = '';
    disposeSocket();
    emitPhaseIfChanged('None', source);
    return;
  }

  const key = credentialKey(creds);
  if (key !== connectedCredentialKey) {
    connectedCredentialKey = key;
    disposeSocket();
    connectSocket();
  }

  try {
    const client = new LcuClient(creds);
    const phase = await client.get<string>(GAMEFLOW_PHASE_URI);
    emitPhaseIfChanged(phase, source);
  } catch {
    emitPhaseIfChanged('None', source);
  }
}

function clearReconnectTimer(): void {
  if (!reconnectTimer) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function scheduleReconnect(): void {
  if (!running || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectSocket();
  }, RECONNECT_DELAY_MS);
}

function disposeSocket(): void {
  if (!socket) return;
  const current = socket;
  socket = null;
  current.removeAllListeners();
  try {
    current.close();
  } catch {
    // Ignore close errors.
  }
}

function handleSocketMessage(raw: WebSocket.RawData): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString());
  } catch {
    return;
  }

  const event = Array.isArray(parsed) ? parsed[2] : parsed;
  if (!event || typeof event !== 'object') return;

  const payload = event as {
    uri?: string;
    data?: unknown;
  };

  if (payload.uri === GAMEFLOW_PHASE_URI) {
    emitPhaseIfChanged(normalizePhase(payload.data), 'websocket', payload.uri);
    return;
  }

  if (payload.uri === CHAMP_SELECT_SESSION_URI) {
    scheduleChampSelectRefresh();
  }
}

function connectSocket(): void {
  if (!running) return;

  const creds = getCachedCredentials();
  if (!creds) {
    disposeSocket();
    scheduleReconnect();
    return;
  }

  const key = credentialKey(creds);
  if (
    socket &&
    connectedCredentialKey === key &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  connectedCredentialKey = key;
  disposeSocket();
  clearReconnectTimer();

  const auth = Buffer.from(`riot:${creds.token}`).toString('base64');
  const nextSocket = new WebSocket(`wss://127.0.0.1:${creds.port}/`, {
    rejectUnauthorized: false,
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });
  socket = nextSocket;

  nextSocket.on('open', () => {
    try {
      nextSocket.send(JSON.stringify([5, 'OnJsonApiEvent']));
    } catch {
      // Polling still works when websocket subscription fails.
    }
    void pollPhase('websocket');
  });

  nextSocket.on('message', handleSocketMessage);

  nextSocket.on('close', () => {
    if (socket === nextSocket) socket = null;
    scheduleReconnect();
  });

  nextSocket.on('error', () => {
    if (socket === nextSocket) socket = null;
    try {
      nextSocket.close();
    } catch {
      // Ignore close errors.
    }
    scheduleReconnect();
  });
}

export function startLiveWatcher(): void {
  if (running) return;
  running = true;
  void pollPhase('poll');
  connectSocket();
  pollTimer = setInterval(() => {
    void pollPhase('poll');
    connectSocket();
  }, POLL_INTERVAL_MS);
}

export function stopLiveWatcher(): void {
  running = false;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  clearReconnectTimer();
  if (champSelectRefreshTimer) {
    clearTimeout(champSelectRefreshTimer);
    champSelectRefreshTimer = null;
  }
  disposeSocket();
}
