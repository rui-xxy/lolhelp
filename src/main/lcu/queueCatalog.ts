import { LcuClient } from './client';

export interface LcuQueueInfo {
  id: number;
  name: string;
  gameMode: string;
  type: string;
  isRanked: boolean;
}

interface RawLcuQueueInfo {
  id?: number;
  name?: string;
  shortName?: string;
  gameMode?: string;
  type?: string;
  isRanked?: boolean;
}

const QUEUE_CATALOG_TTL_MS = 30 * 60 * 1000;
let queueCatalogCache: { value: Map<number, LcuQueueInfo>; expiresAt: number } | null = null;
let queueCatalogPending: Promise<Map<number, LcuQueueInfo>> | null = null;

export function getQueueDisplayName(queue: LcuQueueInfo): string {
  const name = queue.name.trim();
  const gameMode = queue.gameMode.toUpperCase();
  const type = queue.type.toUpperCase();

  if (type === 'RANKED_SOLO_5X5') return '单双排位';
  if (type === 'RANKED_FLEX_SR') return '灵活排位';
  if (type === 'RANKED_TFT') return '云顶之弈（排位）';
  if (type === 'NORMAL_TFT') return '云顶之弈（匹配）';
  if (type === 'TURBO_TFT' || type === 'RANKED_TFT_TURBO') {
    return '云顶之弈（狂暴模式）';
  }
  if (type === 'RANKED_TFT_PAIRS') return '云顶之弈（双人作战）';
  if (type === 'TUTORIAL_TFT') return '云顶之弈（新手教程）';

  if (gameMode === 'TFT') {
    if (!name) return '云顶之弈';
    return name.includes('云顶之弈') ? name : `云顶之弈（${name}）`;
  }
  if (gameMode === 'CHERRY') return name || '斗魂竞技场';
  if (gameMode === 'KIWI') return name || '海克斯大乱斗';
  if (gameMode === 'ARAM') return name || '极地大乱斗';
  if (queue.id === 490) return '快速匹配';
  if (queue.id === 400 || queue.id === 430) return '匹配模式';
  if (queue.id === 3110) return '自定义对局';

  return name || queue.type || queue.gameMode || `模式 ${queue.id}`;
}

export function buildQueueCatalog(queues: RawLcuQueueInfo[]): Map<number, LcuQueueInfo> {
  const catalog = new Map<number, LcuQueueInfo>();
  for (const queue of queues) {
    const id = Number(queue.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    catalog.set(id, {
      id,
      name: String(queue.name ?? queue.shortName ?? '').trim(),
      gameMode: String(queue.gameMode ?? ''),
      type: String(queue.type ?? ''),
      isRanked: queue.isRanked === true,
    });
  }
  return catalog;
}

export async function getQueueCatalog(client: LcuClient): Promise<Map<number, LcuQueueInfo>> {
  const now = Date.now();
  if (queueCatalogCache && queueCatalogCache.expiresAt > now) {
    return queueCatalogCache.value;
  }
  if (queueCatalogPending) return queueCatalogPending;

  queueCatalogPending = client
    .get<RawLcuQueueInfo[]>('/lol-game-queues/v1/queues')
    .then((queues) => {
      const value = buildQueueCatalog(Array.isArray(queues) ? queues : []);
      queueCatalogCache = {
        value,
        expiresAt: Date.now() + QUEUE_CATALOG_TTL_MS,
      };
      return value;
    })
    .catch(() => new Map<number, LcuQueueInfo>())
    .finally(() => {
      queueCatalogPending = null;
    });

  return queueCatalogPending;
}
