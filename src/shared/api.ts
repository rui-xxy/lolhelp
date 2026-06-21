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
export type DbApi = Record<string, never>;

// preload 暴露给 renderer 的总入口
// （与 contextBridge.exposeInMainWorld 的 key 'lolHelper' 对齐）
export interface LolHelper {
  app: AppApi;
  lcu: LcuApi;
  match: MatchApi;
  window: WindowApi;
  db: DbApi;
}

// window 域：窗口控制
export interface WindowApi {
  resize: (deltaWidth: number) => Promise<void>;
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
  championId: number;
  championName: string;
  championAvatar: string; // 英雄头像 URL（ddragon，由 main 的 heroData 算好）
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
export interface PlayerProfile {
  riotId: string;
  puuid: string;
  level: number;
  profileIconId: number;
  profileIconUrl: string;
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
}
