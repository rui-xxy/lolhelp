import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  AppSettings,
  AssistOverlayName,
  AssistClaimRewardRequest,
  AssistDisenchantRequest,
  AssistRecommendationRequest,
  LolConfigApplyProfileRequest,
  LolConfigApplyValuesRequest,
  LolConfigSaveProfileRequest,
  LolHelper,
  PlayerLookupRequest,
  ScoutConfig,
  ScoutProgress,
} from '../shared/api';
import { IPC_CHANNELS } from '../shared/channels';

// 用类型约束实现：确保暴露的 API 与契约 LolHelper 完全一致（多一个少一个都报错）。
// contextIsolation 默认开启，这是 renderer 唯一能接触主进程的合法通路。
// 白名单原则：只暴露下面显式列出的方法，renderer 拿不到 ipcRenderer 本体。
const lolHelper: LolHelper = {
  app: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_STATUS),
  },
  lcu: {
    detectClient: () => ipcRenderer.invoke(IPC_CHANNELS.LCU_DETECT_CLIENT),
    getCurrentRegion: () => ipcRenderer.invoke(IPC_CHANNELS.LCU_GET_CURRENT_REGION),
    getFriends: () => ipcRenderer.invoke(IPC_CHANNELS.LCU_GET_FRIENDS),
    getChatConversations: () =>
      ipcRenderer.invoke(IPC_CHANNELS.LCU_GET_CHAT_CONVERSATIONS),
    sendChatMessage: (conversationId: string, body: string) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.LCU_SEND_CHAT_MESSAGE,
        conversationId,
        body,
      ),
    spectateFriend: (puuid: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LCU_SPECTATE_FRIEND, puuid),
    deleteFriend: (friendId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LCU_DELETE_FRIEND, friendId),
  },
  match: {
    search: (req: PlayerLookupRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.MATCH_SEARCH, req),
    getPlayerRanks: (puuid: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.MATCH_GET_PLAYER_RANKS, puuid),
    getChampions: () => ipcRenderer.invoke(IPC_CHANNELS.MATCH_GET_CHAMPIONS),
  },
  live: {
    getBattle: () => ipcRenderer.invoke(IPC_CHANNELS.LIVE_GET_BATTLE),
  },
  window: {
    setWidth: (width: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.WINDOW_SET_WIDTH, width),
  },
  db: {
    getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.DB_GET_SETTINGS),
    saveSettings: (settings: AppSettings) =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_SAVE_SETTINGS, settings),
    updateSettings: (patch: Partial<AppSettings>) =>
      ipcRenderer.invoke(IPC_CHANNELS.DB_UPDATE_SETTINGS, patch),
  },
  assist: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.ASSIST_GET_STATUS),
    getRecommendation: (request?: AssistRecommendationRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSIST_GET_RECOMMENDATION, request),
    applyRecommendation: (request?: AssistRecommendationRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSIST_APPLY_RECOMMENDATION, request),
    getChampionGuide: (championId?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSIST_GET_CHAMPION_GUIDE, championId),
    getProfileIcons: () =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSIST_GET_PROFILE_ICONS),
    lockCurrentChampion: () =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSIST_LOCK_CURRENT_CHAMPION),
    applyAccountSettings: () =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSIST_APPLY_ACCOUNT_SETTINGS),
    getLoot: () =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSIST_GET_LOOT),
    disenchantChampionShard: (request: AssistDisenchantRequest) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.ASSIST_DISENCHANT_CHAMPION_SHARD,
        request,
      ),
    getRewards: () =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSIST_GET_REWARDS),
    claimReward: (request: AssistClaimRewardRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSIST_CLAIM_REWARD, request),
    claimRewards: (requests: AssistClaimRewardRequest[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSIST_CLAIM_REWARDS, requests),
    toggleOverlay: (name: AssistOverlayName) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSIST_TOGGLE_OVERLAY, name),
    setOverlayPinned: (name: AssistOverlayName, pinned: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.ASSIST_SET_OVERLAY_PINNED, name, pinned),
    getLiveData: () => ipcRenderer.invoke(IPC_CHANNELS.ASSIST_GET_LIVE_DATA),
    exportBlacklist: () => ipcRenderer.invoke(IPC_CHANNELS.ASSIST_EXPORT_BLACKLIST),
  },
  config: {
    read: (rootPath?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_READ, rootPath),
    applyValues: (req: LolConfigApplyValuesRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_APPLY_VALUES, req),
    saveProfile: (req: LolConfigSaveProfileRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SAVE_PROFILE, req),
    applyProfile: (req: LolConfigApplyProfileRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_APPLY_PROFILE, req),
    deleteProfile: (profileId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_DELETE_PROFILE, profileId),
  },
  scout: {
    // find：长任务。onProgress 通过 scout:progress 推送（每出一个达标者回调一次）。
    // 用 once 绑定监听，任务结束（invoke resolve）后解绑，避免重复绑定。
    find: (config: ScoutConfig, onProgress?: (p: ScoutProgress) => void) => {
      if (onProgress) {
        const handler = (_e: IpcRendererEvent, progress: ScoutProgress) =>
          onProgress(progress);
        ipcRenderer.on(IPC_CHANNELS.SCOUT_PROGRESS, handler);
        // invoke 完成后无论成功失败都解绑
        return ipcRenderer
          .invoke(IPC_CHANNELS.SCOUT_FIND, config)
          .finally(() => ipcRenderer.removeListener(IPC_CHANNELS.SCOUT_PROGRESS, handler));
      }
      return ipcRenderer.invoke(IPC_CHANNELS.SCOUT_FIND, config);
    },
    cancel: () => ipcRenderer.invoke(IPC_CHANNELS.SCOUT_CANCEL),
  },
};

contextBridge.exposeInMainWorld('lolHelper', lolHelper);
