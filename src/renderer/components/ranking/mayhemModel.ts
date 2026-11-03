import type {
  LiveBattleInfo,
  MayhemAugmentRankingEntry,
  MayhemBalanceModifier,
  MayhemChampionBuild,
  MayhemChampionEntry,
  MayhemChampionTier,
} from '../../../shared/api';

// 海克斯大乱斗页的解读层：纯函数，组件只负责展示。

export const CHAMPION_TIER_ORDER: MayhemChampionTier[] = ['S+', 'S', 'A', 'B', 'C', 'D'];

export const CHAMPION_TIER_COPY: Record<MayhemChampionTier, string> = {
  'S+': '神级',
  S: '强势',
  A: '优秀',
  B: '均衡',
  C: '偏弱',
  D: '艰难',
};

export const RARITY_COPY = {
  prismatic: '棱彩',
  gold: '金色',
  silver: '银色',
} as const;

// 「承受伤害 -5%」是加强，「造成伤害 -5%」是削弱：数值方向不等于好坏。
export function balanceIsBuff(modifier: MayhemBalanceModifier): boolean | null {
  if (modifier.direction === 'neutral') return null;
  const up = modifier.direction === 'up';
  return /承受|受到/.test(modifier.label) ? !up : up;
}

// 强化等级打分：S+ > S > S- > A+ > A …，用于三选一时排序。
export function augmentTierScore(tier: string | null | undefined): number {
  if (!tier) return 0;
  const base: Record<string, number> = { S: 50, A: 40, B: 30, C: 20, D: 10 };
  const letter = tier.slice(0, 1).toUpperCase();
  const modifier = tier.slice(1);
  return (base[letter] ?? 0) + (modifier === '+' ? 3 : modifier === '-' ? -3 : 0);
}

export interface AugmentComparison {
  augment: MayhemAugmentRankingEntry;
  score: number;
  // 当前英雄出装页里给这个强化的等级（S · #4 那种），没有就是 null
  championTier: string | null;
  championRank: number | null;
  reason: string;
}

// 游戏里刷出三个强化时的建议：有英雄数据时优先看「对这个英雄」的等级，
// 否则看全体总榜等级，再用登场率打破平局。
export function compareAugments(
  candidates: MayhemAugmentRankingEntry[],
  build: MayhemChampionBuild | null,
): AugmentComparison[] {
  const forChampion = new Map((build?.augments ?? []).map((augment) => [augment.slug, augment]));
  const rows = candidates.map((augment) => {
    const specific = forChampion.get(augment.slug);
    const championTier = specific?.tier || null;
    const score = specific
      ? 100 + augmentTierScore(championTier) + (specific.pickRate ?? 0) / 100
      : augmentTierScore(augment.tier) + (augment.pickRate ?? 0) / 1000;
    let reason: string;
    if (specific && build) {
      reason = `${build.title || build.name}的${RARITY_COPY[specific.rarity]}强化里排第 ${specific.rarityRank ?? '?'}（${championTier ?? '—'}）`;
    } else if (augment.tier) {
      reason = `总榜 ${augment.tier} 级 · 第 ${augment.rank} 名`;
    } else {
      reason = `总榜第 ${augment.rank} 名`;
    }
    return { augment, score, championTier, championRank: specific?.rarityRank ?? null, reason };
  });
  return rows.sort((a, b) => b.score - a.score);
}

const MAYHEM_PHASES = new Set(['ChampSelect', 'GameStart', 'InProgress', 'Reconnect']);

export interface LiveMayhemTeam {
  phase: string;
  myChampionId: number | null;
  championIds: number[];
}

// 正在海克斯大乱斗的选人或对局中：返回我方英雄，用来在页面上直接给出攻略。
export function liveMayhemTeam(battle: LiveBattleInfo | null): LiveMayhemTeam | null {
  if (!battle || !MAYHEM_PHASES.has(battle.phase)) return null;
  const label = `${battle.queueName} ${battle.mapName ?? ''}`;
  if (!/大乱斗|嚎哭深渊|ARAM|Mayhem/i.test(label)) return null;
  const championIds = battle.myTeam.map((player) => player.championId).filter((id) => id > 0);
  if (!championIds.length) return null;
  const me = battle.myTeam.find((player) => player.puuid && player.puuid === battle.myPuuid);
  return { phase: battle.phase, myChampionId: me?.championId || null, championIds };
}

export function championForId(entries: MayhemChampionEntry[], id: number): MayhemChampionEntry | null {
  return id > 0 ? entries.find((entry) => entry.id === id) ?? null : null;
}

// 同等级内按名次；搜索时同时匹配称号、真名、英文 key。
export function matchesChampion(entry: MayhemChampionEntry, keyword: string): boolean {
  if (!keyword) return true;
  return `${entry.name} ${entry.title} ${entry.alias} ${entry.slug}`.toLocaleLowerCase().includes(keyword);
}

export function augmentEffectMap(entries: MayhemAugmentRankingEntry[]): Map<string, string> {
  return new Map(entries.filter((entry) => entry.effect).map((entry) => [entry.slug, entry.effect]));
}

export function percent(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)}%`;
}

export function tierToken(tier: string): string {
  if (tier === 'S+') return 'splus';
  return (tier.slice(0, 1).toLowerCase() || 'd');
}
