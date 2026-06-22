import type { PlayerRankSummary } from '../../shared/api';

interface RankEmblemProps {
  rank?: PlayerRankSummary | null;
  size?: number;
  variant?: 'emblem' | 'mini';
  className?: string;
}

const RANK_EMBLEM_BASE =
  'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem';
const RANK_MINI_CREST_BASE =
  'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests';

function getRankEmblemUrl(tier: string, variant: RankEmblemProps['variant']): string {
  const normalizedTier = tier.toLowerCase();
  if (variant === 'mini') {
    return `${RANK_MINI_CREST_BASE}/${normalizedTier}.svg`;
  }
  return `${RANK_EMBLEM_BASE}/emblem-${normalizedTier}.png`;
}

export function RankEmblem({ rank, size = 44, variant = 'emblem', className = '' }: RankEmblemProps) {
  if (!rank?.tier) return null;

  return (
    <div
      className={`flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      title={rank.displayText}
      aria-label={rank.displayText}
    >
      <img
        src={getRankEmblemUrl(rank.tier, variant)}
        alt={rank.displayText}
        className="h-full w-full object-contain drop-shadow-[0_2px_5px_rgba(0,0,0,0.18)]"
        draggable={false}
      />
    </div>
  );
}
