// 应用设置持久化：手写 JSON 到 userData 目录。
//
// 不引入 electron-store，贴合项目"精简依赖、用 Node 原生模块"的风格。
// 文件位置：app.getPath('userData')/lolhelper-settings.json

import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings } from '../../shared/api';

const SETTINGS_FILE = 'lolhelper-settings.json';

const DEFAULT_SETTINGS: AppSettings = {
  favoriteChampions: [],
  championPresets: [],
};

function resolveSettingsPath(): string {
  return path.join(app.getPath('userData'), SETTINGS_FILE);
}

// 读设置。文件不存在/损坏时返回默认值（不抛错，保证 UI 永远拿得到值）。
export function getSettings(): AppSettings {
  try {
    const filePath = resolveSettingsPath();
    if (!fs.existsSync(filePath)) return { ...DEFAULT_SETTINGS };
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      favoriteChampions: Array.isArray(parsed.favoriteChampions)
        ? parsed.favoriteChampions.filter((x) => typeof x === 'number')
        : [],
      championPresets: Array.isArray(parsed.championPresets)
        ? parsed.championPresets
            .filter((preset) => preset && typeof preset === 'object')
            .map((preset) => ({
              id: typeof preset.id === 'string' ? preset.id : String(Date.now()),
              name: typeof preset.name === 'string' ? preset.name : '英雄方案',
              championIds: Array.isArray(preset.championIds)
                ? preset.championIds.filter((x) => typeof x === 'number')
                : [],
              updatedAt: typeof preset.updatedAt === 'number' ? preset.updatedAt : 0,
            }))
            .filter((preset) => preset.championIds.length > 0)
        : [],
      scoutDefaults: parsed.scoutDefaults ?? undefined,
    };
  } catch (err) {
    console.warn('[settings] 读取失败，用默认值:', err);
    return { ...DEFAULT_SETTINGS };
  }
}

// 写设置。原子写（先写临时文件再 rename，避免写一半崩溃损坏文件）。
export function saveSettings(settings: AppSettings): void {
  try {
    const filePath = resolveSettingsPath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf-8');
    fs.renameSync(tmp, filePath);
  } catch (err) {
    console.error('[settings] 写入失败:', err);
    throw err;
  }
}
