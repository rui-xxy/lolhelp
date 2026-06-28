import type { PlayerMatchDetail, PlayerProfile } from '../../../shared/api';

const STORAGE_KEY = 'lolhelp:saved-match-accounts:v1';
const GROUP_STORAGE_KEY = 'lolhelp:saved-match-groups:v1';

export const SAVED_MATCHES_CHANGED_EVENT = 'lolhelp:saved-matches-changed';

export interface SavedMatchGroup {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface SavedMatchAccount {
  id: string;
  region: string;
  profile: PlayerProfile;
  matches: PlayerMatchDetail[];
  groupId?: string;
  createdAt: number;
  updatedAt: number;
}

function getAccountId(profile: PlayerProfile, region: string): string {
  const identity = profile.puuid || profile.riotId || 'unknown';
  return `${region || 'current'}:${identity}`;
}

function emitSavedMatchesChanged() {
  window.dispatchEvent(new CustomEvent(SAVED_MATCHES_CHANGED_EVENT));
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

function normalizeAccounts(value: unknown): SavedMatchAccount[] {
  if (!Array.isArray(value)) return [];
  const groupIds = new Set(loadSavedMatchGroups().map((group) => group.id));
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
      groupId: account.groupId && groupIds.has(account.groupId) ? account.groupId : undefined,
      createdAt: Number.isFinite(account.createdAt) ? account.createdAt : Date.now(),
      updatedAt: Number.isFinite(account.updatedAt) ? account.updatedAt : Date.now(),
      matches: [...account.matches].sort((a, b) => b.gameCreation - a.gameCreation),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadSavedMatchAccounts(): SavedMatchAccount[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return normalizeAccounts(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function loadSavedMatchGroups(): SavedMatchGroup[] {
  try {
    const raw = window.localStorage.getItem(GROUP_STORAGE_KEY);
    if (!raw) return [];
    return normalizeGroups(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeSavedMatchAccounts(accounts: SavedMatchAccount[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  emitSavedMatchesChanged();
}

function writeSavedMatchGroups(groups: SavedMatchGroup[]) {
  window.localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(groups));
  emitSavedMatchesChanged();
}

export function createSavedMatchGroup(name: string): SavedMatchGroup[] {
  const trimmed = name.trim();
  if (!trimmed) return loadSavedMatchGroups();
  const now = Date.now();
  const groups = loadSavedMatchGroups();
  const nextGroups = [
    { id: makeGroupId(), name: trimmed, createdAt: now, updatedAt: now },
    ...groups,
  ];
  writeSavedMatchGroups(nextGroups);
  return nextGroups;
}

export function deleteSavedMatchGroup(groupId: string): {
  groups: SavedMatchGroup[];
  accounts: SavedMatchAccount[];
} {
  const groups = loadSavedMatchGroups().filter((group) => group.id !== groupId);
  const accounts = loadSavedMatchAccounts().map((account) =>
    account.groupId === groupId ? { ...account, groupId: undefined, updatedAt: Date.now() } : account,
  );
  writeSavedMatchGroups(groups);
  writeSavedMatchAccounts(accounts);
  return { groups, accounts };
}

export function setSavedMatchAccountGroup(accountId: string, groupId?: string): SavedMatchAccount[] {
  const validGroupIds = new Set(loadSavedMatchGroups().map((group) => group.id));
  const nextGroupId = groupId && validGroupIds.has(groupId) ? groupId : undefined;
  const accounts = loadSavedMatchAccounts().map((account) =>
    account.id === accountId
      ? { ...account, groupId: nextGroupId, updatedAt: Date.now() }
      : account,
  );
  writeSavedMatchAccounts(accounts);
  return accounts;
}

export function saveMatchesForProfile(
  profile: PlayerProfile,
  region: string,
  matches: PlayerMatchDetail[],
): SavedMatchAccount {
  const now = Date.now();
  const accountId = getAccountId(profile, region);
  const accounts = loadSavedMatchAccounts();
  const existing = accounts.find((account) => account.id === accountId);
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
    profile,
    matches: Array.from(matchById.values()).sort((a, b) => b.gameCreation - a.gameCreation),
    groupId: existing?.groupId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const nextAccounts = [
    nextAccount,
    ...accounts.filter((account) => account.id !== accountId),
  ].sort((a, b) => b.updatedAt - a.updatedAt);
  writeSavedMatchAccounts(nextAccounts);
  return nextAccount;
}

export function deleteSavedMatchAccount(accountId: string): SavedMatchAccount[] {
  const nextAccounts = loadSavedMatchAccounts().filter((account) => account.id !== accountId);
  writeSavedMatchAccounts(nextAccounts);
  return nextAccounts;
}

export function deleteSavedMatch(accountId: string, gameId: number): SavedMatchAccount[] {
  const accounts = loadSavedMatchAccounts();
  const nextAccounts = accounts
    .map((account) =>
      account.id === accountId
        ? {
            ...account,
            matches: account.matches.filter((match) => match.gameId !== gameId),
            updatedAt: Date.now(),
          }
        : account,
    )
    .filter((account) => account.matches.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  writeSavedMatchAccounts(nextAccounts);
  return nextAccounts;
}
