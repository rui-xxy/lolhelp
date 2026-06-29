import { GameIcon } from '../match/GameIcon';
import { ProfileIcon } from '../ProfileIcon';
import { RankEmblem } from '../RankEmblem';
import type { PlayerRankSummary, ScoutHit } from '../../../shared/api';

// 达标者卡片：展示一个高手 + 他的达标场次。
// 点击卡片 → 查他完整战绩（复用 onPlayerSearch）。

interface ScoutHitCardProps {
  hit: ScoutHit;
  index: number;
  region?: string;
  onPlayerClick: (riotId: string, region?: string) => void;
}

const RANK_TIER_NAMES: Record<string, string> = {
  CHALLENGER: '王者',
  GRANDMASTER: '宗师',
  MASTER: '大师',
  DIAMOND: '钻石',
  EMERALD: '翡翠',
  PLATINUM: '铂金',
  GOLD: '黄金',
  SILVER: '白银',
  BRONZE: '黄铜',
  IRON: '黑铁',
};

function getRankMain(rank: PlayerRankSummary): string {
  const tierName = RANK_TIER_NAMES[rank.tier] ?? rank.tier;
  const division = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(rank.tier) ? '' : rank.division;
  return [tierName, division].filter(Boolean).join(' ');
}

function getRankSub(rank: PlayerRankSummary): string {
  return [rank.queueName || '排位', rank.leaguePoints > 0 ? String(rank.leaguePoints) : ''].filter(Boolean).join(' ');
}

export function ScoutHitCard({ hit, index, region, onPlayerClick }: ScoutHitCardProps) {
  const { profile, qualifyingMatches } = hit;
  const riotId = profile.riotId || '未知玩家';
  const rank = profile.rank;

  return (
    <div className="scout-hit-card group">
      <div className={`grid items-stretch gap-3 ${rank ? 'grid-cols-[34px_minmax(0,1fr)_92px]' : 'grid-cols-[34px_minmax(0,1fr)]'}`}>
        <span className="pt-1 text-center text-sm font-bold tabular-nums text-app-subtle">
          #{index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <ProfileIcon
              iconId={profile.profileIconId}
              src={profile.profileIconUrl}
              alt={riotId}
              size={40}
              className="ring-2 ring-app-border"
            />
            <div className="min-w-0 flex-1">
              <button
                onClick={() => riotId && onPlayerClick(riotId, region)}
                disabled={!riotId}
                className="block max-w-full truncate text-left text-sm font-semibold leading-5 text-app-text transition-colors hover:text-app-primary disabled:hover:text-app-text"
                title={`查看 ${riotId} 的完整战绩`}
              >
                {riotId}
              </button>
            </div>
          </div>

          {qualifyingMatches.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {qualifyingMatches.map((m) => (
                <div
                  key={m.gameId}
                  className={`flex items-center gap-1.5 rounded-xs border px-2.5 py-1.5 text-[11px] tabular-nums ${
                    m.win
                      ? 'border-app-win-border bg-app-win-bg text-app-text'
                      : 'border-app-loss-border bg-app-loss-bg text-app-text'
                  }`}
                  title={`${m.championName} · ${m.queueName} · ${m.kills}/${m.deaths}/${m.assists}`}
                >
                  <GameIcon src={m.championAvatar} alt={m.championName} size={18} rounded />
                  <span className="font-semibold">{m.kills}/{m.deaths}/{m.assists}</span>
                  <span className="text-app-subtle">{m.kda.toFixed(1)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {rank && (
          <div className="scout-rank-rail" title={rank.displayText}>
            <RankEmblem rank={rank} size={48} variant="mini" />
            <span className="mt-1 max-w-full truncate text-[11px] font-semibold leading-4 text-app-text">
              {getRankMain(rank)}
            </span>
            <span className="max-w-full truncate text-[10px] leading-3 text-app-muted">
              {getRankSub(rank)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
