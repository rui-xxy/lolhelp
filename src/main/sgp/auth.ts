import fs from 'node:fs';
import path from 'node:path';
import { getCachedCredentials } from '../lcu/lockfile';
import { LcuClient } from '../lcu/client';
import { extractRegionFromLocation, getRegionConfig, type RegionConfig } from './region';

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

// 缓存 SGP 认证信息（accessToken + 大区），避免每次请求都重新获取。
// token 有效期较长（JWT），大区在客户端单次运行期间不变。
const SGP_AUTH_TTL = 5 * 60 * 1000; // 5 分钟
let cachedSgpAuth: SgpAuth | null = null;
let cachedSgpAuthAt = 0;

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
  for (const drive of drives) {
    for (const candidate of candidateDirs) {
      const dir = path.join(drive, candidate);
      try {
        if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
        const logs = fs
          .readdirSync(dir)
          .filter((name) => name.endsWith('_LeagueClientUx.log'));
        if (logs.length === 0) continue;
        logs.sort();
        const latest = path.join(dir, logs[logs.length - 1]);
        const fd = fs.openSync(latest, 'r');
        const buf = Buffer.alloc(200 * 1024);
        const n = fs.readSync(fd, buf, 0, buf.length, 0);
        fs.closeSync(fd);
        const content = buf.subarray(0, n).toString('utf-8');
        const match = content.match(/--t\.location=([A-Za-z0-9.]+)/);
        if (match) return extractRegionFromLocation(match[1]);
      } catch {
        // 继续
      }
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

// 获取 SGP 认证信息（带缓存）。
// 客户端未运行或大区不支持时抛错。
export async function getSgpAuth(): Promise<SgpAuth> {
  const now = Date.now();
  if (cachedSgpAuth && now - cachedSgpAuthAt < SGP_AUTH_TTL) {
    return cachedSgpAuth;
  }

  // 1. LCU 凭证（复用 lockfile 缓存）
  const creds = getCachedCredentials();
  if (!creds) throw new Error('未检测到 LOL 客户端（请先启动并登录）');

  // 2. LCU 拿 entitlements token + puuid
  const client = new LcuClient(creds);
  const { accessToken, puuid } = await fetchLcuAuth(client);

  // 3. 大区码（从日志）
  const regionKey = readRegionFromLog();
  if (!regionKey) throw new Error('无法从日志提取大区码');
  const region = getRegionConfig(regionKey);
  if (!region) throw new Error(`不支持的大区：${regionKey}（当前仅支持国服 8 大区）`);

  cachedSgpAuth = { accessToken, region, puuid };
  cachedSgpAuthAt = now;
  return cachedSgpAuth;
}

// 失效缓存（请求 401/403 时调用，强制重新获取）。
export function invalidateSgpAuth(): void {
  cachedSgpAuth = null;
  cachedSgpAuthAt = 0;
}
