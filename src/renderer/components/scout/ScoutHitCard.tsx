import { GameIcon } from '../match/GameIcon';
import { ProfileIcon } from '../ProfileIcon';
import { RankEmblem } from '../RankEmblem';
import type { PlayerRankSummary, ScoutHit } from '../../../shared/api';

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
    <button
      type="button"
      className="scout-hit-card group"
      onClick={() => riotId && onPlayerClick(riotId, region)}
      disabled={!riotId}
      title={`查看 ${riotId} 的完整战绩`}
    >
      <span className="scout-hit-index">{String(index + 1).padStart(2, '0')}</span>
      <ProfileIcon
        iconId={profile.profileIconId}
        src={profile.profileIconUrl}
        alt={riotId}
        size={38}
        className="scout-hit-avatar"
      />

      <span className="scout-hit-main">
        <span className="scout-hit-name-row">
          <strong>{riotId}</strong>
          <small>{hit.totalChampionGames} 场</small>
        </span>
        <span className="scout-hit-matches">
          {qualifyingMatches.map((match) => (
            <span
              key={match.gameId}
              className={`scout-hit-match ${match.win ? 'scout-hit-match--win' : 'scout-hit-match--loss'}`}
              title={`${match.championName} · ${match.queueName} · ${match.kills}/${match.deaths}/${match.assists} · KDA ${match.kda.toFixed(1)}`}
            >
              <GameIcon src={match.championAvatar} alt={match.championName} size={17} rounded />
              <b>{match.kills}/{match.deaths}/{match.assists}</b>
              <em>{match.kda.toFixed(1)}</em>
            </span>
          ))}
        </span>
      </span>

      <span className="scout-hit-rank" title={rank?.displayText || '未定级'}>
        {rank ? <RankEmblem rank={rank} size={34} variant="mini" /> : <span className="scout-hit-rank-empty" />}
        <span>
          <b>{rank ? getRankMain(rank) : '未定级'}</b>
          <small>{rank ? getRankSub(rank) : '暂无排位'}</small>
        </span>
      </span>
    </button>
  );
}
