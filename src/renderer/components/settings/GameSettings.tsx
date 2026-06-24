import { useCallback, useState } from 'react';
import type { LolGameConfigValues } from '../../../shared/api';
import {
  CheckboxRow,
  SectionDot,
  SelectRow,
  SettingsGroup,
  SettingsSection,
  SliderRow,
  VolumeRow,
  useSettingsScrollSpy,
} from './SettingsControls';

type GameSectionKey =
  | 'controls'
  | 'gameplay'
  | 'alerts'
  | 'combat'
  | 'cooldowns'
  | 'video'
  | 'interface'
  | 'audio';

const GAME_SECTIONS: { key: GameSectionKey; label: string }[] = [
  { key: 'controls', label: '控制' },
  { key: 'gameplay', label: '游戏设置' },
  { key: 'alerts', label: '通知' },
  { key: 'combat', label: '技能和攻击显示' },
  { key: 'cooldowns', label: '技能冷却显示' },
  { key: 'video', label: '画面' },
  { key: 'interface', label: '界面' },
  { key: 'audio', label: '声音' },
];

const WINDOW_MODES = [
  { value: '0', label: '全屏' },
  { value: '1', label: '窗口' },
  { value: '2', label: '无边框' },
];

const RESOLUTION_PRESETS = [
  [1280, 720],
  [1600, 900],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
];

const QUALITY_OPTIONS = [
  { value: 0, label: '低' },
  { value: 1, label: '中低' },
  { value: 2, label: '中' },
  { value: 3, label: '高' },
  { value: 4, label: '极高' },
];

const FRAME_CAP_OPTIONS = [
  { value: 0, label: '不限制' },
  { value: 1, label: '显示器刷新率' },
  { value: 2, label: '144 FPS' },
  { value: 3, label: '120 FPS' },
  { value: 4, label: '60 FPS' },
  { value: 5, label: '30 FPS' },
];

const CAMERA_LOCK_OPTIONS = [
  { value: 0, label: '基于红/蓝方的镜头偏移' },
  { value: 1, label: '固定偏移' },
  { value: 2, label: '无偏移' },
];

const SUMMONER_NAME_OPTIONS = [
  { value: 0, label: '无' },
  { value: 1, label: '玩家名称' },
  { value: 2, label: '英雄名称' },
];

const COOLDOWN_FORMAT_OPTIONS = [
  { value: 0, label: '无' },
  { value: 1, label: '秒' },
  { value: 2, label: '分钟 + 秒' },
];

export function GameSettings({
  values,
  onChange,
}: {
  values: LolGameConfigValues;
  onChange: <K extends keyof LolGameConfigValues>(
    key: K,
    value: LolGameConfigValues[K],
  ) => void;
}) {
  const [activeSection, setActiveSection] = useState<GameSectionKey>('controls');
  useSettingsScrollSpy<GameSectionKey>('game', GAME_SECTIONS, setActiveSection);

  const goToSection = useCallback((section: GameSectionKey) => {
    setActiveSection(section);
    document.getElementById(`game-section-${section}`)?.scrollIntoView({
      block: 'start',
      behavior: 'smooth',
    });
  }, []);

  return (
    <div className="mx-auto grid w-full max-w-[580px] grid-cols-[minmax(0,1fr)_32px] gap-4 pb-8">
      <div className="min-w-0 space-y-8">
        <SettingsSection prefix="game" id="controls" title="控制">
          <SettingsGroup>
            <SliderRow label="鼠标速度" value={values.gameMouseSpeed} min={0} max={100} onChange={(value) => onChange('gameMouseSpeed', value)} />
            <SliderRow label="镜头移动速度（鼠标）" value={values.mapScrollSpeed} min={0} max={100} onChange={(value) => onChange('mapScrollSpeed', value)} />
            <SliderRow label="镜头移动速度（键盘）" value={values.keyboardScrollSpeed} min={0} max={100} onChange={(value) => onChange('keyboardScrollSpeed', value)} />
            <CheckboxRow label="复活时移动镜头" checked={values.snapCameraOnRespawn} onChange={(value) => onChange('snapCameraOnRespawn', value)} />
            <CheckboxRow label="启用镜头平滑" checked={values.scrollSmoothingEnabled} onChange={(value) => onChange('scrollSmoothingEnabled', value)} />
            <CheckboxRow label="按住鼠标拖拽滚屏" checked={values.middleClickDragScrollEnabled} onChange={(value) => onChange('middleClickDragScrollEnabled', value)} />
            <SelectRow label="镜头锁定模式" value={values.cameraLockMode} options={CAMERA_LOCK_OPTIONS} onChange={(value) => onChange('cameraLockMode', Number(value))} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="game" id="gameplay" title="游戏设置">
          <SettingsGroup>
            <CheckboxRow label="自动攻击" checked={values.autoAcquireTarget} onChange={(value) => onChange('autoAcquireTarget', value)} />
            <CheckboxRow label="使用移动预测" checked={values.predictMovement} onChange={(value) => onChange('predictMovement', value)} />
            <CheckboxRow label="显示防御塔射程指示器" checked={values.showTurretRangeIndicators} onChange={(value) => onChange('showTurretRangeIndicators', value)} />
            <CheckboxRow label="依据鼠标指针攻击移动" checked={values.enableTargetedAttackMove} onChange={(value) => onChange('enableTargetedAttackMove', value)} />
            <CheckboxRow label="显示推荐打野路线" checked={values.recommendJunglePaths} onChange={(value) => onChange('recommendJunglePaths', value)} />
            <CheckboxRow label="“只以英雄为目标”视为可开关选项" checked={values.targetChampionsOnlyAsToggle} onChange={(value) => onChange('targetChampionsOnlyAsToggle', value)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="game" id="alerts" title="通知">
          <SettingsGroup>
            <CheckboxRow label="受伤时屏幕闪烁" checked={values.flashScreenWhenDamaged} onChange={(value) => onChange('flashScreenWhenDamaged', value)} />
            <CheckboxRow label="失控时屏幕闪烁" checked={values.flashScreenWhenStunned} onChange={(value) => onChange('flashScreenWhenStunned', value)} />
            <CheckboxRow label="显示屏幕外的事件信号" checked={values.showOffScreenPointsOfInterest} onChange={(value) => onChange('showOffScreenPointsOfInterest', value)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="game" id="combat" title="技能和攻击显示">
          <SettingsGroup>
            <CheckboxRow label="攻击时显示目标框架" checked={values.autoDisplayTarget} onChange={(value) => onChange('autoDisplayTarget', value)} />
            <CheckboxRow label="启用线状弹道显示" checked={values.enableLineMissileVis} onChange={(value) => onChange('enableLineMissileVis', value)} />
            <CheckboxRow label="显示攻击距离" checked={values.showAttackRadius} onChange={(value) => onChange('showAttackRadius', value)} />
            <CheckboxRow label="只能使用热键施放技能" checked={values.disableHudSpellClick} onChange={(value) => onChange('disableHudSpellClick', value)} />
            <CheckboxRow label="显示技能消耗" checked={values.showSpellCosts} onChange={(value) => onChange('showSpellCosts', value)} />
            <CheckboxRow label="显示推荐技能加点" checked={values.showSpellRecommendations} onChange={(value) => onChange('showSpellRecommendations', value)} />
            <CheckboxRow label="显示中立营地计时" checked={values.showNeutralCamps} onChange={(value) => onChange('showNeutralCamps', value)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="game" id="cooldowns" title="技能冷却显示">
          <SettingsGroup>
            <SelectRow label="冷却格式" value={values.numericCooldownFormat} options={COOLDOWN_FORMAT_OPTIONS} onChange={(value) => onChange('numericCooldownFormat', Number(value))} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="game" id="video" title="画面">
          <SettingsGroup>
            <SelectRow label="窗口模式" value={values.windowMode} options={WINDOW_MODES} onChange={(value) => onChange('windowMode', value)} />
            <div className="grid grid-cols-[120px_1fr] items-center gap-3 py-1.5">
              <span className="text-sm text-app-body">分辨率</span>
              <div className="flex flex-wrap items-center gap-2">
                <input type="number" value={values.width} onChange={(event) => onChange('width', Number(event.target.value))} className="h-8 w-24 rounded-sm border border-app-border bg-app-surface px-2 text-sm" />
                <span className="text-xs text-app-muted">x</span>
                <input type="number" value={values.height} onChange={(event) => onChange('height', Number(event.target.value))} className="h-8 w-24 rounded-sm border border-app-border bg-app-surface px-2 text-sm" />
                <select
                  value={`${values.width}x${values.height}`}
                  onChange={(event) => {
                    const [width, height] = event.target.value.split('x').map(Number);
                    onChange('width', width);
                    onChange('height', height);
                  }}
                  className="h-8 rounded-sm border border-app-border bg-app-surface px-2 text-xs"
                >
                  {RESOLUTION_PRESETS.map(([width, height]) => (
                    <option key={`${width}x${height}`} value={`${width}x${height}`}>
                      {width} x {height}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <SelectRow label="阴影质量" value={values.shadowQuality} options={QUALITY_OPTIONS} onChange={(value) => onChange('shadowQuality', Number(value))} />
            <SelectRow label="角色质量" value={values.characterQuality} options={QUALITY_OPTIONS} onChange={(value) => onChange('characterQuality', Number(value))} />
            <SelectRow label="特效质量" value={values.effectsQuality} options={QUALITY_OPTIONS} onChange={(value) => onChange('effectsQuality', Number(value))} />
            <SelectRow label="环境质量" value={values.environmentQuality} options={QUALITY_OPTIONS} onChange={(value) => onChange('environmentQuality', Number(value))} />
            <SelectRow label="帧率上限" value={values.frameCapType} options={FRAME_CAP_OPTIONS} onChange={(value) => onChange('frameCapType', Number(value))} />
            <CheckboxRow label="垂直同步" checked={values.waitForVerticalSync} onChange={(value) => onChange('waitForVerticalSync', value)} />
            <CheckboxRow label="抗锯齿 FXAA" checked={values.enableFxaa} onChange={(value) => onChange('enableFxaa', value)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="game" id="interface" title="界面">
          <SettingsGroup>
            <SelectRow label="生命槽上方名称" value={values.showSummonerNames} options={SUMMONER_NAME_OPTIONS} onChange={(value) => onChange('showSummonerNames', Number(value))} />
            <SliderRow label="用户界面缩放" value={values.globalScale} min={0} max={100} onChange={(value) => onChange('globalScale', value)} />
            <SliderRow label="聊天缩放" value={values.chatScale} min={0} max={100} onChange={(value) => onChange('chatScale', value)} />
            <SliderRow label="小地图缩放" value={values.minimapScale} min={0} max={100} onChange={(value) => onChange('minimapScale', value)} />
            <SliderRow label="指针缩放" value={values.cursorScale} min={0} max={100} onChange={(value) => onChange('cursorScale', value)} />
            <CheckboxRow label="启用用户界面动画" checked={values.enableHudAnimations} onChange={(value) => onChange('enableHudAnimations', value)} />
            <CheckboxRow label="显示 FPS 和延迟" checked={values.showFpsAndLatency} onChange={(value) => onChange('showFpsAndLatency', value)} />
            <CheckboxRow label="聊天显示时间戳" checked={values.showTimestamps} onChange={(value) => onChange('showTimestamps', value)} />
            <CheckboxRow label="显示队友聊天" checked={values.showAlliedChat} onChange={(value) => onChange('showAlliedChat', value)} />
            <CheckboxRow label="显示所有人聊天" checked={values.showAllChannelChat} onChange={(value) => onChange('showAllChannelChat', value)} />
            <CheckboxRow label="隐藏玩家名字" checked={values.hidePlayerNames} onChange={(value) => onChange('hidePlayerNames', value)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="game" id="audio" title="声音">
          <SettingsGroup>
            <CheckboxRow label="启用游戏音频" checked={values.enableAudio} onChange={(value) => onChange('enableAudio', value)} />
            <VolumeRow label="总音量" volume={values.masterVolume} muted={values.masterMute} onVolume={(value) => onChange('masterVolume', value)} onMuted={(value) => onChange('masterMute', value)} />
            <VolumeRow label="音乐" volume={values.musicVolume} muted={values.musicMute} onVolume={(value) => onChange('musicVolume', value)} onMuted={(value) => onChange('musicMute', value)} />
            <VolumeRow label="音效" volume={values.sfxVolume} muted={values.sfxMute} onVolume={(value) => onChange('sfxVolume', value)} onMuted={(value) => onChange('sfxMute', value)} />
            <VolumeRow label="环境音" volume={values.ambienceVolume} muted={values.ambienceMute} onVolume={(value) => onChange('ambienceVolume', value)} onMuted={(value) => onChange('ambienceMute', value)} />
            <VolumeRow label="信号" volume={values.pingsVolume} muted={values.pingsMute} onVolume={(value) => onChange('pingsVolume', value)} onMuted={(value) => onChange('pingsMute', value)} />
            <VolumeRow label="播报员" volume={values.announcerVolume} muted={values.announcerMute} onVolume={(value) => onChange('announcerVolume', value)} onMuted={(value) => onChange('announcerMute', value)} />
            <VolumeRow label="语音" volume={values.voiceVolume} muted={values.voiceMute} onVolume={(value) => onChange('voiceVolume', value)} onMuted={(value) => onChange('voiceMute', value)} />
          </SettingsGroup>
        </SettingsSection>
      </div>

      <aside className="sticky top-4 flex h-[360px] flex-col items-center justify-center gap-3">
        {GAME_SECTIONS.map((item) => (
          <SectionDot
            key={item.key}
            active={activeSection === item.key}
            label={item.label}
            onClick={() => goToSection(item.key)}
          />
        ))}
      </aside>
    </div>
  );
}
