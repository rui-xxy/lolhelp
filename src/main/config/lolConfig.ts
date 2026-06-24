import { app } from 'electron';
import crypto from 'node:crypto';
import path from 'node:path';
import type {
  LolBlockedPlayer,
  LolConfigApplyResult,
  LolConfigFileStatus,
  LolConfigProfileSummary,
  LolConfigValues,
} from '../../shared/api';
import { LcuClient } from '../lcu/client';
import { readCredentialsForInstallRoot } from '../lcu/lockfile';
import {
  executeFileTransaction,
  type FileWritePlan,
} from './fileTransaction';
import {
  normalizeHotkeyValues,
  type LcuInputSettings,
} from './hotkeyValues';
import {
  applyGameValuesToLcuSettings,
  applyHotkeysToLcuInputSettings,
  mergeLiveGameSettings,
  mergeLiveInputSettings,
  type LcuGameSettings,
} from './lcuGameSettings';
import {
  boolFlag,
  clamp,
  flagToBool,
  iniValue,
  parseIni,
  percentToRatio,
  ratioToPercent,
  setFirstYamlScalar,
  setIniValue,
  setYamlSectionChildScalar,
  toNumber,
  yamlBool,
  yamlNumber,
  yamlScalar,
} from './configText';
import {
  getConfigPaths,
  getFileStatuses,
  readText,
  resolveRootPath,
  rootLooksValid,
} from './configPaths';
import {
  gameResolution,
  listProfileSummaries,
  readProfileStore,
  writeProfileStore,
  type ConfigProfileSnapshots,
} from './profileStore';

interface PersistedSetting {
  name: string;
  value: string;
}

interface PersistedSection {
  name: string;
  settings: PersistedSetting[];
}

interface PersistedFile {
  name: string;
  sections: PersistedSection[];
}

interface PersistedSettingsRoot {
  description?: string;
  files: PersistedFile[];
}

interface GameField {
  section: string;
  key: string;
  getValue: (values: LolConfigValues) => string;
  getLcuValue?: (values: LolConfigValues) => boolean | number | string;
}

const DEFAULT_VALUES: LolConfigValues = {
  client: {
    lowSpecMode: false,
    disableInteractiveBackground: false,
    closeClientDuringGame: false,
    disableChampionSkillText: false,
    clientAudioEnabled: true,
    uploadCrashReports: true,
    careerPrivate: false,
    blockNonFriendGameInvites: false,
    linkClickWarningEnabled: true,
    moreUnreadsEnabled: true,
    friendRequestToastsEnabled: true,
    teamVoiceEnabled: false,
    autoJoinTeamVoice: false,
    muteOnConnect: false,
    voiceInputMode: 'voiceActivity',
    voiceInputDeviceHandle: '',
    voiceInputDeviceName: '',
    voiceInputVolume: 50,
    voiceSensitivity: 65,
    hideAllPlayerNamesForMe: false,
    hideMyNameFromOthers: false,
    hideMyIdentityFromOthers: false,
    blockedPlayers: [],
  },
  game: {
    gameMouseSpeed: 50,
    mapScrollSpeed: 50,
    keyboardScrollSpeed: 50,
    snapCameraOnRespawn: false,
    scrollSmoothingEnabled: false,
    middleClickDragScrollEnabled: false,
    cameraLockMode: 0,
    autoAcquireTarget: false,
    autoDisplayTarget: true,
    showAttackRadius: true,
    enableTargetedAttackMove: false,
    disableHudSpellClick: false,
    showTurretRangeIndicators: false,
    predictMovement: false,
    recommendJunglePaths: false,
    targetChampionsOnlyAsToggle: false,
    windowMode: '2',
    width: 1920,
    height: 1080,
    enableAudio: true,
    cursorScale: 50,
    enableHudAnimations: true,
    shadowQuality: 2,
    characterQuality: 2,
    effectsQuality: 2,
    environmentQuality: 2,
    frameCapType: 2,
    waitForVerticalSync: false,
    enableFxaa: false,
    globalScale: 50,
    chatScale: 100,
    minimapScale: 50,
    showFpsAndLatency: false,
    showTimestamps: false,
    showAlliedChat: true,
    showAllChannelChat: true,
    hidePlayerNames: false,
    showSummonerNames: 1,
    flashScreenWhenDamaged: true,
    flashScreenWhenStunned: true,
    showOffScreenPointsOfInterest: true,
    enableLineMissileVis: true,
    showSpellCosts: true,
    showSpellRecommendations: true,
    showPlayerStats: true,
    showNeutralCamps: true,
    numericCooldownFormat: 1,
    masterVolume: 100,
    masterMute: false,
    musicVolume: 100,
    musicMute: false,
    sfxVolume: 100,
    sfxMute: false,
    ambienceVolume: 100,
    ambienceMute: false,
    pingsVolume: 100,
    pingsMute: false,
    announcerVolume: 100,
    announcerMute: false,
    voiceVolume: 100,
    voiceMute: false,
  },
  hotkeys: {},
};

const GAME_FIELDS: GameField[] = [
  { section: 'General', key: 'LowSpecMachineAdaptation', getValue: (v) => boolFlag(v.client.lowSpecMode) },
  { section: 'General', key: 'DisableInteractiveBackground', getValue: (v) => boolFlag(v.client.disableInteractiveBackground) },
  { section: 'General', key: 'CloseClientDuringGame', getValue: (v) => boolFlag(v.client.closeClientDuringGame) },
  { section: 'General', key: 'DisableChampionSkillText', getValue: (v) => boolFlag(v.client.disableChampionSkillText) },
  { section: 'General', key: 'GameMouseSpeed', getValue: (v) => String(Math.round(clamp(v.game.gameMouseSpeed, 0, 100) / 5)) },
  { section: 'HUD', key: 'MapScrollSpeed', getValue: (v) => percentToRatio(v.game.mapScrollSpeed) },
  { section: 'HUD', key: 'KeyboardScrollSpeed', getValue: (v) => percentToRatio(v.game.keyboardScrollSpeed) },
  { section: 'General', key: 'SnapCameraOnRespawn', getValue: (v) => boolFlag(v.game.snapCameraOnRespawn) },
  { section: 'HUD', key: 'ScrollSmoothingEnabled', getValue: (v) => boolFlag(v.game.scrollSmoothingEnabled) },
  { section: 'HUD', key: 'MiddleClickDragScrollEnabled', getValue: (v) => boolFlag(v.game.middleClickDragScrollEnabled) },
  { section: 'HUD', key: 'CameraLockMode', getValue: (v) => String(v.game.cameraLockMode) },
  { section: 'General', key: 'AutoAcquireTarget', getValue: (v) => boolFlag(v.game.autoAcquireTarget) },
  { section: 'HUD', key: 'AutoDisplayTarget', getValue: (v) => boolFlag(v.game.autoDisplayTarget) },
  { section: 'HUD', key: 'ShowAttackRadius', getValue: (v) => boolFlag(v.game.showAttackRadius) },
  { section: 'General', key: 'EnableTargetedAttackMove', getValue: (v) => boolFlag(v.game.enableTargetedAttackMove) },
  { section: 'HUD', key: 'DisableHudSpellClick', getValue: (v) => boolFlag(v.game.disableHudSpellClick) },
  { section: 'General', key: 'ShowTurretRangeIndicators', getValue: (v) => boolFlag(v.game.showTurretRangeIndicators) },
  { section: 'General', key: 'PredictMovement', getValue: (v) => boolFlag(v.game.predictMovement) },
  { section: 'General', key: 'RecommendJunglePaths', getValue: (v) => boolFlag(v.game.recommendJunglePaths) },
  { section: 'General', key: 'TargetChampionsOnlyAsToggle', getValue: (v) => boolFlag(v.game.targetChampionsOnlyAsToggle) },
  { section: 'General', key: 'WindowMode', getValue: (v) => v.game.windowMode },
  { section: 'General', key: 'Width', getValue: (v) => String(v.game.width) },
  { section: 'General', key: 'Height', getValue: (v) => String(v.game.height) },
  { section: 'General', key: 'EnableAudio', getValue: (v) => boolFlag(v.game.enableAudio) },
  { section: 'General', key: 'CursorScale', getValue: (v) => percentToRatio(v.game.cursorScale) },
  { section: 'General', key: 'WaitForVerticalSync', getValue: (v) => boolFlag(v.game.waitForVerticalSync) },
  { section: 'Performance', key: 'EnableHUDAnimations', getValue: (v) => boolFlag(v.game.enableHudAnimations) },
  { section: 'Performance', key: 'ShadowQuality', getValue: (v) => String(v.game.shadowQuality) },
  { section: 'Performance', key: 'CharacterQuality', getValue: (v) => String(v.game.characterQuality) },
  { section: 'Performance', key: 'EffectsQuality', getValue: (v) => String(v.game.effectsQuality) },
  { section: 'Performance', key: 'EnvironmentQuality', getValue: (v) => String(v.game.environmentQuality) },
  { section: 'Performance', key: 'FrameCapType', getValue: (v) => String(v.game.frameCapType) },
  { section: 'Performance', key: 'EnableFXAA', getValue: (v) => boolFlag(v.game.enableFxaa) },
  { section: 'HUD', key: 'GlobalScale', getValue: (v) => percentToRatio(v.game.globalScale) },
  { section: 'HUD', key: 'ChatScale', getValue: (v) => String(v.game.chatScale) },
  { section: 'HUD', key: 'MinimapScale', getValue: (v) => percentToRatio(v.game.minimapScale) },
  { section: 'HUD', key: 'ShowFPSAndLatency', getValue: (v) => boolFlag(v.game.showFpsAndLatency) },
  { section: 'HUD', key: 'ShowTimestamps', getValue: (v) => boolFlag(v.game.showTimestamps) },
  { section: 'HUD', key: 'ShowAlliedChat', getValue: (v) => boolFlag(v.game.showAlliedChat) },
  { section: 'HUD', key: 'ShowAllChannelChat', getValue: (v) => boolFlag(v.game.showAllChannelChat) },
  { section: 'HUD', key: 'HidePlayerNames', getValue: (v) => boolFlag(v.client.hideAllPlayerNamesForMe) },
  { section: 'HUD', key: 'ShowSummonerNames', getValue: (v) => String(v.game.showSummonerNames) },
  { section: 'HUD', key: 'FlashScreenWhenDamaged', getValue: (v) => boolFlag(v.game.flashScreenWhenDamaged) },
  { section: 'HUD', key: 'FlashScreenWhenStunned', getValue: (v) => boolFlag(v.game.flashScreenWhenStunned) },
  { section: 'HUD', key: 'ShowOffScreenPointsOfInterest', getValue: (v) => boolFlag(v.game.showOffScreenPointsOfInterest) },
  { section: 'HUD', key: 'EnableLineMissileVis', getValue: (v) => boolFlag(v.game.enableLineMissileVis) },
  { section: 'HUD', key: 'ShowSpellCosts', getValue: (v) => boolFlag(v.game.showSpellCosts) },
  { section: 'HUD', key: 'ShowSpellRecommendations', getValue: (v) => boolFlag(v.game.showSpellRecommendations) },
  { section: 'HUD', key: 'ShowPlayerStats', getValue: (v) => boolFlag(v.game.showPlayerStats) },
  { section: 'HUD', key: 'ShowNeutralCamps', getValue: (v) => boolFlag(v.game.showNeutralCamps) },
  { section: 'HUD', key: 'NumericCooldownFormat', getValue: (v) => String(v.game.numericCooldownFormat) },
  { section: 'Volume', key: 'MasterVolume', getValue: (v) => percentToRatio(v.game.masterVolume) },
  { section: 'Volume', key: 'MasterMute', getValue: (v) => boolFlag(v.game.masterMute) },
  { section: 'Volume', key: 'MusicVolume', getValue: (v) => percentToRatio(v.game.musicVolume) },
  { section: 'Volume', key: 'MusicMute', getValue: (v) => boolFlag(v.game.musicMute) },
  { section: 'Volume', key: 'SfxVolume', getValue: (v) => percentToRatio(v.game.sfxVolume) },
  { section: 'Volume', key: 'SfxMute', getValue: (v) => boolFlag(v.game.sfxMute) },
  { section: 'Volume', key: 'AmbienceVolume', getValue: (v) => percentToRatio(v.game.ambienceVolume) },
  { section: 'Volume', key: 'AmbienceMute', getValue: (v) => boolFlag(v.game.ambienceMute) },
  { section: 'Volume', key: 'PingsVolume', getValue: (v) => percentToRatio(v.game.pingsVolume) },
  { section: 'Volume', key: 'PingsMute', getValue: (v) => boolFlag(v.game.pingsMute) },
  { section: 'Volume', key: 'AnnouncerVolume', getValue: (v) => percentToRatio(v.game.announcerVolume) },
  { section: 'Volume', key: 'AnnouncerMute', getValue: (v) => boolFlag(v.game.announcerMute) },
  { section: 'Volume', key: 'VoiceVolume', getValue: (v) => percentToRatio(v.game.voiceVolume) },
  { section: 'Volume', key: 'VoiceMute', getValue: (v) => boolFlag(v.game.voiceMute) },
];

function cloneDefaultValues(): LolConfigValues {
  return JSON.parse(JSON.stringify(DEFAULT_VALUES)) as LolConfigValues;
}

function normalizeValues(values: LolConfigValues): LolConfigValues {
  const defaults = cloneDefaultValues();
  return {
    client: { ...defaults.client, ...(values.client ?? {}) },
    game: { ...defaults.game, ...(values.game ?? {}) },
    hotkeys: normalizeHotkeyValues(values.hotkeys),
  };
}

function readValues(rootPath: string): LolConfigValues {
  const paths = getConfigPaths(rootPath);
  const gameCfg = readText(paths.gameCfg);
  const gameIni = parseIni(gameCfg);
  const inputIni = readText(paths.inputIni);
  const localPrefs = readText(paths.lcuLocalPreferences);
  const accountPrefs = readText(paths.lcuAccountPreferences);
  const values = cloneDefaultValues();
  values.hotkeys = parseIni(inputIni);

  values.client = {
    lowSpecMode: yamlBool(localPrefs, 'potatoModeEnabled', values.client.lowSpecMode),
    disableInteractiveBackground: values.client.disableInteractiveBackground,
    closeClientDuringGame: values.client.closeClientDuringGame,
    disableChampionSkillText: values.client.disableChampionSkillText,
    clientAudioEnabled: yamlBool(localPrefs, 'masterSoundEnabled', values.client.clientAudioEnabled),
    uploadCrashReports: yamlBool(
      accountPrefs,
      'uploadCrashReports',
      flagToBool(iniValue(gameIni, 'General', 'AutoSendCrashReport', '1'), values.client.uploadCrashReports),
    ),
    careerPrivate: values.client.careerPrivate,
    blockNonFriendGameInvites: yamlBool(accountPrefs, 'blockNonFriendGameInvites', values.client.blockNonFriendGameInvites),
    linkClickWarningEnabled: values.client.linkClickWarningEnabled,
    moreUnreadsEnabled: values.client.moreUnreadsEnabled,
    friendRequestToastsEnabled: values.client.friendRequestToastsEnabled,
    teamVoiceEnabled: yamlBool(accountPrefs, 'teamVoiceEnabled', values.client.teamVoiceEnabled),
    autoJoinTeamVoice: yamlBool(accountPrefs, 'autoJoinTeamVoice', values.client.autoJoinTeamVoice),
    muteOnConnect: yamlBool(accountPrefs, 'muteOnConnect', values.client.muteOnConnect),
    voiceInputMode: yamlScalar(accountPrefs, 'inputMode') ?? values.client.voiceInputMode,
    voiceInputDeviceHandle: yamlScalar(localPrefs, 'currentCaptureDeviceHandle') ?? values.client.voiceInputDeviceHandle,
    voiceInputDeviceName: values.client.voiceInputDeviceName,
    voiceInputVolume: clamp(yamlNumber(localPrefs, 'inputVolume', values.client.voiceInputVolume), 0, 100),
    voiceSensitivity: clamp(yamlNumber(localPrefs, 'vadSensitivity', values.client.voiceSensitivity), 0, 100),
    hideAllPlayerNamesForMe: flagToBool(
      iniValue(gameIni, 'HUD', 'HidePlayerNames', boolFlag(values.client.hideAllPlayerNamesForMe)),
      values.client.hideAllPlayerNamesForMe,
    ),
    hideMyNameFromOthers: values.client.hideMyNameFromOthers,
    hideMyIdentityFromOthers: values.client.hideMyIdentityFromOthers,
    blockedPlayers: values.client.blockedPlayers,
  };

  values.game = {
    gameMouseSpeed: clamp(
      Math.round(toNumber(iniValue(gameIni, 'General', 'GameMouseSpeed', '10'), 10) * 5),
      0,
      100,
    ),
    mapScrollSpeed: ratioToPercent(iniValue(gameIni, 'HUD', 'MapScrollSpeed', percentToRatio(values.game.mapScrollSpeed)), values.game.mapScrollSpeed),
    keyboardScrollSpeed: ratioToPercent(iniValue(gameIni, 'HUD', 'KeyboardScrollSpeed', percentToRatio(values.game.keyboardScrollSpeed)), values.game.keyboardScrollSpeed),
    snapCameraOnRespawn: flagToBool(iniValue(gameIni, 'General', 'SnapCameraOnRespawn', '0'), values.game.snapCameraOnRespawn),
    scrollSmoothingEnabled: flagToBool(iniValue(gameIni, 'HUD', 'ScrollSmoothingEnabled', '0'), values.game.scrollSmoothingEnabled),
    middleClickDragScrollEnabled: flagToBool(iniValue(gameIni, 'HUD', 'MiddleClickDragScrollEnabled', '0'), values.game.middleClickDragScrollEnabled),
    cameraLockMode: toNumber(iniValue(gameIni, 'HUD', 'CameraLockMode', String(values.game.cameraLockMode)), values.game.cameraLockMode),
    autoAcquireTarget: flagToBool(iniValue(gameIni, 'General', 'AutoAcquireTarget', '0'), values.game.autoAcquireTarget),
    autoDisplayTarget: flagToBool(iniValue(gameIni, 'HUD', 'AutoDisplayTarget', '1'), values.game.autoDisplayTarget),
    showAttackRadius: flagToBool(iniValue(gameIni, 'HUD', 'ShowAttackRadius', '1'), values.game.showAttackRadius),
    enableTargetedAttackMove: flagToBool(iniValue(gameIni, 'General', 'EnableTargetedAttackMove', '0'), values.game.enableTargetedAttackMove),
    disableHudSpellClick: flagToBool(iniValue(gameIni, 'HUD', 'DisableHudSpellClick', '0'), values.game.disableHudSpellClick),
    showTurretRangeIndicators: flagToBool(iniValue(gameIni, 'General', 'ShowTurretRangeIndicators', '0'), values.game.showTurretRangeIndicators),
    predictMovement: flagToBool(iniValue(gameIni, 'General', 'PredictMovement', '0'), values.game.predictMovement),
    recommendJunglePaths: flagToBool(iniValue(gameIni, 'General', 'RecommendJunglePaths', '0'), values.game.recommendJunglePaths),
    targetChampionsOnlyAsToggle: flagToBool(iniValue(gameIni, 'General', 'TargetChampionsOnlyAsToggle', '0'), values.game.targetChampionsOnlyAsToggle),
    windowMode: iniValue(gameIni, 'General', 'WindowMode', values.game.windowMode),
    width: toNumber(iniValue(gameIni, 'General', 'Width', String(values.game.width)), values.game.width),
    height: toNumber(iniValue(gameIni, 'General', 'Height', String(values.game.height)), values.game.height),
    enableAudio: flagToBool(iniValue(gameIni, 'General', 'EnableAudio', '1'), values.game.enableAudio),
    cursorScale: ratioToPercent(iniValue(gameIni, 'General', 'CursorScale', percentToRatio(values.game.cursorScale)), values.game.cursorScale),
    enableHudAnimations: flagToBool(iniValue(gameIni, 'Performance', 'EnableHUDAnimations', '1'), values.game.enableHudAnimations),
    shadowQuality: toNumber(iniValue(gameIni, 'Performance', 'ShadowQuality', String(values.game.shadowQuality)), values.game.shadowQuality),
    characterQuality: toNumber(iniValue(gameIni, 'Performance', 'CharacterQuality', String(values.game.characterQuality)), values.game.characterQuality),
    effectsQuality: toNumber(iniValue(gameIni, 'Performance', 'EffectsQuality', String(values.game.effectsQuality)), values.game.effectsQuality),
    environmentQuality: toNumber(iniValue(gameIni, 'Performance', 'EnvironmentQuality', String(values.game.environmentQuality)), values.game.environmentQuality),
    frameCapType: toNumber(iniValue(gameIni, 'Performance', 'FrameCapType', String(values.game.frameCapType)), values.game.frameCapType),
    waitForVerticalSync: flagToBool(iniValue(gameIni, 'General', 'WaitForVerticalSync', '0'), values.game.waitForVerticalSync),
    enableFxaa: flagToBool(iniValue(gameIni, 'Performance', 'EnableFXAA', '0'), values.game.enableFxaa),
    globalScale: ratioToPercent(iniValue(gameIni, 'HUD', 'GlobalScale', percentToRatio(values.game.globalScale)), values.game.globalScale),
    chatScale: toNumber(iniValue(gameIni, 'HUD', 'ChatScale', String(values.game.chatScale)), values.game.chatScale),
    minimapScale: ratioToPercent(iniValue(gameIni, 'HUD', 'MinimapScale', percentToRatio(values.game.minimapScale)), values.game.minimapScale),
    showFpsAndLatency: flagToBool(iniValue(gameIni, 'HUD', 'ShowFPSAndLatency', '0'), values.game.showFpsAndLatency),
    showTimestamps: flagToBool(iniValue(gameIni, 'HUD', 'ShowTimestamps', '0'), values.game.showTimestamps),
    showAlliedChat: flagToBool(iniValue(gameIni, 'HUD', 'ShowAlliedChat', '1'), values.game.showAlliedChat),
    showAllChannelChat: flagToBool(iniValue(gameIni, 'HUD', 'ShowAllChannelChat', '1'), values.game.showAllChannelChat),
    hidePlayerNames: flagToBool(iniValue(gameIni, 'HUD', 'HidePlayerNames', '0'), values.game.hidePlayerNames),
    showSummonerNames: toNumber(iniValue(gameIni, 'HUD', 'ShowSummonerNames', String(values.game.showSummonerNames)), values.game.showSummonerNames),
    flashScreenWhenDamaged: flagToBool(iniValue(gameIni, 'HUD', 'FlashScreenWhenDamaged', '1'), values.game.flashScreenWhenDamaged),
    flashScreenWhenStunned: flagToBool(iniValue(gameIni, 'HUD', 'FlashScreenWhenStunned', '1'), values.game.flashScreenWhenStunned),
    showOffScreenPointsOfInterest: flagToBool(iniValue(gameIni, 'HUD', 'ShowOffScreenPointsOfInterest', '1'), values.game.showOffScreenPointsOfInterest),
    enableLineMissileVis: flagToBool(iniValue(gameIni, 'HUD', 'EnableLineMissileVis', '1'), values.game.enableLineMissileVis),
    showSpellCosts: flagToBool(iniValue(gameIni, 'HUD', 'ShowSpellCosts', '1'), values.game.showSpellCosts),
    showSpellRecommendations: flagToBool(iniValue(gameIni, 'HUD', 'ShowSpellRecommendations', '1'), values.game.showSpellRecommendations),
    showPlayerStats: flagToBool(iniValue(gameIni, 'HUD', 'ShowPlayerStats', '1'), values.game.showPlayerStats),
    showNeutralCamps: flagToBool(iniValue(gameIni, 'HUD', 'ShowNeutralCamps', '1'), values.game.showNeutralCamps),
    numericCooldownFormat: toNumber(iniValue(gameIni, 'HUD', 'NumericCooldownFormat', String(values.game.numericCooldownFormat)), values.game.numericCooldownFormat),
    masterVolume: ratioToPercent(iniValue(gameIni, 'Volume', 'MasterVolume', percentToRatio(values.game.masterVolume)), values.game.masterVolume),
    masterMute: flagToBool(iniValue(gameIni, 'Volume', 'MasterMute', '0'), values.game.masterMute),
    musicVolume: ratioToPercent(iniValue(gameIni, 'Volume', 'MusicVolume', percentToRatio(values.game.musicVolume)), values.game.musicVolume),
    musicMute: flagToBool(iniValue(gameIni, 'Volume', 'MusicMute', '0'), values.game.musicMute),
    sfxVolume: ratioToPercent(iniValue(gameIni, 'Volume', 'SfxVolume', percentToRatio(values.game.sfxVolume)), values.game.sfxVolume),
    sfxMute: flagToBool(iniValue(gameIni, 'Volume', 'SfxMute', '0'), values.game.sfxMute),
    ambienceVolume: ratioToPercent(iniValue(gameIni, 'Volume', 'AmbienceVolume', percentToRatio(values.game.ambienceVolume)), values.game.ambienceVolume),
    ambienceMute: flagToBool(iniValue(gameIni, 'Volume', 'AmbienceMute', '0'), values.game.ambienceMute),
    pingsVolume: ratioToPercent(iniValue(gameIni, 'Volume', 'PingsVolume', percentToRatio(values.game.pingsVolume)), values.game.pingsVolume),
    pingsMute: flagToBool(iniValue(gameIni, 'Volume', 'PingsMute', '0'), values.game.pingsMute),
    announcerVolume: ratioToPercent(iniValue(gameIni, 'Volume', 'AnnouncerVolume', percentToRatio(values.game.announcerVolume)), values.game.announcerVolume),
    announcerMute: flagToBool(iniValue(gameIni, 'Volume', 'AnnouncerMute', '0'), values.game.announcerMute),
    voiceVolume: ratioToPercent(iniValue(gameIni, 'Volume', 'VoiceVolume', percentToRatio(values.game.voiceVolume)), values.game.voiceVolume),
    voiceMute: flagToBool(iniValue(gameIni, 'Volume', 'VoiceMute', '0'), values.game.voiceMute),
  };

  return values;
}

function applyGameValuesToContent(content: string, values: LolConfigValues): string {
  let next = content;
  for (const field of GAME_FIELDS) {
    next = setIniValue(next, field.section, field.key, field.getValue(values));
  }
  return next;
}

function applyInputValuesToContent(content: string, values: LolConfigValues): string {
  let next = content;
  for (const [section, bindings] of Object.entries(values.hotkeys ?? {})) {
    for (const [key, value] of Object.entries(bindings)) {
      next = setIniValue(next, section, key, value);
    }
  }
  return next;
}

function applyPersistedValuesToContent(content: string, values: LolConfigValues): string {
  const parsed = JSON.parse(content) as PersistedSettingsRoot;
  parsed.files = Array.isArray(parsed.files) ? parsed.files : [];
  let gameFile = parsed.files.find((file) => file.name.toLowerCase() === 'game.cfg');
  if (!gameFile) {
    gameFile = { name: 'Game.cfg', sections: [] };
    parsed.files.push(gameFile);
  }
  gameFile.sections = Array.isArray(gameFile.sections) ? gameFile.sections : [];

  for (const field of GAME_FIELDS) {
    let section = gameFile.sections.find((item) => item.name === field.section);
    if (!section) {
      section = { name: field.section, settings: [] };
      gameFile.sections.push(section);
    }
    section.settings = Array.isArray(section.settings) ? section.settings : [];
    let setting = section.settings.find((item) => item.name === field.key);
    if (!setting) {
      setting = { name: field.key, value: field.getValue(values) };
      section.settings.push(setting);
    } else {
      setting.value = field.getValue(values);
    }
  }

  if (Object.keys(values.hotkeys ?? {}).length > 0) {
    let inputFile = parsed.files.find((file) => file.name.toLowerCase() === 'input.ini');
    if (!inputFile) {
      inputFile = { name: 'Input.ini', sections: [] };
      parsed.files.push(inputFile);
    }
    inputFile.sections = Array.isArray(inputFile.sections) ? inputFile.sections : [];

    for (const [sectionName, bindings] of Object.entries(values.hotkeys)) {
      let section = inputFile.sections.find((item) => item.name === sectionName);
      if (!section) {
        section = { name: sectionName, settings: [] };
        inputFile.sections.push(section);
      }
      section.settings = Array.isArray(section.settings) ? section.settings : [];
      for (const [key, value] of Object.entries(bindings)) {
        let setting = section.settings.find((item) => item.name === key);
        if (!setting) {
          setting = { name: key, value };
          section.settings.push(setting);
        } else {
          setting.value = value;
        }
      }
    }
  }

  return JSON.stringify(parsed, null, 4);
}

type LcuSettingData = Record<string, unknown>;

interface LcuSettingEnvelope<T extends LcuSettingData = LcuSettingData> {
  data: T | null;
  schemaVersion: number;
}

interface LcuProfilePrivacy {
  enabledState?: string;
  setting?: string;
}

interface LcuPrivacyView {
  anonymityEnabled?: boolean;
  nameOnlyAnonymityEnabled?: boolean;
}

interface LcuChatSettings {
  linkClickWarningEnabled?: boolean;
  moreUnreadsEnabled?: boolean;
  friendRequestToastsDisabled?: boolean;
  [key: string]: unknown;
}

interface LcuVoiceSettings {
  autoJoinTeamVoice?: boolean;
  currentCaptureDeviceHandle?: string;
  inputMode?: string;
  micLevel?: number;
  muteOnConnect?: boolean;
  vadSensitivity?: number;
  [key: string]: unknown;
}

interface LcuCaptureDevice {
  handle: string;
  name: string;
  is_current_device?: boolean;
  is_default?: boolean;
  usable?: boolean;
}

interface LcuBlockedPlayer {
  id?: string;
  puuid?: string;
  summonerId?: number;
  gameName?: string;
  gameTag?: string;
  icon?: number;
}

function getLcuClientForRoot(rootPath: string): LcuClient | null {
  const creds = readCredentialsForInstallRoot(rootPath);
  return creds ? new LcuClient(creds) : null;
}

async function getLcuSetting<T extends LcuSettingData>(
  client: LcuClient,
  scope: 'local' | 'account',
  category: string,
): Promise<LcuSettingEnvelope<T> | null> {
  try {
    return await client.get<LcuSettingEnvelope<T>>(`/lol-settings/v1/${scope}/${category}`);
  } catch {
    return null;
  }
}

async function patchLcuSetting<T extends LcuSettingData>(
  client: LcuClient,
  scope: 'local' | 'account',
  category: string,
  update: (data: T) => void,
): Promise<void> {
  const envelope = await getLcuSetting<T>(client, scope, category);
  if (!envelope || !envelope.data) return;
  update(envelope.data);
  await client.patch<void>(`/lol-settings/v1/${scope}/${category}`, envelope);
}

async function getLcuOptional<T>(client: LcuClient, requestPath: string): Promise<T | null> {
  try {
    return await client.get<T>(requestPath);
  } catch {
    return null;
  }
}

function optionalBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function mapBlockedPlayer(player: LcuBlockedPlayer): LolBlockedPlayer | null {
  const puuid = optionalString(player.puuid);
  const id = optionalString(player.id) ?? (puuid ? `${puuid}@pvp.net` : null);
  if (!puuid || !id) return null;
  return {
    id,
    puuid,
    summonerId: typeof player.summonerId === 'number' ? player.summonerId : 0,
    gameName: optionalString(player.gameName) ?? '',
    gameTag: optionalString(player.gameTag) ?? '',
    icon: typeof player.icon === 'number' ? player.icon : -1,
  };
}

function normalizeBlockedPlayers(players: unknown): LolBlockedPlayer[] {
  if (!Array.isArray(players)) return [];
  return players
    .map((player) => mapBlockedPlayer(player as LcuBlockedPlayer))
    .filter((player): player is LolBlockedPlayer => Boolean(player));
}

function findVoiceDeviceName(devices: LcuCaptureDevice[] | null, handle: string): string {
  if (!handle) return '';
  const device = devices?.find((item) => item.handle === handle);
  return device?.name ?? handle;
}

const CONFIG_WRITE_BLOCKED_PHASES = new Set([
  'ChampSelect',
  'GameStart',
  'InProgress',
  'Reconnect',
]);

async function assertConfigWriteAllowed(rootPath: string): Promise<void> {
  const client = getLcuClientForRoot(rootPath);
  if (!client) return;

  let phase: string;
  try {
    phase = await client.get<string>('/lol-gameflow/v1/gameflow-phase');
  } catch (error) {
    throw new Error(
      `无法确认当前游戏状态，已取消配置写入：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const normalizedPhase = String(phase).replace(/"/g, '');
  if (CONFIG_WRITE_BLOCKED_PHASES.has(normalizedPhase)) {
    throw new Error(`当前处于 ${normalizedPhase} 阶段，为避免配置损坏，禁止修改游戏配置`);
  }
}

async function mergeLiveClientSettings(rootPath: string, values: LolConfigValues): Promise<boolean> {
  const client = getLcuClientForRoot(rootPath);
  if (!client) return false;

  const localAudio = await getLcuSetting(client, 'local', 'lol-audio');
  const lowSpec = await getLcuSetting(client, 'local', 'lol-user-experience');
  const localVoice = await getLcuSetting(client, 'local', 'lol-premade-voice');
  const accountGeneral = await getLcuSetting(client, 'account', 'lol-general');
  const accountVoice = await getLcuSetting(client, 'account', 'lol-premade-voice');
  const accountNotifications = await getLcuSetting(client, 'account', 'lol-notifications');
  const chatSettings = await getLcuOptional<LcuChatSettings>(client, '/lol-chat/v1/settings');
  const premadeVoice = await getLcuOptional<LcuVoiceSettings>(client, '/lol-premade-voice/v1/settings');
  const captureDevices = await getLcuOptional<LcuCaptureDevice[]>(client, '/lol-premade-voice/v1/capturedevices');
  const blockedPlayers = await getLcuOptional<LcuBlockedPlayer[]>(client, '/lol-chat/v1/blocked-players');
  const profilePrivacy = await getLcuOptional<LcuProfilePrivacy>(client, '/lol-summoner/v1/current-summoner/profile-privacy');
  const privacyView = await getLcuOptional<LcuPrivacyView>(client, '/lol-summoner-profiles/v1/get-privacy-view');
  const gameSettings = await getLcuOptional<LcuGameSettings>(client, '/lol-game-settings/v1/game-settings');
  const inputSettings = await getLcuOptional<LcuInputSettings>(client, '/lol-game-settings/v1/input-settings');

  const masterSoundEnabled = optionalBool(localAudio?.data?.masterSoundEnabled);
  if (masterSoundEnabled !== null) values.client.clientAudioEnabled = masterSoundEnabled;

  const potatoModeEnabled = optionalBool(lowSpec?.data?.potatoModeEnabled);
  if (potatoModeEnabled !== null) values.client.lowSpecMode = potatoModeEnabled;

  const inputVolume = optionalNumber(localVoice?.data?.inputVolume);
  if (inputVolume !== null) values.client.voiceInputVolume = clamp(Math.round(inputVolume), 0, 100);

  const vadSensitivity = optionalNumber(localVoice?.data?.vadSensitivity);
  if (vadSensitivity !== null) values.client.voiceSensitivity = clamp(Math.round(vadSensitivity), 0, 100);

  const uploadCrashReports = optionalBool(accountGeneral?.data?.uploadCrashReports);
  if (uploadCrashReports !== null) values.client.uploadCrashReports = uploadCrashReports;

  const blockNonFriendGameInvites = optionalBool(accountNotifications?.data?.blockNonFriendGameInvites);
  if (blockNonFriendGameInvites !== null) values.client.blockNonFriendGameInvites = blockNonFriendGameInvites;

  const linkClickWarningEnabled = optionalBool(chatSettings?.linkClickWarningEnabled);
  if (linkClickWarningEnabled !== null) values.client.linkClickWarningEnabled = linkClickWarningEnabled;

  const moreUnreadsEnabled = optionalBool(chatSettings?.moreUnreadsEnabled);
  if (moreUnreadsEnabled !== null) values.client.moreUnreadsEnabled = moreUnreadsEnabled;

  const friendRequestToastsDisabled = optionalBool(chatSettings?.friendRequestToastsDisabled);
  if (friendRequestToastsDisabled !== null) values.client.friendRequestToastsEnabled = !friendRequestToastsDisabled;

  const teamVoiceEnabled = optionalBool(accountVoice?.data?.teamVoiceEnabled);
  if (teamVoiceEnabled !== null) values.client.teamVoiceEnabled = teamVoiceEnabled;

  const autoJoinTeamVoice = optionalBool(accountVoice?.data?.autoJoinTeamVoice);
  if (autoJoinTeamVoice !== null) values.client.autoJoinTeamVoice = autoJoinTeamVoice;

  const muteOnConnect = optionalBool(accountVoice?.data?.muteOnConnect) ?? optionalBool(premadeVoice?.muteOnConnect);
  if (muteOnConnect !== null) values.client.muteOnConnect = muteOnConnect;

  const inputMode = optionalString(premadeVoice?.inputMode) ?? optionalString(accountVoice?.data?.inputMode);
  if (inputMode !== null) values.client.voiceInputMode = inputMode;

  const currentCaptureDeviceHandle = optionalString(premadeVoice?.currentCaptureDeviceHandle) ??
    optionalString(localVoice?.data?.currentCaptureDeviceHandle);
  if (currentCaptureDeviceHandle !== null) {
    values.client.voiceInputDeviceHandle = currentCaptureDeviceHandle;
    values.client.voiceInputDeviceName = findVoiceDeviceName(captureDevices, currentCaptureDeviceHandle);
  }

  const micLevel = optionalNumber(premadeVoice?.micLevel);
  if (micLevel !== null) values.client.voiceInputVolume = clamp(Math.round(micLevel), 0, 100);

  const liveVadSensitivity = optionalNumber(premadeVoice?.vadSensitivity);
  if (liveVadSensitivity !== null) values.client.voiceSensitivity = clamp(Math.round(liveVadSensitivity), 0, 100);

  if (profilePrivacy?.setting) {
    values.client.careerPrivate = profilePrivacy.setting.toUpperCase() === 'PRIVATE';
  }

  const nameOnlyAnonymityEnabled = optionalBool(privacyView?.nameOnlyAnonymityEnabled);
  if (nameOnlyAnonymityEnabled !== null) values.client.hideMyNameFromOthers = nameOnlyAnonymityEnabled;

  const anonymityEnabled = optionalBool(privacyView?.anonymityEnabled);
  if (anonymityEnabled !== null) values.client.hideMyIdentityFromOthers = anonymityEnabled;

  if (gameSettings) mergeLiveGameSettings(values, gameSettings);
  if (inputSettings) mergeLiveInputSettings(values, inputSettings);
  if (blockedPlayers) values.client.blockedPlayers = normalizeBlockedPlayers(blockedPlayers);

  return true;
}

async function syncValuesToLcu(rootPath: string, values: LolConfigValues): Promise<boolean> {
  const client = getLcuClientForRoot(rootPath);
  if (!client) return false;

  const settings = await client.get<LcuGameSettings>('/lol-game-settings/v1/game-settings');
  applyGameValuesToLcuSettings(settings, values);

  await client.patch('/lol-game-settings/v1/game-settings', settings);

  const inputSettings = await getLcuOptional<LcuInputSettings>(client, '/lol-game-settings/v1/input-settings');
  if (inputSettings) {
    applyHotkeysToLcuInputSettings(inputSettings, values);
    await client.patch('/lol-game-settings/v1/input-settings', inputSettings);
  }

  await patchLcuSetting(client, 'local', 'lol-audio', (data) => {
    data.masterSoundEnabled = values.client.clientAudioEnabled;
  });
  await patchLcuSetting(client, 'local', 'lol-user-experience', (data) => {
    data.potatoModeEnabled = values.client.lowSpecMode;
    if ('hasBeenPromptedForPotatoMode' in data) data.hasBeenPromptedForPotatoMode = true;
  });
  await patchLcuSetting(client, 'local', 'lol-premade-voice', (data) => {
    if (values.client.voiceInputDeviceHandle) data.currentCaptureDeviceHandle = values.client.voiceInputDeviceHandle;
    data.inputVolume = Math.round(clamp(values.client.voiceInputVolume, 0, 100));
    data.vadSensitivity = Math.round(clamp(values.client.voiceSensitivity, 0, 100));
  });
  await patchLcuSetting(client, 'account', 'lol-general', (data) => {
    data.uploadCrashReports = values.client.uploadCrashReports;
  });
  await patchLcuSetting(client, 'account', 'lol-notifications', (data) => {
    data.blockNonFriendGameInvites = values.client.blockNonFriendGameInvites;
  });
  await patchLcuSetting(client, 'account', 'lol-premade-voice', (data) => {
    data.teamVoiceEnabled = values.client.teamVoiceEnabled;
    data.autoJoinTeamVoice = values.client.autoJoinTeamVoice;
    data.muteOnConnect = values.client.muteOnConnect;
    data.inputMode = values.client.voiceInputMode;
  });

  const chatSettings = await getLcuOptional<LcuChatSettings>(client, '/lol-chat/v1/settings');
  if (chatSettings) {
    chatSettings.linkClickWarningEnabled = values.client.linkClickWarningEnabled;
    chatSettings.moreUnreadsEnabled = values.client.moreUnreadsEnabled;
    chatSettings.friendRequestToastsDisabled = !values.client.friendRequestToastsEnabled;
    await client.put<void>('/lol-chat/v1/settings', chatSettings);
  }

  if (values.client.voiceInputDeviceHandle) {
    await client.put<void>('/lol-premade-voice/v1/capturedevices', values.client.voiceInputDeviceHandle);
  }

  await client.put<void>(
    '/lol-summoner/v1/current-summoner/profile-privacy',
    values.client.careerPrivate ? 'PRIVATE' : 'PUBLIC',
  );

  const privacyView = await getLcuOptional<LcuPrivacyView>(client, '/lol-summoner-profiles/v1/get-privacy-view');
  if (privacyView) {
    privacyView.nameOnlyAnonymityEnabled = values.client.hideMyNameFromOthers;
    privacyView.anonymityEnabled = values.client.hideMyIdentityFromOthers;
    await client.post<void>('/lol-summoner-profiles/v1/pco/privacy', JSON.stringify(privacyView));
  }

  return true;
}

function applyLcuLocalValuesToContent(content: string, values: LolConfigValues): string {
  let next = content;
  next = setFirstYamlScalar(next, 'masterSoundEnabled', values.client.clientAudioEnabled);
  next = setFirstYamlScalar(next, 'potatoModeEnabled', values.client.lowSpecMode);
  next = setFirstYamlScalar(next, 'hasBeenPromptedForPotatoMode', true);
  if (values.client.voiceInputDeviceHandle) {
    next = setFirstYamlScalar(next, 'currentCaptureDeviceHandle', values.client.voiceInputDeviceHandle);
  }
  next = setFirstYamlScalar(next, 'inputVolume', values.client.voiceInputVolume);
  next = setFirstYamlScalar(next, 'vadSensitivity', values.client.voiceSensitivity);
  return next;
}

function applyLcuAccountValuesToContent(content: string, values: LolConfigValues): string {
  let next = content;
  next = setFirstYamlScalar(next, 'uploadCrashReports', values.client.uploadCrashReports);
  next = setFirstYamlScalar(next, 'blockNonFriendGameInvites', values.client.blockNonFriendGameInvites);
  next = setFirstYamlScalar(next, 'teamVoiceEnabled', values.client.teamVoiceEnabled);
  next = setFirstYamlScalar(next, 'autoJoinTeamVoice', values.client.autoJoinTeamVoice);
  next = setFirstYamlScalar(next, 'muteOnConnect', values.client.muteOnConnect);
  next = setFirstYamlScalar(next, 'inputMode', values.client.voiceInputMode);
  return next;
}

function markLeagueClientSettingsModified(content: string): string {
  const now = Date.now();
  let next = content;
  for (const section of ['game-settings', 'lcu-settings']) {
    next = setYamlSectionChildScalar(next, section, 'modified', true);
    next = setYamlSectionChildScalar(next, section, 'timestamp', now);
  }
  return next;
}

function createBackupDir(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(app.getPath('userData'), 'lol-config-backups', stamp);
  return backupDir;
}

function buildClientWritePlans(rootPath: string, values: LolConfigValues): FileWritePlan[] {
  const paths = getConfigPaths(rootPath);
  const plans: FileWritePlan[] = [];

  const localPrefs = readText(paths.lcuLocalPreferences);
  if (localPrefs !== null) {
    plans.push({
      filePath: paths.lcuLocalPreferences,
      content: applyLcuLocalValuesToContent(localPrefs, values),
    });
  }

  const accountPrefs = readText(paths.lcuAccountPreferences);
  if (accountPrefs !== null) {
    plans.push({
      filePath: paths.lcuAccountPreferences,
      content: applyLcuAccountValuesToContent(accountPrefs, values),
    });
  }

  const leagueClientSettings = readText(paths.leagueClientSettings);
  if (leagueClientSettings !== null) {
    plans.push({
      filePath: paths.leagueClientSettings,
      content: markLeagueClientSettingsModified(leagueClientSettings),
    });
  }

  return plans;
}

function buildValueWritePlans(
  rootPath: string,
  values: LolConfigValues,
  snapshots: ConfigProfileSnapshots = {},
): FileWritePlan[] {
  const paths = getConfigPaths(rootPath);
  const plans: FileWritePlan[] = [];

  const gameCfg = snapshots.gameCfg ?? readText(paths.gameCfg);
  if (gameCfg !== null) {
    plans.push({
      filePath: paths.gameCfg,
      content: applyGameValuesToContent(gameCfg, values),
    });
  }

  const inputIni = snapshots.inputIni ?? readText(paths.inputIni);
  if (inputIni !== null) {
    plans.push({
      filePath: paths.inputIni,
      content: applyInputValuesToContent(inputIni, values),
    });
  }

  const persistedSettings = snapshots.persistedSettings ?? readText(paths.persistedSettings);
  if (persistedSettings !== null) {
    plans.push({
      filePath: paths.persistedSettings,
      content: applyPersistedValuesToContent(persistedSettings, values),
    });
  }

  return [...plans, ...buildClientWritePlans(rootPath, values)];
}

function applyValuesToDisk(
  rootPath: string,
  values: LolConfigValues,
  snapshots: ConfigProfileSnapshots = {},
): LolConfigApplyResult {
  if (!rootLooksValid(rootPath)) {
    throw new Error(`未找到英雄联盟配置目录：${rootPath}`);
  }

  // 所有转换（包括 JSON 解析）必须在任何磁盘写入之前完成。
  const plans = buildValueWritePlans(rootPath, values, snapshots);
  const backupDir = createBackupDir();
  const filesWritten = executeFileTransaction(rootPath, backupDir, plans);

  return {
    rootPath,
    backupDir: filesWritten.length > 0 ? backupDir : null,
    filesWritten,
    lcuSynced: false,
  };
}

function buildSnapshots(rootPath: string, values: LolConfigValues): ConfigProfileSnapshots {
  const paths = getConfigPaths(rootPath);
  const gameCfg = readText(paths.gameCfg);
  const inputIni = readText(paths.inputIni);
  const persistedSettings = readText(paths.persistedSettings);

  return {
    gameCfg: gameCfg !== null ? applyGameValuesToContent(gameCfg, values) : undefined,
    inputIni: inputIni !== null ? applyInputValuesToContent(inputIni, values) : undefined,
    persistedSettings: persistedSettings !== null
      ? applyPersistedValuesToContent(persistedSettings, values)
      : undefined,
  };
}

export async function readLeagueConfig(rootPath?: string): Promise<{
  rootPath: string;
  found: boolean;
  values: LolConfigValues;
  files: LolConfigFileStatus[];
  profiles: LolConfigProfileSummary[];
  warnings: string[];
}> {
  const resolvedRootPath = resolveRootPath(rootPath);
  const found = rootLooksValid(resolvedRootPath);
  const files = getFileStatuses(resolvedRootPath);
  const warnings: string[] = [];

  if (!found) {
    warnings.push(`未找到英雄联盟配置目录：${resolvedRootPath}`);
  }
  for (const file of files) {
    if (!file.exists) warnings.push(`缺少 ${file.label}`);
  }

  const values = found ? readValues(resolvedRootPath) : cloneDefaultValues();
  if (found) {
    try {
      const liveMerged = await mergeLiveClientSettings(resolvedRootPath, values);
      if (!liveMerged) warnings.push('未检测到正在运行的 League Client，读取的是磁盘配置');
    } catch (err) {
      warnings.push(`读取正在运行的客户端设置失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    rootPath: resolvedRootPath,
    found,
    values,
    files,
    profiles: listProfileSummaries(normalizeValues),
    warnings,
  };
}

export async function applyLeagueConfigValues(
  rootPath: string | undefined,
  values: LolConfigValues,
): Promise<LolConfigApplyResult> {
  const resolvedRootPath = resolveRootPath(rootPath);
  await assertConfigWriteAllowed(resolvedRootPath);
  const normalizedValues = normalizeValues(values);
  const result = applyValuesToDisk(resolvedRootPath, normalizedValues);
  try {
    result.lcuSynced = await syncValuesToLcu(resolvedRootPath, normalizedValues);
  } catch (err) {
    console.warn('[config] LCU sync failed:', err);
    result.lcuSynced = false;
    result.lcuError = err instanceof Error ? err.message : String(err);
  }
  return result;
}

export function saveLeagueConfigProfile(
  name: string,
  rootPath: string | undefined,
  values: LolConfigValues,
): LolConfigProfileSummary[] {
  const resolvedRootPath = resolveRootPath(rootPath);
  const store = readProfileStore(normalizeValues);
  const trimmedName = name.trim() || '我的配置';
  const now = Date.now();
  const existing = store.profiles.find((profile) => profile.name === trimmedName);
  const normalizedValues = normalizeValues(values);

  if (existing) {
    existing.updatedAt = now;
    existing.sourceRootPath = resolvedRootPath;
    existing.values = normalizedValues;
    existing.snapshots = buildSnapshots(resolvedRootPath, normalizedValues);
    existing.gameResolution = gameResolution(normalizedValues);
  } else {
    store.profiles.push({
      id: crypto.randomUUID(),
      name: trimmedName,
      createdAt: now,
      updatedAt: now,
      sourceRootPath: resolvedRootPath,
      gameResolution: gameResolution(normalizedValues),
      values: normalizedValues,
      snapshots: buildSnapshots(resolvedRootPath, normalizedValues),
    });
  }

  writeProfileStore(store);
  return listProfileSummaries(normalizeValues);
}

export async function applyLeagueConfigProfile(
  profileId: string,
  rootPath?: string,
): Promise<LolConfigApplyResult> {
  const store = readProfileStore(normalizeValues);
  const profile = store.profiles.find((item) => item.id === profileId);
  if (!profile) {
    throw new Error('未找到要应用的配置方案');
  }

  const resolvedRootPath = resolveRootPath(rootPath);
  await assertConfigWriteAllowed(resolvedRootPath);
  const normalizedValues = normalizeValues(profile.values);
  const result = applyValuesToDisk(resolvedRootPath, normalizedValues, profile.snapshots);

  let lcuSynced = false;
  let lcuError: string | undefined;
  try {
    lcuSynced = await syncValuesToLcu(resolvedRootPath, normalizedValues);
  } catch (err) {
    console.warn('[config] LCU sync failed:', err);
    lcuError = err instanceof Error ? err.message : String(err);
  }

  return {
    rootPath: resolvedRootPath,
    backupDir: result.backupDir,
    filesWritten: result.filesWritten,
    lcuSynced,
    lcuError,
  };
}

export function deleteLeagueConfigProfile(profileId: string): LolConfigProfileSummary[] {
  const store = readProfileStore(normalizeValues);
  store.profiles = store.profiles.filter((profile) => profile.id !== profileId);
  writeProfileStore(store);
  return listProfileSummaries(normalizeValues);
}
