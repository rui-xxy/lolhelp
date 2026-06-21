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
  const teamAccent = isRedTeam ? 'text-[#b64c40]' : 'text-[#3f76b5]';
  const teamWash = isRedTeam
    ? 'bg-gradient-to-br from-[#fff5f1] via-[#fbf9f6] to-[#fbf9f6]'
    : 'bg-gradient-to-br from-[#f1f6ff] via-[#fbf9f6] to-[#fbf9f6]';

  return (
    <div className="live-tarot-card group relative min-w-0 [perspective:1200px]">
      <motion.div
        className="relative h-full w-full [transform-style:preserve-3d]"
        initial={{ rotateY: 180, opacity: 0.78 }}
        animate={{ rotateY: isLoaded ? 0 : 180, opacity: isLoaded ? 1 : 0.78 }}
        transition={{ duration: 0.72, delay: index * 0.045, type: 'spring', stiffness: 72, damping: 18 }}
      >
        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[3px] border border-[#b8956a] bg-[#fbf9f6] shadow-[0_5px_14px_rgba(90,68,42,0.15)] [backface-visibility:hidden]">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage: 'radial-gradient(circle at 50% 50%, #8b7355 1px, transparent 1px)',
              backgroundSize: '16px 16px',
            }}
          />

          <div className={`relative border-b border-[#b8956a]/75 px-2 py-1.5 ${teamWash}`}>
            <div className="flex items-center gap-2">
              <div className="relative size-9 shrink-0 overflow-hidden rounded-full border border-[#b8956a] bg-[#efe8dc] shadow-inner">
                {champIcon && (
                  <img
                    src={champIcon}
                    alt={player.championName}
                    className="h-full w-full scale-110 object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-bold leading-4 text-[#3d3022]">{player.gameName}</div>
                <div className="mt-0.5 flex items-center gap-1">
                  {isRedTeam ? <Sun size={9} className={teamAccent} /> : <Moon size={9} className={teamAccent} />}
                  <span className="text-[8px] font-bold uppercase tracking-wider text-[#8b7355]">
                    {isRedTeam ? 'Sun' : 'Moon'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid h-8 shrink-0 grid-cols-3 gap-px border-b border-[#b8956a]/75 bg-[#b8956a]/75">
            <div className="flex flex-col items-center justify-center bg-[#fbf9f6]">
              <span className="text-[7px] font-bold uppercase leading-none tracking-wider text-[#8b7355]">KDA</span>
              <span className="mt-1 font-mono text-[11px] font-bold leading-none text-[#3d3022]">
                {player.kda.toFixed(1)}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center bg-[#fbf9f6]">
              <span className="text-[7px] font-bold uppercase leading-none tracking-wider text-[#8b7355]">Win%</span>
              <span
                className={`mt-1 font-mono text-[11px] font-bold leading-none ${
                  player.winRate >= 50 ? 'text-[#3d8a58]' : 'text-[#bd4a48]'
                }`}
              >
                {player.winRate}%
              </span>
            </div>
            <div className="flex flex-col items-center justify-center bg-[#fbf9f6]">
              <span className="text-[7px] font-bold uppercase leading-none tracking-wider text-[#8b7355]">Games</span>
              <span className="mt-1 font-mono text-[11px] font-bold leading-none text-[#3d3022]">
                {player.matchCount}
              </span>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col bg-[#f3eee5] p-1.5">
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
                    className={`grid min-h-0 grid-cols-[22px_31px_minmax(0,1fr)_39px] items-center gap-1.5 rounded-[3px] border px-1.5 ${
                      history.win
                        ? 'border-[#d8e8d5] bg-[#fbf9f6]/95'
                        : 'border-[#ead7d0] bg-[#fbf9f6]/95'
                    }`}
                  >
                    <div className="size-5 overflow-hidden rounded-full border border-[#b8956a]/45 bg-[#eee7dc]">
                      <img
                        src={championIcon(history.championAlias)}
                        alt={history.championName}
                        className="h-full w-full scale-110 object-cover"
                        onError={(event) => {
                          (event.currentTarget as HTMLImageElement).style.opacity = '0';
                        }}
                      />
                    </div>
                    <span className="truncate text-[10px] font-bold text-[#5f5244]">{history.queueName.slice(0, 2)}</span>
                    <span
                      className={`truncate text-center font-mono text-[11px] font-bold tracking-tight ${
                        history.win ? 'text-[#3d8a58]' : 'text-[#bd4a48]'
                      }`}
                    >
                      {history.kills}/{history.deaths}/{history.assists}
                    </span>
                    <span className="truncate text-right font-mono text-[10px] font-bold text-[#3d3022]">
                      {history.timeStr}
                    </span>
                  </div>
                ))
              ) : (
                <div className="row-span-8 flex items-center justify-center rounded-[3px] border border-dashed border-[#d9cbb8] text-[10px] text-[#8b7355]">
                  {player.history.length > 0 ? '本页暂无更多' : '暂无近期战绩'}
                </div>
              )}
            </div>
          </div>

          <div className="absolute left-1 top-1 size-2 border-l-[1.5px] border-t-[1.5px] border-[#b8956a]" />
          <div className="absolute right-1 top-1 size-2 border-r-[1.5px] border-t-[1.5px] border-[#b8956a]" />
          <div className="absolute bottom-1 left-1 size-2 border-b-[1.5px] border-l-[1.5px] border-[#b8956a]" />
          <div className="absolute bottom-1 right-1 size-2 border-b-[1.5px] border-r-[1.5px] border-[#b8956a]" />
        </div>

        <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-[3px] border border-[#b8956a] bg-[#fbf9f6] shadow-[0_5px_14px_rgba(90,68,42,0.15)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.045]"
            style={{
              backgroundImage: 'radial-gradient(circle at 50% 50%, #8b7355 1px, transparent 1px)',
              backgroundSize: '12px 12px',
            }}
          />
          <div className="absolute inset-2 border border-[#b8956a]/35" />
          <div className="absolute left-1 top-1 size-4 border-l-[1.5px] border-t-[1.5px] border-[#b8956a]" />
          <div className="absolute right-1 top-1 size-4 border-r-[1.5px] border-t-[1.5px] border-[#b8956a]" />
          <div className="absolute bottom-1 left-1 size-4 border-b-[1.5px] border-l-[1.5px] border-[#b8956a]" />
          <div className="absolute bottom-1 right-1 size-4 border-b-[1.5px] border-r-[1.5px] border-[#b8956a]" />
          <div className="absolute top-5 flex w-full flex-col items-center">
            <Star size={10} className="mb-1 text-[#b8956a] opacity-80" />
            <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-[#8b7355]">Destiny</span>
          </div>
          <div className="relative flex items-center justify-center">
            <div className="absolute size-20 rotate-45 border border-[#b8956a]/40" />
            <div className="absolute size-24 animate-[spin_30s_linear_infinite] rounded-full border border-dashed border-[#b8956a]/50" />
            <div className="relative z-10 size-14 overflow-hidden rounded-full border-[3px] border-[#b8956a] bg-[#fbf9f6] shadow-[0_0_18px_rgba(184,149,106,0.28)]">
              {champIcon && (
                <img
                  src={champIcon}
                  alt={player.championName}
                  className="h-full w-full scale-110 object-cover opacity-90 mix-blend-multiply"
                />
              )}
            </div>
          </div>
          <div className="absolute bottom-7 flex w-full flex-col items-center px-2">
            <span className="w-full truncate text-center text-[12px] font-bold text-[#3d3022]">{player.gameName}</span>
            <div className="mt-1 flex w-full items-center justify-center gap-2 opacity-80">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#b8956a]" />
              <span className="max-w-[72px] truncate font-mono text-[8px] uppercase tracking-wider text-[#b8956a]">
                {player.championName}
              </span>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#b8956a]" />
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
    <div className="relative flex h-full flex-col overflow-hidden bg-[#f3ead8] font-serif text-[#4a3b2c]">
      <div className="pointer-events-none absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] opacity-38 mix-blend-multiply" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#f5eddf] via-[#f1e7d5] to-[#e9dcc5]" />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3">
        <div className="mb-2 flex h-7 shrink-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 rounded-full border border-[#d8c6ac] bg-[#fbf9f6]/78 px-2.5 py-1 shadow-[0_2px_10px_rgba(95,75,48,0.07)] backdrop-blur">
            <Sparkles size={12} className="shrink-0 text-[#b8956a]" />
            <span className="truncate text-[11px] font-bold text-[#7d674c]">{statusText}</span>
            <span className={`size-1.5 shrink-0 rounded-full ${
              loading ? 'animate-pulse bg-[#b8956a]' : isLoaded ? 'bg-[#3d8a58]' : 'bg-[#bd4a48]'
            }`} />
          </div>

          <div className="flex min-w-0 items-center gap-2">
            {hasBattle && (
              <div className="flex h-7 items-center gap-1 rounded-full border border-[#d8c6ac] bg-[#fbf9f6]/78 px-1.5 shadow-[0_2px_10px_rgba(95,75,48,0.07)] backdrop-blur">
                <button
                  type="button"
                  title="上一页战绩"
                  aria-label="上一页战绩"
                  disabled={historyPage <= 0}
                  onClick={() => handleHistoryPageChange(-1)}
                  className="grid size-5 place-items-center rounded-full text-[#8b7355] transition-colors enabled:hover:bg-[#efe5d5] enabled:hover:text-[#3d3022] disabled:opacity-30"
                >
                  <ChevronLeft size={13} />
                </button>
                <div className="flex min-w-[112px] items-center justify-center gap-1 px-1 font-mono text-[10px] font-bold text-[#6d5a43]">
                  <span>{historyStart}-{historyEnd}</span>
                  <span className="text-[#aa987f]">/</span>
                  <span>{maxHistoryCount}</span>
                  <span className="ml-1 text-[#aa987f]">{historyPage + 1}/{totalHistoryPages}</span>
                </div>
                <button
                  type="button"
                  title="下一页战绩"
                  aria-label="下一页战绩"
                  disabled={historyPage >= totalHistoryPages - 1}
                  onClick={() => handleHistoryPageChange(1)}
                  className="grid size-5 place-items-center rounded-full text-[#8b7355] transition-colors enabled:hover:bg-[#efe5d5] enabled:hover:text-[#3d3022] disabled:opacity-30"
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
              className="grid size-7 place-items-center rounded-full border border-[#d8c6ac] bg-[#fbf9f6]/78 text-[#8b7355] shadow-[0_2px_10px_rgba(95,75,48,0.07)] transition-colors hover:bg-[#efe5d5] hover:text-[#3d3022] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
          {error && !inGame ? (
            <div className="flex h-full items-center justify-center text-sm text-[#8b7355]">{error}</div>
          ) : !hasBattle && !loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-[#8b7355]">
              <Star size={24} className="opacity-45" />
              <span className="text-sm">当前不在游戏中</span>
              <span className="text-xs opacity-65">进入对局或选人阶段后点击刷新</span>
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
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#b8956a] to-transparent" />
                <Swords size={12} className="shrink-0 text-[#b8956a]" />
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#b8956a] to-transparent" />
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
