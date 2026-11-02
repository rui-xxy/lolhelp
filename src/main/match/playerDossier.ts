import { getSgpAuth } from '../sgp/auth';
import { SgpClient } from '../sgp/client';
import { getRegionConfig } from '../sgp/region';
import { getCachedCredentials } from '../lcu/lockfile';
import { LcuClient } from '../lcu/client';
import type {
  PlayerChallengeCategory,
  PlayerChallengeLevel,
  PlayerChallengeToken,
  PlayerCollectionCounts,
  PlayerDossier,
} from '../../shared/api';

// 玩家档案：战绩之外能查到的信息，全部按 puuid 查，能查任意玩家。
// 三个来源并行请求，任何一个失败都只让对应字段为空，不影响其他字段：
//   1. SGP  POST /challenges-client/v2/all-player-data   收藏数量、挑战总等级、5 个分类、展示徽章
//   2. SGP  GET  /summoner-ledge/v1/regions/{大区}/summoners/puuid/{puuid}   等级经验、最后游戏时间、隐私
//   3. LCU  GET  /lol-summoner/v1/summoner-profile?puuid=   生涯背景皮肤
// 挑战名字来自 LCU 的 /lol-game-data/assets/v1/challenges.json（整个进程只读一次）。
// 国服已知 403 的（英雄熟练度、荣誉、收藏明细）不在这里请求，见 docs/api-endpoints.md 第四节。

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; value: PlayerDossier }>();

// challenge id → 收藏字段（与 matchService 的 COLLECTION_CHALLENGE_IDS 一致，已实测）。
const COLLECTION_IDS: Record<keyof PlayerCollectionCounts, number> = {
  champions: 505001,
  skins: 510001,
  chromas: 510011,
  icons: 504002,
  wards: 504003,
  emotes: 504004,
};

const CATEGORY_LABELS: Record<string, string> = {
  IMAGINATION: '想象力',
  EXPERTISE: '专精',
  TEAMWORK: '团队协作',
  VETERANCY: '老练',
  COLLECTION: '收藏',
};
const CATEGORY_ORDER = ['EXPERTISE', 'TEAMWORK', 'VETERANCY', 'COLLECTION', 'IMAGINATION'];

interface RawLevelPoints {
  level?: string;
  current?: number;
  max?: number;
  percentile?: number;
}

interface RawPlayerChallenge {
  id?: number;
  currentValue?: number;
  currentLevel?: string;
}

interface RawAllPlayerData {
  totalPoints?: RawLevelPoints;
  categoryPoints?: Record<string, RawLevelPoints>;
  playerChallenges?: RawPlayerChallenge[];
  preferences?: { challengeIds?: number[] };
}

interface RawSummonerLedge {
  level?: number;
  summonerLevel?: number;
  expPoints?: number;
  expToNextLevel?: number;
  lastGameDate?: number;
  privacy?: string;
}

interface RawSummonerProfile {
  backgroundSkinId?: number;
}

interface ChallengeConfig {
  name: string;
  description: string;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mapLevel(raw: RawLevelPoints | undefined): PlayerChallengeLevel | null {
  if (!raw || typeof raw !== 'object') return null;
  const current = finiteOrNull(raw.current);
  if (current === null) return null;
  return {
    level: String(raw.level ?? 'NONE').toUpperCase(),
    current,
    max: finiteOrNull(raw.max) ?? 0,
    percentile: finiteOrNull(raw.percentile),
  };
}

function tokenIconUrl(id: number, level: string): string {
  return `https://raw.communitydragon.org/latest/game/assets/challenges/config/${id}/tokens/${level.toLowerCase()}.png`;
}

let challengeConfigPromise: Promise<Map<number, ChallengeConfig>> | null = null;

// LCU 的 challenges.json 在不同版本里可能是对象（id → 配置）或数组，两种都兼容。
function loadChallengeConfig(): Promise<Map<number, ChallengeConfig>> {
  if (challengeConfigPromise) return challengeConfigPromise;
  const creds = getCachedCredentials();
  if (!creds) return Promise.resolve(new Map());
  challengeConfigPromise = new LcuClient(creds)
    .get<unknown>('/lol-game-data/assets/v1/challenges.json')
    .then((raw) => {
      const map = new Map<number, ChallengeConfig>();
      const entries = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object'
          ? Object.values(raw as Record<string, unknown>)
          : [];
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        const item = entry as { id?: unknown; name?: unknown; description?: unknown; descriptionShort?: unknown };
        const id = Number(item.id);
        if (!Number.isFinite(id)) continue;
        map.set(id, {
          name: typeof item.name === 'string' ? item.name : '',
          description: typeof item.descriptionShort === 'string' && item.descriptionShort
            ? item.descriptionShort
            : typeof item.description === 'string' ? item.description : '',
        });
      }
      return map;
    })
    .catch((error) => {
      console.warn('[dossier] 读取挑战配置失败:', error);
      challengeConfigPromise = null;
      return new Map<number, ChallengeConfig>();
    });
  return challengeConfigPromise;
}

function hasChallengeData(data: RawAllPlayerData | null | undefined): data is RawAllPlayerData {
  return Boolean(data && (Array.isArray(data.playerChallenges) && data.playerChallenges.length > 0 || data.totalPoints));
}

function describe(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

// 挑战数据：先按玩家所在大区查；拿不到（报错或返回空）再用当前登录大区的通道查一次——
// 这和战绩页查英雄 / 皮肤数量（matchService.fetchCollectionCounts）走的是同一条路。
async function fetchChallenges(
  puuid: string,
  regional: SgpClient | null,
  notes: string[],
): Promise<RawAllPlayerData | null> {
  const path = '/challenges-client/v2/all-player-data';
  if (regional) {
    try {
      const data = await regional.post<RawAllPlayerData>(path, [], { puuid });
      if (hasChallengeData(data)) return data;
      notes.push(`挑战(${regional.auth.region.key})：返回为空`);
    } catch (error) {
      notes.push(`挑战(${regional.auth.region.key})：${describe(error)}`);
    }
  }
  try {
    const fallback = new SgpClient(await getSgpAuth());
    // 同一个大区刚刚已经查过，再查一次只是重复等待。
    if (regional && fallback.auth.region.key === regional.auth.region.key) return null;
    const data = await fallback.post<RawAllPlayerData>(path, [], { puuid });
    if (hasChallengeData(data)) return data;
    notes.push(`挑战(${fallback.auth.region.key})：返回为空`);
  } catch (error) {
    notes.push(`挑战：${describe(error)}`);
  }
  return null;
}

async function getAuthForRegion(region?: string) {
  const auth = await getSgpAuth();
  if (!region) return auth;
  const target = getRegionConfig(region);
  return target ? { ...auth, region: target } : auth;
}

function emptyDossier(puuid: string, error?: string): PlayerDossier {
  return {
    puuid,
    level: null,
    expPoints: null,
    expToNextLevel: null,
    lastGameDate: null,
    privacy: null,
    backgroundSkinId: null,
    collection: { champions: null, skins: null, chromas: null, icons: null, emotes: null, wards: null },
    challengePoints: null,
    categories: [],
    tokens: [],
    ...(error ? { error } : {}),
  };
}

export async function fetchPlayerDossier(puuid: string, region?: string): Promise<PlayerDossier> {
  const normalizedPuuid = puuid.trim();
  if (!normalizedPuuid) return emptyDossier('', '缺少玩家 ID');
  const cacheKey = `${(region ?? '').toUpperCase()}:${normalizedPuuid}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const dossier = emptyDossier(normalizedPuuid);
  const creds = getCachedCredentials();
  const lcu = creds ? new LcuClient(creds) : null;

  let sgp: SgpClient | null = null;
  try {
    sgp = new SgpClient(await getAuthForRegion(region));
  } catch (error) {
    dossier.error = error instanceof Error ? error.message : String(error);
  }

  const notes: string[] = [];
  const [challengesResult, ledgeResult, profileResult, configResult] = await Promise.allSettled([
    fetchChallenges(normalizedPuuid, sgp, notes),
    sgp
      ? sgp.get<RawSummonerLedge | RawSummonerLedge[]>(
          `/summoner-ledge/v1/regions/${sgp.auth.region.key.toLowerCase()}/summoners/puuid/${encodeURIComponent(normalizedPuuid)}`,
        )
      : Promise.reject(new Error('SGP 不可用')),
    lcu
      ? lcu.get<RawSummonerProfile>(`/lol-summoner/v1/summoner-profile?puuid=${encodeURIComponent(normalizedPuuid)}`)
      : Promise.reject(new Error('LCU 不可用')),
    loadChallengeConfig(),
  ]);

  if (challengesResult.status === 'fulfilled' && challengesResult.value) {
    const data = challengesResult.value;
    const byId = new Map<number, RawPlayerChallenge>();
    for (const item of data.playerChallenges ?? []) {
      if (typeof item?.id === 'number') byId.set(item.id, item);
    }
    for (const [key, id] of Object.entries(COLLECTION_IDS) as Array<[keyof PlayerCollectionCounts, number]>) {
      dossier.collection[key] = finiteOrNull(byId.get(id)?.currentValue);
    }
    dossier.challengePoints = mapLevel(data.totalPoints);
    const categories: PlayerChallengeCategory[] = [];
    for (const key of CATEGORY_ORDER) {
      const level = mapLevel(data.categoryPoints?.[key]);
      if (level) categories.push({ key, label: CATEGORY_LABELS[key] ?? key, ...level });
    }
    dossier.categories = categories;

    const config = configResult.status === 'fulfilled' ? configResult.value : new Map<number, ChallengeConfig>();
    const tokens: PlayerChallengeToken[] = [];
    for (const rawId of data.preferences?.challengeIds ?? []) {
      const id = Number(rawId);
      if (!Number.isFinite(id) || id <= 0) continue;
      const level = String(byId.get(id)?.currentLevel ?? '').toUpperCase();
      if (!level || level === 'NONE') continue;
      const info = config.get(id);
      tokens.push({
        id,
        name: info?.name ?? '',
        description: info?.description ?? '',
        level,
        iconUrl: tokenIconUrl(id, level),
      });
    }
    dossier.tokens = tokens.slice(0, 3);
  }

  if (challengesResult.status === 'rejected') notes.push(`挑战：${describe(challengesResult.reason)}`);
  if (ledgeResult.status === 'rejected') notes.push(`召唤师信息：${describe(ledgeResult.reason)}`);
  if (profileResult.status === 'rejected') notes.push(`生涯背景：${describe(profileResult.reason)}`);
  if (notes.length > 0) console.warn('[dossier]', normalizedPuuid, notes.join(' | '));

  if (ledgeResult.status === 'fulfilled' && ledgeResult.value) {
    const raw = Array.isArray(ledgeResult.value) ? ledgeResult.value[0] : ledgeResult.value;
    if (raw && typeof raw === 'object') {
      dossier.level = finiteOrNull(raw.level ?? raw.summonerLevel);
      dossier.expPoints = finiteOrNull(raw.expPoints);
      dossier.expToNextLevel = finiteOrNull(raw.expToNextLevel);
      dossier.lastGameDate = finiteOrNull(raw.lastGameDate);
      dossier.privacy = typeof raw.privacy === 'string' ? raw.privacy.toUpperCase() : null;
    }
  }

  if (profileResult.status === 'fulfilled' && profileResult.value) {
    const skinId = finiteOrNull(profileResult.value.backgroundSkinId);
    // 老数据里可能只存英雄 id（< 1000），换算成该英雄的默认皮肤。
    dossier.backgroundSkinId = skinId && skinId > 0 ? (skinId < 1000 ? skinId * 1000 : skinId) : null;
  }

  const hasAnything = dossier.level !== null
    || dossier.backgroundSkinId !== null
    || dossier.challengePoints !== null
    || Object.values(dossier.collection).some((value) => value !== null);
  if (notes.length > 0) dossier.diagnostics = notes;
  if (hasAnything) {
    delete dossier.error;
    // 只缓存完整的结果；有一项没拿到就不缓存，下次打开或点重试会重新请求。
    if (notes.length === 0) cache.set(cacheKey, { at: Date.now(), value: dossier });
  } else if (!dossier.error) {
    dossier.error = '暂时读不到这个玩家的档案';
  }
  return dossier;
}
