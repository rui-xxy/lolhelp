import { useEffect, useRef } from 'react';
import { ArrowUpRight, PanelRightOpen } from 'lucide-react';
import { GameIcon } from '../match/GameIcon';
import { ProfileIcon } from '../ProfileIcon';
import { RankEmblem } from '../RankEmblem';
import { ScoutFriendButton } from './ScoutFriendButton';
import { prefetchMatchBriefs } from './matchBriefs';
import type { PlayerRankSummary, ScoutHit } from '../../../shared/api';

interface ScoutHitCardProps {
  hit: ScoutHit;
  index: number;
  region?: string;
  active?: boolean;
  glow?: boolean;
  onPeek: (hit: ScoutHit) => void;
  onHover?: (key: string | null) => void;
  onPlayerClick: (riotId: string, region?: string) => void;
}

const PREFETCH_DWELL_MS = 320;

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

export function getRankMain(rank: PlayerRankSummary): string {
  const tierName = RANK_TIER_NAMES[rank.tier] ?? rank.tier;
  const division = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(rank.tier) ? '' : rank.division;
  return [tierName, division].filter(Boolean).join(' ');
}

export function getRankSub(rank: PlayerRankSummary): string {
  return [rank.queueName || '排位', rank.leaguePoints > 0 ? String(rank.leaguePoints) : ''].filter(Boolean).join(' ');
}

function splitRiotId(riotId: string): [string, string] {
  const at = riotId.lastIndexOf('#');
  if (at <= 0) return [riotId, ''];
  return [riotId.slice(0, at), riotId.slice(at)];
}

export function ScoutHitCard({ hit, index, region, active = false, glow = false, onPeek, onHover, onPlayerClick }: ScoutHitCardProps) {
  const { profile, qualifyingMatches } = hit;
  const riotId = profile.riotId || '未知玩家';
  const [gameName, tagLine] = splitRiotId(riotId);
  const rank = profile.rank;
  const prefetchTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (prefetchTimerRef.current !== null) window.clearTimeout(prefetchTimerRef.current);
  }, []);

  // 在卡片上停一下就预取速览数据，点开时基本不用等
  const schedulePrefetch = () => {
    if (!profile.puuid || prefetchTimerRef.current !== null) return;
    prefetchTimerRef.current = window.setTimeout(() => {
      prefetchTimerRef.current = null;
      prefetchMatchBriefs(profile.puuid, region ?? '');
    }, PREFETCH_DWELL_MS);
  };
  const cancelPrefetch = () => {
    if (prefetchTimerRef.current === null) return;
    window.clearTimeout(prefetchTimerRef.current);
    prefetchTimerRef.current = null;
  };

  return (
    <div
      className="scout-hit"
      data-active={active ? 'true' : undefined}
      data-glow={glow ? 'true' : undefined}
      onMouseEnter={() => {
        schedulePrefetch();
        onHover?.(profile.puuid || profile.riotId);
      }}
      onMouseLeave={() => {
        cancelPrefetch();
        onHover?.(null);
      }}
      onClick={() => onPeek(hit)}
    >
      {/* 点卡片任意位置：打开 / 收起战绩速览（这个铺满的按钮负责键盘焦点）；
          名字是单独的按钮：打开完整战绩 */}
      <button
        type="button"
        className="scout-hit__hitbox"
        aria-pressed={active}
        aria-label={`速览 ${riotId} 的近期战绩`}
        title="速览近期战绩"
      />
      <span className="scout-hit__index">{String(index + 1).padStart(2, '0')}</span>
      <span className="scout-hit__avatar">
        <ProfileIcon
          iconId={profile.profileIconId}
          src={profile.profileIconUrl}
          alt={riotId}
          size={40}
        />
        <ScoutFriendButton riotId={profile.riotId} variant="orb" />
      </span>

      <span className="scout-hit__main">
        <span className="scout-hit__name">
          <button
            type="button"
            className="scout-hit__id"
            onClick={(event) => {
              event.stopPropagation();
              if (profile.riotId) onPlayerClick(profile.riotId, region);
            }}
            disabled={!profile.riotId}
            title={`打开 ${riotId} 的完整战绩`}
          >
            <strong>{gameName}</strong>
            {tagLine && <em>{tagLine}</em>}
            <ArrowUpRight className="scout-hit__id-icon" aria-hidden="true" />
          </button>
          <small>{hit.totalChampionGames} 场</small>
        </span>
        <span className="scout-hit__matches">
          {qualifyingMatches.map((match) => (
            <span
              key={match.gameId}
              className="scout-hit__match"
              data-result={match.win ? 'win' : 'loss'}
              title={`${match.win ? '胜利' : '失败'} · ${match.championName} · ${match.queueName} · ${match.kills}/${match.deaths}/${match.assists} · KDA ${match.kda.toFixed(1)}`}
            >
              <GameIcon src={match.championAvatar} alt={match.championName} size={18} rounded />
              <b>{match.kills}/{match.deaths}/{match.assists}</b>
              <em>{match.kda.toFixed(1)}</em>
            </span>
          ))}
        </span>
      </span>

      <span className="scout-hit__rank" title={rank?.displayText || '未定级'}>
        {rank ? <RankEmblem rank={rank} size={34} variant="mini" /> : <span className="scout-hit__rank-empty" />}
        <span>
          <b>{rank ? getRankMain(rank) : '未定级'}</b>
          <small>{rank ? getRankSub(rank) : '暂无排位'}</small>
        </span>
      </span>

      <PanelRightOpen className="scout-hit__go" aria-hidden="true" />
    </div>
  );
}
