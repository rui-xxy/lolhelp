import fs from 'node:fs';
import path from 'node:path';
import {
  getCachedCredentials,
  invalidateCredentialsCache,
  type LcuCredentials,
} from '../lcu/lockfile';
import { LcuClient } from '../lcu/client';
import { extractRegionFromLocation, getRegionConfig, type RegionConfig } from './region';
import { isSameSgpSession } from './sessionPolicy';

// SGP 认证：拿 entitlements token（云端通行证）+ 确定大区域名。
//
// SGP 认证链（已 curl 验证）：
// 1. LCU token（本地，来自 lockfile.ts）→ 请求 /entitlements/v1/token
// 2. 返回的 accessToken（JWT，Riot 签发）→ 作为 Bearer 请求 SGP
//
// 大区码来自日志的 --t.location=loltencent.gz2.HN10（最后一段）。
// puuid 用于确认查谁的战绩。

export interface SgpAuth {
  accessToken: string; // entitlements JWT，请求 SGP 的 Bearer token
  region: RegionConfig; // 大区配置（含 SGP 域名）
  puuid: string; // 当前账号 puuid
}

// token 本身可以缓存较久，但账号和大区会在客户端运行期间发生变化。
// 每次用户主动查询都会核对一次本地会话；后台附加请求最多复用 2.5 秒。
const SGP_AUTH_TTL = 5 * 60 * 1000; // 5 分钟
const SGP_SESSION_CHECK_TTL = 2_500;
let cachedSgpAuth: SgpAuth | null = null;
let cachedSgpAuthAt = 0;
let cachedSgpAuthValidatedAt = 0;
let cachedCredentialKey = '';
let authRefreshPromise: Promise<SgpAuth> | null = null;

export interface GetSgpAuthOptions {
  forceRefresh?: boolean;
  validateSession?: boolean;
}

function getCredentialKey(creds: LcuCredentials): string {
  return `${creds.pid}:${creds.port}:${creds.token}:${creds.protocol}`;
}

// 从 LeagueClientUx.log 提取大区码。
// 复用 lockfile.ts 的目录定位逻辑——日志在 LeagueClient 目录下。
function readRegionFromLog(): string {
  // 复用 lockfile 的目录定位（避免重复实现）
  const candidateDirs = [
    path.join('WeGameApps', '英雄联盟', 'LeagueClient'),
    path.join('英雄联盟', 'LeagueClient'),
    path.join('Tencent', '英雄联盟', 'LeagueClient'),
    path.join('Riot Games', 'League of Legends'),
  ];
  const drives = ['C:', 'D:', 'E:', 'F:', 'G:'];
  const logCandidates: Array<{ path: string; modifiedAt: number }> = [];
  for (const drive of drives) {
    for (const candidate of candidateDirs) {
      const dir = path.join(drive, candidate);
      try {
        if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
        const logs = fs
          .readdirSync(dir)
          .filter((name) => name.endsWith('_LeagueClientUx.log'))
          .sort();
        if (logs.length === 0) continue;
        const logPath = path.join(dir, logs[logs.length - 1]);
        logCandidates.push({
          path: logPath,
          modifiedAt: fs.statSync(logPath).mtimeMs,
        });
      } catch {
        // 继续检查其他安装目录。
      }
    }
  }

  logCandidates.sort((a, b) => b.modifiedAt - a.modifiedAt);
  for (const candidate of logCandidates) {
    try {
      const fd = fs.openSync(candidate.path, 'r');
      const buf = Buffer.alloc(200 * 1024);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      const content = buf.subarray(0, n).toString('utf-8');
      const match = content.match(/--t\.location=([A-Za-z0-9.]+)/);
      if (match) return extractRegionFromLocation(match[1]);
    } catch {
      // 最新日志可能正处于轮换中，继续尝试下一份。
    }
  }
  return '';
}

export function getCurrentRegionFromLog(): RegionConfig | null {
  const regionKey = readRegionFromLog();
  if (!regionKey) return null;
  return getRegionConfig(regionKey);
}

// 从 LCU 拿 entitlements token + 当前账号 puuid。
async function fetchLcuAuth(client: LcuClient): Promise<{ accessToken: string; puuid: string }> {
  // entitlements token
  const ent = await client.get<{ accessToken?: string }>('/entitlements/v1/token');
  const accessToken = ent.accessToken;
  if (!accessToken) throw new Error('无法获取 entitlements token（LCU 未返回 accessToken）');

  // 当前账号 puuid
  const summoner = await client.get<{ puuid?: string }>('/lol-summoner/v1/current-summoner');
  const puuid = summoner.puuid;
  if (!puuid) throw new Error('无法获取当前账号 puuid');

  return { accessToken, puuid };
}

async function fetchCurrentPuuid(client: LcuClient): Promise<string> {
  const summoner = await client.get<{ puuid?: string }>('/lol-summoner/v1/current-summoner');
  if (!summoner.puuid) throw new Error('无法获取当前账号 puuid');
  return summoner.puuid;
}

async function refreshSgpAuth(refreshCredentials: boolean): Promise<SgpAuth> {
  if (authRefreshPromise) return authRefreshPromise;

  authRefreshPromise = (async () => {
    if (refreshCredentials) invalidateCredentialsCache();

    let creds = getCachedCredentials();
    if (!creds) throw new Error('未检测到 LOL 客户端（请先启动并登录）');

    let lcuAuth: { accessToken: string; puuid: string };
    try {
      lcuAuth = await fetchLcuAuth(new LcuClient(creds));
    } catch (error) {
      if (refreshCredentials) throw error;
      invalidateCredentialsCache();
      creds = getCachedCredentials();
      if (!creds) throw error;
      lcuAuth = await fetchLcuAuth(new LcuClient(creds));
    }

    const regionKey = readRegionFromLog();
    if (!regionKey) throw new Error('无法从日志提取大区码');
    const region = getRegionConfig(regionKey);
    if (!region) throw new Error(`不支持的大区：${regionKey}（当前仅支持国服 8 大区）`);

    const now = Date.now();
    cachedSgpAuth = {
      accessToken: lcuAuth.accessToken,
      region,
      puuid: lcuAuth.puuid,
    };
    cachedSgpAuthAt = now;
    cachedSgpAuthValidatedAt = now;
    cachedCredentialKey = getCredentialKey(creds);
    return cachedSgpAuth;
  })();

  try {
    return await authRefreshPromise;
  } finally {
    authRefreshPromise = null;
  }
}

async function canReuseCachedAuth(auth: SgpAuth, validateSession: boolean): Promise<boolean> {
  if (Date.now() - cachedSgpAuthAt >= SGP_AUTH_TTL) return false;
  if (!validateSession && Date.now() - cachedSgpAuthValidatedAt < SGP_SESSION_CHECK_TTL) {
    return true;
  }

  const creds = getCachedCredentials();
  if (!creds) return false;

  const currentRegion = getCurrentRegionFromLog();

  let currentPuuid: string;
  try {
    currentPuuid = await fetchCurrentPuuid(new LcuClient(creds));
  } catch {
    return false;
  }

  if (!isSameSgpSession(
    {
      credentialKey: cachedCredentialKey,
      puuid: auth.puuid,
      regionKey: auth.region.key,
    },
    {
      credentialKey: getCredentialKey(creds),
      puuid: currentPuuid,
      regionKey: currentRegion?.key ?? auth.region.key,
    },
  )) return false;
  if (cachedSgpAuth !== auth) return false;

  cachedSgpAuthValidatedAt = Date.now();
  return true;
}

// 获取 SGP 认证信息（带缓存）。
// 客户端未运行或大区不支持时抛错。
export async function getSgpAuth(options: GetSgpAuthOptions = {}): Promise<SgpAuth> {
  if (options.forceRefresh) {
    invalidateSgpAuth();
    return refreshSgpAuth(true);
  }

  const cachedAuth = cachedSgpAuth;
  if (cachedAuth && await canReuseCachedAuth(cachedAuth, options.validateSession === true)) {
    return cachedAuth;
  }
  if (cachedSgpAuth && cachedSgpAuth !== cachedAuth) return getSgpAuth(options);
  return refreshSgpAuth(cachedSgpAuth !== null);
}

// 失效缓存（账号/大区变化或 SGP 鉴权失败时调用）。
export function invalidateSgpAuth(): void {
  cachedSgpAuth = null;
  cachedSgpAuthAt = 0;
  cachedSgpAuthValidatedAt = 0;
  cachedCredentialKey = '';
}
