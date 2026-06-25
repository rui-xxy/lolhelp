import type {
  AssistItemBlock,
  AssistAugmentRecommendation,
  AssistOperationResult,
  AssistRecommendation,
  AssistRecommendationRequest,
  AssistRecommendationStrategy,
  AssistRuneRecommendation,
} from '../../shared/api';
import { getDataDragonVersion, getHeroByKey } from '../lcu/heroData';
import { LcuClient } from '../lcu/client';
import { getCachedCredentials } from '../lcu/lockfile';

interface OpggBuild {
  ids?: number[];
  play?: number;
  win?: number;
  pick_rate?: number;
}

interface OpggRuneBuild extends OpggBuild {
  primary_page_id?: number;
  primary_rune_ids?: number[];
  secondary_page_id?: number;
  secondary_rune_ids?: number[];
  stat_mod_ids?: number[];
}

interface OpggResponse {
  data?: {
    runes?: OpggRuneBuild[];
    starter_items?: OpggBuild[];
    core_items?: OpggBuild[];
    boots?: OpggBuild[];
    last_items?: OpggBuild[];
  };
}

interface OpggAugment {
  id?: number;
  tier?: number;
  performance?: number;
  popular?: number;
}

interface LcuAugment {
  id?: number;
  nameTRA?: string;
  name?: string;
  augmentSmallIconPath?: string;
  iconPath?: string;
}

interface ChampSelectSession {
  localPlayerCellId?: number;
  myTeam?: Array<{
    cellId?: number;
    championId?: number;
    assignedPosition?: string;
  }>;
}

interface GameflowSession {
  gameData?: {
    queue?: { id?: number };
  };
}

interface CurrentSummoner {
  accountId?: number;
  summonerId?: number;
}

interface ItemSetCollection {
  accountId?: number;
  itemSets?: unknown[];
  timestamp?: number;
}

const RECOMMENDATION_CACHE_TTL_MS = 10 * 60_000;
const cache = new Map<string, { expiresAt: number; value: AssistRecommendation }>();
let opggVersionCache: { value: string; expiresAt: number } | null = null;

function modeForQueue(queueId: number): string {
  if ([450, 2400, 2410].includes(queueId)) return 'aram';
  if ([1700, 1710, 1750, 2500].includes(queueId)) return 'arena';
  return 'ranked';
}

function communityDragonAsset(assetPath?: string): string {
  if (!assetPath) return '';
  const normalized = assetPath
    .replace(/^\/lol-game-data\/assets\//i, '')
    .toLowerCase();
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/${normalized}`;
}

async function getAugmentRecommendations(
  client: LcuClient,
  championId: number,
): Promise<AssistAugmentRecommendation[]> {
  const [response, assets] = await Promise.all([
    fetch(
      `https://lol-api-champion.op.gg/api/contents/stats/champions/${championId}/aram-augments`,
      { signal: AbortSignal.timeout(15_000) },
    ).then(async (result) => {
      if (!result.ok) return [] as OpggAugment[];
      const body = await result.json() as { data?: OpggAugment[] };
      return body.data ?? [];
    }).catch(() => [] as OpggAugment[]),
    client.get<LcuAugment[]>('/lol-game-data/assets/v1/cherry-augments.json')
      .catch(() => [] as LcuAugment[]),
  ]);
  const assetMap = new Map(assets.map((asset) => [Number(asset.id ?? 0), asset]));
  return response
    .sort((a, b) => Number(a.tier ?? 99) - Number(b.tier ?? 99) ||
      Number(b.popular ?? 0) - Number(a.popular ?? 0))
    .slice(0, 6)
    .map((augment) => {
      const id = Number(augment.id ?? 0);
      const asset = assetMap.get(id);
      return {
        id,
        name: asset?.nameTRA || asset?.name || `强化符文 ${id}`,
        icon: communityDragonAsset(asset?.augmentSmallIconPath || asset?.iconPath),
        tier: Number(augment.tier ?? 0),
        performance: Number(augment.performance ?? 0),
        popularity: Number(augment.popular ?? 0),
      };
    });
}

function positionForOpgg(position: string): string {
  switch (position.toLowerCase()) {
    case 'top':
      return 'top';
    case 'jungle':
      return 'jungle';
    case 'middle':
    case 'mid':
      return 'mid';
    case 'bottom':
    case 'adc':
      return 'adc';
    case 'utility':
    case 'support':
      return 'support';
    default:
      return 'mid';
  }
}

async function versionForOpgg(): Promise<string> {
  if (opggVersionCache && opggVersionCache.expiresAt > Date.now()) {
    return opggVersionCache.value;
  }
  try {
    const response = await fetch(
      'https://lol-api-champion.op.gg/api/global/champions/aram/versions',
      { signal: AbortSignal.timeout(10_000) },
    );
    if (response.ok) {
      const body = await response.json() as { data?: string[] };
      const value = body.data?.[0];
      if (value) {
        opggVersionCache = {
          value,
          expiresAt: Date.now() + 6 * 60 * 60_000,
        };
        return value;
      }
    }
  } catch {
    // Use the bundled version as a fallback.
  }
  const version = getDataDragonVersion();
  const match = version.match(/^(\d+\.\d+)/);
  return match?.[1] ?? '16.12';
}

function winRate(build: OpggBuild): number {
  const play = Number(build.play ?? 0);
  const wins = Number(build.win ?? 0);
  return play > 0 ? wins / play : 0;
}

function chooseBuild<T extends OpggBuild>(
  builds: T[] | undefined,
  strategy: AssistRecommendationStrategy,
): T | null {
  if (!builds?.length) return null;
  if (strategy === 'pickRate') {
    return [...builds].sort(
      (a, b) => Number(b.pick_rate ?? 0) - Number(a.pick_rate ?? 0),
    )[0] ?? null;
  }
  return [...builds].sort((a, b) => winRate(b) - winRate(a))[0] ?? null;
}

async function resolveRequest(
  client: LcuClient,
  request: AssistRecommendationRequest,
): Promise<Required<AssistRecommendationRequest>> {
  let championId = Number(request.championId ?? 0);
  let queueId = Number(request.queueId ?? 0);
  let position = request.position ?? '';

  if (!championId || !queueId || !position) {
    const [champSelect, gameflow] = await Promise.all([
      client.get<ChampSelectSession>('/lol-champ-select/v1/session')
        .catch((): ChampSelectSession => ({})),
      client.get<GameflowSession>('/lol-gameflow/v1/session')
        .catch((): GameflowSession => ({})),
    ]);
    const local = champSelect.myTeam?.find(
      (player) => player.cellId === champSelect.localPlayerCellId,
    );
    championId ||= Number(local?.championId ?? 0);
    queueId ||= Number(gameflow.gameData?.queue?.id ?? 0);
    position ||= local?.assignedPosition ?? '';
  }

  if (!championId) throw new Error('当前没有可识别的英雄');
  return {
    championId,
    queueId,
    position,
    strategy: request.strategy ?? 'pickRate',
  };
}

function buildRune(
  raw: OpggRuneBuild | null,
  championId: number,
): AssistRuneRecommendation | null {
  if (!raw) return null;
  const primaryStyleId = Number(raw.primary_page_id ?? 0);
  const subStyleId = Number(raw.secondary_page_id ?? 0);
  const selectedPerkIds = [
    ...(raw.primary_rune_ids ?? []),
    ...(raw.secondary_rune_ids ?? []),
    ...(raw.stat_mod_ids ?? []),
  ].map(Number).filter((id) => id > 0);
  if (!primaryStyleId || !subStyleId || selectedPerkIds.length === 0) return null;

  const champion = getHeroByKey(championId);
  return {
    name: `LOL助手 - ${champion?.title || champion?.name || championId}`,
    primaryStyleId,
    subStyleId,
    selectedPerkIds,
    play: Number(raw.play ?? 0),
    winRate: winRate(raw),
    pickRate: Number(raw.pick_rate ?? 0),
  };
}

function buildItemBlock(
  title: string,
  builds: OpggBuild[] | undefined,
  strategy: AssistRecommendationStrategy,
): AssistItemBlock | null {
  const selected = chooseBuild(builds, strategy);
  const itemIds = (selected?.ids ?? []).map(Number).filter((id) => id > 0);
  return itemIds.length ? { title, itemIds } : null;
}

export async function getAssistRecommendation(
  request: AssistRecommendationRequest = {},
): Promise<AssistRecommendation> {
  const creds = getCachedCredentials();
  if (!creds) throw new Error('未连接英雄联盟客户端');
  const client = new LcuClient(creds);
  const resolved = await resolveRequest(client, request);
  const mode = modeForQueue(resolved.queueId);
  const position = positionForOpgg(resolved.position);
  const opggVersion = await versionForOpgg();
  const cacheKey = [
    resolved.championId,
    resolved.queueId,
    position,
    resolved.strategy,
    opggVersion,
  ].join(':');
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.value);

  const path = mode === 'ranked'
    ? `${mode}/${resolved.championId}/${position}`
    : `${mode}/${resolved.championId}`;
  const query = new URLSearchParams({
    version: opggVersion,
    ...(mode === 'ranked' ? { tier: 'all' } : {}),
  });
  const response = await fetch(
    `https://lol-api-champion.op.gg/api/global/champions/${path}?${query}`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!response.ok) throw new Error(`推荐数据请求失败：HTTP ${response.status}`);
  const body = await response.json() as OpggResponse;
  const strategy = resolved.strategy;
  const augments = mode === 'aram' || mode === 'arena'
    ? await getAugmentRecommendations(client, resolved.championId)
    : [];
  const recommendation: AssistRecommendation = {
    championId: resolved.championId,
    queueId: resolved.queueId,
    position,
    mode,
    source: 'OP.GG',
    rune: buildRune(chooseBuild(body.data?.runes, strategy), resolved.championId),
    items: [
      buildItemBlock('出门装', body.data?.starter_items, strategy),
      buildItemBlock('核心装备', body.data?.core_items, strategy),
      buildItemBlock('鞋子', body.data?.boots, strategy),
      buildItemBlock('后期可选', body.data?.last_items, strategy),
    ].filter((block): block is AssistItemBlock => Boolean(block)),
    augments,
  };
  cache.set(cacheKey, {
    expiresAt: Date.now() + RECOMMENDATION_CACHE_TTL_MS,
    value: recommendation,
  });
  return structuredClone(recommendation);
}

async function applyRune(
  client: LcuClient,
  recommendation: AssistRecommendation,
): Promise<AssistOperationResult> {
  if (!recommendation.rune) {
    return { key: 'rune', success: false, message: '没有可用符文推荐' };
  }
  const pages = await client.get<Array<{ id?: number; current?: boolean; isDeletable?: boolean }>>(
    '/lol-perks/v1/pages',
  );
  const current = pages.find((page) => page.current);
  if (current?.isDeletable && current.id) {
    await client.delete(`/lol-perks/v1/pages/${current.id}`);
  }
  await client.post('/lol-perks/v1/pages', {
    current: true,
    name: recommendation.rune.name,
    primaryStyleId: recommendation.rune.primaryStyleId,
    subStyleId: recommendation.rune.subStyleId,
    selectedPerkIds: recommendation.rune.selectedPerkIds,
  });
  return { key: 'rune', success: true, message: '推荐符文已应用' };
}

async function applyItems(
  client: LcuClient,
  recommendation: AssistRecommendation,
): Promise<AssistOperationResult> {
  if (recommendation.items.length === 0) {
    return { key: 'items', success: false, message: '没有可用装备推荐' };
  }
  const summoner = await client.get<CurrentSummoner>('/lol-summoner/v1/current-summoner');
  const summonerId = Number(summoner.summonerId ?? 0);
  const accountId = Number(summoner.accountId ?? 0);
  if (!summonerId) throw new Error('无法读取当前召唤师');

  const endpoint = `/lol-item-sets/v1/item-sets/${summonerId}/sets`;
  const collection = await client.get<ItemSetCollection>(endpoint).catch(() => ({
    accountId,
    itemSets: [],
    timestamp: 0,
  }));
  const uid = `lolhelp-${recommendation.championId}`;
  const existing = Array.isArray(collection.itemSets)
    ? collection.itemSets.filter((item) => {
        const value = item as { uid?: string };
        return value.uid !== uid;
      })
    : [];
  const itemSet = {
    associatedChampions: [recommendation.championId],
    associatedMaps: [11, 12],
    blocks: recommendation.items.map((block) => ({
      hideIfSummonerSpell: '',
      items: block.itemIds.map((id) => ({ count: 1, id: String(id) })),
      showIfSummonerSpell: '',
      type: block.title,
    })),
    map: 'any',
    mode: 'any',
    preferredItemSlots: [],
    priority: true,
    sortrank: 0,
    startedFrom: 'blank',
    title: `LOL助手推荐 - ${getHeroByKey(recommendation.championId)?.title ?? recommendation.championId}`,
    type: 'custom',
    uid,
  };
  await client.put(endpoint, {
    accountId: Number(collection.accountId ?? accountId),
    itemSets: [...existing, itemSet],
    timestamp: Date.now(),
  });
  return { key: 'items', success: true, message: '推荐装备已写入客户端' };
}

export async function applyAssistRecommendation(
  request: AssistRecommendationRequest = {},
  options: { rune?: boolean; items?: boolean } = { rune: true, items: true },
): Promise<AssistOperationResult[]> {
  const creds = getCachedCredentials();
  if (!creds) throw new Error('未连接英雄联盟客户端');
  const client = new LcuClient(creds);
  const recommendation = await getAssistRecommendation(request);
  const results: AssistOperationResult[] = [];

  if (options.rune !== false) {
    try {
      results.push(await applyRune(client, recommendation));
    } catch (error) {
      results.push({
        key: 'rune',
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (options.items !== false) {
    try {
      results.push(await applyItems(client, recommendation));
    } catch (error) {
      results.push({
        key: 'items',
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
