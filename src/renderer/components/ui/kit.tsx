import type { ReactNode } from 'react';
import type { PlayerRankSummary } from '../../../shared/api';
import { cn } from '../../lib/utils';

// 基础组件：所有页面只用这些拼，颜色全部来自 tokens.css 的语义变量。

export type Tone = 'neutral' | 'ally' | 'enemy' | 'gold' | 'ok' | 'warn' | 'strong';

const TAG_TONES: Record<Tone, string> = {
  neutral: 'bg-ink-4 text-text-2',
  ally: 'bg-ally-soft text-ally',
  enemy: 'bg-enemy-soft text-enemy',
  gold: 'bg-gold-soft text-gold',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  strong: 'bg-app-primary text-app-primary-foreground',
};

export function Tag({
  tone = 'neutral',
  className,
  children,
  title,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-[22px] shrink-0 items-center gap-1 rounded-xs px-1.5 text-meta font-medium whitespace-nowrap',
        TAG_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function BrassBadge({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="brass-badge" title={title}>
      {children}
    </span>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  badge?: number;
  title?: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  className,
  ariaLabel,
}: {
  value: T;
  options: Array<SegmentedOption<T>>;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex shrink-0 gap-0.5 rounded-sm border border-line-1 bg-ink-0 p-[3px]',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative inline-flex items-center gap-1.5 rounded-[4px] font-medium whitespace-nowrap outline-none transition-[background-color,color] duration-150 focus-visible:shadow-ui-focus-compact',
              size === 'sm' ? 'h-6 px-2.5 text-meta' : 'h-7 px-3 text-body',
              active
                ? 'bg-ink-4 text-text-1 shadow-ui-inset-line'
                : 'text-text-3 hover:bg-app-nav-hover hover:text-text-1',
            )}
          >
            {option.label}
            {Boolean(option.badge) && (
              <span className="num min-w-4 rounded-full bg-enemy px-1 text-center text-[11px] leading-4 font-bold text-app-on-danger">
                {(option.badge ?? 0) > 99 ? '99+' : option.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      {icon && (
        <div className="grid size-11 place-items-center rounded-full bg-ink-3 text-text-3 [&_svg]:size-5">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <div className="text-list font-semibold text-text-1">{title}</div>
        {description && <p className="max-w-sm text-body text-text-3">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'ally' | 'enemy' | 'gold' | 'ok';
  className?: string;
}) {
  const toneClass = tone ? { ally: 'text-ally', enemy: 'text-enemy', gold: 'text-gold', ok: 'text-ok' }[tone] : 'text-text-1';
  return (
    <div className={cn('grid min-w-0 gap-0.5', className)}>
      <span className="truncate text-meta text-text-3">{label}</span>
      <span className={cn('num truncate text-title leading-7 font-semibold', toneClass)}>
        {value}
        {hint && <small className="ml-1 text-meta font-medium text-text-4">{hint}</small>}
      </span>
    </div>
  );
}

export function Panel({
  title,
  extra,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('grid min-w-0 content-start gap-3 rounded-lg bg-ink-2 p-4 shadow-ui-panel', className)}>
      {(title || extra) && (
        <header className="flex min-w-0 items-center justify-between gap-3">
          {title && <h3 className="truncate text-list font-semibold text-text-1">{title}</h3>}
          {extra && <div className="flex shrink-0 items-center gap-2 text-meta text-text-3">{extra}</div>}
        </header>
      )}
      <div className={cn('min-w-0', bodyClassName)}>{children}</div>
    </section>
  );
}

/** 胜负条：蓝 = 胜，红 = 负；最新的在左边。 */
export function WinLossStrip({ results, className }: { results: boolean[]; className?: string }) {
  return (
    <div className={cn('flex gap-[3px]', className)} aria-label={`胜 ${results.filter(Boolean).length} 负 ${results.filter((win) => !win).length}`}>
      {results.map((win, index) => (
        <i
          key={index}
          className={cn('block h-[18px] max-w-[14px] flex-1 rounded-[2px]', win ? 'bg-ally' : 'bg-enemy/90')}
        />
      ))}
    </div>
  );
}

const TIER_LABELS: Record<string, string> = {
  IRON: '黑铁',
  BRONZE: '青铜',
  SILVER: '白银',
  GOLD: '黄金',
  PLATINUM: '铂金',
  EMERALD: '翡翠',
  DIAMOND: '钻石',
  MASTER: '大师',
  GRANDMASTER: '宗师',
  CHALLENGER: '王者',
};

export function tierLabel(tier?: string | null): string {
  if (!tier) return '';
  return TIER_LABELS[tier.toUpperCase()] ?? tier;
}

/** 段位标记：段位色只出现在这里的小菱形上。 */
export function TierChip({
  rank,
  className,
  showPoints = true,
}: {
  rank?: PlayerRankSummary | null;
  className?: string;
  showPoints?: boolean;
}) {
  const tier = rank?.tier?.toUpperCase();
  if (!rank || !tier || tier === 'NONE' || tier === 'UNRANKED') {
    return <Tag className={className}>未定级</Tag>;
  }
  const apex = tier === 'MASTER' || tier === 'GRANDMASTER' || tier === 'CHALLENGER';
  const division = apex ? '' : ` ${rank.division ?? ''}`.trimEnd();
  const points = showPoints && Number.isFinite(rank.leaguePoints) ? ` · ${rank.leaguePoints}` : '';
  return (
    <span
      title={rank.displayText}
      className={cn(
        'inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-xs border border-line-1 bg-ink-3 pr-1.5 pl-1 text-meta whitespace-nowrap text-text-1',
        className,
      )}
    >
      <i
        className="block size-2 rotate-45 rounded-[2px]"
        style={{ background: `var(--color-tier-${tier.toLowerCase()})` }}
      />
      {tierLabel(tier)}
      {division}
      {points && <span className="num text-text-3">{points}</span>}
    </span>
  );
}
