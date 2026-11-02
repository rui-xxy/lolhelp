import type {
  LolClientConfigValues,
  LolConfigPart,
  LolConfigValues,
  LolGameConfigValues,
  LolHotkeyValues,
} from '../../../shared/api';

// 游戏设置的选项、名字和显示方式。设置页和「方案里存了什么」共用这一份。

export type Option<T extends string | number> = { value: T; label: string };

export const WINDOW_MODES: Option<string>[] = [
  { value: '0', label: '全屏' },
  { value: '2', label: '无边框' },
  { value: '1', label: '窗口' },
];

export const RESOLUTION_PRESETS: Array<[number, number]> = [
  [1280, 720],
  [1600, 900],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
];

export const QUALITY_OPTIONS: Option<number>[] = [
  { value: 0, label: '低' },
  { value: 1, label: '中低' },
  { value: 2, label: '中' },
  { value: 3, label: '高' },
  { value: 4, label: '极高' },
];

export const FRAME_CAP_OPTIONS: Option<number>[] = [
  { value: 0, label: '不限制' },
  { value: 1, label: '跟显示器刷新率' },
  { value: 2, label: '144 帧' },
  { value: 3, label: '120 帧' },
  { value: 4, label: '60 帧' },
  { value: 5, label: '30 帧' },
];

export const CAMERA_LOCK_OPTIONS: Option<number>[] = [
  { value: 0, label: '按红蓝方偏移' },
  { value: 1, label: '固定偏移' },
  { value: 2, label: '不偏移' },
];

export const SUMMONER_NAME_OPTIONS: Option<number>[] = [
  { value: 0, label: '不显示' },
  { value: 1, label: '玩家名称' },
  { value: 2, label: '英雄名称' },
];

export const COOLDOWN_FORMAT_OPTIONS: Option<number>[] = [
  { value: 0, label: '不显示' },
  { value: 1, label: '秒' },
  { value: 2, label: '分 + 秒' },
];

export const VOICE_INPUT_OPTIONS: Option<string>[] = [
  { value: 'voiceActivity', label: '有声音就发' },
  { value: 'pushToTalk', label: '按住说话' },
];

// 这几个阶段改游戏配置容易出问题，主进程也会拒绝写入。
export const CONFIG_BLOCKED_PHASES: Record<string, string> = {
  ChampSelect: '正在选英雄',
  GameStart: '游戏正在启动',
  InProgress: '正在对局',
  Reconnect: '正在重连对局',
};

export const CLIENT_PHASE_LABELS: Record<string, string> = {
  None: '在主页',
  Lobby: '在房间',
  Matchmaking: '排队中',
  ReadyCheck: '确认对局',
  EndOfGame: '在结算',
  PreEndOfGame: '在结算',
  WaitingForStats: '在结算',
  ...CONFIG_BLOCKED_PHASES,
};

type Formatter<T> = (value: unknown, all: T) => string;

const onOff = (value: unknown) => (value ? '开' : '关');
const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(Math.round(parsed)) : '-';
};
const pick = <T extends string | number>(options: Option<T>[]) => (value: unknown) =>
  options.find((option) => String(option.value) === String(value))?.label ?? String(value ?? '-');
const volume = (muteKey: keyof LolGameConfigValues): Formatter<LolGameConfigValues> => (value, all) =>
  (all[muteKey] ? '静音' : number(value));

export interface FieldMeta<T> {
  label: string;
  format: Formatter<T>;
  // 方案摘要里不单独列出来（例如静音已经并进音量里）。
  hidden?: boolean;
}

// 名字和设置页上那一行完全一样：设置页直接用这里的 label，方案详情也用这里的 label。
export const GAME_FIELDS: Record<keyof LolGameConfigValues, FieldMeta<LolGameConfigValues>> = {
  windowMode: { label: '窗口模式', format: pick(WINDOW_MODES) },
  width: { label: '分辨率', format: (_value, all) => `${all.width} × ${all.height}` },
  height: { label: '分辨率高', format: number, hidden: true },
  frameCapType: { label: '帧率上限', format: pick(FRAME_CAP_OPTIONS) },
  waitForVerticalSync: { label: '垂直同步', format: onOff },
  enableFxaa: { label: '抗锯齿', format: onOff },
  shadowQuality: { label: '阴影', format: pick(QUALITY_OPTIONS) },
  characterQuality: { label: '角色', format: pick(QUALITY_OPTIONS) },
  effectsQuality: { label: '特效', format: pick(QUALITY_OPTIONS) },
  environmentQuality: { label: '环境', format: pick(QUALITY_OPTIONS) },

  gameMouseSpeed: { label: '鼠标速度', format: number },
  mapScrollSpeed: { label: '镜头速度（鼠标）', format: number },
  keyboardScrollSpeed: { label: '镜头速度（键盘）', format: number },
  cameraLockMode: { label: '镜头锁定时', format: pick(CAMERA_LOCK_OPTIONS) },
  snapCameraOnRespawn: { label: '复活时镜头回到英雄', format: onOff },
  scrollSmoothingEnabled: { label: '镜头平滑', format: onOff },
  middleClickDragScrollEnabled: { label: '按住鼠标拖动镜头', format: onOff },
  autoAcquireTarget: { label: '自动攻击', format: onOff },
  predictMovement: { label: '移动预测', format: onOff },
  enableTargetedAttackMove: { label: '攻击移动以鼠标指针为准', format: onOff },
  targetChampionsOnlyAsToggle: { label: '「只打英雄」按一下切换', format: onOff },
  disableHudSpellClick: { label: '只能用热键放技能', format: onOff },
  showTurretRangeIndicators: { label: '显示防御塔射程', format: onOff },
  recommendJunglePaths: { label: '显示推荐打野路线', format: onOff },

  globalScale: { label: '界面缩放', format: number },
  minimapScale: { label: '小地图', format: number },
  chatScale: { label: '聊天框', format: number },
  cursorScale: { label: '鼠标指针', format: number },
  showSummonerNames: { label: '血条上方显示', format: pick(SUMMONER_NAME_OPTIONS) },
  numericCooldownFormat: { label: '冷却时间显示', format: pick(COOLDOWN_FORMAT_OPTIONS) },
  showFpsAndLatency: { label: '显示帧数和延迟', format: onOff },
  enableHudAnimations: { label: '界面动画', format: onOff },
  hidePlayerNames: { label: '隐藏玩家名字', format: onOff },
  showTimestamps: { label: '显示时间', format: onOff },
  showAlliedChat: { label: '显示队友聊天', format: onOff },
  showAllChannelChat: { label: '显示所有人聊天', format: onOff },
  showPlayerStats: { label: '显示玩家数据', format: onOff, hidden: true },

  showAttackRadius: { label: '显示攻击距离', format: onOff },
  autoDisplayTarget: { label: '攻击时显示目标信息', format: onOff },
  enableLineMissileVis: { label: '线状弹道', format: onOff },
  showSpellCosts: { label: '显示技能消耗', format: onOff },
  showSpellRecommendations: { label: '推荐技能加点', format: onOff },
  showNeutralCamps: { label: '野怪营地计时', format: onOff },
  flashScreenWhenDamaged: { label: '受伤时屏幕闪烁', format: onOff },
  flashScreenWhenStunned: { label: '被控时屏幕闪烁', format: onOff },
  showOffScreenPointsOfInterest: { label: '屏幕外的信号提示', format: onOff },

  enableAudio: { label: '游戏声音', format: onOff },
  masterVolume: { label: '总音量', format: volume('masterMute') },
  masterMute: { label: '总音量静音', format: onOff, hidden: true },
  musicVolume: { label: '音乐', format: volume('musicMute') },
  musicMute: { label: '音乐静音', format: onOff, hidden: true },
  sfxVolume: { label: '音效', format: volume('sfxMute') },
  sfxMute: { label: '音效静音', format: onOff, hidden: true },
  ambienceVolume: { label: '环境音', format: volume('ambienceMute') },
  ambienceMute: { label: '环境音静音', format: onOff, hidden: true },
  pingsVolume: { label: '信号', format: volume('pingsMute') },
  pingsMute: { label: '信号静音', format: onOff, hidden: true },
  announcerVolume: { label: '播报员', format: volume('announcerMute') },
  announcerMute: { label: '播报员静音', format: onOff, hidden: true },
  voiceVolume: { label: '英雄语音', format: volume('voiceMute') },
  voiceMute: { label: '英雄语音静音', format: onOff, hidden: true },
};

export const CLIENT_FIELDS: Record<keyof LolClientConfigValues, FieldMeta<LolClientConfigValues>> = {
  lowSpecMode: { label: '低配模式', format: onOff },
  disableInteractiveBackground: { label: '关掉动态背景', format: onOff },
  closeClientDuringGame: { label: '打游戏时关闭客户端', format: onOff },
  disableChampionSkillText: { label: '不显示英雄技能说明', format: onOff },
  clientAudioEnabled: { label: '客户端音效', format: onOff },
  uploadCrashReports: { label: '自动发送崩溃报告', format: onOff },
  careerPrivate: { label: '生涯不公开', format: onOff },
  hideAllPlayerNamesForMe: { label: '隐藏所有人的名字（只对我）', format: onOff },
  hideMyNameFromOthers: { label: '对别人隐藏我的名字', format: onOff },
  hideMyIdentityFromOthers: { label: '对别人隐藏我的身份', format: onOff },
  blockNonFriendGameInvites: { label: '只接受好友的游戏邀请', format: onOff },
  linkClickWarningEnabled: { label: '点聊天里的链接时提醒我', format: onOff },
  moreUnreadsEnabled: { label: '显示「更多未读」提示条', format: onOff },
  friendRequestToastsEnabled: { label: '弹出新的好友请求', format: onOff },
  teamVoiceEnabled: { label: '开启组队语音', format: onOff },
  autoJoinTeamVoice: { label: '进房间自动加入语音', format: onOff },
  muteOnConnect: { label: '进语音时先把我静音', format: onOff },
  voiceInputMode: { label: '说话方式', format: pick(VOICE_INPUT_OPTIONS) },
  voiceInputDeviceHandle: { label: '麦克风', format: String, hidden: true },
  voiceInputDeviceName: { label: '麦克风', format: (value, all) => String(value || all.voiceInputDeviceHandle || '系统默认') },
  voiceInputVolume: { label: '麦克风音量', format: number },
  voiceSensitivity: { label: '语音触发灵敏度', format: number },
  blockedPlayers: { label: '聊天黑名单', format: () => '', hidden: true },
};

// 设置页的分区和分组。设置页按这个顺序排，方案详情也照这个结构列出来，两边一模一样。
export interface ConfigLayoutSection<K extends string> {
  key: string;
  label: string;
  groups: Array<{ title?: string; keys: K[] }>;
}

export const GAME_LAYOUT: Array<ConfigLayoutSection<keyof LolGameConfigValues> & { part: LolConfigPart }> = [
  {
    key: 'video',
    label: '画面',
    part: 'video',
    groups: [
      { keys: ['windowMode', 'width', 'frameCapType', 'waitForVerticalSync', 'enableFxaa'] },
      { title: '画质', keys: ['shadowQuality', 'characterQuality', 'effectsQuality', 'environmentQuality'] },
    ],
  },
  {
    key: 'controls',
    label: '操作',
    part: 'controls',
    groups: [
      {
        title: '鼠标和镜头',
        keys: ['gameMouseSpeed', 'mapScrollSpeed', 'keyboardScrollSpeed', 'cameraLockMode', 'snapCameraOnRespawn', 'scrollSmoothingEnabled', 'middleClickDragScrollEnabled'],
      },
      {
        title: '攻击和施法',
        keys: ['autoAcquireTarget', 'predictMovement', 'enableTargetedAttackMove', 'targetChampionsOnlyAsToggle', 'disableHudSpellClick', 'showTurretRangeIndicators', 'recommendJunglePaths'],
      },
    ],
  },
  {
    key: 'interface',
    label: '界面',
    part: 'interface',
    groups: [
      { title: '大小', keys: ['globalScale', 'minimapScale', 'chatScale', 'cursorScale'] },
      { title: '显示', keys: ['showSummonerNames', 'numericCooldownFormat', 'showFpsAndLatency', 'enableHudAnimations', 'hidePlayerNames'] },
      { title: '聊天', keys: ['showTimestamps', 'showAlliedChat', 'showAllChannelChat'] },
    ],
  },
  {
    key: 'combat',
    label: '战斗提示',
    part: 'combat',
    groups: [
      {
        keys: ['showAttackRadius', 'autoDisplayTarget', 'enableLineMissileVis', 'showSpellCosts', 'showSpellRecommendations', 'showNeutralCamps', 'flashScreenWhenDamaged', 'flashScreenWhenStunned', 'showOffScreenPointsOfInterest'],
      },
    ],
  },
  {
    key: 'audio',
    label: '声音',
    part: 'audio',
    groups: [
      { keys: ['enableAudio', 'masterVolume', 'musicVolume', 'sfxVolume', 'ambienceVolume', 'pingsVolume', 'announcerVolume', 'voiceVolume'] },
    ],
  },
];

export const CLIENT_LAYOUT: Array<ConfigLayoutSection<keyof LolClientConfigValues>> = [
  {
    key: 'general',
    label: '综合',
    groups: [{ keys: ['lowSpecMode', 'disableInteractiveBackground', 'closeClientDuringGame', 'disableChampionSkillText', 'clientAudioEnabled', 'uploadCrashReports'] }],
  },
  {
    key: 'privacy',
    label: '隐私与主播模式',
    groups: [{ keys: ['careerPrivate', 'hideAllPlayerNamesForMe', 'hideMyNameFromOthers', 'hideMyIdentityFromOthers'] }],
  },
  {
    key: 'social',
    label: '聊天与邀请',
    groups: [{ keys: ['blockNonFriendGameInvites', 'linkClickWarningEnabled', 'moreUnreadsEnabled', 'friendRequestToastsEnabled'] }],
  },
  {
    key: 'voice',
    label: '语音',
    groups: [{ keys: ['teamVoiceEnabled', 'autoJoinTeamVoice', 'muteOnConnect', 'voiceInputMode', 'voiceInputDeviceName', 'voiceInputVolume', 'voiceSensitivity'] }],
  },
];

// 热键值相同的判断：大小写、空白不敏感。
function sameHotkey(a?: string, b?: string): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

export function hotkeyDiffCount(a: LolHotkeyValues, b: LolHotkeyValues): number {
  let count = 0;
  const sections = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const section of sections) {
    const keys = new Set([...Object.keys(a[section] ?? {}), ...Object.keys(b[section] ?? {})]);
    for (const key of keys) {
      if (!sameHotkey(a[section]?.[key], b[section]?.[key])) count += 1;
    }
  }
  return count;
}

const IGNORED_CLIENT_KEYS = new Set<keyof LolClientConfigValues>(['blockedPlayers', 'voiceInputDeviceName']);

// 当前面板里改了多少项还没应用到游戏。
export function countConfigChanges(draft: LolConfigValues, saved: LolConfigValues): number {
  let count = 0;
  for (const key of Object.keys(draft.game) as Array<keyof LolGameConfigValues>) {
    if (String(draft.game[key]) !== String(saved.game[key])) count += 1;
  }
  for (const key of Object.keys(draft.client) as Array<keyof LolClientConfigValues>) {
    if (IGNORED_CLIENT_KEYS.has(key)) continue;
    // 「隐藏玩家名字」游戏内和客户端是同一个开关，只算一次。
    if (key === 'hideAllPlayerNamesForMe') continue;
    if (String(draft.client[key]) !== String(saved.client[key])) count += 1;
  }
  return count + hotkeyDiffCount(draft.hotkeys, saved.hotkeys);
}

// ---------- 比较两套设置：按块数差异、逐行对照 ----------

/** 每一块（客户端、画面、操作…热键）里有几处不一样。 */
export function countPartDiffs(a: LolConfigValues, b: LolConfigValues): Record<LolConfigPart, number> {
  const stats = {} as Record<LolConfigPart, number>;
  for (const section of GAME_LAYOUT) {
    stats[section.part] = section.groups
      .flatMap((group) => group.keys)
      .filter((key) => GAME_FIELDS[key].format(a.game[key], a.game) !== GAME_FIELDS[key].format(b.game[key], b.game))
      .length;
  }
  stats.client = CLIENT_LAYOUT
    .flatMap((section) => section.groups.flatMap((group) => group.keys))
    .filter((key) => !IGNORED_CLIENT_KEYS.has(key) && key !== 'hideAllPlayerNamesForMe')
    .filter((key) => CLIENT_FIELDS[key].format(a.client[key], a.client) !== CLIENT_FIELDS[key].format(b.client[key], b.client))
    .length;
  stats.hotkeys = hotkeyDiffCount(a.hotkeys, b.hotkeys);
  return stats;
}

/**
 * 逐行对照：values 里和 baseline 不一样的每一行，记下 baseline 那边显示成什么。
 * 用设置页那一行的名字当钥匙，设置页的每一行凭名字就能找到自己的对照值。
 */
export function buildFieldBaseline(values: LolConfigValues, baseline: LolConfigValues): Map<string, string> {
  const map = new Map<string, string>();
  for (const key of Object.keys(GAME_FIELDS) as Array<keyof LolGameConfigValues>) {
    const meta = GAME_FIELDS[key];
    if (meta.hidden) continue;
    const before = meta.format(baseline.game[key], baseline.game);
    if (meta.format(values.game[key], values.game) !== before) map.set(meta.label, before);
  }
  for (const key of Object.keys(CLIENT_FIELDS) as Array<keyof LolClientConfigValues>) {
    const meta = CLIENT_FIELDS[key];
    if (meta.hidden || key === 'blockedPlayers') continue;
    const before = meta.format(baseline.client[key], baseline.client);
    if (meta.format(values.client[key], values.client) !== before) map.set(meta.label, before);
  }
  return map;
}

/** 热键逐个对照：「section.key」→ baseline 里的原始值（没有这个键时为空串）。 */
export function buildHotkeyBaseline(values: LolHotkeyValues, baseline: LolHotkeyValues): Map<string, string> {
  const map = new Map<string, string>();
  const sections = new Set([...Object.keys(values), ...Object.keys(baseline)]);
  for (const section of sections) {
    const keys = new Set([...Object.keys(values[section] ?? {}), ...Object.keys(baseline[section] ?? {})]);
    for (const key of keys) {
      if (!sameHotkey(values[section]?.[key], baseline[section]?.[key])) {
        map.set(`${section}.${key}`, baseline[section]?.[key] ?? '');
      }
    }
  }
  return map;
}

// ---------- 改一项设置（设置页和方案编辑共用） ----------

export function withClientValue<K extends keyof LolClientConfigValues>(
  values: LolConfigValues,
  key: K,
  value: LolClientConfigValues[K],
): LolConfigValues {
  return {
    ...values,
    client: { ...values.client, [key]: value },
    // 「隐藏玩家名字」客户端和游戏内是同一个开关。
    game: key === 'hideAllPlayerNamesForMe' ? { ...values.game, hidePlayerNames: Boolean(value) } : values.game,
  };
}

export function withGameValue<K extends keyof LolGameConfigValues>(
  values: LolConfigValues,
  key: K,
  value: LolGameConfigValues[K],
): LolConfigValues {
  return {
    ...values,
    game: { ...values.game, [key]: value },
    client: key === 'hidePlayerNames' ? { ...values.client, hideAllPlayerNamesForMe: Boolean(value) } : values.client,
  };
}

export function withHotkeyValue(values: LolConfigValues, section: string, key: string, value: string): LolConfigValues {
  return {
    ...values,
    hotkeys: { ...values.hotkeys, [section]: { ...(values.hotkeys[section] ?? {}), [key]: value } },
  };
}
