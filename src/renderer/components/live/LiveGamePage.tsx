import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Moon, RefreshCw, Sparkles, Star, Sun, Swords } from 'lucide-react';
import { motion } from 'framer-motion';
import type { LiveBattlePlayer } from '../../../shared/api';

const HISTORY_PAGE_SIZE = 8;

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
  isRedTeam,
  isLoaded,
  index,
  historyPage,
}: {
  player: LiveBattlePlayer;
  isRedTeam?: boolean;
  isLoaded: boolean;
  index: number;
  historyPage: number;
}) {
  const champIcon = championIcon(player.championAlias);
  const historyOffset = historyPage * HISTORY_PAGE_SIZE;
  const visibleHistory = player.history.slice(historyOffset, historyOffset + HISTORY_PAGE_SIZE);
  const teamAccent = isRedTeam ? 'text-app-primary' : 'text-app-link';
  const teamWash = isRedTeam
    ? 'bg-gradient-to-br from-app-primary-soft/45 via-app-surface to-app-surface'
    : 'bg-gradient-to-br from-blue-50 via-app-surface to-app-surface';

  return (
    <div className="live-tarot-card group relative min-w-0 [perspective:1200px]">
      <motion.div
        className="relative h-full w-full [transform-style:preserve-3d]"
        initial={{ rotateY: 180, opacity: 0.78 }}
        animate={{ rotateY: isLoaded ? 0 : 180, opacity: isLoaded ? 1 : 0.78 }}
        transition={{ duration: 0.72, delay: index * 0.045, type: 'spring', stiffness: 72, damping: 18 }}
      >
        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-md border border-app-border bg-app-surface shadow-[0_8px_22px_rgba(20,20,20,0.08)] [backface-visibility:hidden]">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage: 'radial-gradient(circle at 50% 50%, #222222 1px, transparent 1px)',
              backgroundSize: '16px 16px',
            }}
          />

          <div className={`relative border-b border-app-border px-2.5 py-2 ${teamWash}`}>
            <div className="flex items-center gap-2.5">
              <div className="relative size-10 shrink-0 overflow-hidden rounded-full border border-white bg-app-surface-soft shadow-sm ring-1 ring-app-border">
                {champIcon && (
                  <img
                    src={champIcon}
                    alt={player.championName}
                    className="h-full w-full scale-110 object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold leading-4 text-app-text">{player.gameName}</div>
                <div className="mt-0.5 flex items-center gap-1">
                  {isRedTeam ? <Sun size={9} className={teamAccent} /> : <Moon size={9} className={teamAccent} />}
                  <span className="text-[9px] font-bold uppercase tracking-wider text-app-muted">
                    {isRedTeam ? 'Sun' : 'Moon'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col bg-app-bg-soft p-2">
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
                    key={`${history.championAlias}-${historyIndex}`}
                    className={`grid min-h-0 grid-cols-[24px_26px_minmax(62px,1fr)_34px] items-center gap-1 rounded-sm border px-1.5 py-0.5 ${
                      history.win
                        ? 'border-green-100 bg-white/92'
                        : 'border-red-100 bg-white/92'
                    }`}
                  >
                    <div className="size-6 overflow-hidden rounded-full border border-white bg-app-surface-soft shadow-sm ring-1 ring-app-border">
                      <img
                        src={championIcon(history.championAlias)}
                        alt={history.championName}
                        className="h-full w-full scale-110 object-cover"
                        onError={(event) => {
                          (event.currentTarget as HTMLImageElement).style.opacity = '0';
                        }}
                      />
                    </div>
                    <span className="truncate text-[11px] font-bold text-app-body">{history.queueName.slice(0, 2)}</span>
                    <span
                      className={`whitespace-nowrap text-center font-mono text-[11px] font-bold tracking-tight ${
                        history.win ? 'text-app-success' : 'text-app-danger'
                      }`}
                    >
                      {history.kills}/{history.deaths}/{history.assists}
                    </span>
                    <span className="whitespace-nowrap text-right font-mono text-[10px] font-bold text-app-text">
                      {history.timeStr}
                    </span>
                  </div>
                ))
              ) : (
                <div className="row-span-8 flex items-center justify-center rounded-sm border border-dashed border-app-border text-xs text-app-muted">
                  {player.history.length > 0 ? '本页暂无更多' : '暂无近期战绩'}
                </div>
              )}
            </div>
          </div>

          <div className="absolute left-1.5 top-1.5 size-2 border-l border-t border-app-primary/35" />
          <div className="absolute right-1.5 top-1.5 size-2 border-r border-t border-app-primary/35" />
          <div className="absolute bottom-1.5 left-1.5 size-2 border-b border-l border-app-primary/25" />
          <div className="absolute right-1.5 bottom-1.5 size-2 border-r border-b border-app-primary/25" />
        </div>

        <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-md border border-app-border bg-app-surface shadow-[0_8px_22px_rgba(20,20,20,0.08)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.045]"
            style={{
              backgroundImage: 'radial-gradient(circle at 50% 50%, #222222 1px, transparent 1px)',
              backgroundSize: '12px 12px',
            }}
          />
          <div className="absolute inset-2 rounded-sm border border-app-primary/20" />
          <div className="absolute left-1 top-1 size-4 border-l border-t border-app-primary/35" />
          <div className="absolute right-1 top-1 size-4 border-r border-t border-app-primary/35" />
          <div className="absolute bottom-1 left-1 size-4 border-b border-l border-app-primary/25" />
          <div className="absolute right-1 bottom-1 size-4 border-r border-b border-app-primary/25" />
          <div className="absolute top-5 flex w-full flex-col items-center">
            <Star size={10} className="mb-1 text-app-primary opacity-70" />
            <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-app-muted">Destiny</span>
          </div>
          <div className="relative flex items-center justify-center">
            <div className="absolute size-20 rotate-45 border border-app-primary/20" />
            <div className="absolute size-24 animate-[spin_30s_linear_infinite] rounded-full border border-dashed border-app-primary/25" />
            <div className="relative z-10 size-14 overflow-hidden rounded-full border-[3px] border-white bg-app-surface shadow-[0_0_18px_rgba(255,56,92,0.22)] ring-1 ring-app-primary/25">
              {champIcon && (
                <img
                  src={champIcon}
                  alt={player.championName}
                  className="h-full w-full scale-110 object-cover opacity-90"
                />
              )}
            </div>
          </div>
          <div className="absolute bottom-7 flex w-full flex-col items-center px-2">
            <span className="w-full truncate text-center text-[13px] font-bold text-app-text">{player.gameName}</span>
            <div className="mt-1 flex w-full items-center justify-center gap-2 opacity-80">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-app-primary/45" />
              <span className="max-w-[72px] truncate font-mono text-[9px] uppercase tracking-wider text-app-primary">
                {player.championName}
              </span>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-app-primary/45" />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function LiveGamePage() {
  const [loading, setLoading] = useState(false);
  const [myTeam, setMyTeam] = useState<LiveBattlePlayer[]>([]);
  const [enemyTeam, setEnemyTeam] = useState<LiveBattlePlayer[]>([]);
  const [inGame, setInGame] = useState(false);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [loadedCards, setLoadedCards] = useState<Set<number>>(new Set());
  const [historyPage, setHistoryPage] = useState(0);
  const cardTimerIds = useRef<number[]>([]);

  const clearCardTimers = useCallback(() => {
    cardTimerIds.current.forEach((timerId) => window.clearTimeout(timerId));
    cardTimerIds.current = [];
  }, []);

  const fetchBattle = useCallback(async () => {
    clearCardTimers();
    setLoading(true);
    setError('');

    try {
      const info = await window.lolHelper.live.getBattle();
      setInGame(info.inGame);
      setPhase(info.phase);
      if (info.error) setError(info.error);

      if (info.inGame) {
        setLoadedCards(new Set());
        setHistoryPage(0);
        setMyTeam(info.myTeam);
        setEnemyTeam(info.enemyTeam);
        const total = info.myTeam.length + info.enemyTeam.length;

        for (let i = 0; i < total; i += 1) {
          const timerId = window.setTimeout(() => {
            setLoadedCards((prev) => new Set([...prev, i]));
          }, i * 85);
          cardTimerIds.current.push(timerId);
        }
      } else {
        setLoadedCards(new Set());
        setHistoryPage(0);
        setMyTeam([]);
        setEnemyTeam([]);
      }
    } catch (err) {
      setInGame(false);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [clearCardTimers]);

  useEffect(() => {
    fetchBattle();
    return clearCardTimers;
  }, [clearCardTimers, fetchBattle]);

  const allPlayers = useMemo(() => [...myTeam, ...enemyTeam], [myTeam, enemyTeam]);
  const hasBattle = inGame && allPlayers.length > 0;
  const isLoaded = hasBattle && loadedCards.size >= allPlayers.length;
  const maxHistoryCount = useMemo(
    () => allPlayers.reduce((max, player) => Math.max(max, player.history.length), 0),
    [allPlayers],
  );
  const totalHistoryPages = Math.max(1, Math.ceil(maxHistoryCount / HISTORY_PAGE_SIZE));
  const historyStart = maxHistoryCount > 0 ? historyPage * HISTORY_PAGE_SIZE + 1 : 0;
  const historyEnd = Math.min(maxHistoryCount, (historyPage + 1) * HISTORY_PAGE_SIZE);
  const statusText = loading ? '读取中' : hasBattle ? phaseLabel(phase) : error ? '读取失败' : '未进入对局';

  useEffect(() => {
    setHistoryPage((currentPage) => Math.min(currentPage, totalHistoryPages - 1));
  }, [totalHistoryPages]);

  const handleHistoryPageChange = (delta: number) => {
    setHistoryPage((currentPage) => Math.min(totalHistoryPages - 1, Math.max(0, currentPage + delta)));
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-app-bg text-app-text">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(255,56,92,0.08),transparent_28%),radial-gradient(circle_at_88%_0%,rgba(66,139,255,0.08),transparent_30%),linear-gradient(180deg,#ffffff_0%,#f7f7f7_100%)]" />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3">
        <div className="mb-2 flex h-7 shrink-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 rounded-full border border-app-border bg-white/78 px-2.5 py-1 shadow-[0_4px_14px_rgba(20,20,20,0.06)] backdrop-blur">
            <Sparkles size={12} className="shrink-0 text-app-primary" />
            <span className="truncate text-[11px] font-bold text-app-body">{statusText}</span>
            <span className={`size-1.5 shrink-0 rounded-full ${
              loading ? 'animate-pulse bg-app-primary' : isLoaded ? 'bg-app-success' : 'bg-app-danger'
            }`} />
          </div>

          <div className="flex min-w-0 items-center gap-2">
            {hasBattle && (
              <div className="flex h-7 items-center gap-1 rounded-full border border-app-border bg-white/78 px-1.5 shadow-[0_4px_14px_rgba(20,20,20,0.06)] backdrop-blur">
                <button
                  type="button"
                  title="上一页战绩"
                  aria-label="上一页战绩"
                  disabled={historyPage <= 0}
                  onClick={() => handleHistoryPageChange(-1)}
                  className="grid size-5 place-items-center rounded-full text-app-muted transition-colors enabled:hover:bg-app-surface-soft enabled:hover:text-app-text disabled:opacity-30"
                >
                  <ChevronLeft size={13} />
                </button>
                <div className="flex min-w-[112px] items-center justify-center gap-1 px-1 font-mono text-[10px] font-bold text-app-body">
                  <span>{historyStart}-{historyEnd}</span>
                  <span className="text-app-subtle">/</span>
                  <span>{maxHistoryCount}</span>
                  <span className="ml-1 text-app-subtle">{historyPage + 1}/{totalHistoryPages}</span>
                </div>
                <button
                  type="button"
                  title="下一页战绩"
                  aria-label="下一页战绩"
                  disabled={historyPage >= totalHistoryPages - 1}
                  onClick={() => handleHistoryPageChange(1)}
                  className="grid size-5 place-items-center rounded-full text-app-muted transition-colors enabled:hover:bg-app-surface-soft enabled:hover:text-app-text disabled:opacity-30"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={fetchBattle}
              disabled={loading}
              title="刷新实时对局"
              className="grid size-7 place-items-center rounded-full border border-app-border bg-white/78 text-app-muted shadow-[0_4px_14px_rgba(20,20,20,0.06)] transition-colors hover:bg-app-surface-soft hover:text-app-text disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
          {error && !inGame ? (
            <div className="flex h-full items-center justify-center text-sm text-app-muted">{error}</div>
          ) : !hasBattle && !loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-app-muted">
              <Star size={24} className="text-app-primary opacity-45" />
              <span className="text-sm text-app-body">当前不在游戏中</span>
              <span className="text-xs opacity-75">进入对局或选人阶段后点击刷新</span>
            </div>
          ) : (
            <div className="live-card-board">
              <div className="live-team-grid">
                {myTeam.map((player, idx) => (
                  <TarotCard
                    key={`${player.puuid}-${idx}`}
                    player={player}
                    isLoaded={loadedCards.has(idx)}
                    index={idx}
                    historyPage={historyPage}
                  />
                ))}
              </div>
              <div className="live-versus-divider">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-app-border to-transparent" />
                <Swords size={12} className="shrink-0 text-app-primary/65" />
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-app-border to-transparent" />
              </div>
              <div className="live-team-grid">
                {enemyTeam.map((player, idx) => (
                  <TarotCard
                    key={`${player.puuid}-${idx}`}
                    player={player}
                    isRedTeam
                    isLoaded={loadedCards.has(idx + myTeam.length)}
                    index={idx + myTeam.length}
                    historyPage={historyPage}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
