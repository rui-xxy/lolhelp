import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type {
  PlayerMatchDetail,
  PlayerProfile,
  PlayerLookupResult,
  SavedMatchAccount,
  SavedMatchFollowAlert,
  SavedMatchFollowSettings,
  SavedMatchGroup,
  SavedMatchPreview,
  SavedMatchesCatalog,
  SavedMatchesState,
} from '../../shared/api';

const SAVED_MATCHES_FILE = 'lolhelper-saved-matches.json';
const FOLLOW_RECENT_MATCH_WINDOW_MS = 60 * 60 * 1000;
const FOLLOW_ALERT_RETENTION_MS = 24 * 60 * 60 * 1000;

let cachedState: SavedMatchesState | null = null;
let pendingSerializedState: string | null = null;
let persistPromise: Promise<void> | null = null;
let tempFileSequence = 0;

function getStorePath(): string {
  return path.join(app.getPath('userData'), SAVED_MATCHES_FILE);
}

function emptyState(): SavedMatchesState {
  return { accounts: [], groups: [], followAlerts: [] };
}

function getAccountId(profile: PlayerProfile, region: string): string {
  const identity = profile.puuid || profile.riotId || 'unknown';
  return `${region || 'current'}:${identity}`;
}

function makeGroupId(): string {
  return `group-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeFollowSettings(value: unknown): SavedMatchFollowSettings | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const follow = value as Partial<SavedMatchFollowSettings>;
  if (!follow.enabled) return undefined;
  return {
    enabled: true,
    startedAt: optionalFiniteNumber(follow.startedAt) ?? Date.now(),
    updatedAt: optionalFiniteNumber(follow.updatedAt) ?? Date.now(),
    lastCheckedAt: optionalFiniteNumber(follow.lastCheckedAt),
    lastNotifiedGameId: optionalFiniteNumber(follow.lastNotifiedGameId),
    lastError: typeof follow.lastError === 'string' && follow.lastError.trim()
      ? follow.lastError.trim()
      : undefined,
  };
}

function normalizeGroups(value: unknown): SavedMatchGroup[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((group): group is SavedMatchGroup => {
      if (!group || typeof group !== 'object') return false;
      const candidate = group as Partial<SavedMatchGroup>;
      return typeof candidate.id === 'string' && typeof candidate.name === 'string';
    })
    .map((group) => ({
      ...group,
      name: group.name.trim() || '未命名分组',
      createdAt: Number.isFinite(group.createdAt) ? group.createdAt : Date.now(),
      updatedAt: Number.isFinite(group.updatedAt) ? group.updatedAt : Date.now(),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function normalizeAccounts(value: unknown, groups: SavedMatchGroup[]): SavedMatchAccount[] {
  if (!Array.isArray(value)) return [];
  const groupIds = new Set(groups.map((group) => group.id));
  return value
    .filter((account): account is SavedMatchAccount => {
      if (!account || typeof account !== 'object') return false;
      const candidate = account as Partial<SavedMatchAccount>;
      return (
        typeof candidate.id === 'string' &&
        candidate.profile !== undefined &&
        Array.isArray(candidate.matches)
      );
    })
    .map((account) => {
      const follow = normalizeFollowSettings(account.follow);
      return {
        ...account,
        region: account.region || '',
        regionName: typeof account.regionName === 'string' ? account.regionName : undefined,
        groupId: account.groupId && groupIds.has(account.groupId) ? account.groupId : undefined,
        ...(follow ? { follow } : {}),
        createdAt: Number.isFinite(account.createdAt) ? account.createdAt : Date.now(),
        updatedAt: Number.isFinite(account.updatedAt) ? account.updatedAt : Date.now(),
        matches: [...account.matches].sort((a, b) => b.gameCreation - a.gameCreation),
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function normalizeFollowAlerts(value: unknown, accountIds: Set<string>): SavedMatchFollowAlert[] {
  if (!Array.isArray(value)) return [];
  const minDetectedAt = Date.now() - FOLLOW_ALERT_RETENTION_MS;
  return value
    .filter((alert): alert is SavedMatchFollowAlert => {
      if (!alert || typeof alert !== 'object') return false;
      const candidate = alert as Partial<SavedMatchFollowAlert>;
      const detectedAt = optionalFiniteNumber(candidate.detectedAt) ?? candidate.match?.gameCreation;
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.accountId === 'string' &&
        accountIds.has(candidate.accountId) &&
        typeof candidate.riotId === 'string' &&
        candidate.match !== undefined &&
        typeof candidate.match === 'object' &&
        Number.isFinite(candidate.match.gameId) &&
        Number.isFinite(candidate.match.gameCreation) &&
        typeof detectedAt === 'number' &&
        detectedAt >= minDetectedAt
      );
    })
    .map((alert) => ({
      ...alert,
      region: alert.region || '',
      regionName: typeof alert.regionName === 'string' ? alert.regionName : undefined,
      profileIconId: Number.isFinite(alert.profileIconId) ? alert.profileIconId : undefined,
      profileIconUrl: typeof alert.profileIconUrl === 'string' ? alert.profileIconUrl : undefined,
      detectedAt: Number.isFinite(alert.detectedAt) ? alert.detectedAt : Date.now(),
      notifiedAt: Number.isFinite(alert.notifiedAt) ? alert.notifiedAt : undefined,
    }))
    .sort((a, b) => b.match.gameCreation - a.match.gameCreation);
}

function normalizeState(value: unknown): SavedMatchesState {
  const raw = value && typeof value === 'object' ? value as Partial<SavedMatchesState> : {};
  const groups = normalizeGroups(raw.groups);
  const accounts = normalizeAccounts(raw.accounts, groups);
  const accountIds = new Set(accounts.map((account) => account.id));
  const followAlerts = normalizeFollowAlerts(raw.followAlerts, accountIds);
  return { accounts, groups, followAlerts };
}

function readState(): SavedMatchesState {
  if (cachedState) return cachedState;
  const filePath = getStorePath();
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    cachedState = normalizeState(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      backupUnreadableStore(filePath, err);
    }
    cachedState = emptyState();
  }
  return cachedState;
}

async function persistSerializedState(serialized: string): Promise<void> {
  const filePath = getStorePath();
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${tempFileSequence++}.tmp`;
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.promises.writeFile(tempPath, serialized, 'utf8');
    await fs.promises.rename(tempPath, filePath);
  } catch (err) {
    try {
      await fs.promises.rm(tempPath, { force: true });
    } catch {
      // Ignore cleanup failure.
    }
    throw err;
  }
}

function queuePersist(serialized: string): Promise<void> {
  pendingSerializedState = serialized;
  if (!persistPromise) {
    persistPromise = (async () => {
      while (pendingSerializedState !== null) {
        const nextSerializedState = pendingSerializedState;
        pendingSerializedState = null;
        await persistSerializedState(nextSerializedState);
      }
    })().finally(() => {
      persistPromise = null;
    });
  }
  return persistPromise;
}

async function writeState(state: SavedMatchesState): Promise<SavedMatchesState> {
  const normalized = normalizeState(state);
  cachedState = normalized;
  try {
    // Compact JSON is the same schema, but materially reduces serialization and disk I/O.
    await queuePersist(JSON.stringify(normalized));
    return normalized;
  } catch (error) {
    // Do not keep serving state that was not durably persisted.
    cachedState = null;
    throw error;
  }
}

function backupUnreadableStore(filePath: string, err: unknown): void {
  try {
    if (!fs.existsSync(filePath)) return;
    const parsed = path.parse(filePath);
    const backupPath = path.join(parsed.dir, `${parsed.name}.corrupt-${Date.now()}${parsed.ext}`);
    fs.renameSync(filePath, backupPath);
    console.warn(`[saved-matches] moved unreadable store to ${backupPath}`, err);
  } catch (backupErr) {
    console.warn('[saved-matches] failed to back up unreadable store', backupErr);
  }
}

function mergeAccounts(
  existing: SavedMatchAccount,
  incoming: SavedMatchAccount,
  validGroupIds: Set<string>,
): SavedMatchAccount {
  const matchById = new Map<number, PlayerMatchDetail>();
  for (const match of existing.matches) matchById.set(match.gameId, match);
  for (const match of incoming.matches) matchById.set(match.gameId, match);

  return {
    ...existing,
    ...incoming,
    regionName: incoming.regionName || existing.regionName,
    groupId: incoming.groupId && validGroupIds.has(incoming.groupId)
      ? incoming.groupId
      : existing.groupId,
    follow: incoming.follow ?? existing.follow,
    createdAt: Math.min(existing.createdAt, incoming.createdAt),
    updatedAt: Math.max(existing.updatedAt, incoming.updatedAt),
    matches: Array.from(matchById.values()).sort((a, b) => b.gameCreation - a.gameCreation),
  };
}

function mergeSavedMatchesState(current: SavedMatchesState, incoming: SavedMatchesState): SavedMatchesState {
  const groupById = new Map<string, SavedMatchGroup>();
  for (const group of current.groups) groupById.set(group.id, group);
  for (const group of incoming.groups) {
    const existing = groupById.get(group.id);
    groupById.set(group.id, existing
      ? { ...existing, ...group, createdAt: Math.min(existing.createdAt, group.createdAt), updatedAt: Math.max(existing.updatedAt, group.updatedAt) }
      : group);
  }

  const groups = Array.from(groupById.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  const validGroupIds = new Set(groups.map((group) => group.id));
  const accountById = new Map<string, SavedMatchAccount>();
  for (const account of current.accounts) accountById.set(account.id, account);
  for (const account of incoming.accounts) {
    const existing = accountById.get(account.id);
    accountById.set(account.id, existing ? mergeAccounts(existing, account, validGroupIds) : account);
  }

  const accounts = Array.from(accountById.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  const accountIds = new Set(accounts.map((account) => account.id));
  const alertById = new Map<string, SavedMatchFollowAlert>();
  for (const alert of normalizeFollowAlerts(current.followAlerts, accountIds)) alertById.set(alert.id, alert);
  for (const alert of normalizeFollowAlerts(incoming.followAlerts, accountIds)) alertById.set(alert.id, alert);
  const followAlerts = Array.from(alertById.values()).sort((a, b) => b.match.gameCreation - a.match.gameCreation);
  return { accounts, groups, followAlerts };
}

export function getSavedMatches(): SavedMatchesState {
  return readState();
}

export function getSavedMatchesSummary(): { followAlertIds: string[] } {
  return {
    followAlertIds: (readState().followAlerts ?? []).map((alert) => alert.id),
  };
}

function toSavedMatchPreview(match: PlayerMatchDetail): SavedMatchPreview {
  return {
    gameId: match.gameId,
    queueId: match.queueId,
    queueName: match.queueName,
    gameCreation: match.gameCreation,
    gameDuration: match.gameDuration,
    championId: match.championId,
    championName: match.championName,
    championAvatar: match.championAvatar,
    kills: match.kills,
    deaths: match.deaths,
    assists: match.assists,
    kda: match.kda,
    win: match.win,
    damage: match.damage,
    cs: match.cs,
  };
}

export function getSavedMatchesCatalog(): SavedMatchesCatalog {
  const state = readState();
  return {
    accounts: state.accounts.map((account) => ({
      ...account,
      matches: account.matches.map(toSavedMatchPreview),
    })),
    groups: state.groups,
    followAlerts: (state.followAlerts ?? []).map((alert) => ({
      ...alert,
      match: toSavedMatchPreview(alert.match),
    })),
  };
}

export function getSavedMatchAccount(accountId: string): SavedMatchAccount | null {
  return readState().accounts.find((account) => account.id === accountId) ?? null;
}

export async function importSavedMatches(state: SavedMatchesState): Promise<SavedMatchesState> {
  const current = readState();
  const incoming = normalizeState(state);
  if (incoming.accounts.length === 0 && incoming.groups.length === 0) return current;
  return writeState(mergeSavedMatchesState(current, incoming));
}

export async function createSavedMatchGroup(name: string): Promise<SavedMatchesState> {
  const trimmed = name.trim();
  const state = readState();
  if (!trimmed) return state;
  const now = Date.now();
  return writeState({
    ...state,
    groups: [
      { id: makeGroupId(), name: trimmed, createdAt: now, updatedAt: now },
      ...state.groups,
    ],
  });
}

export async function deleteSavedMatchGroup(groupId: string): Promise<SavedMatchesState> {
  const state = readState();
  return writeState({
    ...state,
    groups: state.groups.filter((group) => group.id !== groupId),
    accounts: state.accounts.map((account) =>
      account.groupId === groupId
        ? { ...account, groupId: undefined, updatedAt: Date.now() }
        : account,
    ),
  });
}

export async function setSavedMatchAccountGroup(accountId: string, groupId?: string): Promise<SavedMatchAccount[]> {
  const state = readState();
  const validGroupIds = new Set(state.groups.map((group) => group.id));
  const nextGroupId = groupId && validGroupIds.has(groupId) ? groupId : undefined;
  return (await writeState({
    ...state,
    accounts: state.accounts.map((account) =>
      account.id === accountId
        ? { ...account, groupId: nextGroupId, updatedAt: Date.now() }
        : account,
    ),
  })).accounts;
}

export async function setSavedMatchAccountFollow(accountId: string, enabled: boolean): Promise<SavedMatchesState> {
  const state = readState();
  const now = Date.now();
  return writeState({
    ...state,
    accounts: state.accounts.map((account) => {
      if (account.id !== accountId) return account;
      if (!enabled) {
        return { ...account, follow: undefined };
      }
      return {
        ...account,
        follow: {
          enabled: true,
          startedAt: account.follow?.startedAt ?? now,
          updatedAt: now,
          lastCheckedAt: account.follow?.lastCheckedAt,
          lastNotifiedGameId: account.follow?.lastNotifiedGameId,
          lastError: undefined,
        },
      };
    }),
    followAlerts: enabled
      ? state.followAlerts
      : (state.followAlerts ?? []).filter((alert) => alert.accountId !== accountId),
  });
}

export interface SavedMatchFollowPollInput {
  accountId: string;
  result: PlayerLookupResult | null;
  checkedAt: number;
  error?: string;
}

export interface SavedMatchFollowPollSaveResult {
  accountId: string;
  alert: SavedMatchFollowAlert | null;
  shouldNotify: boolean;
}

function applySavedMatchFollowPollResult(
  state: SavedMatchesState,
  input: SavedMatchFollowPollInput,
): { state: SavedMatchesState; result: SavedMatchFollowPollSaveResult; changed: boolean } {
  const { accountId, result, checkedAt, error } = input;
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account?.follow?.enabled) {
    return {
      state,
      result: { accountId, alert: null, shouldNotify: false },
      changed: false,
    };
  }

  const latestMatch = result?.matches[0];
  const matchById = new Map<number, PlayerMatchDetail>();
  for (const match of account.matches) matchById.set(match.gameId, match);
  if (latestMatch) matchById.set(latestMatch.gameId, latestMatch);

  const isRecent = Boolean(latestMatch && latestMatch.gameCreation >= checkedAt - FOLLOW_RECENT_MATCH_WINDOW_MS);
  const shouldNotify = Boolean(
    isRecent &&
      latestMatch &&
      account.follow.lastNotifiedGameId !== latestMatch.gameId,
  );

  const nextProfile = result?.profile?.puuid
    ? {
        ...account.profile,
        ...result.profile,
        rank: result.profile.rank ?? account.profile.rank,
        ranks: result.profile.ranks?.length ? result.profile.ranks : account.profile.ranks,
        championCount: result.profile.championCount ?? account.profile.championCount,
        skinCount: result.profile.skinCount ?? account.profile.skinCount,
      }
    : account.profile;
  const nextFollow: SavedMatchFollowSettings = {
    ...account.follow,
    enabled: true,
    updatedAt: checkedAt,
    lastCheckedAt: checkedAt,
    lastError: error || result?.error || undefined,
    lastNotifiedGameId: shouldNotify && latestMatch
      ? latestMatch.gameId
      : account.follow.lastNotifiedGameId,
  };
  const nextAccount: SavedMatchAccount = {
    ...account,
    profile: nextProfile,
    matches: Array.from(matchById.values()).sort((a, b) => b.gameCreation - a.gameCreation),
    follow: nextFollow,
    updatedAt: account.updatedAt,
  };

  const activeAlerts = state.followAlerts ?? [];
  let alert: SavedMatchFollowAlert | null = null;
  if (isRecent && latestMatch) {
    const alertId = `${accountId}:${latestMatch.gameId}`;
    const existingAlert = activeAlerts.find((item) => item.id === alertId);
    alert = existingAlert ?? {
      id: alertId,
      accountId,
      riotId: nextProfile.riotId || account.profile.riotId,
      region: account.region,
      regionName: account.regionName,
      profileIconId: nextProfile.profileIconId,
      profileIconUrl: nextProfile.profileIconUrl,
      match: latestMatch,
      detectedAt: checkedAt,
      notifiedAt: shouldNotify ? checkedAt : undefined,
    };
  }
  const nextAlerts = alert
    ? [alert, ...activeAlerts.filter((item) => item.accountId !== accountId)]
    : activeAlerts;

  const nextState = {
    ...state,
    accounts: [
      nextAccount,
      ...state.accounts.filter((item) => item.id !== accountId),
    ],
    followAlerts: nextAlerts,
  };

  return {
    state: nextState,
    result: { accountId, alert, shouldNotify },
    changed: true,
  };
}

/** Apply one complete follow-watcher cycle and persist it with a single atomic write. */
export async function saveSavedMatchFollowPollResults(
  inputs: SavedMatchFollowPollInput[],
): Promise<SavedMatchFollowPollSaveResult[]> {
  let nextState = readState();
  let changed = false;
  const results: SavedMatchFollowPollSaveResult[] = [];

  for (const input of inputs) {
    const applied = applySavedMatchFollowPollResult(nextState, input);
    nextState = applied.state;
    changed ||= applied.changed;
    results.push(applied.result);
  }

  if (changed) await writeState(nextState);
  return results;
}

export async function saveMatchesForProfile(
  profile: PlayerProfile,
  region: string,
  matches: PlayerMatchDetail[],
  regionName?: string,
): Promise<SavedMatchAccount> {
  const now = Date.now();
  const state = readState();
  const accountId = getAccountId(profile, region);
  const existing = state.accounts.find((account) => account.id === accountId);
  const matchById = new Map<number, PlayerMatchDetail>();

  for (const match of existing?.matches ?? []) {
    matchById.set(match.gameId, match);
  }
  for (const match of matches) {
    matchById.set(match.gameId, match);
  }

  const nextAccount: SavedMatchAccount = {
    id: accountId,
    region,
    regionName: regionName?.trim() || existing?.regionName,
    profile,
    matches: Array.from(matchById.values()).sort((a, b) => b.gameCreation - a.gameCreation),
    groupId: existing?.groupId,
    follow: existing?.follow,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await writeState({
    ...state,
    accounts: [
      nextAccount,
      ...state.accounts.filter((account) => account.id !== accountId),
    ],
  });
  return nextAccount;
}

export async function deleteSavedMatchAccount(accountId: string): Promise<SavedMatchAccount[]> {
  const state = readState();
  return (await writeState({
    ...state,
    accounts: state.accounts.filter((account) => account.id !== accountId),
    followAlerts: (state.followAlerts ?? []).filter((alert) => alert.accountId !== accountId),
  })).accounts;
}

export async function deleteSavedMatch(accountId: string, gameId: number): Promise<SavedMatchAccount[]> {
  const state = readState();
  return (await writeState({
    ...state,
    accounts: state.accounts
      .map((account) =>
        account.id === accountId
          ? {
              ...account,
              matches: account.matches.filter((match) => match.gameId !== gameId),
              updatedAt: Date.now(),
            }
          : account,
      )
      .filter((account) => account.matches.length > 0),
    followAlerts: (state.followAlerts ?? []).filter(
      (alert) => !(alert.accountId === accountId && alert.match.gameId === gameId),
    ),
  })).accounts;
}
