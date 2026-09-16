import { useEffect, useState } from 'react';

interface GameIconProps {
  src: string;
  alt: string;
  title?: string;
  size?: number;
  rounded?: boolean;
  className?: string;
}

export function GameIcon({ src, alt, title, size = 20, rounded = false, className = '' }: GameIconProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <span
        title={title}
        className={`inline-block shrink-0 bg-app-border ${rounded ? 'rounded-full' : 'rounded-xs'} ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      title={title}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className={`inline-block shrink-0 object-cover ${rounded ? 'rounded-full' : 'rounded-xs'} ${className}`}
    />
  );
}
