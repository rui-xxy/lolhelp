import { useEffect, useState, type CSSProperties } from 'react';
import type { CollectionChroma, CollectionSkin } from '../../../shared/api';

// 主页与收藏馆共用的小零件：带兜底的图片、炫彩色点、数字格式。

/** 先用 src，加载失败换 fallback，再失败就隐藏（留出底色）。 */
export function Art({ src, fallback, alt = '', className, loading = 'lazy' }: { src: string; fallback?: string; alt?: string; className?: string; loading?: 'lazy' | 'eager' }) {
  const [step, setStep] = useState(0);
  useEffect(() => setStep(0), [src, fallback]);
  const current = step === 0 ? src : step === 1 ? fallback ?? '' : '';
  if (!current) return <span className={className} aria-hidden="true" data-missing="true" />;
  return (
    <img
      src={current}
      alt={alt}
      className={className}
      loading={loading}
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setStep((value) => (value === 0 && fallback ? 1 : 2))}
    />
  );
}

/** 炫彩：每个一颗小圆点，用游戏数据里的颜色；没有的画成空心。 */
export function ChromaDots({ chromas, max = 8, className = 'hm-dots' }: { chromas: CollectionChroma[]; max?: number; className?: string }) {
  if (chromas.length === 0) return null;
  const shown = chromas.slice(0, max);
  return (
    <span className={className} aria-label={`炫彩 ${chromas.filter((c) => c.owned).length}/${chromas.length}`}>
      {shown.map((chroma) => (
        <i
          key={chroma.id}
          data-owned={chroma.owned ? 'true' : undefined}
          title={`${chroma.name}${chroma.owned ? '' : '（未拥有）'}`}
          style={chroma.colors.length > 0 ? ({ '--c1': chroma.colors[0], '--c2': chroma.colors[1] ?? chroma.colors[0] } as CSSProperties) : undefined}
        />
      ))}
      {chromas.length > max && <b>+{chromas.length - max}</b>}
    </span>
  );
}

export const RARITY_LABEL: Record<CollectionSkin['rarity'], string> = {
  none: '',
  epic: '史诗',
  legendary: '传说',
  mythic: '神话',
  ultimate: '终极',
  transcendent: '',
  exalted: '',
};

export function formatCount(value: number | undefined): string {
  if (value === undefined) return '—';
  if (value >= 100_000) return `${(value / 10_000).toFixed(value >= 1_000_000 ? 0 : 1)}万`;
  return value.toLocaleString('zh-CN');
}

export function formatDamage(value: number): string {
  return value >= 10_000 ? `${(value / 10_000).toFixed(1)}万` : value.toLocaleString('zh-CN');
}

export function formatAgo(timestamp: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - timestamp) / 60_000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  return days === 1 ? '昨天' : `${days} 天前`;
}
