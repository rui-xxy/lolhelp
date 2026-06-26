import { getSettings } from '../settings/store';
import { LcuClient } from '../lcu/client';
import { getCachedCredentials } from '../lcu/lockfile';
import {
  findLocalAction,
  firstAvailableChampion,
  getPreferredBan,
  getPreferredPicks,
  normalizeRole,
  type ChampSelectAction,
  type ChampSelectPlayer,
} from './championActions';
import { applyAssistRecommendation } from './recommendations';
import {
  reportAssistAction,
  reportAssistError,
  updateAssistRuntimeStatus,
} from './runtime';
import {
  syncAssistGlobalShortcuts,
} from './windows';

interface ChampSelectSession {
  actions?: ChampSelectAction[][];
  localPlayerCellId?: number;
  myTeam?: ChampSelectPlayer[];
  benchEnabled?: boolean;
  benchChampions?: Array<{ championId?: number }>;
  theirTeam?: ChampSelectPlayer[];
}

interface GameflowSession {
  gameData?: {
    gameId?: number;
    queue?: { id?: number };
  };
}

interface HonorBallot {
  gameId?: number;
  eligiblePlayers?: Array<{ summonerId?: number }>;
}

interface EndOfGameStats {
  teams?: Array<{
    isPlayerTeam?: boolean;
    players?: Array<{
      summonerId?: number;
      summonerName?: string;
      gameName?: string;
      isLocalPlayer?: boolean;
    }>;
  }>;
}

const POLL_INTERVAL_MS = 1000;
const HONOR_CATEGORIES = ['COOL', 'SHOTCALLER', 'HEART'] as const;

let pollTimer: NodeJS.Timeout | null = null;
let acceptTimer: NodeJS.Timeout | null = null;
let polling = false;
let previousPhase = '';
let lastChampSelectGameId = 0;
const completedActionIds = new Set<number>();
let lastBenchSwapKey = '';
let lastRecommendationKey = '';
let lastRecommendationAt = 0;
let lastPositionPreferencesKey = '';

async function sendLobbyMessage(client: LcuClient, body: string): Promise<void> {
  const conversations = await client.get<Array<{ id?: string }>>('/lol-chat/v1/conversations');
  const conversationId = conversations.at(-1)?.id;
  if (!conversationId) return;
  await client.post(`/lol-chat/v1/conversations/${conversationId}/messages`, {
    body,
    type: 'chat',
  });
}

function normalizeRiotId(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

async function applyPositionPreferences(client: LcuClient): Promise<void> {
  const assist = getSettings().assist;
  if (!assist.autoChampionEnabled) return;
  const preferences = assist.champions;
  const key = `${preferences.quickGameFirstPosition}:${preferences.quickGameSecondPosition}`;
  if (key === lastPositionPreferencesKey) return;
  await client.put('/lol-lobby/v2/lobby/members/localMember/position-preferences', {
    firstPreference: preferences.quickGameFirstPosition,
    secondPreference: preferences.quickGameSecondPosition,
  });
  lastPositionPreferencesKey = key;
  reportAssistAction('快速游戏位置偏好已应用');
}

async function handleAutomaticRecommendation(
  client: LcuClient,
  championId: number,
  queueId: number,
  position: string,
): Promise<void> {
  const settings = getSettings().assist;
  const runeEnabled = settings.autoWinRateRunes || settings.autoPickRateRunes;
  const itemEnabled = settings.autoWinRateItems || settings.autoPickRateItems;
  if (!championId || (!runeEnabled && !itemEnabled)) return;

  const strategy = settings.autoWinRateRunes || settings.autoWinRateItems
    ? 'winRate'
    : 'pickRate';
  const key = `${lastChampSelectGameId}:${championId}:${strategy}:${runeEnabled}:${itemEnabled}`;
  if (key === lastRecommendationKey && Date.now() - lastRecommendationAt < 15_000) return;
  lastRecommendationKey = key;
  lastRecommendationAt = Date.now();
  const results = await applyAssistRecommendation(
    { championId, queueId, position, strategy },
    { rune: runeEnabled, items: itemEnabled },
  );
  const successful = results.filter((result) => result.success).map((result) => result.message);
  if (successful.length > 0) {
    reportAssistAction(successful.join('；'));
    if (
      (runeEnabled && settings.sendRunesMessage) ||
      (itemEnabled && settings.sendItemsMessage)
    ) {
      await sendLobbyMessage(client, successful.join('；')).catch(() => undefined);
    }
  }
}

function clearAcceptTimer(): void {
  if (acceptTimer) clearTimeout(acceptTimer);
  acceptTimer = null;
}

async function acceptReadyCheck(client: LcuClient, delayMs: number): Promise<void> {
  if (acceptTimer) return;
  acceptTimer = setTimeout(() => {
    acceptTimer = null;
    void client
      .post('/lol-matchmaking/v1/ready-check/accept', null)
      .catch((error) => console.warn('[assist] 自动接受失败:', error));
  }, delayMs);
}

async function getQueueId(client: LcuClient): Promise<{ queueId: number; gameId: number }> {
  try {
    const session = await client.get<GameflowSession>('/lol-gameflow/v1/session');
    return {
      queueId: Number(session.gameData?.queue?.id ?? 0),
      gameId: Number(session.gameData?.gameId ?? 0),
    };
  } catch {
    return { queueId: 0, gameId: 0 };
  }
}

async function handleBenchSwap(
  client: LcuClient,
  session: ChampSelectSession,
  preferred: number[],
  currentChampionId: number,
): Promise<void> {
  if (!session.benchEnabled || preferred.length === 0) return;
  const benchIds = (session.benchChampions ?? [])
    .map((item) => Number(item.championId ?? 0))
    .filter((item) => item > 0);
  const target = firstAvailableChampion(preferred, benchIds);
  if (!target) return;

  const currentIndex = preferred.indexOf(currentChampionId);
  const targetIndex = preferred.indexOf(target);
  if (currentIndex !== -1 && currentIndex <= targetIndex) return;

  const swapKey = `${currentChampionId}:${target}`;
  if (swapKey === lastBenchSwapKey) return;
  lastBenchSwapKey = swapKey;
  await client.post(`/lol-champ-select/v1/session/bench/swap/${target}`, null);
}

async function handleChampionSelect(client: LcuClient): Promise<void> {
  const settings = getSettings().assist;

  const [session, gameflow] = await Promise.all([
    client.get<ChampSelectSession>('/lol-champ-select/v1/session'),
    getQueueId(client),
  ]);
  if (gameflow.gameId && gameflow.gameId !== lastChampSelectGameId) {
    lastChampSelectGameId = gameflow.gameId;
    completedActionIds.clear();
    lastBenchSwapKey = '';
  }

  const localCellId = Number(session.localPlayerCellId ?? -1);
  const localPlayer = (session.myTeam ?? []).find((player) => player.cellId === localCellId);
  const role = normalizeRole(localPlayer?.assignedPosition);
  const preferred = getPreferredPicks(settings.champions, gameflow.queueId, role);
  const championId = Number(localPlayer?.championId ?? 0);

  await handleAutomaticRecommendation(
    client,
    championId,
    gameflow.queueId,
    role,
  ).catch(reportAssistError);

  updateAssistRuntimeStatus({
    championId,
    position: role,
  });

  if (settings.autoChampionEnabled && [450, 2400, 2410].includes(gameflow.queueId)) {
    await handleBenchSwap(
      client,
      session,
      preferred,
      championId,
    );
  }

  if (!settings.autoChampionEnabled) return;
  const action = findLocalAction(session.actions ?? [], localCellId);
  if (!action || completedActionIds.has(action.id)) return;

  if (action.type === 'ban') {
    const championId = getPreferredBan(settings.champions, gameflow.queueId, role);
    if (!championId) return;
    await client.patch(`/lol-champ-select/v1/session/actions/${action.id}`, {
      championId,
      type: 'ban',
      completed: true,
    });
    completedActionIds.add(action.id);
    return;
  }

  if (action.type === 'pick') {
    const pickable = await client.get<number[]>('/lol-champ-select/v1/pickable-champion-ids');
    const championId = firstAvailableChampion(preferred, pickable);
    if (!championId) return;
    await client.patch(`/lol-champ-select/v1/session/actions/${action.id}`, {
      championId,
      type: 'pick',
      completed: true,
    });
    completedActionIds.add(action.id);
  }
}

async function honorPlayers(client: LcuClient): Promise<void> {
  const settings = getSettings().assist;
  if (
    !settings.autoHonorTeammates &&
    !settings.autoHonorSummonerId &&
    !settings.autoHonorSummonerName
  ) return;

  const ballot = await client.get<HonorBallot>('/lol-honor-v2/v1/ballot');
  const eligible = ballot.eligiblePlayers ?? [];
  let targets = eligible;
  if (settings.autoHonorSummonerId) {
    targets = eligible.filter(
      (player) => Number(player.summonerId ?? 0) === settings.autoHonorSummonerId,
    );
  } else if (settings.autoHonorSummonerName) {
    const stats = await client.get<EndOfGameStats>(
      '/lol-end-of-game/v1/eog-stats-block',
    ).catch((): EndOfGameStats => ({}));
    const requested = normalizeRiotId(settings.autoHonorSummonerName);
    const matched = (stats.teams ?? [])
      .flatMap((team) => team.players ?? [])
      .find((player) => {
        const name = player.gameName || player.summonerName || '';
        return !player.isLocalPlayer && normalizeRiotId(name) === requested;
      });
    if (matched?.summonerId) {
      targets = eligible.filter(
        (player) => Number(player.summonerId ?? 0) === Number(matched.summonerId),
      );
    } else {
      targets = [];
    }
  }

  for (const player of targets) {
    const summonerId = Number(player.summonerId ?? 0);
    if (!summonerId || !ballot.gameId) continue;
    const category = HONOR_CATEGORIES[Math.floor(Math.random() * HONOR_CATEGORIES.length)];
    await client.post('/lol-honor-v2/v1/honor-player', {
      gameId: ballot.gameId,
      honorCategory: category,
      summonerId,
    });
    if (settings.autoHonorSummonerId || settings.autoHonorSummonerName) break;
  }
}

async function handleEndOfGame(client: LcuClient): Promise<void> {
  const settings = getSettings().assist;
  await honorPlayers(client).catch((error) => {
    console.warn('[assist] 自动点赞失败:', error);
  });

  if (settings.autoPlayAgain) {
    await client.post('/lol-lobby/v2/play-again', null);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await client.post('/lol-lobby/v2/lobby/matchmaking/search', null);
  } else if (settings.autoReturnLobby) {
    await client.post('/lol-lobby/v2/play-again', null);
  }
}

async function pollAssist(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    const settings = getSettings().assist;
    syncAssistGlobalShortcuts(settings.globalHotkeysEnabled, settings.hotkeys);

    const creds = getCachedCredentials();
    if (!creds) {
      clearAcceptTimer();
      previousPhase = '';
      return;
    }

    const client = new LcuClient(creds);
    const phase = await client.get<string>('/lol-gameflow/v1/gameflow-phase');
    const gameflow = await getQueueId(client);
    updateAssistRuntimeStatus({
      connected: true,
      phase,
      queueId: gameflow.queueId,
      lastError: '',
    });

    if (phase === 'ReadyCheck' && settings.autoAccept) {
      await acceptReadyCheck(client, settings.autoAcceptDelayMs);
    } else {
      clearAcceptTimer();
    }

    if (phase === 'ChampSelect') {
      await handleChampionSelect(client);
    } else if (previousPhase === 'ChampSelect') {
      completedActionIds.clear();
      lastBenchSwapKey = '';
      lastRecommendationKey = '';
      lastRecommendationAt = 0;
    }

    if (phase === 'Lobby') {
      await applyPositionPreferences(client).catch(reportAssistError);
    } else if (previousPhase === 'Lobby') {
      lastPositionPreferencesKey = '';
    }

    if (
      ['PreEndOfGame', 'EndOfGame', 'WaitingForStats'].includes(phase) &&
      !['PreEndOfGame', 'EndOfGame', 'WaitingForStats'].includes(previousPhase)
    ) {
      await handleEndOfGame(client);
    }

    previousPhase = phase;
  } catch (error) {
    clearAcceptTimer();
    updateAssistRuntimeStatus({ connected: false });
    reportAssistError(error);
  } finally {
    polling = false;
  }
}

export function startAssistEngine(): void {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    void pollAssist();
  }, POLL_INTERVAL_MS);
  void pollAssist();
}

export function stopAssistEngine(): void {
  clearAcceptTimer();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}
