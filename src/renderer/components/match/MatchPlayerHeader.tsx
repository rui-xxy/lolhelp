import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import type { PlayerRankSummary } from '../../../shared/api';
import { ProfileIcon } from '../ProfileIcon';
import { tierLabel } from '../ui/kit';

type RankQueueType = 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR';

export interface QueueFilter {
  key: string;
  /** SGP 的 q_{queueId} 格式 */
  tag: string;
  name: string;
  /** 排位队列：菜单里显示该队列的段位 */
  rankQueue?: RankQueueType;
}

// 模式筛选选项（tag → 中文名）
export const QUEUE_FILTERS: QueueFilter[] = [
  { key: '', tag: '', name: '全部模式' },
  { key: '420', tag: 'q_420', name: '单双排', rankQueue: 'RANKED_SOLO_5x5' },
  { key: '440', tag: 'q_440', name: '灵活组排', rankQueue: 'RANKED_FLEX_SR' },
  { key: '490', tag: 'q_490', name: '快速模式' },
  { key: '450', tag: 'q_450', name: '大乱斗' },
  { key: '2400', tag: 'q_2400', name: '海克斯大乱斗' },
  { key: '1700', tag: 'q_1700', name: '竞技场' },
];

const QUEUE_GROUPS: Array<{ label: string | null; keys: string[] }> = [
  { label: null, keys: [''] },
  { label: '排位', keys: ['420', '440'] },
  { label: '匹配与娱乐', keys: ['490', '450', '2400', '1700'] },
];

const APEX_TIERS = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

function isRanked(rank: PlayerRankSummary | null | undefined): rank is PlayerRankSummary {
  const tier = rank?.tier?.toUpperCase();
  return Boolean(tier && tier !== 'NONE' && tier !== 'UNRANKED');
}

export function formatRankTier(rank: PlayerRankSummary): string {
  const tier = rank.tier.toUpperCase();
  return APEX_TIERS.has(tier) ? tierLabel(tier) : `${tierLabel(tier)} ${rank.division ?? ''}`.trim();
}

/** 按当前筛选挑出最该展示的段位：灵活组排看灵活，其余优先单双排。 */
export function pickHeaderRank(ranks: PlayerRankSummary[], queueKey: string): PlayerRankSummary | null {
  const preferred = QUEUE_FILTERS.find((filter) => filter.key === queueKey)?.rankQueue ?? 'RANKED_SOLO_5x5';
  const ranked = ranks.filter(isRanked);
  return (
    ranked.find((rank) => rank.queueType === preferred) ??
    ranked.find((rank) => rank.queueType === 'RANKED_SOLO_5x5') ??
    ranked[0] ??
    null
  );
}

/** 段位小菱形，颜色取 tokens 里的段位色。 */
export function TierGem({ tier, className = '' }: { tier: string; className?: string }) {
  return (
    <i
      aria-hidden
      className={`block size-[7px] shrink-0 rotate-45 ${className}`}
      style={{ background: `var(--color-tier-${tier.toLowerCase()}, var(--color-gold))` }}
    />
  );
}

// ---------- 胜率之环：头像外圈画出胜负比例 ----------

const RING_SIZE = 46;
const RING_STROKE = 2.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const RING_GAP = 2.4;

export function WinRateAvatar({
  wins,
  losses,
  iconId,
  iconUrl,
  name,
  level,
}: {
  wins: number;
  losses: number;
  iconId?: number;
  iconUrl?: string;
  name: string;
  level?: number | null;
}) {
  const total = wins + losses;
  const hasGames = total > 0;
  // 只有一边时不留缺口，画成整圈
  const gap = wins > 0 && losses > 0 ? RING_GAP : 0;
  const winLength = hasGames ? (RING_LENGTH * wins) / total : 0;
  const winDash = wins > 0 ? Math.max(winLength - gap, 0.01) : 0;
  const lossDash = losses > 0 ? Math.max(RING_LENGTH - winLength - gap, 0.01) : 0;
  const center = RING_SIZE / 2;
  const showLevel = typeof level === 'number' && Number.isFinite(level) && level > 0;

  return (
    <span className="relative block shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg
        aria-hidden
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx={center}
          cy={center}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          className="stroke-line-2"
        />
        {lossDash > 0 && (
          <circle
            cx={center}
            cy={center}
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${lossDash} ${RING_LENGTH}`}
            strokeDashoffset={-(winLength + gap / 2)}
            className="stroke-enemy transition-[stroke-dasharray,stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
          />
        )}
        {winDash > 0 && (
          <circle
            cx={center}
            cy={center}
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${winDash} ${RING_LENGTH}`}
            strokeDashoffset={-gap / 2}
            className="stroke-ally transition-[stroke-dasharray] duration-500 ease-out motion-reduce:transition-none"
          />
        )}
      </svg>
      <ProfileIcon
        iconId={iconId}
        src={iconUrl}
        alt={name}
        size={RING_SIZE - 12}
        className="absolute top-1.5 left-1.5"
      />
      {showLevel && (
        <span className="num absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-app-bg-soft px-1.5 text-cap leading-[14px] font-semibold text-app-muted ring-1 ring-app-border-strong">
          {level}
        </span>
      )}
    </span>
  );
}

// ---------- 模式筛选 ----------

export function QueueFilterMenu({
  value,
  onChange,
  ranks = [],
}: {
  value: string;
  onChange: (queueKey: string) => void;
  ranks?: PlayerRankSummary[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const activeFilter = QUEUE_FILTERS.find((filter) => filter.key === value) ?? QUEUE_FILTERS[0];
  const orderedFilters = QUEUE_GROUPS.flatMap((group) =>
    group.keys.map((key) => QUEUE_FILTERS.find((filter) => filter.key === key)).filter(Boolean),
  ) as QueueFilter[];

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    // 打开后把焦点放到当前选中项，方向键可以直接走
    const selectedIndex = orderedFilters.findIndex((filter) => filter.key === activeFilter.key);
    requestAnimationFrame(() => itemRefs.current[Math.max(selectedIndex, 0)]?.focus());
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const choose = (filter: QueueFilter) => {
    close();
    if (filter.key !== activeFilter.key) onChange(filter.key);
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = itemRefs.current.filter((item): item is HTMLButtonElement => Boolean(item));
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const focusAt = (next: number) => {
      event.preventDefault();
      items[(next + items.length) % items.length]?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        focusAt(index - 1);
        break;
      case 'Home':
        focusAt(0);
        break;
      case 'End':
        focusAt(items.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'Tab':
        close(false);
        break;
    }
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
    }
  };

  let itemIndex = 0;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="按模式筛选战绩"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        className={`group flex h-6 items-center gap-1 rounded-xs pr-1 pl-2 text-meta font-medium outline-none transition-colors ${
          open
            ? 'bg-app-selected text-app-text'
            : 'bg-app-nav-hover text-app-body hover:bg-app-selected hover:text-app-text focus-visible:bg-app-selected focus-visible:text-app-text'
        }`}
      >
        <span className="truncate">{activeFilter.name}</span>
        <ChevronDown
          className={`size-3.5 text-app-subtle transition-transform duration-150 group-hover:text-app-muted ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            role="menu"
            aria-label="按模式筛选"
            onKeyDown={handleMenuKeyDown}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
            className="absolute top-8 right-0 z-30 w-52 origin-top-right rounded-md border border-app-border-strong bg-app-surface p-1 shadow-[var(--shadow-ui-popover)]"
          >
            {QUEUE_GROUPS.map((group, groupIndex) => (
              <div key={group.label ?? 'all'} role="group" aria-label={group.label ?? undefined}>
                {groupIndex > 0 && <div className="mx-2 my-1 h-px bg-app-border" />}
                {group.label && (
                  <div className="px-2 pt-1.5 pb-1 text-meta text-app-subtle">
                    {group.label}
                  </div>
                )}
                {group.keys.map((key) => {
                  const filter = QUEUE_FILTERS.find((item) => item.key === key);
                  if (!filter) return null;
                  const selected = filter.key === activeFilter.key;
                  const rank = filter.rankQueue
                    ? ranks.find((item) => item.queueType === filter.rankQueue && isRanked(item)) ?? null
                    : null;
                  const refIndex = itemIndex++;
                  return (
                    <button
                      key={filter.key || 'all'}
                      ref={(element) => {
                        itemRefs.current[refIndex] = element;
                      }}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => choose(filter)}
                      className={`flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-meta outline-none transition-colors ${
                        selected
                          ? 'bg-app-nav-hover font-medium text-app-text'
                          : 'text-app-body hover:bg-app-nav-hover hover:text-app-text focus-visible:bg-app-nav-hover focus-visible:text-app-text'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{filter.name}</span>
                      {filter.rankQueue && (
                        <span
                          className="flex shrink-0 items-center gap-1.5 text-meta text-app-subtle"
                          title={rank?.displayText}
                        >
                          {rank ? (
                            <>
                              <TierGem tier={rank.tier} />
                              {formatRankTier(rank)}
                            </>
                          ) : (
                            '未定级'
                          )}
                        </span>
                      )}
                      <Check
                        className={`size-3.5 shrink-0 text-app-text ${selected ? 'opacity-100' : 'opacity-0'}`}
                      />
                    </button>
                  );
                })}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
