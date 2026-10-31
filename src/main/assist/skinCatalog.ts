import type { AssistChampionSkin } from '../../shared/api';
import { LcuClient } from '../lcu/client';
import { getCachedCredentials } from '../lcu/lockfile';

// 某个英雄的全部皮肤（生涯背景选择用）。
// 先问客户端（名字跟客户端语言一致）；没连客户端或读失败，再用腾讯英雄资料兜底。
// 图片统一用公开图床，渲染进程不需要客户端的鉴权就能显示。

interface LcuSkin {
  id?: number | string;
  name?: string;
  isBase?: boolean;
}

interface TencentHeroSkin {
  skinId?: number | string;
  name?: string;
  chromas?: number | string;
}

const GTIMG_SKIN_BASE = 'https://game.gtimg.cn/images/lol/act/img/skin/big';
const CDRAGON_SPLASH_BASE =
  'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-splashes/';
const TENCENT_HERO_BASE = 'https://game.gtimg.cn/images/lol/act/img/js/hero/';
const FETCH_TIMEOUT_MS = 8000;

const cache = new Map<number, AssistChampionSkin[]>();

function toSkin(championId: number, skinId: number, name: string): AssistChampionSkin {
  const isBase = skinId === championId * 1000;
  return {
    id: skinId,
    championId,
    name: isBase ? '经典' : name || `皮肤 ${skinId % 1000}`,
    isBase,
    splash: `${GTIMG_SKIN_BASE}${skinId}.jpg`,
    splashFallback: `${CDRAGON_SPLASH_BASE}${championId}/${skinId}.jpg`,
  };
}

function belongsTo(championId: number, skinId: number): boolean {
  return Number.isInteger(skinId) && Math.floor(skinId / 1000) === championId;
}

async function fromClient(championId: number): Promise<AssistChampionSkin[]> {
  const creds = getCachedCredentials();
  if (!creds) return [];
  const detail = await new LcuClient(creds).get<{ skins?: LcuSkin[] }>(
    `/lol-game-data/assets/v1/champions/${championId}.json`,
  );
  return (detail.skins ?? [])
    .map((skin) => ({ id: Number(skin.id), name: String(skin.name ?? '') }))
    .filter((skin) => belongsTo(championId, skin.id))
    .map((skin) => toSkin(championId, skin.id, skin.name));
}

async function fromTencent(championId: number): Promise<AssistChampionSkin[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${TENCENT_HERO_BASE}${championId}.js`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json() as { skins?: TencentHeroSkin[] };
    return (data.skins ?? [])
      // 炫彩（chromas = 1）只是换色，不单独列出来
      .filter((skin) => String(skin.chromas ?? '0') === '0')
      .map((skin) => ({ id: Number(skin.skinId), name: String(skin.name ?? '') }))
      .filter((skin) => belongsTo(championId, skin.id))
      .map((skin) => toSkin(championId, skin.id, skin.name));
  } finally {
    clearTimeout(timer);
  }
}

export async function getAssistChampionSkins(championId: number): Promise<AssistChampionSkin[]> {
  const id = Math.trunc(Number(championId));
  if (!Number.isFinite(id) || id <= 0 || id > 9999) throw new Error('英雄编号不正确');
  const cached = cache.get(id);
  if (cached) return structuredClone(cached);

  let skins: AssistChampionSkin[] = [];
  try {
    skins = await fromClient(id);
  } catch {
    skins = [];
  }
  if (skins.length === 0) {
    try {
      skins = await fromTencent(id);
    } catch (error) {
      throw new Error(`皮肤列表读取失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (skins.length === 0) skins = [toSkin(id, id * 1000, '')];
  skins.sort((a, b) => a.id - b.id);
  cache.set(id, skins);
  return structuredClone(skins);
}
