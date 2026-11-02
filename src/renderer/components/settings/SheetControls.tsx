import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, ChevronDown, Undo2, Volume2, VolumeX } from 'lucide-react';
import type { LolClientConfigValues, LolGameConfigValues } from '../../../shared/api';
import {
  CAMERA_LOCK_OPTIONS,
  COOLDOWN_FORMAT_OPTIONS,
  FRAME_CAP_OPTIONS,
  QUALITY_OPTIONS,
  RESOLUTION_PRESETS,
  SUMMONER_NAME_OPTIONS,
  VOICE_INPUT_OPTIONS,
  WINDOW_MODES,
  type Option,
} from './configFields';

// 设置清单的小控件：名字在左，值在右，点值就地改。
// 一行的版式是 cw- 前缀，控件本身是 sy- 前缀，样式都在 styles/features/settings-workspace.css。

// ---------- 每一项用什么控件 ----------

export type SheetControl =
  | { kind: 'bool' }
  | { kind: 'choice'; options: Option<string | number>[] }
  | { kind: 'range'; min: number; max: number }
  | { kind: 'volume'; mute: keyof LolGameConfigValues }
  | { kind: 'resolution' }
  | { kind: 'readonly' };

const RANGE: SheetControl = { kind: 'range', min: 0, max: 100 };
const choice = (options: Option<string | number>[]): SheetControl => ({ kind: 'choice', options });

export const GAME_CONTROLS: Partial<Record<keyof LolGameConfigValues, SheetControl>> = {
  windowMode: choice(WINDOW_MODES),
  width: { kind: 'resolution' },
  frameCapType: choice(FRAME_CAP_OPTIONS),
  shadowQuality: choice(QUALITY_OPTIONS),
  characterQuality: choice(QUALITY_OPTIONS),
  effectsQuality: choice(QUALITY_OPTIONS),
  environmentQuality: choice(QUALITY_OPTIONS),
  gameMouseSpeed: RANGE,
  mapScrollSpeed: RANGE,
  keyboardScrollSpeed: RANGE,
  cameraLockMode: choice(CAMERA_LOCK_OPTIONS),
  globalScale: RANGE,
  minimapScale: RANGE,
  chatScale: RANGE,
  cursorScale: RANGE,
  showSummonerNames: choice(SUMMONER_NAME_OPTIONS),
  numericCooldownFormat: choice(COOLDOWN_FORMAT_OPTIONS),
  masterVolume: { kind: 'volume', mute: 'masterMute' },
  musicVolume: { kind: 'volume', mute: 'musicMute' },
  sfxVolume: { kind: 'volume', mute: 'sfxMute' },
  ambienceVolume: { kind: 'volume', mute: 'ambienceMute' },
  pingsVolume: { kind: 'volume', mute: 'pingsMute' },
  announcerVolume: { kind: 'volume', mute: 'announcerMute' },
  voiceVolume: { kind: 'volume', mute: 'voiceMute' },
};

export const CLIENT_CONTROLS: Partial<Record<keyof LolClientConfigValues, SheetControl>> = {
  voiceInputMode: choice(VOICE_INPUT_OPTIONS),
  voiceInputDeviceName: { kind: 'readonly' },
  voiceInputVolume: RANGE,
  voiceSensitivity: RANGE,
};

/** 名字下面的一行小字：这一项到底管什么。 */
export const FIELD_HINTS: Record<string, string> = {
  width: '一般选和显示器一样的',
  frameCapType: '帧数越高越流畅，笔记本也越费电',
  waitForVerticalSync: '画面不撕裂，但会多一点操作延迟',
  cameraLockMode: '锁定镜头时，英雄在画面里的位置',
  middleClickDragScrollEnabled: '按住鼠标中键拖着看地图',
  autoAcquireTarget: '站着不动时自动打身边的目标',
  predictMovement: '网络卡的时候，让英雄走得更连贯',
  enableTargetedAttackMove: 'A 键优先打离鼠标最近的目标',
  targetChampionsOnlyAsToggle: '不用一直按住',
  disableHudSpellClick: '点技能栏图标不会放技能',
  recommendJunglePaths: '打野时在小地图上画出推荐路线',
  autoDisplayTarget: '普攻时在屏幕上方显示目标的血量',
  enableLineMissileVis: '技能弹道画成一条线，更容易看清和躲开',
  showSpellRecommendations: '升级时提示先加哪个技能',
  showNeutralCamps: '小地图上显示野怪什么时候刷新',
  showOffScreenPointsOfInterest: '队友在屏幕外发的信号，在边上显示箭头',
  hidePlayerNames: '和客户端「隐藏所有人的名字」是同一个开关',
  hideAllPlayerNamesForMe: '和游戏内「隐藏玩家名字」是同一个开关',
  lowSpecMode: '关掉客户端里大部分动画，老电脑更流畅',
  closeClientDuringGame: '结算后客户端会重新打开',
  careerPrivate: '别人看不到你的战绩',
  hideMyIdentityFromOthers: '名字、头像、段位都对其他玩家隐藏',
  blockNonFriendGameInvites: '陌生人的房间邀请不再弹出',
  voiceInputDeviceName: '在客户端里切换，不跟着方案走',
  voiceSensitivity: '「有声音就发」时的触发音量',
  enableAudio: '关掉后游戏里完全没有声音',
};

// ---------- 一行 ----------

export function SheetRow({
  id,
  label,
  hint,
  was,
  wasLabel,
  revertLabel,
  onRevert,
  children,
}: {
  /** 从差异列表跳过来时靠它找到这一行 */
  id?: string;
  label: string;
  hint?: string;
  /** 和对照那边不一样时，对照那边是什么。 */
  was?: string;
  wasLabel?: string;
  revertLabel?: string;
  onRevert?: () => void;
  children: ReactNode;
}) {
  const changed = was !== undefined;
  return (
    <div className="cw-row" data-row={id} data-diff={changed ? 'true' : undefined}>
      <div className="cw-row__text">
        <span className="cw-row__label">{label}</span>
        {changed ? (
          <span className="cw-was">
            <span className="cw-was__value" title={`${wasLabel ?? ''}：${was}`}>
              {wasLabel && <em>{wasLabel}</em>}
              {was}
            </span>
            {onRevert && (
              <button type="button" className="cw-was__undo" onClick={onRevert} title={revertLabel} aria-label={revertLabel}>
                <Undo2 />
              </button>
            )}
          </span>
        ) : hint ? (
          <span className="cw-row__hint">{hint}</span>
        ) : null}
      </div>
      <span className="cw-row__ctl">{children}</span>
    </div>
  );
}

// ---------- 开关 ----------

export function MiniSwitch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="sy-switch"
      onClick={() => onChange(!checked)}
    />
  );
}

// ---------- 弹出的小菜单 ----------

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export function ChoiceMenu<T extends string | number>({
  value,
  options,
  label,
  onChange,
}: {
  value: T;
  options: Option<T>[];
  label: string;
  onChange: (value: T) => void;
}) {
  const { open, setOpen, ref } = usePopover();
  const current = options.find((option) => String(option.value) === String(value));
  return (
    <span className="sy-pick" ref={ref}>
      <button
        type="button"
        className="sy-value"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}：${current?.label ?? value}`}
        onClick={() => setOpen((state) => !state)}
      >
        {current?.label ?? String(value)}
        <ChevronDown />
      </button>
      {open && (
        <span className="sy-pop" role="listbox" aria-label={label}>
          {options.map((option) => {
            const selected = String(option.value) === String(value);
            return (
              <button
                key={String(option.value)}
                type="button"
                role="option"
                aria-selected={selected}
                autoFocus={selected}
                onClick={() => {
                  setOpen(false);
                  if (!selected) onChange(option.value);
                }}
              >
                {option.label}
                {selected && <Check />}
              </button>
            );
          })}
        </span>
      )}
    </span>
  );
}

export function ResolutionMenu({
  width,
  height,
  onChange,
}: {
  width: number;
  height: number;
  onChange: (width: number, height: number) => void;
}) {
  const { open, setOpen, ref } = usePopover();
  return (
    <span className="sy-pick" ref={ref}>
      <button
        type="button"
        className="sy-value num"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`分辨率：${width} × ${height}`}
        onClick={() => setOpen((state) => !state)}
      >
        {width} × {height}
        <ChevronDown />
      </button>
      {open && (
        <span className="sy-pop" role="dialog" aria-label="分辨率">
          {RESOLUTION_PRESETS.map(([presetWidth, presetHeight]) => {
            const selected = presetWidth === width && presetHeight === height;
            return (
              <button
                key={`${presetWidth}x${presetHeight}`}
                type="button"
                className="num"
                aria-pressed={selected}
                autoFocus={selected}
                onClick={() => {
                  setOpen(false);
                  if (!selected) onChange(presetWidth, presetHeight);
                }}
              >
                {presetWidth} × {presetHeight}
                {selected && <Check />}
              </button>
            );
          })}
          <span className="sy-pop__custom">
            <input
              id="sy-res-width"
              type="number"
              aria-label="宽"
              className="num"
              value={width}
              onChange={(event) => onChange(Number(event.target.value), height)}
            />
            <i>×</i>
            <input
              id="sy-res-height"
              type="number"
              aria-label="高"
              className="num"
              value={height}
              onChange={(event) => onChange(width, Number(event.target.value))}
            />
          </span>
        </span>
      )}
    </span>
  );
}

// ---------- 数值 ----------

export function MiniRange({
  value,
  min,
  max,
  label,
  disabled = false,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const current = Number.isFinite(value) ? value : min;
  return (
    <span className="sy-range" data-disabled={disabled ? 'true' : undefined}>
      <input
        className="settings-range"
        type="range"
        min={min}
        max={max}
        value={current}
        aria-label={label}
        disabled={disabled}
        style={{ '--settings-range-fill': `${((current - min) / Math.max(1, max - min)) * 100}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output className="num">{Math.round(current)}</output>
    </span>
  );
}

export function VolumeMini({
  label,
  volume,
  muted,
  onVolume,
  onMuted,
}: {
  label: string;
  volume: number;
  muted: boolean;
  onVolume: (value: number) => void;
  onMuted: (value: boolean) => void;
}) {
  return (
    <span className="sy-volume">
      <button
        type="button"
        className="sy-mute"
        aria-pressed={muted}
        aria-label={muted ? `取消${label}静音` : `${label}静音`}
        title={muted ? '取消静音' : '静音'}
        onClick={() => onMuted(!muted)}
      >
        {muted ? <VolumeX /> : <Volume2 />}
      </button>
      <MiniRange label={label} value={volume} min={0} max={100} disabled={muted} onChange={onVolume} />
    </span>
  );
}
