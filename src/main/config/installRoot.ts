// 英雄联盟安装根目录的路径规范化与有效性校验。
// 独立成模块供 configPaths 与 lcu/discover 共用，避免两者互相依赖形成环。
// "安装根"指同时含 Game/ 与 LeagueClient/ 的目录（国服如 D:\WeGameApps\英雄联盟）。

import fs from 'node:fs';
import path from 'node:path';

function cleanRootPath(rootPath: string): string {
  return rootPath.trim().replace(/^["']|["']$/g, '');
}

export function normalizeInstallRoot(rootPath: string): string {
  const cleaned = cleanRootPath(rootPath);
  if (!cleaned) return '';

  const raw = path.normalize(cleaned);
  // 去掉尾部分隔符（'E:\LOL\' → 'E:\LOL'）；保留 'X:\' 盘根不动。
  const normalized =
    raw.length > 3 && /[/\\]$/.test(raw) ? raw.slice(0, -1) : raw;
  const baseName = path.basename(normalized).toLowerCase();
  if (baseName === 'game' || baseName === 'leagueclient') {
    return path.dirname(normalized);
  }

  if (baseName === 'config') {
    const parentPath = path.dirname(normalized);
    const parentName = path.basename(parentPath).toLowerCase();
    if (parentName === 'game' || parentName === 'leagueclient') {
      return path.dirname(parentPath);
    }
  }

  return normalized;
}

export function rootLooksValid(rootPath: string): boolean {
  const normalized = normalizeInstallRoot(rootPath);
  if (!normalized) return false;
  return (
    fs.existsSync(path.join(normalized, 'Game', 'Config')) ||
    fs.existsSync(path.join(normalized, 'LeagueClient', 'Config'))
  );
}
