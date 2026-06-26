import {
  getHeroByKey,
  getItemById,
  getSummonerSpellById,
  getRuneById,
  getAugmentById,
} from '../lcu/heroData';
import { buildProfileIcon } from '../lcu/gameData';
import { buildChampionSplashByAlias } from '../../shared/gameAssets';
import { getQueueName } from './queueNames';
import type {
  PlayerItemSummary,
  PlayerSpellSummary,
  PlayerRuneSummary,
  MatchParticipantStats,
  MatchParticipantSummary,
  PlayerMatchDetail,
  PlayerLookupSummary,
} from '../../shared/api';

// ============================================================================
// SGP 战绩响应 → 前端友好结构的字段映射。
//
// SGP（match-history-query/v1/.../SUMMARY）与 LCU 的关键区别：
// - 字段扁平在 participant 顶层（participant.kills），不是嵌套在 participant.stats
// - SUMMARY 一次返回完整 10 人 participants，无需单独请求详情
// - perks 是结构化对象（styles[].selections[].perk），大乱斗可能全 0
// - teams[].objectives 含龙/塔/男爵等团队统计
// ============================================================================

// SGP 原始 participant（字段扁平，只声明用到的）
interface SgpParticipant {
  [key: string]: unknown;
  puuid: string;
  riotIdGameName: string;
  riotIdTagline: string;
  summonerName: string;
  summonerLevel: number;
  profileIcon: number;
  championId: number;
  championName: string;
  championSkinId?: number;
  skinId?: number;
  skinVariant?: number | string;
  champLevel: number;
  teamId: number;
  teamPosition: string;
  premadeId?: string | number;
  premadeTeamId?: string | number;
  premadeGroupId?: string | number;
  partyId?: string | number;
  playerSubteamId?: string | number;
  groupId?: string | number;
  role: string;
  lane: string;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  totalDamageDealtToChampions: number;
  physicalDamageDealtToChampions?: number;
  magicDamageDealtToChampions?: number;
  trueDamageDealtToChampions?: number;
  totalDamageDealt?: number;
  physicalDamageDealt?: number;
  magicDamageDealt?: number;
  trueDamageDealt?: number;
  totalDamageTaken?: number;
  physicalDamageTaken?: number;
  magicDamageTaken?: number;
  trueDamageTaken?: number;
  damageSelfMitigated?: number;
  totalHeal?: number;
  totalHealsOnTeammates?: number;
  totalDamageShieldedOnTeammates?: number;
  goldSpent?: number;
  wardsKilled?: number;
  detectorWardsPlaced?: number;
  timeCCingOthers?: number;
  largestCriticalStrike?: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  spell1Id: number;
  spell2Id: number;
  visionScore: number;
  wardsPlaced: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  largestMultiKill: number;
  largestKillingSpree: number;
  // challenges 字段（SGP 在 participant.challenges 下，扁平字段在顶层声明用到的）
  challenges?: {
    teamDamagePercentage?: number; // 伤害占团队比例（0~1）
    [k: string]: unknown;
  };
  perks?: {
    styles?: Array<{
      description: string;
      style: number;
      selections?: Array<{ perk: number }>;
    }>;
  };
}

interface SgpTeam {
  teamId: number;
  win: string;
  objectives?: Record<string, { first: boolean; kills: number }>;
}

interface SgpGameJson {
  gameId: number;
  queueId: number;
  gameCreation: number;
  gameDuration: number;
  gameMode?: string;
  participants: SgpParticipant[];
  teams?: SgpTeam[];
}

interface SgpGame {
  metadata: {
    match_id: string;
    participants: string[];
    tags?: string[];
  };
  json: SgpGameJson;
}

// KDA 计算
export function calcKda(kills: number, deaths: number, assists: number): number {
  return (kills + assists) / Math.max(1, deaths || 1);
}

function calcCs(p: SgpParticipant): number {
  return (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0);
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildParticipantStats(p?: Partial<SgpParticipant>): MatchParticipantStats {
  const value = (key: string) => toNumber(p?.[key]);
  return {
    totalDamageDealtToChampions: value('totalDamageDealtToChampions'),
    physicalDamageDealtToChampions: value('physicalDamageDealtToChampions'),
    magicDamageDealtToChampions: value('magicDamageDealtToChampions'),
    trueDamageDealtToChampions: value('trueDamageDealtToChampions'),
    totalDamageDealt: value('totalDamageDealt'),
    physicalDamageDealt: value('physicalDamageDealt'),
    magicDamageDealt: value('magicDamageDealt'),
    trueDamageDealt: value('trueDamageDealt'),
    totalDamageTaken: value('totalDamageTaken'),
    physicalDamageTaken: value('physicalDamageTaken'),
    magicDamageTaken: value('magicDamageTaken'),
    trueDamageTaken: value('trueDamageTaken'),
    damageSelfMitigated: value('damageSelfMitigated'),
    totalHeal: value('totalHeal'),
    totalHealsOnTeammates: value('totalHealsOnTeammates'),
    totalDamageShieldedOnTeammates: value('totalDamageShieldedOnTeammates'),
    goldEarned: value('goldEarned'),
    goldSpent: value('goldSpent'),
    totalMinionsKilled: value('totalMinionsKilled'),
    neutralMinionsKilled: value('neutralMinionsKilled'),
    visionScore: value('visionScore'),
    wardsPlaced: value('wardsPlaced'),
    wardsKilled: value('wardsKilled'),
    detectorWardsPlaced: value('detectorWardsPlaced'),
    timeCCingOthers: value('timeCCingOthers'),
    largestCriticalStrike: value('largestCriticalStrike'),
    largestMultiKill: value('largestMultiKill'),
    largestKillingSpree: value('largestKillingSpree'),
    doubleKills: value('doubleKills'),
    tripleKills: value('tripleKills'),
    quadraKills: value('quadraKills'),
    pentaKills: value('pentaKills'),
  };
}

function normalizePremadeId(p: SgpParticipant): string | undefined {
  const raw =
    p.premadeId ??
    p.premadeTeamId ??
    p.premadeGroupId ??
    p.partyId ??
    p.playerSubteamId ??
    p.groupId;
  const value = String(raw ?? '').trim();
  if (!value || value === '0' || value === 'NaN' || value === '-1') return undefined;
  return value;
}

// 收集装备（item0~item6）
function collectItems(p: SgpParticipant): PlayerItemSummary[] {
  const slots = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6];
  const items: PlayerItemSummary[] = [];
  for (let slot = 0; slot < slots.length; slot++) {
    const id = slots[slot];
    if (!id) continue;
    const meta = getItemById(id);
    items.push({
      id,
      name: meta?.name ?? `物品${id}`,
      icon: meta?.icon ?? '',
      slot,
    });
  }
  return items;
}

// 收集召唤师技能
function collectSpells(p: SgpParticipant): PlayerSpellSummary[] {
  const result: PlayerSpellSummary[] = [];
  for (const [id, slot] of [[p.spell1Id, 'D'], [p.spell2Id, 'F']] as const) {
    if (!id) continue;
    const meta = getSummonerSpellById(id);
    result.push({
      id,
      name: meta?.name ?? `技能${id}`,
      icon: meta?.icon ?? '',
      slot,
      isFlash: id === 4,
    });
  }
  return result;
}

// 收集符文（SGP perks.styles，主系基石 + 副系）
function collectRunes(p: SgpParticipant): {
  primary: PlayerRuneSummary | null;
  secondary: PlayerRuneSummary | null;
  all: PlayerRuneSummary[];
} {
  let primary: PlayerRuneSummary | null = null;
  let secondary: PlayerRuneSummary | null = null;
  const all: PlayerRuneSummary[] = [];
  const seen = new Set<number>();

  const makeRune = (id: number): PlayerRuneSummary | null => {
    if (!id) return null;
    const meta = getRuneById(id);
    return meta ? { id, name: meta.name, icon: meta.icon } : null;
  };

  const pushRune = (rune: PlayerRuneSummary | null): void => {
    if (!rune || seen.has(rune.id)) return;
    seen.add(rune.id);
    all.push(rune);
  };

  const styles = p.perks?.styles ?? [];
  for (const style of styles) {
    for (const selection of style.selections ?? []) {
      pushRune(makeRune(selection.perk));
    }
    // primaryStyle 的第一个 selection 是基石符文
    if (style.description === 'primaryStyle') {
      const keystoneId = style.selections?.[0]?.perk ?? style.style;
      if (keystoneId) {
        primary = makeRune(keystoneId) ?? makeRune(style.style);
      }
    } else if (style.description === 'subStyle') {
      // 副系：用第一个具体符文 perk（style 是系别ID如8300=启迪，不在datas.json里）
      const subPerkId = style.selections?.[0]?.perk ?? style.style;
      if (subPerkId) {
        secondary = makeRune(subPerkId) ?? makeRune(style.style);
      }
    }
  }

  if (all.length === 0) {
    pushRune(primary);
    pushRune(secondary);
  }

  return { primary, secondary, all };
}

function collectAugments(p: SgpParticipant): PlayerRuneSummary[] {
  const ids: number[] = [];
  const seen = new Set<number>();

  const pushId = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(pushId);
      return;
    }
    if (value && typeof value === 'object') {
      const objectValue = value as Record<string, unknown>;
      pushId(objectValue.id ?? objectValue.augmentId ?? objectValue.perkId);
      return;
    }
    const id = Number(value ?? 0);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };

  for (const [key, value] of Object.entries(p)) {
    if (!/(augment|cherry)/i.test(key)) continue;
    pushId(value);
  }

  return ids
    .map((id) => {
      const meta = getAugmentById(id);
      return meta ? { id, name: meta.name, icon: meta.icon } : null;
    })
    .filter((augment): augment is PlayerRuneSummary => Boolean(augment));
}

// 映射单个 participant
function mapParticipant(p: SgpParticipant): MatchParticipantSummary {
  const hero = getHeroByKey(p.championId);
  const championSplashUrl = buildChampionSplashByAlias(
    hero?.alias ?? '',
    p.championId,
    p.skinVariant ?? p.championSkinId ?? p.skinId,
    1,
  );
  const items = collectItems(p);
  const spells = collectSpells(p);
  const { primary, secondary, all: runes } = collectRunes(p);
  const augments = collectAugments(p);
  const stats = buildParticipantStats(p);
  const riotId = p.riotIdGameName
    ? `${p.riotIdGameName}${p.riotIdTagline ? '#' + p.riotIdTagline : ''}`
    : p.summonerName ?? '';

  return {
    puuid: p.puuid ?? '',
    riotId,
    gameName: p.riotIdGameName ?? '',
    tagLine: p.riotIdTagline ?? '',
    summonerName: p.summonerName ?? '',
    profileIconId: p.profileIcon ?? 0,
    profileIconUrl: p.profileIcon ? buildProfileIcon(p.profileIcon) : '',
    teamId: p.teamId,
    teamPosition: p.teamPosition || p.role || p.lane || '',
    premadeId: normalizePremadeId(p),
    championId: p.championId,
    championName: p.championName || hero?.name || `英雄${p.championId}`,
    championAvatar: hero?.avatar ?? '',
    championSplashUrl,
    champLevel: p.champLevel ?? 1,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    kda: calcKda(p.kills, p.deaths, p.assists),
    win: p.win,
    damage: stats.totalDamageDealtToChampions,
    cs: stats.totalMinionsKilled + stats.neutralMinionsKilled,
    gold: stats.goldEarned,
    items,
    spells,
    primaryRune: primary,
    secondaryRune: secondary,
    runes,
    augments,
    stats,
    visionScore: stats.visionScore,
    largestMultiKill: stats.largestMultiKill,
    largestKillingSpree: stats.largestKillingSpree,
    tripleKills: stats.tripleKills,
    quadraKills: stats.quadraKills,
    pentaKills: stats.pentaKills,
    teamDamagePercentage: p.challenges?.teamDamagePercentage,
  };
}

// 把 SGP 单场映射成 PlayerMatchDetail（含 10 人完整详情）。
// targetPuuid 用于标记当前查询的玩家。
export function extractMatchDetail(game: SgpGame, targetPuuid: string): PlayerMatchDetail {
  const json = game.json;
  const targetP = json.participants.find((p) => p.puuid === targetPuuid);
  const hero = targetP ? getHeroByKey(targetP.championId) : null;
  const championSplashUrl = targetP
    ? buildChampionSplashByAlias(
        hero?.alias ?? '',
        targetP.championId,
        targetP.skinVariant ?? targetP.championSkinId ?? targetP.skinId,
        1,
      )
    : '';

  const participants = json.participants.map((p) => mapParticipant(p));

  const target = targetP ?? json.participants[0];
  const items = target ? collectItems(target) : [];
  const spells = target ? collectSpells(target) : [];
  const { primary, secondary, all: runes } = target
    ? collectRunes(target)
    : { primary: null, secondary: null, all: [] };
  const augments = target ? collectAugments(target) : [];
  const stats = buildParticipantStats(target);

  return {
    gameId: json.gameId,
    queueId: json.queueId,
    queueName: getQueueName(json.queueId),
    gameCreation: json.gameCreation,
    gameDuration: json.gameDuration,
    championId: target?.championId ?? 0,
    championName: target?.championName || hero?.name || '',
    championAvatar: hero?.avatar ?? '',
    championSplashUrl,
    champLevel: target?.champLevel ?? 1,
    kills: target?.kills ?? 0,
    deaths: target?.deaths ?? 0,
    assists: target?.assists ?? 0,
    kda: target ? calcKda(target.kills, target.deaths, target.assists) : 0,
    win: target?.win ?? false,
    damage: stats.totalDamageDealtToChampions,
    cs: target ? calcCs(target) : 0,
    gold: stats.goldEarned,
    items,
    spells,
    flashKey: spells.find((s) => s.isFlash)?.slot ?? null,
    primaryRune: primary,
    secondaryRune: secondary,
    runes,
    augments,
    stats,
    participants,
    tripleKills: stats.tripleKills,
    quadraKills: stats.quadraKills,
    pentaKills: stats.pentaKills,
    largestKillingSpree: stats.largestKillingSpree,
  };
}

// 汇总统计
export function buildLookupSummary(matches: PlayerMatchDetail[]): PlayerLookupSummary {
  if (matches.length === 0) {
    return { wins: 0, losses: 0, averageKda: 0, averageDamage: 0, averageCs: 0 };
  }
  let wins = 0;
  let kdaSum = 0;
  let dmgSum = 0;
  let csSum = 0;
  for (const m of matches) {
    if (m.win) wins++;
    kdaSum += m.kda;
    dmgSum += m.damage;
    csSum += m.cs;
  }
  const n = matches.length;
  return {
    wins,
    losses: n - wins,
    averageKda: Math.round((kdaSum / n) * 100) / 100,
    averageDamage: Math.round(dmgSum / n),
    averageCs: Math.round(csSum / n),
  };
}

export type { SgpGame, SgpGameJson, SgpParticipant };
