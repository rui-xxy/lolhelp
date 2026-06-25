import { LcuClient } from './client';

interface LcuChampionChroma {
  id?: number | string;
}

interface LcuChampionSkin {
  id?: number | string;
  chromas?: LcuChampionChroma[];
}

interface LcuChampionDetail {
  skins?: LcuChampionSkin[];
}

const championSkinIndexCache = new Map<number, Promise<Map<number, number>>>();

function positiveInteger(value: unknown): number {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 0;
}

export function buildChampionSkinIndex(
  championId: number,
  skins: LcuChampionSkin[],
): Map<number, number> {
  const index = new Map<number, number>();
  const baseSkinId = championId * 1000;

  for (const skin of skins) {
    const skinId = positiveInteger(skin.id);
    if (skinId < baseSkinId) continue;
    index.set(skinId, skinId);

    for (const chroma of skin.chromas ?? []) {
      const chromaId = positiveInteger(chroma.id);
      if (chromaId >= baseSkinId) index.set(chromaId, skinId);
    }
  }

  return index;
}

async function getChampionSkinIndex(
  client: LcuClient,
  championId: number,
): Promise<Map<number, number>> {
  const cached = championSkinIndexCache.get(championId);
  if (cached) return cached;

  const pending = client
    .get<LcuChampionDetail>(`/lol-game-data/assets/v1/champions/${championId}.json`)
    .then((detail) => buildChampionSkinIndex(championId, detail.skins ?? []))
    .catch((error) => {
      championSkinIndexCache.delete(championId);
      throw error;
    });
  championSkinIndexCache.set(championId, pending);
  return pending;
}

export async function resolveChampionSkinId(
  client: LcuClient,
  championId: number,
  skinVariant: string | number,
): Promise<number> {
  const numericChampionId = positiveInteger(championId);
  const numericVariant = positiveInteger(skinVariant);
  if (!numericChampionId || !numericVariant) return numericChampionId * 1000;

  try {
    const index = await getChampionSkinIndex(client, numericChampionId);
    return index.get(numericVariant) ?? numericChampionId * 1000;
  } catch {
    return numericChampionId * 1000;
  }
}
