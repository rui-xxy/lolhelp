import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { GameIcon } from './GameIcon';
import { RankEmblem } from '../RankEmblem';
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
  PlayerMatchDetail,
  PlayerRankSummary,
  PlayerRuneSummary,
} from '../../../shared/api';
import type { RecurringMate } from './MatchList';

type DetailTab = 'scoreboard' | 'stats' | 'charts';
type LinkTone = 'amber' | 'cyan' | 'violet' | 'rose' | 'emerald';

interface MatchDetailProps {
  match: PlayerMatchDetail;
  targetPuuid: string;
  recurringMates?: Map<string, RecurringMate>;
  onPlayerSearch?: (riotId: string) => void;
}

interface ChartMetric {
  key: string;
  label: string;
  value: (participant: MatchParticipantSummary) => number;
}

interface StatsMetric {
  key: string;
  label: string;
  value?: (participant: MatchParticipantSummary) => number;
  text?: (participant: MatchParticipantSummary) => string;
}

interface StatsGroup {
  title: string;
  metrics: StatsMetric[];
}

const DETAIL_TABS: Array<{ key: DetailTab; label: string }> = [
  { key: 'scoreboard', label: '计分板' },
  { key: 'stats', label: '统计' },
  { key: 'charts', label: '图表' },
];

const CHART_METRICS: ChartMetric[] = [
  { key: 'championDamage', label: '对英雄造成伤害', value: (p) => p.damage },
  { key: 'totalDamage', label: '造成的总伤害', value: (p) => stat(p, 'totalDamageDealt') },
  { key: 'physicalDamage', label: '造成物理伤害', value: (p) => stat(p, 'physicalDamageDealtToChampions') },
  { key: 'magicDamage', label: '造成魔法伤害', value: (p) => stat(p, 'magicDamageDealtToChampions') },
  { key: 'trueDamage', label: '造成真实伤害', value: (p) => stat(p, 'trueDamageDealtToChampions') },
  { key: 'damageTaken', label: '承受伤害', value: (p) => stat(p, 'totalDamageTaken') },
  { key: 'selfMitigated', label: '自我缓和的伤害', value: (p) => stat(p, 'damageSelfMitigated') },
  { key: 'gold', label: '获得金币', value: (p) => p.gold },
  { key: 'vision', label: '视野得分', value: (p) => stat(p, 'visionScore') },
  { key: 'healing', label: '治疗效果', value: (p) => stat(p, 'totalHeal') },
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

const POSITION_LABELS: Record<string, string> = {
  TOP: '上路',
  JUNGLE: '打野',
  MIDDLE: '中路',
  MID: '中路',
  BOTTOM: '下路',
  UTILITY: '辅助',
  SUPPORT: '辅助',
};

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

function shouldShowPosition(queueId: number): boolean {
  return queueId === 420 || queueId === 440;
}

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

function teamLabel(teamId: number): string {
  return teamId === 100 ? '蓝色方' : '红色方';
}

function teamTone(teamId: number): string {
  return teamId === 100 ? 'blue' : 'red';
}

function playerName(participant: MatchParticipantSummary): string {
  return participant.riotId || participant.summonerName || '未知玩家';
}

function positionLabel(position: string): string {
  return (POSITION_LABELS[position.toUpperCase()] ?? position) || '—';
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

export function MatchDetail({ match, targetPuuid, recurringMates, onPlayerSearch }: MatchDetailProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('scoreboard');
  const [chartMetricKey, setChartMetricKey] = useState(CHART_METRICS[0].key);
  const [rankByPuuid, setRankByPuuid] = useState<Record<string, PlayerRankSummary[]>>({});
  const useRiftScoreboard = shouldUseRiftScoreboard(match.queueId);

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
    const puuids = Array.from(new Set(participants.map((participant) => participant.puuid).filter(Boolean)));
    if (puuids.length === 0) return;

    let cancelled = false;
    void Promise.all(
      puuids.map(async (puuid) => {
        try {
          const ranks = await window.lolHelper.match.getPlayerRanks(puuid);
          return [puuid, ranks] as const;
        } catch {
          return [puuid, [] as PlayerRankSummary[]] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setRankByPuuid((prev) => {
        const next = { ...prev };
        for (const [puuid, ranks] of entries) {
          next[puuid] = ranks;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [match.gameId, participants, useRiftScoreboard]);

  const target = participants.find((p) => p.puuid === targetPuuid) ?? participants[0];
  const showPosition = shouldShowPosition(match.queueId);
  const selectedChartMetric =
    CHART_METRICS.find((metric) => metric.key === chartMetricKey) ?? CHART_METRICS[0];

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
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="lol-postgame-content">
        {activeTab === 'scoreboard' && (
          useRiftScoreboard ? (
            <RiftScoreboardTab
              participants={participants}
              targetPuuid={targetPuuid}
              recurringMates={recurringMates}
              onPlayerSearch={onPlayerSearch}
              showPosition={showPosition}
              queueId={match.queueId}
              rankByPuuid={rankByPuuid}
            />
          ) : (
            <ScoreboardTab
              participants={participants}
              targetPuuid={targetPuuid}
              recurringMates={recurringMates}
              onPlayerSearch={onPlayerSearch}
              showPosition={showPosition}
            />
          )
        )}
        {activeTab === 'stats' && <StatsTab participants={participants} targetPuuid={targetPuuid} />}
        {activeTab === 'charts' && (
          <ChartsTab
            participants={participants}
            targetPuuid={targetPuuid}
            selectedMetric={selectedChartMetric}
            selectedMetricKey={chartMetricKey}
            onSelectMetric={setChartMetricKey}
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
  showPosition,
}: {
  participants: MatchParticipantSummary[];
  targetPuuid: string;
  recurringMates?: Map<string, RecurringMate>;
  onPlayerSearch?: (riotId: string) => void;
  showPosition: boolean;
}) {
  return (
    <div className="lol-scoreboard">
      {[100, 200].map((id) => (
        <ScoreboardTeam
          key={id}
          teamId={id}
          players={participants.filter((player) => player.teamId === id)}
          targetPuuid={targetPuuid}
          recurringMates={recurringMates}
          onPlayerSearch={onPlayerSearch}
          showPosition={showPosition}
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
  showPosition,
  queueId,
  rankByPuuid,
}: {
  participants: MatchParticipantSummary[];
  targetPuuid: string;
  recurringMates?: Map<string, RecurringMate>;
  onPlayerSearch?: (riotId: string) => void;
  showPosition: boolean;
  queueId: number;
  rankByPuuid: Record<string, PlayerRankSummary[]>;
}) {
  const badgesByPuuid = useMemo(() => buildRiftBadges(participants), [participants]);

  return (
    <div className="lol-rift-scoreboard">
      {[100, 200].map((id) => (
        <RiftScoreboardTeam
          key={id}
          teamId={id}
          players={participants.filter((player) => player.teamId === id)}
          targetPuuid={targetPuuid}
          recurringMates={recurringMates}
          onPlayerSearch={onPlayerSearch}
          showPosition={showPosition}
          queueId={queueId}
          rankByPuuid={rankByPuuid}
          badgesByPuuid={badgesByPuuid}
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
  showPosition,
  queueId,
  rankByPuuid,
  badgesByPuuid,
}: {
  teamId: number;
  players: MatchParticipantSummary[];
  targetPuuid: string;
  recurringMates?: Map<string, RecurringMate>;
  onPlayerSearch?: (riotId: string) => void;
  showPosition: boolean;
  queueId: number;
  rankByPuuid: Record<string, PlayerRankSummary[]>;
  badgesByPuuid: Map<string, RiftBadge[]>;
}) {
  const tone = teamTone(teamId);
  const hasRecurringMate = players.some(
    (player) => player.puuid !== targetPuuid && Boolean(recurringMates?.has(player.puuid)),
  );
  const premadeToneById = buildPremadeToneMap(players, hasRecurringMate);

  return (
    <section className={`lol-rift-team lol-rift-team--${tone}`}>
      <div className="lol-rift-grid lol-rift-grid--head">
        <span>玩家</span>
        <span>装备</span>
        <span>KDA</span>
        <span>伤害</span>
      </div>

      <div className="lol-rift-team-rows">
        {players.map((player) => {
          const isRecurring = player.puuid !== targetPuuid && Boolean(recurringMates?.has(player.puuid));
          const isLinkedByHistory = hasRecurringMate && (player.puuid === targetPuuid || isRecurring);
          const linkTone = isLinkedByHistory
            ? 'amber'
            : player.premadeId
              ? premadeToneById.get(player.premadeId)
              : undefined;

          return (
            <RiftScoreboardRow
              key={`${player.puuid}-${player.championId}`}
              participant={player}
              isTarget={player.puuid === targetPuuid}
              isRecurring={isRecurring}
              onPlayerSearch={onPlayerSearch}
              showPosition={showPosition}
              linkTone={linkTone}
              queueId={queueId}
              rankByPuuid={rankByPuuid}
              badges={badgesByPuuid.get(player.puuid) ?? []}
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
  showPosition,
  linkTone,
  queueId,
  rankByPuuid,
  badges,
}: {
  participant: MatchParticipantSummary;
  isTarget: boolean;
  isRecurring: boolean;
  onPlayerSearch?: (riotId: string) => void;
  showPosition: boolean;
  linkTone?: LinkTone;
  queueId: number;
  rankByPuuid: Record<string, PlayerRankSummary[]>;
  badges: RiftBadge[];
}) {
  const name = playerName(participant);
  const rank = rankForQueue(participant, queueId, rankByPuuid);
  const slots = itemSlots(participant);

  return (
    <div
      className={`lol-rift-row ${isTarget ? 'lol-rift-row--target' : ''} ${
        isRecurring ? 'lol-rift-row--recurring' : ''
      }`}
    >
      <div className="lol-rift-player-cell">
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
        <div className="lol-rift-badges">
          {showPosition && (
            <span className="lol-rift-role-badge">{positionLabel(participant.teamPosition)}</span>
          )}
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
      <div className="lol-rift-kda">
        <strong>{`${participant.kills} / ${participant.deaths} / ${participant.assists}`}</strong>
      </div>
      <span className="lol-rift-damage">{formatCompact(participant.damage)}</span>
    </div>
  );
}

function ScoreboardTeam({
  teamId,
  players,
  targetPuuid,
  recurringMates,
  onPlayerSearch,
  showPosition,
}: {
  teamId: number;
  players: MatchParticipantSummary[];
  targetPuuid: string;
  recurringMates?: Map<string, RecurringMate>;
  onPlayerSearch?: (riotId: string) => void;
  showPosition: boolean;
}) {
  const totals = teamTotals(players);
  const tone = teamTone(teamId);
  const won = players[0]?.win ?? false;
  const hasRecurringMate = players.some(
    (player) => player.puuid !== targetPuuid && Boolean(recurringMates?.has(player.puuid)),
  );
  const premadeToneById = buildPremadeToneMap(players, hasRecurringMate);

  return (
    <section className={`lol-score-team lol-score-team--${tone}`}>
      <div className="lol-score-team-bar">
        <div className="lol-score-team-title">
          <span className="lol-score-team-line" />
          <span>{teamLabel(teamId)}</span>
          <span className="lol-score-team-result">{won ? 'WIN' : 'LOSE'}</span>
        </div>
        <div className="lol-score-team-total">{`${totals.kills} / ${totals.deaths} / ${totals.assists}`}</div>
      </div>
      <div className="lol-score-grid lol-score-grid--head">
        <span>玩家</span>
        <span>符文 / 强化</span>
        <span>装备</span>
        <span>KDA</span>
        <span>伤害</span>
      </div>
      {players.map((player) => {
        const isRecurring = player.puuid !== targetPuuid && Boolean(recurringMates?.has(player.puuid));
        const isLinkedByHistory = hasRecurringMate && (player.puuid === targetPuuid || isRecurring);
        const linkTone = isLinkedByHistory
          ? 'amber'
          : player.premadeId
            ? premadeToneById.get(player.premadeId)
            : undefined;

        return (
          <ScoreboardRow
            key={`${player.puuid}-${player.championId}`}
            participant={player}
            isTarget={player.puuid === targetPuuid}
            isRecurring={isRecurring}
            onPlayerSearch={onPlayerSearch}
            showPosition={showPosition}
            linkTone={linkTone}
          />
        );
      })}
    </section>
  );
}

function ScoreboardRow({
  participant,
  isTarget,
  isRecurring,
  onPlayerSearch,
  showPosition,
  linkTone,
}: {
  participant: MatchParticipantSummary;
  isTarget: boolean;
  isRecurring: boolean;
  onPlayerSearch?: (riotId: string) => void;
  showPosition: boolean;
  linkTone?: LinkTone;
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
      <div className="lol-score-player">
        <div className="lol-score-spells">
          {participant.spells.map((spell) => (
            <GameIcon key={`${participant.puuid}-${spell.id}`} src={spell.icon} alt={spell.name} title={spell.name} size={17} />
          ))}
        </div>
        <div className="lol-score-champion">
          <GameIcon
            src={participant.championAvatar}
            alt={participant.championName}
            title={`${participant.championName} Lv.${participant.champLevel}`}
            size={34}
            rounded
          />
          <span>{participant.champLevel}</span>
        </div>
        <div className="lol-score-player-copy">
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
          {showPosition && <span>{positionLabel(participant.teamPosition)}</span>}
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
              size={22}
            />
          ) : (
            <span key={`${participant.puuid}-${slot}`} className="lol-score-item-empty" />
          ),
        )}
      </div>
      <div className="lol-score-kda">
        <strong>{`${participant.kills} / ${participant.deaths} / ${participant.assists}`}</strong>
      </div>
      <span className="lol-score-number">{formatCompact(participant.damage)}</span>
    </div>
  );
}

function StatsTab({
  participants,
  targetPuuid,
}: {
  participants: MatchParticipantSummary[];
  targetPuuid: string;
}) {
  const gridStyle = {
    gridTemplateColumns: `118px repeat(${participants.length}, minmax(40px, 1fr))`,
  } as CSSProperties;

  return (
    <div className="lol-stats">
      <div className="lol-stats-grid lol-stats-grid--icons" style={gridStyle}>
        <span />
        {participants.map((player) => (
          <GameIcon
            key={`${player.puuid}-icon`}
            src={player.championAvatar}
            alt={player.championName}
            title={playerName(player)}
            size={24}
            rounded
            className={player.teamId === 100 ? 'lol-stats-avatar--blue' : 'lol-stats-avatar--red'}
          />
        ))}
      </div>
      {STATS_GROUPS.map((group) => (
        <section key={group.title}>
          <div className="lol-stats-group-title">{group.title}</div>
          {group.metrics.map((metric) => (
            <div key={metric.key} className="lol-stats-grid lol-stats-row" style={gridStyle}>
              <span className="lol-stats-label">{metric.label}</span>
              {participants.map((player) => (
                <span
                  key={`${metric.key}-${player.puuid}`}
                  className={`lol-stats-value ${player.puuid === targetPuuid ? 'lol-stats-value--target' : ''}`}
                >
                  {metric.text ? metric.text(player) : formatInteger(metric.value?.(player) ?? 0)}
                </span>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function ChartsTab({
  participants,
  targetPuuid,
  selectedMetric,
  selectedMetricKey,
  onSelectMetric,
}: {
  participants: MatchParticipantSummary[];
  targetPuuid: string;
  selectedMetric: ChartMetric;
  selectedMetricKey: string;
  onSelectMetric: (key: string) => void;
}) {
  const maxValue = Math.max(1, ...participants.map((player) => selectedMetric.value(player)));

  return (
    <div className="lol-charts">
      <aside className="lol-chart-picker">
        {CHART_METRICS.map((metric) => (
          <button
            key={metric.key}
            type="button"
            className={`lol-chart-option ${selectedMetricKey === metric.key ? 'lol-chart-option--active' : ''}`}
            onClick={() => onSelectMetric(metric.key)}
          >
            <span className="lol-chart-checkbox" />
            {metric.label}
          </button>
        ))}
      </aside>
      <div className="lol-chart-bars">
        <div className="lol-chart-title">{selectedMetric.label}</div>
        {participants.map((player) => {
          const value = selectedMetric.value(player);
          const width = Math.max(4, Math.round((value / maxValue) * 100));
          return (
            <div key={`${selectedMetric.key}-${player.puuid}`} className="lol-chart-row">
              <GameIcon
                src={player.championAvatar}
                alt={player.championName}
                title={playerName(player)}
                size={24}
                rounded
              />
              <div className="lol-chart-track">
                <div
                  className={`lol-chart-bar lol-chart-bar--${teamTone(player.teamId)} ${
                    player.puuid === targetPuuid ? 'lol-chart-bar--target' : ''
                  }`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <span>{formatInteger(value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
