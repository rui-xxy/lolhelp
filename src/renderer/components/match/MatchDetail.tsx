import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, CirclePlay, Download, History, LoaderCircle, Users } from 'lucide-react';
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
  MatchParticipantStats,
  MatchParticipantSummary,
  MatchTimeline,
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
  'spell1Id', 'spell2Id', 'summoner1Id', 'summoner2Id', 'skinId', 'championSkinId',
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

function rawFieldLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (value) => value.toUpperCase());
}

function StatsMetricComparison({
  metric,
  participants,
}: {
  metric: StatsMetric;
  participants: MatchParticipantSummary[];
}) {
  const rows = participants.map((participant) => ({
    participant,
    value: getMetricValue(metric, participant),
  }));
  const numericValues = rows.map((row) => typeof row.value === 'number' ? Math.abs(row.value) : 0);
  const maxValue = Math.max(0, ...numericValues);
  return (
    <aside className="lol-stats-compare" role="tooltip">
      <strong>{metric.label}</strong>
      <small>{metric.description || `原始字段：${metric.rawKey || metric.key}`}</small>
      <div className="lol-stats-compare__rows">
        {rows.map(({ participant, value }) => {
          const numericValue = typeof value === 'number' ? Math.abs(value) : 0;
          return <div className="lol-stats-compare__row" key={`${metric.key}-${participant.puuid}-compare`}>
            <GameIcon src={participant.championAvatar} alt={participant.championName} size={20} rounded />
            <span title={playerName(participant)}>{playerName(participant)}</span>
            <i><b style={{ width: maxValue > 0 ? `${Math.max(2, numericValue / maxValue * 100)}%` : '0%' }} /></i>
            <em>{formatMetricValue(metric, value)}</em>
          </div>;
        })}
      </div>
    </aside>
  );
}

function StatsMetricLabel({
  metric,
  participants,
}: {
  metric: StatsMetric;
  participants: MatchParticipantSummary[];
}) {
  const [showComparison, setShowComparison] = useState(false);

  return (
    <div
      className="lol-stats-label"
      tabIndex={0}
      aria-label={`${metric.label}，悬浮查看十名玩家对比`}
      onMouseEnter={() => setShowComparison(true)}
      onMouseLeave={() => setShowComparison(false)}
      onFocus={() => setShowComparison(true)}
      onBlur={() => setShowComparison(false)}
    >
      <span>{metric.label}</span>
      <small>?</small>
      {showComparison && <StatsMetricComparison metric={metric} participants={participants} />}
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
  const visibleGroups = useMemo(() => {
    const query = metricFilter.trim().toLocaleLowerCase();
    if (!query) return groups;
    return groups
      .map((group) => ({
        ...group,
        metrics: group.metrics.filter((metric) => `${metric.label} ${metric.rawKey || metric.key}`.toLocaleLowerCase().includes(query)),
      }))
      .filter((group) => group.metrics.length > 0);
  }, [groups, metricFilter]);
  const gridStyle = {
    gridTemplateColumns: `148px repeat(${participants.length}, minmax(68px, 1fr))`,
  } as CSSProperties;

  return (
    <div className="lol-stats">
      <div className="lol-stats-grid lol-stats-grid--icons" style={gridStyle}>
        <label className="lol-stats-filter">
          <input value={metricFilter} onChange={(event) => setMetricFilter(event.target.value)} placeholder="筛选字段" />
        </label>
        {participants.map((player) => (
          <GameIcon
            key={`${player.puuid}-icon`}
            src={player.championAvatar}
            alt={player.championName}
            title={playerName(player)}
            size={30}
            rounded
            className={player.teamId === 100 ? 'lol-stats-avatar--blue' : 'lol-stats-avatar--red'}
          />
        ))}
      </div>
      {visibleGroups.map((group) => (
        <section key={group.title}>
          <div className="lol-stats-group-title">{group.title}</div>
          {group.metrics.map((metric) => (
            <div key={metric.key} className="lol-stats-grid lol-stats-row" style={gridStyle}>
              <StatsMetricLabel metric={metric} participants={participants} />
              {participants.map((player) => (
                <span
                  key={`${metric.key}-${player.puuid}`}
                  className={`lol-stats-value ${player.puuid === targetPuuid ? 'lol-stats-value--target' : ''}`}
                >
                  {formatMetricValue(metric, getMetricValue(metric, player))}
                </span>
              ))}
            </div>
          ))}
        </section>
      ))}
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
        title: `${actorName} 击杀了 ${victimName || '一名英雄'}`,
        detail: `${event.assistingParticipantIds?.length ?? 0} 次助攻${event.shutdownBounty ? ` · 终结赏金 ${event.shutdownBounty}` : ''}`,
        tone: actor?.teamId === 200 ? 'red' : 'blue',
      };
    case 'ELITE_MONSTER_KILL':
      return { title: `${actorName} 击杀了 ${event.monsterSubType || event.monsterType || '史诗野怪'}`, detail: '团队资源事件', tone: 'gold' };
    case 'BUILDING_KILL':
      return { title: `${actorName} 摧毁了${event.laneType ? ` ${event.laneType}` : ''}防御建筑`, detail: event.buildingType || '建筑事件', tone: actor?.teamId === 200 ? 'red' : 'blue' };
    case 'TURRET_PLATE_DESTROYED':
      return { title: `${actorName} 拆除了一层镀层`, detail: '防御塔事件', tone: 'gold' };
    case 'GAME_END':
      return { title: '对局结束', detail: `获胜方：${event.winningTeam === 200 ? '红方' : '蓝方'}`, tone: 'gold' };
    default:
      return { title: event.type.replaceAll('_', ' ').toLowerCase(), detail: actorName, tone: 'muted' };
  }
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
}: {
  participants: MatchParticipantSummary[];
  timeline: MatchTimeline | null;
  loading: boolean;
  error?: string;
}) {
  const names = participantIndex(participants);
  const [showChampionKills, setShowChampionKills] = useState(true);
  const [showSpecialKills, setShowSpecialKills] = useState(false);
  const [showBuildings, setShowBuildings] = useState(true);
  const [championFilters, setChampionFilters] = useState<Set<number>>(new Set());
  const [expandedEvent, setExpandedEvent] = useState<string>('');
  const allEvents = timelineEvents(timeline);
  const events = allEvents.filter((event) => {
    const isSpecial = event.type === 'CHAMPION_KILL' && (event.multiKillLength ?? 0) >= 2;
    const matchesType = event.type === 'CHAMPION_KILL'
      ? (isSpecial ? showSpecialKills : showChampionKills)
      : showBuildings && ['ELITE_MONSTER_KILL', 'BUILDING_KILL', 'TURRET_PLATE_DESTROYED'].includes(event.type);
    if (!matchesType) return false;
    if (championFilters.size === 0) return true;
    return [event.killerId, event.victimId, ...(event.assistingParticipantIds ?? [])]
      .some((id) => id && championFilters.has(id));
  });

  if (!timeline) return <TimelineEmpty loading={loading} error={error} />;

  const toggleChampion = (participantId: number) => {
    setChampionFilters((current) => {
      const next = new Set(current);
      if (next.has(participantId)) next.delete(participantId);
      else next.add(participantId);
      return next;
    });
  };

  return (
    <div className="lol-events">
      <div className="lol-events__stream">
        <div className="lol-event lol-event--boundary">
          <time>00:00</time><span className="lol-event__dot" /><strong>开始游戏</strong>
        </div>
        {events.map((event, index) => {
          const key = `${event.timestamp}-${event.type}-${index}`;
          const killer = names.get(event.killerId ?? 0);
          const victim = names.get(event.victimId ?? 0);
          const assists = (event.assistingParticipantIds ?? []).map((id) => names.get(id)).filter(Boolean) as MatchParticipantSummary[];
          const copy = eventCopy(event, names);
          const damageRows = event.victimDamageReceived ?? [];
          const hasPosition = Boolean(event.position && (event.position.x || event.position.y));
          return (
            <article className="lol-event" key={key}>
              <time>{formatEventTime(event.timestamp)}</time>
              <span className={`lol-event__dot lol-event__dot--${copy.tone}`} />
              <div className="lol-event__body">
                <div className="lol-event__heading">
                  <strong>{event.type === 'CHAMPION_KILL' ? '英雄击杀' : copy.title}</strong>
                  {event.multiKillLength && event.multiKillLength >= 2 ? <em>{event.multiKillLength} 杀</em> : null}
                  {hasPosition && <button type="button" onClick={() => setExpandedEvent(expandedEvent === `${key}:position` ? '' : `${key}:position`)}>查看位置</button>}
                  {damageRows.length > 0 && <button type="button" onClick={() => setExpandedEvent(expandedEvent === `${key}:damage` ? '' : `${key}:damage`)}>伤害明细</button>}
                </div>
                {event.type === 'CHAMPION_KILL' ? (
                  <div className="lol-event__participants">
                    <span className="lol-event__side">
                      {killer && <GameIcon src={killer.championAvatar} alt={killer.championName} title={playerName(killer)} size={28} rounded />}
                      {assists.map((participant) => <GameIcon key={participant.puuid} src={participant.championAvatar} alt={participant.championName} title={`助攻 · ${playerName(participant)}`} size={21} rounded />)}
                    </span>
                    <span>击杀</span>
                    {victim && <GameIcon src={victim.championAvatar} alt={victim.championName} title={playerName(victim)} size={28} rounded />}
                  </div>
                ) : <small>{copy.detail}</small>}
                {expandedEvent === `${key}:position` && event.position && (
                  <div className="lol-event__position">
                    <span className="lol-event__map-dot" style={{ left: `${Math.max(3, Math.min(97, (event.position.x / 15000) * 100))}%`, bottom: `${Math.max(3, Math.min(97, (event.position.y / 15000) * 100))}%` }} />
                    <small>X {event.position.x} · Y {event.position.y}</small>
                  </div>
                )}
                {expandedEvent === `${key}:damage` && (
                  <div className="lol-event__damage">
                    <strong>受到伤害</strong>
                    {damageRows.sort((a, b) => (b.damage ?? 0) - (a.damage ?? 0)).map((row, damageIndex) => {
                      const dealer = names.get(row.participantId ?? 0);
                      return <span key={`${row.participantId}-${row.spellName}-${damageIndex}`}>
                        <b>{dealer ? playerName(dealer) : row.name || row.type || '其他'}</b>
                        <small>{row.spellName || (row.basic ? '普通攻击' : '技能伤害')}</small>
                        <em>{formatInteger(row.damage ?? 0)}</em>
                      </span>;
                    })}
                  </div>
                )}
              </div>
            </article>
          );
        })}
        <div className="lol-event lol-event--boundary">
          <time>{formatEventTime(timeline.frames.at(-1)?.timestamp ?? 0)}</time><span className="lol-event__dot lol-event__dot--gold" /><strong>对局结束</strong>
        </div>
      </div>
      <aside className="lol-events__filters">
        <strong>筛选</strong>
        <label><input type="checkbox" checked={showChampionKills} onChange={(event) => setShowChampionKills(event.target.checked)} /> 英雄击杀</label>
        <label><input type="checkbox" checked={showSpecialKills} onChange={(event) => setShowSpecialKills(event.target.checked)} /> 特殊击杀</label>
        <label><input type="checkbox" checked={showBuildings} onChange={(event) => setShowBuildings(event.target.checked)} /> 摧毁建筑</label>
        <strong>按英雄筛选</strong>
        <button type="button" className="lol-events__select-all" onClick={() => setChampionFilters(new Set())}>全选 / 清除筛选</button>
        {participants.map((participant, index) => {
          const participantId = participant.participantId || index + 1;
          return <label key={`${participant.puuid}-event-filter`}>
            <input type="checkbox" checked={championFilters.has(participantId)} onChange={() => toggleChampion(participantId)} />
            <GameIcon src={participant.championAvatar} alt={participant.championName} size={22} rounded />
            <span>{playerName(participant)}</span>
          </label>;
        })}
      </aside>
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
