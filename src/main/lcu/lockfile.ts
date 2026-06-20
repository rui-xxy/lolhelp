import fs from 'node:fs';
import path from 'node:path';

// LCU 连接所需的全部凭证。
// 国际服来自 lockfile，国服（腾讯）来自 LeagueClientUx.log（lockfile 为空）。
// 本模块遍历所有候选 LeagueClient 目录，每个目录依次尝试 lockfile 和 log，
// 谁先返回有效凭证就用谁——避免"命中空的国际服目录就停"的问题。
export interface LcuCredentials {
  pid: string; // 客户端进程 ID
  port: string; // app-port（LCU HTTPS 监听端口）
  token: string; // remoting-auth-token（Basic Auth 密码）
  protocol: string; // 固定 'https'
}

// LeagueClient 候选安装路径（相对盘符根）。覆盖国际服 / 国服 WeGame / 变体。
const CANDIDATE_CLIENT_DIRS = [
  path.join('WeGameApps', '英雄联盟', 'LeagueClient'), // 国服 WeGame（实测主路径，优先）
  path.join('英雄联盟', 'LeagueClient'), // 国服简装
  path.join('Tencent', '英雄联盟', 'LeagueClient'), // 国服腾讯路径变体
  path.join('Riot Games', 'League of Legends'), // 国际服
  path.join('Riot Games', 'League of Legends (PBE)'), // 测试服
];

// 枚举所有盘符下存在的候选 LeagueClient 目录（不只第一个）。
// 客户端可能在任意盘符，且国际服/国服可能并存，全部尝试。
function resolveClientDirs(): string[] {
  const drives = ['C:', 'D:', 'E:', 'F:', 'G:'];
  const dirs: string[] = [];
  for (const drive of drives) {
    for (const candidate of CANDIDATE_CLIENT_DIRS) {
      const full = path.join(drive, candidate);
      try {
        if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
          dirs.push(full);
        }
      } catch {
        // 忽略权限/不存在错误
      }
    }
  }
  return dirs;
}

// 策略 1：读 lockfile（国际服主路径，国服通常为空）。
// 返回 null = 文件不存在或为空；抛异常 = 格式错误（调用方捕获后继续尝试 log）。
function readFromLockfile(clientDir: string): LcuCredentials | null {
  let content: string;
  try {
    content = fs.readFileSync(path.join(clientDir, 'lockfile'), 'utf-8').trim();
  } catch {
    return null;
  }
  if (!content) return null;

  // 格式：LeagueClient:PID:APP_PORT:PASSWORD:https（冒号分隔 5 段）
  const parts = content.split(':');
  if (parts.length < 5) {
    throw new Error(`lockfile 格式异常：期望 5 段，实际 ${parts.length} 段`);
  }
  return {
    pid: parts[1],
    port: parts[2],
    token: parts[3],
    protocol: parts[4],
  };
}

// 找最新的 LeagueClientUx.log（文件名：<ISO时间戳>_<PID>_LeagueClientUx.log）。
function findLatestUxLog(clientDir: string): string | null {
  let logs: string[];
  try {
    logs = fs
      .readdirSync(clientDir)
      .filter((name) => name.endsWith('_LeagueClientUx.log'));
  } catch {
    return null;
  }
  if (logs.length === 0) return null;
  // ISO 时间戳前缀天然可字符串排序，最新的在末尾。
  logs.sort();
  return path.join(clientDir, logs[logs.length - 1]);
}

// 策略 2：解析 LeagueClientUx.log（国服主路径）。
// 日志 "Command line arguments:" 行含 --app-port 和 --remoting-auth-token。
// token 在客户端单次运行期间稳定，只有重启才变（已实测验证）。
function readFromUxLog(clientDir: string): LcuCredentials | null {
  const logPath = findLatestUxLog(clientDir);
  if (!logPath) return null;

  let content: string;
  try {
    // 日志可能很大，只读前 200KB 足够覆盖启动参数段。
    const fd = fs.openSync(logPath, 'r');
    const buf = Buffer.alloc(200 * 1024);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    content = buf.subarray(0, bytesRead).toString('utf-8');
  } catch {
    return null;
  }

  // 匹配 --app-port=<digits>（正则要求 -- 前缀，不会误匹配 --riotclient-app-port）。
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
}

// 尝试从单个目录获取凭证：先 lockfile，失败则 log。
function tryResolveFromDir(clientDir: string): LcuCredentials | null {
  try {
    const creds = readFromLockfile(clientDir);
    if (creds) return creds;
  } catch (err) {
    console.warn(`[lcu] ${clientDir} lockfile 解析失败，尝试 log:`, err);
  }
  return readFromUxLog(clientDir);
}

// 获取 LCU 凭证。遍历所有候选 LeagueClient 目录，每个都尝试 lockfile + log，
// 谁先返回有效凭证就用谁。返回 null = 所有目录都失败（客户端未运行）。
export function readLockfile(): LcuCredentials | null {
  const dirs = resolveClientDirs();
  for (const dir of dirs) {
    const creds = tryResolveFromDir(dir);
    if (creds) {
      console.log(`[lcu] 从 ${dir} 获取到凭证（port=${creds.port}）`);
      return creds;
    }
  }
  return null;
}
