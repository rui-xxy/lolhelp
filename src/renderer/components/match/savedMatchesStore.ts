import type { PlayerMatchDetail, PlayerProfile } from '../../../shared/api';

const STORAGE_KEY = 'lolhelp:saved-match-accounts:v1';

export const SAVED_MATCHES_CHANGED_EVENT = 'lolhelp:saved-matches-changed';

export interface SavedMatchAccount {
  id: string;
  region: string;
  profile: PlayerProfile;
  matches: PlayerMatchDetail[];
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

function normalizeAccounts(value: unknown): SavedMatchAccount[] {
  if (!Array.isArray(value)) return [];
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

function writeSavedMatchAccounts(accounts: SavedMatchAccount[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  emitSavedMatchesChanged();
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
