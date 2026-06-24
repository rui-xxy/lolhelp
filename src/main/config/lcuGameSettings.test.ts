import { describe, expect, it } from 'vitest';
import type { LolConfigValues } from '../../shared/api';
import {
  applyGameValuesToLcuSettings,
  applyHotkeysToLcuInputSettings,
  mergeLiveGameSettings,
} from './lcuGameSettings';

function values(): LolConfigValues {
  return {
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
    hotkeys: { Quickbinds: { smart: '1' } },
  };
}

describe('LCU game settings mapping', () => {
  it('merges numeric ratios and booleans from live settings', () => {
    const current = values();
    mergeLiveGameSettings(current, {
      General: { GameMouseSpeed: 12, EnableAudio: false },
      HUD: { MapScrollSpeed: 0.75, HidePlayerNames: true },
    });
    expect(current.game.gameMouseSpeed).toBe(60);
    expect(current.game.mapScrollSpeed).toBe(75);
    expect(current.game.enableAudio).toBe(false);
    expect(current.client.hideAllPlayerNamesForMe).toBe(true);
  });

  it('only updates keys exposed by the LCU payload', () => {
    const current = values();
    current.game.masterVolume = 75;
    current.game.showAttackRadius = false;
    const settings = {
      General: { GameMouseSpeed: 10 },
      HUD: { ShowAttackRadius: true },
      Volume: { MasterVolume: 1 },
    };
    applyGameValuesToLcuSettings(settings, current);
    expect(settings.General.GameMouseSpeed).toBe(10);
    expect(settings.HUD.ShowAttackRadius).toBe(false);
    expect(settings.Volume.MasterVolume).toBe(0.75);
    expect(settings.General).not.toHaveProperty('WindowMode');
  });

  it('preserves input-setting value types', () => {
    const current = values();
    const settings = { Quickbinds: { smart: 0 } };
    applyHotkeysToLcuInputSettings(settings, current);
    expect(settings.Quickbinds.smart).toBe(1);
  });
});
