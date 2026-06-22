import { GameIcon } from './GameIcon';
import { ProfileIcon } from '../ProfileIcon';
import type { PlayerMatchDetail } from '../../../shared/api';

// 经常一起玩的队友信息（出现≥2次）
export interface RecurringMate {
  puuid: string;
  riotId: string;
  profileIconId: number;
  profileIconUrl: string;
  count: number; // 一起玩了几场
}

// 左侧历史战绩列表。每行=队友头像（≥2场的）+英雄头像+模式+KDA。
interface MatchListProps {
  matches: PlayerMatchDetail[];
  selectedGameId: number | null;
  onSelect: (gameId: number) => void;
  recurringMates: Map<string, RecurringMate>; // puuid → 队友信息
  targetPuuid: string; // 当前查询的玩家 puuid（排除自己）
  onMateClick: (riotId: string) => void; // 点击队友头像查他战绩
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
      {matches.map((m) => {
        const isSelected = m.gameId === selectedGameId;
        const playedAt = formatPlayedAt(m.gameCreation);
        const resultClass = m.win ? 'match-result-card--win' : 'match-result-card--loss';
        const selectedClass = isSelected ? 'match-result-card--selected' : '';

        // 找这场里同队的、出现≥2次的队友（排除自己）
        const matesInThisGame = m.participants
          .filter((p) => p.teamId === m.participants.find((x) => x.puuid === targetPuuid)?.teamId)
          .filter((p) => p.puuid !== targetPuuid)
          .filter((p) => recurringMates.has(p.puuid))
          .slice(0, 3); // 最多显示3个头像

        return (
          <button
            key={m.gameId}
            onClick={() => onSelect(m.gameId)}
            className={`match-result-card ${resultClass} ${selectedClass}`}
          >
        {/* 英雄头像 */}
            <GameIcon
              src={m.championAvatar}
              alt={m.championName}
              title={m.championName}
              size={32}
              rounded
              className={`match-result-avatar ${
                m.win ? 'match-result-avatar--win' : 'match-result-avatar--loss'
              }`}
            />

            {/* 中间：模式 + 队友头像 + KDA + 日期 */}
            <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="match-result-mode">{m.queueName}</span>
                  <span className="match-result-badge">{m.win ? 'WIN' : 'LOSE'}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] tabular-nums">
                  <span className="text-app-muted">{m.kills}/{m.deaths}/{m.assists}</span>
                </div>
              </div>

              {/* 队友头像（空白区，和英雄头像一样大，重叠显示） */}
              {matesInThisGame.length > 0 && (
                <div className="group/mates mx-auto flex shrink-0 items-center">
                  {matesInThisGame.map((mate, idx) => {
                    const info = recurringMates.get(mate.puuid);
                    if (!info) return null;
                    return (
                      <ProfileIcon
                        key={mate.puuid}
                        iconId={info.profileIconId}
                        src={info.profileIconUrl}
                        alt={info.riotId}
                        title={`${info.riotId}（一起${info.count}场）`}
                        size={32}
                        onClick={(e) => {
                          e.stopPropagation();
                          onMateClick(info.riotId);
                        }}
                        className="size-8 cursor-pointer rounded-full border-2 border-app-bg object-cover transition-all hover:z-10 hover:scale-110 group-hover/mates:[&:not(:first-child)]:ml-0"
                        style={{ marginLeft: idx === 0 ? 0 : -16, zIndex: idx }}
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
