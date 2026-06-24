import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type {
  LolConfigProfileSummary,
  LolConfigValues,
} from '../../shared/api';
import { atomicWriteText } from './fileTransaction';

const PROFILE_FILE = 'lol-config-profiles.json';

export interface ConfigProfileSnapshots {
  gameCfg?: string;
  inputIni?: string;
  persistedSettings?: string;
}

export interface ConfigProfile extends LolConfigProfileSummary {
  values: LolConfigValues;
  snapshots: ConfigProfileSnapshots;
}

export interface ProfileStore {
  profiles: ConfigProfile[];
}

function profileStorePath(): string {
  return path.join(app.getPath('userData'), PROFILE_FILE);
}

function isConfigProfile(profile: unknown): profile is ConfigProfile {
  if (!profile || typeof profile !== 'object') return false;
  const candidate = profile as Partial<ConfigProfile>;
  return Boolean(
    candidate.id &&
      candidate.name &&
      candidate.values &&
      candidate.snapshots &&
      typeof candidate.createdAt === 'number' &&
      typeof candidate.updatedAt === 'number',
  );
}

export function readProfileStore(
  normalizeValues: (values: LolConfigValues) => LolConfigValues,
): ProfileStore {
  try {
    const raw = fs.readFileSync(profileStorePath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ProfileStore>;
    return {
      profiles: Array.isArray(parsed.profiles)
        ? parsed.profiles
            .filter(isConfigProfile)
            .map((profile) => ({ ...profile, values: normalizeValues(profile.values) }))
        : [],
    };
  } catch {
    return { profiles: [] };
  }
}

export function writeProfileStore(store: ProfileStore): void {
  atomicWriteText(profileStorePath(), JSON.stringify(store, null, 2));
}

export function summarizeProfile(profile: ConfigProfile): LolConfigProfileSummary {
  return {
    id: profile.id,
    name: profile.name,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    sourceRootPath: profile.sourceRootPath,
    gameResolution: profile.gameResolution,
  };
}

export function listProfileSummaries(
  normalizeValues: (values: LolConfigValues) => LolConfigValues,
): LolConfigProfileSummary[] {
  return readProfileStore(normalizeValues)
    .profiles
    .sort((first, second) => second.updatedAt - first.updatedAt)
    .map(summarizeProfile);
}

export function gameResolution(values: LolConfigValues): string {
  return `${values.game.width} x ${values.game.height}`;
}
