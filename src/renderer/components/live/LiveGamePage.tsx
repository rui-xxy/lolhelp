import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CircleDashed, DatabaseZap, LoaderCircle, RefreshCw, Swords } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LiveBattlePlayer, PlayerMatchDetail, PlayerRankSummary } from '../../../shared/api';
import { buildChampionSplashByAlias, buildProfileIconCandidates } from '../../../shared/gameAssets';
import { getRankEmblemUrl } from '../RankEmblem';
import { MatchDetail } from '../match/MatchDetail';
import { LargeDialog } from '../ui/large-dialog';
import { LIVE_PARTY_COLORS } from '../../styles/palette';
import { LaneIcon } from '../LaneIcon';
import { LIVE_PREVIEW_ENEMY_TEAM, LIVE_PREVIEW_MY_TEAM } from './livePreviewData';

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

interface PartyInfo {
  color: string;
  label: string;
  size: number;
}

const PARTY_SIZE_LABELS: Record<number, string> = { 2: '双排', 3: '三黑', 4: '四黑', 5: '五黑' };

function partySizeLabel(size: number): string {
  return PARTY_SIZE_LABELS[size] ?? `${size} 黑`;
}

function buildParties(players: LiveBattlePlayer[]) {
  const byParty = new Map<string, LiveBattlePlayer[]>();
  players.forEach((player) => {
    const key = currentPartyKey(player);
    if (!key) return;
    byParty.set(key, [...(byParty.get(key) ?? []), player]);
  });

  const info = new Map<string, PartyInfo>();
  let colorIndex = 0;
  let labelIndex = 0;
  byParty.forEach((partyPlayers) => {
    if (partyPlayers.length < 2) return;
    const color = LIVE_PARTY_COLORS[colorIndex % LIVE_PARTY_COLORS.length];
    const label = PARTY_LABELS[labelIndex % PARTY_LABELS.length];
    colorIndex += 1;
    labelIndex += 1;
    partyPlayers.forEach((player) => info.set(playerIdentity(player), { color, label, size: partyPlayers.length }));
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

function summarizeTeam(
  players: LiveBattlePlayer[],
  parties: Map<string, PartyInfo>,
) {
  const playersWithMatches = players.filter((player) => player.matchCount > 0);
  const averageWinRate = playersWithMatches.length > 0
    ? Math.round(playersWithMatches.reduce((total, player) => total + player.winRate, 0) / playersWithMatches.length)
    : 0;
  const averageKda = playersWithMatches.length > 0
    ? Math.round((playersWithMatches.reduce((total, player) => total + player.kda, 0) / playersWithMatches.length) * 100) / 100
    : 0;

  const partyGroups = new Map<string, PartyInfo>();
  players.forEach((player) => {
    const party = parties.get(playerIdentity(player));
    if (party) partyGroups.set(party.label, party);
  });

  return {
    averageWinRate,
    averageKda,
    partyGroups: Array.from(partyGroups.values()).sort((a, b) => b.size - a.size),
  };
}

function LiveTeamSummaryBar({
  teamId,
  label,
  summary,
  align = 'start',
}: {
  teamId: number;
  label: string;
  summary: ReturnType<typeof summarizeTeam>;
  align?: 'start' | 'end';
}) {
  return (
    <div className={`live-team-bar live-team-bar--${align}`}>
      <span className={`live-team-dot live-team-dot--${teamId === 200 ? 'red' : 'blue'}`} />
      <span className="live-team-name">{label}</span>
      <span className="live-team-metrics">
        <span className={`live-team-metric ${
          !summary.averageWinRate
            ? ''
            : summary.averageWinRate >= 50
              ? 'live-team-metric--win'
              : 'live-team-metric--loss'
        }`}>
          <em>胜率</em>
          <b>{summary.averageWinRate ? `${summary.averageWinRate}%` : '—'}</b>
        </span>
        <span className="live-team-metric">
          <em>KDA</em>
          <b>{summary.averageKda || '—'}</b>
        </span>
        {summary.partyGroups.map((group) => (
          <span
            key={`${teamId}-party-${group.label}`}
            className="live-team-party"
            style={{ '--live-party-color': group.color } as CSSProperties}
            title={`${group.size} 人一起排`}
          >
            <i aria-hidden="true" />
            {partySizeLabel(group.size)} {group.label}
          </span>
        ))}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 对位镜像：一行一组对位，左蓝右红，中间一道光缝。
// ---------------------------------------------------------------------------

type DuelSide = 'blue' | 'red';

interface DuelRow {
  key: string;
  lane: string;
  blue?: LiveBattlePlayer;
  red?: LiveBattlePlayer;
}

interface PartyThread {
  side: DuelSide;
  label: string;
  color: string;
  lane: number;
  rows: number[];
}

const LANE_ORDER = ['top', 'jungle', 'middle', 'bottom', 'utility'];
const LANE_INDEX: Record<string, number> = {
  top: 0,
  jungle: 1,
  middle: 2,
  mid: 2,
  bottom: 3,
  bot: 3,
  adc: 3,
  utility: 4,
  support: 4,
};
const TIER_ORDER = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
const DIVISION_ORDER = ['IV', 'III', 'II', 'I'];
const FORM_CELLS = 20;
const GTIMG_SKIN_BASE = 'https://game.gtimg.cn/images/lol/act/img/skin/big';

function laneIndex(player: LiveBattlePlayer): number {
  return LANE_INDEX[String(player.position ?? '').toLowerCase()] ?? -1;
}

function hasDistinctLanes(team: LiveBattlePlayer[]): boolean {
  const lanes = team.map(laneIndex);
  return lanes.every((lane) => lane >= 0) && new Set(lanes).size === lanes.length;
}

// 段位越高越靠前；同段位比胜率。没有分路的模式（大乱斗等）用它来排对位。
function strengthScore(player: LiveBattlePlayer): number {
  const ranks = player.ranks ?? (player.rank ? [player.rank] : []);
  const playable = (queueType: string) => ranks.find(
    (rank) => rank.queueType === queueType && rank.tier && rank.tier !== 'NA',
  );
  const rank = playable('RANKED_SOLO_5x5') ?? playable('RANKED_FLEX_SR');
  const tier = rank ? TIER_ORDER.indexOf(rank.tier.toUpperCase()) : -1;
  const division = rank ? Math.max(0, DIVISION_ORDER.indexOf(rank.division)) : 0;
  const rankScore = tier >= 0 ? tier * 10_000 + division * 1_000 + Math.min(999, rank?.leaguePoints ?? 0) : -1;
  return rankScore * 100 + (player.matchCount > 0 ? player.winRate : 0);
}

function buildDuelRows(
  blue: LiveBattlePlayer[],
  red: LiveBattlePlayer[],
  keepOrder: boolean,
): DuelRow[] {
  const everyone = [...blue, ...red];
  if (!keepOrder && everyone.length > 0 && hasDistinctLanes(blue) && hasDistinctLanes(red)) {
    return LANE_ORDER
      .map((lane, index) => ({
        key: lane,
        lane,
        blue: blue.find((player) => laneIndex(player) === index),
        red: red.find((player) => laneIndex(player) === index),
      }))
      .filter((row) => row.blue || row.red);
  }

  const arrange = (team: LiveBattlePlayer[]) => (
    keepOrder ? team : [...team].sort((a, b) => strengthScore(b) - strengthScore(a))
  );
  const blueRows = arrange(blue);
  const redRows = arrange(red);
  return Array.from({ length: Math.max(blueRows.length, redRows.length) }, (_, index) => ({
    key: `slot-${index}`,
    lane: '',
    blue: blueRows[index],
    red: redRows[index],
  }));
}

// 同一队里一起排的人，在外侧用一根细线串起来。
function buildPartyThreads(
  rows: DuelRow[],
  parties: Map<string, PartyInfo>,
): PartyThread[] {
  const threads: PartyThread[] = [];
  (['blue', 'red'] as const).forEach((side) => {
    const groups = new Map<string, PartyThread>();
    rows.forEach((row, rowIndex) => {
      const player = row[side];
      const party = player ? parties.get(playerIdentity(player)) : undefined;
      if (!party) return;
      const group = groups.get(party.label) ?? { side, label: party.label, color: party.color, lane: 0, rows: [] };
      group.rows.push(rowIndex);
      groups.set(party.label, group);
    });
    let lane = 0;
    groups.forEach((group) => {
      if (group.rows.length < 2) return;
      threads.push({ ...group, lane });
      lane += 1;
    });
  });
  return threads;
}

function championSplashCandidates(championId: number, alias: string): string[] {
  const urls: string[] = [];
  if (championId > 0) urls.push(`${GTIMG_SKIN_BASE}${championId}000.jpg`);
  if (alias) urls.push(buildChampionSplashByAlias(alias, championId, 0));
  return urls.filter(Boolean);
}

function compactNumber(value: number): string {
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  return Math.round(value).toLocaleString();
}

function agoLabel(timeStr: string): string {
  return /[分时天]$/.test(timeStr) ? `${timeStr}前` : timeStr;
}

// 外沿透进来的英雄原画；没有英雄（房间阶段）时退回到召唤师头像，虚化成一团底色。
function DuelArt({ player }: { player: LiveBattlePlayer }) {
  const splashSources = useMemo(
    () => championSplashCandidates(player.championId, player.championAlias),
    [player.championAlias, player.championId],
  );
  const sources = useMemo(
    () => [...splashSources, ...buildProfileIconCandidates(player.profileIconId)],
    [player.profileIconId, splashSources],
  );
  const [sourceIndex, setSourceIndex] = useState(0);
  const src = sources[sourceIndex];
  if (!src) return <span className="live-duel-art live-duel-art--empty" aria-hidden="true" />;
  return (
    <span
      className={`live-duel-art ${sourceIndex >= splashSources.length ? 'live-duel-art--icon' : ''}`}
      aria-hidden="true"
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setSourceIndex((current) => current + 1)}
      />
    </span>
  );
}

// 近 20 场胜负：一排小格，最新一局在最外侧（贴着原画那一边）。
function FormStrip({ history, loading }: { history: LiveBattlePlayer['history']; loading: boolean }) {
  const recent = history.slice(0, FORM_CELLS);
  const wins = recent.filter((match) => match.win).length;
  return (
    <div
      className="live-duel-form"
      aria-label={recent.length > 0 ? `近 ${recent.length} 场 ${wins} 胜 ${recent.length - wins} 负` : '暂无近期战绩'}
    >
      <span className="live-duel-form__cells">
        {Array.from({ length: FORM_CELLS }, (_, cellIndex) => {
          const match = recent[cellIndex];
          return (
            <i
              key={cellIndex}
              data-result={match ? (match.win ? 'win' : 'loss') : undefined}
              data-loading={!match && loading ? 'true' : undefined}
            />
          );
        })}
      </span>
      <span className="live-duel-form__cap">
        {recent.length > 0 ? (
          <>
            <b data-result="win">{wins}</b>胜<b data-result="loss">{recent.length - wins}</b>负
          </>
        ) : loading ? '读取中' : '暂无战绩'}
      </span>
    </div>
  );
}

// 悬浮在卡片上时，卡片向下（或向上）展开出的战绩列表。
type SheetAlign = 'top' | 'bottom' | 'mid';

function DuelHistorySheet({
  player,
  side,
  top,
  height,
  align,
  onMatchOpen,
}: {
  player: LiveBattlePlayer;
  side: DuelSide;
  top: number;
  height: number;
  align: SheetAlign;
  onMatchOpen: (gameId: number, puuid: string, playerName: string) => void;
}) {
  const searchableRiotId = player.riotId || player.gameName;
  const { name, tag } = splitRiotId(player);
  const games = player.history;
  const wins = games.filter((match) => match.win).length;
  const average = (pick: (match: LiveBattlePlayer['history'][number]) => number) => (
    games.length > 0 ? games.reduce((total, match) => total + pick(match), 0) / games.length : 0
  );
  return (
    <motion.div
      className={`live-duel-sheet live-duel-sheet--${side}`}
      data-align={align}
      style={{ top, height }}
      initial={{ opacity: 0, clipPath: side === 'blue' ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)' }}
      animate={{ opacity: 1, clipPath: 'inset(0 0% 0 0%)' }}
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="live-duel-sheet__summary">
        <strong>
          {name || '未知玩家'}
          {tag && <small>{tag}</small>}
        </strong>
        <span>
          近 {games.length} 场 <b data-result="win">{wins}</b> 胜 <b data-result="loss">{games.length - wins}</b> 负
        </span>
        <span>
          场均 {average((match) => match.kills).toFixed(1)} / {average((match) => match.deaths).toFixed(1)} / {average((match) => match.assists).toFixed(1)}
        </span>
        <em>点一局看整场</em>
      </div>
      <div className="live-duel-sheet__head" aria-hidden="true">
        <span />
        <span>结果</span>
        <span>模式</span>
        <span>K / D / A</span>
        <span>KDA</span>
        <span>伤害</span>
        <span>补刀</span>
        <span>时间</span>
      </div>
      <div className="live-duel-sheet__list">
        {games.map((match, matchIndex) => {
          const canOpen = Boolean(match.gameId && player.puuid);
          const ratio = (match.kills + match.assists) / Math.max(1, match.deaths);
          const performance = match.performance;
          return (
            <button
              type="button"
              key={`${match.gameId ?? matchIndex}-${match.championAlias}-${matchIndex}`}
              className="live-sheet-row"
              data-result={match.win ? 'win' : 'loss'}
              aria-disabled={!canOpen}
              onClick={() => {
                if (match.gameId && player.puuid) onMatchOpen(match.gameId, player.puuid, searchableRiotId);
              }}
            >
              <img
                src={championIcon(match.championAlias)}
                alt={match.championName}
                loading="lazy"
                onError={(event) => {
                  (event.currentTarget as HTMLImageElement).style.opacity = '0';
                }}
              />
              <span className="live-sheet-row__result">{match.win ? '胜' : '负'}</span>
              <span className="live-sheet-row__mode">{match.queueName || match.championName}</span>
              <span className="live-sheet-row__kda">
                <b>{match.kills}</b>
                <i>/</i>
                <b className="live-sheet-row__deaths">{match.deaths}</b>
                <i>/</i>
                <b>{match.assists}</b>
              </span>
              <span className={`live-sheet-row__ratio ${ratio >= 4 ? 'is-gold' : ''}`}>{ratio.toFixed(2)}</span>
              <span className="live-sheet-row__num">{performance ? compactNumber(performance.championDamage) : '—'}</span>
              <span className="live-sheet-row__num">{performance ? performance.cs : '—'}</span>
              <span className="live-sheet-row__time">{agoLabel(match.timeStr)}</span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

const HOVER_OPEN_DELAY = 160;
const HOVER_CLOSE_DELAY = 220;
// 展开的战绩表固定这么高（约 9 局），多的滚轮往下翻。
const SHEET_HEIGHT = 348;

function DuelPanel({
  player,
  side,
  isLoaded,
  index,
  party,
  isSelf,
  onPlayerSearch,
  onMatchOpen,
}: {
  player: LiveBattlePlayer;
  side: DuelSide;
  isLoaded: boolean;
  index: number;
  party?: PartyInfo;
  isSelf?: boolean;
  onPlayerSearch?: (riotId: string) => void;
  onMatchOpen: (gameId: number, puuid: string, playerName: string) => void;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const [sheet, setSheet] = useState<{ top: number; height: number; align: SheetAlign } | null>(null);
  const searchableRiotId = player.riotId || player.gameName;
  const { name, tag } = splitRiotId(player);
  const ranks = useMemo(() => rankLine(player.ranks), [player.ranks]);
  const streak = currentStreak(player);
  const hasHighWinRate = player.matchCount >= 16 && player.winRate >= 85;
  const careerHidden = player.privacy?.toUpperCase() === 'PRIVATE';
  const historyLoading = player.matchCount === 0 && player.loadState?.history === 'loading';
  const rankLoading = ranks.length === 0 && player.loadState?.rank === 'loading';
  const winRateTone = player.matchCount === 0
    ? ''
    : player.winRate >= 53
      ? 'is-win'
      : player.winRate <= 47
        ? 'is-loss'
        : '';
  const kdaTone = player.matchCount > 0 && player.kda >= 4 ? 'is-gold' : '';

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
  }, []);

  // 战绩表像抽屉一样从卡片朝中缝的那条边拉出来（蓝方往右、红方往左），紧贴着卡片，高度固定；
  // 顶边尽量和这张卡对齐，靠下的卡就往上挪，始终留在对阵区里，不会撑出滚动条。
  const openSheet = useCallback(() => {
    clearHoverTimer();
    if (player.history.length === 0) return;
    hoverTimerRef.current = window.setTimeout(() => {
      const slot = slotRef.current;
      const rows = slot?.closest('.live-duel-rows');
      const body = slot?.closest('.live-page-body') ?? rows;
      if (!slot || !rows || !body) return;
      const slotRect = slot.getBoundingClientRect();
      const rowsRect = rows.getBoundingClientRect();
      const boundTop = rowsRect.top;
      const boundBottom = Math.max(
        rowsRect.bottom,
        Math.min(body.getBoundingClientRect().bottom, window.innerHeight) - 8,
      );
      const height = Math.min(SHEET_HEIGHT, Math.round(boundBottom - boundTop));
      const top = Math.round(Math.min(Math.max(slotRect.top, boundTop), boundBottom - height) - slotRect.top);
      const align: SheetAlign = Math.abs(top) <= 1
        ? 'top'
        : Math.abs(top + height - slotRect.height) <= 1
          ? 'bottom'
          : 'mid';
      setSheet({ top, height, align });
    }, HOVER_OPEN_DELAY);
  }, [clearHoverTimer, player.history.length]);

  const closeSheet = useCallback(() => {
    clearHoverTimer();
    hoverTimerRef.current = window.setTimeout(() => setSheet(null), HOVER_CLOSE_DELAY);
  }, [clearHoverTimer]);

  useEffect(() => clearHoverTimer, [clearHoverTimer]);

  // 展开后，鼠标停在这张卡或战绩表的任何地方滚轮，都滚动战绩列表，不用先把鼠标挪进列表。
  const sheetOpen = Boolean(sheet);
  useEffect(() => {
    const slot = slotRef.current;
    if (!slot || !sheetOpen) return undefined;
    const handleWheel = (event: WheelEvent) => {
      const list = slot.querySelector<HTMLElement>('.live-duel-sheet__list');
      if (!list || (event.target instanceof Node && list.contains(event.target))) return;
      event.preventDefault();
      list.scrollTop += event.deltaY;
    };
    slot.addEventListener('wheel', handleWheel, { passive: false });
    return () => slot.removeEventListener('wheel', handleWheel);
  }, [sheetOpen]);

  const partyStyle = party ? ({ '--live-party-color': party.color } as CSSProperties) : undefined;

  return (
    <div
      ref={slotRef}
      className={`live-duel-slot live-duel-slot--${side} ${party ? 'is-party' : ''} ${sheet ? `is-open is-align-${sheet.align}` : ''}`}
      style={partyStyle}
      onMouseEnter={openSheet}
      onMouseLeave={closeSheet}
    >
      <div className={`live-duel-panel live-duel-panel--${side} ${party ? 'is-party' : ''} ${isSelf ? 'is-self' : ''}`}>
        <span className="live-duel-window">
          <DuelArt key={`${player.championId}-${player.championAlias}-${player.profileIconId ?? 0}`} player={player} />
          <span className="live-duel-window__tabs">
            {party && (
              <span className="live-duel-tab live-duel-tab--party" title={`和外侧同色连线的人一起排（${partySizeLabel(party.size)}）`}>
                {partySizeLabel(party.size)} {party.label}
              </span>
            )}
            {isSelf && <span className="live-duel-tab live-duel-tab--self">自己</span>}
          </span>
          {player.summonerLevel ? <span className="live-duel-window__level">Lv {player.summonerLevel}</span> : null}
        </span>
        <motion.div
          className="live-duel-panel__inner"
          initial={{ opacity: 0 }}
          animate={{ opacity: isLoaded ? 1 : 0 }}
          transition={{ duration: 0.2, delay: index * 0.012, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="live-duel-id">
            <div className="live-duel-name">
              <button
                type="button"
                className="live-duel-name__btn"
                title={`查看 ${searchableRiotId} 的战绩`}
                onClick={() => onPlayerSearch?.(searchableRiotId)}
                disabled={!searchableRiotId || !onPlayerSearch}
              >
                {name || positionLabel(player.position) || '未知玩家'}
              </button>
              {tag && <span className="live-duel-tag">{tag}</span>}
            </div>
            <div className="live-duel-meta">
              {ranks.length > 0 ? (
                ranks.map((rank) => (
                  <RankDetailsPopover key={rank.queueType || rank.displayText} rank={rank} ranks={player.ranks} />
                ))
              ) : (
                <span className="live-rank-item live-rank-item--empty">
                  {rankLoading ? '段位读取中' : '无段位'}
                </span>
              )}
              {streak.count >= 3 && (
                <span className={`live-chip ${streak.win ? 'live-chip--win' : 'live-chip--loss'}`}>
                  {streak.count}{streak.win ? ' 连胜' : ' 连败'}
                </span>
              )}
              {hasHighWinRate && <span className="live-chip live-chip--high-win">高胜率</span>}
              {careerHidden && <span className="live-chip live-chip--privacy">生涯隐藏</span>}
            </div>
          </div>
          <div className={`live-duel-stat ${winRateTone}`}>
            <b>
              {player.matchCount > 0 ? player.winRate : '—'}
              {player.matchCount > 0 && <small>%</small>}
            </b>
            <span>
              KDA <em className={kdaTone}>{player.matchCount > 0 ? player.kda.toFixed(2) : '—'}</em>
              {player.matchCount > 0 && <> · {player.matchCount} 场</>}
            </span>
          </div>
          <FormStrip history={player.history} loading={historyLoading} />
        </motion.div>
      </div>
      <AnimatePresence>
        {sheet && (
          <DuelHistorySheet
            key="sheet"
            player={player}
            side={side}
            top={sheet.top}
            height={sheet.height}
            align={sheet.align}
            onMatchOpen={onMatchOpen}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function GhostPanel({ side, label }: { side: DuelSide; label?: string }) {
  return (
    <div className={`live-duel-panel live-duel-panel--${side} live-duel-panel--ghost`}>
      {label && <span>{label}</span>}
    </div>
  );
}

function DuelSpine({ row, index }: { row: DuelRow; index: number }) {
  const { blue, red } = row;
  const comparable = Boolean(blue && red && blue.matchCount > 0 && red.matchCount > 0);
  const diff = comparable && blue && red ? blue.winRate - red.winRate : 0;
  const lead = Math.abs(diff) < 1 ? 'even' : diff > 0 ? 'blue' : 'red';
  const amount = Math.round(Math.abs(diff));
  return (
    <div className="live-duel-spine">
      {row.lane ? (
        <span className="live-duel-lane" aria-label={POSITION_NAMES[row.lane]}>
          <LaneIcon lane={row.lane} />
        </span>
      ) : (
        <span className="live-duel-lane live-duel-lane--index">{String(index + 1).padStart(2, '0')}</span>
      )}
      {comparable && (
        <>
          <span
            className="live-duel-meter"
            data-lead={lead}
            style={{ '--reach': Math.min(1, Math.abs(diff) / 12) } as CSSProperties}
            aria-label={lead === 'even' ? '胜率持平' : `${lead === 'blue' ? '蓝方' : '红方'}胜率高 ${amount}%`}
          >
            <i />
          </span>
          <span className="live-duel-adv" data-lead={lead}>
            {lead === 'even' ? '持平' : lead === 'blue' ? `◂ ${amount}%` : `${amount}% ▸`}
          </span>
        </>
      )}
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
  // 主进程的对局会话编号。每开一局新的就加一；收到更新的编号说明手里的名单是上一局的，
  // 要整盘换掉，不能和新数据拼在一起。页面切走期间（Activity 隐藏）漏掉的 reset 也靠它补上。
  const sessionRef = useRef<number | null>(null);

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
      // 请求发出后又收到了更新会话的推送：这份结果已经过时，丢掉。
      if (
        info.session !== undefined
        && sessionRef.current !== null
        && info.session < sessionRef.current
      ) {
        return;
      }
      const sessionChanged = info.session !== undefined && info.session !== sessionRef.current;
      if (info.session !== undefined) sessionRef.current = info.session;
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
        // 换了会话：上一局的名单作废，不参与「人数变少就先不换」的防抖判断。
        const previousRosterKey = sessionChanged ? '' : battleRosterKeyRef.current;
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

      const eventSession = event.session;
      // 上一局迟到的推送：直接丢掉。
      if (eventSession !== undefined && sessionRef.current !== null && eventSession < sessionRef.current) {
        return;
      }
      const isNewSession = eventSession !== undefined && eventSession !== sessionRef.current;
      if (eventSession !== undefined) sessionRef.current = eventSession;

      if (event.type === 'reset' || isNewSession) {
        // 新的一局（或离开对局）：先把旧名单整盘清掉
        setMyTeam([]);
        setEnemyTeam([]);
        setLoadedCards(new Set());
        battleRosterKeyRef.current = '';
        displayedPlayerCountRef.current = 0;
        displayedIdentifiedPlayerCountRef.current = 0;
        loadedCardCountRef.current = 0;
      }

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
  const myTeamSummary = useMemo(() => summarizeTeam(displayedMyTeam, parties), [displayedMyTeam, parties]);
  const enemyTeamSummary = useMemo(() => summarizeTeam(displayedEnemyTeam, parties), [displayedEnemyTeam, parties]);
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
  // 没分路的模式按段位排对位；段位还在读的时候先保持原顺序，读完再排一次，避免卡片来回跳。
  const ranksSettled = allPlayers.every((player) => player.loadState?.rank !== 'loading');
  const duelRows = useMemo(
    () => buildDuelRows(
      sections[0]?.players ?? [],
      isLobbyPhase ? [] : (sections[1]?.players ?? []),
      isLobbyPhase || !ranksSettled,
    ),
    [isLobbyPhase, ranksSettled, sections],
  );
  const partyThreads = useMemo(() => buildPartyThreads(duelRows, parties), [duelRows, parties]);
  const headerParts = isLobbyPhase
    ? [queueName, mySideLabel, `${displayedMyTeam.length} 人`].filter(Boolean)
    : [queueName, mapName, mySideLabel].filter(Boolean);
  // 没有对局时不拼阵营，避免标题栏出现「红队」这类残留标题。
  const headerTitle = previewMode
    ? '海克斯大乱斗 · 随机地图 · 红队'
    : hasBattle ? headerParts.join(' · ') : '';

  const statusText = previewMode
    ? '演示对局'
    : loading ? '读取中' : hasBattle ? phaseLabel(displayedPhase) : error ? '读取失败' : '未进入对局';

  useEffect(() => {
    onTitleChange?.(headerTitle || statusText);
  }, [headerTitle, onTitleChange, statusText]);

  return (
    <div className="live-page">
      <div className="live-page-bar">
        <span className="live-page-title">{statusText}</span>
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
          <div className={`live-duel ${isLobbyPhase ? 'live-duel--lobby' : ''}`}>
            <div className="live-duel-head">
              <LiveTeamSummaryBar
                teamId={sections[0].teamId}
                label={isLobbyPhase ? '房间' : teamName(sections[0].teamId)}
                summary={sections[0].summary}
              />
              <span className="live-duel-vs">{isLobbyPhase ? '' : 'VS'}</span>
              {sections[1] ? (
                <LiveTeamSummaryBar
                  teamId={sections[1].teamId}
                  label={teamName(sections[1].teamId)}
                  summary={sections[1].summary}
                  align="end"
                />
              ) : <span />}
            </div>
            <div className="live-duel-rows">
              {partyThreads.map((thread) => (
                <span
                  key={`${thread.side}-${thread.label}`}
                  className={`live-duel-thread live-duel-thread--${thread.side}`}
                  style={{
                    '--from': thread.rows[0],
                    '--to': thread.rows[thread.rows.length - 1],
                    '--lane': thread.lane,
                    '--live-party-color': thread.color,
                  } as CSSProperties}
                  aria-hidden="true"
                >
                  <b>{thread.label}</b>
                  {thread.rows.map((rowIndex) => (
                    <i key={rowIndex} style={{ '--at': rowIndex - thread.rows[0] } as CSSProperties} />
                  ))}
                </span>
              ))}
              {duelRows.map((row, rowIndex) => {
                const renderSide = (side: DuelSide) => {
                  const player = row[side];
                  if (!player) {
                    const ghostLabel = rowIndex > 0
                      ? undefined
                      : isLobbyPhase
                        ? '匹配成功后显示对手'
                        : side === 'red' || sections[0].players.length === 0
                          ? '对手未知'
                          : undefined;
                    return <GhostPanel side={side} label={ghostLabel} />;
                  }
                  const cardIndex = side === 'blue'
                    ? sections[0].players.indexOf(player)
                    : blueTeamSize + Math.max(0, sections[1]?.players.indexOf(player) ?? 0);
                  return (
                    <DuelPanel
                      key={`${side}-${playerIdentity(player)}`}
                      player={player}
                      side={side}
                      isLoaded={loadedCards.has(cardIndex)}
                      index={cardIndex}
                      party={parties.get(playerIdentity(player))}
                      isSelf={Boolean(displayedMyPuuid) && player.puuid === displayedMyPuuid}
                      onPlayerSearch={onPlayerSearch}
                      onMatchOpen={openMatchDetail}
                    />
                  );
                };
                return (
                  <div className="live-duel-row" key={row.key}>
                    {renderSide('blue')}
                    <DuelSpine row={row} index={rowIndex} />
                    {renderSide('red')}
                  </div>
                );
              })}
            </div>
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
