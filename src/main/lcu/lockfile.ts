import fs from 'node:fs';
import path from 'node:path';

export interface LcuCredentials {
  pid: string;
  port: string;
  token: string;
  protocol: string;
}

export interface RiotClientCredentials {
  port: string;
  token: string;
  rsoPlatformId?: string;
}

const CANDIDATE_CLIENT_DIRS = [
  path.join('WeGameApps', '英雄联盟', 'LeagueClient'),
  path.join('英雄联盟', 'LeagueClient'),
  path.join('Tencent', '英雄联盟', 'LeagueClient'),
  path.join('Riot Games', 'League of Legends'),
  path.join('Riot Games', 'League of Legends (PBE)'),
];

function readFromLockfile(clientDir: string): LcuCredentials | null {
  let content: string;
  try {
    content = fs.readFileSync(path.join(clientDir, 'lockfile'), 'utf-8').trim();
  } catch {
    return null;
  }
  if (!content) return null;

  const parts = content.split(':');
  if (parts.length < 5) {
    throw new Error(`Invalid lockfile format: expected 5 parts, got ${parts.length}`);
  }
  return {
    pid: parts[1],
    port: parts[2],
    token: parts[3],
    protocol: parts[4],
  };
}

function findLatestUxLog(clientDir: string): string | null {
  try {
    const logs = fs
      .readdirSync(clientDir)
      .filter((name) => name.endsWith('_LeagueClientUx.log'))
      .sort();
    return logs.length > 0 ? path.join(clientDir, logs[logs.length - 1]) : null;
  } catch {
    return null;
  }
}

function readFromUxLog(clientDir: string): LcuCredentials | null {
  const logPath = findLatestUxLog(clientDir);
  if (!logPath) return null;

  try {
    const fd = fs.openSync(logPath, 'r');
    const buf = Buffer.alloc(200 * 1024);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const content = buf.subarray(0, bytesRead).toString('utf-8');
    const portMatch = content.match(/--app-port=(\d+)/);
    const tokenMatch = content.match(/--remoting-auth-token=([A-Za-z0-9_-]+)/);
    const pidMatch = content.match(/--app-pid=(\d+)/);
    if (!portMatch || !tokenMatch) return null;
    return {
      pid: pidMatch ? pidMatch[1] : '',
      port: portMatch[1],
      token: tokenMatch[1],
      protocol: 'https',
    };
  } catch {
    return null;
  }
}

function readRiotClientFromUxLog(clientDir: string): RiotClientCredentials | null {
  const logPath = findLatestUxLog(clientDir);
  if (!logPath) return null;

  try {
    const fd = fs.openSync(logPath, 'r');
    const buf = Buffer.alloc(300 * 1024);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const content = buf.subarray(0, bytesRead).toString('utf-8');
    const portMatch = content.match(/--riotclient-app-port=(\d+)/);
    const tokenMatch = content.match(/--riotclient-auth-token=([A-Za-z0-9_-]+)/);
    const platformMatch = content.match(/--rso_platform_id=([A-Za-z0-9_-]+)/);
    if (!portMatch || !tokenMatch) return null;
    return {
      port: portMatch[1],
      token: tokenMatch[1],
      rsoPlatformId: platformMatch?.[1],
    };
  } catch {
    return null;
  }
}

function tryResolveFromDir(clientDir: string): LcuCredentials | null {
  try {
    const creds = readFromLockfile(clientDir);
    if (creds) return creds;
  } catch (err) {
    console.warn(`[lcu] failed to parse lockfile in ${clientDir}, trying log:`, err);
  }
  return readFromUxLog(clientDir);
}

function resolveClientDirs(): string[] {
  const drives = ['C:', 'D:', 'E:', 'F:', 'G:'];
  const dirs: string[] = [];
  for (const drive of drives) {
    for (const candidate of CANDIDATE_CLIENT_DIRS) {
      const full = path.join(drive, candidate);
      try {
        if (fs.existsSync(full) && fs.statSync(full).isDirectory()) dirs.push(full);
      } catch {
        // Ignore inaccessible drives.
      }
    }
  }
  return dirs;
}

export function readLockfile(): LcuCredentials | null {
  for (const dir of resolveClientDirs()) {
    const creds = tryResolveFromDir(dir);
    if (creds) {
      console.log(`[lcu] credentials resolved from ${dir} (port=${creds.port})`);
      return creds;
    }
  }
  return null;
}

export function readRiotClientCredentials(): RiotClientCredentials | null {
  for (const dir of resolveClientDirs()) {
    const creds = readRiotClientFromUxLog(dir);
    if (creds) return creds;
  }
  return null;
}

export function readCredentialsForInstallRoot(rootPath?: string): LcuCredentials | null {
  if (rootPath) {
    const clientDir = path.join(rootPath, 'LeagueClient');
    const creds = tryResolveFromDir(clientDir);
    if (creds) {
      console.log(`[lcu] credentials resolved from ${clientDir} (port=${creds.port})`);
      return creds;
    }
  }
  return readLockfile();
}

const CREDS_CACHE_TTL = 30_000;
let cachedCreds: LcuCredentials | null = null;
let cachedCredsAt = 0;
let cachedRiotClientCreds: RiotClientCredentials | null = null;
let cachedRiotClientCredsAt = 0;

export function getCachedCredentials(): LcuCredentials | null {
  const now = Date.now();
  if (cachedCreds && now - cachedCredsAt < CREDS_CACHE_TTL) return cachedCreds;

  const creds = readLockfile();
  cachedCreds = creds;
  cachedCredsAt = creds ? now : 0;
  return creds;
}

export function getCachedRiotClientCredentials(): RiotClientCredentials | null {
  const now = Date.now();
  if (cachedRiotClientCreds && now - cachedRiotClientCredsAt < CREDS_CACHE_TTL) {
    return cachedRiotClientCreds;
  }

  const creds = readRiotClientCredentials();
  cachedRiotClientCreds = creds;
  cachedRiotClientCredsAt = creds ? now : 0;
  return creds;
}

export function invalidateCredentialsCache(): void {
  cachedCreds = null;
  cachedCredsAt = 0;
  cachedRiotClientCreds = null;
  cachedRiotClientCredsAt = 0;
}
