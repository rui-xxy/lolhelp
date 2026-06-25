import type { AssistChampionPreferences, AssistRole } from '../../shared/api';

export interface ChampSelectAction {
  id: number;
  actorCellId: number;
  type: 'pick' | 'ban' | string;
  isInProgress?: boolean;
  completed?: boolean;
}

export interface ChampSelectPlayer {
  cellId: number;
  assignedPosition?: string;
  championId?: number;
  championPickIntent?: number;
}

export function normalizeRole(position: string | undefined): AssistRole {
  switch (String(position ?? '').toLowerCase()) {
    case 'top':
      return 'top';
    case 'jungle':
      return 'jungle';
    case 'middle':
    case 'mid':
      return 'middle';
    case 'bottom':
    case 'bot':
      return 'bottom';
    case 'utility':
    case 'support':
      return 'utility';
    default:
      return 'utility';
  }
}

export function findLocalAction(
  actions: ChampSelectAction[][],
  localPlayerCellId: number,
): ChampSelectAction | null {
  for (const group of actions) {
    const action = group.find(
      (item) =>
        item.actorCellId === localPlayerCellId &&
        item.isInProgress === true &&
        item.completed !== true,
    );
    if (action) return action;
  }
  return null;
}

export function getPreferredPicks(
  preferences: AssistChampionPreferences,
  queueId: number,
  role: AssistRole,
): number[] {
  if (queueId === 450 || queueId === 2400 || queueId === 2410) {
    return preferences.aram;
  }
  if ([1700, 1710, 1750, 2500].includes(queueId)) {
    return preferences.arena;
  }
  if ([420, 440].includes(queueId)) {
    return preferences.byRole[role];
  }
  return preferences.normal;
}

export function getPreferredBan(
  preferences: AssistChampionPreferences,
  queueId: number,
  role: AssistRole,
): number {
  if ([1700, 1710, 1750, 2500].includes(queueId)) {
    return preferences.bans.arena;
  }
  return preferences.bans[role];
}

export function firstAvailableChampion(
  preferred: number[],
  available: number[],
): number {
  const availableSet = new Set(available);
  return preferred.find((championId) => availableSet.has(championId)) ?? 0;
}
