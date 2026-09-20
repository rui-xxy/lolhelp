import { useState, type ReactNode } from 'react';

import { LEAGUE_ART_ASSETS } from './leagueArtAssets';

export function leagueArtUrl(name: string): string {
  return LEAGUE_ART_ASSETS[name] ?? '';
}

export function LeagueArtImage({ name, className = '', fallback = null }: { name: string; className?: string; fallback?: ReactNode }) {
  const src = leagueArtUrl(name);
  const [failedSrc, setFailedSrc] = useState('');
  if (!src || failedSrc === src) return <span className={className} aria-hidden="true">{fallback}</span>;
  return <img src={src} alt="" aria-hidden="true" draggable={false} className={className} onError={() => setFailedSrc(src)} />;
}
