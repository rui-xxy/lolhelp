import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlayerMatchDetail } from '../../../shared/api';
import { ChevronRight } from 'lucide-react';
import { ProfileIcon } from '../ProfileIcon';
import { GameIcon } from './GameIcon';
import { getHistoryDayKey } from './MatchActivityNavigator';

export interface RecurringMate {
  puuid: string;
  riotId: string;
  profileIconId: number;
  profileIconUrl: string;
  count: number;
}

interface MatchListProps {
  matches: PlayerMatchDetail[];
  selectedGameId: number | null;
  onSelect: (gameId: number) => void;
  recurringMates: Map<string, RecurringMate>;
  targetPuuid: string;
  onMateClick: (riotId: string) => void;
  activeDayKey?: string | null;
  selectionMode?: boolean;
  selectedIds?: Set<number>;
  onToggleSelection?: (gameId: number) => void;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function formatPlayedAt(gameCreation: number): string {
  const elapsed = Math.max(0, Date.now() - gameCreation);
  if (elapsed < HOUR_MS) {
    return `${Math.max(1, Math.floor(elapsed / MINUTE_MS))}分钟`;
  }
  if (elapsed < DAY_MS) {
    return `${Math.floor(elapsed / HOUR_MS)}小时`;
  }

  const date = new Date(gameCreation);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

interface MatePeekState {
  info: RecurringMate;
  left: number;
  top: number;
}

interface MateClickPulse {
  left: number;
  top: number;
}

export function MatchList({
  matches,
  selectedGameId,
  onSelect,
  recurringMates,
  targetPuuid,
  onMateClick,
  activeDayKey = null,
  selectionMode = false,
  selectedIds,
  onToggleSelection,
}: MatchListProps) {
  const [matePeek, setMatePeek] = useState<MatePeekState | null>(null);
  const [mateClickPulse, setMateClickPulse] = useState<MateClickPulse | null>(null);
  const peekTimerRef = useRef<number | null>(null);
  const pulseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (peekTimerRef.current !== null) window.clearTimeout(peekTimerRef.current);
      if (pulseTimerRef.current !== null) window.clearTimeout(pulseTimerRef.current);
    };
  }, []);

  const hideMatePeek = () => {
    if (peekTimerRef.current !== null) {
      window.clearTimeout(peekTimerRef.current);
      peekTimerRef.current = null;
    }
    setMatePeek(null);
  };

  const scheduleMatePeek = (info: RecurringMate, element: HTMLElement) => {
    if (peekTimerRef.current !== null) window.clearTimeout(peekTimerRef.current);
    const rect = element.getBoundingClientRect();
    peekTimerRef.current = window.setTimeout(() => {
      setMatePeek({
        info,
        left: rect.left + rect.width / 2,
        top: rect.top - 8,
      });
      peekTimerRef.current = null;
    }, 280);
  };

  const pulseMate = (element: HTMLElement) => {
    if (pulseTimerRef.current !== null) window.clearTimeout(pulseTimerRef.current);
    const rect = element.getBoundingClientRect();
    setMateClickPulse({
      left: rect.left + rect.width / 2,
      top: rect.top + rect.height / 2,
    });
    pulseTimerRef.current = window.setTimeout(() => {
      setMateClickPulse(null);
      pulseTimerRef.current = null;
    }, 190);
  };

  if (matches.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-app-subtle">
        暂无战绩
      </div>
    );
  }

  return (
    <div className="match-history-stream">
      {matches.map((match, index) => {
        const isSelected = match.gameId === selectedGameId;
        const isChecked = selectedIds?.has(match.gameId) ?? false;
        const playedAt = formatPlayedAt(match.gameCreation);
        const dayKey = getHistoryDayKey(match.gameCreation);
        const previousDayKey = index > 0 ? getHistoryDayKey(matches[index - 1].gameCreation) : null;
        const startsDay = dayKey !== previousDayKey;
        const [, monthPart, dayPart] = dayKey.split('-');
        const isActiveDay = dayKey === activeDayKey;
        const resultClass = match.win ? 'match-result-card--win' : 'match-result-card--loss';
        const selectedClass = isSelected ? 'match-result-card--selected' : '';
        const myTeam = match.participants.find((participant) => participant.puuid === targetPuuid)?.teamId;
        const matesInThisGame = match.participants
          .filter((participant) => participant.teamId === myTeam)
          .filter((participant) => participant.puuid !== targetPuuid)
          .filter((participant) => recurringMates.has(participant.puuid));
        const visibleMates = matesInThisGame.slice(0, 2);
        const hiddenMateCount = Math.max(0, matesInThisGame.length - visibleMates.length);

        return (
          <div
            key={match.gameId}
            className={`match-history-entry ${startsDay ? 'match-history-entry--day-start' : ''} ${
              isActiveDay ? 'match-history-entry--active-day' : ''
            }`}
          >
            <div
              className="match-history-gutter"
              data-history-day={startsDay ? dayKey : undefined}
              title={startsDay ? `${monthPart}月${dayPart}日` : undefined}
              aria-hidden="true"
            >
              {startsDay && (
                <span className="match-history-gutter__stamp">
                  <strong>{dayPart}</strong>
                  <em>{monthPart}</em>
                </span>
              )}
              <span className="match-history-gutter__node" />
            </div>
            <button
              type="button"
              data-history-day-row={dayKey}
            onClick={() => {
              if (selectionMode) {
                onToggleSelection?.(match.gameId);
                return;
              }
              onSelect(match.gameId);
            }}
            aria-pressed={selectionMode ? isChecked : isSelected}
            className={`match-result-card ${resultClass} ${selectedClass} ${
              selectionMode ? 'match-result-card--selecting' : ''
            } ${
              isChecked ? 'match-result-card--checked' : ''
            }`}
          >
            {selectionMode && (
              <span className="match-result-check" aria-hidden="true">
                {isChecked && <span />}
              </span>
            )}

            <GameIcon
              src={match.championAvatar}
              alt={match.championName}
              title={match.championName}
              size={30}
              rounded
              className={`match-result-avatar ${
                match.win ? 'match-result-avatar--win' : 'match-result-avatar--loss'
              }`}
            />

            <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="match-result-mode">{match.queueName}</span>
                  <span className="match-result-badge" title={match.win ? '胜利' : '失败'}>
                    <i aria-hidden="true" />
                    <span>{match.win ? '胜' : '负'}</span>
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 tabular-nums">
                  <span className="match-result-kda">
                    {match.kills}/{match.deaths}/{match.assists}
                  </span>
                </div>
              </div>

              {visibleMates.length > 0 && (
                <div className="match-result-mates ml-1 flex shrink-0 items-center" aria-label="常一起游戏的队友">
                  {visibleMates.map((mate) => {
                    const info = recurringMates.get(mate.puuid);
                    if (!info) return null;
                    return (
                      <span
                        key={mate.puuid}
                        className="match-result-mate-item"
                        onMouseEnter={(event) => scheduleMatePeek(info, event.currentTarget)}
                        onMouseLeave={hideMatePeek}
                        onClick={(event) => {
                          event.stopPropagation();
                          hideMatePeek();
                          if (!selectionMode) {
                            pulseMate(event.currentTarget);
                            onMateClick(info.riotId);
                          }
                        }}
                      >
                        <ProfileIcon
                          iconId={info.profileIconId}
                          src={info.profileIconUrl}
                          alt={info.riotId}
                          title=""
                          size={20}
                          className="match-result-mate-avatar size-5 cursor-pointer rounded-full object-cover"
                        />
                      </span>
                    );
                  })}
                  {hiddenMateCount > 0 && (
                    <span className="match-result-mate-more" title={`还有 ${hiddenMateCount} 名常一起游戏的队友`}>
                      +{hiddenMateCount}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="match-result-meta">
              <div className="match-result-time">
                <div className="match-result-time-value">{playedAt}</div>
              </div>
              {!selectionMode && <ChevronRight className="match-result-open-affordance" aria-hidden="true" />}
            </div>
            </button>
          </div>
        );
      })}
      {mateClickPulse &&
        createPortal(
          <span
            className="match-result-mate-click-pulse"
            style={{ left: mateClickPulse.left, top: mateClickPulse.top }}
            aria-hidden="true"
          />,
          document.body,
        )}
      {matePeek &&
        createPortal(
          <div
            role="tooltip"
            className="match-result-player-peek"
            style={{ left: matePeek.left, top: matePeek.top }}
          >
            <ProfileIcon
              iconId={matePeek.info.profileIconId}
              src={matePeek.info.profileIconUrl}
              alt={matePeek.info.riotId}
              size={26}
              className="match-result-player-peek__avatar"
            />
            <div className="match-result-player-peek__copy">
              <strong>{matePeek.info.riotId}</strong>
              <span>一起 {matePeek.info.count} 场 · 点击查看战绩</span>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
