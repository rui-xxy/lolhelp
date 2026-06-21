// 游戏图标（英雄头像/装备/召唤师技能/符文/召唤师头像）。
// 统一处理尺寸、加载占位、加载失败回退。
// 图标 URL 来自 heroData 生成的 ddragon CDN 地址。

import { useEffect, useState } from 'react';

interface GameIconProps {
  src: string;
  alt: string;
  title?: string; // hover 提示（装备/技能名字）
  size?: number; // 像素，默认 20
  rounded?: boolean; // 是否圆角（英雄头像用），默认 false
  className?: string;
}

export function GameIcon({ src, alt, title, size = 20, rounded = false, className = '' }: GameIconProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    // 无图占位：灰色方块
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
