import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  AppSettings,
  AssistClaimRewardRequest,
  AssistDisenchantRequest,
  AssistRecommendationRequest,
  ChampionRankingRequest,
  LolConfigApplyProfileRequest,
  LolConfigApplyValuesRequest,
  LolConfigSaveProfileRequest,
  LolHelper,
  LiveStateChangeEvent,
  PlayerLookupRequest,
  ReplayAvailabilityRequest,
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
    getFriendRequests: () => ipcRenderer.invoke(IPC_CHANNELS.LCU_GET_FRIEND_REQUESTS),
    addFriend: (riotId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LCU_ADD_FRIEND, riotId),
    acceptFriendRequest: (puuid: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LCU_ACCEPT_FRIEND_REQUEST, puuid),
    deleteFriendRequest: (puuid: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LCU_DELETE_FRIEND_REQUEST, puuid),
    getChatConversations: (accountKey?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LCU_GET_CHAT_CONVERSATIONS, accountKey),
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
    getPlayerRanks: (puuid: string, region?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.MATCH_GET_PLAYER_RANKS, puuid, region),
    getSavedMatches: () =>
      ipcRenderer.invoke(IPC_CHANNELS.MATCH_GET_SAVED_MATCHES),
    importSavedMatches: (state) =>
      ipcRenderer.invoke(IPC_CHANNELS.MATCH_IMPORT_SAVED_MATCHES, state),
    saveMatchesForProfile: (profile, region, matches, regionName) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.MATCH_SAVE_MATCHES_FOR_PROFILE,
        profile,
        region,
        matches,
        regionName,
      ),
    createSavedMatchGroup: (name: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.MATCH_CREATE_SAVED_GROUP, name),
    deleteSavedMatchGroup: (groupId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.MATCH_DELETE_SAVED_GROUP, groupId),
    setSavedMatchAccountGroup: (accountId: string, groupId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.MATCH_SET_SAVED_ACCOUNT_GROUP, accountId, groupId),
    setSavedMatchAccountFollow: (accountId: string, enabled: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.MATCH_SET_SAVED_ACCOUNT_FOLLOW, accountId, enabled),
    deleteSavedMatchAccount: (accountId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.MATCH_DELETE_SAVED_ACCOUNT, accountId),
    deleteSavedMatch: (accountId: string, gameId: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.MATCH_DELETE_SAVED_MATCH, accountId, gameId),
    getReplayAvailability: (request: ReplayAvailabilityRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.MATCH_GET_REPLAY_AVAILABILITY, request),
    downloadReplay: (gameId: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.MATCH_DOWNLOAD_REPLAY, gameId),
    watchReplay: (gameId: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.MATCH_WATCH_REPLAY, gameId),
    getChampions: () => ipcRenderer.invoke(IPC_CHANNELS.MATCH_GET_CHAMPIONS),
  },
  ranking: {
    getChampions: (request: ChampionRankingRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.RANKING_GET_CHAMPIONS, request),
    getMayhemTierList: (refresh?: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.RANKING_GET_MAYHEM_TIER_LIST, refresh),
    getMayhemBuild: (slug: string, refresh?: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.RANKING_GET_MAYHEM_BUILD, slug, refresh),
    getMayhemAugmentRanking: (refresh?: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.RANKING_GET_MAYHEM_AUGMENTS, refresh),
    getMayhemCombos: (refresh?: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.RANKING_GET_MAYHEM_COMBOS, refresh),
  },
  live: {
    getBattle: () => ipcRenderer.invoke(IPC_CHANNELS.LIVE_GET_BATTLE),
    onStateChanged: (listener: (event: LiveStateChangeEvent) => void) => {
      const handler = (_event: IpcRendererEvent, payload: LiveStateChangeEvent) => {
        listener(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.LIVE_STATE_CHANGED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.LIVE_STATE_CHANGED, handler);
    },
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
    getLiveData: () => ipcRenderer.invoke(IPC_CHANNELS.ASSIST_GET_LIVE_DATA),
    exportBlacklist: () => ipcRenderer.invoke(IPC_CHANNELS.ASSIST_EXPORT_BLACKLIST),
  },
  config: {
    read: (rootPath?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_READ, rootPath),
    detectRoots: () =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_DETECT_ROOTS),
    selectRoot: () =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SELECT_ROOT),
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
