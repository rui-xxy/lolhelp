import type { FriendRequestInfo } from '../../../shared/api';

const OUTGOING_REQUESTS_STORAGE_KEY = 'lolhelp:outgoing-friend-requests:v1';
const ACCEPTED_ALERTS_STORAGE_KEY = 'lolhelp:accepted-friend-alerts:v1';
const ACCEPTED_ALERT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const ACCEPTED_ALERT_LIMIT = 20;

export interface FriendAcceptedAlert {
  id: string;
  puuid: string;
  riotId: string;
  icon: number;
  iconUrl?: string;
  iconUrls?: string[];
  acceptedAt: number;
  read: boolean;
}

function isFriendRequest(value: unknown): value is FriendRequestInfo {
  if (!value || typeof value !== 'object') return false;
  const request = value as Partial<FriendRequestInfo>;
  return typeof request.puuid === 'string' && request.puuid.length > 0;
}

function isAcceptedAlert(value: unknown): value is FriendAcceptedAlert {
  if (!value || typeof value !== 'object') return false;
  const alert = value as Partial<FriendAcceptedAlert>;
  return typeof alert.id === 'string'
    && typeof alert.puuid === 'string'
    && typeof alert.riotId === 'string'
    && typeof alert.acceptedAt === 'number'
    && Number.isFinite(alert.acceptedAt);
}

export function loadTrackedOutgoingRequests(): FriendRequestInfo[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(OUTGOING_REQUESTS_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isFriendRequest) : [];
  } catch {
    return [];
  }
}

export function saveTrackedOutgoingRequests(requests: FriendRequestInfo[]): void {
  try {
    window.localStorage.setItem(OUTGOING_REQUESTS_STORAGE_KEY, JSON.stringify(requests));
  } catch {
    // Tracking is best-effort when local storage is unavailable.
  }
}

export function loadFriendAcceptedAlerts(now = Date.now()): FriendAcceptedAlert[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(ACCEPTED_ALERTS_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isAcceptedAlert)
      .filter((alert) => now - alert.acceptedAt <= ACCEPTED_ALERT_MAX_AGE_MS)
      .sort((left, right) => right.acceptedAt - left.acceptedAt)
      .slice(0, ACCEPTED_ALERT_LIMIT);
  } catch {
    return [];
  }
}

export function saveFriendAcceptedAlerts(alerts: FriendAcceptedAlert[]): void {
  try {
    window.localStorage.setItem(
      ACCEPTED_ALERTS_STORAGE_KEY,
      JSON.stringify(alerts.slice(0, ACCEPTED_ALERT_LIMIT)),
    );
  } catch {
    // Notifications still work for the current session without persistence.
  }
}

export function createAcceptedAlerts(
  removedRequests: FriendRequestInfo[],
  acceptedPuuids: Set<string>,
  acceptedAt = Date.now(),
): FriendAcceptedAlert[] {
  return removedRequests
    .filter((request) => acceptedPuuids.has(request.puuid))
    .map((request) => ({
      id: `${request.puuid}:${acceptedAt}`,
      puuid: request.puuid,
      riotId: request.gameTag ? `${request.gameName}#${request.gameTag}` : request.gameName,
      icon: request.icon,
      iconUrl: request.iconUrl,
      iconUrls: request.iconUrls,
      acceptedAt,
      read: false,
    }));
}

export function mergeAcceptedAlerts(
  current: FriendAcceptedAlert[],
  incoming: FriendAcceptedAlert[],
): FriendAcceptedAlert[] {
  const incomingPuuids = new Set(incoming.map((alert) => alert.puuid));
  return [...incoming, ...current.filter((alert) => !incomingPuuids.has(alert.puuid))]
    .sort((left, right) => right.acceptedAt - left.acceptedAt)
    .slice(0, ACCEPTED_ALERT_LIMIT);
}
