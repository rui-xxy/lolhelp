import { dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import type {
  AssistOverlayName,
  AssistRecommendationRequest,
} from '../../../shared/api';
import { IPC_CHANNELS } from '../../../shared/channels';
import { applyAssistAccountSettings } from '../../assist/account';
import { getAssistLiveData } from '../../assist/liveClient';
import {
  getAssistChampionGuide,
  lockAssistCurrentChampion,
} from '../../assist/championGuide';
import { getAssistProfileIcons } from '../../assist/profileIcons';
import {
  applyAssistRecommendation,
  getAssistRecommendation,
} from '../../assist/recommendations';
import { getAssistRuntimeStatus } from '../../assist/runtime';
import {
  setAssistOverlayPinned,
  toggleAssistOverlay,
} from '../../assist/windows';
import { getSettings } from '../../settings/store';

const OVERLAY_NAMES: AssistOverlayName[] = ['helper', 'match', 'spells'];

export function registerAssistHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ASSIST_GET_STATUS, () => getAssistRuntimeStatus());
  ipcMain.handle(
    IPC_CHANNELS.ASSIST_GET_RECOMMENDATION,
    (_event, request?: AssistRecommendationRequest) =>
      getAssistRecommendation(request),
  );
  ipcMain.handle(
    IPC_CHANNELS.ASSIST_APPLY_RECOMMENDATION,
    (_event, request?: AssistRecommendationRequest) =>
      applyAssistRecommendation(request),
  );
  ipcMain.handle(
    IPC_CHANNELS.ASSIST_GET_CHAMPION_GUIDE,
    (_event, championId?: number) =>
      getAssistChampionGuide(Number(championId ?? 0)),
  );
  ipcMain.handle(
    IPC_CHANNELS.ASSIST_GET_PROFILE_ICONS,
    () => getAssistProfileIcons(),
  );
  ipcMain.handle(
    IPC_CHANNELS.ASSIST_LOCK_CURRENT_CHAMPION,
    () => lockAssistCurrentChampion(),
  );
  ipcMain.handle(
    IPC_CHANNELS.ASSIST_APPLY_ACCOUNT_SETTINGS,
    () => applyAssistAccountSettings(),
  );
  ipcMain.handle(
    IPC_CHANNELS.ASSIST_TOGGLE_OVERLAY,
    (_event, name: AssistOverlayName) => {
      if (!OVERLAY_NAMES.includes(name)) throw new Error('悬浮窗类型无效');
      return toggleAssistOverlay(name);
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.ASSIST_SET_OVERLAY_PINNED,
    (_event, name: AssistOverlayName, pinned: boolean) => {
      if (!OVERLAY_NAMES.includes(name)) throw new Error('无效的悬浮窗类型');
      return setAssistOverlayPinned(name, Boolean(pinned));
    },
  );
  ipcMain.handle(IPC_CHANNELS.ASSIST_GET_LIVE_DATA, () => getAssistLiveData());
  ipcMain.handle(IPC_CHANNELS.ASSIST_EXPORT_BLACKLIST, async () => {
    const result = await dialog.showSaveDialog({
      title: '导出辅助功能黑名单',
      defaultPath: `lolhelp-blacklist-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return null;
    fs.writeFileSync(
      result.filePath,
      JSON.stringify(getSettings().blacklist, null, 2),
      'utf8',
    );
    return result.filePath;
  });
}
