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
// LCU 原始战绩响应 → 前端友好结构的字段映射。
// 移植自参考项目 my-app/src/main/playerAnalyzer/matchHistory.ts 的映射函数，
// 适配 lolhelp 的类型定义和 heroData 接口。
// ============================================================================

// LCU 原始 participant.stats 的字段（只声明用到的，其余忽略）
interface RawParticipantStats {
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  champLevel: number;
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
  visionScore: number;
  perk0: number;
  perkSubStyle: number;
  perkPrimaryStyle: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  largestKillingSpree: number;
  largestMultiKill: number;
  killParticipation?: number;
}

interface RawParticipant {
  championId: number;
  participantId: number;
  spell1Id: number;
  spell2Id: number;
  teamId: number;
  stats: RawParticipantStats;
  timeline?: { lane?: string; role?: string };
}

interface RawPlayerIdentity {
  participantId: number;
  player: {
    puuid?: string;
    gameName?: string;
    tagLine?: string;
    summonerName?: string;
    profileIcon?: number;
    currentPlatformId?: string;
  };
}

interface RawTeam {
  teamId: number;
  win: string;
  towerKills?: number;
  inhibitorKills?: number;
  baronKills?: number;
  dragonKills?: number;
  riftHeraldKills?: number;
  firstBlood?: boolean;
  firstTower?: boolean;
  bans?: unknown[];
}

interface RawMatchGame {
  gameId: number;
  queueId: number;
  gameCreation: number;
  gameDuration: number;
  gameMode?: string;
  participants: RawParticipant[];
  participantIdentities: RawPlayerIdentity[];
  teams?: RawTeam[];
}

// KDA 计算：(击杀+助攻)/max(1,死亡)
export function calcKda(kills: number, deaths: number, assists: number): number {
  return (kills + assists) / Math.max(1, deaths || 1);
}

// CS = 兵线 + 野怪
function calcCs(stats: RawParticipantStats): number {
  return (stats.totalMinionsKilled || 0) + (stats.neutralMinionsKilled || 0);
}

// 收集装备（item0~item6，跳过 0/空）
function collectItems(stats: RawParticipantStats): PlayerItemSummary[] {
  const slots = [stats.item0, stats.item1, stats.item2, stats.item3, stats.item4, stats.item5, stats.item6];
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

// 收集召唤师技能（D/F 槽，标记闪现）
function collectSpells(spell1Id: number, spell2Id: number): PlayerSpellSummary[] {
  const result: PlayerSpellSummary[] = [];
  for (const [id, slot] of [[spell1Id, 'D'], [spell2Id, 'F']] as const) {
    if (!id) continue;
    const meta = getSummonerSpellById(id);
    result.push({
      id,
      name: meta?.name ?? `技能${id}`,
      icon: meta?.icon ?? '',
      slot,
      isFlash: id === 4, // 闪现固定 ID=4
    });
  }
  return result;
}

// 收集符文（基石 perk0 + 副系 perkSubStyle）
function collectRunes(stats: RawParticipantStats): {
  primary: PlayerRuneSummary | null;
  secondary: PlayerRuneSummary | null;
} {
  let primary: PlayerRuneSummary | null = null;
  let secondary: PlayerRuneSummary | null = null;

  // 基石符文（perk0）。国服常为 0，则用主系 perkPrimaryStyle 兜底
  const keystoneId = stats.perk0;
  const primaryStyleId = stats.perkPrimaryStyle;
  const subStyleId = stats.perkSubStyle;

  if (keystoneId) {
    const meta = getRuneById(keystoneId);
    if (meta) primary = { id: keystoneId, name: meta.name, icon: meta.icon };
  } else if (primaryStyleId) {
    // 无基石，用主系代表
    const meta = getRuneById(primaryStyleId);
    if (meta) primary = { id: primaryStyleId, name: meta.name, icon: meta.icon };
  }

  if (subStyleId) {
    const meta = getRuneById(subStyleId);
    if (meta) secondary = { id: subStyleId, name: meta.name, icon: meta.icon };
  }

  return { primary, secondary };
}

// 生成召唤师头像 URL（profileIconId → ddragon）
function buildProfileIconUrl(profileIcon: number, version: string): string {
  if (!profileIcon) return '';
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${profileIcon}.png`;
}

// 把单个 participant 映射成 MatchParticipantSummary（含 ID→名字/图标）。
function mapParticipant(
  participant: RawParticipant,
  identity: RawPlayerIdentity | undefined,
  ddVersion: string,
): MatchParticipantSummary {
  const stats = participant.stats;
  const player = identity?.player ?? {};
  const hero = getHeroByKey(participant.championId);
  const items = collectItems(stats);
  const spells = collectSpells(participant.spell1Id, participant.spell2Id);
  const { primary, secondary } = collectRunes(stats);
  const riotId = player.gameName
    ? `${player.gameName}${player.tagLine ? '#' + player.tagLine : ''}`
    : player.summonerName ?? '';

  return {
    puuid: player.puuid ?? '',
    riotId,
    gameName: player.gameName ?? '',
    tagLine: player.tagLine ?? '',
    summonerName: player.summonerName ?? '',
    profileIconId: player.profileIcon ?? 0,
    profileIconUrl: buildProfileIconUrl(player.profileIcon ?? 0, ddVersion),
    teamId: participant.teamId,
    teamPosition: participant.timeline?.role ?? participant.timeline?.lane ?? '',
    championId: participant.championId,
    championName: hero?.name ?? `英雄${participant.championId}`,
    championAvatar: hero?.avatar ?? '',
    champLevel: stats.champLevel ?? 1,
    kills: stats.kills,
    deaths: stats.deaths,
    assists: stats.assists,
    kda: calcKda(stats.kills, stats.deaths, stats.assists),
    win: stats.win,
    damage: stats.totalDamageDealtToChampions,
    cs: calcCs(stats),
    gold: stats.goldEarned,
    items,
    spells,
    primaryRune: primary,
    secondaryRune: secondary,
    visionScore: stats.visionScore,
    largestMultiKill: stats.largestMultiKill,
  };
}

// 把 LCU 单局原始响应映射成 PlayerMatchDetail（10 人完整详情）。
// targetPuuid 用于标记"当前查询的玩家"，前端高亮用。
export function extractMatchDetail(
  game: RawMatchGame,
  targetPuuid: string,
  ddVersion: string,
): PlayerMatchDetail {
  const targetIdentity = game.participantIdentities.find((id) => id.player.puuid === targetPuuid);
  const targetParticipantId = targetIdentity?.participantId;
  const targetParticipant = game.participants.find((p) => p.participantId === targetParticipantId);

  const championId = targetParticipant?.championId ?? 0;
  const hero = getHeroByKey(championId);
  const stats = targetParticipant?.stats;

  const items = stats ? collectItems(stats) : [];
  const spells = targetParticipant
    ? collectSpells(targetParticipant.spell1Id, targetParticipant.spell2Id)
    : [];
  const { primary, secondary } = stats ? collectRunes(stats) : { primary: null, secondary: null };

  const participants = game.participants.map((p) => {
    const identity = game.participantIdentities.find((id) => id.participantId === p.participantId);
    return mapParticipant(p, identity, ddVersion);
  });

  return {
    gameId: game.gameId,
    queueId: game.queueId,
    queueName: getQueueName(game.queueId),
    gameCreation: game.gameCreation,
    gameDuration: game.gameDuration,
    championId,
    championName: hero?.name ?? `英雄${championId}`,
    championAvatar: hero?.avatar ?? '',
    champLevel: stats?.champLevel ?? 1,
    kills: stats?.kills ?? 0,
    deaths: stats?.deaths ?? 0,
    assists: stats?.assists ?? 0,
    kda: stats ? calcKda(stats.kills, stats.deaths, stats.assists) : 0,
    win: stats?.win ?? false,
    damage: stats?.totalDamageDealtToChampions ?? 0,
    cs: stats ? calcCs(stats) : 0,
    gold: stats?.goldEarned ?? 0,
    items,
    spells,
    flashKey: spells.find((s) => s.isFlash)?.slot ?? null,
    primaryRune: primary,
    secondaryRune: secondary,
    participants,
  };
}

// 从战绩列表计算汇总统计（胜负/平均KDA/伤害/CS）
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

// 导出原始类型供 matchService 使用
export type { RawMatchGame };
