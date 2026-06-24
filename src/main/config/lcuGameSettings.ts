import type { LolConfigValues, LolHotkeyValues } from '../../shared/api';
import { clamp } from './configText';
import {
  coerceHotkeyValue,
  type LcuInputSettings,
} from './hotkeyValues';

export type LcuGameSettings = Record<
  string,
  Record<string, boolean | number | string>
>;

function setLcuValue(
  settings: LcuGameSettings,
  section: string,
  key: string,
  value: boolean | number | string,
): void {
  if (!settings[section] || !(key in settings[section])) return;
  settings[section][key] = value;
}

function readLcuGameValue(
  settings: LcuGameSettings,
  section: string,
  key: string,
): boolean | number | string | undefined {
  return settings[section]?.[key];
}

export function mergeLiveGameSettings(
  values: LolConfigValues,
  settings: LcuGameSettings,
): void {
  const boolValue = (section: string, key: string, apply: (value: boolean) => void) => {
    const value = readLcuGameValue(settings, section, key);
    if (typeof value === 'boolean') apply(value);
  };
  const numberValue = (section: string, key: string, apply: (value: number) => void) => {
    const value = readLcuGameValue(settings, section, key);
    if (typeof value === 'number' && Number.isFinite(value)) apply(value);
  };
  const percentValue = (section: string, key: string, apply: (value: number) => void) => {
    numberValue(section, key, (value) => apply(clamp(Math.round(value * 100), 0, 100)));
  };

  numberValue('General', 'GameMouseSpeed', (value) => { values.game.gameMouseSpeed = clamp(Math.round(value * 5), 0, 100); });
  boolValue('General', 'SnapCameraOnRespawn', (value) => { values.game.snapCameraOnRespawn = value; });
  boolValue('General', 'AutoAcquireTarget', (value) => { values.game.autoAcquireTarget = value; });
  boolValue('General', 'EnableTargetedAttackMove', (value) => { values.game.enableTargetedAttackMove = value; });
  boolValue('General', 'ShowTurretRangeIndicators', (value) => { values.game.showTurretRangeIndicators = value; });
  boolValue('General', 'PredictMovement', (value) => { values.game.predictMovement = value; });
  boolValue('General', 'RecommendJunglePaths', (value) => { values.game.recommendJunglePaths = value; });
  boolValue('General', 'TargetChampionsOnlyAsToggle', (value) => { values.game.targetChampionsOnlyAsToggle = value; });
  numberValue('General', 'WindowMode', (value) => { values.game.windowMode = String(value); });
  boolValue('General', 'EnableAudio', (value) => { values.game.enableAudio = value; });
  percentValue('General', 'CursorScale', (value) => { values.game.cursorScale = value; });
  boolValue('General', 'WaitForVerticalSync', (value) => { values.game.waitForVerticalSync = value; });

  percentValue('HUD', 'MapScrollSpeed', (value) => { values.game.mapScrollSpeed = value; });
  percentValue('HUD', 'KeyboardScrollSpeed', (value) => { values.game.keyboardScrollSpeed = value; });
  boolValue('HUD', 'ScrollSmoothingEnabled', (value) => { values.game.scrollSmoothingEnabled = value; });
  boolValue('HUD', 'MiddleClickDragScrollEnabled', (value) => { values.game.middleClickDragScrollEnabled = value; });
  numberValue('HUD', 'CameraLockMode', (value) => { values.game.cameraLockMode = value; });
  boolValue('HUD', 'AutoDisplayTarget', (value) => { values.game.autoDisplayTarget = value; });
  boolValue('HUD', 'ShowAttackRadius', (value) => { values.game.showAttackRadius = value; });
  boolValue('HUD', 'DisableHudSpellClick', (value) => { values.game.disableHudSpellClick = value; });
  percentValue('HUD', 'GlobalScale', (value) => { values.game.globalScale = value; });
  numberValue('HUD', 'ChatScale', (value) => { values.game.chatScale = value; });
  percentValue('HUD', 'MinimapScale', (value) => { values.game.minimapScale = value; });
  boolValue('HUD', 'ShowFPSAndLatency', (value) => { values.game.showFpsAndLatency = value; });
  boolValue('HUD', 'ShowTimestamps', (value) => { values.game.showTimestamps = value; });
  boolValue('HUD', 'ShowAlliedChat', (value) => { values.game.showAlliedChat = value; });
  boolValue('HUD', 'ShowAllChannelChat', (value) => { values.game.showAllChannelChat = value; });
  boolValue('HUD', 'HidePlayerNames', (value) => {
    values.game.hidePlayerNames = value;
    values.client.hideAllPlayerNamesForMe = value;
  });
  boolValue('HUD', 'HideMyNameToOthers', (value) => { values.client.hideMyNameFromOthers = value; });
  numberValue('HUD', 'ShowSummonerNames', (value) => { values.game.showSummonerNames = value; });
  boolValue('HUD', 'FlashScreenWhenDamaged', (value) => { values.game.flashScreenWhenDamaged = value; });
  boolValue('HUD', 'FlashScreenWhenStunned', (value) => { values.game.flashScreenWhenStunned = value; });
  boolValue('HUD', 'ShowOffScreenPointsOfInterest', (value) => { values.game.showOffScreenPointsOfInterest = value; });
  boolValue('HUD', 'EnableLineMissileVis', (value) => { values.game.enableLineMissileVis = value; });
  boolValue('HUD', 'ShowSpellCosts', (value) => { values.game.showSpellCosts = value; });
  boolValue('HUD', 'ShowSpellRecommendations', (value) => { values.game.showSpellRecommendations = value; });
  boolValue('HUD', 'ShowPlayerStats', (value) => { values.game.showPlayerStats = value; });
  boolValue('HUD', 'ShowNeutralCamps', (value) => { values.game.showNeutralCamps = value; });
  numberValue('HUD', 'NumericCooldownFormat', (value) => { values.game.numericCooldownFormat = value; });

  boolValue('Performance', 'EnableHUDAnimations', (value) => { values.game.enableHudAnimations = value; });
  numberValue('Performance', 'ShadowQuality', (value) => { values.game.shadowQuality = value; });
  numberValue('Performance', 'CharacterQuality', (value) => { values.game.characterQuality = value; });
  numberValue('Performance', 'EffectsQuality', (value) => { values.game.effectsQuality = value; });
  numberValue('Performance', 'EnvironmentQuality', (value) => { values.game.environmentQuality = value; });
  numberValue('Performance', 'FrameCapType', (value) => { values.game.frameCapType = value; });
  boolValue('Performance', 'EnableFXAA', (value) => { values.game.enableFxaa = value; });

  percentValue('Volume', 'MasterVolume', (value) => { values.game.masterVolume = value; });
  boolValue('Volume', 'MasterMute', (value) => { values.game.masterMute = value; });
  percentValue('Volume', 'MusicVolume', (value) => { values.game.musicVolume = value; });
  boolValue('Volume', 'MusicMute', (value) => { values.game.musicMute = value; });
  percentValue('Volume', 'SfxVolume', (value) => { values.game.sfxVolume = value; });
  boolValue('Volume', 'SfxMute', (value) => { values.game.sfxMute = value; });
  percentValue('Volume', 'AmbienceVolume', (value) => { values.game.ambienceVolume = value; });
  boolValue('Volume', 'AmbienceMute', (value) => { values.game.ambienceMute = value; });
  percentValue('Volume', 'PingsVolume', (value) => { values.game.pingsVolume = value; });
  boolValue('Volume', 'PingsMute', (value) => { values.game.pingsMute = value; });
  percentValue('Volume', 'AnnouncerVolume', (value) => { values.game.announcerVolume = value; });
  boolValue('Volume', 'AnnouncerMute', (value) => { values.game.announcerMute = value; });
  percentValue('Volume', 'VoiceVolume', (value) => { values.game.voiceVolume = value; });
  boolValue('Volume', 'VoiceMute', (value) => { values.game.voiceMute = value; });
}

export function applyGameValuesToLcuSettings(
  settings: LcuGameSettings,
  values: LolConfigValues,
): void {
  const set = (section: string, key: string, value: boolean | number | string) =>
    setLcuValue(settings, section, key, value);

  set('General', 'LowSpecMachineAdaptation', values.client.lowSpecMode);
  set('General', 'DisableInteractiveBackground', values.client.disableInteractiveBackground);
  set('General', 'CloseClientDuringGame', values.client.closeClientDuringGame);
  set('General', 'DisableChampionSkillText', values.client.disableChampionSkillText);
  set('General', 'GameMouseSpeed', Math.round(clamp(values.game.gameMouseSpeed, 0, 100) / 5));
  set('General', 'SnapCameraOnRespawn', values.game.snapCameraOnRespawn);
  set('General', 'AutoAcquireTarget', values.game.autoAcquireTarget);
  set('General', 'EnableTargetedAttackMove', values.game.enableTargetedAttackMove);
  set('General', 'ShowTurretRangeIndicators', values.game.showTurretRangeIndicators);
  set('General', 'PredictMovement', values.game.predictMovement);
  set('General', 'RecommendJunglePaths', values.game.recommendJunglePaths);
  set('General', 'TargetChampionsOnlyAsToggle', values.game.targetChampionsOnlyAsToggle);
  set('General', 'WindowMode', Number(values.game.windowMode));
  set('General', 'EnableAudio', values.game.enableAudio);
  set('General', 'CursorScale', clamp(values.game.cursorScale, 0, 100) / 100);
  set('General', 'WaitForVerticalSync', values.game.waitForVerticalSync);

  set('HUD', 'MapScrollSpeed', clamp(values.game.mapScrollSpeed, 0, 100) / 100);
  set('HUD', 'KeyboardScrollSpeed', clamp(values.game.keyboardScrollSpeed, 0, 100) / 100);
  set('HUD', 'ScrollSmoothingEnabled', values.game.scrollSmoothingEnabled);
  set('HUD', 'MiddleClickDragScrollEnabled', values.game.middleClickDragScrollEnabled);
  set('HUD', 'CameraLockMode', values.game.cameraLockMode);
  set('HUD', 'AutoDisplayTarget', values.game.autoDisplayTarget);
  set('HUD', 'ShowAttackRadius', values.game.showAttackRadius);
  set('HUD', 'GlobalScale', clamp(values.game.globalScale, 0, 100) / 100);
  set('HUD', 'ChatScale', values.game.chatScale);
  set('HUD', 'MinimapScale', clamp(values.game.minimapScale, 0, 100) / 100);
  set('HUD', 'ShowFPSAndLatency', values.game.showFpsAndLatency);
  set('HUD', 'ShowTimestamps', values.game.showTimestamps);
  set('HUD', 'ShowAlliedChat', values.game.showAlliedChat);
  set('HUD', 'ShowAllChannelChat', values.game.showAllChannelChat);
  set('HUD', 'HidePlayerNames', values.client.hideAllPlayerNamesForMe);
  set('HUD', 'HideMyNameToOthers', values.client.hideMyNameFromOthers);
  set('HUD', 'ShowSummonerNames', values.game.showSummonerNames);
  set('HUD', 'FlashScreenWhenDamaged', values.game.flashScreenWhenDamaged);
  set('HUD', 'FlashScreenWhenStunned', values.game.flashScreenWhenStunned);
  set('HUD', 'ShowOffScreenPointsOfInterest', values.game.showOffScreenPointsOfInterest);
  set('HUD', 'EnableLineMissileVis', values.game.enableLineMissileVis);
  set('HUD', 'ShowSpellCosts', values.game.showSpellCosts);
  set('HUD', 'ShowSpellRecommendations', values.game.showSpellRecommendations);
  set('HUD', 'DisableHudSpellClick', values.game.disableHudSpellClick);
  set('HUD', 'ShowPlayerStats', values.game.showPlayerStats);
  set('HUD', 'ShowNeutralCamps', values.game.showNeutralCamps);
  set('HUD', 'NumericCooldownFormat', values.game.numericCooldownFormat);

  set('Performance', 'EnableHUDAnimations', values.game.enableHudAnimations);
  set('Performance', 'ShadowQuality', values.game.shadowQuality);
  set('Performance', 'CharacterQuality', values.game.characterQuality);
  set('Performance', 'EffectsQuality', values.game.effectsQuality);
  set('Performance', 'EnvironmentQuality', values.game.environmentQuality);
  set('Performance', 'FrameCapType', values.game.frameCapType);
  set('Performance', 'EnableFXAA', values.game.enableFxaa);

  const percent = (value: number) => clamp(value, 0, 100) / 100;
  set('Volume', 'MasterVolume', percent(values.game.masterVolume));
  set('Volume', 'MasterMute', values.game.masterMute);
  set('Volume', 'MusicVolume', percent(values.game.musicVolume));
  set('Volume', 'MusicMute', values.game.musicMute);
  set('Volume', 'SfxVolume', percent(values.game.sfxVolume));
  set('Volume', 'SfxMute', values.game.sfxMute);
  set('Volume', 'AmbienceVolume', percent(values.game.ambienceVolume));
  set('Volume', 'AmbienceMute', values.game.ambienceMute);
  set('Volume', 'PingsVolume', percent(values.game.pingsVolume));
  set('Volume', 'PingsMute', values.game.pingsMute);
  set('Volume', 'AnnouncerVolume', percent(values.game.announcerVolume));
  set('Volume', 'AnnouncerMute', values.game.announcerMute);
  set('Volume', 'VoiceVolume', percent(values.game.voiceVolume));
  set('Volume', 'VoiceMute', values.game.voiceMute);
}

export function mergeLiveInputSettings(
  values: LolConfigValues,
  settings: LcuInputSettings,
): void {
  const hotkeys: LolHotkeyValues = {};
  for (const [section, bindings] of Object.entries(settings)) {
    const nextBindings: Record<string, string> = {};
    for (const [key, value] of Object.entries(bindings)) {
      nextBindings[key] = value == null ? 'null' : String(value);
    }
    if (Object.keys(nextBindings).length > 0) hotkeys[section] = nextBindings;
  }
  if (Object.keys(hotkeys).length > 0) values.hotkeys = hotkeys;
}

export function applyHotkeysToLcuInputSettings(
  settings: LcuInputSettings,
  values: LolConfigValues,
): void {
  for (const [section, bindings] of Object.entries(values.hotkeys)) {
    settings[section] = settings[section] ?? {};
    for (const [key, value] of Object.entries(bindings)) {
      settings[section][key] = coerceHotkeyValue(value, settings[section][key]);
    }
  }
}
