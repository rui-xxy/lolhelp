import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/channels';
import type {
  LolConfigApplyProfileRequest,
  LolConfigApplyResult,
  LolConfigApplyValuesRequest,
  LolConfigProfileSummary,
  LolConfigSaveProfileRequest,
  LolConfigState,
} from '../../../shared/api';
import {
  applyLeagueConfigProfile,
  applyLeagueConfigValues,
  deleteLeagueConfigProfile,
  readLeagueConfig,
  saveLeagueConfigProfile,
} from '../../config/lolConfig';

export function registerConfigHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.CONFIG_READ,
    async (_event, rootPath?: string): Promise<LolConfigState> => {
      return readLeagueConfig(rootPath);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CONFIG_APPLY_VALUES,
    async (_event, req: LolConfigApplyValuesRequest): Promise<LolConfigApplyResult> => {
      return applyLeagueConfigValues(req.rootPath, req.values);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CONFIG_SAVE_PROFILE,
    async (_event, req: LolConfigSaveProfileRequest): Promise<LolConfigProfileSummary[]> => {
      return saveLeagueConfigProfile(req.name, req.rootPath, req.values);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CONFIG_APPLY_PROFILE,
    async (_event, req: LolConfigApplyProfileRequest): Promise<LolConfigApplyResult> => {
      return applyLeagueConfigProfile(req.profileId, req.rootPath);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CONFIG_DELETE_PROFILE,
    async (_event, profileId: string): Promise<LolConfigProfileSummary[]> => {
      return deleteLeagueConfigProfile(profileId);
    },
  );
}
