import type { PlayerRankSummary } from '../../shared/api';
import bronzeEmblem from '../assets/rank-emblems/bronze.png';
import challengerEmblem from '../assets/rank-emblems/challenger.png';
import diamondEmblem from '../assets/rank-emblems/diamond.png';
import emeraldEmblem from '../assets/rank-emblems/emerald.png';
import goldEmblem from '../assets/rank-emblems/gold.png';
import grandmasterEmblem from '../assets/rank-emblems/grandmaster.png';
import ironEmblem from '../assets/rank-emblems/iron.png';
import masterEmblem from '../assets/rank-emblems/master.png';
import platinumEmblem from '../assets/rank-emblems/platinum.png';
import silverEmblem from '../assets/rank-emblems/silver.png';

interface RankEmblemProps {
  rank?: PlayerRankSummary | null;
  size?: number;
  variant?: 'emblem' | 'mini';
  className?: string;
}

const RANK_EMBLEM_URLS: Record<string, string> = {
  iron: ironEmblem,
  bronze: bronzeEmblem,
  silver: silverEmblem,
  gold: goldEmblem,
  platinum: platinumEmblem,
  emerald: emeraldEmblem,
  diamond: diamondEmblem,
  master: masterEmblem,
  grandmaster: grandmasterEmblem,
  challenger: challengerEmblem,
};

function getRankEmblemUrl(tier: string): string {
  const normalizedTier = tier.toLowerCase();
  return RANK_EMBLEM_URLS[normalizedTier] ?? RANK_EMBLEM_URLS.iron;
}

export function RankEmblem({ rank, size = 44, className = '' }: RankEmblemProps) {
  if (!rank?.tier) return null;

  return (
    <div
      className={`flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      title={rank.displayText}
      aria-label={rank.displayText}
    >
      <img
        src={getRankEmblemUrl(rank.tier)}
        alt={rank.displayText}
        className="h-full w-full object-contain drop-shadow-[0_2px_5px_rgba(0,0,0,0.18)]"
        draggable={false}
      />
    </div>
  );
}
