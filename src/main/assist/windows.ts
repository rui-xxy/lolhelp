import { BrowserWindow, globalShortcut } from 'electron';
import path from 'node:path';
import type { AssistHotkeys, AssistOverlayName } from '../../shared/api';
import { setAssistOverlayStatus } from './runtime';

interface OverlayEnvironment {
  preloadPath: string;
  devServerUrl?: string;
  rendererDirectory: string;
}

const dimensions: Record<AssistOverlayName, { width: number; height: number }> = {
  helper: { width: 380, height: 720 },
  match: { width: 920, height: 640 },
  spells: { width: 420, height: 560 },
};

const windows = new Map<AssistOverlayName, BrowserWindow>();
let environment: OverlayEnvironment | null = null;
let mainWindow: BrowserWindow | null = null;
let shortcutSignature = '';

export function configureAssistWindows(
  value: OverlayEnvironment,
  window: BrowserWindow,
): void {
  environment = value;
  mainWindow = window;
}

async function loadOverlay(win: BrowserWindow, name: AssistOverlayName): Promise<void> {
  if (!environment) throw new Error('悬浮窗环境尚未初始化');
  if (environment.devServerUrl) {
    const url = new URL(environment.devServerUrl);
    url.searchParams.set('overlay', name);
    await win.loadURL(url.toString());
    return;
  }
  await win.loadFile(
    path.join(environment.rendererDirectory, 'index.html'),
    { query: { overlay: name } },
  );
}

function createOverlay(name: AssistOverlayName): BrowserWindow {
  if (!environment) throw new Error('悬浮窗环境尚未初始化');
  const size = dimensions[name];
  const win = new BrowserWindow({
    title: `LOL助手 - ${name}`,
    ...size,
    minWidth: Math.min(size.width, 320),
    minHeight: Math.min(size.height, 220),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    show: false,
    webPreferences: {
      preload: environment.preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('closed', () => {
    windows.delete(name);
    setAssistOverlayStatus(name, false);
  });
  win.on('show', () => setAssistOverlayStatus(name, true));
  win.on('hide', () => setAssistOverlayStatus(name, false));
  void loadOverlay(win, name);
  windows.set(name, win);
  return win;
}

export async function toggleAssistOverlay(name: AssistOverlayName): Promise<boolean> {
  let win = windows.get(name);
  if (!win || win.isDestroyed()) win = createOverlay(name);
  if (win.isVisible()) {
    win.hide();
    return false;
  }
  win.showInactive();
  return true;
}

export async function showAssistOverlay(name: AssistOverlayName): Promise<void> {
  let win = windows.get(name);
  if (!win || win.isDestroyed()) win = createOverlay(name);
  if (!win.isVisible()) win.showInactive();
}

export function hideAssistOverlay(name: AssistOverlayName): void {
  const win = windows.get(name);
  if (win && !win.isDestroyed() && win.isVisible()) win.hide();
}

function normalizeAccelerator(value: string): string {
  return value
    .trim()
    .replace(/\bCTRL\b/gi, 'CommandOrControl')
    .replace(/\bALT\b/gi, 'Alt')
    .replace(/\bSHIFT\b/gi, 'Shift')
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('+');
}

export function syncAssistGlobalShortcuts(
  enabled: boolean,
  hotkeys: AssistHotkeys,
): void {
  const signature = JSON.stringify({ enabled, hotkeys });
  if (signature === shortcutSignature) return;
  shortcutSignature = signature;
  globalShortcut.unregisterAll();
  if (!enabled) return;

  const entries: Array<[string, () => void]> = [
    [hotkeys.mainWindow, () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isVisible()) mainWindow.hide();
      else {
        mainWindow.show();
        mainWindow.focus();
      }
    }],
    [hotkeys.matchOverlay, () => void toggleAssistOverlay('match')],
    [hotkeys.matchHelper, () => void toggleAssistOverlay('helper')],
    [hotkeys.spellOverlay, () => void toggleAssistOverlay('spells')],
  ];

  for (const [raw, handler] of entries) {
    const accelerator = normalizeAccelerator(raw);
    if (!accelerator) continue;
    try {
      globalShortcut.register(accelerator, handler);
    } catch (error) {
      console.warn(`[assist] 注册快捷键 ${accelerator} 失败:`, error);
    }
  }
}

export function disposeAssistWindows(): void {
  globalShortcut.unregisterAll();
  shortcutSignature = '';
  for (const win of windows.values()) {
    if (!win.isDestroyed()) win.destroy();
  }
  windows.clear();
}
