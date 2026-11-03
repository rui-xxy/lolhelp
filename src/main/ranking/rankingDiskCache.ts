import fs from 'node:fs';
import path from 'node:path';

// 第三方数据的「最后一次成功」落盘缓存。
// 数据源临时挂掉、改版或断网时，页面仍能展示上一次的结果（并标明是缓存），
// 而不是一片空白。文件放在 userData/ranking-cache/<key>.json。

interface DiskCacheRecord<T> {
  savedAt: string;
  value: T;
}

let cacheDir: string | null | undefined;

function resolveCacheDir(): string | null {
  if (cacheDir !== undefined) return cacheDir;
  try {
    // 懒加载：单元测试和非 Electron 环境里没有 app，这时只用内存缓存。
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron') as { app?: { getPath?: (name: string) => string } };
    const userData = electron.app?.getPath?.('userData');
    cacheDir = userData ? path.join(userData, 'ranking-cache') : null;
  } catch {
    cacheDir = null;
  }
  return cacheDir;
}

// 测试用：指定缓存目录（传 null 关闭落盘）。
export function setRankingCacheDirForTests(directory: string | null): void {
  cacheDir = directory;
}

function cacheFile(key: string): string | null {
  const directory = resolveCacheDir();
  if (!directory) return null;
  const safeKey = key.toLocaleLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 80);
  return safeKey ? path.join(directory, `${safeKey}.json`) : null;
}

export function readDiskCache<T>(key: string): DiskCacheRecord<T> | null {
  const file = cacheFile(key);
  if (!file) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<DiskCacheRecord<T>>;
    if (!parsed || typeof parsed.savedAt !== 'string' || parsed.value === undefined) return null;
    return { savedAt: parsed.savedAt, value: parsed.value as T };
  } catch {
    return null;
  }
}

export function writeDiskCache<T>(key: string, value: T): void {
  const file = cacheFile(key);
  if (!file) return;
  const record: DiskCacheRecord<T> = { savedAt: new Date().toISOString(), value };
  const temporary = `${file}.${process.pid}.tmp`;
  void fs.promises.mkdir(path.dirname(file), { recursive: true })
    .then(() => fs.promises.writeFile(temporary, JSON.stringify(record), 'utf8'))
    .then(() => fs.promises.rename(temporary, file))
    .catch(() => {
      void fs.promises.rm(temporary, { force: true }).catch(() => undefined);
    });
}
