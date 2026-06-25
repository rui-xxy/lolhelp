import type {
  AssistChampionGuide,
  AssistOperationResult,
} from '../../shared/api';
import { getDataDragonVersion, getHeroByKey } from '../lcu/heroData';
import { LcuClient } from '../lcu/client';
import { getCachedCredentials } from '../lcu/lockfile';
import { findLocalAction } from './championActions';

interface DDragonChampion {
  id?: string;
  name?: string;
  title?: string;
  stats?: Record<string, number>;
  spells?: Array<{
    name?: string;
    description?: string;
    cooldownBurn?: string;
    costBurn?: string;
  }>;
}

interface ChampSelectSession {
  localPlayerCellId?: number;
  actions?: Array<Array<{
    id: number;
    actorCellId: number;
    type: string;
    isInProgress?: boolean;
    completed?: boolean;
  }>>;
  myTeam?: Array<{
    cellId?: number;
    championId?: number;
    championPickIntent?: number;
  }>;
}

const guideCache = new Map<number, AssistChampionGuide>();
let dataDragonVersionCache: { value: string; expiresAt: number } | null = null;

function stripMarkup(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function resolveDataDragonVersion(): Promise<string> {
  if (dataDragonVersionCache && dataDragonVersionCache.expiresAt > Date.now()) {
    return dataDragonVersionCache.value;
  }
  try {
    const response = await fetch(
      'https://ddragon.leagueoflegends.com/api/versions.json',
      { signal: AbortSignal.timeout(10_000) },
    );
    if (response.ok) {
      const versions = await response.json() as string[];
      if (versions[0]) {
        dataDragonVersionCache = {
          value: versions[0],
          expiresAt: Date.now() + 6 * 60 * 60_000,
        };
        return versions[0];
      }
    }
  } catch {
    // Use the bundled data version as a fallback.
  }
  return getDataDragonVersion() === 'latest'
    ? '16.12.1'
    : getDataDragonVersion();
}

async function resolveCurrentChampion(client: LcuClient): Promise<number> {
  const session = await client.get<ChampSelectSession>('/lol-champ-select/v1/session');
  const player = session.myTeam?.find(
    (item) => item.cellId === session.localPlayerCellId,
  );
  return Number(player?.championId || player?.championPickIntent || 0);
}

export async function getAssistChampionGuide(
  requestedChampionId = 0,
): Promise<AssistChampionGuide> {
  const creds = getCachedCredentials();
  if (!creds) throw new Error('未连接英雄联盟客户端');
  const client = new LcuClient(creds);
  const championId = requestedChampionId || await resolveCurrentChampion(client);
  if (!championId) throw new Error('当前没有可识别的英雄');
  const cached = guideCache.get(championId);
  if (cached) return structuredClone(cached);

  const hero = getHeroByKey(championId);
  if (!hero?.alias) throw new Error('英雄资料未加载');
  const version = await resolveDataDragonVersion();
  const response = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/zh_CN/champion/${hero.alias}.json`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!response.ok) throw new Error(`英雄资料请求失败：HTTP ${response.status}`);
  const body = await response.json() as { data?: Record<string, DDragonChampion> };
  const data = body.data?.[hero.alias] ?? Object.values(body.data ?? {})[0];
  if (!data) throw new Error('英雄资料为空');
  const stats = data.stats ?? {};
  const guide: AssistChampionGuide = {
    championId,
    name: data.name || hero.title || hero.name,
    title: data.title || hero.name,
    stats: [
      { label: '生命值', base: stats.hp ?? 0, perLevel: stats.hpperlevel },
      { label: '生命回复', base: stats.hpregen ?? 0, perLevel: stats.hpregenperlevel },
      { label: '法力值', base: stats.mp ?? 0, perLevel: stats.mpperlevel },
      { label: '护甲', base: stats.armor ?? 0, perLevel: stats.armorperlevel },
      { label: '攻击力', base: stats.attackdamage ?? 0, perLevel: stats.attackdamageperlevel },
      { label: '攻击速度', base: stats.attackspeed ?? 0, perLevel: stats.attackspeedperlevel },
      { label: '移动速度', base: stats.movespeed ?? 0 },
      { label: '攻击距离', base: stats.attackrange ?? 0 },
    ],
    spells: (data.spells ?? []).map((spell, index) => ({
      key: ['Q', 'W', 'E', 'R'][index] ?? String(index + 1),
      name: spell.name ?? '',
      description: stripMarkup(spell.description ?? ''),
      cooldown: spell.cooldownBurn ?? '',
      cost: spell.costBurn ?? '',
    })),
  };
  guideCache.set(championId, guide);
  return structuredClone(guide);
}

export async function lockAssistCurrentChampion(): Promise<AssistOperationResult> {
  const creds = getCachedCredentials();
  if (!creds) return { key: 'champion', success: false, message: '未连接英雄联盟客户端' };
  const client = new LcuClient(creds);
  try {
    const session = await client.get<ChampSelectSession>('/lol-champ-select/v1/session');
    const localCellId = Number(session.localPlayerCellId ?? -1);
    const player = session.myTeam?.find((item) => item.cellId === localCellId);
    const championId = Number(player?.championId || player?.championPickIntent || 0);
    const action = findLocalAction(session.actions ?? [], localCellId);
    if (!action || action.type !== 'pick' || !championId) {
      return { key: 'champion', success: false, message: '现在还不能锁定英雄' };
    }
    await client.patch(`/lol-champ-select/v1/session/actions/${action.id}`, {
      championId,
      type: 'pick',
      completed: true,
    });
    return { key: 'champion', success: true, message: '当前英雄已锁定' };
  } catch (error) {
    return {
      key: 'champion',
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
