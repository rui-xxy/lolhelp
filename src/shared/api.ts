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
  sessionId?: string;
  error?: string;
}

// 单个好友信息（来自 lol-chat/v1/friends）
export interface FriendInfo {
  id: string;
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
  friendSince?: string | number | null;
  friendSinceTimestamp?: number | null;
  lastSeenOnlineTimestamp: number | null;
  product: string; // 当前在哪个产品（空=LOL 客户端大厅）
  lol?: {
    gameStatus?: string; // inGame / outOfGame / inQueue
    gameMode?: string; // CLASSIC / ARAM / TUTORIAL
    gameQueueType?: string; // RANKED_SOLO_5x5 等
    queueId?: number; // 当前队列 ID
    mapId?: number; // 当前地图 ID
    gameQueueName?: string; // 客户端队列目录中的正式模式名
    gameQueueRanked?: boolean; // 当前队列是否为排位
    championId?: number; // 当前英雄
    championSplashUrl?: string; // 当前英雄/皮肤背景
    championSplashUrls?: string[]; // 当前皮肤优先，默认原画兜底
    timeStamp?: string | number; // 游戏开始时间戳（LCU 好友状态）
    gameId?: number; // 当前对局 ID
    rankedLeagueTier?: string; // 段位
    level?: number; // 等级
  };
}

export interface FriendActionResult {
  success: boolean;
  message: string;
}

export interface FriendRequestInfo {
  id: string;
  puuid: string;
  gameName: string;
  gameTag: string;
  summonerId: number;
  icon: number;
  iconUrl?: string;
  iconUrls?: string[];
  direction: 'in' | 'out' | 'both';
  note: string;
}

export interface ChatMessage {
  id: string;
  body: string;
  type: string;
  timestamp: string;
  fromSelf: boolean;
  senderRiotId: string;
}

export interface ChatConversation {
  id: string;
  type: string;
  gameName: string;
  gameTag: string;
  riotId: string;
  puuid: string;
  ownerKey?: string;
  ownerRiotId?: string;
  ownerPuuid?: string;
  ownerGameName?: string;
  ownerGameTag?: string;
  ownerIcon?: number;
  ownerIconUrl?: string;
  ownerIconUrls?: string[];
  icon: number;
  iconUrl: string;
  iconUrls: string[];
  selfIcon?: number;
  selfIconUrl?: string;
  selfIconUrls?: string[];
  friendDeleted?: boolean;
  archivedOnly?: boolean;
  unreadMessageCount: number;
  lastMessage: string;
  lastMessageAt: string;
  messages: ChatMessage[];
}

export interface ChatAccountSummary {
  key: string;
  keys?: string[];
  riotId: string;
  gameName: string;
  gameTag: string;
  puuid: string;
  icon: number;
  iconUrl: string;
  iconUrls: string[];
  conversationCount: number;
  lastMessageAt: string;
  current?: boolean;
  unknown?: boolean;
}

export interface ChatConversationsResponse {
  conversations: ChatConversation[];
  accounts: ChatAccountSummary[];
  currentAccount?: ChatAccountSummary;
  selectedAccount?: ChatAccountSummary;
  selectedAccountKey: string;
  readOnly: boolean;
}

// 占位接口：后续阶段接入 LCU 时填充方法签名
export interface LcuApi {
  detectClient: () => Promise<LcuConnection>;
  getCurrentRegion: () => Promise<LcuRegion>;
  getFriends: (forceRefresh?: boolean) => Promise<FriendInfo[]>;
  getFriendRequests: () => Promise<FriendRequestInfo[]>;
  addFriend: (riotId: string) => Promise<FriendActionResult>;
  acceptFriendRequest: (puuid: string) => Promise<FriendActionResult>;
  deleteFriendRequest: (puuid: string) => Promise<FriendActionResult>;
  getChatConversations: (accountKey?: string) => Promise<ChatConversationsResponse>;
  sendChatMessage: (
    conversationId: string,
    body: string,
  ) => Promise<FriendActionResult>;
  spectateFriend: (puuid: string) => Promise<FriendActionResult>;
  deleteFriend: (friendId: string) => Promise<FriendActionResult>;
  // 自己的收藏：全部英雄与皮肤（标出拥有）、守卫、表情、头像、小小英雄、钱包
  getMyCollection: (force?: boolean) => Promise<MyCollection>;
}

// ============================================================================
// 我的收藏（只读自己：本地客户端）
// ============================================================================

export type CollectionRarity = 'none' | 'epic' | 'legendary' | 'mythic' | 'ultimate' | 'transcendent' | 'exalted';

export interface CollectionChroma {
  id: number;
  name: string;
  // 游戏数据里的色值（#rrggbb），画小色点用
  colors: string[];
  image: string;
  imageFallback: string;
  owned: boolean;
}

export interface CollectionSkin {
  id: number;
  championId: number;
  name: string;
  isBase: boolean;
  rarity: CollectionRarity;
  legacy: boolean;
  owned: boolean;
  acquiredAt?: number;
  // 竖版加载图 / 横版原画 / 小方图
  portrait: string;
  portraitFallback: string;
  splash: string;
  splashFallback: string;
  chromas: CollectionChroma[];
}

export interface CollectionChampion {
  id: number;
  name: string;
  title: string;
  avatar: string;
  owned: boolean;
  masteryLevel?: number;
  masteryPoints?: number;
  lastPlayed?: number;
}

export interface CollectionItem {
  id: number;
  name: string;
  image: string;
  imageFallback?: string;
  acquiredAt?: number;
}

export type CollectionShelf = 'wards' | 'emotes' | 'icons' | 'companions';

export interface CollectionWallet {
  rp?: number;
  blueEssence?: number;
  orangeEssence?: number;
  mythicEssence?: number;
  chests?: number;
  keys?: number;
  keyFragments?: number;
}

export interface MyCollection {
  puuid: string;
  riotId: string;
  fetchedAt: number;
  champions: CollectionChampion[];
  // 全部皮肤（含没有的），owned 标出拥有；炫彩挂在皮肤下面
  skins: CollectionSkin[];
  // 守卫 / 表情 / 头像 / 小小英雄：只列拥有的；total 是游戏里一共有多少（读不到时为 0）
  shelves: Record<CollectionShelf, { items: CollectionItem[]; total: number; ok: boolean }>;
  wallet: CollectionWallet;
  // 哪些部分没读到、为什么
  diagnostics: string[];
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
  // 对局辅助、自动化、快捷键与 Overlay 设置
  assist: AssistSettings;
  // 辅助功能使用的本地玩家黑名单
  blacklist: AssistBlacklistEntry[];
  // 手动指定的英雄联盟安装根目录（自动识别不到时由用户在设置里选择，持久化）
  gameInstallRoot?: string;
}

export type AssistRole = 'top' | 'jungle' | 'middle' | 'bottom' | 'utility';

export interface AssistChampionPreferences {
  normal: number[];
  aram: number[];
  arena: number[];
  byRole: Record<AssistRole, number[]>;
  bans: Record<AssistRole, number> & { arena: number };
  quickGameFirstPosition: string;
  quickGameSecondPosition: string;
}

export interface AssistHotkeys {
  mainWindow: string;
  matchOverlay: string;
  matchHelper: string;
  spellOverlay: string;
}

export interface AssistSettings {
  showRuneAssistant: boolean;
  showPowerTrend: boolean;
  globalHotkeysEnabled: boolean;
  showMatchOverlay: boolean;
  showSpellOverlay: boolean;

  autoAccept: boolean;
  autoAcceptDelayMs: number;
  autoPlayAgain: boolean;
  autoReturnLobby: boolean;
  autoHonorTeammates: boolean;
  autoHonorSummonerId: number;
  autoHonorSummonerName: string;

  showPositionMessage: boolean;
  blacklistAlert: boolean;
  blacklistAlertToClient: boolean;
  highWinRateAlert: boolean;

  autoChampionEnabled: boolean;
  champions: AssistChampionPreferences;

  autoWinRateItems: boolean;
  autoPickRateItems: boolean;
  sendItemsMessage: boolean;
  autoWinRateRunes: boolean;
  autoPickRateRunes: boolean;
  sendRunesMessage: boolean;

  playerTags: string[];
  powerTitles: string[];
  hotkeys: AssistHotkeys;

  preferredPresence: string;
  statusMessage: string;

  spoofRankEnabled: boolean;
  spoofRankQueue: string;
  spoofRankTier: string;
  spoofRankDivision: string;
  profileIconId: number;
  profileBackgroundChampionId: number;
  removeTokens: boolean;
  removePrestigeCrest: boolean;
}

export interface AssistBlacklistEntry {
  id: string;
  riotId: string;
  region: string;
  tags: string[];
  description: string;
  createdAt: number;
  updatedAt: number;
}

export type AssistRecommendationStrategy = 'winRate' | 'pickRate';

export interface AssistRecommendationRequest {
  championId?: number;
  queueId?: number;
  position?: string;
  strategy?: AssistRecommendationStrategy;
}

export interface AssistRuneRecommendation {
  name: string;
  primaryStyleId: number;
  subStyleId: number;
  selectedPerkIds: number[];
  play: number;
  winRate: number;
  pickRate: number;
}

export interface AssistAugmentRecommendation {
  id: number;
  name: string;
  icon: string;
  tier: number;
  performance: number;
  popularity: number;
}

export interface AssistItemBlock {
  title: string;
  itemIds: number[];
}

export interface AssistRecommendation {
  championId: number;
  queueId: number;
  position: string;
  mode: string;
  source: string;
  rune: AssistRuneRecommendation | null;
  items: AssistItemBlock[];
  augments: AssistAugmentRecommendation[];
}

export interface AssistChampionGuide {
  championId: number;
  name: string;
  title: string;
  stats: Array<{ label: string; base: number; perLevel?: number }>;
  passive?: {
    name: string;
    description: string;
    icon?: string;
  };
  spells: Array<{
    key: string;
    name: string;
    description: string;
    cooldown: string;
    cost: string;
    icon?: string;
  }>;
}

export interface AssistProfileIcon {
  id: number;
  title: string;
  icon: string;
}

// 某个英雄的皮肤（生涯背景用）。splash 是腾讯图床大图，splashFallback 是 CommunityDragon 备用图。
export interface AssistChampionSkin {
  id: number;
  championId: number;
  name: string;
  isBase: boolean;
  splash: string;
  splashFallback: string;
}

export interface AssistRuntimeStatus {
  connected: boolean;
  phase: string;
  queueId: number;
  championId: number;
  position: string;
  lastAction: string;
  lastError: string;
}

export interface AssistOperationResult {
  key: string;
  success: boolean;
  message: string;
}

export interface AssistChampionShard {
  lootId: string;
  championId: number;
  name: string;
  icon: string;
  count: number;
  value: number;
  disenchantValue: number;
}

export interface AssistLootSummary {
  championEssence: number;
  shards: AssistChampionShard[];
}

export interface AssistDisenchantRequest {
  lootId: string;
  count: number;
}

export interface AssistRewardItem {
  id: string;
  title: string;
}

export interface AssistRewardGrant {
  id: string;
  status: string;
  granteeId: string;
  rewardGroupId: string;
  title: string;
  rewards: AssistRewardItem[];
  disabled: boolean;
}

export interface AssistClaimRewardRequest {
  rewardId: string;
  rewardGroupId: string;
  selections: string[];
}

export interface AssistLiveSpell {
  id: number;
  name: string;
  icon: string;
  cooldown: number;
}

export interface AssistLivePlayer {
  riotId: string;
  championName: string;
  championId: number;
  championIcon: string;
  team: string;
  isLocalPlayer: boolean;
  isEnemy: boolean;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  items: number[];
  spellOne: AssistLiveSpell | null;
  spellTwo: AssistLiveSpell | null;
}

export interface AssistLiveData {
  active: boolean;
  gameTime: number;
  gameMode: string;
  players: AssistLivePlayer[];
  error?: string;
}

export interface AssistApi {
  getRecommendation: (
    request?: AssistRecommendationRequest,
  ) => Promise<AssistRecommendation>;
  applyRecommendation: (
    request?: AssistRecommendationRequest,
  ) => Promise<AssistOperationResult[]>;
  getChampionGuide: (championId?: number) => Promise<AssistChampionGuide>;
  getProfileIcons: () => Promise<AssistProfileIcon[]>;
  getChampionSkins: (championId: number) => Promise<AssistChampionSkin[]>;
  lockCurrentChampion: () => Promise<AssistOperationResult>;
  applyAccountSettings: () => Promise<AssistOperationResult[]>;
  getLoot: () => Promise<AssistLootSummary>;
  disenchantChampionShard: (
    request: AssistDisenchantRequest,
  ) => Promise<AssistOperationResult>;
  getRewards: () => Promise<AssistRewardGrant[]>;
  claimReward: (
    request: AssistClaimRewardRequest,
  ) => Promise<AssistOperationResult>;
  claimRewards: (
    requests: AssistClaimRewardRequest[],
  ) => Promise<AssistOperationResult[]>;
  getLiveData: () => Promise<AssistLiveData>;
  exportBlacklist: () => Promise<string | null>;
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
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
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
  // 保存时客户端登录的是哪个号（没登录时为空）。
  sourceAccount?: string;
}

// 方案详情：方案里存的全部设置，用来展示「这个方案存了什么」。
export interface LolConfigProfileDetail extends LolConfigProfileSummary {
  values: LolConfigValues;
}

// 一套设置拆成的几块，应用方案时可以只选其中几块。
export type LolConfigPart = 'video' | 'controls' | 'interface' | 'combat' | 'audio' | 'hotkeys' | 'client';

// 读取配置时客户端的状态：设置会应用到哪个号、现在能不能写。
export interface LolConfigClientState {
  connected: boolean;
  summonerName: string;
  phase: string;
}

export interface LolConfigState {
  rootPath: string;
  found: boolean;
  values: LolConfigValues;
  files: LolConfigFileStatus[];
  profiles: LolConfigProfileSummary[];
  warnings: string[];
  client?: LolConfigClientState;
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
  // 只应用这几块；不传就是全部。
  parts?: LolConfigPart[];
}

export interface LolConfigApi {
  read: (rootPath?: string) => Promise<LolConfigState>;
  detectRoots: () => Promise<string[]>;
  selectRoot: () => Promise<string | null>;
  applyValues: (req: LolConfigApplyValuesRequest) => Promise<LolConfigApplyResult>;
  saveProfile: (req: LolConfigSaveProfileRequest) => Promise<LolConfigProfileSummary[]>;
  applyProfile: (req: LolConfigApplyProfileRequest) => Promise<LolConfigApplyResult>;
  deleteProfile: (profileId: string) => Promise<LolConfigProfileSummary[]>;
  getProfile: (profileId: string) => Promise<LolConfigProfileDetail | null>;
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
  assist: AssistApi;
  ranking: RankingApi;
}

// ============================================================================
// 实时对局类型
// ============================================================================

// 单个玩家的实时对局数据（含最近战绩摘要）
export interface LiveMatchPerformanceStats {
  duration: number;
  championDamage: number;
  damageTaken: number;
  goldEarned: number;
  cs: number;
  turretDamage: number;
  visionScore: number;
  killParticipation: number;
  soloKills: number;
  enemyMissingPings: number;
  teamVisionPercentage: number;
  damageGoldEfficiency: number;
  teamDamagePercentage: number;
  relativeTeamDamage: number;
  relativeGlobalDamage: number;
  teamDamageTakenPercentage: number;
  relativeTeamDamageTaken: number;
  relativeGlobalDamageTaken: number;
  teamGoldPercentage: number;
  relativeTeamGold: number;
  relativeGlobalGold: number;
  csPerMinute: number;
  teamCsPercentage: number;
  relativeTeamCs: number;
  relativeGlobalCs: number;
  teamTurretDamagePercentage: number;
  relativeTeamTurretDamage: number;
  relativeGlobalTurretDamage: number;
}

export interface LiveBattlePlayer {
  puuid: string;
  summonerId: number;
  riotId: string;
  gameName: string;
  championId: number;
  championName: string;
  championAlias: string;
  teamId: number;
  premadeId?: string;
  summonerLevel?: number;
  profileIconId?: number;
  privacy?: string;
  position?: string;
  rank?: PlayerRankSummary | null;
  ranks?: PlayerRankSummary[];
  // 统计摘要（从最近 N 场算）
  kda: number;
  winRate: number;
  matchCount: number;
  loadState?: {
    history: 'idle' | 'loading' | 'loaded' | 'failed';
    rank: 'idle' | 'loading' | 'loaded' | 'failed';
  };
  history: {
    gameId?: number;
    teamId?: number;
    championId: number;
    championName: string;
    championAlias: string;
    queueName: string;
    kills: number;
    deaths: number;
    assists: number;
    win: boolean;
    timeStr: string; // 显示用（如 "3-29" 或 "5时"）
    performance?: LiveMatchPerformanceStats;
  }[];
}

// 完整实时对局信息
export interface LiveBattleInfo {
  inGame: boolean;
  phase: string; // ChampSelect / InProgress / GameStart / None
  queueName: string;
  mapName?: string;
  myPuuid?: string;
  myTeam: LiveBattlePlayer[];
  enemyTeam: LiveBattlePlayer[];
  error?: string;
  // 对局会话编号：每开始一局新的（或离开对局重置）就加一。
  // 前端据此判断手里的名单是不是上一局的，旧会话的数据一律丢弃。
  session?: number;
}

export interface LiveStateChangeEvent {
  phase: string;
  inGame: boolean;
  source: 'websocket' | 'poll';
  uri?: string;
  at: number;
}

export type LiveBattleUpdateEvent = (
  | { type: 'player'; side: 'my' | 'enemy'; puuid: string; player: LiveBattlePlayer }
  | { type: 'removed'; puuid: string }
  | { type: 'reset' }
) & { session?: number };

// live 域 API 契约
export interface LiveApi {
  getBattle: () => Promise<LiveBattleInfo>;
  getMatchDetail: (gameId: number, puuid: string) => Promise<PlayerMatchDetail | null>;
  onStateChanged: (listener: (event: LiveStateChangeEvent) => void) => () => void;
  onBattleUpdate: (listener: (event: LiveBattleUpdateEvent) => void) => () => void;
}

// window 域：窗口控制
export interface WindowChromeColors {
  color: string; // 顶栏 / 窗口底色，#RRGGBB
  symbolColor: string; // 右上角最小化/关闭按钮的图标颜色，#RRGGBB
}

export interface WindowApi {
  setWidth: (width: number) => Promise<void>;
  setChrome: (chrome: WindowChromeColors) => Promise<void>;
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
  kind?: 'rune' | 'augment';
  rarity?: string;
}

export interface MatchParticipantStats {
  totalDamageDealtToChampions: number;
  physicalDamageDealtToChampions: number;
  magicDamageDealtToChampions: number;
  trueDamageDealtToChampions: number;
  totalDamageDealt: number;
  physicalDamageDealt: number;
  magicDamageDealt: number;
  trueDamageDealt: number;
  totalDamageTaken: number;
  physicalDamageTaken: number;
  magicDamageTaken: number;
  trueDamageTaken: number;
  damageSelfMitigated: number;
  totalHeal: number;
  totalHealsOnTeammates: number;
  totalDamageShieldedOnTeammates: number;
  goldEarned: number;
  goldSpent: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  visionScore: number;
  wardsPlaced: number;
  wardsKilled: number;
  detectorWardsPlaced: number;
  timeCCingOthers: number;
  largestCriticalStrike: number;
  largestMultiKill: number;
  largestKillingSpree: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
}

// 单个玩家在对局中的完整数据（10 人各一行）
export interface MatchParticipantSummary {
  participantId?: number;
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
  runes: PlayerRuneSummary[];
  augments: PlayerRuneSummary[];
  stats: MatchParticipantStats;
  rawStats?: Record<string, number | string | boolean>;
  visionScore?: number;
  largestMultiKill?: number;
  largestKillingSpree?: number; // 最大连杀（≥7 = 超神）
  tripleKills?: number;
  quadraKills?: number;
  pentaKills?: number;
  rank?: PlayerRankSummary | null;
  ranks?: PlayerRankSummary[];
  teamDamagePercentage?: number; // 伤害占团队比例（0~1，MVP 综合分用）
}

// 单场对局完整详情（含 10 人 participants）
export interface PlayerMatchDetail {
  gameId: number;
  queueId: number;
  queueName: string;
  gameCreation: number;
  gameDuration: number;
  gameVersion?: string;
  gameType?: string;
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
  runes: PlayerRuneSummary[];
  augments: PlayerRuneSummary[];
  stats: MatchParticipantStats;
  participants: MatchParticipantSummary[];
  tripleKills?: number;
  quadraKills?: number;
  pentaKills?: number;
  largestKillingSpree?: number; // ≥7 = 超神
}

export interface MatchTimelinePosition {
  x: number;
  y: number;
}

export interface MatchTimelineParticipantFrame {
  participantId: number;
  totalGold: number;
  currentGold: number;
  level: number;
  xp: number;
  minionsKilled: number;
  jungleMinionsKilled: number;
  position?: MatchTimelinePosition;
  damageStats?: Record<string, number>;
  championStats?: Record<string, number>;
}

export interface MatchTimelineDamageRecord {
  participantId?: number;
  name?: string;
  type?: string;
  damage?: number;
  physicalDamage?: number;
  magicDamage?: number;
  trueDamage?: number;
  basic?: boolean;
  spellName?: string;
  spellSlot?: number;
}

export interface MatchTimelineEvent {
  type: string;
  timestamp: number;
  participantId?: number;
  killerId?: number;
  victimId?: number;
  assistingParticipantIds?: number[];
  itemId?: number;
  itemName?: string;
  itemIcon?: string;
  skillSlot?: number;
  levelUpType?: string;
  wardType?: string;
  monsterType?: string;
  monsterSubType?: string;
  buildingType?: string;
  laneType?: string;
  teamId?: number;
  creatorId?: number;
  beforeId?: number;
  afterId?: number;
  bounty?: number;
  shutdownBounty?: number;
  winningTeam?: number;
  multiKillLength?: number;
  killType?: string;
  victimDamageReceived?: MatchTimelineDamageRecord[];
  victimDamageDealt?: MatchTimelineDamageRecord[];
  position?: MatchTimelinePosition;
}

export interface MatchTimelineFrame {
  timestamp: number;
  participantFrames: Record<string, MatchTimelineParticipantFrame>;
  events: MatchTimelineEvent[];
}

export interface MatchTimeline {
  frameInterval: number;
  frames: MatchTimelineFrame[];
}

export interface MatchTimelineResult {
  available: boolean;
  timeline: MatchTimeline | null;
  error?: string;
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
  previousSeasonEndTier?: string;
  previousSeasonHighestTier?: string;
  highestTier?: string;
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

// 战绩速览（高手雷达点卡片时用）：只请求一次 SGP 列表，只回传列表要显示的字段，
// 不带装备、符文、伤害等明细，常一起玩的队友也在主进程算好。
export interface PlayerMatchBriefRequest {
  puuid: string;
  region?: string;
  count?: number; // 默认 20，最多 40
}

export interface PlayerMatchBriefMate {
  puuid: string;
  riotId: string;
  profileIconId: number;
  profileIconUrl: string;
  count: number; // 同队出现的场数（≥2 才算常一起玩）
}

export interface PlayerMatchBrief {
  gameId: number;
  queueId: number;
  queueName: string;
  gameCreation: number;
  gameDuration: number;
  championId: number;
  championName: string;
  championAvatar: string;
  championSplashUrl?: string;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  win: boolean;
  mates: string[]; // 本局同队里「常一起玩」的人（puuid，对应 PlayerMatchBriefResult.mates）
}

export interface PlayerMatchBriefResult {
  puuid: string;
  matches: PlayerMatchBrief[];
  mates: PlayerMatchBriefMate[];
  error?: string;
}

// 战绩查询结果
export interface PlayerLookupResult {
  profile: PlayerProfile;
  matches: PlayerMatchDetail[];
  summary: PlayerLookupSummary;
  totalMatches: number;
  error?: string; // 失败原因（玩家不存在/客户端未开/请求失败）
}

export interface SavedMatchGroup {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface SavedMatchAccount {
  id: string;
  region: string;
  regionName?: string;
  profile: PlayerProfile;
  matches: PlayerMatchDetail[];
  groupId?: string;
  follow?: SavedMatchFollowSettings;
  createdAt: number;
  updatedAt: number;
}

export interface SavedMatchFollowSettings {
  enabled: boolean;
  startedAt: number;
  updatedAt: number;
  lastCheckedAt?: number;
  lastNotifiedGameId?: number;
  lastError?: string;
}

export interface SavedMatchFollowAlert {
  id: string;
  accountId: string;
  riotId: string;
  region: string;
  regionName?: string;
  profileIconId?: number;
  profileIconUrl?: string;
  match: PlayerMatchDetail;
  detectedAt: number;
  notifiedAt?: number;
}

export interface SavedMatchesState {
  accounts: SavedMatchAccount[];
  groups: SavedMatchGroup[];
  followAlerts?: SavedMatchFollowAlert[];
}

/** Small, frequently-read projection that avoids cloning the complete match archive over IPC. */
export interface SavedMatchesSummary {
  followAlertIds: string[];
}

/** Match fields needed by saved/follow dialogs; excludes participant and item payloads. */
export interface SavedMatchPreview {
  gameId: number;
  queueId: number;
  queueName: string;
  gameCreation: number;
  gameDuration: number;
  championId: number;
  championName: string;
  championAvatar: string;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  win: boolean;
  damage: number;
  cs: number;
}

export interface SavedMatchAccountCatalogEntry extends Omit<SavedMatchAccount, 'matches'> {
  matches: SavedMatchPreview[];
}

export interface SavedMatchFollowAlertPreview extends Omit<SavedMatchFollowAlert, 'match'> {
  match: SavedMatchPreview;
}

export interface SavedMatchesCatalog {
  accounts: SavedMatchAccountCatalogEntry[];
  groups: SavedMatchGroup[];
  followAlerts: SavedMatchFollowAlertPreview[];
}

export interface SavedMatchSaveResult {
  accountId: string;
}

export interface ReplayActionResult {
  success: boolean;
  message: string;
}

export interface ReplayAvailability {
  available: boolean;
  state: string;
  downloadProgress: number;
  message: string;
}

export interface ReplayAvailabilityRequest {
  gameId: number;
  queueId: number;
  gameCreation: number;
  gameDuration: number;
  gameVersion?: string;
  gameType?: string;
}

// ============================================================================
// 玩家档案：战绩之外能查到的一切（任意玩家）
// 来源：SGP challenges-client（收藏数 / 挑战等级 / 展示徽章）、SGP summoner-ledge（等级经验 / 最后游戏时间 / 隐私）、
//      LCU summoner-profile（生涯背景皮肤）。每一项都可能缺失（国服接口不稳定或对方隐藏），前端按有就显示处理。
// ============================================================================

export interface PlayerChallengeLevel {
  /** IRON … CHALLENGER；NONE 表示还没有等级。 */
  level: string;
  current: number;
  max: number;
  /** 全服百分位，0.021 = 前 2.1%；没有时为 null。 */
  percentile: number | null;
}

export interface PlayerChallengeCategory extends PlayerChallengeLevel {
  /** IMAGINATION / EXPERTISE / TEAMWORK / VETERANCY / COLLECTION */
  key: string;
  label: string;
}

export interface PlayerChallengeToken {
  id: number;
  name: string;
  description: string;
  level: string;
  iconUrl: string;
}

export interface PlayerCollectionCounts {
  champions: number | null;
  skins: number | null;
  chromas: number | null;
  icons: number | null;
  emotes: number | null;
  wards: number | null;
}

export interface PlayerDossier {
  puuid: string;
  level: number | null;
  expPoints: number | null;
  expToNextLevel: number | null;
  /** 最后一局游戏的时间（毫秒）。 */
  lastGameDate: number | null;
  /** PUBLIC / PRIVATE */
  privacy: string | null;
  /** 生涯背景皮肤 id（英雄 id × 1000 + 皮肤序号）。 */
  backgroundSkinId: number | null;
  collection: PlayerCollectionCounts;
  challengePoints: PlayerChallengeLevel | null;
  categories: PlayerChallengeCategory[];
  /** 玩家在生涯页展示的挑战徽章（最多 3 个）。 */
  tokens: PlayerChallengeToken[];
  error?: string;
  /** 哪些来源没拿到、为什么（只用于悬停提示和排查）。 */
  diagnostics?: string[];
}

export interface PlayerActiveGamePlayer {
  puuid: string;
  riotId: string;
  championId: number;
  profileIconId: number;
  /** 100 蓝方 / 200 红方；不知道时为 0。 */
  teamId: number;
}

/** 当前对局（观战接口）。不在游戏中时 inGame = false。 */
export interface PlayerActiveGame {
  inGame: boolean;
  gameId?: number;
  queueId?: number;
  queueName?: string;
  gameMode?: string;
  /** 开局时间（毫秒）；还在读条时没有。 */
  startTime?: number;
  championId?: number;
  teamId?: number;
  players: PlayerActiveGamePlayer[];
  error?: string;
}

// match 域 API 契约
export interface MatchApi {
  search: (req: PlayerLookupRequest) => Promise<PlayerLookupResult>;
  getMatchBriefs: (req: PlayerMatchBriefRequest) => Promise<PlayerMatchBriefResult>;
  getPlayerRanks: (puuid: string, region?: string) => Promise<PlayerRankSummary[]>;
  getPlayerDossier: (puuid: string, region?: string) => Promise<PlayerDossier>;
  getActiveGame: (puuid: string) => Promise<PlayerActiveGame>;
  getSavedMatchesSummary: () => Promise<SavedMatchesSummary>;
  getSavedMatchesCatalog: () => Promise<SavedMatchesCatalog>;
  getSavedMatchAccount: (accountId: string) => Promise<SavedMatchAccount | null>;
  importSavedMatches: (state: SavedMatchesState) => Promise<SavedMatchesState>;
  saveMatchesForProfile: (
    profile: PlayerProfile,
    region: string,
    matches: PlayerMatchDetail[],
    regionName?: string,
  ) => Promise<SavedMatchSaveResult>;
  createSavedMatchGroup: (name: string) => Promise<SavedMatchesCatalog>;
  deleteSavedMatchGroup: (groupId: string) => Promise<SavedMatchesCatalog>;
  setSavedMatchAccountGroup: (accountId: string, groupId?: string) => Promise<SavedMatchesCatalog>;
  setSavedMatchAccountFollow: (accountId: string, enabled: boolean) => Promise<SavedMatchesCatalog>;
  deleteSavedMatchAccount: (accountId: string) => Promise<SavedMatchesCatalog>;
  deleteSavedMatch: (accountId: string, gameId: number) => Promise<SavedMatchesCatalog>;
  getReplayAvailability: (request: ReplayAvailabilityRequest) => Promise<ReplayAvailability>;
  downloadReplay: (gameId: number) => Promise<ReplayActionResult>;
  watchReplay: (gameId: number) => Promise<ReplayActionResult>;
  getTimeline: (gameId: number, region?: string) => Promise<MatchTimelineResult>;
  // 返回英雄列表（给前端英雄选择器用）
  getChampions: () => Promise<ChampionSummary[]>;
}

// ============================================================================
// 英雄排行
// ============================================================================

export type ChampionRankingMode = 'ranked' | 'aram' | 'arena' | 'hextech';
export type ChampionRankingRegion = 'global' | 'na' | 'kr' | 'jp' | 'tw';
export type ChampionRankingPosition = 'ALL' | 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT';

export interface ChampionRankingRequest {
  mode: ChampionRankingMode;
  region?: ChampionRankingRegion;
  tier?: string;
  position?: ChampionRankingPosition;
  refresh?: boolean;
}

export interface ChampionCounterSummary {
  champion: ChampionSummary;
  games: number;
  winRate: number;
}

export interface ChampionRankingEntry {
  champion: ChampionSummary;
  rank: number;
  previousRank: number | null;
  tier: number;
  winRate: number;
  pickRate: number;
  banRate: number | null;
  kda: number | null;
  games: number;
  firstPlaceRate: number | null;
  // 这个英雄的对局里有多少比例是走当前位置（仅峡谷分位置时有值）
  roleRate: number | null;
  // 主玩位置（峡谷「全部位置」时用来拉详情）
  mainPosition: ChampionRankingPosition | null;
  counters: ChampionCounterSummary[];
}

export interface ChampionRankingResult {
  entries: ChampionRankingEntry[];
  meta: {
    mode: ChampionRankingMode;
    version: string;
    analyzedAt: string;
    matchCount: number | null;
    source: string;
  };
  error?: string;
}

// ----------------------------------------------------------------------------
// 英雄详情（峡谷 / 极地 / 斗魂）：选中英雄后按需拉取的「档案」
// ----------------------------------------------------------------------------

export interface ChampionDetailRequest {
  mode: Exclude<ChampionRankingMode, 'hextech'>;
  championId: number;
  region?: ChampionRankingRegion;
  tier?: string;
  position?: ChampionRankingPosition;
}

export interface ChampionDetailItem {
  id: number;
  name: string;
  icon: string;
}

export interface ChampionDetailBuild {
  items: ChampionDetailItem[];
  games: number;
  winRate: number;
  pickRate: number;
}

export interface ChampionDetailRunePage {
  keystone: ChampionDetailItem | null;
  primary: ChampionDetailItem[];
  secondary: ChampionDetailItem[];
  primaryStyle: ChampionDetailItem | null;
  secondaryStyle: ChampionDetailItem | null;
  games: number;
  winRate: number;
  pickRate: number;
}

export interface ChampionDetailSkillOrder {
  priority: string[];
  order: string[];
  winRate: number;
  pickRate: number;
}

export interface ChampionDetailTrendPoint {
  version: string;
  winRate: number;
  pickRate: number | null;
  banRate: number | null;
  rank: number | null;
}

export interface ChampionDetailGameLength {
  minute: number;
  winRate: number;
}

export interface ChampionDetail {
  championId: number;
  mode: ChampionDetailRequest['mode'];
  position: ChampionRankingPosition;
  spells: ChampionDetailBuild[];
  starters: ChampionDetailBuild[];
  boots: ChampionDetailBuild[];
  core: ChampionDetailBuild[];
  runes: ChampionDetailRunePage[];
  skills: ChampionDetailSkillOrder[];
  trend: ChampionDetailTrendPoint[];
  gameLengths: ChampionDetailGameLength[];
  toughMatchups: ChampionCounterSummary[];
  easyMatchups: ChampionCounterSummary[];
}

export interface ChampionDetailResult {
  detail: ChampionDetail | null;
  error?: string;
}

// ----------------------------------------------------------------------------
// 海克斯大乱斗（数据源：arammayhem.com，失败时用本机上次成功的缓存）
// ----------------------------------------------------------------------------

export type MayhemChampionRole = 'assassin' | 'fighter' | 'mage' | 'marksman' | 'support' | 'tank';
export type MayhemChampionTier = 'S+' | 'S' | 'A' | 'B' | 'C' | 'D';
export type MayhemAugmentRarity = 'prismatic' | 'gold' | 'silver';
export type MayhemItemGroupKey = 'starting' | 'boots' | 'core' | 'late';
// live = 刚从数据源拿到；cache = 数据源不可用，展示本机上次成功的结果。
export type MayhemDataOrigin = 'live' | 'cache';

export interface MayhemSourceMeta {
  source: string;
  origin: MayhemDataOrigin;
  // 本机拿到这份数据的时间（ISO）
  fetchedAt: string;
}

export interface MayhemChampionEntry {
  id: number;
  slug: string;
  name: string;
  // 英雄真名（如「盖伦」），name 是称号（如「德玛西亚之力」）
  title: string;
  alias: string;
  image: string;
  rank: number;
  tier: MayhemChampionTier;
  roles: MayhemChampionRole[];
  winRate: number;
  pickRate: number | null;
  trend: number | null;
}

export interface MayhemTierListResult {
  entries: MayhemChampionEntry[];
  meta: MayhemSourceMeta & {
    patch: string;
    updatedAt: string;
  };
  error?: string;
}

export type MayhemAugmentAvailability = 'live' | 'removed';

export interface MayhemAugmentChampionRef {
  id: number;
  slug: string;
  name: string;
  icon: string;
}

export interface MayhemAugmentRankingEntry {
  slug: string;
  name: string;
  icon: string;
  rarity: MayhemAugmentRarity;
  availability: MayhemAugmentAvailability;
  rank: number;
  allRank: number;
  // 强度等级（S+ / S / S- / A+ …），数据源不再提供强化胜率后以它为主
  tier: string | null;
  winRate: number | null;
  pickRate: number | null;
  isNew: boolean;
  effect: string;
  topChampions: MayhemAugmentChampionRef[];
}

export interface MayhemAugmentRankingResult {
  entries: MayhemAugmentRankingEntry[];
  meta: MayhemSourceMeta & {
    patch: string;
    updatedAt: string;
    activeCount: number;
    removedCount: number;
    rarityCounts: Record<MayhemAugmentRarity, number>;
  };
  error?: string;
}

export interface MayhemAugmentHistoryPoint {
  date: string;
  patch: string;
  rank: number | null;
  tier: string;
  pickRate: number | null;
}

export interface MayhemAugmentChampionFit {
  slug: string;
  name: string;
  icon: string;
  tier: string;
  rank: number | null;
  pickRate: number | null;
  highlight: boolean;
}

export interface MayhemAugmentDetail {
  slug: string;
  name: string;
  icon: string;
  rarity: MayhemAugmentRarity | null;
  tier: string;
  rank: number | null;
  pickRate: number | null;
  pickDelta: number | null;
  patch: string;
  effect: string;
  guide: Array<{ title: string; text: string }>;
  history: MayhemAugmentHistoryPoint[];
  champions: MayhemAugmentChampionFit[];
  sourceUrl: string;
}

export interface MayhemAugmentDetailResult {
  detail: MayhemAugmentDetail | null;
  origin?: MayhemDataOrigin;
  error?: string;
}

export type MayhemComboTier = 'S+' | 'S' | 'A' | 'B' | 'C';

export interface MayhemComboEntry {
  id: string;
  slug: string;
  rank: number;
  tier: MayhemComboTier;
  types: string[];
  description: string;
  votes: number;
  rankScore: number;
  curated: boolean;
  champion: {
    id: number;
    slug: string;
    name: string;
    icon: string;
  };
  augment: {
    slug: string;
    name: string;
    icon: string;
  };
  sourceUrl: string;
}

export interface MayhemComboResult {
  entries: MayhemComboEntry[];
  meta: MayhemSourceMeta & {
    totalCount: number;
    championCount: number;
    featuredCount: number;
    pageSize: number;
    pageCount: number;
    typeLabels: Record<string, string>;
  };
  error?: string;
}

export interface MayhemBalanceModifier {
  direction: 'up' | 'down' | 'neutral';
  label: string;
  value: string;
}

export interface MayhemBuildItem {
  name: string;
  icon: string;
}

export interface MayhemItemBuildOption {
  items: MayhemBuildItem[];
  pickRate: number;
  winRate: number;
}

export interface MayhemSkillSequence {
  sequence: string;
  pickRate: number;
  winRate: number;
}

export interface MayhemSkillOrder {
  priority: string;
  pickRate: number;
  winRate: number;
  sequences: MayhemSkillSequence[];
}

export interface MayhemAugmentRecommendation {
  slug: string;
  name: string;
  rarity: MayhemAugmentRarity;
  icon: string;
  // 在该英雄同品质强化里的等级与名次（如 S · #4）
  tier: string;
  rarityRank: number | null;
  // 在全部强化总榜里的等级与名次（如 总榜 S- · #15）
  overallTier: string;
  overallRank: number | null;
  // 该英雄选择它的频率
  pickRate: number | null;
  winRate: number | null;
  effect: string;
}

export interface MayhemPartner {
  slug: string;
  name: string;
  icon: string;
  winRate: number;
  pickRate: number;
}

export interface MayhemBuildCombo {
  slug: string;
  title: string;
  tier: string;
  types: string[];
  description: string;
  augments: MayhemBuildItem[];
  sourceUrl: string;
}

export interface MayhemChampionBuild {
  slug: string;
  id: number;
  name: string;
  alias: string;
  title: string;
  image: string;
  tier: MayhemChampionTier;
  rank: number | null;
  trend: number | null;
  roles: string[];
  winRate: number;
  pickRate: number;
  patch: string;
  updatedAt: string;
  summary: string;
  balance: MayhemBalanceModifier[];
  skillOrders: MayhemSkillOrder[];
  itemGroups: Record<MayhemItemGroupKey, MayhemItemBuildOption[]>;
  augments: MayhemAugmentRecommendation[];
  combos: MayhemBuildCombo[];
  partners: MayhemPartner[];
  sourceUrl: string;
}

export interface MayhemChampionBuildResult {
  build: MayhemChampionBuild | null;
  origin?: MayhemDataOrigin;
  error?: string;
}

export interface RankingApi {
  getChampions: (request: ChampionRankingRequest) => Promise<ChampionRankingResult>;
  getChampionDetail: (request: ChampionDetailRequest) => Promise<ChampionDetailResult>;
  getMayhemTierList: (refresh?: boolean) => Promise<MayhemTierListResult>;
  getMayhemBuild: (slug: string, refresh?: boolean) => Promise<MayhemChampionBuildResult>;
  getMayhemAugmentRanking: (refresh?: boolean) => Promise<MayhemAugmentRankingResult>;
  getMayhemAugmentDetail: (slug: string, refresh?: boolean) => Promise<MayhemAugmentDetailResult>;
  getMayhemCombos: (refresh?: boolean) => Promise<MayhemComboResult>;
  // 打开数据源网页（只允许数据源白名单域名）
  openSource: (url: string) => Promise<boolean>;
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
  region?: string; // 大区码（不传则使用已读取到的大区）
  tag?: string; // 模式筛选（q_420 等，不传=全部）
  topSeedsPerGame?: number; // 每场取综合分前 N 名当扩散种子（默认 2）
  excludePuuids?: string[]; // 继续搜索时排除已展示过的达标者
}

export interface ScoutDuoSignal {
  partnerPuuid: string;
  partnerRiotId: string;
  gamesTogether: number;
  checkedMatches: number;
  evidence: 'premade' | 'recurring';
  fixed: boolean;
  partySize: number;
}

export interface ScoutBehaviorShiftSignal {
  confidence: 'medium' | 'high';
  reasons: string[];
  recentMatches: number;
  baselineMatches: number;
}

export interface ScoutSignals {
  duo?: ScoutDuoSignal;
  behaviorShift?: ScoutBehaviorShiftSignal;
}

// 单个达标者（一个高手）
export interface ScoutHit {
  profile: PlayerProfile;
  qualifyingMatches: PlayerMatchDetail[]; // 该高手的达标场次（用指定英雄 + 时间窗内 + KDA 达标）
  totalChampionGames: number; // 该高手用指定英雄的总场次（统计参考）
  signals?: ScoutSignals;
}

export type ScoutPlayerState = 'queued' | 'checking' | 'checked' | 'matched' | 'failed';

// 单个真实候选玩家的搜索状态。前端用它绘制搜索关系网络，不生成虚假节点。
export interface ScoutPlayerEvent {
  puuid: string;
  parentPuuid?: string;
  depth: number;
  source: 'seed' | 'candidate';
  state: ScoutPlayerState;
  profile?: PlayerProfile;
  recentChampionId?: number;
  recentChampionName?: string;
  recentChampionAvatar?: string;
  recentKda?: number;
  recentKills?: number;
  recentDeaths?: number;
  recentAssists?: number;
  checkedMatches?: number;
  qualifyingMatches?: number;
}

// 进度推送（main → renderer，达标一个推一个）
export interface ScoutProgress {
  phase: 'seeding' | 'scanning' | 'done' | 'aborted' | 'error';
  checked: number; // 已检查候选数
  hits: number; // 已达标人数
  target: number; // 目标人数
  seedQueueRemaining: number; // 剩余待扩散种子数
  latestHit?: ScoutHit; // 最新达标者（前端立即渲染一张卡）
  latestPlayer?: ScoutPlayerEvent; // 最新候选状态（前端实时绘制搜索动画）
  playerEvents?: ScoutPlayerEvent[]; // 同一轮发现的候选批量推送，减少高密度 IPC 刷新
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
