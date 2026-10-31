import type {
  LolClientConfigValues,
  LolConfigPart,
  LolConfigValues,
  LolGameConfigValues,
} from './api';

// 一套游戏设置拆成几块，「方案」可以只应用其中几块（比如换了显示器就不带分辨率）。
// 分块和设置页一一对应：「游戏内」页的五个分区各是一块，「热键」「客户端」各是一整块。

export type ConfigPage = 'client' | 'game' | 'hotkeys';

export const CONFIG_PARTS: Array<{ key: LolConfigPart; label: string; page: ConfigPage }> = [
  { key: 'client', label: '客户端', page: 'client' },
  { key: 'video', label: '画面', page: 'game' },
  { key: 'controls', label: '操作', page: 'game' },
  { key: 'interface', label: '界面', page: 'game' },
  { key: 'combat', label: '战斗提示', page: 'game' },
  { key: 'audio', label: '声音', page: 'game' },
  { key: 'hotkeys', label: '热键', page: 'hotkeys' },
];

export const ALL_CONFIG_PARTS: LolConfigPart[] = CONFIG_PARTS.map((part) => part.key);

type GamePart = 'video' | 'controls' | 'interface' | 'combat' | 'audio';

// 每个游戏内设置属于哪一块。用 Record 写满全部字段，新增字段忘了归类时类型检查会报错。
export const GAME_KEY_PART: Record<keyof LolGameConfigValues, GamePart> = {
  windowMode: 'video',
  width: 'video',
  height: 'video',
  shadowQuality: 'video',
  characterQuality: 'video',
  effectsQuality: 'video',
  environmentQuality: 'video',
  frameCapType: 'video',
  waitForVerticalSync: 'video',
  enableFxaa: 'video',

  gameMouseSpeed: 'controls',
  mapScrollSpeed: 'controls',
  keyboardScrollSpeed: 'controls',
  snapCameraOnRespawn: 'controls',
  scrollSmoothingEnabled: 'controls',
  middleClickDragScrollEnabled: 'controls',
  cameraLockMode: 'controls',
  autoAcquireTarget: 'controls',
  predictMovement: 'controls',
  showTurretRangeIndicators: 'controls',
  enableTargetedAttackMove: 'controls',
  recommendJunglePaths: 'controls',
  targetChampionsOnlyAsToggle: 'controls',
  disableHudSpellClick: 'controls',

  flashScreenWhenDamaged: 'combat',
  flashScreenWhenStunned: 'combat',
  showOffScreenPointsOfInterest: 'combat',
  autoDisplayTarget: 'combat',
  enableLineMissileVis: 'combat',
  showAttackRadius: 'combat',
  showSpellCosts: 'combat',
  showSpellRecommendations: 'combat',
  showNeutralCamps: 'combat',
  showPlayerStats: 'interface',
  numericCooldownFormat: 'interface',
  showSummonerNames: 'interface',
  globalScale: 'interface',
  chatScale: 'interface',
  minimapScale: 'interface',
  cursorScale: 'interface',
  enableHudAnimations: 'interface',
  showFpsAndLatency: 'interface',
  showTimestamps: 'interface',
  showAlliedChat: 'interface',
  showAllChannelChat: 'interface',
  hidePlayerNames: 'interface',

  enableAudio: 'audio',
  masterVolume: 'audio',
  masterMute: 'audio',
  musicVolume: 'audio',
  musicMute: 'audio',
  sfxVolume: 'audio',
  sfxMute: 'audio',
  ambienceVolume: 'audio',
  ambienceMute: 'audio',
  pingsVolume: 'audio',
  pingsMute: 'audio',
  announcerVolume: 'audio',
  announcerMute: 'audio',
  voiceVolume: 'audio',
  voiceMute: 'audio',
};

// 聊天黑名单是账号自己的数据，不跟着方案走。
const CLIENT_KEYS_NOT_IN_PROFILE = new Set<keyof LolClientConfigValues>(['blockedPlayers']);

// 以 base 为底，把 source 里选中那几块的设置盖上去。
export function mergeConfigParts(
  base: LolConfigValues,
  source: LolConfigValues,
  parts: LolConfigPart[],
): LolConfigValues {
  const selected = new Set(parts);
  const game = { ...base.game } as Record<keyof LolGameConfigValues, unknown>;
  for (const key of Object.keys(GAME_KEY_PART) as Array<keyof LolGameConfigValues>) {
    if (selected.has(GAME_KEY_PART[key]) && source.game[key] !== undefined) {
      game[key] = source.game[key];
    }
  }

  let client = { ...base.client };
  if (selected.has('client')) {
    const next = { ...client } as Record<keyof LolClientConfigValues, unknown>;
    for (const key of Object.keys(source.client) as Array<keyof LolClientConfigValues>) {
      if (!CLIENT_KEYS_NOT_IN_PROFILE.has(key)) next[key] = source.client[key];
    }
    client = next as unknown as LolClientConfigValues;
  }

  const merged: LolConfigValues = {
    client,
    game: game as unknown as LolGameConfigValues,
    hotkeys: selected.has('hotkeys') ? structuredClone(source.hotkeys) : structuredClone(base.hotkeys),
  };
  // 「隐藏玩家名字」在客户端和游戏内是同一个开关，跟着界面那块走。
  if (selected.has('interface')) {
    merged.client.hideAllPlayerNamesForMe = merged.game.hidePlayerNames;
  } else if (selected.has('client')) {
    merged.game.hidePlayerNames = merged.client.hideAllPlayerNamesForMe;
  }
  return merged;
}
