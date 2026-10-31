import { useCallback, useEffect, useState } from 'react';

// 外观设置：深色 / 浅色 / 跟随系统、配色方案、战绩列表左侧微光。
// 存在本机 localStorage 里，启动时在渲染前就套上（见 main.tsx），不会先闪一下默认色。
// 对应的 CSS 在 styles/themes.css 与 styles/features/matches/history-glow.css。

export type AppearanceMode = 'dark' | 'light' | 'system';
export type AppearancePalette = 'graphite' | 'sand' | 'slate' | 'patina' | 'dusk';
export type HistoryGlow = 'classic' | 'rim' | 'splash' | 'result';

export interface Appearance {
  mode: AppearanceMode;
  palette: AppearancePalette;
  glow: HistoryGlow;
}

export const DEFAULT_APPEARANCE: Appearance = {
  mode: 'dark',
  palette: 'graphite',
  glow: 'rim',
};

export const APPEARANCE_MODES: Array<{ value: AppearanceMode; label: string }> = [
  { value: 'dark', label: '深色' },
  { value: 'light', label: '浅色' },
  { value: 'system', label: '跟随系统' },
];

// swatch：[窗口外壳, 页面, 面板, 文字, 光]，深色与浅色各一组，只用于设置页里的色卡展示。
export const APPEARANCE_PALETTES: Array<{
  value: AppearancePalette;
  label: string;
  description: string;
  dark: [string, string, string, string, string];
  light: [string, string, string, string, string];
}> = [
  {
    value: 'graphite',
    label: '石墨',
    description: '哑光中性灰 · 默认',
    dark: ['#282929', '#303131', '#383939', '#F1F1ED', '#FFF4E0'],
    light: ['#E4E4E0', '#EFEFEC', '#F8F8F6', '#1D1E1C', '#B0843C'],
  },
  {
    value: 'sand',
    label: '暖砂',
    description: '暖灰 · 琥珀色的光',
    dark: ['#2D2822', '#35302A', '#3D3832', '#F6F0E8', '#FFCC92'],
    light: ['#E7E3DF', '#F2EEEA', '#FBF7F3', '#221D16', '#BE7A2E'],
  },
  {
    value: 'slate',
    label: '雾蓝',
    description: '蓝灰 · 冰蓝色的光',
    dark: ['#222A31', '#2A3239', '#323A41', '#EDF1F5', '#9CC6FF'],
    light: ['#E0E4E9', '#EBEFF4', '#F4F9FE', '#1B1E21', '#3C78D2'],
  },
  {
    value: 'patina',
    label: '铜绿',
    description: '青灰 · 玉青色的光',
    dark: ['#222B29', '#2A3331', '#313B39', '#ECF2F1', '#8CE2C8'],
    light: ['#DFE5E4', '#EAF0EF', '#F3FAF8', '#1A1F1E', '#27977A'],
  },
  {
    value: 'dusk',
    label: '暮紫',
    description: '灰紫 · 淡紫色的光',
    dark: ['#2A2730', '#322F38', '#3A3740', '#F2EFF6', '#CEBAFF'],
    light: ['#E5E3E9', '#F0EEF4', '#F9F7FD', '#1E1D22', '#7C5FD0'],
  },
];

export const HISTORY_GLOWS: Array<{ value: HistoryGlow; label: string; description: string }> = [
  { value: 'rim', label: '侧光', description: '时间轴变成发光的细线，光向右慢慢变淡' },
  { value: 'splash', label: '原画光', description: '当天每一局在左侧透出这局英雄的原画' },
  { value: 'result', label: '胜负光', description: '每一局左侧泛起自己的胜负色，胜蓝负红' },
  { value: 'classic', label: '经典', description: '改版前的效果：整组罩一层柔和的雾光' },
];

const STORAGE_KEY = 'lolhelp:appearance';
const CHANGE_EVENT = 'lolhelp:appearance-changed';

const MODES = new Set<AppearanceMode>(['dark', 'light', 'system']);
const PALETTES = new Set<AppearancePalette>(['graphite', 'sand', 'slate', 'patina', 'dusk']);
const GLOWS = new Set<HistoryGlow>(['classic', 'rim', 'splash', 'result']);

export function loadAppearance(): Appearance {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<Appearance>;
    return {
      mode: parsed.mode && MODES.has(parsed.mode) ? parsed.mode : DEFAULT_APPEARANCE.mode,
      palette: parsed.palette && PALETTES.has(parsed.palette) ? parsed.palette : DEFAULT_APPEARANCE.palette,
      glow: parsed.glow && GLOWS.has(parsed.glow) ? parsed.glow : DEFAULT_APPEARANCE.glow,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

function systemPrefersLight(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  } catch {
    return false;
  }
}

export function resolveMode(mode: AppearanceMode): 'dark' | 'light' {
  if (mode === 'system') return systemPrefersLight() ? 'light' : 'dark';
  return mode;
}

// 把外观写到 <html> 上：data-mode（dark/light）、data-theme（石墨不写）、data-glow（经典不写）。
export function applyAppearance(appearance: Appearance): void {
  const root = document.documentElement;
  root.dataset.mode = resolveMode(appearance.mode);
  if (appearance.palette === 'graphite') delete root.dataset.theme;
  else root.dataset.theme = appearance.palette;
  if (appearance.glow === 'classic') delete root.dataset.glow;
  else root.dataset.glow = appearance.glow;
  syncWindowChrome();
}

// 顶栏颜色同步给主进程，让窗口底色和右上角系统按钮跟着变。
function syncWindowChrome(): void {
  const styles = getComputedStyle(document.documentElement);
  const color = styles.getPropertyValue('--color-ink-0').trim();
  const symbolColor = styles.getPropertyValue('--color-text-3').trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(color) || !/^#[0-9a-fA-F]{6}$/.test(symbolColor)) return;
  void window.lolHelper?.window?.setChrome?.({ color, symbolColor })?.catch(() => undefined);
}

export function saveAppearance(appearance: Appearance): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    // 存不下来只影响下次启动，本次照常生效。
  }
  applyAppearance(appearance);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

// 启动时调用一次：套用保存的外观，并在「跟随系统」时监听系统深浅色切换。
export function initAppearance(): void {
  applyAppearance(loadAppearance());
  try {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (loadAppearance().mode === 'system') applyAppearance(loadAppearance());
    });
  } catch {
    // 拿不到系统主题时按保存的模式走。
  }
}

export function useAppearance(): [Appearance, (patch: Partial<Appearance>) => void] {
  const [appearance, setAppearance] = useState<Appearance>(loadAppearance);

  useEffect(() => {
    const onChange = () => setAppearance(loadAppearance());
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  const update = useCallback((patch: Partial<Appearance>) => {
    const next = { ...loadAppearance(), ...patch };
    saveAppearance(next);
    setAppearance(next);
  }, []);

  return [appearance, update];
}
