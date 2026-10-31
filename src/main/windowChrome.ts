import { app, type BrowserWindow } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { WindowChromeColors } from '../shared/api';
import { APP_LAYOUT } from '../shared/constants';

// 窗口底色与右上角系统按钮的颜色要和顶栏一致。外观（深色/浅色、配色）由渲染进程决定，
// 切换后通过 IPC 同步过来；这里把最后一次的颜色记下来，下次启动窗口一出现就是对的颜色，不闪。

// 默认是石墨深色：tokens.css 的 --color-ink-0 / --color-text-3。
export const DEFAULT_WINDOW_CHROME: WindowChromeColors = {
  color: '#282929',
  symbolColor: '#A0A29D',
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function chromeFile(): string {
  return path.join(app.getPath('userData'), 'window-chrome.json');
}

export function isWindowChromeColors(value: unknown): value is WindowChromeColors {
  if (!value || typeof value !== 'object') return false;
  const { color, symbolColor } = value as Partial<WindowChromeColors>;
  return typeof color === 'string' && HEX_COLOR.test(color)
    && typeof symbolColor === 'string' && HEX_COLOR.test(symbolColor);
}

export function loadWindowChrome(): WindowChromeColors {
  try {
    const parsed: unknown = JSON.parse(readFileSync(chromeFile(), 'utf8'));
    return isWindowChromeColors(parsed) ? parsed : DEFAULT_WINDOW_CHROME;
  } catch {
    return DEFAULT_WINDOW_CHROME;
  }
}

export function applyWindowChrome(window: BrowserWindow, chrome: WindowChromeColors): void {
  if (window.isDestroyed()) return;
  window.setBackgroundColor(chrome.color);
  try {
    // 只有 titleBarStyle: 'hidden' 且平台支持时才有系统按钮覆盖层；不支持时忽略。
    window.setTitleBarOverlay({
      color: chrome.color,
      symbolColor: chrome.symbolColor,
      height: APP_LAYOUT.topbarHeight,
    });
  } catch {
    // macOS 等没有覆盖层的平台会抛错，不影响使用。
  }
  try {
    mkdirSync(path.dirname(chromeFile()), { recursive: true });
    writeFileSync(chromeFile(), JSON.stringify(chrome), 'utf8');
  } catch {
    // 记不住颜色只会让下次启动先闪一下默认色。
  }
}
