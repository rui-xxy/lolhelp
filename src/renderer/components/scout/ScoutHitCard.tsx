import { GameIcon } from '../match/GameIcon';
import { ProfileIcon } from '../ProfileIcon';
import type { ScoutHit } from '../../../shared/api';

// 达标者卡片：展示一个高手 + 他的达标场次。
// 点击卡片 → 查他完整战绩（复用 onPlayerSearch）。

interface ScoutHitCardProps {
  hit: ScoutHit;
  index: number;
  onPlayerClick: (riotId: string) => void;
}

export function ScoutHitCard({ hit, index, onPlayerClick }: ScoutHitCardProps) {
  const { profile, qualifyingMatches, totalChampionGames } = hit;
  const riotId = profile.riotId || '未知玩家';

  return (
    <div className="scout-hit-card group">
      {/* 顶部：排名 + 头像 + 名字 + 统计 + 查战绩按钮 */}
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-sm font-bold tabular-nums text-app-subtle">
          #{index + 1}
        </span>
        <ProfileIcon
          iconId={profile.profileIconId}
          src={profile.profileIconUrl}
          alt={riotId}
          size={36}
          className="ring-2 ring-app-border"
        />
        <div className="min-w-0 flex-1">
          <button
            onClick={() => riotId && onPlayerClick(riotId)}
            disabled={!riotId}
            className="block max-w-full truncate text-left text-sm font-semibold text-app-text transition-colors hover:text-app-primary disabled:hover:text-app-text"
            title={`查看 ${riotId} 的完整战绩`}
          >
            {riotId}
          </button>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-app-muted">
            <span>达标 <b className="tabular-nums text-app-text">{qualifyingMatches.length}</b> 场</span>
            <span className="text-app-border">·</span>
            <span>指定英雄共 <b className="tabular-nums text-app-text">{totalChampionGames}</b> 场</span>
          </div>
        </div>
      </div>

      {/* 达标场次列表（紧凑横排） */}
      {qualifyingMatches.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {qualifyingMatches.map((m) => (
            <div
              key={m.gameId}
              className={`flex items-center gap-1.5 rounded-xs border px-2 py-1 text-[11px] tabular-nums ${
                m.win
                  ? 'border-app-win-border bg-app-win-bg text-app-text'
                  : 'border-app-loss-border bg-app-loss-bg text-app-text'
              }`}
              title={`${m.championName} · ${m.queueName} · ${m.kills}/${m.deaths}/${m.assists}`}
            >
              <GameIcon src={m.championAvatar} alt={m.championName} size={16} rounded />
              <span className="font-medium">{m.kills}/{m.deaths}/{m.assists}</span>
              <span className="text-app-subtle">{m.kda.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
