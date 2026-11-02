// IPC 通道名常量：三端（main / preload / renderer）的唯一真相源。
// 命名规范：<域>:<动作>（域：app / lcu / db ...）
// 用 as const 让值成为字面量联合类型，配合 keyof typeof 可做编译期拼写校验。
export const IPC_CHANNELS = {
  // app 域：应用级信息
  APP_GET_STATUS: 'app:get-status',
  // lcu 域：客户端连接（后续阶段填充真实实现）
  LCU_DETECT_CLIENT: 'lcu:detect-client',
  LCU_GET_CURRENT_REGION: 'lcu:get-current-region',
  LCU_GET_FRIENDS: 'lcu:get-friends',
  LCU_GET_FRIEND_REQUESTS: 'lcu:get-friend-requests',
  LCU_ADD_FRIEND: 'lcu:add-friend',
  LCU_ACCEPT_FRIEND_REQUEST: 'lcu:accept-friend-request',
  LCU_DELETE_FRIEND_REQUEST: 'lcu:delete-friend-request',
  LCU_GET_CHAT_CONVERSATIONS: 'lcu:get-chat-conversations',
  LCU_SEND_CHAT_MESSAGE: 'lcu:send-chat-message',
  LCU_SPECTATE_FRIEND: 'lcu:spectate-friend',
  LCU_DELETE_FRIEND: 'lcu:delete-friend',
  LCU_GET_MY_COLLECTION: 'lcu:get-my-collection',
  // db 域：本地数据/设置（后续阶段填充真实实现）
  DB_GET_SETTINGS: 'db:get-settings',
  DB_SAVE_SETTINGS: 'db:save-settings',
  DB_UPDATE_SETTINGS: 'db:update-settings',
  ASSIST_GET_RECOMMENDATION: 'assist:get-recommendation',
  ASSIST_APPLY_RECOMMENDATION: 'assist:apply-recommendation',
  ASSIST_GET_CHAMPION_GUIDE: 'assist:get-champion-guide',
  ASSIST_GET_PROFILE_ICONS: 'assist:get-profile-icons',
  ASSIST_GET_CHAMPION_SKINS: 'assist:get-champion-skins',
  ASSIST_LOCK_CURRENT_CHAMPION: 'assist:lock-current-champion',
  ASSIST_APPLY_ACCOUNT_SETTINGS: 'assist:apply-account-settings',
  ASSIST_GET_LOOT: 'assist:get-loot',
  ASSIST_DISENCHANT_CHAMPION_SHARD: 'assist:disenchant-champion-shard',
  ASSIST_GET_REWARDS: 'assist:get-rewards',
  ASSIST_CLAIM_REWARD: 'assist:claim-reward',
  ASSIST_CLAIM_REWARDS: 'assist:claim-rewards',
  ASSIST_GET_LIVE_DATA: 'assist:get-live-data',
  ASSIST_EXPORT_BLACKLIST: 'assist:export-blacklist',
  // config 域：League 客户端/游戏内配置读取、保存和一键应用
  CONFIG_READ: 'config:read',
  CONFIG_DETECT_ROOTS: 'config:detect-roots',
  CONFIG_SELECT_ROOT: 'config:select-root',
  CONFIG_APPLY_VALUES: 'config:apply-values',
  CONFIG_SAVE_PROFILE: 'config:save-profile',
  CONFIG_APPLY_PROFILE: 'config:apply-profile',
  CONFIG_DELETE_PROFILE: 'config:delete-profile',
  CONFIG_GET_PROFILE: 'config:get-profile',
  // match 域：战绩查询（按名查战绩列表+详情）
  MATCH_SEARCH: 'match:search',
  MATCH_GET_BRIEFS: 'match:get-briefs',
  MATCH_GET_PLAYER_RANKS: 'match:get-player-ranks',
  MATCH_GET_PLAYER_DOSSIER: 'match:get-player-dossier',
  MATCH_GET_ACTIVE_GAME: 'match:get-active-game',
  MATCH_GET_SAVED_MATCHES_SUMMARY: 'match:get-saved-matches-summary',
  MATCH_GET_SAVED_MATCHES_CATALOG: 'match:get-saved-matches-catalog',
  MATCH_GET_SAVED_MATCH_ACCOUNT: 'match:get-saved-match-account',
  MATCH_IMPORT_SAVED_MATCHES: 'match:import-saved-matches',
  MATCH_SAVE_MATCHES_FOR_PROFILE: 'match:save-matches-for-profile',
  MATCH_CREATE_SAVED_GROUP: 'match:create-saved-group',
  MATCH_DELETE_SAVED_GROUP: 'match:delete-saved-group',
  MATCH_SET_SAVED_ACCOUNT_GROUP: 'match:set-saved-account-group',
  MATCH_SET_SAVED_ACCOUNT_FOLLOW: 'match:set-saved-account-follow',
  MATCH_DELETE_SAVED_ACCOUNT: 'match:delete-saved-account',
  MATCH_DELETE_SAVED_MATCH: 'match:delete-saved-match',
  MATCH_GET_REPLAY_AVAILABILITY: 'match:get-replay-availability',
  MATCH_DOWNLOAD_REPLAY: 'match:download-replay',
  MATCH_WATCH_REPLAY: 'match:watch-replay',
  MATCH_GET_TIMELINE: 'match:get-timeline',
  // window 域：窗口控制
  WINDOW_SET_WIDTH: 'window:set-width',
  WINDOW_SET_CHROME: 'window:set-chrome', // 外观切换后同步窗口底色与系统按钮颜色
  // live 域：实时对局
  LIVE_GET_BATTLE: 'live:get-battle',
  LIVE_GET_MATCH_DETAIL: 'live:get-match-detail',
  LIVE_STATE_CHANGED: 'live:state-changed',
  LIVE_BATTLE_UPDATE: 'live:battle-update', // 增量推送（main → renderer）
  // scout 域：高手扩散搜索
  SCOUT_FIND: 'scout:find',
  SCOUT_PROGRESS: 'scout:progress', // 进度推送（main → renderer）
  SCOUT_CANCEL: 'scout:cancel',
  // match 域：英雄列表（给选择器用）
  MATCH_GET_CHAMPIONS: 'match:get-champions',
  // ranking 域：第三方英雄排行数据统一由主进程请求和整理。
  RANKING_GET_CHAMPIONS: 'ranking:get-champions',
  RANKING_GET_MAYHEM_TIER_LIST: 'ranking:get-mayhem-tier-list',
  RANKING_GET_MAYHEM_BUILD: 'ranking:get-mayhem-build',
  RANKING_GET_MAYHEM_AUGMENTS: 'ranking:get-mayhem-augments',
  RANKING_GET_MAYHEM_COMBOS: 'ranking:get-mayhem-combos',
} as const;

// 通道名类型：所有合法通道名的字面量联合（编译期拼写校验用）
export type IpcChannelName = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
