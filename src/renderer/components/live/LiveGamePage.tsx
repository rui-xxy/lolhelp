import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CircleDashed, DatabaseZap, LoaderCircle, MoreVertical, RefreshCw, Swords } from 'lucide-react';
import { motion } from 'framer-motion';
import type { LiveBattlePlayer, PlayerMatchDetail, PlayerRankSummary } from '../../../shared/api';
import { getRankEmblemUrl } from '../RankEmblem';
import { ProfileIcon } from '../ProfileIcon';
import { MatchDetail } from '../match/MatchDetail';
import { LargeDialog } from '../ui/large-dialog';
import { LIVE_PARTY_COLORS } from '../../styles/palette';
import { LIVE_PREVIEW_ENEMY_TEAM, LIVE_PREVIEW_MY_TEAM } from './livePreviewData';

const HISTORY_CARD_ROWS = 7;
const RECENT_CHAMPION_COUNT = 10;
const MAX_BOARD_CARDS = 10;
const PARTY_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

const TEAM_NAMES: Record<number, string> = {
  100: '蓝队',
  200: '红队',
};

const TIER_SHORT_NAMES: Record<string, string> = {
  IRON: '黑铁',
  BRONZE: '青铜',
  SILVER: '白银',
  GOLD: '黄金',
  PLATINUM: '铂金',
  EMERALD: '翡翠',
  DIAMOND: '钻石',
  MASTER: '大师',
  GRANDMASTER: '宗师',
  CHALLENGER: '王者',
};

const TIER_FULL_NAMES: Record<string, string> = {
  IRON: '坚韧黑铁',
  BRONZE: '英勇黄铜',
  SILVER: '不屈白银',
  GOLD: '荣耀黄金',
  PLATINUM: '华贵铂金',
  EMERALD: '流光翡翠',
  DIAMOND: '璀璨钻石',
  MASTER: '超凡大师',
  GRANDMASTER: '傲世宗师',
  CHALLENGER: '最强王者',
};

const POSITION_NAMES: Record<string, string> = {
  top: '上单',
  jungle: '打野',
  middle: '中路',
  mid: '中路',
  bottom: '下路',
  bot: '下路',
  adc: '下路',
  utility: '辅助',
  support: '辅助',
};

const RANK_QUEUE_ORDER: Record<string, number> = {
  RANKED_SOLO_5x5: 0,
  RANKED_FLEX_SR: 1,
};

function battleRosterKey(myTeam: LiveBattlePlayer[], enemyTeam: LiveBattlePlayer[]) {
  const playerKey = (player: LiveBattlePlayer) =>
    `${player.teamId}:${player.puuid || player.riotId}:${player.championId}:${player.premadeId || ''}`;

  return `${myTeam.map(playerKey).join('|')}::${enemyTeam.map(playerKey).join('|')}`;
}

function identifiedPlayerCount(players: LiveBattlePlayer[]) {
  return players.filter((player) => {
    if (player.puuid || player.summonerId > 0) return true;
    const riotId = player.riotId.trim();
    const gameName = player.gameName.trim();
    return Boolean(
      (riotId && !/^玩家(?:\?|？)?$/.test(riotId))
      || (gameName && !/^玩家(?:\?|？)?$/.test(gameName)),
    );
  }).length;
}

function loadedCardSet(total: number) {
  return new Set(Array.from({ length: total }, (_, index) => index));
}

function playerIdentity(player: LiveBattlePlayer) {
  return player.puuid || player.riotId || `${player.teamId}:${player.summonerId}`;
}

// Lobby 偶尔会同时推送“当前账号占位记录”和“已解析成员记录”。
// 用所有稳定身份字段做最后一道去重，避免同一玩家渲染成两张卡。
function dedupeBattlePlayers(players: LiveBattlePlayer[]): LiveBattlePlayer[] {
  const result: LiveBattlePlayer[] = [];
  players.forEach((player) => {
    const riotId = player.riotId.trim().toLowerCase();
    const duplicateIndex = result.findIndex((candidate) => Boolean(
      (player.puuid && candidate.puuid === player.puuid)
      || (player.summonerId > 0 && candidate.summonerId === player.summonerId)
      || (riotId && candidate.riotId.trim().toLowerCase() === riotId),
    ));
    if (duplicateIndex < 0) {
      result.push(player);
      return;
    }

    const current = result[duplicateIndex];
    result[duplicateIndex] = {
      ...current,
      ...player,
      puuid: player.puuid || current.puuid,
      summonerId: player.summonerId || current.summonerId,
      history: player.history.length >= current.history.length ? player.history : current.history,
      ranks: (player.ranks?.length ?? 0) >= (current.ranks?.length ?? 0)
        ? player.ranks
        : current.ranks,
    };
  });
  return result;
}

function currentPartyKey(player: LiveBattlePlayer) {
  return player.premadeId ? `${player.teamId}:${player.premadeId}` : '';
}

function buildParties(players: LiveBattlePlayer[]) {
  const byParty = new Map<string, LiveBattlePlayer[]>();
  players.forEach((player) => {
    const key = currentPartyKey(player);
    if (!key) return;
    byParty.set(key, [...(byParty.get(key) ?? []), player]);
  });

  const info = new Map<string, { color: string; label: string }>();
  let colorIndex = 0;
  let labelIndex = 0;
  byParty.forEach((partyPlayers) => {
    if (partyPlayers.length < 2) return;
    const color = LIVE_PARTY_COLORS[colorIndex % LIVE_PARTY_COLORS.length];
    const label = PARTY_LABELS[labelIndex % PARTY_LABELS.length];
    colorIndex += 1;
    labelIndex += 1;
    partyPlayers.forEach((player) => info.set(playerIdentity(player), { color, label }));
  });

  return info;
}

function championIcon(alias: string) {
  // 用腾讯图床（国内稳定），不依赖 ddragon 版本号
  return alias ? `https://game.gtimg.cn/images/lol/act/img/champion/${alias}.png` : '';
}

function phaseLabel(phase: string) {
  if (!phase) return '待检测';

  const map: Record<string, string> = {
    ChampSelect: '选人阶段',
    GameStart: '载入阶段',
    InProgress: '对局中',
    Reconnect: '重连中',
    Lobby: '房间中',
    Matchmaking: '匹配中',
    ReadyCheck: '等待接受',
  };

  return map[phase] ?? phase;
}

function positionLabel(position?: string) {
  return POSITION_NAMES[String(position ?? '').toLowerCase()] ?? '';
}

function teamName(teamId: number) {
  return TEAM_NAMES[teamId] ?? `${teamId}`;
}

function mergePlayerIntoTeam(
  team: LiveBattlePlayer[],
  player: LiveBattlePlayer,
): LiveBattlePlayer[] {
  const index = team.findIndex(
    (item) =>
      (item.puuid && item.puuid === player.puuid)
      || (item.summonerId > 0 && item.summonerId === player.summonerId)
      // Lobby members all have championId=0. Treating that as an identity
      // makes the first resolved teammate overwrite the first card, leaving
      // two visually identical players. Champion matching is only a fallback
      // once a real champion has been selected.
      || (
        player.championId > 0
        && item.championId > 0
        && item.teamId === player.teamId
        && item.championId === player.championId
      ),
  );
  if (index < 0) return [...team, player];

  const next = [...team];
  next[index] = player;
  return next;
}

function removePlayerFromTeam(
  team: LiveBattlePlayer[],
  puuid: string,
): LiveBattlePlayer[] {
  return team.filter((player) => player.puuid !== puuid);
}

function removeMatchingPlayer(
  team: LiveBattlePlayer[],
  target: LiveBattlePlayer,
): LiveBattlePlayer[] {
  return team.filter((player) => {
    if (target.puuid && player.puuid) return target.puuid !== player.puuid;
    if (target.summonerId > 0 && player.summonerId > 0) {
      return target.summonerId !== player.summonerId;
    }
    return true;
  });
}

function rankText(rank: PlayerRankSummary) {
  const tier = TIER_SHORT_NAMES[rank.tier?.toUpperCase()] ?? rank.tier ?? '无段位';
  const division = rank.division && rank.division !== 'NA' ? ` ${rank.division}` : '';
  const lp = rank.leaguePoints > 0 ? ` ${rank.leaguePoints}` : '';
  return `${tier}${division}${lp}`;
}

function rankLine(ranks?: PlayerRankSummary[]) {
  const playable = (ranks ?? [])
    .filter((rank) => rank && rank.tier && rank.tier !== 'NA')
    .sort(
      (a, b) =>
        (RANK_QUEUE_ORDER[a.queueType] ?? 99) - (RANK_QUEUE_ORDER[b.queueType] ?? 99),
    );
  return playable.slice(0, 2);
}

// 从战绩列表头部数连胜/连败（history 按最近在前排列）。
function currentStreak(player: LiveBattlePlayer): { win: boolean; count: number } {
  if (player.history.length === 0) return { win: false, count: 0 };
  const win = player.history[0].win;
  let count = 0;
  for (const match of player.history) {
    if (match.win !== win) break;
    count += 1;
  }
  return { win, count };
}

function splitRiotId(player: LiveBattlePlayer): { name: string; tag: string } {
  const separator = player.riotId.lastIndexOf('#');
  if (separator > 0) {
    return { name: player.riotId.slice(0, separator), tag: `#${player.riotId.slice(separator + 1)}` };
  }
  return { name: player.gameName, tag: '' };
}

function recentChampions(player: LiveBattlePlayer) {
  const stats = new Map<string, {
    alias: string;
    name: string;
    games: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
    matches: LiveBattlePlayer['history'];
  }>();

  player.history.forEach((match) => {
    if (!match.championAlias) return;
    const current = stats.get(match.championAlias)
      ?? {
        alias: match.championAlias,
        name: match.championName,
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        matches: [],
      };
    current.games += 1;
    if (match.win) current.wins += 1;
    current.kills += match.kills;
    current.deaths += match.deaths;
    current.assists += match.assists;
    current.matches.push(match);
    stats.set(match.championAlias, current);
  });

  return Array.from(stats.values()).slice(0, RECENT_CHAMPION_COUNT);
}

type RecentChampionStats = ReturnType<typeof recentChampions>[number];

function championAverage(
  champion: RecentChampionStats,
  getter: (performance: NonNullable<LiveBattlePlayer['history'][number]['performance']>) => number,
): number {
  const values = champion.matches.map((match) => match.performance).filter(Boolean) as Array<NonNullable<LiveBattlePlayer['history'][number]['performance']>>;
  return values.length > 0 ? values.reduce((sum, value) => sum + getter(value), 0) / values.length : 0;
}

function championKdaVariation(champion: RecentChampionStats): number {
  if (champion.matches.length < 2) return 0;
  const values = champion.matches.map((match) => (match.kills + match.assists) / Math.max(1, match.deaths));
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (average <= 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance) / average;
}

function championAnalysisScore(champion: RecentChampionStats): number {
  const winRate = champion.wins / Math.max(1, champion.games);
  const kda = (champion.kills + champion.assists) / Math.max(1, champion.deaths);
  const participation = championAverage(champion, (performance) => performance.killParticipation);
  return Math.max(0, Math.min(10, 1.2 + winRate * 2.8 + Math.min(5, kda) * 0.38 + participation * 1.4));
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function compactMetric(value: number): string {
  if (!value) return '0';
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
  return value.toFixed(value < 10 ? 1 : 0);
}

function ChampionAnalysisTooltip({
  champion,
  style,
  onMouseEnter,
  onMouseLeave,
  onCollect,
}: {
  champion: RecentChampionStats;
  style?: CSSProperties;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onCollect?: () => void;
}) {
  const hasPerformance = champion.matches.some((match) => Boolean(match.performance));
  const averageKills = champion.kills / Math.max(1, champion.games);
  const averageDeaths = champion.deaths / Math.max(1, champion.games);
  const averageAssists = champion.assists / Math.max(1, champion.games);
  const metric = (getter: (performance: NonNullable<LiveBattlePlayer['history'][number]['performance']>) => number) => championAverage(champion, getter);
  const value = (content: string) => hasPerformance ? content : '—';
  const columns = [
    {
      title: '核心表现',
      rows: [
        ['Akari Score', championAnalysisScore(champion).toFixed(2)],
        ['胜率', `${Math.round((champion.wins / champion.games) * 100)}%`],
        ['平均 KDA', `${averageKills.toFixed(1)} / ${averageDeaths.toFixed(1)} / ${averageAssists.toFixed(1)}`],
        ['参团率', value(percent(metric((performance) => performance.killParticipation)))],
        ['KDA 波动', championKdaVariation(champion).toFixed(2)],
        ['场均拆塔伤害', value(compactMetric(metric((performance) => performance.turretDamage)))],
        ['视野占比', value(percent(metric((performance) => performance.teamVisionPercentage)))],
        ['场均视野得分', value(metric((performance) => performance.visionScore).toFixed(1))],
        ['场均敌人消失信号', value(metric((performance) => performance.enemyMissingPings).toFixed(1))],
      ],
    },
    {
      title: '输出与承伤',
      rows: [
        ['英雄伤害 / 分', value(compactMetric(metric((performance) => performance.championDamage / Math.max(1, performance.duration / 60))))],
        ['团队伤害占比', value(percent(metric((performance) => performance.teamDamagePercentage)))],
        ['相对队内最高伤害', value(percent(metric((performance) => performance.relativeTeamDamage)))],
        ['相对全场最高伤害', value(percent(metric((performance) => performance.relativeGlobalDamage)))],
        ['团队承伤占比', value(percent(metric((performance) => performance.teamDamageTakenPercentage)))],
        ['相对队内最高承伤', value(percent(metric((performance) => performance.relativeTeamDamageTaken)))],
        ['相对全场最高承伤', value(percent(metric((performance) => performance.relativeGlobalDamageTaken)))],
        ['伤害经济转化率', value(`${Math.round(metric((performance) => performance.damageGoldEfficiency) * 100)}%`)],
        ['场均单杀', value(metric((performance) => performance.soloKills).toFixed(1))],
      ],
    },
    {
      title: '经济与资源',
      rows: [
        ['团队经济占比', value(percent(metric((performance) => performance.teamGoldPercentage)))],
        ['相对队内最高经济', value(percent(metric((performance) => performance.relativeTeamGold)))],
        ['相对全场最高经济', value(percent(metric((performance) => performance.relativeGlobalGold)))],
        ['补刀 / 分', value(metric((performance) => performance.csPerMinute).toFixed(1))],
        ['团队补刀占比', value(percent(metric((performance) => performance.teamCsPercentage)))],
        ['相对队内最高补刀', value(percent(metric((performance) => performance.relativeTeamCs)))],
        ['相对全场最高补刀', value(percent(metric((performance) => performance.relativeGlobalCs)))],
        ['团队推塔伤害占比', value(percent(metric((performance) => performance.teamTurretDamagePercentage)))],
        ['相对队内最高推塔', value(percent(metric((performance) => performance.relativeTeamTurretDamage)))],
        ['相对全场最高推塔', value(percent(metric((performance) => performance.relativeGlobalTurretDamage)))],
      ],
    },
  ];

  return (
    <span
      className="live-champion-tooltip is-floating"
      role="tooltip"
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onMouseEnter}
      onBlur={onMouseLeave}
    >
      <span className="live-champion-tooltip__head">
        <img src={championIcon(champion.alias)} alt="" />
        <span>
          <strong>{champion.name}</strong>
          <small>{champion.games} 场对局 · {champion.wins} 胜 {champion.games - champion.wins} 负 · {champion.wins >= 2 ? `${champion.wins} 连胜` : '近期数据'}</small>
        </span>
        <button
          type="button"
          className="live-champion-tooltip__collect"
          title={`打开玩家战绩并收集更多 ${champion.name} 对局样本`}
          onClick={onCollect}
          disabled={!onCollect}
        >
          收集
        </button>
      </span>
      <span className="live-champion-tooltip__tabs"><b>综合</b><span>熟练度</span></span>
      <span className="live-champion-tooltip__columns">
        {columns.map((column) => <span className="live-champion-tooltip__column" key={column.title}>
          <strong>{column.title}</strong>
          {column.rows.map(([label, metricValue]) => <span className="live-champion-tooltip__metric" key={label}>
            <small>{label}</small><b>{metricValue}</b>
          </span>)}
        </span>)}
      </span>
      {!hasPerformance && <span className="live-champion-tooltip__notice">当前仅有基础战绩；详细占比会在 SGP 数据恢复后自动补齐。</span>}
    </span>
  );
}

function ChampionHover({ champion, onCollect }: { champion: RecentChampionStats; onCollect?: () => void }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const style = useFloatingPosition(anchorRef, open, 660, 340);
  const keepOpen = useCallback(() => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    setOpen(true);
  }, []);
  const closeLater = useCallback(() => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
    }, 180);
  }, []);
  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);
  return (
    <span
      ref={anchorRef}
      className={`live-champ ${champion.wins * 2 >= champion.games ? 'live-champ--win' : 'live-champ--loss'}`}
      tabIndex={0}
      onMouseEnter={keepOpen}
      onMouseLeave={closeLater}
      onFocus={keepOpen}
      onBlur={closeLater}
    >
      <img src={championIcon(champion.alias)} alt={champion.name} loading="lazy" />
      {open && createPortal(
        <ChampionAnalysisTooltip
          champion={champion}
          style={style}
          onMouseEnter={keepOpen}
          onMouseLeave={closeLater}
          onCollect={onCollect}
        />,
        document.body,
      )}
    </span>
  );
}

function rankQueueLabel(queueType: string, queueName: string) {
  const labels: Record<string, string> = {
    RANKED_SOLO_5x5: '单双排位',
    RANKED_FLEX_SR: '灵活排位',
    RANKED_FLEX_TT: '五人组队排位',
    CHERRY: '斗魂竞技场',
    RANKED_TFT: '云顶之弈排位',
    RANKED_TFT_TURBO: '云顶之弈狂暴模式',
    RANKED_TFT_DOUBLE_UP: '云顶之弈 双人作战',
    JADE_RANKED_SOLO_5x5: 'JADE_RANKED_SOLO_5x5',
  };
  return labels[queueType] ?? queueName ?? queueType;
}

function rankTierLabel(tier?: string) {
  if (!tier) return '—';
  return TIER_FULL_NAMES[tier.toUpperCase()] ?? tier;
}

function rankFullDivisionText(rank: PlayerRankSummary) {
  const tier = TIER_FULL_NAMES[rank.tier?.toUpperCase()] ?? rank.tier ?? '无段位';
  const division = rank.division && rank.division !== 'NA' ? ` ${rank.division}` : '';
  return `${tier}${division}`;
}

function rankTableRows(ranks?: PlayerRankSummary[]) {
  const queueTypes = [
    'RANKED_SOLO_5x5',
    'RANKED_FLEX_SR',
    'RANKED_TFT',
    'RANKED_TFT_TURBO',
    'RANKED_TFT_DOUBLE_UP',
    'JADE_RANKED_SOLO_5x5',
  ];
  const byQueue = new Map((ranks ?? []).map((rank) => [rank.queueType, rank]));
  return queueTypes.map((queueType) => ({ queueType, rank: byQueue.get(queueType) }));
}

function useFloatingPosition(
  anchorRef: { current: HTMLElement | null },
  open: boolean,
  preferredWidth: number,
  preferredHeight: number,
) {
  const [style, setStyle] = useState<CSSProperties>({});
  useEffect(() => {
    if (!open) return undefined;
    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(preferredWidth, Math.max(280, window.innerWidth - 24));
      const left = Math.min(Math.max(12, rect.left - 8), Math.max(12, window.innerWidth - width - 12));
      const below = rect.bottom + 8;
      const top = below + preferredHeight <= window.innerHeight - 12
        ? below
        : Math.max(12, rect.top - preferredHeight - 8);
      setStyle({ position: 'fixed', left, top, width });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef, open, preferredHeight, preferredWidth]);
  return style;
}

function RankTierCell({ tier, text }: { tier?: string; text?: string }) {
  if (!tier || tier === 'NA') return <span>—</span>;
  return <span className="live-rank-table__tier">
    <img src={getRankEmblemUrl(tier)} alt="" />
    <span>{text || rankTierLabel(tier)}</span>
  </span>;
}

function RankDetailsPopover({ rank, ranks }: { rank: PlayerRankSummary; ranks?: PlayerRankSummary[] }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const style = useFloatingPosition(anchorRef, open, 760, 285);
  const games = rank.wins + rank.losses;
  const winRate = games > 0 ? Math.round((rank.wins / games) * 100) : 0;
  return (
    <button
      ref={anchorRef}
      type="button"
      className="live-rank-item"
      aria-label={`查看${rank.queueName || '排位'}段位信息`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <img className="live-rank-emblem" src={getRankEmblemUrl(rank.tier)} alt={rank.tier} loading="lazy" />
      <span className="live-rank-text">{rankText(rank)}</span>
      {open && createPortal(
        <span className="live-rank-tooltip live-rank-table is-floating" role="tooltip" style={style}>
          <span className="live-rank-table__head">
            <span>队列</span><span>当前段位</span><span>胜点</span><span>胜场</span><span>负场</span>
            <span>上赛季段位</span><span>上赛季最高段位</span><span>历史最高段位</span>
          </span>
          {rankTableRows(ranks ?? [rank]).map(({ queueType, rank: row }) => (
            <span className="live-rank-table__row" key={`rank-row-${queueType}`}>
              <strong>{rankQueueLabel(queueType, row?.queueName ?? '')}</strong>
              {row ? <RankTierCell tier={row.tier} text={rankFullDivisionText(row)} /> : <span>—</span>}
              <span>{row?.leaguePoints || '—'}</span>
              <span>{row?.wins || '—'}</span>
              <span>{row?.losses || '—'}</span>
              <RankTierCell tier={row?.previousSeasonEndTier} />
              <RankTierCell tier={row?.previousSeasonHighestTier} />
              <RankTierCell tier={row?.highestTier} />
            </span>
          ))}
          {games > 0 && <span className="live-rank-table__note">本赛季 {games} 场 · 胜率 {winRate}%</span>}
        </span>,
        document.body,
      )}
    </button>
  );
}

function summarizeTeam(players: LiveBattlePlayer[]) {
  const playersWithMatches = players.filter((player) => player.matchCount > 0);
  const averageWinRate = playersWithMatches.length > 0
    ? Math.round(playersWithMatches.reduce((total, player) => total + player.winRate, 0) / playersWithMatches.length)
    : 0;
  const averageKda = playersWithMatches.length > 0
    ? Math.round((playersWithMatches.reduce((total, player) => total + player.kda, 0) / playersWithMatches.length) * 100) / 100
    : 0;

  const partyCounts = new Map<string, number>();
  players.forEach((player) => {
    const key = currentPartyKey(player);
    if (key) partyCounts.set(key, (partyCounts.get(key) ?? 0) + 1);
  });
  const premadeGroups = Array.from(partyCounts.values())
    .filter((count) => count > 1)
    .sort((a, b) => b - a);

  return { averageWinRate, averageKda, premadeGroups };
}

function LiveTeamSummaryBar({
  teamId,
  label,
  summary,
  pageBar = false,
}: {
  teamId: number;
  label: string;
  summary: ReturnType<typeof summarizeTeam>;
  pageBar?: boolean;
}) {
  return (
    <div className={`live-team-bar ${pageBar ? 'live-team-bar--page' : ''}`}>
      <span className={`live-team-dot live-team-dot--${teamId === 100 ? 'blue' : 'red'}`} />
      <span className="live-team-name">{label}</span>
      <span className="live-team-metrics">
        <span className={`live-team-metric ${
          summary.averageWinRate >= 50
            ? 'live-team-metric--win'
            : 'live-team-metric--loss'
        }`}>
          {summary.averageWinRate || '—'}
          {summary.averageWinRate ? '%' : ''}
        </span>
        <span className="live-team-sep" />
        <span className="live-team-metric">{summary.averageKda || '—'}</span>
        {summary.premadeGroups.length > 0 && <span className="live-team-sep" />}
        {summary.premadeGroups.map((groupSize, groupIndex) => (
          <span
            key={`${teamId}-party-${groupIndex}`}
            className="live-chip live-chip--party"
          >
            {groupSize} 黑
          </span>
        ))}
      </span>
    </div>
  );
}

function AkariCard({
  player,
  isLoaded,
  index,
  party,
  isSelf,
  onPlayerSearch,
  onMatchOpen,
}: {
  player: LiveBattlePlayer;
  isLoaded: boolean;
  index: number;
  party?: { color: string; label: string };
  isSelf?: boolean;
  onPlayerSearch?: (riotId: string) => void;
  onMatchOpen: (gameId: number, puuid: string, playerName: string) => void;
}) {
  const historyRef = useRef<HTMLDivElement>(null);
  const scrollDragRef = useRef<{
    pointerId: number;
    startY: number;
    startScrollTop: number;
  } | null>(null);
  const [scrollThumb, setScrollThumb] = useState({ top: 0, height: 0, visible: false });
  const champIcon = championIcon(player.championAlias);
  const searchableRiotId = player.riotId || player.gameName;
  const { name, tag } = splitRiotId(player);
  const ranks = useMemo(() => rankLine(player.ranks), [player.ranks]);
  const visibleHistory = player.history;
  const recentWins = visibleHistory.filter((history) => history.win).length;
  const recentLosses = visibleHistory.length - recentWins;
  const currentPosition = positionLabel(player.position);
  const streak = currentStreak(player);
  const soloKillMatches = visibleHistory.filter((history) => history.performance);
  const averageSoloKills = soloKillMatches.length > 0
    ? soloKillMatches.reduce(
      (total, history) => total + (history.performance?.soloKills ?? 0),
      0,
    ) / soloKillMatches.length
    : 0;
  const hasHighWinRate = player.matchCount >= 16 && player.winRate >= 85;
  const careerHidden = player.privacy?.toUpperCase() === 'PRIVATE';
  const champions = useMemo(() => recentChampions(player), [player.history]);
  const historyLoading = player.matchCount === 0 && player.loadState?.history === 'loading';
  const rankLoading = ranks.length === 0 && player.loadState?.rank === 'loading';
  const cardStyle = party
    ? ({ '--live-party-color': party.color } as React.CSSProperties)
    : undefined;
  const winRateTone = player.matchCount === 0
    ? ''
    : player.winRate >= 53
      ? 'live-card-stat--win'
      : player.winRate <= 47
        ? 'live-card-stat--loss'
        : '';
  const kdaTone = player.matchCount === 0
    ? ''
    : player.kda >= 4
      ? 'live-card-stat--win'
      : player.kda < 2
        ? 'live-card-stat--loss'
        : '';

  const updateScrollThumb = useCallback(() => {
    const historyElement = historyRef.current;
    if (!historyElement) return;
    const { clientHeight, scrollHeight, scrollTop } = historyElement;
    const visible = scrollHeight > clientHeight + 1;
    const height = visible
      ? Math.max(28, Math.round((clientHeight * clientHeight) / scrollHeight))
      : 0;
    const travel = Math.max(0, clientHeight - height);
    const top = visible && scrollHeight > clientHeight
      ? Math.round((scrollTop / (scrollHeight - clientHeight)) * travel)
      : 0;
    setScrollThumb((current) => (
      current.top === top && current.height === height && current.visible === visible
        ? current
        : { top, height, visible }
    ));
  }, []);

  useEffect(() => {
    const historyElement = historyRef.current;
    if (!historyElement) return undefined;
    updateScrollThumb();
    const resizeObserver = new ResizeObserver(updateScrollThumb);
    resizeObserver.observe(historyElement);
    const frame = window.requestAnimationFrame(updateScrollThumb);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [historyLoading, updateScrollThumb, visibleHistory.length]);

  const startScrollDrag = useCallback((event: React.PointerEvent<HTMLSpanElement>) => {
    const historyElement = historyRef.current;
    if (!historyElement || !scrollThumb.visible) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrollDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: historyElement.scrollTop,
    };
  }, [scrollThumb.visible]);

  const moveScrollDrag = useCallback((event: React.PointerEvent<HTMLSpanElement>) => {
    const historyElement = historyRef.current;
    const drag = scrollDragRef.current;
    if (!historyElement || !drag || drag.pointerId !== event.pointerId) return;
    const scrollRange = historyElement.scrollHeight - historyElement.clientHeight;
    const thumbRange = historyElement.clientHeight - scrollThumb.height;
    if (scrollRange <= 0 || thumbRange <= 0) return;
    historyElement.scrollTop = drag.startScrollTop
      + ((event.clientY - drag.startY) / thumbRange) * scrollRange;
  }, [scrollThumb.height]);

  const endScrollDrag = useCallback((event: React.PointerEvent<HTMLSpanElement>) => {
    if (scrollDragRef.current?.pointerId !== event.pointerId) return;
    scrollDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return (
    <div
      className={`live-card ${party ? 'live-card--party' : ''} ${isSelf ? 'live-card--self' : ''}`}
      style={cardStyle}
    >
      <motion.div
        className="live-card-inner"
        initial={{ opacity: 0 }}
        animate={{ opacity: isLoaded ? 1 : 0 }}
        transition={{ duration: 0.18, delay: index * 0.01, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="live-card-head">
          <div
            className="live-card-avatar"
            title={`${player.championId > 0 ? player.championName : name}${
              player.summonerLevel ? ` · Lv.${player.summonerLevel}` : ''
            }`}
          >
            {champIcon ? (
              <img
                src={champIcon}
                alt={player.championName}
                loading="lazy"
                onError={(event) => {
                  (event.currentTarget as HTMLImageElement).style.opacity = '0';
                }}
              />
            ) : player.profileIconId ? (
              <ProfileIcon
                iconId={player.profileIconId}
                alt={name || '召唤师头像'}
                size={36}
                className="live-card-profile-icon"
              />
            ) : (
              <span className="live-card-avatar-fallback">{player.championName.slice(0, 1)}</span>
            )}
            {player.summonerLevel ? (
              <span className="live-card-level">{player.summonerLevel}</span>
            ) : null}
          </div>
          <div className="live-card-identity">
            <div className="live-card-name-row">
              <button
                type="button"
                className="live-card-name"
                title={`查看 ${searchableRiotId} 的战绩`}
                onClick={() => onPlayerSearch?.(searchableRiotId)}
                disabled={!searchableRiotId || !onPlayerSearch}
              >
                {name || currentPosition || '未知玩家'}
              </button>
              {tag && <span className="live-card-tag">{tag}</span>}
            </div>
            <button
              type="button"
              className="live-card-more"
              title={`查看 ${searchableRiotId} 的战绩`}
              onClick={() => onPlayerSearch?.(searchableRiotId)}
              disabled={!searchableRiotId || !onPlayerSearch}
            >
              <MoreVertical size={13} />
            </button>
          </div>
        </div>

        <div className="live-card-ranks">
          {ranks.length > 0 ? (
            ranks.map((rank) => <RankDetailsPopover key={rank.queueType || rank.displayText} rank={rank} ranks={player.ranks} />)
          ) : (
            <span className="live-rank-item live-rank-item--empty">
              {rankLoading ? '段位读取中' : '无段位'}
            </span>
          )}
        </div>

        <div className="live-card-stats">
          <span className={`live-card-stat ${winRateTone}`}>
            <b>{player.matchCount > 0 ? `${player.winRate}%` : '— %'}</b>
            {player.matchCount > 0 && <small>({player.matchCount})</small>}
          </span>
          <span className={`live-card-stat live-card-stat--kda ${kdaTone}`}>
            <b>{player.matchCount > 0 ? player.kda.toFixed(2) : '—'}</b>
          </span>
        </div>

        <div className="live-card-tags">
          {isSelf && <span className="live-chip live-chip--self" title="当前登录账号">自己</span>}
          {party && <span className="live-chip live-chip--party" title="预组队成员">小队 {party.label}</span>}
          {hasHighWinRate && (
            <span className="live-chip live-chip--high-win" title={`近 ${player.matchCount} 场胜率 ${player.winRate}%`}>
              高胜率
            </span>
          )}
          {careerHidden && (
            <span className="live-chip live-chip--privacy" title="该玩家已隐藏生涯战绩">
              生涯隐藏
            </span>
          )}
          {streak.count >= 3 && (
            <span className={`live-chip ${streak.win ? 'live-chip--win' : 'live-chip--loss'}`}>
              {streak.count}{streak.win ? ' 连胜' : ' 连败'}
            </span>
          )}
          {averageSoloKills > 0 && (
            <span
              className="live-chip live-chip--solo"
              title={`近 ${soloKillMatches.length} 场平均每场 ${averageSoloKills.toFixed(2)} 次单杀`}
            >
              {averageSoloKills.toFixed(1)} 单杀
            </span>
          )}
          {currentPosition && <span className="live-chip live-chip--position">{currentPosition}</span>}
        </div>

        <div className="live-card-champs">
          {champions.map((champion) => (
            <ChampionHover
              key={champion.alias}
              champion={champion}
              onCollect={searchableRiotId && onPlayerSearch
                ? () => onPlayerSearch(searchableRiotId)
                : undefined}
            />
          ))}
        </div>

        <div className="live-card-history-shell">
          <div
            ref={historyRef}
            className="live-card-history"
            onScroll={updateScrollThumb}
          >
            {visibleHistory.length > 0 ? (
              <>
                {visibleHistory.map((history, historyIndex) => (
                <button
                  type="button"
                  key={`${history.gameId ?? historyIndex}-${history.championAlias}-${historyIndex}`}
                  className={`live-match ${history.win ? 'live-match--win' : 'live-match--loss'}`}
                  disabled={!history.gameId || !player.puuid}
                  title={history.gameId ? '点击查看本场完整战绩' : undefined}
                  onClick={() => {
                    if (history.gameId && player.puuid) {
                      onMatchOpen(history.gameId, player.puuid, searchableRiotId);
                    }
                  }}
                >
                  <span className="live-match-icon">
                    <img
                      src={championIcon(history.championAlias)}
                      alt={history.championName}
                      loading="lazy"
                      onError={(event) => {
                        (event.currentTarget as HTMLImageElement).style.opacity = '0';
                      }}
                    />
                  </span>
                  <span className="live-match-info">
                    <span className="live-match-mode">{history.queueName}</span>
                    <span className="live-match-meta">
                      <span className="live-match-time">{history.timeStr}</span>
                      <span className={`live-match-result ${history.win ? 'live-match-result--win' : 'live-match-result--loss'}`}>
                        {history.win ? '胜' : '负'}
                      </span>
                    </span>
                  </span>
                  <span className="live-match-kda">
                    {history.kills} / {history.deaths} / {history.assists}
                  </span>
                </button>
                ))}
                <span className="live-card-history-summary">
                  近{visibleHistory.length}场 <b>{recentWins}</b>胜<i>{recentLosses}</i>负
                </span>
              </>
            ) : historyLoading ? (
              <span className="live-card-history-placeholder" aria-hidden="true">
                {Array.from({ length: HISTORY_CARD_ROWS }, (_, i) => (
                  <span key={i} className="live-match live-match--placeholder" />
                ))}
              </span>
            ) : (
              <span className="live-card-empty">
                {player.loadState?.history === 'failed' ? '战绩读取失败' : '暂无近期战绩'}
              </span>
            )}
          </div>
          {scrollThumb.visible && (
            <span className="live-card-scrollbar" aria-hidden="true">
              <span
                className="live-card-scrollbar-thumb"
                style={{ height: scrollThumb.height, transform: `translateY(${scrollThumb.top}px)` }}
                onPointerDown={startScrollDrag}
                onPointerMove={moveScrollDrag}
                onPointerUp={endScrollDrag}
                onPointerCancel={endScrollDrag}
              />
            </span>
          )}
        </div>
      </motion.div>
    </div>
  );
}

interface LiveGamePageProps {
  onTitleChange?: (title: string) => void;
  onPlayerSearch?: (riotId: string) => void;
}

export function LiveGamePage({ onTitleChange, onPlayerSearch }: LiveGamePageProps) {
  const [loading, setLoading] = useState(false);
  const [myTeam, setMyTeam] = useState<LiveBattlePlayer[]>([]);
  const [enemyTeam, setEnemyTeam] = useState<LiveBattlePlayer[]>([]);
  const [inGame, setInGame] = useState(false);
  const [phase, setPhase] = useState('');
  const [queueName, setQueueName] = useState('');
  const [mapName, setMapName] = useState('');
  const [myPuuid, setMyPuuid] = useState('');
  const [error, setError] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  const [loadedCards, setLoadedCards] = useState<Set<number>>(new Set());
  const [detailState, setDetailState] = useState<{
    open: boolean;
    loading: boolean;
    match: PlayerMatchDetail | null;
    targetPuuid: string;
    playerName: string;
    error: string;
  }>({
    open: false,
    loading: false,
    match: null,
    targetPuuid: '',
    playerName: '',
    error: '',
  });
  const cardTimerIds = useRef<number[]>([]);
  const fetchSeqRef = useRef(0);
  const battleRosterKeyRef = useRef('');
  const displayedPlayerCountRef = useRef(0);
  const displayedIdentifiedPlayerCountRef = useRef(0);
  const loadedCardCountRef = useRef(0);
  const previewModeRef = useRef(false);

  const clearCardTimers = useCallback(() => {
    cardTimerIds.current.forEach((timerId) => window.clearTimeout(timerId));
    cardTimerIds.current = [];
  }, []);

  const fetchBattle = useCallback(async () => {
    const requestId = fetchSeqRef.current + 1;
    fetchSeqRef.current = requestId;
    setLoading(true);
    setError('');

    const isCurrentRequest = () => fetchSeqRef.current === requestId;

    try {
      const info = await window.lolHelper.live.getBattle();
      // A real-game request may finish just after the user enters preview mode.
      // Never let that late response replace the isolated ten-player preview.
      if (!isCurrentRequest() || previewModeRef.current) return;
      setPhase(info.phase);
      setQueueName(info.queueName ?? '');
      setMapName(info.mapName ?? '');
      setMyPuuid(info.myPuuid ?? '');
      if (info.error) setError(info.error);

      const nextMyTeam = dedupeBattlePlayers(info.myTeam);
      const nextEnemyTeam = dedupeBattlePlayers(info.enemyTeam);
      const infoTotal = nextMyTeam.length + nextEnemyTeam.length;
      if (info.inGame || infoTotal > 0) {
        const nextRosterKey = battleRosterKey(nextMyTeam, nextEnemyTeam);
        const total = nextMyTeam.length + nextEnemyTeam.length;
        const identifiedTotal = identifiedPlayerCount([...nextMyTeam, ...nextEnemyTeam]);
        const previousRosterKey = battleRosterKeyRef.current;
        const hadDisplayedRoster = Boolean(previousRosterKey);

        if (
          hadDisplayedRoster
          && (total === 0 || total < displayedPlayerCountRef.current)
          && identifiedTotal <= displayedIdentifiedPlayerCountRef.current
        ) {
          setInGame(true);
          return;
        }

        const sameRoster = nextRosterKey === previousRosterKey;
        setInGame(info.inGame || total > 0);
        battleRosterKeyRef.current = nextRosterKey;
        displayedPlayerCountRef.current = total;
        displayedIdentifiedPlayerCountRef.current = identifiedTotal;
        setMyTeam(nextMyTeam);
        setEnemyTeam(nextEnemyTeam);
        clearCardTimers();

        if (sameRoster || hadDisplayedRoster) {
          setLoadedCards(loadedCardSet(total));
          loadedCardCountRef.current = total;
          return;
        }

        loadedCardCountRef.current = 0;
        setLoadedCards(new Set());

        for (let i = 0; i < total; i += 1) {
          const timerId = window.setTimeout(() => {
            setLoadedCards((prev) => {
              const next = new Set([...prev, i]);
              loadedCardCountRef.current = next.size;
              return next;
            });
          }, i * 35);
          cardTimerIds.current.push(timerId);
        }
      } else {
        setInGame(false);
        battleRosterKeyRef.current = '';
        displayedPlayerCountRef.current = 0;
        displayedIdentifiedPlayerCountRef.current = 0;
        loadedCardCountRef.current = 0;
        clearCardTimers();
        setLoadedCards(new Set());
        setMyTeam([]);
        setEnemyTeam([]);
      }
    } catch (err) {
      if (!isCurrentRequest() || previewModeRef.current) return;
      setInGame(Boolean(battleRosterKeyRef.current));
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (isCurrentRequest() && !previewModeRef.current) setLoading(false);
    }
  }, [clearCardTimers]);

  useEffect(() => {
    fetchBattle();
    return clearCardTimers;
  }, [clearCardTimers, fetchBattle]);

  useEffect(() => {
    return window.lolHelper.live.onStateChanged((event) => {
      if (previewModeRef.current) return;
      setPhase(event.phase);
      void fetchBattle();
    });
  }, [fetchBattle]);

  useEffect(() => {
    return window.lolHelper.live.onBattleUpdate((event) => {
      if (previewModeRef.current) return;

      if (event.type === 'reset') {
        setMyTeam([]);
        setEnemyTeam([]);
        setInGame(false);
        setLoadedCards(new Set());
        battleRosterKeyRef.current = '';
        displayedPlayerCountRef.current = 0;
        displayedIdentifiedPlayerCountRef.current = 0;
        loadedCardCountRef.current = 0;
        return;
      }

      if (event.type === 'removed') {
        setMyTeam((team) => removePlayerFromTeam(team, event.puuid));
        setEnemyTeam((team) => removePlayerFromTeam(team, event.puuid));
        return;
      }

      const player = event.player;
      const isMine = event.side === 'my';
      if (isMine) {
        setMyTeam((team) => mergePlayerIntoTeam(team, player));
        setEnemyTeam((team) => removeMatchingPlayer(team, player));
      } else {
        setEnemyTeam((team) => mergePlayerIntoTeam(team, player));
        setMyTeam((team) => removeMatchingPlayer(team, player));
      }

      setInGame(true);
      setLoadedCards((prev) => {
        const next = new Set(prev);
        for (let i = 0; i < MAX_BOARD_CARDS; i += 1) next.add(i);
        return next;
      });
    });
  }, []);

  const loadRealBattle = useCallback(() => {
    previewModeRef.current = false;
    setPreviewMode(false);
    void fetchBattle();
  }, [fetchBattle]);

  const togglePreviewMode = useCallback(() => {
    if (previewModeRef.current) {
      loadRealBattle();
      return;
    }

    fetchSeqRef.current += 1;
    clearCardTimers();
    previewModeRef.current = true;
    setPreviewMode(true);
    setLoading(false);
    setError('');
    loadedCardCountRef.current = 10;
    setLoadedCards(loadedCardSet(10));
  }, [clearCardTimers, loadRealBattle]);

  const openMatchDetail = useCallback(async (
    gameId: number,
    puuid: string,
    playerName: string,
  ) => {
    setDetailState({
      open: true,
      loading: true,
      match: null,
      targetPuuid: puuid,
      playerName,
      error: '',
    });

    if (previewModeRef.current) {
      setDetailState((current) => ({
        ...current,
        loading: false,
        error: '演示数据没有对应的真实对局；返回实时模式后可查看完整战绩。',
      }));
      return;
    }

    try {
      const match = await window.lolHelper.live.getMatchDetail(gameId, puuid);
      setDetailState((current) => ({
        ...current,
        loading: false,
        match,
        error: match ? '' : '没有找到这场对局的完整数据，可能已超出最近战绩范围。',
      }));
    } catch (detailError) {
      setDetailState((current) => ({
        ...current,
        loading: false,
        error: detailError instanceof Error ? detailError.message : '完整战绩读取失败',
      }));
    }
  }, []);

  const displayedMyTeam = previewMode ? LIVE_PREVIEW_MY_TEAM : myTeam;
  const displayedEnemyTeam = previewMode ? LIVE_PREVIEW_ENEMY_TEAM : enemyTeam;
  const displayedPhase = previewMode ? 'InProgress' : phase;
  const displayedMyPuuid = previewMode ? (LIVE_PREVIEW_ENEMY_TEAM[2]?.puuid ?? '') : myPuuid;
  const allPlayers = useMemo(
    () => [...displayedMyTeam, ...displayedEnemyTeam],
    [displayedEnemyTeam, displayedMyTeam],
  );
  const parties = useMemo(() => buildParties(allPlayers), [allPlayers]);
  const myTeamSummary = useMemo(() => summarizeTeam(displayedMyTeam), [displayedMyTeam]);
  const enemyTeamSummary = useMemo(() => summarizeTeam(displayedEnemyTeam), [displayedEnemyTeam]);
  const hasBattle = previewMode || (inGame && allPlayers.length > 0);
  const isLobbyPhase = !previewMode
    && ['Lobby', 'Matchmaking', 'ReadyCheck'].includes(displayedPhase);

  const sections = useMemo(() => {
    if (isLobbyPhase) {
      return [{
        teamId: 100,
        players: displayedMyTeam,
        summary: myTeamSummary,
        isMine: true,
      }];
    }
    const mineIsBlue = displayedMyTeam.some((player) => player.teamId === 100)
      || (!displayedMyTeam.some((player) => player.teamId === 200)
        && displayedEnemyTeam.some((player) => player.teamId === 200));
    const blue = {
      teamId: 100,
      players: mineIsBlue ? displayedMyTeam : displayedEnemyTeam,
      summary: mineIsBlue ? myTeamSummary : enemyTeamSummary,
      isMine: mineIsBlue,
    };
    const red = {
      teamId: 200,
      players: mineIsBlue ? displayedEnemyTeam : displayedMyTeam,
      summary: mineIsBlue ? enemyTeamSummary : myTeamSummary,
      isMine: !mineIsBlue,
    };
    return [blue, red];
  }, [displayedEnemyTeam, displayedMyTeam, enemyTeamSummary, isLobbyPhase, myTeamSummary]);

  const mySideLabel = isLobbyPhase
    ? phaseLabel(displayedPhase)
    : sections.find((section) => section.isMine)?.teamId === 200 ? '红队' : '蓝队';
  const blueTeamSize = sections[0].players.length;
  const headerParts = isLobbyPhase
    ? [queueName, mySideLabel, `${displayedMyTeam.length} 人`].filter(Boolean)
    : [queueName, mapName, mySideLabel].filter(Boolean);
  const headerTitle = previewMode
    ? '海克斯大乱斗 · 随机地图 · 红队'
    : headerParts.join(' · ');

  const statusText = previewMode
    ? '演示对局'
    : loading ? '读取中' : hasBattle ? phaseLabel(displayedPhase) : error ? '读取失败' : '未进入对局';

  useEffect(() => {
    onTitleChange?.(headerTitle || statusText);
  }, [headerTitle, onTitleChange, statusText]);

  return (
    <div className="live-page">
      <div className="live-page-bar">
        {hasBattle ? (
          <LiveTeamSummaryBar
            teamId={sections[0].teamId}
            label={isLobbyPhase ? '房间' : teamName(sections[0].teamId)}
            summary={sections[0].summary}
            pageBar
          />
        ) : (
          <span className="live-page-title">{statusText}</span>
        )}
        <div className="live-page-actions">
          <button
            type="button"
            onClick={togglePreviewMode}
            className={`live-page-action ${previewMode ? 'live-page-action--active' : ''}`}
            title={previewMode ? '返回真实实时对局' : '载入十人测试数据'}
          >
            <DatabaseZap size={13} />
            {previewMode ? '返回实时' : '测试数据'}
          </button>
          <button
            type="button"
            onClick={loadRealBattle}
            disabled={loading && !previewMode}
            title="刷新实时对局"
            className="live-page-icon-action"
          >
            <RefreshCw size={13} className={loading && !previewMode ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className={`live-page-body ${
        isLobbyPhase ? 'live-page-body--lobby' : hasBattle ? 'live-page-body--battle' : ''
      }`}>
        {error && !inGame ? (
          <div className="live-page-empty live-page-empty--error">{error}</div>
        ) : !hasBattle && !loading ? (
          <div className="live-page-empty">
            <div className="live-page-empty-icon">
              <CircleDashed size={18} />
            </div>
            <span className="live-page-empty-text">未进入对局</span>
          </div>
        ) : (
          <div className={`live-board ${isLobbyPhase ? 'live-board--lobby' : ''}`}>
            {sections.map((section, sectionIndex) => (
              <section className="live-team" key={section.teamId}>
                {!isLobbyPhase && sectionIndex > 0 && (
                  <LiveTeamSummaryBar
                    teamId={section.teamId}
                    label={teamName(section.teamId)}
                    summary={section.summary}
                  />
                )}
                <div
                  className="live-team-cards"
                  style={isLobbyPhase ? {
                    width: '100%',
                    maxWidth: `${Math.max(1, Math.min(5, section.players.length)) * 240 + Math.max(0, Math.min(5, section.players.length) - 1) * 4}px`,
                    gridTemplateColumns: `repeat(${Math.max(1, Math.min(5, section.players.length))}, minmax(0, 1fr))`,
                  } : undefined}
                >
                  {section.players.map((player, idx) => {
                    const cardIndex = sectionIndex === 0 ? idx : idx + blueTeamSize;
                    return (
                      <AkariCard
                        key={`${player.puuid}-${idx}`}
                        player={player}
                        isLoaded={loadedCards.has(cardIndex)}
                        index={cardIndex}
                        party={parties.get(playerIdentity(player))}
                        isSelf={Boolean(displayedMyPuuid) && player.puuid === displayedMyPuuid}
                        onPlayerSearch={onPlayerSearch}
                        onMatchOpen={openMatchDetail}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <LargeDialog
        open={detailState.open}
        onClose={() => setDetailState((current) => ({ ...current, open: false }))}
        title={detailState.playerName ? `${detailState.playerName} · 对局详情` : '对局详情'}
        description={detailState.match
          ? `${detailState.match.queueName} · ${detailState.match.gameId}`
          : detailState.loading
            ? '正在读取 10 名玩家的完整数据'
            : '完整战绩暂时不可用'}
        icon={<Swords className="size-4" />}
        className="h-[720px] w-[1160px] bg-app-bg"
      >
        {detailState.loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-app-muted">
            <LoaderCircle className="size-4 animate-spin" />
            正在读取完整战绩…
          </div>
        ) : detailState.match ? (
          <div className="scrollbar-none h-full overflow-y-auto">
            <MatchDetail
              match={detailState.match}
              targetPuuid={detailState.targetPuuid}
              onPlayerSearch={onPlayerSearch}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center text-xs text-app-muted">
            {detailState.error || '暂无这场对局的完整数据'}
          </div>
        )}
      </LargeDialog>
    </div>
  );
}
