import type { CSSProperties } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import {
  APPEARANCE_MODES,
  APPEARANCE_PALETTES,
  HISTORY_GLOWS,
  resolveMode,
  useAppearance,
  type AppearanceMode,
  type HistoryGlow,
} from '../../lib/appearance';
import { cn } from '../../lib/utils';

// 设置 → 外观：深色 / 浅色 / 跟随系统、配色方案、战绩列表左侧微光。点了立即生效并记住。

const MODE_ICONS: Record<AppearanceMode, typeof Sun> = {
  dark: Moon,
  light: Sun,
  system: Monitor,
};

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-section font-semibold text-text-1">{title}</h3>
      {hint && <p className="mt-0.5 text-meta text-text-3">{hint}</p>}
    </div>
  );
}

// 微光的小样：三行假数据，光的画法与 history-glow.css 一致（简化版）。
function GlowSample({ glow }: { glow: HistoryGlow }) {
  const rows = [true, false, true];
  return (
    <div className="relative h-[66px] overflow-hidden rounded-sm bg-ink-1">
      {glow !== 'classic' && (
        <span
          aria-hidden="true"
          className="absolute top-0 bottom-0 left-[11px] w-px"
          style={{
            background: 'color-mix(in srgb, var(--color-glow) 75%, transparent)',
            boxShadow: glow === 'rim'
              ? '0 0 4px color-mix(in srgb, var(--color-glow) 80%, transparent), 0 0 12px color-mix(in srgb, var(--color-glow) 40%, transparent)'
              : '0 0 8px color-mix(in srgb, var(--color-glow) 45%, transparent)',
          }}
        />
      )}
      {rows.map((win, index) => {
        const splashColors = ['var(--color-party-coral)', 'var(--color-party-sky)', 'var(--color-party-violet)'];
        const rowStyle: CSSProperties =
          glow === 'rim'
            ? { background: 'linear-gradient(90deg, color-mix(in srgb, var(--color-glow) 4%, transparent) 0, color-mix(in srgb, var(--color-glow) 15%, transparent) 11px, color-mix(in srgb, var(--color-glow) 6%, transparent) 32px, transparent 75%)' }
            : glow === 'splash'
              ? {
                background: `linear-gradient(90deg, color-mix(in srgb, ${splashColors[index]} 45%, transparent), color-mix(in srgb, ${splashColors[index]} 15%, transparent) 38%, transparent 70%)`,
              }
              : glow === 'result'
                ? { background: `radial-gradient(70% 130% at 0% 50%, color-mix(in srgb, ${win ? 'var(--color-ally)' : 'var(--color-enemy)'} 32%, transparent), transparent 75%)` }
                : { background: 'radial-gradient(80% 160% at 52% 50%, color-mix(in srgb, var(--color-text-1) 9%, transparent), transparent 80%)' };
        return (
          <div key={index} className="relative flex h-[22px] items-center gap-1.5 pl-[20px]" style={rowStyle}>
            <span className="size-3 rounded-full bg-ink-4" />
            <span className="h-1.5 w-12 rounded-full bg-text-4/40" />
            <span className={cn('ml-auto mr-2 h-1.5 w-4 rounded-full', win ? 'bg-ally/60' : 'bg-enemy/60')} />
          </div>
        );
      })}
    </div>
  );
}

export function AppearanceSettings() {
  const [appearance, update] = useAppearance();
  const resolved = resolveMode(appearance.mode);

  return (
    <div className="grid max-w-[760px] gap-8">
      <section>
        <SectionTitle title="模式" hint="跟随系统时，会随 Windows 的深色 / 浅色设置自动切换。" />
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="外观模式">
          {APPEARANCE_MODES.map((mode) => {
            const Icon = MODE_ICONS[mode.value];
            const active = appearance.mode === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => update({ mode: mode.value })}
                className={cn(
                  'flex h-11 items-center justify-center gap-2 rounded-md text-body transition-[background-color,color,box-shadow]',
                  active
                    ? 'bg-ink-4 font-medium text-text-1 shadow-ui-inset-strong'
                    : 'bg-ink-2 text-text-3 shadow-ui-panel hover:bg-ink-3 hover:text-text-1',
                )}
              >
                <Icon className="size-4" />
                {mode.label}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle title="配色" hint="只改界面的底色和文字色调，胜负颜色、段位颜色不变。" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3" role="radiogroup" aria-label="配色方案">
          {APPEARANCE_PALETTES.map((palette) => {
            const active = appearance.palette === palette.value;
            const [shell, page, panel, text, glow] = resolved === 'light' ? palette.light : palette.dark;
            return (
              <button
                key={palette.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => update({ palette: palette.value })}
                className={cn(
                  'group grid gap-2 rounded-lg p-2 text-left transition-[background-color,box-shadow]',
                  active ? 'bg-ink-3 shadow-ui-inset-strong' : 'hover:bg-ink-2',
                )}
              >
                {/* 小样：左边导航轨 + 页面 + 一块面板，面板左侧一道光 */}
                <span
                  aria-hidden="true"
                  className="relative block h-[70px] overflow-hidden rounded-md shadow-ui-inset-line"
                  style={{ background: page }}
                >
                  <span className="absolute inset-y-0 left-0 w-[14px]" style={{ background: shell }} />
                  <span className="absolute top-0 right-0 left-[14px] h-[10px]" style={{ background: shell }} />
                  <span
                    className="absolute top-[18px] right-[10px] bottom-[10px] left-[24px] rounded-sm"
                    style={{ background: panel, boxShadow: `inset 1px 0 0 ${glow}, -6px 0 14px -6px ${glow}` }}
                  />
                  <span className="absolute top-[27px] left-[32px] h-[5px] w-[44%] rounded-full" style={{ background: text, opacity: 0.85 }} />
                  <span className="absolute top-[38px] left-[32px] h-[4px] w-[30%] rounded-full" style={{ background: text, opacity: 0.35 }} />
                  {active && (
                    <span className="absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full bg-app-primary text-app-primary-foreground">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                </span>
                <span className="px-0.5">
                  <span className={cn('block text-body font-medium', active ? 'text-text-1' : 'text-text-2')}>{palette.label}</span>
                  <span className="block truncate text-meta text-text-4">{palette.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle title="战绩列表微光" hint="战绩页左侧列表里，正在看的那一天会亮起来。光的颜色跟着配色走。" />
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="战绩列表微光">
          {HISTORY_GLOWS.map((glow) => {
            const active = appearance.glow === glow.value;
            return (
              <button
                key={glow.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => update({ glow: glow.value })}
                className={cn(
                  'grid gap-2 rounded-lg p-2.5 text-left transition-[background-color,box-shadow]',
                  active ? 'bg-ink-3 shadow-ui-inset-strong' : 'bg-ink-2 shadow-ui-panel hover:bg-ink-3',
                )}
              >
                <GlowSample glow={glow.value} />
                <span className="flex items-start justify-between gap-2 px-0.5">
                  <span className="min-w-0">
                    <span className={cn('block text-body font-medium', active ? 'text-text-1' : 'text-text-2')}>{glow.label}</span>
                    <span className="block text-meta text-text-4">{glow.description}</span>
                  </span>
                  {active && <Check className="mt-0.5 size-4 shrink-0 text-text-1" />}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
