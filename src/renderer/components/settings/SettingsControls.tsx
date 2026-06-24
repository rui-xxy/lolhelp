import { useEffect, type ReactNode } from 'react';
import type { LolClientConfigValues } from '../../../shared/api';

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

export function SectionDot({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="group relative flex size-7 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-app-primary/40"
    >
      <span
        className={`rounded-full transition-all ${
          active
            ? 'h-6 w-2 bg-app-primary shadow-[0_0_0_4px_rgba(255,56,92,0.12)]'
            : 'size-2 bg-app-border group-hover:size-2.5 group-hover:bg-app-primary/60'
        }`}
      />
      <span className="pointer-events-none absolute right-8 top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-sm bg-app-text px-2 py-1 text-xs font-medium text-app-surface opacity-0 shadow-sm transition-opacity group-hover:opacity-100 xl:block">
        {label}
      </span>
    </button>
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
    <section id={`${prefix}-section-${id}`} className="scroll-mt-4 space-y-4">
      <h3 className="text-base font-semibold text-app-text">{title}</h3>
      {children}
    </section>
  );
}

export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="max-w-[460px] space-y-2">
      {title && <h4 className="mb-2 text-sm font-semibold text-app-text">{title}</h4>}
      {children}
    </div>
  );
}

export function ReadonlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 py-1.5">
      <span className="text-sm text-app-body">{label}</span>
      <span className="max-w-[160px] truncate text-right text-xs text-app-muted">{value}</span>
    </div>
  );
}

export function BlockedPlayersList({
  players,
}: {
  players?: LolClientConfigValues['blockedPlayers'];
}) {
  const safePlayers = Array.isArray(players) ? players : [];

  if (safePlayers.length === 0) {
    return (
      <div className="rounded-sm bg-app-bg-soft px-3 py-8 text-center text-sm text-app-muted">
        暂无聊天黑名单
      </div>
    );
  }

  return (
    <div className="grid gap-2 md:grid-cols-2">
      {safePlayers.map((player, index) => {
        const gameName = player.gameName || '-';
        const fallbackKey = player.id || player.puuid || `${gameName}-${index}`;
        return (
          <div
            key={fallbackKey}
            className="flex min-w-0 items-center gap-3 rounded-sm bg-app-bg-soft px-3 py-2"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-app-surface text-xs font-semibold text-app-muted">
              {player.icon > -1 ? player.icon : gameName.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-app-text">{gameName}</div>
              <div className="truncate text-xs text-app-muted">
                {player.gameTag ? `#${player.gameTag}` : player.puuid}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-app-border bg-app-surface p-4">
      <h3 className="mb-3 text-sm font-semibold text-app-text">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-3 py-1.5">
      <span className="text-sm text-app-body">{label}</span>
      <SwitchControl checked={checked} onChange={onChange} />
    </label>
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
      className={`${trackClass} relative shrink-0 rounded-full transition-colors ${
        checked ? 'bg-blue-500' : 'bg-app-border'
      }`}
    >
      <span
        className={`absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform ${thumbClass}`}
      />
    </button>
  );
}

function percentLabel(value: number): string {
  return `${Math.round(value)}`;
}

export function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr_42px] items-center gap-3 py-1.5">
      <span className="text-sm text-app-body">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="text-right text-xs font-medium text-app-muted">{percentLabel(value)}</span>
    </div>
  );
}

export function SelectRow<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="grid grid-cols-[120px_1fr] items-center gap-3 py-1.5">
      <span className="text-sm text-app-body">{label}</span>
      <select
        value={value}
        onChange={(event) => {
          const selected = options.find((option) => String(option.value) === event.target.value);
          if (selected) onChange(selected.value);
        }}
        className="h-8 rounded-sm border border-app-border bg-app-surface px-2 text-sm outline-none focus:border-app-primary"
      >
        {options.map((option) => (
          <option key={String(option.value)} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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
    <div className="grid grid-cols-[78px_1fr_42px_54px] items-center gap-3 py-1.5">
      <span className="text-sm text-app-body">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={volume}
        onChange={(event) => onVolume(Number(event.target.value))}
      />
      <span className="text-right text-xs font-medium text-app-muted">{percentLabel(volume)}</span>
      <label className="flex items-center justify-end gap-2 text-xs text-app-muted">
        <span>静音</span>
        <SwitchControl checked={muted} onChange={onMuted} size="sm" />
      </label>
    </div>
  );
}
