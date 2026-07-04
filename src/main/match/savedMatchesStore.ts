import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type {
  PlayerMatchDetail,
  PlayerProfile,
  SavedMatchAccount,
  SavedMatchGroup,
  SavedMatchesState,
} from '../../shared/api';

const SAVED_MATCHES_FILE = 'lolhelper-saved-matches.json';

function getStorePath(): string {
  return path.join(app.getPath('userData'), SAVED_MATCHES_FILE);
}

function emptyState(): SavedMatchesState {
  return { accounts: [], groups: [] };
}

function getAccountId(profile: PlayerProfile, region: string): string {
  const identity = profile.puuid || profile.riotId || 'unknown';
  return `${region || 'current'}:${identity}`;
}

function makeGroupId(): string {
  return `group-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    .map((account) => ({
      ...account,
      region: account.region || '',
      regionName: typeof account.regionName === 'string' ? account.regionName : undefined,
      groupId: account.groupId && groupIds.has(account.groupId) ? account.groupId : undefined,
      createdAt: Number.isFinite(account.createdAt) ? account.createdAt : Date.now(),
      updatedAt: Number.isFinite(account.updatedAt) ? account.updatedAt : Date.now(),
      matches: [...account.matches].sort((a, b) => b.gameCreation - a.gameCreation),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function normalizeState(value: unknown): SavedMatchesState {
  const raw = value && typeof value === 'object' ? value as Partial<SavedMatchesState> : {};
  const groups = normalizeGroups(raw.groups);
  const accounts = normalizeAccounts(raw.accounts, groups);
  return { accounts, groups };
}

function readState(): SavedMatchesState {
  const filePath = getStorePath();
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return normalizeState(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      backupUnreadableStore(filePath, err);
    }
    return emptyState();
  }
}

function writeState(state: SavedMatchesState): SavedMatchesState {
  const normalized = normalizeState(state);
  const filePath = getStorePath();
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // Ignore cleanup failure.
    }
    throw err;
  }
  return normalized;
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
  return { accounts, groups };
}

export function getSavedMatches(): SavedMatchesState {
  return readState();
}

export function importSavedMatches(state: SavedMatchesState): SavedMatchesState {
  const current = readState();
  const incoming = normalizeState(state);
  if (incoming.accounts.length === 0 && incoming.groups.length === 0) return current;
  return writeState(mergeSavedMatchesState(current, incoming));
}

export function createSavedMatchGroup(name: string): SavedMatchesState {
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

export function deleteSavedMatchGroup(groupId: string): SavedMatchesState {
  const state = readState();
  return writeState({
    groups: state.groups.filter((group) => group.id !== groupId),
    accounts: state.accounts.map((account) =>
      account.groupId === groupId
        ? { ...account, groupId: undefined, updatedAt: Date.now() }
        : account,
    ),
  });
}

export function setSavedMatchAccountGroup(accountId: string, groupId?: string): SavedMatchAccount[] {
  const state = readState();
  const validGroupIds = new Set(state.groups.map((group) => group.id));
  const nextGroupId = groupId && validGroupIds.has(groupId) ? groupId : undefined;
  return writeState({
    ...state,
    accounts: state.accounts.map((account) =>
      account.id === accountId
        ? { ...account, groupId: nextGroupId, updatedAt: Date.now() }
        : account,
    ),
  }).accounts;
}

export function saveMatchesForProfile(
  profile: PlayerProfile,
  region: string,
  matches: PlayerMatchDetail[],
  regionName?: string,
): SavedMatchAccount {
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
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  writeState({
    ...state,
    accounts: [
      nextAccount,
      ...state.accounts.filter((account) => account.id !== accountId),
    ],
  });
  return nextAccount;
}

export function deleteSavedMatchAccount(accountId: string): SavedMatchAccount[] {
  const state = readState();
  return writeState({
    ...state,
    accounts: state.accounts.filter((account) => account.id !== accountId),
  }).accounts;
}

export function deleteSavedMatch(accountId: string, gameId: number): SavedMatchAccount[] {
  const state = readState();
  return writeState({
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
  }).accounts;
}
