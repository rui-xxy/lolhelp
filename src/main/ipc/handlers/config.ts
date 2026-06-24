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
import {
  validateApplyProfileRequest,
  validateApplyValuesRequest,
  validateProfileId,
  validateRootPath,
  validateSaveProfileRequest,
} from '../validation';

export function registerConfigHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.CONFIG_READ,
    async (_event, rootPath?: string): Promise<LolConfigState> => {
      return readLeagueConfig(validateRootPath(rootPath));
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CONFIG_APPLY_VALUES,
    async (_event, req: LolConfigApplyValuesRequest): Promise<LolConfigApplyResult> => {
      const validated = validateApplyValuesRequest(req);
      return applyLeagueConfigValues(validated.rootPath, validated.values);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CONFIG_SAVE_PROFILE,
    async (_event, req: LolConfigSaveProfileRequest): Promise<LolConfigProfileSummary[]> => {
      const validated = validateSaveProfileRequest(req);
      return saveLeagueConfigProfile(validated.name, validated.rootPath, validated.values);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CONFIG_APPLY_PROFILE,
    async (_event, req: LolConfigApplyProfileRequest): Promise<LolConfigApplyResult> => {
      const validated = validateApplyProfileRequest(req);
      return applyLeagueConfigProfile(validated.profileId, validated.rootPath);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CONFIG_DELETE_PROFILE,
    async (_event, profileId: string): Promise<LolConfigProfileSummary[]> => {
      return deleteLeagueConfigProfile(validateProfileId(profileId));
    },
  );
}
