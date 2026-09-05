export interface SgpSessionIdentity {
  credentialKey: string;
  puuid: string;
  regionKey: string;
}

export function isSameSgpSession(
  cached: SgpSessionIdentity,
  current: SgpSessionIdentity,
): boolean {
  return cached.credentialKey === current.credentialKey
    && cached.puuid === current.puuid
    && cached.regionKey === current.regionKey;
}

export function getSgpHttpStatus(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/HTTP\s+(\d{3})\b/);
  return match ? Number(match[1]) : null;
}

export function shouldForceRefreshSgpAuth(error: unknown): boolean {
  const status = getSgpHttpStatus(error);
  return status === 401 || status === 403;
}
