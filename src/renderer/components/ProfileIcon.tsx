import { useEffect, useMemo, useState, type CSSProperties, type MouseEventHandler } from 'react';
import { buildProfileIconCandidates } from '../../shared/gameAssets';

interface ProfileIconProps {
  iconId?: number | string | null;
  src?: string;
  srcs?: string[];
  alt: string;
  title?: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLElement>;
}

function uniqueUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.filter(Boolean)));
}

export function ProfileIcon({
  iconId,
  src,
  srcs = [],
  alt,
  title,
  size = 32,
  className = '',
  style,
  onClick,
}: ProfileIconProps) {
  const srcsKey = srcs.join('|');
  const urls = useMemo(
    () => uniqueUrls([src ?? '', ...srcs, ...buildProfileIconCandidates(iconId)]),
    [iconId, src, srcsKey],
  );
  const [sourceIndex, setSourceIndex] = useState(0);
  const currentSrc = urls[sourceIndex] ?? '';
  const mergedStyle = { width: size, height: size, ...style };

  useEffect(() => {
    setSourceIndex(0);
  }, [iconId, src, srcsKey]);

  if (!currentSrc) {
    return (
      <span
        title={title}
        aria-label={alt}
        onClick={onClick}
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-app-surface-soft text-[10px] font-semibold text-app-muted ${className}`}
        style={mergedStyle}
      >
        {(alt || '?').slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      title={title}
      loading="lazy"
      referrerPolicy="no-referrer"
      onClick={onClick as MouseEventHandler<HTMLImageElement>}
      onError={() => setSourceIndex((current) => current + 1)}
      className={`inline-block shrink-0 rounded-full object-cover ${className}`}
      style={mergedStyle}
    />
  );
}
