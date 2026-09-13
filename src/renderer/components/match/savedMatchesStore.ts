import type {
  PlayerMatchDetail,
  PlayerProfile,
  SavedMatchAccount,
  SavedMatchAccountCatalogEntry,
  SavedMatchFollowAlert,
  SavedMatchFollowAlertPreview,
  SavedMatchGroup,
  SavedMatchSaveResult,
  SavedMatchesCatalog,
  SavedMatchesState,
  SavedMatchesSummary,
} from '../../../shared/api';

export type { SavedMatchAccount, SavedMatchFollowAlert, SavedMatchGroup, SavedMatchesState };
export type {
  SavedMatchAccountCatalogEntry,
  SavedMatchFollowAlertPreview,
  SavedMatchesCatalog,
};

export const SAVED_MATCHES_CHANGED_EVENT = 'lolhelp:saved-matches-changed';
const LEGACY_ACCOUNTS_STORAGE_KEY = 'lolhelp:saved-match-accounts:v1';
const LEGACY_GROUPS_STORAGE_KEY = 'lolhelp:saved-match-groups:v1';
const LEGACY_MIGRATION_STORAGE_KEY = 'lolhelp:saved-matches-migrated:v2';

function emitSavedMatchesChanged() {
  window.dispatchEvent(new CustomEvent(SAVED_MATCHES_CHANGED_EVENT));
}

function parseLegacyArray(key: string): unknown[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function markLegacyMigrationDone() {
  try {
    window.localStorage.setItem(LEGACY_MIGRATION_STORAGE_KEY, 'done');
  } catch {
    // Ignore storage failures; the import path still works.
  }
}

async function migrateLegacySavedMatches(): Promise<SavedMatchesState | null> {
  try {
    if (window.localStorage.getItem(LEGACY_MIGRATION_STORAGE_KEY) === 'done') return null;

    const accounts = parseLegacyArray(LEGACY_ACCOUNTS_STORAGE_KEY);
    const groups = parseLegacyArray(LEGACY_GROUPS_STORAGE_KEY);
    if (accounts.length === 0 && groups.length === 0) {
      markLegacyMigrationDone();
      return null;
    }

    const state = await window.lolHelper.match.importSavedMatches({
      accounts: accounts as SavedMatchAccount[],
      groups: groups as SavedMatchGroup[],
    });
    markLegacyMigrationDone();
    return state;
  } catch {
    return null;
  }
}

export async function loadSavedMatchesSummary(): Promise<SavedMatchesSummary> {
  return window.lolHelper.match.getSavedMatchesSummary();
}

export async function loadSavedMatchesCatalog(): Promise<SavedMatchesCatalog> {
  await migrateLegacySavedMatches();
  return window.lolHelper.match.getSavedMatchesCatalog();
}

export async function loadSavedMatchAccount(accountId: string): Promise<SavedMatchAccount | null> {
  return window.lolHelper.match.getSavedMatchAccount(accountId);
}

export async function createSavedMatchGroup(name: string): Promise<SavedMatchesCatalog> {
  const state = await window.lolHelper.match.createSavedMatchGroup(name);
  emitSavedMatchesChanged();
  return state;
}

export async function deleteSavedMatchGroup(groupId: string): Promise<SavedMatchesCatalog> {
  const state = await window.lolHelper.match.deleteSavedMatchGroup(groupId);
  emitSavedMatchesChanged();
  return state;
}

export async function setSavedMatchAccountGroup(
  accountId: string,
  groupId?: string,
): Promise<SavedMatchesCatalog> {
  const catalog = await window.lolHelper.match.setSavedMatchAccountGroup(accountId, groupId);
  emitSavedMatchesChanged();
  return catalog;
}

export async function setSavedMatchAccountFollow(
  accountId: string,
  enabled: boolean,
): Promise<SavedMatchesCatalog> {
  const state = await window.lolHelper.match.setSavedMatchAccountFollow(accountId, enabled);
  emitSavedMatchesChanged();
  return state;
}

export async function saveMatchesForProfile(
  profile: PlayerProfile,
  region: string,
  matches: PlayerMatchDetail[],
  regionName?: string,
): Promise<SavedMatchSaveResult> {
  const result = await window.lolHelper.match.saveMatchesForProfile(profile, region, matches, regionName);
  emitSavedMatchesChanged();
  return result;
}

export async function deleteSavedMatchAccount(accountId: string): Promise<SavedMatchesCatalog> {
  const catalog = await window.lolHelper.match.deleteSavedMatchAccount(accountId);
  emitSavedMatchesChanged();
  return catalog;
}

export async function deleteSavedMatch(accountId: string, gameId: number): Promise<SavedMatchesCatalog> {
  const catalog = await window.lolHelper.match.deleteSavedMatch(accountId, gameId);
  emitSavedMatchesChanged();
  return catalog;
}
