import { createContext, useContext, useEffect, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, Volume2, VolumeX } from 'lucide-react';
import type { LolClientConfigValues } from '../../../shared/api';
import { ProfileIcon } from '../ProfileIcon';
import type { Option } from './configFields';

// 设置页的基础积木。样式在 styles/features/settings.css（st- 前缀）。

/**
 * 对照：正在看的这套设置和另一套（一般是「这个号现在」）比。
 * fields 用设置页那一行的名字当钥匙，hotkeys 用「section.key」，值是对照那边显示的样子。
 * 只有不一样的行才在表里，行自己凭名字查，查到就标出来。
 */
export interface SettingsCompare {
  /** 对照那边叫什么，例如「小猫猫拳 现在」。 */
  label: string;
  fields: Map<string, string>;
  hotkeys: Map<string, string>;
}

export const SettingsCompareContext = createContext<SettingsCompare | null>(null);

export function useSettingsCompare() {
  return useContext(SettingsCompareContext);
}

/** 行尾的小注：对照那边是什么。 */
export function CompareNote({ value }: { value: string }) {
  const compare = useSettingsCompare();
  if (!compare) return null;
  return (
    <span className="st-was">
      <i />
      {compare.label}：<b>{value}</b>
    </span>
  );
}

export function useSettingsScrollSpy<TSection extends string>(
  prefix: string,
  sections: { key: TSection; label: string }[],
  setActiveSection: (section: TSection) => void,
) {
  useEffect(() => {
    const scrollHost = document.querySelector<HTMLElement>('[data-settings-scroll]');
    if (!scrollHost) return undefined;

    let frame = 0;
    const update = () => {
      frame = 0;
      const sectionNodes = sections
        .map((section) => ({
          key: section.key,
          node: document.getElementById(`${prefix}-section-${section.key}`),
        }))
        .filter((item): item is { key: TSection; node: HTMLElement } => Boolean(item.node));

      if (sectionNodes.length === 0) return;

      const maxScrollTop = scrollHost.scrollHeight - scrollHost.clientHeight;
      if (maxScrollTop - scrollHost.scrollTop <= 2) {
        setActiveSection(sectionNodes[sectionNodes.length - 1].key);
        return;
      }

      const hostRect = scrollHost.getBoundingClientRect();
      const anchorY = hostRect.top + Math.min(180, hostRect.height * 0.38);
      let active = sectionNodes[0].key;

      for (const item of sectionNodes) {
        if (item.node.getBoundingClientRect().top <= anchorY) {
          active = item.key;
        } else {
          break;
        }
      }

      setActiveSection(active);
    };

    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    scrollHost.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    scheduleUpdate();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      scrollHost.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [prefix, sections, setActiveSection]);
}

export function scrollToSettingsSection(prefix: string, key: string) {
  document.getElementById(`${prefix}-section-${key}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

// 顶部的分区目录：一排胶囊，跟着滚动高亮当前看到的分区，点一下跳过去。
export function SectionTabs<TSection extends string>({
  sections,
  active,
  onSelect,
}: {
  sections: { key: TSection; label: string }[];
  active: TSection;
  onSelect: (section: TSection) => void;
}) {
  return (
    <nav className="st-tabs" aria-label="分区">
      {sections.map((section) => (
        <button
          key={section.key}
          type="button"
          className="st-tab"
          aria-current={active === section.key ? 'true' : undefined}
          onClick={() => onSelect(section.key)}
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}

export function SettingsSection<TSection extends string>({
  prefix,
  id,
  title,
  children,
}: {
  prefix: string;
  id: TSection;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={`${prefix}-section-${id}`} className="st-section">
      <header className="st-section__head">
        <h3>{title}</h3>
      </header>
      {children}
    </section>
  );
}

export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="st-group-wrap">
      {title && <h4 className="st-group__title">{title}</h4>}
      <div className="st-group">{children}</div>
    </div>
  );
}

// 一行设置：左边名字，右边控件。补充说明（hint）只放在悬停提示里，不占版面。
export function SettingRow({
  label,
  hint,
  children,
  wide = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const compare = useSettingsCompare();
  const was = compare?.fields.get(label);
  return (
    <div className="st-row" data-wide={wide ? 'true' : undefined} data-diff={was !== undefined ? 'true' : undefined}>
      <div className="st-row__label" title={hint}>
        <b>{label}</b>
        {was !== undefined && <CompareNote value={was} />}
      </div>
      <div className="st-row__control">{children}</div>
    </div>
  );
}

export function ReadonlyRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <SettingRow label={label} hint={hint}>
      <span className="st-readonly" title={value}>{value}</span>
    </SettingRow>
  );
}

export function CheckboxRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <SettingRow label={label} hint={hint}>
      <SwitchControl checked={checked} onChange={onChange} />
    </SettingRow>
  );
}

export function SwitchControl({
  checked,
  onChange,
  size = 'md',
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  size?: 'sm' | 'md';
}) {
  const trackClass = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const thumbClass = size === 'sm'
    ? checked ? 'size-4 translate-x-4' : 'size-4 translate-x-0.5'
    : checked ? 'size-5 translate-x-5' : 'size-5 translate-x-0.5';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(event) => {
        event.preventDefault();
        onChange(!checked);
      }}
      className={`${trackClass} relative shrink-0 rounded-full outline-none transition-[background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-app-primary/25 ${
        checked ? 'bg-app-primary shadow-ui-switch-track' : 'bg-app-border-strong/65'
      }`}
    >
      <span
        className={`absolute left-0 top-1/2 -translate-y-1/2 rounded-full transition-transform ${
          checked ? 'bg-app-primary-foreground' : 'bg-app-text/80'
        } shadow-sm ${thumbClass}`}
      />
    </button>
  );
}

function safeNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function RangeInput({
  value,
  min,
  max,
  onChange,
  disabled = false,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label: string;
}) {
  const current = safeNumber(value, min);
  return (
    <span className="st-range" data-disabled={disabled ? 'true' : undefined}>
      <input
        className="settings-range"
        type="range"
        min={min}
        max={max}
        value={current}
        aria-label={label}
        style={{
          '--settings-range-fill': `${((current - min) / Math.max(1, max - min)) * 100}%`,
        } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{Math.round(current)}</output>
    </span>
  );
}

export function SliderRow({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <SettingRow label={label} hint={hint}>
      <RangeInput label={label} value={value} min={min} max={max} onChange={onChange} />
    </SettingRow>
  );
}

// 几个互斥选项排成一排，一眼看出选的是哪个。选项多或者字长时用下拉。
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <span className="st-seg" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={String(value) === String(option.value)}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}

export function Dropdown<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <span className="st-select">
      <select
        value={String(value)}
        aria-label={label}
        onChange={(event) => {
          const selected = options.find((option) => String(option.value) === event.target.value);
          if (selected) onChange(selected.value);
        }}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" />
    </span>
  );
}

export function SelectRow<T extends string | number>({
  label,
  hint,
  value,
  options,
  onChange,
  segmented = false,
}: {
  label: string;
  hint?: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  segmented?: boolean;
}) {
  return (
    <SettingRow label={label} hint={hint}>
      {segmented
        ? <Segmented label={label} value={value} options={options} onChange={onChange} />
        : <Dropdown label={label} value={value} options={options} onChange={onChange} />}
    </SettingRow>
  );
}

export function VolumeRow({
  label,
  volume,
  muted,
  onVolume,
  onMuted,
}: {
  label: string;
  volume: number;
  muted: boolean;
  onVolume: (value: number) => void;
  onMuted: (value: boolean) => void;
}) {
  return (
    <SettingRow label={label}>
      <span className="st-volume">
        <button
          type="button"
          className="st-mute"
          aria-pressed={muted}
          title={muted ? '取消静音' : '静音'}
          aria-label={muted ? `取消${label}静音` : `${label}静音`}
          onClick={() => onMuted(!muted)}
        >
          {muted ? <VolumeX /> : <Volume2 />}
        </button>
        <RangeInput label={label} value={volume} min={0} max={100} onChange={onVolume} disabled={muted} />
      </span>
    </SettingRow>
  );
}

export function BlockedPlayersList({
  players,
}: {
  players?: LolClientConfigValues['blockedPlayers'];
}) {
  const safePlayers = Array.isArray(players) ? players : [];

  if (safePlayers.length === 0) {
    return <div className="st-empty">暂无屏蔽的玩家</div>;
  }

  return (
    <div className="st-blocked">
      {safePlayers.map((player, index) => {
        const gameName = player.gameName || '未知玩家';
        const fallbackKey = player.id || player.puuid || `${gameName}-${index}`;
        return (
          <div key={fallbackKey} className="st-blocked__item">
            <ProfileIcon iconId={player.icon > 0 ? player.icon : undefined} alt={gameName} size={32} />
            <div>
              <b>{gameName}</b>
              {player.gameTag && <span>#{player.gameTag}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
