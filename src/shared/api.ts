// 三端（main / preload / renderer）共享的类型契约。
// 用 import type 引入，编译期擦除，不产生运行时代码，三端独立构建无冲突。

// 主进程返回给渲染进程的应用状态信息
export interface AppStatus {
  appName: string; // 应用名（来自 app.getName()，即 productName）
  appVersion: string; // 应用版本
  electronVersion: string; // Electron 版本
  chromeVersion: string; // Chromium 版本
  nodeVersion: string; // Node 版本
  platform: string; // win32 / darwin / linux
  arch: string; // x64 / arm64
  uptime: number; // 应用已运行秒数
  serverTime: string; // 主进程当前时间（ISO，演示动态数据）
  lcuConnected: boolean; // LCU 客户端连接占位（后续阶段实现）
}

// 按功能域分组的 API 契约。每加一个功能域，这里加一个子 interface。
export interface AppApi {
  getStatus: () => Promise<AppStatus>;
}

// detect-client 返回：LCU 客户端连通验证结果。
export interface LcuConnection {
  found: boolean; // 客户端是否检测到（lockfile 存在且非空）
  connected: boolean; // 是否成功发了 LCU 请求（found=true 且请求返回 2xx）
  summonerName?: string; // connected 时的召唤师名（来自 current-summoner）
  error?: string; // 失败原因（未找到/格式错/请求失败/国服 403 等）
}

export interface LcuRegion {
  key: string;
  name: string;
  error?: string;
}

// 单个好友信息（来自 lol-chat/v1/friends）
export interface FriendInfo {
  puuid: string;
  gameName: string;
  gameTag: string;
  summonerId: number;
  iconUrl?: string;
  iconUrls?: string[];
  icon: number; // 头像图标 ID
  availability: string; // offline / dnd / away / chat / online
  groupName: string; // 分组名
  note: string; // 备注
  statusMessage: string; // 状态消息
  lastSeenOnlineTimestamp: number | null;
  product: string; // 当前在哪个产品（空=LOL 客户端大厅）
  lol?: {
    gameStatus?: string; // inGame / outOfGame / inQueue
    gameMode?: string; // CLASSIC / ARAM / TUTORIAL
    gameQueueType?: string; // RANKED_SOLO_5x5 等
    championId?: number; // 当前英雄
    championSplashUrl?: string; // 当前英雄/皮肤背景
    championSplashUrls?: string[]; // 当前皮肤优先，默认原画兜底
    timeStamp?: string | number; // 游戏开始时间戳（LCU 好友状态）
    gameId?: number; // 当前对局 ID
    rankedLeagueTier?: string; // 段位
    level?: number; // 等级
  };
}

// 占位接口：后续阶段接入 LCU 时填充方法签名
export interface LcuApi {
  detectClient: () => Promise<LcuConnection>;
  getCurrentRegion: () => Promise<LcuRegion>;
  getFriends: () => Promise<FriendInfo[]>;
}

// 占位接口：后续阶段接入本地数据时填充
// getSettings / saveSettings ...

// ============================================================================
// 设置（用户偏好，持久化到本地 JSON）
// ============================================================================

// 应用设置：存到 userData/lolhelper-settings.json
export interface AppSettings {
  // 收藏的英雄 ID（高手雷达查指定英雄时的默认来源）
  favoriteChampions: number[];
  // 英雄选择方案：保存一整组指定英雄，便于下次一键套用
  championPresets?: ChampionPreset[];
  // 雷达默认参数（用户上次用过的配置，下次打开时回填）
  scoutDefaults?: Partial<ScoutConfig>;
}

export interface ChampionPreset {
  id: string;
  name: string;
  championIds: number[];
  updatedAt: number;
}

// 本地设置读写契约
export interface DbApi {
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<void>;
}

// ============================================================================
// League 配置同步：客户端设置 + 游戏内设置
// ============================================================================

export interface LolClientConfigValues {
  lowSpecMode: boolean;
  disableInteractiveBackground: boolean;
  closeClientDuringGame: boolean;
  disableChampionSkillText: boolean;
  clientAudioEnabled: boolean;
  uploadCrashReports: boolean;
  careerPrivate: boolean;
  blockNonFriendGameInvites: boolean;
  linkClickWarningEnabled: boolean;
  moreUnreadsEnabled: boolean;
  friendRequestToastsEnabled: boolean;
  teamVoiceEnabled: boolean;
  autoJoinTeamVoice: boolean;
  muteOnConnect: boolean;
  voiceInputMode: 'voiceActivity' | 'pushToTalk' | string;
  voiceInputDeviceHandle: string;
  voiceInputDeviceName: string;
  voiceInputVolume: number;
  voiceSensitivity: number;
  hideAllPlayerNamesForMe: boolean;
  hideMyNameFromOthers: boolean;
  hideMyIdentityFromOthers: boolean;
  blockedPlayers: LolBlockedPlayer[];
}

export interface LolBlockedPlayer {
  id: string;
  puuid: string;
  summonerId: number;
  gameName: string;
  gameTag: string;
  icon: number;
}

export interface LolGameConfigValues {
  gameMouseSpeed: number;
  mapScrollSpeed: number;
  keyboardScrollSpeed: number;
  snapCameraOnRespawn: boolean;
  scrollSmoothingEnabled: boolean;
  middleClickDragScrollEnabled: boolean;
  cameraLockMode: number;
  autoAcquireTarget: boolean;
  autoDisplayTarget: boolean;
  showAttackRadius: boolean;
  enableTargetedAttackMove: boolean;
  disableHudSpellClick: boolean;
  showTurretRangeIndicators: boolean;
  predictMovement: boolean;
  recommendJunglePaths: boolean;
  targetChampionsOnlyAsToggle: boolean;
  windowMode: string;
  width: number;
  height: number;
  enableAudio: boolean;
  cursorScale: number;
  enableHudAnimations: boolean;
  shadowQuality: number;
  characterQuality: number;
  effectsQuality: number;
  environmentQuality: number;
  frameCapType: number;
  waitForVerticalSync: boolean;
  enableFxaa: boolean;
  globalScale: number;
  chatScale: number;
  minimapScale: number;
  showFpsAndLatency: boolean;
  showTimestamps: boolean;
  showAlliedChat: boolean;
  showAllChannelChat: boolean;
  hidePlayerNames: boolean;
  showSummonerNames: number;
  flashScreenWhenDamaged: boolean;
  flashScreenWhenStunned: boolean;
  showOffScreenPointsOfInterest: boolean;
  enableLineMissileVis: boolean;
  showSpellCosts: boolean;
  showSpellRecommendations: boolean;
  showPlayerStats: boolean;
  showNeutralCamps: boolean;
  numericCooldownFormat: number;
  masterVolume: number;
  masterMute: boolean;
  musicVolume: number;
  musicMute: boolean;
  sfxVolume: number;
  sfxMute: boolean;
  ambienceVolume: number;
  ambienceMute: boolean;
  pingsVolume: number;
  pingsMute: boolean;
  announcerVolume: number;
  announcerMute: boolean;
  voiceVolume: number;
  voiceMute: boolean;
}

export type LolHotkeyValues = Record<string, Record<string, string>>;

export interface LolConfigValues {
  client: LolClientConfigValues;
  game: LolGameConfigValues;
  hotkeys: LolHotkeyValues;
}

export interface LolConfigFileStatus {
  key: string;
  label: string;
  path: string;
  exists: boolean;
  size: number;
  updatedAt: number | null;
}

export interface LolConfigProfileSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  sourceRootPath: string;
  gameResolution: string;
}

export interface LolConfigState {
  rootPath: string;
  found: boolean;
  values: LolConfigValues;
  files: LolConfigFileStatus[];
  profiles: LolConfigProfileSummary[];
  warnings: string[];
}

export interface LolConfigApplyResult {
  rootPath: string;
  backupDir: string | null;
  filesWritten: string[];
  lcuSynced: boolean;
  lcuError?: string;
}

export interface LolConfigSaveProfileRequest {
  name: string;
  rootPath?: string;
  values: LolConfigValues;
}

export interface LolConfigApplyValuesRequest {
  rootPath?: string;
  values: LolConfigValues;
}

export interface LolConfigApplyProfileRequest {
  profileId: string;
  rootPath?: string;
}

export interface LolConfigApi {
  read: (rootPath?: string) => Promise<LolConfigState>;
  applyValues: (req: LolConfigApplyValuesRequest) => Promise<LolConfigApplyResult>;
  saveProfile: (req: LolConfigSaveProfileRequest) => Promise<LolConfigProfileSummary[]>;
  applyProfile: (req: LolConfigApplyProfileRequest) => Promise<LolConfigApplyResult>;
  deleteProfile: (profileId: string) => Promise<LolConfigProfileSummary[]>;
}

// 英雄摘要（给前端英雄选择器用，来自 heroData 的 HeroSummary 映射）
export interface ChampionSummary {
  id: number;
  alias: string;
  name: string;
  title: string;
  avatar: string;
  tags: string[];
}

// preload 暴露给 renderer 的总入口
// （与 contextBridge.exposeInMainWorld 的 key 'lolHelper' 对齐）
export interface LolHelper {
  app: AppApi;
  lcu: LcuApi;
  match: MatchApi;
  live: LiveApi;
  window: WindowApi;
  db: DbApi;
  scout: ScoutApi;
  config: LolConfigApi;
}

// ============================================================================
// 实时对局类型
// ============================================================================

// 单个玩家的实时对局数据（含最近战绩摘要）
export interface LiveBattlePlayer {
  puuid: string;
  summonerId: number;
  riotId: string;
  gameName: string;
  championId: number;
  championName: string;
  championAlias: string;
  teamId: number;
  // 统计摘要（从最近 N 场算）
  kda: number;
  winRate: number;
  matchCount: number;
  history: {
    championId: number;
    championName: string;
    championAlias: string;
    queueName: string;
    kills: number;
    deaths: number;
    assists: number;
    win: boolean;
    timeStr: string; // 显示用（如 "3-29" 或 "5时"）
  }[];
}

// 完整实时对局信息
export interface LiveBattleInfo {
  inGame: boolean;
  phase: string; // ChampSelect / InProgress / GameStart / None
  queueName: string;
  myTeam: LiveBattlePlayer[];
  enemyTeam: LiveBattlePlayer[];
  error?: string;
}

// live 域 API 契约
export interface LiveApi {
  getBattle: () => Promise<LiveBattleInfo>;
}

// window 域：窗口控制
export interface WindowApi {
  setWidth: (width: number) => Promise<void>;
}

// ============================================================================
// 战绩查询类型（借鉴参考项目 playerTypes.ts，精简到战绩必需部分）
// ============================================================================

export type SummonerSpellSlot = 'D' | 'F';

// 装备（ID + 名字 + 图标 + 槽位 0-6）
export interface PlayerItemSummary {
  id: number;
  name: string;
  icon: string;
  slot: number;
}

// 召唤师技能（D/F 槽，标记闪现）
export interface PlayerSpellSummary {
  id: number;
  name: string;
  icon: string;
  slot: SummonerSpellSlot;
  isFlash: boolean;
}

// 符文（基石或副系）
export interface PlayerRuneSummary {
  id: number;
  icon: string;
  name: string;
}

// 单个玩家在对局中的完整数据（10 人各一行）
export interface MatchParticipantSummary {
  puuid: string;
  riotId: string;
  gameName: string;
  tagLine: string;
  summonerName: string;
  profileIconId: number;
  profileIconUrl: string;
  teamId: number;
  teamPosition: string;
  premadeId?: string;
  championId: number;
  championName: string;
  championAvatar: string; // 英雄头像 URL（ddragon，由 main 的 heroData 算好）
  championSplashUrl?: string;
  champLevel: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  win: boolean;
  damage: number;
  cs: number;
  gold: number;
  items: PlayerItemSummary[];
  spells: PlayerSpellSummary[];
  primaryRune: PlayerRuneSummary | null;
  secondaryRune: PlayerRuneSummary | null;
  visionScore?: number;
  largestMultiKill?: number;
  largestKillingSpree?: number; // 最大连杀（≥7 = 超神）
  tripleKills?: number;
  quadraKills?: number;
  pentaKills?: number;
  teamDamagePercentage?: number; // 伤害占团队比例（0~1，MVP 综合分用）
}

// 单场对局完整详情（含 10 人 participants）
export interface PlayerMatchDetail {
  gameId: number;
  queueId: number;
  queueName: string;
  gameCreation: number;
  gameDuration: number;
  championId: number;
  championName: string;
  championAvatar: string; // 英雄头像 URL（ddragon，由 main 的 heroData 算好）
  championSplashUrl?: string;
  champLevel: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  win: boolean;
  damage: number;
  cs: number;
  gold: number;
  items: PlayerItemSummary[];
  spells: PlayerSpellSummary[];
  flashKey: SummonerSpellSlot | null;
  primaryRune: PlayerRuneSummary | null;
  secondaryRune: PlayerRuneSummary | null;
  participants: MatchParticipantSummary[];
  tripleKills?: number;
  quadraKills?: number;
  pentaKills?: number;
  largestKillingSpree?: number; // ≥7 = 超神
}

// 召唤师资料（搜索结果顶部展示）
export interface PlayerRankSummary {
  queueType: string;
  queueName: string;
  tier: string;
  division: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  displayText: string;
}

export interface PlayerProfile {
  riotId: string;
  puuid: string;
  level: number;
  profileIconId: number;
  profileIconUrl: string;
  rank?: PlayerRankSummary | null;
  ranks?: PlayerRankSummary[];
  championCount?: number | null;
  skinCount?: number | null;
}

// 战绩汇总统计
export interface PlayerLookupSummary {
  wins: number;
  losses: number;
  averageKda: number;
  averageDamage: number;
  averageCs: number;
}

// 战绩查询请求
export interface PlayerLookupRequest {
  name: string; // 召唤师名或 Riot ID（名字#数字）；留空查自己
  maxMatches?: number; // 兼容旧调用：最多拉几场
  startIndex?: number; // SGP 分页起点（0 开始，翻页用）
  page?: number; // 兼容旧调用：页码
  pageSize?: number; // 兼容旧调用：每页场次
  region?: string; // 目标大区码（HN10/HN1/TJ100 等），不传用登录账号大区
  tag?: string; // 模式筛选（q_420 单排/q_450 大乱斗/q_2400 海克斯大乱斗 等），不传=全部
}

// 战绩查询结果
export interface PlayerLookupResult {
  profile: PlayerProfile;
  matches: PlayerMatchDetail[];
  summary: PlayerLookupSummary;
  totalMatches: number;
  error?: string; // 失败原因（玩家不存在/客户端未开/请求失败）
}

// match 域 API 契约
export interface MatchApi {
  search: (req: PlayerLookupRequest) => Promise<PlayerLookupResult>;
  // 返回英雄列表（给前端英雄选择器用）
  getChampions: () => Promise<ChampionSummary[]>;
}

// ============================================================================
// 高手扩散搜索（Scout）类型
// ============================================================================

// 雷达查询配置
export interface ScoutConfig {
  seedId: string; // 种子召唤师 Riot ID（名字#数字），留空=查自己
  championIds: number[]; // 指定英雄（达人必须用这些英雄达标）
  kdaThreshold: number; // KDA 达标阈值（默认 5.0）
  hoursWindow: number; // 时间窗（小时，默认 3），达标场须在此时间内
  targetCount: number; // 目标达标人数（默认 10）
  region?: string; // 大区码（不传=本区）
  tag?: string; // 模式筛选（q_420 等，不传=全部）
  topSeedsPerGame?: number; // 每场取综合分前 N 名当扩散种子（默认 2）
  excludePuuids?: string[]; // 继续搜索时排除已展示过的达标者
}

// 单个达标者（一个高手）
export interface ScoutHit {
  profile: PlayerProfile;
  qualifyingMatches: PlayerMatchDetail[]; // 该高手的达标场次（用指定英雄 + 时间窗内 + KDA 达标）
  totalChampionGames: number; // 该高手用指定英雄的总场次（统计参考）
}

// 进度推送（main → renderer，达标一个推一个）
export interface ScoutProgress {
  phase: 'seeding' | 'scanning' | 'done' | 'aborted' | 'error';
  checked: number; // 已检查候选数
  hits: number; // 已达标人数
  target: number; // 目标人数
  seedQueueRemaining: number; // 剩余待扩散种子数
  latestHit?: ScoutHit; // 最新达标者（前端立即渲染一张卡）
}

// 最终结果
export interface ScoutResult {
  hits: ScoutHit[];
  aborted: boolean; // 是否因上限保护/取消提前停止
  error?: string;
  stats: {
    totalRequests: number; // 总请求数
    totalSeeds: number; // 总扩散过的种子数
    totalCandidates: number; // 总候选数
    depth: number; // 实际扩散深度
  };
}

// scout 域 API 契约
// find 是长任务：onProgress 在每出一个达标者时被回调（增量渲染）。
// cancel 取消当前正在跑的任务（按 SCOUT_FIND 的 requestId 匹配）。
export interface ScoutApi {
  find: (
    config: ScoutConfig,
    onProgress?: (progress: ScoutProgress) => void,
  ) => Promise<ScoutResult>;
  cancel: () => Promise<void>;
}
