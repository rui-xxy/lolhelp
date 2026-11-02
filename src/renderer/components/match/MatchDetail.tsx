import { useEffect, useMemo, useState, useTransition, type CSSProperties, type ReactNode } from 'react';
import { CirclePlay, Download, LoaderCircle, Users } from 'lucide-react';
import { GameIcon } from './GameIcon';
import { MatchBuildView } from './MatchBuildView';
import { DetailedStatsView } from './DetailedStatsView';
import { MatchEventsView } from './MatchEventsView';
import { DamageEnergyBar } from './DamageEnergyBar';
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
  MatchTimelineResult,
  PlayerMatchDetail,
  PlayerRankSummary,
  PlayerRuneSummary,
  ReplayAvailability,
  ReplayAvailabilityRequest,
} from '../../../shared/api';
import type { RecurringMate } from './MatchList';

type DetailTab = 'overview' | 'details' | 'events' | 'builds';
type LinkTone = 'amber' | 'cyan' | 'violet' | 'rose' | 'emerald';

interface MatchDetailProps {
  match: PlayerMatchDetail;
  targetPuuid: string;
  region?: string;
  recurringMates?: Map<string, RecurringMate>;
  onPlayerSearch?: (riotId: string) => void;
}

const DETAIL_TABS: Array<{ key: DetailTab; label: string }> = [
  { key: 'overview', label: '总览' },
  { key: 'details', label: '详尽表格' },
  { key: 'events', label: '事件' },
  { key: 'builds', label: '构建' },
];

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
  label: string;
};

function resolvePlayerRelationship(
  player: MatchParticipantSummary,
  premadeCountById: Map<string, number>,
): PlayerRelationship | undefined {
  const premadeCount = player.premadeId ? (premadeCountById.get(player.premadeId) ?? 0) : 0;
  if (premadeCount >= 2) {
    return { label: `开黑·${premadeCount}` };
  }
  return undefined;
}

function PlayerRelationshipBadge({ relationship }: { relationship?: PlayerRelationship }) {
  if (!relationship) return null;
  return (
    <span
      className="lol-player-relation lol-player-relation--premade"
      title="本局组队关系"
    >
      <Users aria-hidden="true" />
      <span>{relationship.label}</span>
    </span>
  );
}

function stat(participant: MatchParticipantSummary, key: keyof MatchParticipantStats): number {
  const value = participant.stats?.[key] ?? 0;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

// 记分板 KDA 下面的比值：0 死记为「完美」，按高低分档上色
function kdaRatioLabel(participant: MatchParticipantSummary): { text: string; tier: 'great' | 'good' | 'fair' | 'poor' } {
  const { kills, deaths, assists } = participant;
  if (deaths <= 0) return { text: kills + assists > 0 ? '完美' : '0.0 KDA', tier: kills + assists > 0 ? 'great' : 'poor' };
  const ratio = (kills + assists) / deaths;
  const tier = ratio >= 5 ? 'great' : ratio >= 3 ? 'good' : ratio >= 1.5 ? 'fair' : 'poor';
  return { text: `${ratio.toFixed(1)} KDA`, tier };
}

function KdaRatio({ participant }: { participant: MatchParticipantSummary }) {
  const { text, tier } = kdaRatioLabel(participant);
  return <small className="lol-kda-ratio" data-tier={tier}>{text}</small>;
}

// 记分板伤害：数字 + 一条细条（相对全场最高伤害），全场最高的数字标金
function DamageCell({ className, damage, damageShare, win }: { className: string; damage: number; damageShare: number; win: boolean }) {
  return (
    <span
      className={`${className} lol-damage-cell lol-damage-cell--${win ? 'win' : 'loss'}`}
      data-top={damageShare >= 99.95 ? 'true' : undefined}
      style={{ '--damage-share': `${Math.max(4, damageShare).toFixed(1)}%` } as CSSProperties}
      title={damageShare >= 99.95 ? '全场最高伤害' : `约为全场最高伤害的 ${Math.round(damageShare)}%`}
    >
      <b>{formatCompact(damage)}</b>
      <i aria-hidden="true" />
    </span>
  );
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
        {contentTab === 'details' && <DetailedTableTab participants={participants} targetPuuid={targetPuuid} gameDuration={match.gameDuration} />}
        {contentTab === 'events' && (
          <MatchEventsView
            participants={participants}
            targetPuuid={targetPuuid}
            timeline={timelineResult?.timeline ?? null}
            loading={timelineLoading}
            error={timelineResult?.error}
            queueId={match.queueId}
            gameDuration={match.gameDuration}
          />
        )}
        {contentTab === 'builds' && (
          <MatchBuildView
            participants={participants}
            timeline={timelineResult?.timeline ?? null}
            targetPuuid={targetPuuid}
            loading={timelineLoading}
            gameDuration={match.gameDuration}
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
  const hasRecurringPlayerInMatch = participants.some(
    (player) => player.puuid !== targetPuuid && Boolean(recurringMates?.has(player.puuid)),
  );

  return (
    <div className="lol-scoreboard lol-result-scoreboard">
      {[100, 200].map((id) => (
        <ScoreboardTeam
          key={id}
          teamId={id}
          players={participants.filter((player) => player.teamId === id)}
          targetPuuid={targetPuuid}
          recurringMates={recurringMates}
          hasRecurringPlayerInMatch={hasRecurringPlayerInMatch}
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
  const hasRecurringPlayerInMatch = participants.some(
    (player) => player.puuid !== targetPuuid && Boolean(recurringMates?.has(player.puuid)),
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
          hasRecurringPlayerInMatch={hasRecurringPlayerInMatch}
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
  hasRecurringPlayerInMatch,
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
  hasRecurringPlayerInMatch: boolean;
  onPlayerSearch?: (riotId: string) => void;
  queueId: number;
  rankByPuuid: Record<string, PlayerRankSummary[]>;
  badgesByPuuid: Map<string, RiftBadge[]>;
  maxPlayerDamage: number;
}) {
  const tone = teamTone(teamId);
  const premadeToneById = buildPremadeToneMap(players, hasRecurringPlayerInMatch);
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
          const isLinkedByHistory = hasRecurringPlayerInMatch && (player.puuid === targetPuuid || isRecurring);
          const premadeTone = player.premadeId ? premadeToneById.get(player.premadeId) : undefined;
          const linkTone = premadeTone ?? (isLinkedByHistory ? 'amber' : undefined);
          const relationship = resolvePlayerRelationship(player, premadeCountById);

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
        <KdaRatio participant={participant} />
      </div>
      <DamageCell className="lol-rift-damage" damage={participant.damage} damageShare={damageShare} win={participant.win} />
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
  hasRecurringPlayerInMatch,
  onPlayerSearch,
  maxPlayerDamage,
  badgesByPuuid,
}: {
  teamId: number;
  players: MatchParticipantSummary[];
  targetPuuid: string;
  recurringMates?: Map<string, RecurringMate>;
  hasRecurringPlayerInMatch: boolean;
  onPlayerSearch?: (riotId: string) => void;
  maxPlayerDamage: number;
  badgesByPuuid: Map<string, RiftBadge[]>;
}) {
  const tone = teamTone(teamId);
  const premadeToneById = buildPremadeToneMap(players, hasRecurringPlayerInMatch);
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
        const isLinkedByHistory = hasRecurringPlayerInMatch && (player.puuid === targetPuuid || isRecurring);
        const premadeTone = player.premadeId ? premadeToneById.get(player.premadeId) : undefined;
        const linkTone = premadeTone ?? (isLinkedByHistory ? 'amber' : undefined);
        const relationship = resolvePlayerRelationship(player, premadeCountById);

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
        <KdaRatio participant={participant} />
      </div>
      <DamageCell className="lol-score-number" damage={participant.damage} damageShare={damageShare} win={participant.win} />
    </div>
  );
}

function DetailedTableTab({ participants, targetPuuid, gameDuration }: {
  participants: MatchParticipantSummary[];
  targetPuuid: string;
  gameDuration: number;
}) {
  return <DetailedStatsView participants={participants} targetPuuid={targetPuuid} gameDuration={gameDuration} />;
}

