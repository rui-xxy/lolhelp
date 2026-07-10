import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleDashed, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import type { LiveBattlePlayer } from '../../../shared/api';

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

function loadedCardSet(total: number) {
  return new Set(Array.from({ length: total }, (_, index) => index));
}

function playerIdentity(player: LiveBattlePlayer) {
  return player.puuid || player.riotId || `${player.teamId}:${player.summonerId}`;
}

function currentPartyKey(player: LiveBattlePlayer) {
  return player.premadeId ? `${player.teamId}:${player.premadeId}` : '';
}

function buildSharedPlayColors(players: LiveBattlePlayer[]) {
  const colors = new Map<string, string>();
  const groupedPlayerIndexes = new Set<number>();
  let colorIndex = 0;

  const playersByCurrentParty = new Map<string, number[]>();
  players.forEach((player, index) => {
    const key = currentPartyKey(player);
    if (!key) return;
    playersByCurrentParty.set(key, [...(playersByCurrentParty.get(key) ?? []), index]);
  });

  playersByCurrentParty.forEach((indexes) => {
    if (indexes.length < 2) return;
    const color = SHARED_PLAY_COLORS[colorIndex % SHARED_PLAY_COLORS.length];
    colorIndex += 1;
    indexes.forEach((index) => {
      groupedPlayerIndexes.add(index);
      colors.set(playerIdentity(players[index]), color);
    });
  });

  const parent = players.map((_, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  const playersByPastTeam = new Map<string, number[]>();
  players.forEach((player, playerIndex) => {
    if (groupedPlayerIndexes.has(playerIndex)) return;
    const seenKeys = new Set<string>();
    player.history.forEach((history) => {
      if (!history.gameId || !history.teamId) return;
      seenKeys.add(`${player.teamId}:${history.gameId}:${history.teamId}`);
    });
    seenKeys.forEach((key) => {
      const indexes = playersByPastTeam.get(key) ?? [];
      indexes.push(playerIndex);
      playersByPastTeam.set(key, indexes);
    });
  });

  playersByPastTeam.forEach((indexes) => {
    if (indexes.length < 2) return;
    indexes.slice(1).forEach((index) => union(indexes[0], index));
  });

  const groups = new Map<number, number[]>();
  players.forEach((_, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), index]);
  });

  groups.forEach((indexes) => {
    if (indexes.length < 2) return;
    const color = SHARED_PLAY_COLORS[colorIndex % SHARED_PLAY_COLORS.length];
    colorIndex += 1;
    indexes.forEach((index) => colors.set(playerIdentity(players[index]), color));
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

function TarotCard({
  player,
  isLoaded,
  index,
  sharedColor,
}: {
  player: LiveBattlePlayer;
  isLoaded: boolean;
  index: number;
  sharedColor?: string;
}) {
  const champIcon = championIcon(player.championAlias);
  const visibleHistory = player.history.slice(0, HISTORY_PAGE_SIZE);
  const recentWins = visibleHistory.filter((history) => history.win).length;

  return (
    <div className="live-tarot-card group relative min-w-0">
      <motion.div
        className="relative h-full w-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: isLoaded ? 1 : 0 }}
        transition={{ duration: 0.18, delay: index * 0.01, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-app-surface">
          <div className="relative border-b border-app-border px-2.5 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="relative size-9 shrink-0 overflow-hidden rounded-full bg-app-surface-soft ring-1 ring-app-border">
                {champIcon && (
                  <img
                    src={champIcon}
                    alt={player.championName}
                    className="h-full w-full scale-110 object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-[13px] font-semibold leading-4 text-app-text"
                  style={sharedColor ? { color: sharedColor } : undefined}
                  title={sharedColor ? '组队或近期同队' : undefined}
                >
                  {player.gameName}
                </div>
                <div className="mt-0.5 truncate text-[10px] text-app-subtle">
                  {player.championName}
                  {visibleHistory.length > 0 && ` · 近${visibleHistory.length}局 ${recentWins}胜`}
                </div>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-2 py-1.5">
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
                    className="grid min-h-0 grid-cols-[4px_20px_24px_minmax(58px,1fr)_32px] items-center gap-1 px-1 py-0.5 odd:bg-app-bg-soft/65"
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
                    <span className="truncate text-[10px] font-medium text-app-muted">{history.queueName.slice(0, 2)}</span>
                    <span
                      className={`whitespace-nowrap text-center font-mono text-[11px] font-semibold tracking-tight ${
                        history.win ? 'text-app-success' : 'text-app-danger'
                      }`}
                    >
                      {history.kills}/{history.deaths}/{history.assists}
                    </span>
                    <span className="whitespace-nowrap text-right font-mono text-[10px] font-medium text-app-muted">
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
}

export function LiveGamePage({ onTitleChange }: LiveGamePageProps) {
  const [loading, setLoading] = useState(false);
  const [myTeam, setMyTeam] = useState<LiveBattlePlayer[]>([]);
  const [enemyTeam, setEnemyTeam] = useState<LiveBattlePlayer[]>([]);
  const [inGame, setInGame] = useState(false);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [loadedCards, setLoadedCards] = useState<Set<number>>(new Set());
  const cardTimerIds = useRef<number[]>([]);
  const fetchSeqRef = useRef(0);
  const battleRosterKeyRef = useRef('');
  const loadedCardCountRef = useRef(0);

  const clearCardTimers = useCallback(() => {
    cardTimerIds.current.forEach((timerId) => window.clearTimeout(timerId));
    cardTimerIds.current = [];
  }, []);

  const fetchBattle = useCallback(async () => {
    const requestId = fetchSeqRef.current + 1;
    fetchSeqRef.current = requestId;
    clearCardTimers();
    setLoading(true);
    setError('');

    const isCurrentRequest = () => fetchSeqRef.current === requestId;

    try {
      const info = await window.lolHelper.live.getBattle();
      if (!isCurrentRequest()) return;
      setInGame(info.inGame);
      setPhase(info.phase);
      if (info.error) setError(info.error);

      if (info.inGame) {
        const nextRosterKey = battleRosterKey(info.myTeam, info.enemyTeam);
        const total = info.myTeam.length + info.enemyTeam.length;
        const sameRoster = nextRosterKey === battleRosterKeyRef.current;
        const alreadyLoaded = sameRoster && loadedCardCountRef.current >= total;

        battleRosterKeyRef.current = nextRosterKey;
        setMyTeam(info.myTeam);
        setEnemyTeam(info.enemyTeam);

        if (alreadyLoaded) {
          setLoadedCards((current) => (current.size === total ? current : loadedCardSet(total)));
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
        battleRosterKeyRef.current = '';
        loadedCardCountRef.current = 0;
        setLoadedCards(new Set());
        setMyTeam([]);
        setEnemyTeam([]);
      }
    } catch (err) {
      if (!isCurrentRequest()) return;
      setInGame(false);
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
      setPhase(event.phase);
      if (!event.inGame) {
        clearCardTimers();
        battleRosterKeyRef.current = '';
        loadedCardCountRef.current = 0;
        setLoadedCards(new Set());
        setMyTeam([]);
        setEnemyTeam([]);
        setInGame(false);
      }
      void fetchBattle();
    });
  }, [clearCardTimers, fetchBattle]);

  const allPlayers = useMemo(() => [...myTeam, ...enemyTeam], [myTeam, enemyTeam]);
  const sharedPlayColors = useMemo(() => buildSharedPlayColors(allPlayers), [allPlayers]);
  const hasBattle = inGame && allPlayers.length > 0;
  const statusText = loading ? '读取中' : hasBattle ? phaseLabel(phase) : error ? '读取失败' : '未进入对局';

  useEffect(() => {
    onTitleChange?.(statusText);
  }, [onTitleChange, statusText]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-app-bg text-app-text">
      <button
        type="button"
        onClick={fetchBattle}
        disabled={loading}
        title="刷新实时对局"
        className="absolute top-2 right-3 z-20 grid size-7 place-items-center rounded-sm text-app-muted transition-colors hover:bg-app-nav-hover hover:text-app-text disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
      </button>

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
                  <span>我方</span>
                  <span>{myTeam.length} 人</span>
                </div>
                <div className="live-team-grid">
                  {myTeam.map((player, idx) => (
                    <TarotCard
                      key={`${player.puuid}-${idx}`}
                      player={player}
                      isLoaded={loadedCards.has(idx)}
                      index={idx}
                      sharedColor={sharedPlayColors.get(playerIdentity(player))}
                    />
                  ))}
                </div>
              </section>
              <section className="live-team-section">
                <div className="live-team-heading live-team-heading--enemy">
                  <span>对方</span>
                  <span>{enemyTeam.length} 人</span>
                </div>
                <div className="live-team-grid">
                  {enemyTeam.map((player, idx) => (
                    <TarotCard
                      key={`${player.puuid}-${idx}`}
                      player={player}
                      isLoaded={loadedCards.has(idx + myTeam.length)}
                      index={idx + myTeam.length}
                      sharedColor={sharedPlayColors.get(playerIdentity(player))}
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
