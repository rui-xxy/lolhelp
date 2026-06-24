// IPC 通道名常量：三端（main / preload / renderer）的唯一真相源。
// 命名规范：<域>:<动作>（域：app / lcu / db ...）
// 用 as const 让值成为字面量联合类型，配合 keyof typeof 可做编译期拼写校验。
export const IPC_CHANNELS = {
  // app 域：应用级信息
  APP_GET_STATUS: 'app:get-status',
  // lcu 域：客户端连接（后续阶段填充真实实现）
  LCU_DETECT_CLIENT: 'lcu:detect-client',
  LCU_CONNECT: 'lcu:connect',
  LCU_GET_CURRENT_SUMMONER: 'lcu:get-current-summoner',
  LCU_GET_CURRENT_REGION: 'lcu:get-current-region',
  LCU_GET_LOBBY: 'lcu:get-lobby',
  LCU_GET_CHAMP_SELECT_SESSION: 'lcu:get-champ-select-session',
  LCU_GET_FRIENDS: 'lcu:get-friends',
  // db 域：本地数据/设置（后续阶段填充真实实现）
  DB_GET_SETTINGS: 'db:get-settings',
  DB_SAVE_SETTINGS: 'db:save-settings',
  // config 域：League 客户端/游戏内配置读取、保存和一键应用
  CONFIG_READ: 'config:read',
  CONFIG_APPLY_VALUES: 'config:apply-values',
  CONFIG_SAVE_PROFILE: 'config:save-profile',
  CONFIG_APPLY_PROFILE: 'config:apply-profile',
  CONFIG_DELETE_PROFILE: 'config:delete-profile',
  // match 域：战绩查询（按名查战绩列表+详情）
  MATCH_SEARCH: 'match:search',
  // window 域：窗口控制
  WINDOW_RESIZE: 'window:resize',
  WINDOW_SET_WIDTH: 'window:set-width',
  // live 域：实时对局
  LIVE_GET_BATTLE: 'live:get-battle',
  // scout 域：高手扩散搜索
  SCOUT_FIND: 'scout:find',
  SCOUT_PROGRESS: 'scout:progress', // 进度推送（main → renderer）
  SCOUT_CANCEL: 'scout:cancel',
  // match 域：英雄列表（给选择器用）
  MATCH_GET_CHAMPIONS: 'match:get-champions',
} as const;

// 通道名类型：所有合法通道名的字面量联合（编译期拼写校验用）
export type IpcChannelName = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
