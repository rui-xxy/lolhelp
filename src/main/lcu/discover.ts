// 英雄联盟安装位置发现中心：让装在任意盘符/自定义目录的客户端也能被识别。
//
// 三层来源（优先级从高到低）：
// 1. 用户在设置里手动指定的 gameInstallRoot（持久化，一次设置永久生效）
// 2. 运行中 LeagueClientUx.exe 的进程命令行 —— --install-directory 直接给出安装根，
//    --app-port/--remoting-auth-token 等参数直接给出 LCU 连接凭据（比读 lockfile 还可靠）
// 3. 调用方保留的盘符扫描兜底（见 lockfile.ts / configPaths.ts）
//
// 进程扫描用 PowerShell Get-CimInstance（wmic 在 Win11 24H2+ 已被移除，不能用）。
// 扫描在后台循环里做（约 15s 一次），结果写入模块级缓存供同步代码读取。

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeInstallRoot, rootLooksValid } from '../config/installRoot';
import { getSettings } from '../settings/store';
import type { LcuCredentials, RiotClientCredentials } from './lockfile';

const DISCOVERY_INTERVAL_MS = 15_000;
const POWERSHELL_TIMEOUT_MS = 10_000;

const QUERY_SCRIPT = [
  '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8',
  '(Get-CimInstance Win32_Process -Filter "Name=\'LeagueClientUx.exe\'").CommandLine',
].join('; ');

interface ProcessDiscoveryState {
  roots: string[];
  lcu: LcuCredentials | null;
  riotClient: RiotClientCredentials | null;
}

let discovered: ProcessDiscoveryState = { roots: [], lcu: null, riotClient: null };
let scannedRoots: string[] = [];
let scanInProgress = false;
let loopTimer: NodeJS.Timeout | null = null;

/** 从 LeagueClientUx.exe 命令行提取安装根目录（可能带引号也可能不带）。 */
export function parseInstallDirectory(commandLine: string): string | null {
  const match = commandLine.match(/--install-directory=("[^"]*"|[^\s]+)/);
  if (!match) return null;
  return normalizeInstallRoot(match[1]);
}

/** 从命令行提取 LCU 连接凭据（客户端自带的端口/令牌参数）。 */
export function parseProcessLcuCredentials(commandLine: string): LcuCredentials | null {
  const portMatch = commandLine.match(/--app-port=(\d+)/);
  const tokenMatch = commandLine.match(/--remoting-auth-token=([A-Za-z0-9_-]+)/);
  if (!portMatch || !tokenMatch) return null;
  const pidMatch = commandLine.match(/--app-pid=(\d+)/);
  return {
    pid: pidMatch ? pidMatch[1] : '',
    port: portMatch[1],
    token: tokenMatch[1],
    protocol: 'https',
  };
}

/** 从命令行提取 Riot 客户端（登录器）凭据。 */
export function parseProcessRiotCredentials(
  commandLine: string,
): RiotClientCredentials | null {
  const portMatch = commandLine.match(/--riotclient-app-port=(\d+)/);
  const tokenMatch = commandLine.match(/--riotclient-auth-token=([A-Za-z0-9_-]+)/);
  if (!portMatch || !tokenMatch) return null;
  const platformMatch = commandLine.match(/--rso_platform_id=([A-Za-z0-9_-]+)/);
  return {
    port: portMatch[1],
    token: tokenMatch[1],
    rsoPlatformId: platformMatch?.[1],
  };
}

function queryUxCommandLines(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', QUERY_SCRIPT],
      { timeout: POWERSHELL_TIMEOUT_MS, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) {
          resolve([]);
          return;
        }
        // 多个客户端实例时 Get-CimInstance 会输出多行命令行。
        resolve(
          stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.includes('--')),
        );
      },
    );
  });
}

// 全盘符两层浅扫：根下一层目录及其子目录里含 LeagueClient 的即视为安装根。
// 覆盖 WeGame（D:\WeGameApps\英雄联盟）与任意自定义安装位置；实测每轮 <10ms。
const SHALLOW_SCAN_EXCLUDED = new Set([
  'windows',
  'program files',
  'program files (x86)',
  'programdata',
  'users',
  '$recycle.bin',
  'system volume information',
  'perflogs',
  'node_modules',
]);

function shallowScanAllDrives(): string[] {
  const roots: string[] = [];
  const push = (dir: string) => {
    if (!roots.some((x) => x.toLowerCase() === dir.toLowerCase())) roots.push(dir);
  };
  for (let code = 67; code <= 90; code++) {
    const drive = `${String.fromCharCode(code)}:\\`;
    let level1;
    try {
      level1 = fs.readdirSync(drive, { withFileTypes: true });
    } catch {
      continue; // 盘符不存在/不可读
    }
    for (const entry of level1) {
      if (!entry.isDirectory()) continue;
      if (SHALLOW_SCAN_EXCLUDED.has(entry.name.toLowerCase())) continue;
      const dir = path.join(drive, entry.name);
      try {
        if (fs.existsSync(path.join(dir, 'LeagueClient'))) {
          push(dir);
          continue;
        }
        for (const sub of fs.readdirSync(dir, { withFileTypes: true })) {
          if (!sub.isDirectory()) continue;
          const subDir = path.join(dir, sub.name);
          if (fs.existsSync(path.join(subDir, 'LeagueClient'))) push(subDir);
        }
      } catch {
        // 无权限的目录跳过
      }
    }
  }
  return roots;
}

function scanOnce(): Promise<ProcessDiscoveryState> {
  return queryUxCommandLines().then((lines) => {
    const roots: string[] = [];
    let lcu: LcuCredentials | null = null;
    let riotClient: RiotClientCredentials | null = null;
    for (const line of lines) {
      const root = parseInstallDirectory(line);
      if (root && rootLooksValid(root) && !roots.includes(root)) roots.push(root);
      lcu = lcu ?? parseProcessLcuCredentials(line);
      riotClient = riotClient ?? parseProcessRiotCredentials(line);
    }
    // 进程命令行拿不到（如 WeGame 以管理员运行客户端时 CommandLine 为 null）、
    // 用户也没手动指定过时，浅扫全盘找安装位置；一旦找到（或有了手动路径）就不再扫。
    if (roots.length === 0 && !getSettings().gameInstallRoot && scannedRoots.length === 0) {
      scannedRoots = shallowScanAllDrives();
    }
    for (const root of scannedRoots) {
      if (!roots.some((x) => x.toLowerCase() === root.toLowerCase())) roots.push(root);
    }
    return { roots, lcu, riotClient };
  });
}

async function runDiscoveryCycle(): Promise<void> {
  if (scanInProgress) return;
  scanInProgress = true;
  try {
    // getSettings() 有内存缓存，每轮重读可即时反映用户刚保存的手动路径。
    discovered = await scanOnce();
  } catch {
    // 发现失败静默：定位兜底逻辑仍在调用方。
  } finally {
    scanInProgress = false;
  }
}

/** app ready 后调用：启动后台发现循环。 */
export function startLeagueDiscoveryLoop(): void {
  if (loopTimer) return;
  void runDiscoveryCycle();
  loopTimer = setInterval(() => void runDiscoveryCycle(), DISCOVERY_INTERVAL_MS);
  loopTimer.unref?.();
}

/** 设置变更后调用：跳过等待，立即重扫一次。 */
export function refreshLeagueDiscovery(): void {
  void runDiscoveryCycle();
}

/** 已知的安装根列表（手动指定优先）。供 lockfile/configPaths 的同步定位使用。 */
export function getKnownInstallRoots(): string[] {
  const roots: string[] = [];
  const manual = getSettings().gameInstallRoot;
  if (manual) roots.push(manual);
  for (const root of discovered.roots) {
    if (!roots.some((x) => x.toLowerCase() === root.toLowerCase())) roots.push(root);
  }
  return roots;
}

/** 运行中客户端的 LCU 凭据（进程命令行提取）。 */
export function getProcessLcuCredentials(): LcuCredentials | null {
  return discovered.lcu;
}

/** 运行中 Riot 客户端的凭据（进程命令行提取）。 */
export function getProcessRiotClientCredentials(): RiotClientCredentials | null {
  return discovered.riotClient;
}
