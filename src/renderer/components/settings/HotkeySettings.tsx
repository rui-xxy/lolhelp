import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { LolHotkeyValues } from '../../../shared/api';
import { useSettingsCompare } from './SettingsControls';
import {
  HERO_HOTKEY_GROUPS,
  displayHotkeyValue,
  hotkeyFromKeyboardEvent,
  hotkeyFromMouseEvent,
  hotkeyRefKey,
  isSwitchHotkey,
  quickbindKeyFor,
  type HotkeyBinding,
  type HotkeyCaptureTarget,
} from './hotkeyModel';

type Change = (section: string, key: string, value: string) => void;

// 键帽上方的动作名。
export const HERO_ACTION_LABELS: Record<string, string> = {
  evtCastSpell1: 'Q 技能',
  evtCastSpell2: 'W 技能',
  evtCastSpell3: 'E 技能',
  evtCastSpell4: 'R 大招',
  evtCastAvatarSpell1: '召唤师 1',
  evtCastAvatarSpell2: '召唤师 2',
  evtCastRoleBound: '分路任务',
  evtUseItem1: '道具 1',
  evtUseItem2: '道具 2',
  evtUseItem3: '道具 3',
  evtUseItem4: '道具 4',
  evtUseItem5: '道具 5',
  evtUseItem6: '道具 6',
  evtUseItem7: '回城',
  evtUseVisionItem: '饰品',
};

export const UNBOUND = '[<Unbound>]';

/** 热键值显示成人话：开关显示开/关，按键显示键名，没有这个键显示「没有」。 */
export function compareText(section: string, value: string): string {
  if (isSwitchHotkey(section, value)) return value === '1' ? '开' : '关';
  return value ? displayHotkeyValue(value) : '没有';
}

// 英雄热键：一排排键帽，点键帽改键，下面的「快捷」切换快捷施法。
export function HeroHotkeys({
  values,
  onChange,
  onCapture,
  compact = false,
}: {
  values: LolHotkeyValues;
  onChange: Change;
  onCapture: (binding: HotkeyBinding, label?: string) => void;
  compact?: boolean;
}) {
  const compare = useSettingsCompare();
  const groups = HERO_HOTKEY_GROUPS
    .map((group) => ({
      ...group,
      refs: group.refs.filter((ref) => values[ref.section]?.[ref.key] !== undefined),
    }))
    .filter((group) => group.refs.length > 0);

  const quickKeys = HERO_HOTKEY_GROUPS
    .flatMap((group) => group.refs)
    .map((ref) => quickbindKeyFor(ref.key))
    .filter((key): key is string => Boolean(key) && values.Quickbinds?.[key as string] !== undefined);
  const quickOn = quickKeys.filter((key) => values.Quickbinds?.[key] === '1').length;

  const setAllQuick = (enabled: boolean) => {
    for (const key of quickKeys) onChange('Quickbinds', key, enabled ? '1' : '0');
  };

  return (
    <div className="st-keys">
      <div className="st-keys__groups">
        {groups.map((group) => (
          <div key={group.label} className="st-keys__group">
            <h4>{group.label}</h4>
            <div className="st-keys__caps">
              {group.refs.map((ref) => {
                const value = values[ref.section]?.[ref.key] ?? '';
                const quickKey = quickbindKeyFor(ref.key);
                const quick = quickKey ? values.Quickbinds?.[quickKey] : undefined;
                const action = HERO_ACTION_LABELS[ref.key] ?? ref.label;
                const wasKey = compare?.hotkeys.get(`${ref.section}.${ref.key}`);
                const wasQuick = quickKey ? compare?.hotkeys.get(`Quickbinds.${quickKey}`) : undefined;
                return (
                  <KeyCap
                    key={hotkeyRefKey(ref)}
                    compact={compact}
                    was={wasKey !== undefined
                      ? `${compare?.label}：${compareText(ref.section, wasKey)}`
                      : wasQuick !== undefined ? `${compare?.label}：${wasQuick === '1' ? '快捷施法' : '普通施法'}` : undefined}
                    action={action}
                    value={value}
                    quick={quick}
                    onCapture={() => onCapture({ section: ref.section, key: ref.key, value }, action)}
                    onToggleQuick={() => {
                      if (quickKey && quick !== undefined) onChange('Quickbinds', quickKey, quick === '1' ? '0' : '1');
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {quickKeys.length > 0 && (
        <div className="st-keys__foot">
          <span>快捷施法 <b className="num">{quickOn}/{quickKeys.length}</b></span>
          <button type="button" className="as-btn as-btn--sm as-btn--ghost" onClick={() => setAllQuick(true)}>全部快捷</button>
          <button type="button" className="as-btn as-btn--sm as-btn--ghost" onClick={() => setAllQuick(false)}>全部普通</button>
        </div>
      )}
    </div>
  );
}

export function KeyCap({
  action,
  value,
  quick,
  onCapture,
  onToggleQuick,
  compact = false,
  was,
}: {
  action: string;
  value: string;
  quick?: string;
  onCapture?: () => void;
  onToggleQuick?: () => void;
  compact?: boolean;
  /** 和对照那边不一样时，写出对照那边是什么。 */
  was?: string;
}) {
  const display = displayHotkeyValue(value);
  const unbound = display === '未绑定';
  const long = display.length > 5;
  return (
    <div className="st-cap" data-compact={compact ? 'true' : undefined} data-diff={was ? 'true' : undefined} title={was}>
      <button
        type="button"
        className="st-cap__key"
        data-unbound={unbound ? 'true' : undefined}
        disabled={!onCapture}
        onClick={onCapture}
        aria-label={`修改${action}的按键，现在是 ${display}`}
      >
        <small>{action}</small>
        <b data-long={long ? 'true' : undefined}>{display}</b>
      </button>
      {quick !== undefined && (
        <button
          type="button"
          className="st-cap__quick"
          aria-pressed={quick === '1'}
          disabled={!onToggleQuick}
          onClick={onToggleQuick}
          title={quick === '1' ? '快捷施法：按下就放。点一下改成普通施法' : '普通施法：按下后要点鼠标确认。点一下改成快捷施法'}
        >
          快捷
        </button>
      )}
    </div>
  );
}

// 改键弹窗：直接按键盘或鼠标。
export function HotkeyCaptureDialog({
  target,
  onClose,
  onConfirm,
}: {
  target: HotkeyCaptureTarget;
  onClose: () => void;
  onConfirm: (value: string) => void;
}) {
  const [captured, setCaptured] = useState(target.value);
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    captureRef.current?.focus();
  }, []);

  const captureKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const nextValue = hotkeyFromKeyboardEvent(event);
    if (nextValue) setCaptured(nextValue);
  };

  const captureMouse = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const nextValue = hotkeyFromMouseEvent(event);
    if (nextValue) setCaptured(nextValue);
  };

  return createPortal(
    <div
      className="st-capture"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="st-capture__box" role="dialog" aria-label={`修改${target.label}的按键`}>
        <header>
          <b>修改按键</b>
          <span>{target.label}</span>
        </header>
        <div
          ref={captureRef}
          tabIndex={0}
          onKeyDown={captureKeyboard}
          onMouseDown={captureMouse}
          onContextMenu={(event) => event.preventDefault()}
          className="st-capture__pad"
        >
          <b>{displayHotkeyValue(captured)}</b>
          <span>按下新按键</span>
        </div>
        <footer>
          <button type="button" className="as-btn as-btn--ghost" onClick={() => setCaptured(UNBOUND)}>
            解除绑定
          </button>
          <span />
          <button type="button" className="as-btn" onClick={onClose}>取消</button>
          <button type="button" className="as-btn as-btn--primary" onClick={() => onConfirm(captured)}>确定</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
