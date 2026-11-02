import { describe, expect, it } from 'vitest';
import type { LolConfigValues } from '../../../shared/api';
import { buildConfigDiff, revertConfigRow } from './configDiff';
import { countPartDiffs } from './configFields';

const base = (): LolConfigValues => ({
  client: {
    lowSpecMode: false, disableInteractiveBackground: false, closeClientDuringGame: false, disableChampionSkillText: false,
    clientAudioEnabled: true, uploadCrashReports: true, careerPrivate: false, blockNonFriendGameInvites: false,
    linkClickWarningEnabled: true, moreUnreadsEnabled: true, friendRequestToastsEnabled: true, teamVoiceEnabled: true,
    autoJoinTeamVoice: false, muteOnConnect: false, voiceInputMode: 'pushToTalk', voiceInputDeviceHandle: 'a',
    voiceInputDeviceName: '麦克风 A', voiceInputVolume: 50, voiceSensitivity: 50, hideAllPlayerNamesForMe: false,
    hideMyNameFromOthers: false, hideMyIdentityFromOthers: false, blockedPlayers: [],
  },
  game: {
    gameMouseSpeed: 50, mapScrollSpeed: 50, keyboardScrollSpeed: 50, snapCameraOnRespawn: true, scrollSmoothingEnabled: false,
    middleClickDragScrollEnabled: true, cameraLockMode: 0, autoAcquireTarget: false, autoDisplayTarget: true, showAttackRadius: true,
    enableTargetedAttackMove: true, disableHudSpellClick: false, showTurretRangeIndicators: true, predictMovement: true,
    recommendJunglePaths: false, targetChampionsOnlyAsToggle: true, windowMode: '2', width: 2560, height: 1440, enableAudio: true,
    cursorScale: 40, enableHudAnimations: true, shadowQuality: 1, characterQuality: 3, effectsQuality: 2, environmentQuality: 2,
    frameCapType: 2, waitForVerticalSync: false, enableFxaa: false, globalScale: 30, chatScale: 70, minimapScale: 72,
    showFpsAndLatency: true, showTimestamps: true, showAlliedChat: true, showAllChannelChat: false, hidePlayerNames: false,
    showSummonerNames: 1, flashScreenWhenDamaged: true, flashScreenWhenStunned: true, showOffScreenPointsOfInterest: true,
    enableLineMissileVis: true, showSpellCosts: true, showSpellRecommendations: false, showPlayerStats: true, showNeutralCamps: true,
    numericCooldownFormat: 1, masterVolume: 70, masterMute: false, musicVolume: 0, musicMute: true, sfxVolume: 80, sfxMute: false,
    ambienceVolume: 35, ambienceMute: false, pingsVolume: 90, pingsMute: false, announcerVolume: 60, announcerMute: false,
    voiceVolume: 75, voiceMute: false,
  },
  hotkeys: {
    GameEvents: { evtCastSpell1: '[q]', evtCastSpell4: '[r]', evtOpenShop: '[p]' },
    Quickbinds: { evtCastSpell1smart: '1' },
  },
});

describe('config diff', () => {
  it('lists every differing row by part, in the same order as the settings page', () => {
    const account = base();
    const profile = base();
    profile.game.width = 1920;
    profile.game.height = 1080;
    profile.game.musicMute = false;
    profile.client.careerPrivate = true;
    profile.client.voiceInputDeviceName = '麦克风 B';
    profile.hotkeys.GameEvents.evtOpenShop = '[o]';
    profile.hotkeys.Quickbinds.evtCastSpell1smart = '0';

    const groups = buildConfigDiff(profile, account);
    expect(groups.map((group) => group.part)).toEqual(['video', 'audio', 'hotkeys', 'client']);
    expect(groups[0].rows).toEqual([{ id: 'game.width', part: 'video', label: '分辨率', before: '2560 × 1440', after: '1920 × 1080' }]);
    expect(groups[1].rows[0].before).toBe('静音');
    expect(groups[2].rows.map((row) => [row.label, row.before, row.after])).toEqual([['打开商店', 'P', 'O'], ['Q 快捷施法', '开', '关']]);
    // 麦克风是这台电脑的设备，不算差异。
    expect(groups[3].rows.map((row) => row.id)).toEqual(['client.careerPrivate']);

    const counts = countPartDiffs(profile, account);
    for (const group of groups) expect(counts[group.part]).toBe(group.rows.length);
  });

  it('puts one row back the way the other side has it, linked values included', () => {
    const account = base();
    const profile = base();
    profile.game.width = 1920;
    profile.game.height = 1080;
    profile.game.musicVolume = 40;
    profile.game.musicMute = false;
    profile.hotkeys.GameEvents.evtCastSpell4 = '[t]';

    let next = revertConfigRow(profile, account, 'game.width');
    expect([next.game.width, next.game.height]).toEqual([2560, 1440]);
    next = revertConfigRow(next, account, 'game.musicVolume');
    expect([next.game.musicVolume, next.game.musicMute]).toEqual([0, true]);
    next = revertConfigRow(next, account, 'hotkey.GameEvents.evtCastSpell4');
    expect(buildConfigDiff(next, account)).toHaveLength(0);
    // 原来的对象不动。
    expect(profile.game.width).toBe(1920);
  });

  it('keeps the shared "hide names" switch in step on both sides', () => {
    const account = base();
    const profile = base();
    profile.game.hidePlayerNames = true;
    profile.client.hideAllPlayerNamesForMe = true;
    const groups = buildConfigDiff(profile, account);
    expect(groups.flatMap((group) => group.rows.map((row) => row.id))).toEqual(['game.hidePlayerNames']);
    const next = revertConfigRow(profile, account, 'game.hidePlayerNames');
    expect([next.game.hidePlayerNames, next.client.hideAllPlayerNamesForMe]).toEqual([false, false]);
  });
});
