import fs from 'node:fs';
import path from 'node:path';
import type { LolConfigFileStatus } from '../../shared/api';
import { DEFAULT_LOL_ROOT_PATH } from '../../shared/constants';

export interface ConfigPaths {
  gameCfg: string;
  inputIni: string;
  persistedSettings: string;
  lcuLocalPreferences: string;
  lcuAccountPreferences: string;
  leagueClientSettings: string;
}

export function getConfigPaths(rootPath: string): ConfigPaths {
  return {
    gameCfg: path.join(rootPath, 'Game', 'Config', 'game.cfg'),
    inputIni: path.join(rootPath, 'Game', 'Config', 'input.ini'),
    persistedSettings: path.join(rootPath, 'Game', 'Config', 'PersistedSettings.json'),
    lcuLocalPreferences: path.join(
      rootPath,
      'LeagueClient',
      'Config',
      'LCULocalPreferences.yaml',
    ),
    lcuAccountPreferences: path.join(
      rootPath,
      'LeagueClient',
      'Config',
      'LCUAccountPreferences.yaml',
    ),
    leagueClientSettings: path.join(
      rootPath,
      'LeagueClient',
      'Config',
      'LeagueClientSettings.yaml',
    ),
  };
}

export function rootLooksValid(rootPath: string): boolean {
  return (
    fs.existsSync(path.join(rootPath, 'Game', 'Config')) ||
    fs.existsSync(path.join(rootPath, 'LeagueClient', 'Config'))
  );
}

export function resolveRootPath(rootPath?: string): string {
  const trimmed = (rootPath ?? '').trim().replace(/^["']|["']$/g, '');
  const requested = trimmed || DEFAULT_LOL_ROOT_PATH;
  if (rootLooksValid(requested)) return requested;

  const candidates = new Set<string>([requested, DEFAULT_LOL_ROOT_PATH]);
  for (const drive of ['C:', 'D:', 'E:', 'F:', 'G:']) {
    candidates.add(path.join(drive, 'WeGameApps', '英雄联盟'));
    candidates.add(path.join(drive, '英雄联盟'));
    candidates.add(path.join(drive, 'Riot Games', 'League of Legends'));
  }

  for (const candidate of candidates) {
    if (rootLooksValid(candidate)) return candidate;
  }
  return requested;
}

export function readText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function fileStatus(key: string, label: string, filePath: string): LolConfigFileStatus {
  try {
    const stat = fs.statSync(filePath);
    return {
      key,
      label,
      path: filePath,
      exists: stat.isFile(),
      size: stat.size,
      updatedAt: stat.mtimeMs,
    };
  } catch {
    return {
      key,
      label,
      path: filePath,
      exists: false,
      size: 0,
      updatedAt: null,
    };
  }
}

export function getFileStatuses(rootPath: string): LolConfigFileStatus[] {
  const paths = getConfigPaths(rootPath);
  return [
    fileStatus('gameCfg', '游戏内配置 game.cfg', paths.gameCfg),
    fileStatus('inputIni', '按键配置 input.ini', paths.inputIni),
    fileStatus(
      'persistedSettings',
      '账号持久化 PersistedSettings.json',
      paths.persistedSettings,
    ),
    fileStatus(
      'lcuLocalPreferences',
      '客户端本地偏好 LCULocalPreferences.yaml',
      paths.lcuLocalPreferences,
    ),
    fileStatus(
      'lcuAccountPreferences',
      '客户端账号偏好 LCUAccountPreferences.yaml',
      paths.lcuAccountPreferences,
    ),
    fileStatus(
      'leagueClientSettings',
      '客户端同步标记 LeagueClientSettings.yaml',
      paths.leagueClientSettings,
    ),
  ];
}
