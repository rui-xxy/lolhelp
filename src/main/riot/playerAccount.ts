import { getCachedRiotClientCredentials } from '../lcu/lockfile';
import { RiotClient } from './client';

interface RiotAlias {
  game_name?: string;
  tag_line?: string;
  gameName?: string;
  tagLine?: string;
}

interface RiotAliasLookupItem {
  alias?: RiotAlias;
  puuid?: string;
}

export interface RiotAccountLookup {
  puuid: string;
  riotId: string;
  gameName: string;
  tagLine: string;
}

export function normalizeRiotIdInput(value: string): string {
  return String(value ?? '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .replace(/[＃﹟♯]/g, '#')
    .replace(/\s*#\s*/g, '#')
    .trim();
}

export function splitRiotId(riotId: string): { gameName: string; tagLine: string } | null {
  const normalized = normalizeRiotIdInput(riotId);
  const hashIndex = normalized.lastIndexOf('#');
  if (hashIndex <= 0 || hashIndex === normalized.length - 1) return null;
  const gameName = normalized.slice(0, hashIndex).trim();
  const tagLine = normalized.slice(hashIndex + 1).trim();
  if (!gameName || !tagLine) return null;
  return { gameName, tagLine };
}

function getAliasGameName(alias: RiotAlias | undefined): string {
  return alias?.game_name ?? alias?.gameName ?? '';
}

function getAliasTagLine(alias: RiotAlias | undefined): string {
  return alias?.tag_line ?? alias?.tagLine ?? '';
}

export async function lookupRiotAccountByRiotId(riotId: string): Promise<RiotAccountLookup | null> {
  const parsed = splitRiotId(riotId);
  if (!parsed) return null;

  const creds = getCachedRiotClientCredentials();
  if (!creds) return null;

  const client = new RiotClient(creds);
  const params = new URLSearchParams({
    gameName: parsed.gameName,
    tagLine: parsed.tagLine,
  });

  const response = await client.get<RiotAliasLookupItem[]>(
    `/player-account/aliases/v1/lookup?${params.toString()}`,
  );
  const found = response.find((item) => item.puuid);
  if (!found?.puuid) return null;

  const gameName = getAliasGameName(found.alias) || parsed.gameName;
  const tagLine = getAliasTagLine(found.alias) || parsed.tagLine;
  return {
    puuid: found.puuid,
    gameName,
    tagLine,
    riotId: `${gameName}#${tagLine}`,
  };
}
