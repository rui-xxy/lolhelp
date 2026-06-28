import type { CSSProperties } from 'react';
import type { PlayerMatchDetail } from '../../../shared/api';
import { buildChampionSplashFromAvatar } from '../../../shared/gameAssets';
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
    <div className="flex h-full flex-col gap-1.5 overflow-hidden">
      {matches.map((match) => {
        const isSelected = match.gameId === selectedGameId;
        const isChecked = selectedIds?.has(match.gameId) ?? false;
        const playedAt = formatPlayedAt(match.gameCreation);
        const resultClass = match.win ? 'match-result-card--win' : 'match-result-card--loss';
        const selectedClass = isSelected ? 'match-result-card--selected' : '';
        const fallbackSkinBackground = buildChampionSplashFromAvatar(
          match.championAvatar,
          match.championId,
          null,
          1,
        );
        const skinBackground =
          !match.championSplashUrl || /_0\.jpg$/i.test(match.championSplashUrl)
            ? fallbackSkinBackground
            : match.championSplashUrl;
        const myTeam = match.participants.find((participant) => participant.puuid === targetPuuid)?.teamId;
        const matesInThisGame = match.participants
          .filter((participant) => participant.teamId === myTeam)
          .filter((participant) => participant.puuid !== targetPuuid)
          .filter((participant) => recurringMates.has(participant.puuid))
          .slice(0, 3);

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
              skinBackground ? 'match-result-card--has-skin' : ''
            } ${selectionMode ? 'match-result-card--selecting' : ''} ${
              isChecked ? 'match-result-card--checked' : ''
            }`}
            style={
              skinBackground
                ? ({ '--match-skin-bg': `url("${skinBackground}")` } as CSSProperties)
                : undefined
            }
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
              size={32}
              rounded
              className={`match-result-avatar ${
                match.win ? 'match-result-avatar--win' : 'match-result-avatar--loss'
              }`}
            />

            <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="match-result-mode">{match.queueName}</span>
                  <span className="match-result-badge">{match.win ? 'WIN' : 'LOSE'}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] tabular-nums">
                  <span className="text-app-muted">
                    {match.kills}/{match.deaths}/{match.assists}
                  </span>
                </div>
              </div>

              {matesInThisGame.length > 0 && (
                <div className="group/mates mx-auto flex shrink-0 items-center">
                  {matesInThisGame.map((mate, index) => {
                    const info = recurringMates.get(mate.puuid);
                    if (!info) return null;
                    return (
                      <ProfileIcon
                        key={mate.puuid}
                        iconId={info.profileIconId}
                        src={info.profileIconUrl}
                        alt={info.riotId}
                        title={`${info.riotId}（一起 ${info.count} 场）`}
                        size={32}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!selectionMode) {
                            onMateClick(info.riotId);
                          }
                        }}
                        className="size-8 cursor-pointer rounded-full border-2 border-app-bg object-cover transition-all hover:z-10 hover:scale-110 group-hover/mates:[&:not(:first-child)]:ml-0"
                        style={{ marginLeft: index === 0 ? 0 : -16, zIndex: index }}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            <div className="match-result-time">
              <div className="match-result-time-value">{playedAt}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
