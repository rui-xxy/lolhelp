import { app, screen, type BrowserWindow, type Rectangle } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// 记住窗口尺寸与位置；首次启动按当前屏幕的可用区域收缩默认尺寸，
// 避免 1080p 屏 125% 缩放这类小可用区域下窗口超出屏幕。

export interface WindowSizeLimits {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
}

export interface InitialWindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

interface StoredWindowState {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  maximized?: boolean;
}

function stateFile(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function intersects(area: Rectangle, bounds: Rectangle): boolean {
  return (
    bounds.x < area.x + area.width &&
    bounds.x + bounds.width > area.x &&
    bounds.y < area.y + area.height &&
    bounds.y + bounds.height > area.y
  );
}

function readStoredState(): StoredWindowState | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(stateFile(), 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as StoredWindowState) : null;
  } catch {
    return null;
  }
}

export function loadWindowState(limits: WindowSizeLimits): InitialWindowState {
  const workArea = screen.getPrimaryDisplay().workArea;
  const fitWidth = Math.max(limits.minWidth, Math.min(limits.width, workArea.width));
  const fitHeight = Math.max(limits.minHeight, Math.min(limits.height, workArea.height));
  const stored = readStoredState();
  if (!stored) return { width: fitWidth, height: fitHeight, maximized: false };

  const width = Math.max(limits.minWidth, Number(stored.width) || fitWidth);
  const height = Math.max(limits.minHeight, Number(stored.height) || fitHeight);
  const state: InitialWindowState = { width, height, maximized: stored.maximized === true };
  const x = Number(stored.x);
  const y = Number(stored.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    const bounds = { x, y, width, height };
    if (screen.getAllDisplays().some((display) => intersects(display.workArea, bounds))) {
      state.x = x;
      state.y = y;
    }
  }
  return state;
}

export function trackWindowState(window: BrowserWindow): void {
  const save = () => {
    if (window.isDestroyed()) return;
    try {
      const bounds = window.getNormalBounds();
      const state: StoredWindowState = { ...bounds, maximized: window.isMaximized() };
      mkdirSync(path.dirname(stateFile()), { recursive: true });
      writeFileSync(stateFile(), JSON.stringify(state), 'utf8');
    } catch {
      // 记不住尺寸不影响使用，下次按默认尺寸打开。
    }
  };
  window.on('close', save);
}
