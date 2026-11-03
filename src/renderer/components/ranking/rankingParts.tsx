import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

// 「数据」页两个章节共用的小零件。

export function championSplash(alias: string | undefined): string {
  return alias ? `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${alias}_0.jpg` : '';
}

// CommunityDragon 按英雄 ID 取头像，新英雄上线当天就有。
export function championIcon(id: number): string {
  return id > 0 ? `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${id}.png` : '';
}

export function Portrait({
  src,
  fallbackId,
  name,
  size = 36,
  className,
  ring,
}: {
  src?: string;
  fallbackId?: number;
  name: string;
  size?: number;
  className?: string;
  ring?: string;
}) {
  const [failed, setFailed] = useState(0);
  const sources = [src, fallbackId ? championIcon(fallbackId) : ''].filter((value): value is string => Boolean(value));
  const current = sources[failed];
  const broken = !current;
  return (
    <span
      className={cn('rk-portrait', className)}
      style={{ width: size, height: size, ...(ring ? { '--portrait-ring': ring } : {}) } as React.CSSProperties}
    >
      {!broken ? (
        <img key={current} src={current} alt={name} loading="lazy" draggable={false} onError={() => setFailed((value) => value + 1)} />
      ) : (
        <span aria-hidden="true">{name.slice(0, 1)}</span>
      )}
    </span>
  );
}

export function GradeChip({ label, className, title }: { label: string; className?: string; title?: string }) {
  const token = label === 'S+' ? 'splus' : (label.slice(0, 1).toLowerCase() || 'd');
  return (
    <span className={cn('rk-grade', `rk-grade--${token}`, className)} title={title}>
      {label || '—'}
    </span>
  );
}

// 15 级加点：四行矩阵，一眼看出每级点了什么。
export function SkillMatrix({ order, levels = 15 }: { order: string[]; levels?: number }) {
  const keys = ['Q', 'W', 'E', 'R'];
  const slice = order.slice(0, levels);
  return (
    <div className="rk-skill-matrix" style={{ '--levels': levels } as React.CSSProperties} role="img" aria-label={`加点顺序 ${slice.join(' ')}`}>
      <span className="rk-skill-matrix__corner" />
      {Array.from({ length: levels }, (_, index) => (
        <span key={`lv-${index}`} className="rk-skill-matrix__level num">{index + 1}</span>
      ))}
      {keys.map((key) => (
        <SkillRow key={key} skill={key} order={slice} levels={levels} />
      ))}
    </div>
  );
}

function SkillRow({ skill, order, levels }: { skill: string; order: string[]; levels: number }) {
  return (
    <>
      <span className={cn('rk-skill-matrix__key', skill === 'R' && 'is-ult')}>{skill}</span>
      {Array.from({ length: levels }, (_, index) => (
        <span
          key={`${skill}-${index}`}
          className={cn('rk-skill-matrix__cell', order[index] === skill && 'is-on', skill === 'R' && 'is-ult')}
        >
          {order[index] === skill ? skill : ''}
        </span>
      ))}
    </>
  );
}

export function SkillPriority({ keys }: { keys: string[] }) {
  return (
    <span className="rk-skill-priority">
      {keys.map((key, index) => (
        <span key={`${key}-${index}`} className="rk-skill-priority__step">
          {index > 0 && <i aria-hidden="true">›</i>}
          <kbd>{key}</kbd>
        </span>
      ))}
    </span>
  );
}

// 极简折线：版本走势 / 登场率走势。
export function Sparkline({
  values,
  labels,
  reference,
  height = 56,
  format = (value) => `${value.toFixed(1)}%`,
}: {
  values: number[];
  labels?: string[];
  reference?: number;
  height?: number;
  format?: (value: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (values.length < 2) return null;
  const width = 300;
  const padTop = 10;
  const padBottom = 6;
  const all = reference === undefined ? values : [...values, reference];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = Math.max(0.5, max - min);
  const x = (index: number) => (index / (values.length - 1)) * width;
  const y = (value: number) => padTop + (1 - (value - min) / range) * (height - padTop - padBottom);
  const line = values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const active = hover ?? values.length - 1;
  return (
    <div className="rk-spark">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onPointerLeave={() => setHover(null)}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - box.left) / box.width;
          setHover(Math.round(ratio * (values.length - 1)));
        }}
      >
        <path className="rk-spark__area" d={area} />
        {reference !== undefined && (
          <line className="rk-spark__ref" x1="0" x2={width} y1={y(reference)} y2={y(reference)} />
        )}
        <path className="rk-spark__line" d={line} vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        className="rk-spark__dot"
        style={{ left: `${(active / (values.length - 1)) * 100}%`, top: `${(y(values[active]) / height) * 100}%` }}
      />
      <span className="rk-spark__readout">
        <b className="num">{format(values[active])}</b>
        {labels?.[active] && <small className="num">{labels[active]}</small>}
      </span>
    </div>
  );
}

export interface MenuOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export function FilterMenu<T extends string>({
  value,
  options,
  onChange,
  icon: Icon,
  ariaLabel,
}: {
  value: T;
  options: MenuOption<T>[];
  onChange: (value: T) => void;
  icon?: LucideIcon;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="rk-menu">
      <button
        type="button"
        className="rk-menu__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
      >
        {Icon && <Icon className="size-3.5" />}
        <span>{selected?.label}</span>
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="rk-menu__popover"
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.14 }}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={cn('rk-menu__option', option.value === value && 'is-active')}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>
                  <strong>{option.label}</strong>
                  {option.description && <small>{option.description}</small>}
                </span>
                {option.value === value && <Check className="size-3.5" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SectionTitle({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <header className="rk-section-title">
      <h3>{title}</h3>
      {hint && <span>{hint}</span>}
      {action && <div className="rk-section-title__action">{action}</div>}
    </header>
  );
}

export function SkeletonLines({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('rk-skeleton', className)} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => <span key={index} />)}
    </div>
  );
}
