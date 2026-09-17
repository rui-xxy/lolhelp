import type { PlayerMatchDetail } from '../../../shared/api';
import { ChevronRight } from 'lucide-react';
import { ProfileIcon } from '../ProfileIcon';
import { GameIcon } from './GameIcon';

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

export function MatchList({
  matches,
  selectedGameId,
  onSelect,
  recurringMates,
  targetPuuid,
  onMateClick,
  selectionMode = false,
  selectedIds,
  onToggleSelection,
}: MatchListProps) {
  if (matches.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-app-subtle">
        暂无战绩
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-0 overflow-hidden">
      {matches.map((match) => {
        const isSelected = match.gameId === selectedGameId;
        const isChecked = selectedIds?.has(match.gameId) ?? false;
        const playedAt = formatPlayedAt(match.gameCreation);
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
          <button
            key={match.gameId}
            type="button"
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
                  <span className="match-result-badge">{match.win ? '胜利' : '失败'}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 tabular-nums">
                  <span className="match-result-kda">
                    {match.kills}/{match.deaths}/{match.assists}
                  </span>
                </div>
              </div>

              {visibleMates.length > 0 && (
                <div className="match-result-mates ml-1 flex shrink-0 items-center" aria-label="常一起游戏的队友">
                  {visibleMates.map((mate, index) => {
                    const info = recurringMates.get(mate.puuid);
                    if (!info) return null;
                    return (
                      <ProfileIcon
                        key={mate.puuid}
                        iconId={info.profileIconId}
                        src={info.profileIconUrl}
                        alt={info.riotId}
                        title={`${info.riotId}（一起 ${info.count} 场）`}
                        size={20}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!selectionMode) {
                            onMateClick(info.riotId);
                          }
                        }}
                        className="match-result-mate-avatar size-5 cursor-pointer rounded-full object-cover"
                        style={{ marginLeft: index === 0 ? 0 : -5 }}
                      />
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
        );
      })}
    </div>
  );
}
