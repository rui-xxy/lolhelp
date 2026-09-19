import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { ArrowLeftRight, ChevronLeft, ChevronRight, CirclePlay, Coins, Database, Download, Eye, Flame, HeartPulse, History, Layers3, LoaderCircle, Map as MapIcon, Radio, RotateCcw, Search, Shield, Skull, Swords, Users, X } from 'lucide-react';
import { GameIcon } from './GameIcon';
import { DamageEnergyBar } from './DamageEnergyBar';
import { RankEmblem } from '../RankEmblem';
import { MATCH_TEAM_COLORS, MATCH_TIMELINE_COLORS } from '../../styles/palette';
import badgeLegendary from '../../assets/match-badges/legendary.png';
import badgeMaxAssist from '../../assets/match-badges/max-assist.png';
import badgeMaxDamage from '../../assets/match-badges/max-damage.png';
import badgeMaxDeaths from '../../assets/match-badges/max-deaths.png';
import badgeMaxGold from '../../assets/match-badges/max-gold.png';
import badgeMaxHeal from '../../assets/match-badges/max-heal.png';
import badgeMaxKill from '../../assets/match-badges/max-kill.png';
import badgeMaxTaken from '../../assets/match-badges/max-taken.png';
import badgeMvp from '../../assets/match-badges/mvp.png';
import badgePenta from '../../assets/match-badges/penta.png';
import badgeQuadra from '../../assets/match-badges/quadra.png';
import badgeSvp from '../../assets/match-badges/svp.png';
import badgeTriple from '../../assets/match-badges/triple.png';
import type {
  AssistChampionGuide,
  MatchParticipantStats,
  MatchParticipantSummary,
  MatchTimeline,
  MatchTimelineDamageRecord,
  MatchTimelineEvent,
  MatchTimelineResult,
  PlayerMatchDetail,
  PlayerRankSummary,
  PlayerRuneSummary,
  ReplayAvailability,
  ReplayAvailabilityRequest,
} from '../../../shared/api';
import type { RecurringMate } from './MatchList';

type DetailTab = 'overview' | 'details' | 'events' | 'builds' | 'timeline';
type LinkTone = 'amber' | 'cyan' | 'violet' | 'rose' | 'emerald';

interface MatchDetailProps {
  match: PlayerMatchDetail;
  targetPuuid: string;
  region?: string;
  recurringMates?: Map<string, RecurringMate>;
  onPlayerSearch?: (riotId: string) => void;
}

interface StatsMetric {
  key: string;
  label: string;
  value?: (participant: MatchParticipantSummary) => number;
  text?: (participant: MatchParticipantSummary) => string;
  rawKey?: string;
  kind?: 'number' | 'decimal' | 'percent' | 'duration' | 'boolean';
  description?: string;
}

interface StatsGroup {
  title: string;
  metrics: StatsMetric[];
}

const DETAIL_TABS: Array<{ key: DetailTab; label: string }> = [
  { key: 'overview', label: '总览' },
  { key: 'details', label: '详尽表格' },
  { key: 'events', label: '事件' },
  { key: 'builds', label: '构建' },
  { key: 'timeline', label: '时间线' },
];

const STATS_GROUPS: StatsGroup[] = [
  {
    title: '战斗',
    metrics: [
      { key: 'kda', label: '战损比', text: (p) => `${p.kills}/${p.deaths}/${p.assists}` },
      { key: 'largestKillingSpree', label: '最高连杀', value: (p) => stat(p, 'largestKillingSpree') },
      { key: 'largestMultiKill', label: '最高多杀', value: (p) => stat(p, 'largestMultiKill') },
      { key: 'timeCCingOthers', label: '控制得分', value: (p) => stat(p, 'timeCCingOthers') },
      {
        key: 'firstBlood',
        label: '三杀 / 四杀 / 五杀',
        text: (p) => `${stat(p, 'tripleKills')}/${stat(p, 'quadraKills')}/${stat(p, 'pentaKills')}`,
      },
    ],
  },
  {
    title: '造成伤害',
    metrics: [
      { key: 'championDamage', label: '对英雄的伤害总和', value: (p) => p.damage },
      {
        key: 'physicalChampionDamage',
        label: '对英雄的物理伤害',
        value: (p) => stat(p, 'physicalDamageDealtToChampions'),
      },
      {
        key: 'magicChampionDamage',
        label: '对英雄的魔法伤害',
        value: (p) => stat(p, 'magicDamageDealtToChampions'),
      },
      {
        key: 'trueChampionDamage',
        label: '对英雄的真实伤害',
        value: (p) => stat(p, 'trueDamageDealtToChampions'),
      },
      { key: 'totalDamage', label: '造成的伤害总和', value: (p) => stat(p, 'totalDamageDealt') },
      { key: 'physicalDamage', label: '造成的物理伤害', value: (p) => stat(p, 'physicalDamageDealt') },
      { key: 'magicDamage', label: '造成的魔法伤害', value: (p) => stat(p, 'magicDamageDealt') },
      { key: 'trueDamage', label: '造成的真实伤害', value: (p) => stat(p, 'trueDamageDealt') },
      { key: 'largestCrit', label: '最大暴击伤害', value: (p) => stat(p, 'largestCriticalStrike') },
    ],
  },
  {
    title: '承受与资源',
    metrics: [
      { key: 'totalTaken', label: '承受伤害', value: (p) => stat(p, 'totalDamageTaken') },
      { key: 'physicalTaken', label: '承受物理伤害', value: (p) => stat(p, 'physicalDamageTaken') },
      { key: 'magicTaken', label: '承受魔法伤害', value: (p) => stat(p, 'magicDamageTaken') },
      { key: 'trueTaken', label: '承受真实伤害', value: (p) => stat(p, 'trueDamageTaken') },
      { key: 'mitigated', label: '自我缓和的伤害', value: (p) => stat(p, 'damageSelfMitigated') },
      { key: 'heal', label: '输出治疗效果', value: (p) => stat(p, 'totalHeal') },
      {
        key: 'shield',
        label: '给予队友护盾',
        value: (p) => stat(p, 'totalDamageShieldedOnTeammates'),
      },
      { key: 'gold', label: '获得金币', value: (p) => p.gold },
      { key: 'goldSpent', label: '花费金币', value: (p) => stat(p, 'goldSpent') },
      { key: 'cs', label: '补刀', value: (p) => p.cs },
    ],
  },
  {
    title: '视野',
    metrics: [
      { key: 'visionScore', label: '视野得分', value: (p) => stat(p, 'visionScore') },
      { key: 'wardsPlaced', label: '放置守卫', value: (p) => stat(p, 'wardsPlaced') },
      { key: 'wardsKilled', label: '击杀守卫', value: (p) => stat(p, 'wardsKilled') },
      { key: 'detectorWardsPlaced', label: '控制守卫', value: (p) => stat(p, 'detectorWardsPlaced') },
    ],
  },
];

function rawMetric(
  rawKey: string,
  label: string,
  kind: StatsMetric['kind'] = 'number',
  description?: string,
): StatsMetric {
  return { key: `raw-${rawKey}`, rawKey, label, kind, description: description || label };
}

const AKARI_EXTRA_STATS_GROUPS: StatsGroup[] = [
  {
    title: '击杀与生存',
    metrics: [
      rawMetric('kills', '击杀'), rawMetric('deaths', '死亡'), rawMetric('assists', '助攻'),
      rawMetric('doubleKills', '双杀'), rawMetric('tripleKills', '三杀'), rawMetric('quadraKills', '四杀'),
      rawMetric('pentaKills', '五杀'), rawMetric('unrealKills', '超神'),
      rawMetric('killingSprees', '连杀次数'), rawMetric('largestKillingSpree', '最大连杀'),
      rawMetric('largestMultiKill', '最大多杀'), rawMetric('longestTimeSpentLiving', '最长存活时间', 'duration'),
      rawMetric('totalTimeSpentDead', '总死亡时间', 'duration'), rawMetric('firstBloodKill', '一血击杀', 'boolean'),
      rawMetric('firstBloodAssist', '一血助攻', 'boolean'), rawMetric('bountyLevel', '结束时赏金等级'),
    ],
  },
  {
    title: '伤害、治疗与控制',
    metrics: [
      rawMetric('damageDealtToBuildings', '对建筑伤害'), rawMetric('damageDealtToObjectives', '对史诗野怪伤害'),
      rawMetric('damageDealtToTurrets', '对防御塔伤害'), rawMetric('totalTimeCCDealt', '造成控制总时长', 'duration'),
      rawMetric('totalUnitsHealed', '治疗单位数'), rawMetric('totalHealsOnTeammates', '对队友治疗量'),
      rawMetric('totalDamageShieldedOnTeammates', '给予队友护盾量'),
      rawMetric('teamDamagePercentage', '团队伤害占比', 'percent'),
      rawMetric('damagePerMinute', '每分钟英雄伤害', 'decimal'),
      rawMetric('damageTakenOnTeamPercentage', '团队承伤占比', 'percent'),
      rawMetric('effectiveHealAndShielding', '有效治疗与护盾'),
      rawMetric('largestCriticalStrike', '最大暴击伤害'),
    ],
  },
  {
    title: '经济与发育',
    metrics: [
      rawMetric('champExperience', '获得经验'), rawMetric('goldPerMinute', '每分钟金币', 'decimal'),
      rawMetric('totalMinionsKilled', '线上补刀'), rawMetric('neutralMinionsKilled', '野怪补刀'),
      rawMetric('totalAllyJungleMinionsKilled', '己方野区补刀'), rawMetric('totalEnemyJungleMinionsKilled', '敌方野区补刀'),
      rawMetric('itemsPurchased', '购买装备次数'), rawMetric('consumablesPurchased', '购买消耗品次数'),
      rawMetric('visionWardsBoughtInGame', '购买控制守卫'), rawMetric('sightWardsBoughtInGame', '购买侦查守卫'),
      rawMetric('turretPlatesTaken', '获得镀层'), rawMetric('skillshotsHit', '技能命中'),
      rawMetric('skillshotsDodged', '躲避技能'),
    ],
  },
  {
    title: '地图资源与推进',
    metrics: [
      rawMetric('baronKills', '参与击杀男爵'), rawMetric('dragonKills', '参与击杀小龙'),
      rawMetric('objectivesStolen', '抢夺史诗野怪'), rawMetric('objectivesStolenAssists', '协助抢夺史诗野怪'),
      rawMetric('turretKills', '摧毁防御塔'), rawMetric('turretTakedowns', '参与摧毁防御塔'),
      rawMetric('turretsLost', '损失防御塔'), rawMetric('inhibitorKills', '摧毁召唤水晶'),
      rawMetric('inhibitorTakedowns', '参与摧毁召唤水晶'), rawMetric('inhibitorsLost', '损失召唤水晶'),
      rawMetric('nexusKills', '摧毁基地'), rawMetric('nexusTakedowns', '参与摧毁基地'),
      rawMetric('nexusLost', '基地被摧毁'), rawMetric('firstTowerKill', '一塔击杀', 'boolean'),
      rawMetric('firstTowerAssist', '一塔助攻', 'boolean'),
    ],
  },
  {
    title: '信号与对局状态',
    metrics: [
      rawMetric('allInPings', '全力进攻信号'), rawMetric('assistMePings', '请求协助信号'),
      rawMetric('baitPings', '引诱信号'), rawMetric('basicPings', '基础信号'),
      rawMetric('commandPings', '指令信号'), rawMetric('dangerPings', '危险信号'),
      rawMetric('enemyMissingPings', '敌人消失信号'), rawMetric('enemyVisionPings', '敌方视野信号'),
      rawMetric('getBackPings', '撤退信号'), rawMetric('holdPings', '坚持信号'),
      rawMetric('needVisionPings', '需要视野信号'), rawMetric('onMyWayPings', '正在路上信号'),
      rawMetric('pushPings', '推进信号'), rawMetric('visionClearedPings', '视野已清除信号'),
      rawMetric('gameEndedInEarlySurrender', '重开投降', 'boolean'),
      rawMetric('gameEndedInSurrender', '游戏以投降结束', 'boolean'),
      rawMetric('teamEarlySurrendered', '队伍提前投降', 'boolean'),
      rawMetric('eligibleForProgression', '可获得结算进度', 'boolean'),
    ],
  },
];

const RAW_STATS_EXCLUDED = new Set([
  'participantId', 'teamId', 'championId', 'championName', 'championTransform', 'champLevel',
  'profileIcon', 'puuid', 'riotIdGameName', 'riotIdName', 'riotIdTagline', 'summonerId',
  'summonerName', 'summonerLevel', 'role', 'lane', 'teamPosition', 'individualPosition',
  'spell1Id', 'spell2Id', 'summoner1Id', 'summoner2Id', 'skinId', 'championSkinId', 'skinVariant',
  'premadeId', 'premadeTeamId', 'premadeGroupId', 'partyId', 'playerSubteamId', 'groupId',
  'win', 'gameId', 'gameCreation', 'gameDuration', 'gameEndedInEarlySurrender',
  'gameEndedInSurrender', 'teamEarlySurrendered', 'eligibleForProgression',
  'kills', 'deaths', 'assists', 'doubleKills', 'tripleKills', 'quadraKills', 'pentaKills',
  'largestKillingSpree', 'largestMultiKill', 'largestCriticalStrike', 'totalDamageDealtToChampions',
  'physicalDamageDealtToChampions', 'magicDamageDealtToChampions', 'trueDamageDealtToChampions',
  'totalDamageDealt', 'physicalDamageDealt', 'magicDamageDealt', 'trueDamageDealt',
  'totalDamageTaken', 'physicalDamageTaken', 'magicDamageTaken', 'trueDamageTaken',
  'damageSelfMitigated', 'totalHeal', 'totalHealsOnTeammates', 'totalDamageShieldedOnTeammates',
  'goldEarned', 'goldSpent', 'totalMinionsKilled', 'neutralMinionsKilled', 'visionScore',
  'wardsPlaced', 'wardsKilled', 'detectorWardsPlaced', 'timeCCingOthers',
  ...AKARI_EXTRA_STATS_GROUPS.flatMap((group) => group.metrics.map((metric) => metric.rawKey || '')),
]);

const POSITION_ORDER: Record<string, number> = {
  TOP: 0,
  JUNGLE: 1,
  MIDDLE: 2,
  MID: 2,
  BOTTOM: 3,
  UTILITY: 4,
  SUPPORT: 4,
};

const LINK_TONES: LinkTone[] = ['amber', 'cyan', 'violet', 'rose', 'emerald'];
const RIFT_SCOREBOARD_QUEUE_IDS = new Set([400, 420, 430, 440, 490]);

const RANK_TIER_NAMES: Record<string, string> = {
  CHALLENGER: '王者',
  GRANDMASTER: '宗师',
  MASTER: '大师',
  DIAMOND: '钻石',
  EMERALD: '翡翠',
  PLATINUM: '铂金',
  GOLD: '黄金',
  SILVER: '白银',
  BRONZE: '青铜',
  IRON: '黑铁',
};

function shouldUseRiftScoreboard(queueId: number): boolean {
  return RIFT_SCOREBOARD_QUEUE_IDS.has(queueId);
}

function buildPremadeToneMap(players: MatchParticipantSummary[], reserveAmber: boolean): Map<string, LinkTone> {
  const counts = new Map<string, number>();
  for (const player of players) {
    if (!player.premadeId) continue;
    counts.set(player.premadeId, (counts.get(player.premadeId) ?? 0) + 1);
  }

  const tones = reserveAmber ? LINK_TONES.filter((tone) => tone !== 'amber') : LINK_TONES;
  const toneById = new Map<string, LinkTone>();
  for (const [premadeId, count] of counts) {
    if (count < 2) continue;
    toneById.set(premadeId, tones[toneById.size % tones.length]);
  }
  return toneById;
}

function buildPremadeCountMap(players: MatchParticipantSummary[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const player of players) {
    if (!player.premadeId) continue;
    counts.set(player.premadeId, (counts.get(player.premadeId) ?? 0) + 1);
  }
  return counts;
}

type PlayerRelationship = {
  kind: 'premade' | 'recurring';
  label: string;
};

function resolvePlayerRelationship(
  player: MatchParticipantSummary,
  isLinkedByHistory: boolean,
  premadeCountById: Map<string, number>,
): PlayerRelationship | undefined {
  const premadeCount = player.premadeId ? (premadeCountById.get(player.premadeId) ?? 0) : 0;
  if (premadeCount >= 2) {
    return { kind: 'premade', label: `开黑·${premadeCount}` };
  }
  if (isLinkedByHistory) {
    return { kind: 'recurring', label: '常玩' };
  }
  return undefined;
}

function PlayerRelationshipBadge({ relationship }: { relationship?: PlayerRelationship }) {
  if (!relationship) return null;
  const Icon = relationship.kind === 'premade' ? Users : History;
  return (
    <span
      className={`lol-player-relation lol-player-relation--${relationship.kind}`}
      title={relationship.kind === 'premade' ? '本局组队关系' : '历史上多次同队；本场组队标识缺失'}
    >
      <Icon aria-hidden="true" />
      <span>{relationship.label}</span>
    </span>
  );
}

function stat(participant: MatchParticipantSummary, key: keyof MatchParticipantStats): number {
  const value = participant.stats?.[key] ?? 0;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function formatInteger(value: number): string {
  return Math.round(value || 0).toLocaleString('zh-CN');
}

function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

function teamTone(teamId: number): string {
  return teamId === 100 ? 'blue' : 'red';
}

function playerName(participant: MatchParticipantSummary): string {
  return participant.riotId || participant.summonerName || '未知玩家';
}

function positionOrder(participant: MatchParticipantSummary): number {
  return POSITION_ORDER[participant.teamPosition.toUpperCase()] ?? 99;
}

function itemSlots(participant: MatchParticipantSummary): Array<MatchParticipantSummary['items'][number] | undefined> {
  return Array.from({ length: 7 }, (_, slot) => participant.items.find((item) => item.slot === slot));
}

function visibleEnhancements(participant: MatchParticipantSummary, limit = 4): PlayerRuneSummary[] {
  const runes = participant.augments?.length
    ? participant.augments
    : participant.runes?.length
      ? participant.runes
    : [participant.primaryRune, participant.secondaryRune].filter((rune): rune is PlayerRuneSummary => Boolean(rune));
  return runes.slice(0, limit);
}

function enhancementClass(enhancement: PlayerRuneSummary): string {
  if (enhancement.kind !== 'augment') return 'lol-score-enhancement--rune';
  const rarity = (enhancement.rarity || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `lol-score-enhancement--augment lol-score-enhancement--${rarity}`;
}

function renderEnhancementIcon(enhancement: PlayerRuneSummary): ReactNode {
  if (enhancement.kind === 'augment' && enhancement.icon) {
    return (
      <span
        className="lol-score-enhancement-glyph"
        style={{
          WebkitMaskImage: `url("${enhancement.icon}")`,
          maskImage: `url("${enhancement.icon}")`,
        }}
      />
    );
  }

  return (
    <GameIcon
      src={enhancement.icon}
      alt={enhancement.name}
      title={enhancement.name}
      size={22}
    />
  );
}

function teamTotals(players: MatchParticipantSummary[]) {
  return players.reduce(
    (acc, player) => {
      acc.kills += player.kills;
      acc.deaths += player.deaths;
      acc.assists += player.assists;
      acc.gold += player.gold;
      acc.damage += player.damage;
      acc.cs += player.cs;
      acc.vision += stat(player, 'visionScore');
      return acc;
    },
    { kills: 0, deaths: 0, assists: 0, gold: 0, damage: 0, cs: 0, vision: 0 },
  );
}

interface RiftBadge {
  key: string;
  title: string;
  src: string;
  wide?: boolean;
}

function performanceScore(player: MatchParticipantSummary, teamKills: number): number {
  const killParticipation = teamKills > 0 ? (player.kills + player.assists) / teamKills : 0;
  return (
    player.kills * 3 +
    player.assists * 1.35 -
    player.deaths * 1.8 +
    player.damage / 1200 +
    stat(player, 'totalDamageTaken') / 1800 +
    stat(player, 'visionScore') * 0.12 +
    killParticipation * 8
  );
}

function buildRiftBadges(participants: MatchParticipantSummary[]): Map<string, RiftBadge[]> {
  const badges = new Map<string, RiftBadge[]>();
  const maxKills = Math.max(0, ...participants.map((player) => player.kills));
  const maxDeaths = Math.max(0, ...participants.map((player) => player.deaths));
  const maxAssists = Math.max(0, ...participants.map((player) => player.assists));
  const maxGold = Math.max(0, ...participants.map((player) => player.gold));
  const maxDamage = Math.max(0, ...participants.map((player) => player.damage));
  const maxHeal = Math.max(0, ...participants.map((player) => stat(player, 'totalHeal')));
  const maxTaken = Math.max(0, ...participants.map((player) => stat(player, 'totalDamageTaken')));
  const totalsByTeam = new Map<number, ReturnType<typeof teamTotals>>();
  for (const teamId of [100, 200]) {
    totalsByTeam.set(teamId, teamTotals(participants.filter((player) => player.teamId === teamId)));
  }

  const scoreEntries = participants.map((player) => ({
    player,
    score: performanceScore(player, totalsByTeam.get(player.teamId)?.kills ?? 0),
  }));
  const winnerBest = scoreEntries
    .filter(({ player }) => player.win)
    .sort((a, b) => b.score - a.score)[0]?.player.puuid;
  const loserBest = scoreEntries
    .filter(({ player }) => !player.win)
    .sort((a, b) => b.score - a.score)[0]?.player.puuid;

  for (const player of participants) {
    const next: RiftBadge[] = [];
    if (player.puuid === winnerBest) {
      next.push({ key: 'mvp', title: '胜方综合表现最佳', src: badgeMvp, wide: true });
    } else if (player.puuid === loserBest) {
      next.push({ key: 'svp', title: '败方综合表现最佳', src: badgeSvp, wide: true });
    }

    if (player.kills === maxKills && maxKills > 0) {
      next.push({ key: 'max-kill', title: '击杀最多', src: badgeMaxKill });
    }
    if (player.deaths === maxDeaths && maxDeaths > 0) {
      next.push({ key: 'max-deaths', title: '死亡最多', src: badgeMaxDeaths });
    }
    if (player.assists === maxAssists && maxAssists > 0) {
      next.push({ key: 'max-assist', title: '助攻最多', src: badgeMaxAssist });
    }
    if (player.gold === maxGold && maxGold > 0) {
      next.push({ key: 'max-gold', title: '金钱最多', src: badgeMaxGold });
    }
    if (player.damage === maxDamage && maxDamage > 0) {
      next.push({ key: 'max-damage', title: '伤害最多', src: badgeMaxDamage });
    }
    if (stat(player, 'totalHeal') === maxHeal && maxHeal > 0) {
      next.push({ key: 'max-heal', title: '治疗量最多', src: badgeMaxHeal });
    }
    if (stat(player, 'totalDamageTaken') === maxTaken && maxTaken > 0) {
      next.push({ key: 'max-taken', title: '承伤最多', src: badgeMaxTaken });
    }
    if ((player.tripleKills ?? 0) > 0) {
      next.push({ key: 'triple', title: '三杀', src: badgeTriple });
    }
    if ((player.quadraKills ?? 0) > 0) {
      next.push({ key: 'quadra', title: '四杀', src: badgeQuadra });
    }
    if ((player.pentaKills ?? 0) > 0) {
      next.push({ key: 'penta', title: '五杀', src: badgePenta, wide: true });
    }
    if ((player.largestKillingSpree ?? 0) >= 7) {
      next.push({ key: 'legendary', title: '超神', src: badgeLegendary });
    }

    badges.set(player.puuid, next);
  }

  return badges;
}

function rankForQueue(
  participant: MatchParticipantSummary,
  queueId: number,
  rankOverrides?: Record<string, PlayerRankSummary[]>,
): PlayerRankSummary | null {
  const ranks = rankOverrides?.[participant.puuid] ?? participant.ranks ?? (participant.rank ? [participant.rank] : []);
  if (ranks.length === 0) return null;
  const preferredQueue = queueId === 440 ? 'RANKED_FLEX_SR' : 'RANKED_SOLO_5x5';
  return (
    ranks.find((rank) => rank.queueType === preferredQueue) ??
    ranks.find((rank) => rank.queueType === 'RANKED_SOLO_5x5') ??
    ranks.find((rank) => rank.queueType === 'RANKED_FLEX_SR') ??
    ranks[0] ??
    null
  );
}

function rankDisplay(rank: PlayerRankSummary | null): string {
  if (!rank) return '未定级';
  const tier = RANK_TIER_NAMES[rank.tier] ?? rank.tier;
  const division = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(rank.tier) ? '' : rank.division;
  const points = rank.leaguePoints > 0 ? String(rank.leaguePoints) : '';
  return [tier, division, points].filter(Boolean).join(' ');
}

export function MatchDetail({ match, targetPuuid, region, recurringMates, onPlayerSearch }: MatchDetailProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [contentTab, setContentTab] = useState<DetailTab>('overview');
  const [, startTabTransition] = useTransition();
  const [timelineResult, setTimelineResult] = useState<MatchTimelineResult | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [rankByPuuid, setRankByPuuid] = useState<Record<string, PlayerRankSummary[]>>({});
  const [replayPhase, setReplayPhase] = useState<'idle' | 'download' | 'watch'>('idle');
  const [replayNotice, setReplayNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [replayAvailability, setReplayAvailability] = useState<ReplayAvailability | null>(null);
  const useRiftScoreboard = shouldUseRiftScoreboard(match.queueId);
  const replayRequest = useMemo<ReplayAvailabilityRequest>(() => ({
    gameId: match.gameId,
    queueId: match.queueId,
    gameCreation: match.gameCreation,
    gameDuration: match.gameDuration,
    gameVersion: match.gameVersion,
    gameType: match.gameType,
  }), [
    match.gameCreation,
    match.gameDuration,
    match.gameId,
    match.gameType,
    match.gameVersion,
    match.queueId,
  ]);

  useEffect(() => {
    let cancelled = false;
    setReplayPhase('idle');
    setReplayNotice(null);
    setReplayAvailability(null);
    void window.lolHelper.match.getReplayAvailability(replayRequest).then((availability) => {
      if (!cancelled) setReplayAvailability(availability);
    }).catch(() => {
      if (!cancelled) setReplayAvailability(null);
    });
    return () => {
      cancelled = true;
    };
  }, [replayRequest]);

  useEffect(() => {
    if (!['checking', 'downloading'].includes(replayAvailability?.state ?? '')) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void window.lolHelper.match.getReplayAvailability(replayRequest).then((availability) => {
        if (!cancelled) setReplayAvailability(availability);
      });
    }, 1_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [replayAvailability?.state, replayRequest]);

  useEffect(() => {
    if (!replayNotice) return;
    const timer = window.setTimeout(() => setReplayNotice(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [replayNotice]);

  const handleTabChange = (nextTab: DetailTab) => {
    if (nextTab === activeTab) return;
    setActiveTab(nextTab);
    startTabTransition(() => setContentTab(nextTab));
  };

  const handleReplayAction = async () => {
    if (replayPhase !== 'idle' || !replayAvailability?.available || replayAvailability.state === 'downloading') return;
    setReplayNotice(null);

    try {
      const alreadyDownloaded = ['found', 'watch'].includes(replayAvailability.state);
      if (!alreadyDownloaded) {
        setReplayPhase('download');
        const downloadResult = await window.lolHelper.match.downloadReplay(match.gameId);
        if (!downloadResult.success) {
          setReplayNotice({ type: 'error', text: downloadResult.message });
          return;
        }
        setReplayAvailability((current) => current
          ? {
              ...current,
              state: 'downloading',
              downloadProgress: 0,
              message: '回放正在下载',
            }
          : current);
        setReplayNotice({ type: 'success', text: '回放已开始下载' });
        return;
      }

      setReplayPhase('watch');
      const watchResult = await window.lolHelper.match.watchReplay(match.gameId);
      if (!watchResult.success) {
        setReplayNotice({
          type: 'error',
          text: watchResult.message,
        });
        return;
      }
      setReplayAvailability((current) => current
        ? { ...current, state: 'watch', downloadProgress: 100 }
        : current);
      setReplayNotice({ type: 'success', text: watchResult.message });
    } catch (error) {
      setReplayNotice({
        type: 'error',
        text: error instanceof Error ? error.message : '回放启动失败，请稍后重试',
      });
    } finally {
      setReplayPhase('idle');
    }
  };

  const participants = useMemo(
    () => match.participants
      .map((participant, index) => ({ participant, index }))
      .sort((a, b) =>
        a.participant.teamId - b.participant.teamId ||
        positionOrder(a.participant) - positionOrder(b.participant) ||
        a.index - b.index,
      )
      .map(({ participant }) => participant),
    [match.participants],
  );

  useEffect(() => {
    if (!useRiftScoreboard) return;
    const puuids = Array.from(new Set(
      participants
        .filter((participant) => !participant.rank && (participant.ranks?.length ?? 0) === 0)
        .map((participant) => participant.puuid)
        .filter((puuid) => puuid && !Object.prototype.hasOwnProperty.call(rankByPuuid, puuid)),
    ));
    if (puuids.length === 0) return;

    let cancelled = false;
    for (const puuid of puuids) {
      void window.lolHelper.match.getPlayerRanks(puuid, region)
        .catch(() => [] as PlayerRankSummary[])
        .then((ranks) => {
          if (cancelled) return;
          setRankByPuuid((prev) => ({ ...prev, [puuid]: ranks }));
        });
    }

    return () => {
      cancelled = true;
    };
  }, [match.gameId, participants, region, useRiftScoreboard]);

  useEffect(() => {
    let cancelled = false;
    setTimelineResult(null);
    setTimelineLoading(true);
    void window.lolHelper.match.getTimeline(match.gameId, region)
      .then((result) => {
        if (!cancelled) setTimelineResult(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setTimelineResult({
            available: false,
            timeline: null,
            error: error instanceof Error ? error.message : '时间线读取失败',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setTimelineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [match.gameId, region]);

  const target = participants.find((p) => p.puuid === targetPuuid) ?? participants[0];
  const replayReady = ['found', 'watch'].includes(replayAvailability?.state ?? '');
  const replayBusy = replayPhase !== 'idle' || replayAvailability?.state === 'downloading';
  const replayControlLabel = replayAvailability?.state === 'downloading'
    ? `下载 ${Math.round(replayAvailability.downloadProgress)}%`
    : replayPhase === 'download'
      ? '正在下载'
      : replayPhase === 'watch'
        ? '正在启动'
        : replayReady
          ? '播放回放'
          : '下载回放';

  if (!target) {
    return <div className="lol-postgame lol-postgame-empty">暂无这场对局的详细数据</div>;
  }

  return (
    <div className={`lol-postgame lol-postgame--${target.win ? 'win' : 'loss'}`}>
      <div className="lol-postgame-tabs" role="tablist" aria-label="战绩详情标签">
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`lol-postgame-tab ${activeTab === tab.key ? 'lol-postgame-tab--active' : ''}`}
            onClick={() => handleTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
        {(replayAvailability?.available || replayNotice) && <div className="lol-postgame-replay">
          {replayNotice && (
            <span className={`lol-postgame-replay__notice lol-postgame-replay__notice--${replayNotice.type}`}>
              {replayNotice.text}
            </span>
          )}
          {replayAvailability?.available && <button
            type="button"
            className={`lol-postgame-replay__button ${
              replayReady
                ? 'lol-postgame-replay__button--ready'
                : 'lol-postgame-replay__button--download'
            }`}
            disabled={replayBusy}
            onClick={() => void handleReplayAction()}
            title={replayControlLabel}
            aria-label={replayControlLabel}
          >
            {replayBusy ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : replayReady ? (
              <CirclePlay className="size-4" strokeWidth={1.8} />
            ) : (
              <Download className="size-3.5" strokeWidth={1.9} />
            )}
            <span>{replayControlLabel}</span>
          </button>}
        </div>}
      </div>

      <div className="lol-postgame-content">
        {contentTab === 'overview' && (
          useRiftScoreboard ? (
            <RiftScoreboardTab
              participants={participants}
              targetPuuid={targetPuuid}
              recurringMates={recurringMates}
              onPlayerSearch={onPlayerSearch}
              queueId={match.queueId}
              rankByPuuid={rankByPuuid}
            />
          ) : (
            <ScoreboardTab
              participants={participants}
              targetPuuid={targetPuuid}
              recurringMates={recurringMates}
              onPlayerSearch={onPlayerSearch}
            />
          )
        )}
        {contentTab === 'details' && <DetailedTableTab participants={participants} targetPuuid={targetPuuid} />}
        {contentTab === 'events' && (
          <EventsTab
            participants={participants}
            timeline={timelineResult?.timeline ?? null}
            loading={timelineLoading}
            error={timelineResult?.error}
            queueId={match.queueId}
            gameVersion={match.gameVersion}
            gameDuration={match.gameDuration}
          />
        )}
        {contentTab === 'builds' && (
          <BuildsTab
            participants={participants}
            timeline={timelineResult?.timeline ?? null}
            targetPuuid={targetPuuid}
          />
        )}
        {contentTab === 'timeline' && (
          <TimelineTab
            participants={participants}
            timeline={timelineResult?.timeline ?? null}
            loading={timelineLoading}
            error={timelineResult?.error}
            targetPuuid={targetPuuid}
          />
        )}
      </div>
    </div>
  );
}

function ScoreboardTab({
  participants,
  targetPuuid,
  recurringMates,
  onPlayerSearch,
}: {
  participants: MatchParticipantSummary[];
  targetPuuid: string;
  recurringMates?: Map<string, RecurringMate>;
  onPlayerSearch?: (riotId: string) => void;
}) {
  const maxPlayerDamage = useMemo(
    () => Math.max(0, ...participants.map((player) => Math.max(0, player.damage || 0))),
    [participants],
  );
  const badgesByPuuid = useMemo(() => buildRiftBadges(participants), [participants]);

  return (
    <div className="lol-scoreboard lol-result-scoreboard">
      {[100, 200].map((id) => (
        <ScoreboardTeam
          key={id}
          teamId={id}
          players={participants.filter((player) => player.teamId === id)}
          targetPuuid={targetPuuid}
          recurringMates={recurringMates}
          onPlayerSearch={onPlayerSearch}
          maxPlayerDamage={maxPlayerDamage}
          badgesByPuuid={badgesByPuuid}
        />
      ))}
    </div>
  );
}

function RiftScoreboardTab({
  participants,
  targetPuuid,
  recurringMates,
  onPlayerSearch,
  queueId,
  rankByPuuid,
}: {
  participants: MatchParticipantSummary[];
  targetPuuid: string;
  recurringMates?: Map<string, RecurringMate>;
  onPlayerSearch?: (riotId: string) => void;
  queueId: number;
  rankByPuuid: Record<string, PlayerRankSummary[]>;
}) {
  const badgesByPuuid = useMemo(() => buildRiftBadges(participants), [participants]);
  const maxPlayerDamage = useMemo(
    () => Math.max(0, ...participants.map((player) => Math.max(0, player.damage || 0))),
    [participants],
  );

  return (
    <div className="lol-rift-scoreboard lol-result-scoreboard">
      {[100, 200].map((id) => (
        <RiftScoreboardTeam
          key={id}
          teamId={id}
          players={participants.filter((player) => player.teamId === id)}
          targetPuuid={targetPuuid}
          recurringMates={recurringMates}
          onPlayerSearch={onPlayerSearch}
          queueId={queueId}
          rankByPuuid={rankByPuuid}
          badgesByPuuid={badgesByPuuid}
          maxPlayerDamage={maxPlayerDamage}
        />
      ))}
    </div>
  );
}

function RiftScoreboardTeam({
  teamId,
  players,
  targetPuuid,
  recurringMates,
  onPlayerSearch,
  queueId,
  rankByPuuid,
  badgesByPuuid,
  maxPlayerDamage,
}: {
  teamId: number;
  players: MatchParticipantSummary[];
  targetPuuid: string;
  recurringMates?: Map<string, RecurringMate>;
  onPlayerSearch?: (riotId: string) => void;
  queueId: number;
  rankByPuuid: Record<string, PlayerRankSummary[]>;
  badgesByPuuid: Map<string, RiftBadge[]>;
  maxPlayerDamage: number;
}) {
  const tone = teamTone(teamId);
  const hasRecurringMate = players.some(
    (player) => player.puuid !== targetPuuid && Boolean(recurringMates?.has(player.puuid)),
  );
  const premadeToneById = buildPremadeToneMap(players, hasRecurringMate);
  const premadeCountById = buildPremadeCountMap(players);
  const won = players[0]?.win ?? false;

  return (
    <section className={`lol-rift-team lol-rift-team--${tone} lol-result-team lol-result-team--${won ? 'win' : 'loss'}`}>
      <div className="lol-rift-grid lol-rift-grid--head">
        <MatchResultHeading won={won} />
        <span>装备</span>
        <span>KDA</span>
        <span>伤害</span>
      </div>

      <div className="lol-rift-team-rows">
        {players.map((player) => {
          const isRecurring = player.puuid !== targetPuuid && Boolean(recurringMates?.has(player.puuid));
          const isLinkedByHistory = hasRecurringMate && (player.puuid === targetPuuid || isRecurring);
          const premadeTone = player.premadeId ? premadeToneById.get(player.premadeId) : undefined;
          const linkTone = premadeTone ?? (isLinkedByHistory ? 'amber' : undefined);
          const relationship = resolvePlayerRelationship(player, isLinkedByHistory, premadeCountById);

          return (
            <RiftScoreboardRow
              key={`${player.puuid}-${player.championId}`}
              participant={player}
              isTarget={player.puuid === targetPuuid}
              isRecurring={isRecurring}
              onPlayerSearch={onPlayerSearch}
              linkTone={linkTone}
              queueId={queueId}
              relationship={relationship}
              rankByPuuid={rankByPuuid}
              badges={badgesByPuuid.get(player.puuid) ?? []}
              damageShare={resolveDamageScale(player, maxPlayerDamage)}
            />
          );
        })}
      </div>
    </section>
  );
}

function RiftScoreboardRow({
  participant,
  isTarget,
  isRecurring,
  onPlayerSearch,
  linkTone,
  relationship,
  queueId,
  rankByPuuid,
  badges,
  damageShare,
}: {
  participant: MatchParticipantSummary;
  isTarget: boolean;
  isRecurring: boolean;
  onPlayerSearch?: (riotId: string) => void;
  linkTone?: LinkTone;
  relationship?: PlayerRelationship;
  queueId: number;
  rankByPuuid: Record<string, PlayerRankSummary[]>;
  badges: RiftBadge[];
  damageShare: number;
}) {
  const name = playerName(participant);
  const rank = rankForQueue(participant, queueId, rankByPuuid);
  const slots = itemSlots(participant);

  return (
    <div
      className={`lol-rift-row ${isTarget ? 'lol-rift-row--target' : ''} ${
        isRecurring ? 'lol-rift-row--recurring' : ''
      } ${linkTone ? `lol-rift-row--linked lol-rift-row--linked-${linkTone}` : ''}`}
    >
      <div className="lol-rift-player-cell">
        <DamageEnergyBar damageShare={damageShare} win={participant.win} />
        <div className="lol-rift-loadout">
        <div className="lol-rift-champion">
          <GameIcon
            src={participant.championAvatar}
            alt={participant.championName}
            title={`${participant.championName} Lv.${participant.champLevel}`}
            size={40}
            rounded
          />
        </div>
        <div className="lol-rift-spells">
          {participant.spells.map((spell) => (
            <GameIcon
              key={`${participant.puuid}-${spell.id}`}
              src={spell.icon}
              alt={spell.name}
              title={spell.name}
              size={18}
            />
          ))}
        </div>
        <div className="lol-rift-runes">
          {[participant.primaryRune, participant.secondaryRune]
            .filter((rune): rune is PlayerRuneSummary => Boolean(rune))
            .map((rune) => (
              <GameIcon
                key={`${participant.puuid}-${rune.id}`}
                src={rune.icon}
                alt={rune.name}
                title={rune.name}
                size={18}
              />
            ))}
        </div>
      </div>

      <div className="lol-rift-identity">
        <div className="lol-player-relation-line">
          <button
            type="button"
            className={`lol-rift-player-name ${
              linkTone ? `lol-score-player-name--linked lol-score-player-name--linked-${linkTone}` : ''
            }`}
            title={name}
            onClick={() => onPlayerSearch?.(name)}
          >
            {name}
          </button>
          <PlayerRelationshipBadge relationship={relationship} />
        </div>
        <div className="lol-rift-badges">
          {badges.map((badge) => (
            <img
              key={badge.key}
              className={`lol-rift-badge ${badge.wide ? 'lol-rift-badge--wide' : ''}`}
              src={badge.src}
              alt={badge.title}
              title={badge.title}
            />
          ))}
        </div>
      </div>

      <div className="lol-rift-rank" title={rank?.displayText ?? '未定级'}>
        {rank ? <RankEmblem rank={rank} size={24} variant="mini" /> : <span className="lol-rift-rank-empty" />}
        <span>{rankDisplay(rank)}</span>
      </div>
      </div>
      <div className="lol-rift-items">
        {slots.map((item, slot) =>
          item ? (
            <GameIcon
              key={`${participant.puuid}-${slot}-${item.id}`}
              src={item.icon}
              alt={item.name}
              title={item.name}
              size={24}
            />
          ) : (
            <span key={`${participant.puuid}-${slot}`} className="lol-score-item-empty" />
          ),
        )}
      </div>
      <div className="lol-rift-kda" aria-label={`KDA ${participant.kills} / ${participant.deaths} / ${participant.assists}`}>
        <strong className="lol-kda-cluster">
          <span className="lol-kda-value">{participant.kills}</span>
          <i className="lol-kda-separator">/</i>
          <span className="lol-kda-value lol-kda-value--death">{participant.deaths}</span>
          <i className="lol-kda-separator">/</i>
          <span className="lol-kda-value">{participant.assists}</span>
        </strong>
      </div>
      <span className="lol-rift-damage">{formatCompact(participant.damage)}</span>
    </div>
  );
}

function resolveDamageScale(participant: MatchParticipantSummary, maxPlayerDamage: number): number {
  if (maxPlayerDamage <= 0) return 0;
  return Math.max(
    0,
    Math.min(100, (Math.max(0, participant.damage || 0) / maxPlayerDamage) * 100),
  );
}

function ScoreboardTeam({
  teamId,
  players,
  targetPuuid,
  recurringMates,
  onPlayerSearch,
  maxPlayerDamage,
  badgesByPuuid,
}: {
  teamId: number;
  players: MatchParticipantSummary[];
  targetPuuid: string;
  recurringMates?: Map<string, RecurringMate>;
  onPlayerSearch?: (riotId: string) => void;
  maxPlayerDamage: number;
  badgesByPuuid: Map<string, RiftBadge[]>;
}) {
  const tone = teamTone(teamId);
  const hasRecurringMate = players.some(
    (player) => player.puuid !== targetPuuid && Boolean(recurringMates?.has(player.puuid)),
  );
  const premadeToneById = buildPremadeToneMap(players, hasRecurringMate);
  const premadeCountById = buildPremadeCountMap(players);
  const won = players[0]?.win ?? false;

  return (
    <section className={`lol-score-team lol-score-team--${tone} lol-result-team lol-result-team--${won ? 'win' : 'loss'}`}>
      <div className="lol-score-grid lol-score-grid--head">
        <MatchResultHeading won={won} />
        <span>符文 / 强化</span>
        <span>装备</span>
        <span>KDA</span>
        <span>伤害</span>
      </div>
      {players.map((player) => {
        const isRecurring = player.puuid !== targetPuuid && Boolean(recurringMates?.has(player.puuid));
        const isLinkedByHistory = hasRecurringMate && (player.puuid === targetPuuid || isRecurring);
        const premadeTone = player.premadeId ? premadeToneById.get(player.premadeId) : undefined;
        const linkTone = premadeTone ?? (isLinkedByHistory ? 'amber' : undefined);
        const relationship = resolvePlayerRelationship(player, isLinkedByHistory, premadeCountById);

        return (
          <ScoreboardRow
            key={`${player.puuid}-${player.championId}`}
            participant={player}
            isTarget={player.puuid === targetPuuid}
            isRecurring={isRecurring}
            onPlayerSearch={onPlayerSearch}
            linkTone={linkTone}
            damageShare={resolveDamageScale(player, maxPlayerDamage)}
            relationship={relationship}
            badges={badgesByPuuid.get(player.puuid) ?? []}
          />
        );
      })}
    </section>
  );
}

function MatchResultHeading({ won }: { won: boolean }) {
  return (
    <span className={`lol-result-heading lol-result-heading--${won ? 'win' : 'loss'}`}>
      <b>{won ? '胜利' : '失败'}</b>
      <i aria-hidden="true" />
      <em>玩家</em>
    </span>
  );
}

function ScoreboardRow({
  participant,
  isTarget,
  isRecurring,
  onPlayerSearch,
  linkTone,
  relationship,
  damageShare,
  badges,
}: {
  participant: MatchParticipantSummary;
  isTarget: boolean;
  isRecurring: boolean;
  onPlayerSearch?: (riotId: string) => void;
  linkTone?: LinkTone;
  relationship?: PlayerRelationship;
  damageShare: number;
  badges: RiftBadge[];
}) {
  const slots = itemSlots(participant);
  const enhancements = visibleEnhancements(participant);
  const enhancementSlots = Array.from({ length: 4 }, (_, index) => enhancements[index]);
  const name = playerName(participant);

  return (
    <div
      className={`lol-score-grid lol-score-row ${isTarget ? 'lol-score-row--target' : ''} ${
        isRecurring ? 'lol-score-row--recurring' : ''
      }`}
    >
      <div className="lol-score-damage-track">
        <DamageEnergyBar damageShare={damageShare} win={participant.win} />
      </div>
      <div className="lol-score-player">
        <div className="lol-score-spells">
          {participant.spells.map((spell) => (
            <GameIcon key={`${participant.puuid}-${spell.id}`} src={spell.icon} alt={spell.name} title={spell.name} size={18} />
          ))}
        </div>
        <div className="lol-score-champion">
          <GameIcon
            src={participant.championAvatar}
            alt={participant.championName}
            title={`${participant.championName} Lv.${participant.champLevel}`}
            size={40}
            rounded
          />
          <span>{participant.champLevel}</span>
        </div>
        <div className="lol-score-player-copy">
          <div className="lol-player-relation-line">
            <button
              type="button"
              className={`lol-score-player-name ${
                linkTone ? `lol-score-player-name--linked lol-score-player-name--linked-${linkTone}` : ''
              }`}
              title={name}
              onClick={() => onPlayerSearch?.(name)}
            >
              {name}
            </button>
            <PlayerRelationshipBadge relationship={relationship} />
          </div>
          {badges.length > 0 && (
            <div className="lol-score-performance-badges" aria-label="本局表现徽章">
              {badges.map((badge) => (
                <img
                  key={badge.key}
                  className={`lol-score-performance-badge ${
                    badge.wide ? 'lol-score-performance-badge--wide' : ''
                  }`}
                  src={badge.src}
                  alt={badge.title}
                  title={badge.title}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="lol-score-runes">
        {enhancementSlots.map((enhancement, index) =>
          enhancement ? (
            <span
              key={`${participant.puuid}-${enhancement.id}`}
              className={`lol-score-enhancement ${enhancementClass(enhancement)}`}
              title={enhancement.name}
            >
              {renderEnhancementIcon(enhancement)}
            </span>
          ) : (
            <span key={`${participant.puuid}-empty-enhancement-${index}`} className="lol-score-enhancement lol-score-enhancement--empty" />
          ),
        )}
      </div>
      <div className="lol-score-items">
        {slots.map((item, slot) =>
          item ? (
            <GameIcon
              key={`${participant.puuid}-${slot}-${item.id}`}
              src={item.icon}
              alt={item.name}
              title={item.name}
              size={24}
            />
          ) : (
            <span key={`${participant.puuid}-${slot}`} className="lol-score-item-empty" />
          ),
        )}
      </div>
      <div className="lol-score-kda" aria-label={`KDA ${participant.kills} / ${participant.deaths} / ${participant.assists}`}>
        <strong className="lol-kda-cluster">
          <span className="lol-kda-value">{participant.kills}</span>
          <i className="lol-kda-separator">/</i>
          <span className="lol-kda-value lol-kda-value--death">{participant.deaths}</span>
          <i className="lol-kda-separator">/</i>
          <span className="lol-kda-value">{participant.assists}</span>
        </strong>
      </div>
      <span className="lol-score-number">{formatCompact(participant.damage)}</span>
    </div>
  );
}

type StatsDisplayValue = number | string | boolean;

function getMetricValue(metric: StatsMetric, participant: MatchParticipantSummary): StatsDisplayValue {
  if (metric.text) return metric.text(participant);
  if (metric.value) return metric.value(participant);
  if (metric.rawKey) {
    const rawValue = participant.rawStats?.[metric.rawKey];
    if (rawValue !== undefined) return rawValue;
    const normalizedValue = (participant.stats as unknown as Record<string, number>)[metric.rawKey];
    if (normalizedValue !== undefined) return normalizedValue;
  }
  return 0;
}

function formatMetricValue(metric: StatsMetric, value: StatsDisplayValue): string {
  if (metric.kind === 'boolean') {
    return value === true || value === 1 || value === 'true' ? '是' : '否';
  }
  if (typeof value !== 'number') return String(value || '—');
  if (metric.kind === 'percent') {
    const percentage = Math.abs(value) <= 1 ? value * 100 : value;
    return `${percentage.toFixed(2)}%`;
  }
  if (metric.kind === 'duration') {
    const seconds = Math.max(0, Math.round(value));
    return `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, '0')}秒`;
  }
  if (metric.kind === 'decimal') return value.toFixed(2);
  return formatInteger(value);
}

function formatMetricDelta(metric: StatsMetric, delta: number): string {
  if (!Number.isFinite(delta) || delta === 0) return '0';
  const sign = delta > 0 ? '+' : '−';
  const magnitude = Math.abs(delta);
  if (metric.kind === 'percent') {
    const percentage = magnitude <= 1 ? magnitude * 100 : magnitude;
    return `${sign}${percentage.toFixed(1)}pp`;
  }
  if (metric.kind === 'duration') {
    const seconds = Math.round(magnitude);
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return minutes > 0 ? `${sign}${minutes}分${String(rest).padStart(2, '0')}秒` : `${sign}${rest}秒`;
  }
  if (metric.kind === 'decimal') return `${sign}${magnitude.toFixed(2)}`;
  return `${sign}${formatInteger(magnitude)}`;
}

const RAW_FIELD_LABELS: Record<string, string> = {
  placement: '最终名次',
  subteamPlacement: '小队名次',
  timePlayed: '对局时长',
  spell1Casts: 'Q 技能施放次数',
  spell2Casts: 'W 技能施放次数',
  spell3Casts: 'E 技能施放次数',
  spell4Casts: 'R 技能施放次数',
  summoner1Casts: '召唤师技能 1 使用次数',
  summoner2Casts: '召唤师技能 2 使用次数',
  abilityUses: '技能使用总次数',
  '12AssistStreakCount': '连续 12 次助攻次数',
  acesBefore15Minutes: '15 分钟前团灭对手次数',
  alliedJungleMonsterKills: '击杀己方野区野怪',
  baronTakedowns: '参与击杀男爵',
  blastConeOppositeOpponentCount: '爆炸果实炸开敌人次数',
  completeSupportQuestInTime: '按时完成辅助任务',
  controlWardTimeCoverageInRiverOrEnemyHalf: '河道或敌方半区真眼覆盖时长',
  dancedWithRiftHerald: '与峡谷先锋共舞',
  dodgeSkillShotsSmallWindow: '短时间连续躲避技能次数',
  doubleAces: '连续团灭次数',
  dragonTakedowns: '参与击杀小龙',
  earliestBaron: '最早男爵击杀时间',
  earliestDragonTakedown: '最早小龙参与击杀时间',
  earliestElderDragon: '最早远古巨龙击杀时间',
  earlyLaningPhaseGoldExpAdvantage: '前期对线经济经验领先',
  elderDragonKillsWithOpposingSoul: '敌方有龙魂时击杀远古巨龙',
  elderDragonMultikills: '远古巨龙期间多杀次数',
  enemyChampionImmobilizations: '控制敌方英雄次数',
  enemyJungleMonsterKills: '击杀敌方野区野怪',
  epicMonsterKillsNearEnemyJungler: '敌方打野附近击杀史诗野怪',
  epicMonsterKillsWithin30SecondsOfSpawn: '史诗野怪出生 30 秒内击杀',
  epicMonsterSteals: '抢夺史诗野怪次数',
  epicMonsterStolenWithoutSmite: '未使用惩戒抢夺史诗野怪',
  flawlessAces: '无阵亡团灭对手次数',
  fullTeamTakedown: '全队参与击杀次数',
  gameLength: '对局时长',
  hadAfkTeammate: '存在挂机队友',
  hadOpenNexus: '己方基地曾暴露',
  immobilizeAndKillWithAlly: '与队友配合控制并击杀',
  initialBuffCount: '开局增益野怪数量',
  initialCrabCount: '开局河蟹数量',
  junglerKillsEarlyJungle: '前期野区击杀敌方打野',
  junglerTakedownsNearDamagedEpicMonster: '史诗野怪附近参与击杀',
  kTurretsDestroyedBeforePlatesFall: '镀层消失前摧毁防御塔',
  killAfterHiddenWithAlly: '与队友隐蔽后完成击杀',
  killedChampTookFullTeamDamageSurvived: '承受敌方全队伤害后击杀并存活',
  killsNearEnemyTurret: '敌方防御塔附近击杀',
  killsOnLanersEarlyJungleAsJungler: '打野前期击杀线上英雄',
  killsOnOtherLanesEarlyJungleAsLaner: '线上英雄前期跨线击杀',
  killsOnRecentlyHealedByAramPack: '击杀近期使用极地治疗包的敌人',
  killsUnderOwnTurret: '己方防御塔下击杀',
  killsWithHelpFromEpicMonster: '借助史诗野怪完成击杀',
  knockEnemyIntoTeamAndKill: '击退敌人至队伍并完成击杀',
  landSkillShotsEarlyGame: '前期技能命中次数',
  laningPhaseGoldExpAdvantage: '对线期经济经验领先',
  legendaryCount: '超神次数',
  lostAnInhibitor: '己方召唤水晶被摧毁',
  maxKillDeficit: '最大击杀落后',
  mejaisFullStackInTime: '梅贾的窃魂卷满层',
  moreEnemyJungleThanOpponent: '敌方野区资源领先',
  multiKillOneSpell: '单个技能多杀次数',
  multikills: '多杀次数',
  multikillsAfterAggressiveFlash: '进攻闪现后多杀次数',
  outerTurretExecutesBefore10Minutes: '10 分钟前摧毁外塔',
  outnumberedKills: '以少打多击杀次数',
  outnumberedNexusKill: '以少打多摧毁基地',
  perfectDragonSoulsTaken: '零失误获得龙魂',
  perfectGame: '完美对局',
  pickKillWithAlly: '与队友完成抓单击杀',
  poroExplosions: '魄罗爆炸次数',
  quickFirstTurret: '快速摧毁一塔',
  quickSoloKills: '快速单杀次数',
  riftHeraldTakedowns: '参与击杀峡谷先锋',
  scuttleCrabKills: '击杀河蟹次数',
  snowballsHit: '雪球命中次数',
  soloBaronKills: '单人击杀男爵',
  soloTurretsLategame: '后期单人摧毁防御塔',
  stealthWardsPlaced: '放置侦查守卫',
  survivedSingleDigitHpCount: '个位数生命值存活次数',
  survivedThreeImmobilizesInFight: '单次战斗承受三次控制后存活',
  takedownOnFirstTurret: '参与摧毁一塔',
  takedownsInAlcove: '凹室内参与击杀',
  takedownsInEnemyFountain: '敌方泉水内参与击杀',
  threeWardsOneSweeperCount: '单次扫描排除三个守卫',
  tookLargeDamageSurvived: '承受大量伤害后存活',
  turretsTakenWithRiftHerald: '利用峡谷先锋摧毁防御塔',
  twentyMinionsIn3SecondsCount: '3 秒内击杀 20 个小兵次数',
  twoWardsOneSweeperCount: '单次扫描排除两个守卫',
  unseenRecalls: '未被发现的回城次数',
  wardTakedownsBefore20M: '20 分钟前排除守卫次数',
  basicAttackDamage: '普攻造成伤害',
  basicAttackDamageToChampions: '普攻对英雄伤害',
  basicAttacks: '普攻次数',
  bountyGold: '赏金收入',
  buffsStolen: '偷取增益次数',
  controlWardsPlaced: '放置控制守卫',
  crowdControlScore: '控制得分',
  damageDealtToEpicMonsters: '对史诗野怪伤害',
  damageDealtToMonsters: '对野怪伤害',
  damageDealtToStructures: '对建筑伤害',
  damageTakenFromChampions: '承受英雄伤害',
  deathsByEnemyChamps: '被敌方英雄击杀次数',
  epicMonsterKills: '击杀史诗野怪',
  firstTurretKilled: '参与摧毁一塔',
  firstTurretKilledTime: '一塔摧毁时间',
  goldAt10: '10 分钟金币',
  goldAt15: '15 分钟金币',
  goldDiffAt10: '10 分钟经济差',
  goldDiffAt15: '15 分钟经济差',
  jungleCsBefore10Minutes: '10 分钟前野区补刀',
  laneMinionsFirst10Minutes: '10 分钟线上补刀',
  maxCsAdvantageOnLaneOpponent: '最大补刀领先',
  maxLevelLeadLaneOpponent: '最大等级领先',
  objectivesStolen: '抢夺史诗野怪',
  objectivesStolenAssists: '协助抢夺史诗野怪',
  quickCleanse: '快速解除控制次数',
  saveAllyFromDeath: '救下濒死队友次数',
  soloKills: '单杀次数',
  takedowns: '参与击杀',
  takedownsAfterGainingLevelAdvantage: '等级领先后参与击杀',
  takedownsBeforeJungleMinionSpawn: '野怪刷新前参与击杀',
  takedownsFirst25Minutes: '前 25 分钟参与击杀',
  teamBaronKills: '团队男爵击杀',
  teamElderDragonKills: '团队远古巨龙击杀',
  teamRiftHeraldKills: '团队峡谷先锋击杀',
  turretPlatesTaken: '获得防御塔镀层',
  visionScoreAdvantageLaneOpponent: '对位视野得分领先',
  visionScorePerMinute: '每分钟视野得分',
  wardTakedowns: '排除守卫次数',
  wardsGuarded: '保护守卫次数',
  killParticipation: '参团率',
  kda: 'KDA',
  goldPerMinute: '每分钟金币',
  damagePerMinute: '每分钟英雄伤害',
  teamDamagePercentage: '团队伤害占比',
  damageTakenOnTeamPercentage: '团队承伤占比',
  effectiveHealAndShielding: '有效治疗与护盾',
  skillshotsHit: '技能命中次数',
  skillshotsDodged: '躲避技能次数',
  totalAllyJungleMinionsKilled: '己方野区补刀',
  totalEnemyJungleMinionsKilled: '敌方野区补刀',
  totalTimeCCDealt: '造成控制总时长',
  totalUnitsHealed: '治疗单位数',
  sightWardsBoughtInGame: '购买侦查守卫',
  visionWardsBoughtInGame: '购买控制守卫',
  itemsPurchased: '购买装备次数',
  consumablesPurchased: '购买消耗品次数',
  longestTimeSpentLiving: '最长存活时间',
  totalTimeSpentDead: '总死亡时间',
  champExperience: '获得经验',
  unrealKills: '超神次数',
  firstBloodKill: '一血击杀',
  firstBloodAssist: '一血助攻',
  firstTowerKill: '一塔击杀',
  firstTowerAssist: '一塔助攻',
  inhibitorKills: '摧毁召唤水晶',
  inhibitorTakedowns: '参与摧毁召唤水晶',
  inhibitorsLost: '损失召唤水晶',
  nexusKills: '摧毁基地',
  nexusTakedowns: '参与摧毁基地',
  nexusLost: '基地被摧毁',
  turretKills: '摧毁防御塔',
  turretTakedowns: '参与摧毁防御塔',
  turretsLost: '损失防御塔',
  baronKills: '参与击杀男爵',
  dragonKills: '参与击杀小龙',
  allInPings: '全力进攻信号',
  assistMePings: '请求协助信号',
  baitPings: '引诱信号',
  basicPings: '基础信号',
  commandPings: '指令信号',
  dangerPings: '危险信号',
  enemyMissingPings: '敌人消失信号',
  enemyVisionPings: '敌方视野信号',
  getBackPings: '撤退信号',
  holdPings: '坚持信号',
  needVisionPings: '需要视野信号',
  onMyWayPings: '正在路上信号',
  pushPings: '推进信号',
  visionClearedPings: '视野已清除信号',
};

function rawFieldFallbackCode(key: string): string {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return String(hash % 10_000).padStart(4, '0');
}

function rawFieldLabel(key: string): string {
  return RAW_FIELD_LABELS[key] ?? `其他统计 #${rawFieldFallbackCode(key)}`;
}

type StatsTone =
  | 'combat'
  | 'damage'
  | 'defense'
  | 'vision'
  | 'slayer'
  | 'support'
  | 'economy'
  | 'objective'
  | 'signal'
  | 'raw'
  | 'neutral';

function statsToneForGroup(title: string): StatsTone {
  switch (title) {
    case '战斗':
      return 'combat';
    case '造成伤害':
      return 'damage';
    case '承受与资源':
      return 'defense';
    case '视野':
      return 'vision';
    case '击杀与生存':
      return 'slayer';
    case '伤害、治疗与控制':
      return 'support';
    case '经济与发育':
      return 'economy';
    case '地图资源与推进':
      return 'objective';
    case '信号与对局状态':
      return 'signal';
    case '更多原始统计':
      return 'raw';
    default:
      return 'neutral';
  }
}

function StatsGroupIcon({ title }: { title: string }) {
  switch (title) {
    case '战斗':
      return <Swords aria-hidden="true" />;
    case '造成伤害':
      return <Flame aria-hidden="true" />;
    case '承受与资源':
      return <Shield aria-hidden="true" />;
    case '视野':
      return <Eye aria-hidden="true" />;
    case '击杀与生存':
      return <Skull aria-hidden="true" />;
    case '伤害、治疗与控制':
      return <HeartPulse aria-hidden="true" />;
    case '经济与发育':
      return <Coins aria-hidden="true" />;
    case '地图资源与推进':
      return <MapIcon aria-hidden="true" />;
    case '信号与对局状态':
      return <Radio aria-hidden="true" />;
    case '更多原始统计':
      return <Database aria-hidden="true" />;
    default:
      return <Layers3 aria-hidden="true" />;
  }
}

function StatsMetricLabel({ metric }: { metric: StatsMetric }) {
  const helpText = metric.description || (metric.rawKey ? `SGP 原始统计字段：${metric.rawKey}` : '');
  return (
    <div
      className="lol-stats-label"
      title={helpText || metric.label}
      aria-label={helpText ? `${metric.label}：${helpText}` : metric.label}
    >
      <span>{metric.label}</span>
      {helpText && <small aria-hidden="true">i</small>}
    </div>
  );
}

function DetailedTableTab({
  participants,
  targetPuuid,
}: {
  participants: MatchParticipantSummary[];
  targetPuuid: string;
}) {
  const [metricFilter, setMetricFilter] = useState('');
  const [focusPuuid, setFocusPuuid] = useState(targetPuuid);
  const [comparePuuid, setComparePuuid] = useState<string | null>(null);
  const [comparePicking, setComparePicking] = useState(false);
  const [expandedMetricKey, setExpandedMetricKey] = useState<string | null>(null);
  const [activeGroupTitle, setActiveGroupTitle] = useState('战斗');
  const [headerCompact, setHeaderCompact] = useState(false);

  useEffect(() => {
    setFocusPuuid(targetPuuid);
    setComparePuuid(null);
    setComparePicking(false);
    setExpandedMetricKey(null);
    setHeaderCompact(false);
  }, [targetPuuid]);

  const extraRawMetrics = useMemo(() => {
    const keys = new Set<string>();
    participants.forEach((participant) => {
      Object.keys(participant.rawStats || {}).forEach((key) => {
        if (!RAW_STATS_EXCLUDED.has(key)
          && !/^item[0-9]+$/i.test(key)
          && !/^playerAugment[0-9]+$/i.test(key)
          && !/^playerScore[0-9]+$/i.test(key)) keys.add(key);
      });
    });
    return [...keys].sort().map((key) => {
      const sample = participants.map((participant) => participant.rawStats?.[key]).find((value) => value !== undefined);
      const kind: StatsMetric['kind'] = typeof sample === 'boolean' ? 'boolean' : 'number';
      return rawMetric(key, rawFieldLabel(key), kind, `SGP 原始统计字段：${key}`);
    });
  }, [participants]);

  const groups = useMemo(() => [
    ...STATS_GROUPS,
    ...AKARI_EXTRA_STATS_GROUPS,
    ...(extraRawMetrics.length > 0 ? [{ title: '更多原始统计', metrics: extraRawMetrics }] : []),
  ], [extraRawMetrics]);

  useEffect(() => {
    if (activeGroupTitle === '全部') return;
    if (!groups.some((group) => group.title === activeGroupTitle)) {
      setActiveGroupTitle(groups[0]?.title ?? '全部');
    }
  }, [activeGroupTitle, groups]);

  const focusPlayer = participants.find((participant) => participant.puuid === focusPuuid)
    ?? participants.find((participant) => participant.puuid === targetPuuid)
    ?? participants[0];

  const comparePlayer = comparePuuid
    ? participants.find((participant) => participant.puuid === comparePuuid)
    : undefined;

  const highlights = useMemo(() => {
    if (!focusPlayer || participants.length < 2) return [];
    const candidates = STATS_GROUPS.flatMap((group) => (
      group.metrics.flatMap((metric) => {
        const rows = participants.map((player) => {
          const value = getMetricValue(metric, player);
          return {
            player,
            value,
            numericValue: typeof value === 'number' && Number.isFinite(value) ? value : null,
          };
        });
        const numericRows = rows.filter((row) => row.numericValue !== null);
        if (numericRows.length < 2) return [];
        const values = numericRows.map((row) => row.numericValue as number);
        if (Math.max(...values) === Math.min(...values)) return [];
        const sorted = [...numericRows].sort((left, right) => (
          (right.numericValue ?? 0) - (left.numericValue ?? 0)
        ));
        const rank = sorted.findIndex((row) => row.player.puuid === focusPlayer.puuid) + 1;
        const focusRow = rows.find((row) => row.player.puuid === focusPlayer.puuid);
        if (rank <= 0 || !focusRow || focusRow.numericValue === null) return [];
        const normalizedRank = numericRows.length <= 1 ? 0.5 : (rank - 1) / (numericRows.length - 1);
        return [{
          metric,
          groupTitle: group.title,
          tone: statsToneForGroup(group.title),
          value: focusRow.value,
          rank,
          total: numericRows.length,
          extremity: Math.abs(normalizedRank - 0.5) * 2,
        }];
      })
    ));
    candidates.sort((left, right) => right.extremity - left.extremity || left.rank - right.rank);

    const picked: typeof candidates = [];
    const usedGroups = new Set<string>();
    for (const candidate of candidates) {
      if (usedGroups.has(candidate.groupTitle)) continue;
      picked.push(candidate);
      usedGroups.add(candidate.groupTitle);
      if (picked.length === 4) return picked;
    }
    for (const candidate of candidates) {
      if (picked.some((item) => item.metric.key === candidate.metric.key)) continue;
      picked.push(candidate);
      if (picked.length === 4) break;
    }
    return picked;
  }, [focusPlayer, participants]);

  const visibleGroups = useMemo(() => {
    const query = metricFilter.trim().toLocaleLowerCase();
    if (query) {
      return groups
        .map((group) => ({
          ...group,
          metrics: group.metrics.filter((metric) => (
            `${metric.label} ${metric.rawKey || metric.key}`.toLocaleLowerCase().includes(query)
          )),
        }))
        .filter((group) => group.metrics.length > 0);
    }
    if (activeGroupTitle === '全部') return groups;
    return groups.filter((group) => group.title === activeGroupTitle);
  }, [activeGroupTitle, groups, metricFilter]);

  if (!focusPlayer) {
    return <div className="lol-stats lol-stats--empty">暂无可用的详细统计数据</div>;
  }

  return (
    <div
      className={[
        'lol-stats',
        'lol-stats-explorer',
        headerCompact ? 'is-header-compact' : '',
        comparePlayer ? 'is-comparing' : '',
        comparePlayer?.teamId === 100 ? 'is-compare-blue' : '',
        comparePlayer?.teamId === 200 ? 'is-compare-red' : '',
      ].filter(Boolean).join(' ')}
      onScroll={(event) => {
        const scrollTop = event.currentTarget.scrollTop;
        setHeaderCompact((current) => (current ? scrollTop > 52 : scrollTop > 96));
      }}
    >
      <div className="lol-stats-explorer__sticky">
        <div className="lol-stats-explorer__toolbar">
          <div className="lol-stats-explorer__focus">
            <GameIcon
              src={focusPlayer.championAvatar}
              alt={focusPlayer.championName}
              size={32}
              rounded
              className={focusPlayer.teamId === 100 ? 'lol-stats-avatar--blue' : 'lol-stats-avatar--red'}
            />
            <div className="lol-stats-explorer__focus-copy">
              <span>观察对象</span>
              <strong>{playerName(focusPlayer)}</strong>
              <small>{focusPlayer.championName}</small>
            </div>
            {comparePlayer ? (
              <div className="lol-stats-compare-chip">
                <ArrowLeftRight aria-hidden="true" />
                <GameIcon
                  src={comparePlayer.championAvatar}
                  alt={comparePlayer.championName}
                  size={20}
                  rounded
                />
                <span>{playerName(comparePlayer)}</span>
                <button
                  type="button"
                  aria-label="退出双人对比"
                  title="退出双人对比"
                  onClick={() => {
                    setComparePuuid(null);
                    setComparePicking(false);
                  }}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={`lol-stats-compare-trigger ${comparePicking ? 'is-picking' : ''}`}
                onClick={() => {
                  setHeaderCompact(false);
                  setComparePicking((current) => !current);
                }}
              >
                <ArrowLeftRight aria-hidden="true" />
                <span>{comparePicking ? '选择玩家' : '对比玩家'}</span>
              </button>
            )}
          </div>
          <label className="lol-stats-filter">
            <Search aria-hidden="true" />
            <input
              value={metricFilter}
              onChange={(event) => setMetricFilter(event.target.value)}
              placeholder="搜索指标…"
              aria-label="搜索统计指标"
            />
          </label>
        </div>

        <div className="lol-stats-player-strip" role="listbox" aria-label="切换观察玩家">
          {participants.map((player, index) => {
            const isFocused = player.puuid === focusPlayer.puuid;
            const isQueryTarget = player.puuid === targetPuuid;
            return (
              <button
                key={player.puuid}
                type="button"
                role="option"
                aria-selected={isFocused}
                title={`${playerName(player)} · ${player.championName}`}
                className={[
                  'lol-stats-player-choice',
                  player.teamId === 100 ? 'is-blue-team' : 'is-red-team',
                  isFocused ? 'is-active' : '',
                  isQueryTarget ? 'is-query-target' : '',
                  comparePicking && !isFocused ? 'is-compare-candidate' : '',
                  comparePlayer?.puuid === player.puuid ? 'is-compare-target' : '',
                  index === 5 ? 'is-team-break' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => {
                  if (comparePicking) {
                    if (player.puuid === focusPlayer.puuid) {
                      setComparePicking(false);
                      return;
                    }
                    setComparePuuid(player.puuid);
                    setComparePicking(false);
                    setExpandedMetricKey(null);
                    return;
                  }
                  setFocusPuuid(player.puuid);
                  if (comparePuuid === player.puuid) setComparePuuid(null);
                  setExpandedMetricKey(null);
                }}
              >
                <GameIcon
                  src={player.championAvatar}
                  alt={player.championName}
                  size={34}
                  rounded
                  className={player.teamId === 100 ? 'lol-stats-avatar--blue' : 'lol-stats-avatar--red'}
                />
                <span>{playerName(player)}</span>
              </button>
            );
          })}
        </div>

        <div className="lol-stats-category-rail" aria-label="统计分类">
          <button
            type="button"
            className={`lol-stats-tone--neutral ${activeGroupTitle === '全部' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveGroupTitle('全部');
              setExpandedMetricKey(null);
            }}
          >
            <Layers3 aria-hidden="true" />
            <span>全部</span>
          </button>
          {groups.map((group) => (
            <button
              key={group.title}
              type="button"
              className={`lol-stats-tone--${statsToneForGroup(group.title)} ${activeGroupTitle === group.title ? 'is-active' : ''}`}
              onClick={() => {
                setActiveGroupTitle(group.title);
                setExpandedMetricKey(null);
              }}
            >
              <StatsGroupIcon title={group.title} />
              <span>{group.title}</span>
              <small>{group.metrics.length}</small>
            </button>
          ))}
        </div>
      </div>

      {highlights.length > 0 && (
        <div className="lol-stats-highlights" aria-label="本局特征">
          <div className="lol-stats-highlights__lead">
            <span>本局特征</span>
            <small>相对本局 10 人最显著的统计位置</small>
          </div>
          <div className="lol-stats-highlights__items">
            {highlights.map((highlight) => (
              <button
                key={highlight.metric.key}
                type="button"
                className={`lol-stats-highlight lol-stats-tone--${highlight.tone}`}
                onClick={() => {
                  setMetricFilter('');
                  setActiveGroupTitle(highlight.groupTitle);
                  setExpandedMetricKey(highlight.metric.key);
                }}
              >
                <i aria-hidden="true"><StatsGroupIcon title={highlight.groupTitle} /></i>
                <span>
                  <small>{highlight.metric.label}</small>
                  <strong>{formatMetricValue(highlight.metric, highlight.value)}</strong>
                </span>
                <em>#{String(highlight.rank).padStart(2, '0')} / {highlight.total}</em>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="lol-stats-explorer__content">
        {visibleGroups.map((group) => {
          const groupTone = statsToneForGroup(group.title);
          return (
          <section
            key={group.title}
            className={`lol-stats-section lol-stats-tone--${groupTone}`}
          >
            <div className="lol-stats-group-title">
              <div className="lol-stats-group-title__identity">
                <i aria-hidden="true"><StatsGroupIcon title={group.title} /></i>
                <span>{group.title}</span>
              </div>
              <small>{group.metrics.length} 项 · 点击指标展开 10 人对比</small>
            </div>

            <div className="lol-stats-focus-list">
              {group.metrics.map((metric) => {
                const rows = participants.map((player) => {
                  const value = getMetricValue(metric, player);
                  const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : null;
                  return { player, value, numericValue };
                });
                const numericRows = rows.filter((row) => row.numericValue !== null);
                const sortedNumericRows = [...numericRows].sort((left, right) => (
                  (right.numericValue ?? 0) - (left.numericValue ?? 0)
                ));
                const focusRow = rows.find((row) => row.player.puuid === focusPlayer.puuid) ?? rows[0];
                const focusNumeric = focusRow?.numericValue ?? null;
                const numericValues = numericRows.map((row) => row.numericValue as number);
                const minValue = numericValues.length > 0 ? Math.min(...numericValues) : 0;
                const maxValue = numericValues.length > 0 ? Math.max(...numericValues) : 0;
                const focusRank = focusNumeric === null
                  ? null
                  : sortedNumericRows.findIndex((row) => row.player.puuid === focusPlayer.puuid) + 1;
                const compareRow = comparePlayer
                  ? rows.find((row) => row.player.puuid === comparePlayer.puuid)
                  : undefined;
                const compareNumeric = compareRow?.numericValue ?? null;
                const focusRatio = focusNumeric === null
                  ? 0
                  : maxValue === minValue
                    ? (maxValue === 0 ? 0 : 100)
                    : Math.max(0, Math.min(100, ((focusNumeric - minValue) / (maxValue - minValue)) * 100));
                const compareRatio = compareNumeric === null
                  ? 0
                  : maxValue === minValue
                    ? (maxValue === 0 ? 0 : 100)
                    : Math.max(0, Math.min(100, ((compareNumeric - minValue) / (maxValue - minValue)) * 100));
                const deltaLabel = focusNumeric !== null && compareNumeric !== null
                  ? formatMetricDelta(metric, focusNumeric - compareNumeric)
                  : null;
                const expanded = expandedMetricKey === metric.key;
                const comparisonRows = numericRows.length > 0 ? sortedNumericRows : rows;

                return (
                  <article
                    key={metric.key}
                    className={`lol-stats-focus-item lol-stats-tone--${groupTone} ${expanded ? 'is-expanded' : ''}`}
                  >
                    <button
                      type="button"
                      className="lol-stats-focus-item__summary"
                      aria-expanded={expanded}
                      onClick={() => setExpandedMetricKey((current) => (
                        current === metric.key ? null : metric.key
                      ))}
                    >
                      <div className="lol-stats-focus-item__label">
                        <i className="lol-stats-focus-item__dot" aria-hidden="true" />
                        <StatsMetricLabel metric={metric} />
                      </div>

                      <div
                        key={`${focusPlayer.puuid}-${comparePlayer?.puuid ?? 'solo'}-${metric.key}`}
                        className="lol-stats-focus-item__reading lol-stats-value-swap"
                      >
                        <strong>{formatMetricValue(metric, focusRow?.value ?? 0)}</strong>
                        <span className="lol-stats-focus-item__rank">
                          {focusRank && numericRows.length > 0 ? (
                            <>
                              <b>#{String(focusRank).padStart(2, '0')}</b>
                              <em>/ {numericRows.length}</em>
                            </>
                          ) : (
                            <em>{metric.kind === 'boolean' ? '状态指标' : '文本指标'}</em>
                          )}
                        </span>
                        {compareRow && (
                          <span className="lol-stats-focus-item__compare-reading">
                            <ArrowLeftRight aria-hidden="true" />
                            <b>{formatMetricValue(metric, compareRow.value)}</b>
                            {deltaLabel && <em>Δ {deltaLabel}</em>}
                          </span>
                        )}
                      </div>

                      <div
                        className={`lol-stats-focus-item__meter ${compareNumeric !== null ? 'is-comparing' : ''}`}
                        aria-hidden="true"
                      >
                        <i className="is-focus" style={{ width: `${focusRatio}%` }} />
                        {compareNumeric !== null && (
                          <i className="is-compare" style={{ width: `${compareRatio}%` }} />
                        )}
                        {focusRank && numericRows.length > 0 && compareNumeric === null && (
                          <b style={{ left: `${focusRatio}%` }} />
                        )}
                      </div>

                      <ChevronRight
                        aria-hidden="true"
                        className={`lol-stats-focus-item__chevron ${expanded ? 'is-open' : ''}`}
                      />
                    </button>

                    {expanded && (
                      <div className="lol-stats-compare-inline">
                        <div className="lol-stats-compare-inline__head">
                          <span>全场对比</span>
                          <small>
                            {numericRows.length > 0 ? '按数值从高到低排列' : '按双方阵容顺序排列'}
                          </small>
                        </div>
                        <div className="lol-stats-compare-inline__grid">
                          {comparisonRows.map((row, index) => {
                            const ratio = row.numericValue === null
                              ? 0
                              : maxValue === minValue
                                ? (maxValue === 0 ? 0 : 100)
                                : Math.max(0, Math.min(
                                    100,
                                    ((row.numericValue - minValue) / (maxValue - minValue)) * 100,
                                  ));
                            const isFocused = row.player.puuid === focusPlayer.puuid;
                            return (
                              <div
                                key={`${metric.key}-compare-${row.player.puuid}`}
                                className={`lol-stats-compare-inline__row ${isFocused ? 'is-focused' : ''}`}
                              >
                                <em>{String(index + 1).padStart(2, '0')}</em>
                                <GameIcon
                                  src={row.player.championAvatar}
                                  alt={row.player.championName}
                                  size={26}
                                  rounded
                                />
                                <span title={playerName(row.player)}>{playerName(row.player)}</span>
                                <i aria-hidden="true"><b style={{ width: `${ratio}%` }} /></i>
                                <strong>{formatMetricValue(metric, row.value)}</strong>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
          );
        })}

        {visibleGroups.length === 0 && (
          <div className="lol-stats-explorer__empty">
            没有找到与“{metricFilter}”匹配的统计指标
          </div>
        )}
      </div>
    </div>
  );
}

function timelineEvents(timeline: MatchTimeline | null): MatchTimelineEvent[] {
  return timeline?.frames.flatMap((frame) => frame.events ?? [])
    .sort((a, b) => a.timestamp - b.timestamp) ?? [];
}

function formatEventTime(timestamp: number): string {
  const totalSeconds = Math.max(0, Math.floor(timestamp / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function formatBuildTime(timestamp: number): string {
  const totalSeconds = Math.max(0, Math.floor(timestamp / 1000));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

type BuildPurchaseNode =
  | { kind: 'item'; event: MatchTimelineEvent }
  | { kind: 'spacer'; timestamp: number };

function buildPurchaseSequence(events: MatchTimelineEvent[]): BuildPurchaseNode[] {
  const nodes: BuildPurchaseNode[] = [];
  let previousTimestamp = 0;
  events
    .filter((event) => event.type === 'ITEM_PURCHASED')
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((event) => {
      if (previousTimestamp > 0 && event.timestamp - previousTimestamp > 30_000) {
        nodes.push({ kind: 'spacer', timestamp: event.timestamp });
      }
      nodes.push({ kind: 'item', event });
      previousTimestamp = event.timestamp;
    });
  return nodes;
}

function participantIndex(participants: MatchParticipantSummary[]) {
  return new Map(participants.map((participant, index) => [
    participant.participantId || index + 1,
    participant,
  ]));
}

type EventFilterKey = 'kill' | 'multi' | 'objective' | 'building';
type EventPrimaryFilter = 'all' | EventFilterKey;

const EVENT_FILTER_KEYS: EventFilterKey[] = ['kill', 'multi', 'objective', 'building'];
const EVENT_PRIMARY_FILTERS: EventPrimaryFilter[] = ['all', ...EVENT_FILTER_KEYS];

function eventParticipantIds(event: MatchTimelineEvent): number[] {
  return [
    event.killerId,
    event.victimId,
    event.participantId,
    event.creatorId,
    ...(event.assistingParticipantIds ?? []),
  ].filter((value): value is number => Boolean(value && value > 0));
}

function eventFilterKey(event: MatchTimelineEvent): EventFilterKey | null {
  if (event.type === 'CHAMPION_KILL') {
    return (event.multiKillLength ?? 0) >= 2 ? 'multi' : 'kill';
  }
  if (event.type === 'ELITE_MONSTER_KILL') return 'objective';
  if (event.type === 'BUILDING_KILL' || event.type === 'TURRET_PLATE_DESTROYED') return 'building';
  return null;
}

function eventFilterLabel(filter: EventFilterKey): string {
  if (filter === 'kill') return '击杀';
  if (filter === 'multi') return '多杀';
  if (filter === 'objective') return '史诗野怪';
  return '建筑';
}

function eventPrimaryFilterLabel(filter: EventPrimaryFilter): string {
  if (filter === 'all') return '全部事件';
  if (filter === 'kill') return '英雄击杀';
  return eventFilterLabel(filter);
}

function eventMatchesPrimaryFilter(event: MatchTimelineEvent, filter: EventPrimaryFilter): boolean {
  if (filter === 'all') return eventFilterKey(event) !== null;
  if (filter === 'kill') return event.type === 'CHAMPION_KILL';
  if (filter === 'multi') return event.type === 'CHAMPION_KILL' && (event.multiKillLength ?? 0) >= 2;
  if (filter === 'objective') return event.type === 'ELITE_MONSTER_KILL';
  return event.type === 'BUILDING_KILL' || event.type === 'TURRET_PLATE_DESTROYED';
}

function eventTypeMark(event: MatchTimelineEvent): string {
  if (event.type === 'ELITE_MONSTER_KILL') {
    const monster = String(event.monsterSubType || event.monsterType || '').toUpperCase();
    if (monster.includes('BARON')) return '男';
    if (monster.includes('HERALD')) return '峡';
    if (monster.includes('HORDE')) return '巢';
    if (monster.includes('DRAGON')) return '龙';
    return '野';
  }
  if (event.type === 'TURRET_PLATE_DESTROYED') return '皮';
  if (event.type === 'BUILDING_KILL') {
    const building = String(event.buildingType || '').toUpperCase();
    return building.includes('INHIBITOR') ? '晶' : '塔';
  }
  if (event.type === 'CHAMPION_KILL') return String(Math.max(1, event.multiKillLength ?? 1));
  return '·';
}

function EventTypeMark({ event }: { event: MatchTimelineEvent }) {
  const filter = eventFilterKey(event);
  return (
    <span className={`lol-event-type-mark lol-event-type-mark--${filter ?? 'muted'}`}>
      {eventTypeMark(event)}
    </span>
  );
}

function eventMonsterName(event: MatchTimelineEvent): string {
  const key = String(event.monsterSubType || event.monsterType || '').toUpperCase();
  const names: Record<string, string> = {
    BARON_NASHOR: '纳什男爵',
    RIFTHERALD: '峡谷先锋',
    RIFT_HERALD: '峡谷先锋',
    HORDE: '虚空巢虫',
    DRAGON: '元素亚龙',
    AIR_DRAGON: '云端亚龙',
    WATER_DRAGON: '海洋亚龙',
    EARTH_DRAGON: '山脉亚龙',
    FIRE_DRAGON: '炼狱亚龙',
    HEXTECH_DRAGON: '海克斯科技亚龙',
    CHEMTECH_DRAGON: '炼金科技亚龙',
    ELDER_DRAGON: '远古巨龙',
  };
  return names[key] ?? (key ? key.replaceAll('_', ' ').toLowerCase() : '史诗野怪');
}

function eventLaneName(laneType?: string): string {
  const lane = String(laneType || '').toUpperCase();
  if (lane.includes('TOP')) return '上路';
  if (lane.includes('MID')) return '中路';
  if (lane.includes('BOT')) return '下路';
  return '';
}

function eventBuildingName(event: MatchTimelineEvent): string {
  if (event.type === 'TURRET_PLATE_DESTROYED') return `${eventLaneName(event.laneType)}塔皮`;
  const type = String(event.buildingType || '').toUpperCase();
  if (type.includes('INHIBITOR')) return `${eventLaneName(event.laneType)}召唤水晶`;
  if (type.includes('NEXUS')) return '基地防御建筑';
  return `${eventLaneName(event.laneType)}防御塔`;
}

function eventCopy(event: MatchTimelineEvent, names: Map<number, MatchParticipantSummary>): {
  title: string;
  detail: string;
  tone: string;
} {
  const actor = names.get(event.killerId || event.participantId || event.creatorId || 0);
  const victim = names.get(event.victimId || 0);
  const actorName = actor ? playerName(actor) : '地图';
  const victimName = victim ? playerName(victim) : '';
  switch (event.type) {
    case 'CHAMPION_KILL':
      return {
        title: `${actorName} → ${victimName || '未知英雄'}`,
        detail: `${event.assistingParticipantIds?.length ?? 0} 次助攻${event.shutdownBounty ? ` · 终结赏金 ${event.shutdownBounty}` : ''}`,
        tone: actor?.teamId === 200 ? 'red' : 'blue',
      };
    case 'ELITE_MONSTER_KILL':
      return { title: `${actorName} · ${eventMonsterName(event)}`, detail: '团队地图资源', tone: 'gold' };
    case 'BUILDING_KILL':
      return { title: `${actorName} · ${eventBuildingName(event)}`, detail: '地图推进', tone: actor?.teamId === 200 ? 'red' : 'blue' };
    case 'TURRET_PLATE_DESTROYED':
      return { title: `${actorName} · ${eventBuildingName(event)}`, detail: '防御塔镀层', tone: actor?.teamId === 200 ? 'red' : 'blue' };
    case 'GAME_END':
      return { title: '对局结束', detail: `获胜方：${event.winningTeam === 200 ? '红方' : '蓝方'}`, tone: 'gold' };
    default:
      return { title: event.type.replaceAll('_', ' ').toLowerCase(), detail: actorName, tone: 'muted' };
  }
}

interface EventEntry {
  key: string;
  event: MatchTimelineEvent;
  index: number;
}

type EventStreamNode =
  | { kind: 'event'; entry: EventEntry; gapMs: number }
  | { kind: 'fight'; entries: EventEntry[]; start: number; end: number; gapMs: number };

function buildEventStreamNodes(entries: EventEntry[]): EventStreamNode[] {
  const nodes: EventStreamNode[] = [];
  let index = 0;
  let previousEnd = 0;

  while (index < entries.length) {
    const current = entries[index];
    if (current.event.type === 'CHAMPION_KILL') {
      const fightEntries = [current];
      let cursor = index + 1;
      while (cursor < entries.length) {
        const next = entries[cursor];
        const previous = fightEntries.at(-1);
        if (
          next.event.type !== 'CHAMPION_KILL'
          || !previous
          || next.event.timestamp - previous.event.timestamp > 5_000
          || next.event.timestamp - current.event.timestamp > 15_000
        ) {
          break;
        }
        fightEntries.push(next);
        cursor += 1;
      }
      if (fightEntries.length >= 2) {
        const start = fightEntries[0].event.timestamp;
        const end = fightEntries.at(-1)?.event.timestamp ?? start;
        nodes.push({
          kind: 'fight',
          entries: fightEntries,
          start,
          end,
          gapMs: nodes.length > 0 ? Math.max(0, start - previousEnd) : 0,
        });
        previousEnd = end;
        index = cursor;
        continue;
      }
    }

    nodes.push({
      kind: 'event',
      entry: current,
      gapMs: nodes.length > 0 ? Math.max(0, current.event.timestamp - previousEnd) : 0,
    });
    previousEnd = current.event.timestamp;
    index += 1;
  }

  return nodes;
}

function eventGapClass(gapMs: number): string {
  if (gapMs <= 5_000) return 'lol-event-gap--tight';
  if (gapMs <= 30_000) return 'lol-event-gap--near';
  return 'lol-event-gap--far';
}

function timelineDamageValue(row: MatchTimelineDamageRecord): number {
  if (Number.isFinite(row.damage) && (row.damage ?? 0) > 0) return row.damage ?? 0;
  return Math.max(
    0,
    (row.physicalDamage ?? 0) + (row.magicDamage ?? 0) + (row.trueDamage ?? 0),
  );
}

type TimelineDamageSourceKey = 'AA' | 'P' | 'Q' | 'W' | 'E' | 'R' | string;

function timelineDamageSourceKey(row: MatchTimelineDamageRecord): TimelineDamageSourceKey {
  if (row.basic) return 'AA';
  const raw = String(row.spellName || '').trim().toLowerCase();
  if (raw.includes('passive')) return 'P';

  const slot = row.spellSlot;
  if (slot === 0) return 'Q';
  if (slot === 1) return 'W';
  if (slot === 2) return 'E';
  if (slot === 3) return 'R';

  if (raw.includes('summonerdot') || raw.includes('ignite')) return 'OTHER:IGNITE';
  if (raw.includes('smite')) return 'OTHER:SMITE';
  if (/^\d+(active|passive)/.test(raw)) return `OTHER:ITEM:${raw}`;
  const type = String(row.type || '').toUpperCase();
  if (type === 'MONSTER') return `OTHER:MONSTER:${raw || row.name || 'unknown'}`;
  if (type === 'MINION') return `OTHER:MINION:${raw || row.name || 'unknown'}`;
  return `OTHER:${raw || type || 'unknown'}`;
}

function timelineDamageSource(row: MatchTimelineDamageRecord): string {
  const key = timelineDamageSourceKey(row);
  if (key === 'AA') return '普通攻击';
  if (key === 'P') return '被动效果';
  if (key === 'Q') return 'Q 技能';
  if (key === 'W') return 'W 技能';
  if (key === 'E') return 'E 技能';
  if (key === 'R') return 'R 技能';
  if (key === 'OTHER:IGNITE') return '点燃';
  if (key === 'OTHER:SMITE') return '惩戒';
  if (key.startsWith('OTHER:ITEM:')) return '装备效果';
  if (key.startsWith('OTHER:MONSTER:')) return '野怪伤害';
  if (key.startsWith('OTHER:MINION:')) return '小兵伤害';
  return '其他来源';
}

function aggregateTimelineDamage(rows: MatchTimelineDamageRecord[]): MatchTimelineDamageRecord[] {
  const grouped = new Map<string, MatchTimelineDamageRecord>();

  rows.forEach((row) => {
    const damage = timelineDamageValue(row);
    if (damage <= 0) return;
    const sourceKey = timelineDamageSourceKey(row);
    const key = `${row.participantId ?? 0}|${sourceKey}`;
    const previous = grouped.get(key);

    if (!previous) {
      grouped.set(key, {
        ...row,
        damage,
        physicalDamage: row.physicalDamage ?? 0,
        magicDamage: row.magicDamage ?? 0,
        trueDamage: row.trueDamage ?? 0,
      });
      return;
    }

    grouped.set(key, {
      ...previous,
      damage: (previous.damage ?? 0) + damage,
      physicalDamage: (previous.physicalDamage ?? 0) + (row.physicalDamage ?? 0),
      magicDamage: (previous.magicDamage ?? 0) + (row.magicDamage ?? 0),
      trueDamage: (previous.trueDamage ?? 0) + (row.trueDamage ?? 0),
    });
  });

  return [...grouped.values()].sort((left, right) => (
    timelineDamageValue(right) - timelineDamageValue(left)
  ));
}

interface TimelineDamageGroup {
  participantId: number;
  total: number;
  sources: MatchTimelineDamageRecord[];
}

function groupTimelineDamageByChampion(rows: MatchTimelineDamageRecord[]): TimelineDamageGroup[] {
  const sourceRows = aggregateTimelineDamage(rows);
  const groups = new Map<number, TimelineDamageGroup>();

  sourceRows.forEach((row) => {
    const participantId = row.participantId ?? 0;
    const damage = timelineDamageValue(row);
    const current = groups.get(participantId);
    if (current) {
      current.total += damage;
      current.sources.push(row);
      return;
    }
    groups.set(participantId, {
      participantId,
      total: damage,
      sources: [row],
    });
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      sources: [...group.sources].sort((left, right) => (
        timelineDamageValue(right) - timelineDamageValue(left)
      )),
    }))
    .sort((left, right) => right.total - left.total);
}

function timelineDamageSourceBadge(row: MatchTimelineDamageRecord): string {
  const key = timelineDamageSourceKey(row);
  if (['AA', 'P', 'Q', 'W', 'E', 'R'].includes(key)) return key;
  if (key === 'OTHER:IGNITE') return '点';
  if (key === 'OTHER:SMITE') return '惩';
  if (key.startsWith('OTHER:ITEM:')) return '装';
  if (key.startsWith('OTHER:MONSTER:')) return '野';
  if (key.startsWith('OTHER:MINION:')) return '兵';
  return '·';
}

function timelineDamageAbilityMeta(
  row: MatchTimelineDamageRecord,
  guide?: AssistChampionGuide,
): { badge: string; label: string; icon: string } {
  const key = timelineDamageSourceKey(row);
  if (key === 'P') {
    return {
      badge: 'P',
      label: guide?.passive?.name ? `被动 · ${guide.passive.name}` : '被动效果',
      icon: guide?.passive?.icon ?? '',
    };
  }
  if (key === 'Q' || key === 'W' || key === 'E' || key === 'R') {
    const spell = guide?.spells.find((item) => item.key === key);
    return {
      badge: key,
      label: spell?.name ? `${key} · ${spell.name}` : `${key} 技能`,
      icon: spell?.icon ?? '',
    };
  }
  return {
    badge: timelineDamageSourceBadge(row),
    label: timelineDamageSource(row),
    icon: '',
  };
}

function DamageAbilityIcon({
  row,
  guide,
}: {
  row: MatchTimelineDamageRecord;
  guide?: AssistChampionGuide;
}) {
  const meta = timelineDamageAbilityMeta(row, guide);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [meta.icon]);

  if (meta.icon && !failed) {
    return (
      <img
        src={meta.icon}
        alt=""
        aria-hidden="true"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="lol-event-damage-source__icon"
      />
    );
  }

  return <i className="lol-event-damage-source__fallback">{meta.badge}</i>;
}

function sameParticipantSet(current: Set<number>, expected: number[]): boolean {
  return current.size === expected.length && expected.every((id) => current.has(id));
}

function eventMapId(queueId: number): number | null {
  if (queueId === 450) return 12;
  if ([400, 420, 430, 440, 490].includes(queueId)) return 11;
  return null;
}

function eventMapAssetUrl(mapId: number | null, gameVersion?: string): string {
  if (!mapId) return '';
  const match = gameVersion?.match(/^(\d+)\.(\d+)/);
  if (!match) return '';
  return `https://ddragon.leagueoflegends.com/cdn/${match[1]}.${match[2]}.1/img/map/map${mapId}.png`;
}

function TimelineEmpty({ loading, error }: { loading: boolean; error?: string }) {
  return (
    <div className="lol-timeline-empty">
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : null}
      <strong>{loading ? '正在读取客户端时间线' : '这场对局没有可用时间线'}</strong>
      {!loading && <span>{error || '较早的对局可能已不在本地客户端缓存中'}</span>}
    </div>
  );
}

function EventsTab({
  participants,
  timeline,
  loading,
  error,
  queueId,
  gameVersion,
  gameDuration,
}: {
  participants: MatchParticipantSummary[];
  timeline: MatchTimeline | null;
  loading: boolean;
  error?: string;
  queueId: number;
  gameVersion?: string;
  gameDuration: number;
}) {
  const names = useMemo(() => participantIndex(participants), [participants]);
  const allEvents = useMemo(() => timelineEvents(timeline), [timeline]);
  const eventRefs = useRef(new Map<string, HTMLElement>());
  const [typeFilter, setTypeFilter] = useState<EventPrimaryFilter>('all');
  const [championFilters, setChampionFilters] = useState<Set<number> | null>(null);
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(null);
  const [abilityGuides, setAbilityGuides] = useState<Record<number, AssistChampionGuide>>({});

  const entries = useMemo<EventEntry[]>(() => (
    allEvents
      .map((event, index) => ({
        event,
        index,
        key: `${event.timestamp}-${event.type}-${event.killerId ?? event.participantId ?? 0}-${event.victimId ?? 0}-${index}`,
      }))
      .filter((entry) => eventFilterKey(entry.event) !== null)
  ), [allEvents]);

  const primaryCounts = useMemo<Record<EventPrimaryFilter, number>>(() => ({
    all: entries.length,
    kill: entries.filter((entry) => entry.event.type === 'CHAMPION_KILL').length,
    multi: entries.filter((entry) => (
      entry.event.type === 'CHAMPION_KILL' && (entry.event.multiKillLength ?? 0) >= 2
    )).length,
    objective: entries.filter((entry) => entry.event.type === 'ELITE_MONSTER_KILL').length,
    building: entries.filter((entry) => (
      entry.event.type === 'BUILDING_KILL' || entry.event.type === 'TURRET_PLATE_DESTROYED'
    )).length,
  }), [entries]);

  const filteredEntries = useMemo(() => entries.filter((entry) => {
    if (!eventMatchesPrimaryFilter(entry.event, typeFilter)) return false;
    if (championFilters === null) return true;
    return eventParticipantIds(entry.event).some((id) => championFilters.has(id));
  }), [championFilters, entries, typeFilter]);

  const filteredKeys = useMemo(
    () => new Set(filteredEntries.map((entry) => entry.key)),
    [filteredEntries],
  );

  const streamNodes = useMemo(() => buildEventStreamNodes(filteredEntries), [filteredEntries]);
  const selectedEntry = selectedEventKey
    ? entries.find((entry) => entry.key === selectedEventKey)
    : undefined;
  const selectedEvent = selectedEntry?.event;
  const selectedCopy = selectedEvent ? eventCopy(selectedEvent, names) : undefined;
  const selectedKiller = selectedEvent ? names.get(selectedEvent.killerId ?? selectedEvent.participantId ?? selectedEvent.creatorId ?? 0) : undefined;
  const selectedVictim = selectedEvent ? names.get(selectedEvent.victimId ?? 0) : undefined;
  const selectedAssists = selectedEvent
    ? (selectedEvent.assistingParticipantIds ?? []).map((id) => names.get(id)).filter(Boolean) as MatchParticipantSummary[]
    : [];
  const selectedDamageGroups = useMemo(
    () => groupTimelineDamageByChampion(selectedEvent?.victimDamageReceived ?? []),
    [selectedEvent],
  );
  const selectedDamageTotal = selectedDamageGroups.reduce((sum, group) => sum + group.total, 0);

  useEffect(() => {
    const championIds = [...new Set(
      selectedDamageGroups
        .map((group) => names.get(group.participantId)?.championId ?? 0)
        .filter((championId) => championId > 0),
    )];
    const missingIds = championIds.filter((championId) => !abilityGuides[championId]);
    if (missingIds.length === 0) return;

    let cancelled = false;
    void Promise.all(
      missingIds.map((championId) => (
        window.lolHelper.assist.getChampionGuide(championId)
          .catch(() => null)
      )),
    ).then((guides) => {
      if (cancelled) return;
      const loaded = guides.filter((guide): guide is AssistChampionGuide => Boolean(guide));
      if (loaded.length === 0) return;
      setAbilityGuides((current) => {
        const next = { ...current };
        loaded.forEach((guide) => {
          next[guide.championId] = guide;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [abilityGuides, names, selectedDamageGroups]);

  const lastTimelineTimestamp = timeline?.frames.at(-1)?.timestamp ?? 0;
  const gameDurationMs = gameDuration > 100_000 ? gameDuration : gameDuration * 1_000;
  const durationMs = Math.max(1, lastTimelineTimestamp, gameDurationMs);
  const mapId = eventMapId(queueId);
  const mapUrl = eventMapAssetUrl(mapId, gameVersion);
  const mapLabel = mapId === 11 ? '召唤师峡谷' : mapId === 12 ? '嚎哭深渊' : '事件坐标';

  if (!timeline) return <TimelineEmpty loading={loading} error={error} />;

  const toggleChampion = (participantId: number) => {
    setChampionFilters((current) => {
      if (current === null) return new Set([participantId]);
      const next = new Set(current);
      if (next.has(participantId)) next.delete(participantId);
      else next.add(participantId);
      return next;
    });
  };

  const scrollToEvent = (entry: EventEntry) => {
    setTypeFilter('all');
    setChampionFilters(null);
    setSelectedEventKey(entry.key);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        eventRefs.current.get(entry.key)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  };

  const renderEventEntry = (entry: EventEntry, clustered = false) => {
    const { event } = entry;
    const filter = eventFilterKey(event);
    const copy = eventCopy(event, names);
    const killer = names.get(event.killerId ?? event.participantId ?? event.creatorId ?? 0);
    const victim = names.get(event.victimId ?? 0);
    const assists = (event.assistingParticipantIds ?? [])
      .map((id) => names.get(id))
      .filter(Boolean) as MatchParticipantSummary[];
    const selected = selectedEventKey === entry.key;

    return (
      <article
        key={entry.key}
        ref={(node) => {
          if (node) eventRefs.current.set(entry.key, node);
          else eventRefs.current.delete(entry.key);
        }}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        className={[
          'lol-event-analyzer__event',
          `lol-event-analyzer__event--${copy.tone}`,
          filter ? `lol-event-analyzer__event--${filter}` : '',
          clustered ? 'is-clustered' : '',
          selected ? 'is-selected' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => setSelectedEventKey(entry.key)}
        onKeyDown={(keyboardEvent) => {
          if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
            keyboardEvent.preventDefault();
            setSelectedEventKey(entry.key);
          }
        }}
      >
        <time>{formatEventTime(event.timestamp)}</time>
        <span
          className={[
            'lol-event-analyzer__node',
            event.type === 'CHAMPION_KILL' && killer ? 'is-champion' : '',
          ].filter(Boolean).join(' ')}
          aria-hidden="true"
        >
          {event.type === 'CHAMPION_KILL' && killer ? (
            <>
              <GameIcon src={killer.championAvatar} alt="" size={24} rounded />
              {(event.multiKillLength ?? 0) >= 2 && (
                <b className="lol-event-analyzer__node-count">{event.multiKillLength}</b>
              )}
            </>
          ) : (
            <EventTypeMark event={event} />
          )}
        </span>

        <div className="lol-event-analyzer__event-body">
          {event.type === 'CHAMPION_KILL' ? (
            <>
              <div className="lol-event-analyzer__kill-meta">
                <span className={`lol-event-analyzer__kind lol-event-analyzer__kind--${filter ?? 'kill'}`}>
                  {filter === 'multi' ? `${event.multiKillLength} 杀` : '击杀'}
                </span>
                {event.shutdownBounty ? <em>终结赏金 {event.shutdownBounty}</em> : null}
              </div>

              <div className="lol-event-analyzer__kill-flow">
                <span className="lol-event-analyzer__combatant">
                  {killer ? (
                    <GameIcon src={killer.championAvatar} alt={killer.championName} size={34} rounded />
                  ) : (
                    <i className="lol-event-analyzer__unknown-avatar"><Swords aria-hidden="true" /></i>
                  )}
                  <b>{killer ? playerName(killer) : '未知来源'}</b>
                </span>
                <ChevronRight aria-hidden="true" />
                <span className="lol-event-analyzer__combatant lol-event-analyzer__combatant--victim">
                  {victim ? (
                    <GameIcon src={victim.championAvatar} alt={victim.championName} size={34} rounded />
                  ) : (
                    <i className="lol-event-analyzer__unknown-avatar"><Skull aria-hidden="true" /></i>
                  )}
                  <b>{victim ? playerName(victim) : '未知英雄'}</b>
                </span>
              </div>

              {assists.length > 0 && (
                <div className="lol-event-analyzer__assists">
                  <span>助攻</span>
                  <div>
                    {assists.map((participant) => (
                      <GameIcon
                        key={participant.puuid}
                        src={participant.championAvatar}
                        alt={participant.championName}
                        title={playerName(participant)}
                        size={22}
                        rounded
                      />
                    ))}
                  </div>
                  <small>{assists.length} 人参与</small>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="lol-event-analyzer__objective-head">
                <span className={`lol-event-analyzer__kind lol-event-analyzer__kind--${filter ?? 'building'}`}>
                  {filter ? eventFilterLabel(filter) : '事件'}
                </span>
              </div>
              <div className="lol-event-analyzer__objective-copy">
                {killer && <GameIcon src={killer.championAvatar} alt={killer.championName} size={30} rounded />}
                <div>
                  <strong>{copy.title}</strong>
                  <small>{copy.detail}</small>
                </div>
              </div>
            </>
          )}
        </div>
      </article>
    );
  };

  const bluePlayers = participants.filter((participant) => participant.teamId === 100);
  const redPlayers = participants.filter((participant) => participant.teamId === 200);
  const blueParticipantIds = bluePlayers.map((participant, index) => participant.participantId || index + 1);
  const redParticipantIds = redPlayers.map((participant, index) => participant.participantId || index + 6);
  const allPlayersActive = championFilters === null;
  const blueScopeActive = championFilters !== null && sameParticipantSet(championFilters, blueParticipantIds);
  const redScopeActive = championFilters !== null && sameParticipantSet(championFilters, redParticipantIds);

  return (
    <div className="lol-event-analyzer">
      <header className="lol-event-analyzer__overview">
        <div className="lol-event-analyzer__overview-copy">
          <strong>事件 <b>{filteredEntries.length}</b><small> / {entries.length}</small></strong>
          <small>
            {primaryCounts.kill} 击杀 · {primaryCounts.objective} 史诗目标 · {primaryCounts.building} 建筑
          </small>
        </div>

        <div className="lol-event-density" aria-label="整局事件密度">
          <div className="lol-event-density__labels">
            <span>00:00</span>
            <span>{formatEventTime(durationMs)}</span>
          </div>
          <div className="lol-event-density__track">
            {entries.map((entry, index) => {
              const filter = eventFilterKey(entry.event);
              const copy = eventCopy(entry.event, names);
              const left = Math.max(0, Math.min(100, (entry.event.timestamp / durationMs) * 100));
              return (
                <button
                  key={`density-${entry.key}`}
                  type="button"
                  className={[
                    'lol-event-density__mark',
                    filter ? `lol-event-density__mark--${filter}` : '',
                    `lol-event-density__mark--${copy.tone}`,
                    filteredKeys.has(entry.key) ? '' : 'is-muted',
                    selectedEventKey === entry.key ? 'is-selected' : '',
                  ].filter(Boolean).join(' ')}
                  style={{
                    left: `${left}%`,
                    top: `${3 + (index % 3) * 5}px`,
                  }}
                  title={`${formatEventTime(entry.event.timestamp)} · ${eventCopy(entry.event, names).title}`}
                  aria-label={`跳转到 ${formatEventTime(entry.event.timestamp)} ${eventCopy(entry.event, names).title}`}
                  onClick={() => scrollToEvent(entry)}
                />
              );
            })}
          </div>
        </div>
      </header>

      <div className="lol-event-analyzer__layout">
        <div className="lol-event-analyzer__stream">
          <div className="lol-event-analyzer__boundary">
            <time>00:00</time>
            <span><CirclePlay aria-hidden="true" /></span>
            <strong>开始游戏</strong>
          </div>

          {streamNodes.length === 0 && (
            <div className="lol-event-analyzer__empty">
              <Layers3 aria-hidden="true" />
              <strong>无匹配事件</strong>
            </div>
          )}

          {streamNodes.map((node, nodeIndex) => {
            if (node.kind === 'event') {
              return (
                <div
                  key={`node-${node.entry.key}`}
                  className={`lol-event-analyzer__node-wrap ${eventGapClass(node.gapMs)}`}
                >
                  {renderEventEntry(node.entry)}
                </div>
              );
            }

            const blueKills = node.entries.filter((entry) => names.get(entry.event.killerId ?? 0)?.teamId === 100).length;
            const redKills = node.entries.length - blueKills;
            const fightKillers = node.entries
              .map((entry) => names.get(entry.event.killerId ?? 0))
              .filter((participant): participant is MatchParticipantSummary => Boolean(participant))
              .filter((participant, index, list) => (
                list.findIndex((item) => item.puuid === participant.puuid) === index
              ))
              .slice(0, 3);
            return (
              <section
                key={`fight-${node.start}-${nodeIndex}`}
                className={`lol-fight-window ${eventGapClass(node.gapMs)}`}
              >
                <div className="lol-fight-window__head">
                  <time>
                    {formatEventTime(node.start)}
                    {node.end !== node.start ? <span>—{formatEventTime(node.end)}</span> : null}
                  </time>
                  <span className="lol-fight-window__killers" aria-hidden="true">
                    {fightKillers.map((participant) => (
                      <GameIcon
                        key={participant.puuid}
                        src={participant.championAvatar}
                        alt=""
                        size={22}
                        rounded
                      />
                    ))}
                  </span>
                  <div>
                    <strong>战斗窗口</strong>
                    <small>
                      {node.entries.length} 次连续击杀 ·
                      <b className="is-blue"> 蓝 {blueKills}</b>
                      <b className="is-red"> 红 {redKills}</b>
                    </small>
                  </div>
                </div>
                <div className="lol-fight-window__events">
                  {node.entries.map((entry) => renderEventEntry(entry, true))}
                </div>
              </section>
            );
          })}

          <div className="lol-event-analyzer__boundary lol-event-analyzer__boundary--end">
            <time>{formatEventTime(lastTimelineTimestamp || durationMs)}</time>
            <span><Layers3 aria-hidden="true" /></span>
            <strong>对局结束</strong>
          </div>
        </div>

        <aside className="lol-event-inspector">
          {selectedEvent && selectedEntry && selectedCopy ? (
            <div className="lol-event-inspector__selected">
              <div className="lol-event-inspector__head">
                <button
                  type="button"
                  onClick={() => setSelectedEventKey(null)}
                  aria-label="返回事件筛选"
                  title="返回事件筛选"
                >
                  <ChevronLeft aria-hidden="true" />
                </button>
                <div>
                  <strong>{formatEventTime(selectedEvent.timestamp)}</strong>
                </div>
                <i
                  className={[
                    'lol-event-inspector__event-icon',
                    `lol-event-inspector__event-icon--${selectedCopy.tone}`,
                    selectedEvent.type === 'CHAMPION_KILL' && selectedKiller ? 'is-champion' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {selectedEvent.type === 'CHAMPION_KILL' && selectedKiller ? (
                    <GameIcon
                      src={selectedKiller.championAvatar}
                      alt={selectedKiller.championName}
                      size={32}
                      rounded
                    />
                  ) : (
                    <EventTypeMark event={selectedEvent} />
                  )}
                </i>
              </div>

              {selectedEvent.type === 'CHAMPION_KILL' && (
                <div className="lol-event-inspector__combat">
                  <div>
                    {selectedKiller && <GameIcon src={selectedKiller.championAvatar} alt={selectedKiller.championName} size={38} rounded />}
                    <span>
                      <small>击杀者</small>
                      <strong>{selectedKiller ? playerName(selectedKiller) : '未知来源'}</strong>
                    </span>
                  </div>
                  <ChevronRight aria-hidden="true" />
                  <div>
                    {selectedVictim && <GameIcon src={selectedVictim.championAvatar} alt={selectedVictim.championName} size={38} rounded />}
                    <span>
                      <small>阵亡者</small>
                      <strong>{selectedVictim ? playerName(selectedVictim) : '未知英雄'}</strong>
                    </span>
                  </div>
                </div>
              )}

              {selectedAssists.length > 0 && (
                <section className="lol-event-inspector__section">
                  <div className="lol-event-inspector__section-title">
                    <span>助攻参与</span>
                    <small>{selectedAssists.length} 人</small>
                  </div>
                  <div className="lol-event-inspector__assist-grid">
                    {selectedAssists.map((participant) => (
                      <div key={participant.puuid}>
                        <GameIcon src={participant.championAvatar} alt={participant.championName} size={26} rounded />
                        <span>{playerName(participant)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {selectedEvent.position && (
                <section className="lol-event-inspector__section">
                  <div className="lol-event-inspector__section-title">
                    <span>发生位置</span>
                    <small>{mapLabel}</small>
                  </div>
                  <div className={`lol-event-map lol-event-map--${mapId ?? 'fallback'}`}>
                    {mapUrl && (
                      <img
                        src={mapUrl}
                        alt={`${mapLabel}事件位置`}
                        onError={(imageEvent) => {
                          imageEvent.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                    <span
                      className={`lol-event-map__dot lol-event-map__dot--${selectedCopy.tone}`}
                      style={{
                        left: `${Math.max(3, Math.min(97, (selectedEvent.position.x / 15000) * 100))}%`,
                        bottom: `${Math.max(3, Math.min(97, (selectedEvent.position.y / 15000) * 100))}%`,
                      }}
                    />
                    <small>X {selectedEvent.position.x} · Y {selectedEvent.position.y}</small>
                  </div>
                </section>
              )}

              {selectedDamageGroups.length > 0 && (
                <section className="lol-event-inspector__section lol-event-inspector__section--damage">
                  <div className="lol-event-inspector__section-title">
                    <span>伤害贡献</span>
                    <small>{formatInteger(selectedDamageTotal)}</small>
                  </div>
                  <div className="lol-event-damage-groups">
                    {selectedDamageGroups.map((group) => {
                      const dealer = names.get(group.participantId);
                      const guide = dealer ? abilityGuides[dealer.championId] : undefined;
                      const totalShare = selectedDamageTotal > 0 ? (group.total / selectedDamageTotal) * 100 : 0;
                      return (
                        <article
                          key={`damage-group-${group.participantId}`}
                          className="lol-event-damage-group"
                        >
                          <div className="lol-event-damage-group__head">
                            {dealer ? (
                              <GameIcon src={dealer.championAvatar} alt={dealer.championName} size={36} rounded />
                            ) : (
                              <i className="lol-event-damage-group__unknown"><Flame aria-hidden="true" /></i>
                            )}
                            <span>
                              <strong>{dealer ? playerName(dealer) : '其他来源'}</strong>
                              <small>{group.sources.length} 个伤害来源</small>
                            </span>
                            <div aria-hidden="true">
                              <i style={{ width: `${totalShare}%` }} />
                            </div>
                            <em>{formatInteger(group.total)}</em>
                            <b>{totalShare.toFixed(0)}%</b>
                          </div>

                          <div className="lol-event-damage-sources">
                            {group.sources.map((row, sourceIndex) => {
                              const damage = timelineDamageValue(row);
                              const sourceShare = group.total > 0 ? (damage / group.total) * 100 : 0;
                              const sourceMeta = timelineDamageAbilityMeta(row, guide);
                              return (
                                <div
                                  key={`${group.participantId}-${timelineDamageSourceKey(row)}-${sourceIndex}`}
                                  className="lol-event-damage-source"
                                  title={String(row.spellName || row.name || sourceMeta.label)}
                                >
                                  <DamageAbilityIcon row={row} guide={guide} />
                                  <span>{sourceMeta.label}</span>
                                  <div aria-hidden="true"><i style={{ width: `${sourceShare}%` }} /></div>
                                  <em>{formatInteger(damage)}</em>
                                  <small>{sourceShare.toFixed(0)}%</small>
                                </div>
                              );
                            })}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}


            </div>
          ) : (
            <div className="lol-event-inspector__controls">
              <div className="lol-event-control-head">
                <strong>筛选</strong>
                <span>{filteredEntries.length}<small> / {entries.length}</small></span>
                <button
                  type="button"
                  title="重置筛选"
                  aria-label="重置筛选"
                  disabled={typeFilter === 'all' && allPlayersActive}
                  onClick={() => {
                    setTypeFilter('all');
                    setChampionFilters(null);
                  }}
                >
                  <RotateCcw aria-hidden="true" />
                </button>
              </div>

              <nav className="lol-event-control-types lol-event-control-types--vertical" aria-label="事件类型">
                {EVENT_PRIMARY_FILTERS.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={[
                      typeFilter === filter ? 'is-active' : '',
                      filter === 'multi' ? 'is-subfilter' : '',
                    ].filter(Boolean).join(' ')}
                    aria-pressed={typeFilter === filter}
                    onClick={() => setTypeFilter(filter)}
                  >
                    <span>{eventPrimaryFilterLabel(filter)}</span>
                    <small>{primaryCounts[filter]}</small>
                    <ChevronRight aria-hidden="true" className="lol-event-control-types__chevron" />
                  </button>
                ))}
              </nav>

              <div className="lol-event-player-scope">
                <button
                  type="button"
                  className={allPlayersActive ? 'is-active' : ''}
                  onClick={() => setChampionFilters(null)}
                >
                  全部
                </button>
                <button
                  type="button"
                  className={blueScopeActive ? 'is-active is-blue' : ''}
                  onClick={() => setChampionFilters(new Set(blueParticipantIds))}
                >
                  蓝方
                </button>
                <button
                  type="button"
                  className={redScopeActive ? 'is-active is-red' : ''}
                  onClick={() => setChampionFilters(new Set(redParticipantIds))}
                >
                  红方
                </button>
              </div>

              <div className={`lol-event-player-filter lol-event-player-filter--compact ${allPlayersActive ? 'is-all' : ''}`}>
                <div>
                  <span className="is-blue">蓝</span>
                  <div>
                    {bluePlayers.map((participant, index) => {
                      const participantId = participant.participantId || index + 1;
                      const included = championFilters === null || championFilters.has(participantId);
                      return (
                        <button
                          key={`blue-${participant.puuid}`}
                          type="button"
                          className={included ? 'is-active is-blue' : 'is-blue'}
                          aria-pressed={included}
                          title={playerName(participant)}
                          onClick={() => toggleChampion(participantId)}
                        >
                          <GameIcon src={participant.championAvatar} alt={participant.championName} size={34} rounded />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <span className="is-red">红</span>
                  <div>
                    {redPlayers.map((participant, index) => {
                      const participantId = participant.participantId || index + 6;
                      const included = championFilters === null || championFilters.has(participantId);
                      return (
                        <button
                          key={`red-${participant.puuid}`}
                          type="button"
                          className={included ? 'is-active is-red' : 'is-red'}
                          aria-pressed={included}
                          title={playerName(participant)}
                          onClick={() => toggleChampion(participantId)}
                        >
                          <GameIcon src={participant.championAvatar} alt={participant.championName} size={34} rounded />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function BuildsTab({
  participants,
  timeline,
  targetPuuid,
}: {
  participants: MatchParticipantSummary[];
  timeline: MatchTimeline | null;
  targetPuuid: string;
}) {
  const events = timelineEvents(timeline);
  const sectionRefs = useRef(new Map<number, HTMLElement>());
  const contentRef = useRef<HTMLDivElement>(null);
  const [railExpanded, setRailExpanded] = useState(false);
  const [activeParticipantId, setActiveParticipantId] = useState(() => {
    const target = participants.find((participant) => participant.puuid === targetPuuid);
    return target?.participantId || participants[0]?.participantId || 1;
  });

  const scrollToParticipant = (participantId: number) => {
    const content = contentRef.current;
    const section = sectionRefs.current.get(participantId);
    if (!content || !section) return;
    setActiveParticipantId(participantId);
    content.scrollTo({
      top: Math.max(0, section.offsetTop - content.offsetTop),
      behavior: 'smooth',
    });
  };

  const handleBuildScroll = () => {
    const content = contentRef.current;
    if (!content) return;
    const readingLine = content.scrollTop + 48;
    let nextParticipantId = participants[0]?.participantId || 1;
    participants.forEach((participant, index) => {
      const participantId = participant.participantId || index + 1;
      const section = sectionRefs.current.get(participantId);
      if (section && section.offsetTop - content.offsetTop <= readingLine) {
        nextParticipantId = participantId;
      }
    });
    setActiveParticipantId((current) => current === nextParticipantId ? current : nextParticipantId);
  };

  return (
    <div className="lol-builds">
      <div ref={contentRef} className="lol-builds__content" onScroll={handleBuildScroll}>
        {participants.map((participant, index) => {
          const participantId = participant.participantId || index + 1;
          const skillEvents = events.filter((event) => event.participantId === participantId && event.type === 'SKILL_LEVEL_UP');
          const purchases = buildPurchaseSequence(events.filter((event) => event.participantId === participantId));
          const anvilCount = purchases.filter((node) => node.kind === 'item' && [6032, 22000].includes(node.event.itemId ?? 0)).length;
          return (
            <section
              ref={(element) => {
                if (element) sectionRefs.current.set(participantId, element);
                else sectionRefs.current.delete(participantId);
              }}
              key={`${participant.puuid}-build`}
              className={`lol-build ${participant.puuid === targetPuuid ? 'lol-build--target' : ''}`}
            >
              <div className="lol-build__player">
                <GameIcon src={participant.championAvatar} alt={participant.championName} size={38} rounded />
                <span><strong>{playerName(participant)}</strong><small>{participant.championName} · #{participantId}</small></span>
                {anvilCount > 0 && <em className="lol-build__anvil">{anvilCount} 锻</em>}
              </div>
              <div className="lol-build__sequence">
                <small>技能构建</small>
                <div>{skillEvents.length > 0 ? skillEvents.map((event, skillIndex) => {
                  const skill = ['?', 'Q', 'W', 'E', 'R'][event.skillSlot ?? 0] ?? '?';
                  return <span className={`lol-build__skill lol-build__skill--${skill.toLowerCase()} ${event.levelUpType === 'EVOLVE' ? 'is-evolve' : ''}`} key={`${event.timestamp}-skill-${skillIndex}`} title={`${formatBuildTime(event.timestamp)} · ${skill}`}><b>{skill}</b><em>{skillIndex + 1}</em></span>;
                }) : <i>无技能升级数据</i>}</div>
              </div>
              <div className="lol-build__sequence">
                <small>装备购买</small>
                <div className="lol-build__purchases">{purchases.some((node) => node.kind === 'item') ? purchases.map((node, eventIndex) => {
                  if (node.kind === 'spacer') {
                    return <span className="lol-build__purchase-spacer" key={`${node.timestamp}-spacer-${eventIndex}`}>→</span>;
                  }
                  const event = node.event;
                  return (
                    <span className="lol-build__purchase" key={`${event.timestamp}-${event.itemId}-${eventIndex}`} title={`${formatBuildTime(event.timestamp)} · ${event.itemName || event.itemId}`}>
                      {event.itemIcon ? <img src={event.itemIcon} alt={event.itemName || ''} /> : <b>{event.itemId || '?'}</b>}
                      <time>{formatBuildTime(event.timestamp)}</time>
                    </span>
                  );
                }) : <i>无装备购买数据</i>}</div>
              </div>
            </section>
          );
        })}
      </div>
      <aside className={`lol-builds__rail ${railExpanded ? 'is-expanded' : ''}`}>
        <button type="button" className="lol-builds__rail-toggle" onClick={() => setRailExpanded((current) => !current)} title={railExpanded ? '收起玩家导航' : '展开玩家导航'}>
          {railExpanded ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
        {participants.map((participant, index) => {
          const participantId = participant.participantId || index + 1;
          const teamClass = participant.teamId === 100 ? 'is-blue' : 'is-red';
          return <button type="button" key={`${participant.puuid}-rail`} className={`${teamClass} ${activeParticipantId === participantId ? 'is-active' : ''}`} onClick={() => scrollToParticipant(participantId)} title={playerName(participant)} aria-current={activeParticipantId === participantId ? 'true' : undefined}>
            <GameIcon src={participant.championAvatar} alt={participant.championName} size={30} rounded />
            {railExpanded && <span>{playerName(participant)}</span>}
          </button>;
        })}
      </aside>
    </div>
  );
}

type TimelineMetric = 'gold' | 'cs' | 'xp' | 'damageDealt' | 'damageTaken';

const TIMELINE_METRICS: Array<{ key: TimelineMetric; label: string }> = [
  { key: 'gold', label: '金币' },
  { key: 'cs', label: '补刀' },
  { key: 'xp', label: '经验' },
  { key: 'damageDealt', label: '已造成英雄伤害' },
  { key: 'damageTaken', label: '已承受伤害' },
];

const TIMELINE_COLORS = MATCH_TIMELINE_COLORS;

function timelineMetricValue(frame: MatchTimeline['frames'][number]['participantFrames'][string] | undefined, metric: TimelineMetric): number {
  if (!frame) return 0;
  if (metric === 'gold') return frame.totalGold;
  if (metric === 'cs') return frame.minionsKilled + frame.jungleMinionsKilled;
  if (metric === 'xp') return frame.xp;
  if (metric === 'damageDealt') return frame.damageStats?.totalDamageDoneToChampions ?? frame.damageStats?.totalDamageDone ?? 0;
  return frame.damageStats?.totalDamageTaken ?? 0;
}

function TimelineTab({
  participants,
  timeline,
  loading,
  error,
  targetPuuid,
}: {
  participants: MatchParticipantSummary[];
  timeline: MatchTimeline | null;
  loading: boolean;
  error?: string;
  targetPuuid: string;
}) {
  const [view, setView] = useState<'chart' | 'stats'>('chart');
  const [metric, setMetric] = useState<TimelineMetric>('gold');
  const [showBlueAverage, setShowBlueAverage] = useState(true);
  const [showRedAverage, setShowRedAverage] = useState(true);
  const [selectedPlayers, setSelectedPlayers] = useState<Set<number>>(new Set());
  const [statsParticipantId, setStatsParticipantId] = useState<number>(() => {
    const target = participants.find((participant) => participant.puuid === targetPuuid);
    return target?.participantId || participants.indexOf(target ?? participants[0]) + 1;
  });
  if (!timeline) return <TimelineEmpty loading={loading} error={error} />;
  const names = participantIndex(participants);
  const playerMeta = participants.map((participant, index) => ({ participant, participantId: participant.participantId || index + 1, color: TIMELINE_COLORS[index % TIMELINE_COLORS.length] }));
  const buildSeries = (ids: number[], label: string, color: string, dashed = false) => ({
    label,
    color,
    dashed,
    values: timeline.frames.map((frame) => {
      const values = ids.map((id) => timelineMetricValue(frame.participantFrames[String(id)], metric));
      return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    }),
  });
  const series = [
    ...(showBlueAverage ? [buildSeries(playerMeta.filter(({ participant }) => participant.teamId === 100).map(({ participantId }) => participantId), '蓝队平均', MATCH_TEAM_COLORS.blue, true)] : []),
    ...(showRedAverage ? [buildSeries(playerMeta.filter(({ participant }) => participant.teamId === 200).map(({ participantId }) => participantId), '红队平均', MATCH_TEAM_COLORS.red, true)] : []),
    ...playerMeta.filter(({ participantId }) => selectedPlayers.has(participantId)).map(({ participant, participantId, color }) => buildSeries([participantId], playerName(participant), color)),
  ];
  const maxValue = Math.max(1, ...series.flatMap((line) => line.values));
  const chartLine = (values: number[]) => values.map((value, index) => {
    const x = 56 + (index / Math.max(1, values.length - 1)) * 624;
    const y = 430 - (value / maxValue) * 390;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const statsPlayer = names.get(statsParticipantId) ?? participants[0];
  const togglePlayer = (participantId: number) => setSelectedPlayers((current) => {
    const next = new Set(current);
    if (next.has(participantId)) next.delete(participantId);
    else next.add(participantId);
    return next;
  });

  return (
    <div className="lol-timeline">
      <div className="lol-timeline__subtabs">
        <button type="button" className={view === 'chart' ? 'is-active' : ''} onClick={() => setView('chart')}>差距线图表</button>
        <button type="button" className={view === 'stats' ? 'is-active' : ''} onClick={() => setView('stats')}>属性时间线</button>
      </div>
      {view === 'chart' ? <>
        <section className="lol-timeline__chart">
          <svg viewBox="0 0 700 470" role="img" aria-label="玩家数据增长曲线">
            {Array.from({ length: 6 }, (_, index) => {
              const y = 40 + index * 78;
              const label = Math.round(maxValue * (1 - index / 5));
              return <g key={`grid-${index}`}><line x1="56" y1={y} x2="680" y2={y} /><text x="48" y={y + 4}>{formatInteger(label)}</text></g>;
            })}
            {Array.from({ length: 8 }, (_, index) => {
              const x = 56 + index * (624 / 7);
              const frameIndex = Math.round(index * Math.max(0, timeline.frames.length - 1) / 7);
              const timestamp = timeline.frames[frameIndex]?.timestamp ?? 0;
              return <g className="lol-timeline__x-grid" key={`x-grid-${index}`}><line x1={x} y1="40" x2={x} y2="430" /><text x={x} y="447">{Math.floor(timestamp / 60000)}min</text></g>;
            })}
            {series.map((line) => <polyline key={line.label} points={chartLine(line.values)} style={{ stroke: line.color, strokeDasharray: line.dashed ? '8 4' : undefined }} />)}
            <text x="360" y="462" className="lol-timeline__axis-title">游戏时间</text>
          </svg>
        </section>
        <aside className="lol-timeline__controls">
          <strong>数据类型</strong>
          {TIMELINE_METRICS.map((option) => <label key={option.key}><input type="radio" name="timeline-metric" checked={metric === option.key} onChange={() => setMetric(option.key)} /> {option.label}</label>)}
          <strong>队伍平均</strong>
          <label><input type="checkbox" checked={showBlueAverage} onChange={(event) => setShowBlueAverage(event.target.checked)} /><i style={{ background: MATCH_TEAM_COLORS.blue }} /> 蓝队平均</label>
          <label><input type="checkbox" checked={showRedAverage} onChange={(event) => setShowRedAverage(event.target.checked)} /><i style={{ background: MATCH_TEAM_COLORS.red }} /> 红队平均</label>
          <strong>玩家</strong>
          <button type="button" onClick={() => setSelectedPlayers(selectedPlayers.size === playerMeta.length ? new Set() : new Set(playerMeta.map(({ participantId }) => participantId)))}>全选</button>
          {playerMeta.map(({ participant, participantId, color }) => <label key={`${participant.puuid}-timeline`}><input type="checkbox" checked={selectedPlayers.has(participantId)} onChange={() => togglePlayer(participantId)} /><i style={{ background: color }} /><span>{playerName(participant)}</span></label>)}
        </aside>
      </> : <>
        <section className="lol-timeline__table">
          <div className="lol-timeline__table-title"><strong>{statsPlayer ? playerName(statsPlayer) : '玩家'} · 属性时间线</strong><span>此为服务器返回的数据，部分字段可能存在误差</span></div>
          <div className="lol-timeline__row lol-timeline__row--head"><span>时间</span><span>等级</span><span>金币</span><span>补刀</span><span>经验</span><span>攻击力</span><span>护甲</span><span>魔抗</span></div>
          {timeline.frames.map((frame) => {
            const data = frame.participantFrames[String(statsParticipantId)];
            return <div className="lol-timeline__row" key={`${frame.timestamp}-stats`}><span>{formatEventTime(frame.timestamp)}</span><span>{data?.level ?? '—'}</span><span>{formatInteger(data?.totalGold ?? 0)}</span><span>{data ? data.minionsKilled + data.jungleMinionsKilled : '—'}</span><span>{formatInteger(data?.xp ?? 0)}</span><span>{formatInteger(data?.championStats?.attackDamage ?? 0)}</span><span>{formatInteger(data?.championStats?.armor ?? 0)}</span><span>{formatInteger(data?.championStats?.magicResist ?? 0)}</span></div>;
          })}
        </section>
        <aside className="lol-timeline__players">
          <strong>玩家</strong>
          {playerMeta.map(({ participant, participantId, color }) => <button type="button" className={statsParticipantId === participantId ? 'is-active' : ''} key={`${participant.puuid}-stats-player`} onClick={() => setStatsParticipantId(participantId)}><i style={{ background: color }} /><GameIcon src={participant.championAvatar} alt={participant.championName} size={22} rounded /><span>{playerName(participant)}</span></button>)}
        </aside>
      </>}
    </div>
  );
}
