import { useCallback, useState } from 'react';
import type { LolGameConfigValues } from '../../../shared/api';
import {
  CAMERA_LOCK_OPTIONS,
  COOLDOWN_FORMAT_OPTIONS,
  FRAME_CAP_OPTIONS,
  GAME_FIELDS,
  QUALITY_OPTIONS,
  RESOLUTION_PRESETS,
  SUMMONER_NAME_OPTIONS,
  WINDOW_MODES,
} from './configFields';
import {
  CheckboxRow,
  SectionTabs,
  Segmented,
  SelectRow,
  SettingRow,
  SettingsGroup,
  SettingsSection,
  SliderRow,
  VolumeRow,
  scrollToSettingsSection,
  useSettingsScrollSpy,
} from './SettingsControls';

type GameSectionKey = 'video' | 'controls' | 'interface' | 'combat' | 'audio';

const GAME_SECTIONS: { key: GameSectionKey; label: string }[] = [
  { key: 'video', label: '画面' },
  { key: 'controls', label: '操作' },
  { key: 'interface', label: '界面' },
  { key: 'combat', label: '战斗提示' },
  { key: 'audio', label: '声音' },
];

const NO_SECTIONS: { key: GameSectionKey; label: string }[] = [];

const QUALITY_KEYS = ['shadowQuality', 'characterQuality', 'effectsQuality', 'environmentQuality'] as const;

type Change = <K extends keyof LolGameConfigValues>(key: K, value: LolGameConfigValues[K]) => void;

function ResolutionPicker({ values, onChange }: { values: LolGameConfigValues; onChange: Change }) {
  const isPreset = RESOLUTION_PRESETS.some(([width, height]) => width === values.width && height === values.height);
  return (
    <div className="st-res">
      <div className="st-res__chips" role="radiogroup" aria-label="常用分辨率">
        {RESOLUTION_PRESETS.map(([width, height]) => (
          <button
            key={`${width}x${height}`}
            type="button"
            role="radio"
            aria-checked={values.width === width && values.height === height}
            onClick={() => {
              onChange('width', width);
              onChange('height', height);
            }}
          >
            {width} × {height}
          </button>
        ))}
      </div>
      <div className="st-res__custom" data-active={isPreset ? undefined : 'true'}>
        <span>{isPreset ? '其他' : '自定义'}</span>
        <input
          type="number"
          aria-label="宽"
          value={values.width}
          onChange={(event) => onChange('width', Number(event.target.value))}
        />
        <i>×</i>
        <input
          type="number"
          aria-label="高"
          value={values.height}
          onChange={(event) => onChange('height', Number(event.target.value))}
        />
      </div>
    </div>
  );
}

export function GameSettings({
  values,
  onChange,
  showNav = true,
  idPrefix = 'game',
}: {
  values: LolGameConfigValues;
  onChange: Change;
  /** 嵌进别的页面时不要自己的分区目录，由外面统一管。 */
  showNav?: boolean;
  /** 分区锚点的前缀：#{idPrefix}-section-video */
  idPrefix?: string;
}) {
  const [activeSection, setActiveSection] = useState<GameSectionKey>('video');
  useSettingsScrollSpy<GameSectionKey>(idPrefix, showNav ? GAME_SECTIONS : NO_SECTIONS, setActiveSection);

  const goToSection = useCallback((section: GameSectionKey) => {
    setActiveSection(section);
    scrollToSettingsSection(idPrefix, section);
  }, [idPrefix]);

  // 四项画质一样时，「整体画质」就亮在那一档；不一样时哪档都不亮。
  const qualities = QUALITY_KEYS.map((key) => values[key]);
  const overallQuality = qualities.every((quality) => quality === qualities[0]) ? qualities[0] : -1;

  return (
    <>
      {showNav && <SectionTabs sections={GAME_SECTIONS} active={activeSection} onSelect={goToSection} />}
      <div className="st-sections">
        <SettingsSection prefix={idPrefix} id="video" title="画面" description="分辨率和画质。改完下次进游戏生效。">
          <SettingsGroup>
            <SelectRow label={GAME_FIELDS.windowMode.label} value={values.windowMode} options={WINDOW_MODES} segmented onChange={(value) => onChange('windowMode', value)} />
            <SettingRow label={GAME_FIELDS.width.label} hint="一般选和显示器一样的" wide>
              <ResolutionPicker values={values} onChange={onChange} />
            </SettingRow>
            <SelectRow label={GAME_FIELDS.frameCapType.label} value={values.frameCapType} options={FRAME_CAP_OPTIONS} onChange={(value) => onChange('frameCapType', Number(value))} />
            <CheckboxRow label={GAME_FIELDS.waitForVerticalSync.label} hint="画面不撕裂，但会多一点操作延迟" checked={values.waitForVerticalSync} onChange={(value) => onChange('waitForVerticalSync', value)} />
            <CheckboxRow label={GAME_FIELDS.enableFxaa.label} checked={values.enableFxaa} onChange={(value) => onChange('enableFxaa', value)} />
          </SettingsGroup>
          <SettingsGroup title="画质">
            <SettingRow label="整体画质" hint="一键把下面四项调成同一档">
              <Segmented
                label="整体画质"
                value={overallQuality}
                options={QUALITY_OPTIONS}
                onChange={(value) => QUALITY_KEYS.forEach((key) => onChange(key, value))}
              />
            </SettingRow>
            <SelectRow label={GAME_FIELDS.shadowQuality.label} value={values.shadowQuality} options={QUALITY_OPTIONS} segmented onChange={(value) => onChange('shadowQuality', Number(value))} />
            <SelectRow label={GAME_FIELDS.characterQuality.label} value={values.characterQuality} options={QUALITY_OPTIONS} segmented onChange={(value) => onChange('characterQuality', Number(value))} />
            <SelectRow label={GAME_FIELDS.effectsQuality.label} value={values.effectsQuality} options={QUALITY_OPTIONS} segmented onChange={(value) => onChange('effectsQuality', Number(value))} />
            <SelectRow label={GAME_FIELDS.environmentQuality.label} value={values.environmentQuality} options={QUALITY_OPTIONS} segmented onChange={(value) => onChange('environmentQuality', Number(value))} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix={idPrefix} id="controls" title="操作">
          <SettingsGroup title="鼠标和镜头">
            <SliderRow label={GAME_FIELDS.gameMouseSpeed.label} value={values.gameMouseSpeed} min={0} max={100} onChange={(value) => onChange('gameMouseSpeed', value)} />
            <SliderRow label={GAME_FIELDS.mapScrollSpeed.label} value={values.mapScrollSpeed} min={0} max={100} onChange={(value) => onChange('mapScrollSpeed', value)} />
            <SliderRow label={GAME_FIELDS.keyboardScrollSpeed.label} value={values.keyboardScrollSpeed} min={0} max={100} onChange={(value) => onChange('keyboardScrollSpeed', value)} />
            <SelectRow label={GAME_FIELDS.cameraLockMode.label} value={values.cameraLockMode} options={CAMERA_LOCK_OPTIONS} segmented onChange={(value) => onChange('cameraLockMode', Number(value))} />
            <CheckboxRow label={GAME_FIELDS.snapCameraOnRespawn.label} checked={values.snapCameraOnRespawn} onChange={(value) => onChange('snapCameraOnRespawn', value)} />
            <CheckboxRow label={GAME_FIELDS.scrollSmoothingEnabled.label} checked={values.scrollSmoothingEnabled} onChange={(value) => onChange('scrollSmoothingEnabled', value)} />
            <CheckboxRow label={GAME_FIELDS.middleClickDragScrollEnabled.label} checked={values.middleClickDragScrollEnabled} onChange={(value) => onChange('middleClickDragScrollEnabled', value)} />
          </SettingsGroup>
          <SettingsGroup title="攻击和施法">
            <CheckboxRow label={GAME_FIELDS.autoAcquireTarget.label} hint="站着不动时自动打身边的目标" checked={values.autoAcquireTarget} onChange={(value) => onChange('autoAcquireTarget', value)} />
            <CheckboxRow label={GAME_FIELDS.predictMovement.label} checked={values.predictMovement} onChange={(value) => onChange('predictMovement', value)} />
            <CheckboxRow label={GAME_FIELDS.enableTargetedAttackMove.label} hint="A 键优先打离鼠标最近的目标，而不是离英雄最近的" checked={values.enableTargetedAttackMove} onChange={(value) => onChange('enableTargetedAttackMove', value)} />
            <CheckboxRow label={GAME_FIELDS.targetChampionsOnlyAsToggle.label} hint="不用一直按住" checked={values.targetChampionsOnlyAsToggle} onChange={(value) => onChange('targetChampionsOnlyAsToggle', value)} />
            <CheckboxRow label={GAME_FIELDS.disableHudSpellClick.label} hint="点技能栏图标不会放技能" checked={values.disableHudSpellClick} onChange={(value) => onChange('disableHudSpellClick', value)} />
            <CheckboxRow label={GAME_FIELDS.showTurretRangeIndicators.label} checked={values.showTurretRangeIndicators} onChange={(value) => onChange('showTurretRangeIndicators', value)} />
            <CheckboxRow label={GAME_FIELDS.recommendJunglePaths.label} checked={values.recommendJunglePaths} onChange={(value) => onChange('recommendJunglePaths', value)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix={idPrefix} id="interface" title="界面">
          <SettingsGroup title="大小">
            <SliderRow label={GAME_FIELDS.globalScale.label} value={values.globalScale} min={0} max={100} onChange={(value) => onChange('globalScale', value)} />
            <SliderRow label={GAME_FIELDS.minimapScale.label} value={values.minimapScale} min={0} max={100} onChange={(value) => onChange('minimapScale', value)} />
            <SliderRow label={GAME_FIELDS.chatScale.label} value={values.chatScale} min={0} max={100} onChange={(value) => onChange('chatScale', value)} />
            <SliderRow label={GAME_FIELDS.cursorScale.label} value={values.cursorScale} min={0} max={100} onChange={(value) => onChange('cursorScale', value)} />
          </SettingsGroup>
          <SettingsGroup title="显示">
            <SelectRow label={GAME_FIELDS.showSummonerNames.label} value={values.showSummonerNames} options={SUMMONER_NAME_OPTIONS} segmented onChange={(value) => onChange('showSummonerNames', Number(value))} />
            <SelectRow label={GAME_FIELDS.numericCooldownFormat.label} value={values.numericCooldownFormat} options={COOLDOWN_FORMAT_OPTIONS} segmented onChange={(value) => onChange('numericCooldownFormat', Number(value))} />
            <CheckboxRow label={GAME_FIELDS.showFpsAndLatency.label} checked={values.showFpsAndLatency} onChange={(value) => onChange('showFpsAndLatency', value)} />
            <CheckboxRow label={GAME_FIELDS.enableHudAnimations.label} checked={values.enableHudAnimations} onChange={(value) => onChange('enableHudAnimations', value)} />
            <CheckboxRow label={GAME_FIELDS.hidePlayerNames.label} hint="和客户端「隐藏所有人的名字」是同一个开关" checked={values.hidePlayerNames} onChange={(value) => onChange('hidePlayerNames', value)} />
          </SettingsGroup>
          <SettingsGroup title="聊天">
            <CheckboxRow label={GAME_FIELDS.showTimestamps.label} checked={values.showTimestamps} onChange={(value) => onChange('showTimestamps', value)} />
            <CheckboxRow label={GAME_FIELDS.showAlliedChat.label} checked={values.showAlliedChat} onChange={(value) => onChange('showAlliedChat', value)} />
            <CheckboxRow label={GAME_FIELDS.showAllChannelChat.label} checked={values.showAllChannelChat} onChange={(value) => onChange('showAllChannelChat', value)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix={idPrefix} id="combat" title="战斗提示">
          <SettingsGroup>
            <CheckboxRow label={GAME_FIELDS.showAttackRadius.label} checked={values.showAttackRadius} onChange={(value) => onChange('showAttackRadius', value)} />
            <CheckboxRow label={GAME_FIELDS.autoDisplayTarget.label} checked={values.autoDisplayTarget} onChange={(value) => onChange('autoDisplayTarget', value)} />
            <CheckboxRow label={GAME_FIELDS.enableLineMissileVis.label} checked={values.enableLineMissileVis} onChange={(value) => onChange('enableLineMissileVis', value)} />
            <CheckboxRow label={GAME_FIELDS.showSpellCosts.label} checked={values.showSpellCosts} onChange={(value) => onChange('showSpellCosts', value)} />
            <CheckboxRow label={GAME_FIELDS.showSpellRecommendations.label} checked={values.showSpellRecommendations} onChange={(value) => onChange('showSpellRecommendations', value)} />
            <CheckboxRow label={GAME_FIELDS.showNeutralCamps.label} checked={values.showNeutralCamps} onChange={(value) => onChange('showNeutralCamps', value)} />
            <CheckboxRow label={GAME_FIELDS.flashScreenWhenDamaged.label} checked={values.flashScreenWhenDamaged} onChange={(value) => onChange('flashScreenWhenDamaged', value)} />
            <CheckboxRow label={GAME_FIELDS.flashScreenWhenStunned.label} checked={values.flashScreenWhenStunned} onChange={(value) => onChange('flashScreenWhenStunned', value)} />
            <CheckboxRow label={GAME_FIELDS.showOffScreenPointsOfInterest.label} checked={values.showOffScreenPointsOfInterest} onChange={(value) => onChange('showOffScreenPointsOfInterest', value)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix={idPrefix} id="audio" title="声音" description="点左边的喇叭可以单独静音。">
          <SettingsGroup>
            <CheckboxRow label={GAME_FIELDS.enableAudio.label} hint="关掉后游戏里完全没有声音" checked={values.enableAudio} onChange={(value) => onChange('enableAudio', value)} />
            <VolumeRow label={GAME_FIELDS.masterVolume.label} volume={values.masterVolume} muted={values.masterMute} onVolume={(value) => onChange('masterVolume', value)} onMuted={(value) => onChange('masterMute', value)} />
            <VolumeRow label={GAME_FIELDS.musicVolume.label} volume={values.musicVolume} muted={values.musicMute} onVolume={(value) => onChange('musicVolume', value)} onMuted={(value) => onChange('musicMute', value)} />
            <VolumeRow label={GAME_FIELDS.sfxVolume.label} volume={values.sfxVolume} muted={values.sfxMute} onVolume={(value) => onChange('sfxVolume', value)} onMuted={(value) => onChange('sfxMute', value)} />
            <VolumeRow label={GAME_FIELDS.ambienceVolume.label} volume={values.ambienceVolume} muted={values.ambienceMute} onVolume={(value) => onChange('ambienceVolume', value)} onMuted={(value) => onChange('ambienceMute', value)} />
            <VolumeRow label={GAME_FIELDS.pingsVolume.label} volume={values.pingsVolume} muted={values.pingsMute} onVolume={(value) => onChange('pingsVolume', value)} onMuted={(value) => onChange('pingsMute', value)} />
            <VolumeRow label={GAME_FIELDS.announcerVolume.label} volume={values.announcerVolume} muted={values.announcerMute} onVolume={(value) => onChange('announcerVolume', value)} onMuted={(value) => onChange('announcerMute', value)} />
            <VolumeRow label={GAME_FIELDS.voiceVolume.label} volume={values.voiceVolume} muted={values.voiceMute} onVolume={(value) => onChange('voiceVolume', value)} onMuted={(value) => onChange('voiceMute', value)} />
          </SettingsGroup>
        </SettingsSection>
      </div>
    </>
  );
}
