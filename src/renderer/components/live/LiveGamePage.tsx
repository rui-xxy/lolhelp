import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleDashed, DatabaseZap, RefreshCw, UsersRound } from 'lucide-react';
import { motion } from 'framer-motion';
import type { LiveBattlePlayer } from '../../../shared/api';
import { LIVE_PREVIEW_ENEMY_TEAM, LIVE_PREVIEW_MY_TEAM } from './livePreviewData';

const HISTORY_PAGE_SIZE = 8;
const SHARED_PLAY_COLORS = [
  '#d946ef',
  '#0891b2',
  '#16a34a',
  '#f97316',
  '#7c3aed',
  '#0d9488',
];

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

function currentPartyKey(player: LiveBattlePlayer) {
  return player.premadeId ? `${player.teamId}:${player.premadeId}` : '';
}

function buildPremadeColors(players: LiveBattlePlayer[]) {
  const colors = new Map<string, string>();
  let colorIndex = 0;

  const playersByParty = new Map<string, LiveBattlePlayer[]>();
  players.forEach((player) => {
    const key = currentPartyKey(player);
    if (!key) return;
    playersByParty.set(key, [...(playersByParty.get(key) ?? []), player]);
  });

  playersByParty.forEach((partyPlayers) => {
    if (partyPlayers.length < 2) return;
    const color = SHARED_PLAY_COLORS[colorIndex % SHARED_PLAY_COLORS.length];
    colorIndex += 1;
    partyPlayers.forEach((player) => colors.set(playerIdentity(player), color));
  });

  return colors;
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
  };

  return map[phase] ?? phase;
}

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

function positionLabel(position?: string) {
  return POSITION_NAMES[String(position ?? '').toLowerCase()] ?? '';
}

function rankLabel(player: LiveBattlePlayer) {
  if (!player.rank) return '未定级';

  const tierNames: Record<string, string> = {
    IRON: '铁',
    BRONZE: '铜',
    SILVER: '银',
    GOLD: '金',
    PLATINUM: '铂',
    EMERALD: '翡',
    DIAMOND: '钻',
    MASTER: '大师',
    GRANDMASTER: '宗师',
    CHALLENGER: '王者',
  };
  const tier = tierNames[player.rank.tier.toUpperCase()] ?? player.rank.tier;
  return `${tier}${player.rank.division ? ` ${player.rank.division}` : ''}`;
}

function summarizeTeam(players: LiveBattlePlayer[]) {
  const playersWithMatches = players.filter((player) => player.matchCount > 0);
  const averageWinRate = playersWithMatches.length > 0
    ? Math.round(playersWithMatches.reduce((total, player) => total + player.winRate, 0) / playersWithMatches.length)
    : 0;
  const partyCounts = new Map<string, number>();
  players.forEach((player) => {
    const key = currentPartyKey(player);
    if (key) partyCounts.set(key, (partyCounts.get(key) ?? 0) + 1);
  });
  const groupedPlayers = Array.from(partyCounts.values())
    .filter((count) => count > 1)
    .reduce((total, count) => total + count, 0);

  return { averageWinRate, groupedPlayers };
}

function TarotCard({
  player,
  isLoaded,
  index,
  sharedColor,
  onPlayerSearch,
}: {
  player: LiveBattlePlayer;
  isLoaded: boolean;
  index: number;
  sharedColor?: string;
  onPlayerSearch?: (riotId: string) => void;
}) {
  const champIcon = championIcon(player.championAlias);
  const searchableRiotId = player.riotId || player.gameName;
  const visibleHistory = player.history.slice(0, HISTORY_PAGE_SIZE);
  const recentWins = visibleHistory.filter((history) => history.win).length;
  const recentLosses = visibleHistory.length - recentWins;
  const currentPosition = positionLabel(player.position);
  const currentRank = rankLabel(player);
  const tierClass = player.rank?.tier?.toLowerCase() ?? 'unranked';
  const partyStyle = sharedColor
    ? ({ '--live-party-color': sharedColor } as React.CSSProperties)
    : undefined;

  return (
    <div
      className={`live-tarot-card group relative min-w-0 ${sharedColor ? 'live-tarot-card--linked' : ''}`}
      style={partyStyle}
    >
      <motion.div
        className="relative h-full w-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: isLoaded ? 1 : 0 }}
        transition={{ duration: 0.18, delay: index * 0.01, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-app-surface">
          <div className="live-player-profile">
            <div className="live-player-identity">
              <div className="live-player-avatar">
                {champIcon && (
                  <img
                    src={champIcon}
                    alt={player.championName}
                    className="h-full w-full scale-110 object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="live-player-name-line">
                  <button
                    type="button"
                    className="live-player-name-button"
                    title={`查看 ${searchableRiotId} 的战绩`}
                    onClick={() => onPlayerSearch?.(searchableRiotId)}
                    disabled={!searchableRiotId || !onPlayerSearch}
                  >
                    {player.gameName}
                  </button>
                  {sharedColor && (
                    <span className="live-player-party" title="本局双排或多排">
                      <UsersRound className="size-2.5" />
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="live-player-tags">
              <span className="live-player-tag live-player-tag--position">
                {currentPosition || '未分路'}
              </span>
              <span
                className={`live-player-tag live-player-tag--rank live-player-rank--${tierClass}`}
                title={player.rank?.displayText}
              >
                {currentRank}
              </span>
              <span className={`live-player-tag ${player.winRate >= 50 ? 'live-player-tag--win' : 'live-player-tag--loss'}`}>
                胜率 {player.matchCount > 0 ? `${player.winRate}%` : '—'}
              </span>
            </div>
          </div>

          <div className="live-history-caption">
            <span>近期战绩</span>
            <span><b>{recentWins}</b> 胜 <i>{recentLosses}</i> 负</span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-1.5 pb-1.5">
            <div
              className="live-history-list min-h-0 flex-1"
              style={{
                gridTemplateRows:
                  visibleHistory.length > 0 ? `repeat(${visibleHistory.length}, minmax(0, 1fr))` : undefined,
              }}
            >
              {visibleHistory.length > 0 ? (
                visibleHistory.map((history, historyIndex) => (
                  <div
                    key={`${history.championAlias}-${historyIndex}-${history.kills}-${history.deaths}-${history.assists}`}
                    className="live-history-row"
                  >
                    <span
                      className={`size-1 rounded-full ${history.win ? 'bg-app-success/65' : 'bg-app-danger/55'}`}
                      aria-hidden="true"
                    />
                    <div className="size-5 overflow-hidden rounded-full bg-app-surface-soft ring-1 ring-app-border">
                      <img
                        src={championIcon(history.championAlias)}
                        alt={history.championName}
                        className="h-full w-full scale-110 object-cover"
                        onError={(event) => {
                          (event.currentTarget as HTMLImageElement).style.opacity = '0';
                        }}
                      />
                    </div>
                    <span className="live-history-mode">{history.queueName.slice(0, 2)}</span>
                    <span
                      className={`live-history-kda ${
                        history.win ? 'text-app-success' : 'text-app-danger'
                      }`}
                    >
                      {history.kills}/{history.deaths}/{history.assists}
                    </span>
                    <span className="live-history-time">
                      {history.timeStr}
                    </span>
                  </div>
                ))
              ) : (
                <div className="row-span-8 flex items-center justify-center text-xs text-app-subtle">
                  {player.history.length > 0 ? '本页暂无更多' : '暂无近期战绩'}
                </div>
              )}
            </div>
          </div>
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
  const [error, setError] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  const [loadedCards, setLoadedCards] = useState<Set<number>>(new Set());
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
      if (!isCurrentRequest()) return;
      setPhase(info.phase);
      if (info.error) setError(info.error);

      if (info.inGame) {
        const nextRosterKey = battleRosterKey(info.myTeam, info.enemyTeam);
        const total = info.myTeam.length + info.enemyTeam.length;
        const identifiedTotal = identifiedPlayerCount([...info.myTeam, ...info.enemyTeam]);
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
        setInGame(true);
        battleRosterKeyRef.current = nextRosterKey;
        displayedPlayerCountRef.current = total;
        displayedIdentifiedPlayerCountRef.current = identifiedTotal;
        setMyTeam(info.myTeam);
        setEnemyTeam(info.enemyTeam);
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
      if (!isCurrentRequest()) return;
      setInGame(Boolean(battleRosterKeyRef.current));
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (isCurrentRequest()) setLoading(false);
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
    setPhase('InProgress');
    setInGame(true);
    setMyTeam(LIVE_PREVIEW_MY_TEAM);
    setEnemyTeam(LIVE_PREVIEW_ENEMY_TEAM);
    battleRosterKeyRef.current = battleRosterKey(LIVE_PREVIEW_MY_TEAM, LIVE_PREVIEW_ENEMY_TEAM);
    displayedPlayerCountRef.current = 10;
    loadedCardCountRef.current = 10;
    setLoadedCards(loadedCardSet(10));
  }, [clearCardTimers, loadRealBattle]);

  const allPlayers = useMemo(() => [...myTeam, ...enemyTeam], [myTeam, enemyTeam]);
  const premadeColors = useMemo(() => buildPremadeColors(allPlayers), [allPlayers]);
  const myTeamSummary = useMemo(() => summarizeTeam(myTeam), [myTeam]);
  const enemyTeamSummary = useMemo(() => summarizeTeam(enemyTeam), [enemyTeam]);
  const hasBattle = inGame && allPlayers.length > 0;
  const statusText = previewMode
    ? '演示对局'
    : loading ? '读取中' : hasBattle ? phaseLabel(phase) : error ? '读取失败' : '未进入对局';

  useEffect(() => {
    onTitleChange?.(statusText);
  }, [onTitleChange, statusText]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-app-bg text-app-text">
      <div className="absolute top-2 right-3 z-20 flex items-center gap-1">
        <button
          type="button"
          onClick={togglePreviewMode}
          className={`flex h-7 items-center gap-1.5 rounded-sm px-2 text-[10px] font-semibold transition-colors ${
            previewMode
              ? 'bg-app-primary-soft text-app-primary'
              : 'text-app-muted hover:bg-app-nav-hover hover:text-app-text'
          }`}
          title={previewMode ? '返回真实实时对局' : '载入十人测试数据'}
        >
          <DatabaseZap className="size-3.5" />
          {previewMode ? '返回实时' : '测试数据'}
        </button>
        <button
          type="button"
          onClick={loadRealBattle}
          disabled={loading && !previewMode}
          title="刷新实时对局"
          className="grid size-7 place-items-center rounded-sm text-app-muted transition-colors hover:bg-app-nav-hover hover:text-app-text disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={13} className={loading && !previewMode ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-2">
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          {error && !inGame ? (
            <div className="flex h-full items-center justify-center text-sm text-app-muted">{error}</div>
          ) : !hasBattle && !loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-app-muted">
              <div className="grid size-10 place-items-center rounded-full bg-app-surface-soft">
                <CircleDashed size={18} className="text-app-subtle" />
              </div>
              <span className="text-sm text-app-body">未进入对局</span>
            </div>
          ) : (
            <div className="live-card-board">
              <section className="live-team-section">
                <div className="live-team-heading live-team-heading--mine">
                  <span className="live-team-name">我方 <small>{myTeam.length}人</small></span>
                  <span className="live-team-summary">
                    <span>均胜率 <b>{myTeamSummary.averageWinRate || '—'}{myTeamSummary.averageWinRate ? '%' : ''}</b></span>
                    <span>组队 <b>{myTeamSummary.groupedPlayers || '—'}</b></span>
                  </span>
                </div>
                <div className="live-team-grid">
                  {myTeam.map((player, idx) => (
                    <TarotCard
                      key={`${player.puuid}-${idx}`}
                      player={player}
                      isLoaded={loadedCards.has(idx)}
                      index={idx}
                      sharedColor={premadeColors.get(playerIdentity(player))}
                      onPlayerSearch={onPlayerSearch}
                    />
                  ))}
                </div>
              </section>
              <section className="live-team-section">
                <div className="live-team-heading live-team-heading--enemy">
                  <span className="live-team-name">对方 <small>{enemyTeam.length}人</small></span>
                  <span className="live-team-summary">
                    <span>均胜率 <b>{enemyTeamSummary.averageWinRate || '—'}{enemyTeamSummary.averageWinRate ? '%' : ''}</b></span>
                    <span>组队 <b>{enemyTeamSummary.groupedPlayers || '—'}</b></span>
                  </span>
                </div>
                <div className="live-team-grid">
                  {enemyTeam.map((player, idx) => (
                    <TarotCard
                      key={`${player.puuid}-${idx}`}
                      player={player}
                      isLoaded={loadedCards.has(idx + myTeam.length)}
                      index={idx + myTeam.length}
                      sharedColor={premadeColors.get(playerIdentity(player))}
                      onPlayerSearch={onPlayerSearch}
                    />
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
