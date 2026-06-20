import { GameIcon } from './GameIcon';
import type { PlayerMatchDetail } from '../../../shared/api';

// 左侧历史战绩列表。每行=英雄头像+模式+日期+KDA。
// 选中态保持低对比度，避免红绿大面积干扰侧栏。
interface MatchListProps {
  matches: PlayerMatchDetail[];
  selectedGameId: number | null;
  onSelect: (gameId: number) => void;
}

export function MatchList({ matches, selectedGameId, onSelect }: MatchListProps) {
  if (matches.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-app-subtle">
        暂无战绩
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-1 overflow-hidden">
      {matches.map((m) => {
        const isSelected = m.gameId === selectedGameId;
        const date = new Date(m.gameCreation);
        const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;

        return (
          <button
            key={m.gameId}
            onClick={() => onSelect(m.gameId)}
            className={`relative flex h-[48px] w-full items-center gap-2.5 overflow-hidden rounded-sm px-2 text-left transition-colors ${
              isSelected
                ? 'bg-app-surface'
                : 'bg-transparent hover:bg-app-surface-soft'
            }`}
          >
            {/* 英雄头像 */}
            <GameIcon
              src={m.championAvatar}
              alt={m.championName}
              title={m.championName}
              size={32}
              rounded
              className="ring-1 ring-black/5"
            />

            {/* 中间：模式 + KDA + 日期 */}
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-xs font-semibold text-app-text">{m.queueName}</span>
                <span className="shrink-0 text-[10px] text-app-subtle">{m.win ? '胜利' : '失败'}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] tabular-nums">
                <span className="text-app-muted">{m.kills}/{m.deaths}/{m.assists}</span>
                <span className="text-app-subtle">{dateStr}</span>
              </div>
            </div>

            <div className="shrink-0 text-right">
              <div className="text-[9px] text-app-subtle">KDA</div>
              <div className="text-xs font-semibold tabular-nums text-app-text">{m.kda.toFixed(1)}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
