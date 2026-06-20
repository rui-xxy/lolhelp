import {
  getHeroByKey,
  getItemById,
  getSummonerSpellById,
  getRuneById,
} from '../lcu/heroData';
import { getQueueName } from './queueNames';
import type {
  PlayerItemSummary,
  PlayerSpellSummary,
  PlayerRuneSummary,
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
  puuid: string;
  riotIdGameName: string;
  riotIdTagline: string;
  summonerName: string;
  summonerLevel: number;
  profileIcon: number;
  championId: number;
  championName: string;
  champLevel: number;
  teamId: number;
  teamPosition: string;
  role: string;
  lane: string;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  totalDamageDealtToChampions: number;
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
} {
  let primary: PlayerRuneSummary | null = null;
  let secondary: PlayerRuneSummary | null = null;

  const styles = p.perks?.styles ?? [];
  for (const style of styles) {
    // primaryStyle 的第一个 selection 是基石符文
    if (style.description === 'primaryStyle') {
      const keystoneId = style.selections?.[0]?.perk ?? style.style;
      if (keystoneId) {
        const meta = getRuneById(keystoneId) ?? getRuneById(style.style);
        if (meta) primary = { id: keystoneId, name: meta.name, icon: meta.icon };
      }
    } else if (style.description === 'subStyle') {
      if (style.style) {
        const meta = getRuneById(style.style);
        if (meta) secondary = { id: style.style, name: meta.name, icon: meta.icon };
      }
    }
  }

  return { primary, secondary };
}

// 映射单个 participant
function mapParticipant(p: SgpParticipant, ddVersion: string): MatchParticipantSummary {
  const hero = getHeroByKey(p.championId);
  const items = collectItems(p);
  const spells = collectSpells(p);
  const { primary, secondary } = collectRunes(p);
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
    profileIconUrl: p.profileIcon
      ? `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/profileicon/${p.profileIcon}.png`
      : '',
    teamId: p.teamId,
    teamPosition: p.teamPosition || p.role || p.lane || '',
    championId: p.championId,
    championName: p.championName || hero?.name || `英雄${p.championId}`,
    championAvatar: hero?.avatar ?? '',
    champLevel: p.champLevel ?? 1,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    kda: calcKda(p.kills, p.deaths, p.assists),
    win: p.win,
    damage: p.totalDamageDealtToChampions,
    cs: calcCs(p),
    gold: p.goldEarned,
    items,
    spells,
    primaryRune: primary,
    secondaryRune: secondary,
    visionScore: p.visionScore,
    largestMultiKill: p.largestMultiKill,
    largestKillingSpree: p.largestKillingSpree,
  };
}

// 把 SGP 单场映射成 PlayerMatchDetail（含 10 人完整详情）。
// targetPuuid 用于标记当前查询的玩家。
export function extractMatchDetail(game: SgpGame, targetPuuid: string, ddVersion: string): PlayerMatchDetail {
  const json = game.json;
  const targetP = json.participants.find((p) => p.puuid === targetPuuid);
  const hero = targetP ? getHeroByKey(targetP.championId) : null;

  const participants = json.participants.map((p) => mapParticipant(p, ddVersion));

  const target = targetP ?? json.participants[0];
  const items = target ? collectItems(target) : [];
  const spells = target ? collectSpells(target) : [];
  const { primary, secondary } = target ? collectRunes(target) : { primary: null, secondary: null };

  return {
    gameId: json.gameId,
    queueId: json.queueId,
    queueName: getQueueName(json.queueId),
    gameCreation: json.gameCreation,
    gameDuration: json.gameDuration,
    championId: target?.championId ?? 0,
    championName: target?.championName || hero?.name || '',
    championAvatar: hero?.avatar ?? '',
    champLevel: target?.champLevel ?? 1,
    kills: target?.kills ?? 0,
    deaths: target?.deaths ?? 0,
    assists: target?.assists ?? 0,
    kda: target ? calcKda(target.kills, target.deaths, target.assists) : 0,
    win: target?.win ?? false,
    damage: target?.totalDamageDealtToChampions ?? 0,
    cs: target ? calcCs(target) : 0,
    gold: target?.goldEarned ?? 0,
    items,
    spells,
    flashKey: spells.find((s) => s.isFlash)?.slot ?? null,
    primaryRune: primary,
    secondaryRune: secondary,
    participants,
    tripleKills: target?.tripleKills ?? 0,
    quadraKills: target?.quadraKills ?? 0,
    pentaKills: target?.pentaKills ?? 0,
    largestKillingSpree: target?.largestKillingSpree ?? 0,
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
