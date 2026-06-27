import type {
  AssistChampionShard,
  AssistClaimRewardRequest,
  AssistLootSummary,
  AssistOperationResult,
  AssistRewardGrant,
  AssistRewardItem,
} from '../../shared/api';
import { getCachedCredentials } from '../lcu/lockfile';
import { LcuClient } from '../lcu/client';
import { getHeroByKey } from '../lcu/heroData';

interface LootEntry {
  lootId?: string;
  type?: string;
  count?: number;
  value?: number;
  disenchantValue?: number;
}

interface RewardGrantRaw {
  info?: {
    id?: string | number;
    status?: string;
    granteeId?: string | number;
    rewardGroupId?: string | number;
  };
  rewardGroup?: {
    rewards?: RewardRaw[];
  };
}

interface RewardRaw {
  id?: string | number;
  localizations?: {
    title?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function getClient(): LcuClient {
  const creds = getCachedCredentials();
  if (!creds) throw new Error('英雄联盟客户端未连接');
  return new LcuClient(creds);
}

function numberValue(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function readRewardTitle(reward: RewardRaw): string {
  const localizationTitle = reward.localizations?.title;
  if (localizationTitle) return localizationTitle;
  const candidate = reward.title ?? reward.name ?? reward.itemDesc ?? reward.itemName;
  return candidate ? String(candidate) : '未知奖励';
}

function mapRewardItem(reward: RewardRaw): AssistRewardItem {
  return {
    id: String(reward.id ?? ''),
    title: readRewardTitle(reward),
  };
}

function mapRewardGrant(raw: RewardGrantRaw): AssistRewardGrant | null {
  const id = String(raw.info?.id ?? '');
  const rewardGroupId = String(raw.info?.rewardGroupId ?? '');
  const rewards = (raw.rewardGroup?.rewards ?? [])
    .map(mapRewardItem)
    .filter((reward) => reward.id);
  if (!id || !rewardGroupId || rewards.length === 0) return null;

  const status = String(raw.info?.status ?? '');
  return {
    id,
    status,
    granteeId: String(raw.info?.granteeId ?? ''),
    rewardGroupId,
    title: rewards[0]?.title ?? '未知奖励',
    rewards,
    disabled: status !== 'PENDING_SELECTION',
  };
}

export async function getAssistLoot(): Promise<AssistLootSummary> {
  const client = getClient();
  const lootMap = await client.get<Record<string, LootEntry>>('/lol-loot/v1/player-loot-map');
  const championEssence = numberValue(lootMap.CURRENCY_champion?.count);
  const shards: AssistChampionShard[] = [];

  for (const [key, entry] of Object.entries(lootMap)) {
    if (entry?.type !== 'CHAMPION_RENTAL') continue;
    const championId = Number(key.replace('CHAMPION_RENTAL_', ''));
    const hero = Number.isFinite(championId) ? getHeroByKey(championId) : null;
    shards.push({
      lootId: String(entry.lootId ?? key),
      championId: Number.isFinite(championId) ? championId : 0,
      name: hero?.title || hero?.name || `英雄 ${championId || ''}`.trim(),
      icon: hero?.avatar ?? '',
      count: Math.max(0, Math.floor(numberValue(entry.count))),
      value: numberValue(entry.value),
      disenchantValue: numberValue(entry.disenchantValue),
    });
  }

  return {
    championEssence,
    shards: shards.sort((a, b) => a.championId - b.championId),
  };
}

export async function disenchantAssistChampionShard(
  lootId: string,
  count: number,
): Promise<AssistOperationResult> {
  const normalizedLootId = String(lootId ?? '').trim();
  const repeat = Math.max(1, Math.floor(Number(count) || 1));
  if (!normalizedLootId) {
    return { key: 'disenchant', success: false, message: '请选择要分解的英雄碎片' };
  }

  try {
    const client = getClient();
    const result = await client.post<unknown>(
      `/lol-loot/v1/recipes/CHAMPION_RENTAL_disenchant/craft?repeat=${repeat}`,
      [normalizedLootId],
    );
    const failed = Boolean(
      result && typeof result === 'object' && 'errorCode' in result,
    );
    return {
      key: normalizedLootId,
      success: !failed,
      message: failed ? '分解失败，请稍后重试' : `已分解 ${repeat} 个英雄碎片`,
    };
  } catch (error) {
    return {
      key: normalizedLootId,
      success: false,
      message: `分解失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function getAssistRewards(): Promise<AssistRewardGrant[]> {
  const client = getClient();
  const grants = await client.get<RewardGrantRaw[]>('/lol-rewards/v1/grants');
  if (!Array.isArray(grants)) return [];
  return grants
    .map(mapRewardGrant)
    .filter((grant): grant is AssistRewardGrant => Boolean(grant));
}

export async function claimAssistReward(
  request: AssistClaimRewardRequest,
): Promise<AssistOperationResult> {
  const rewardId = String(request.rewardId ?? '').trim();
  const rewardGroupId = String(request.rewardGroupId ?? '').trim();
  const selections = Array.isArray(request.selections)
    ? request.selections.map((selection) => String(selection)).filter(Boolean)
    : [];
  if (!rewardId || !rewardGroupId || selections.length === 0) {
    return { key: rewardId || 'reward', success: false, message: '奖励参数不完整' };
  }

  try {
    const client = getClient();
    await client.post(`/lol-rewards/v1/grants/${encodeURIComponent(rewardId)}/select`, {
      selections,
      rewardGroupId,
    });
    return { key: rewardId, success: true, message: '奖励领取成功' };
  } catch (error) {
    return {
      key: rewardId,
      success: false,
      message: `奖励领取失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function claimAssistRewards(
  requests: AssistClaimRewardRequest[],
): Promise<AssistOperationResult[]> {
  const results: AssistOperationResult[] = [];
  for (const request of requests) {
    results.push(await claimAssistReward(request));
  }
  return results;
}
