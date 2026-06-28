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

const INSTALL_DRIVES = ['C:', 'D:', 'E:', 'F:', 'G:'];
const INSTALL_ROOT_SUFFIXES = [
  ['WeGameApps', '英雄联盟'],
  ['英雄联盟'],
  ['Tencent', '英雄联盟'],
  ['Riot Games', 'League of Legends'],
  ['Riot Games', 'League of Legends (PBE)'],
];

function cleanRootPath(rootPath: string): string {
  return rootPath.trim().replace(/^["']|["']$/g, '');
}

export function normalizeInstallRoot(rootPath: string): string {
  const cleaned = cleanRootPath(rootPath);
  if (!cleaned) return '';

  const normalized = path.normalize(cleaned);
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

function uniqueRoots(roots: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const root of roots) {
    const normalized = normalizeInstallRoot(root);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function getCandidateRootPaths(extraRoots: string[] = []): string[] {
  const candidates = [...extraRoots, DEFAULT_LOL_ROOT_PATH];
  for (const drive of INSTALL_DRIVES) {
    for (const suffix of INSTALL_ROOT_SUFFIXES) {
      candidates.push(path.join(drive, ...suffix));
    }
  }
  return uniqueRoots(candidates);
}

export function rootLooksValid(rootPath: string): boolean {
  const normalized = normalizeInstallRoot(rootPath);
  if (!normalized) return false;
  return (
    fs.existsSync(path.join(normalized, 'Game', 'Config')) ||
    fs.existsSync(path.join(normalized, 'LeagueClient', 'Config'))
  );
}

export function detectLeagueInstallRoots(extraRoots: string[] = []): string[] {
  return getCandidateRootPaths(extraRoots).filter(rootLooksValid);
}

export function resolveRootPath(rootPath?: string): string {
  const requested = normalizeInstallRoot(rootPath ?? '') || DEFAULT_LOL_ROOT_PATH;
  if (rootLooksValid(requested)) return requested;

  return detectLeagueInstallRoots([requested])[0] ?? requested;
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
