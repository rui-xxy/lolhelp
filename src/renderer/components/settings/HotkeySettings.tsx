import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';
import type { LolHotkeyValues } from '../../../shared/api';
import {
  CompareNote,
  SectionTabs,
  SwitchControl,
  scrollToSettingsSection,
  useSettingsCompare,
  useSettingsScrollSpy,
} from './SettingsControls';
import {
  HERO_HOTKEY_GROUPS,
  buildHotkeyCategories,
  displayHotkeyValue,
  flattenHotkeys,
  hotkeyFromKeyboardEvent,
  hotkeyFromMouseEvent,
  hotkeyLabel,
  hotkeyRefKey,
  isSwitchHotkey,
  quickbindKeyFor,
  type HotkeyBinding,
  type HotkeyCaptureTarget,
  type HotkeyCategory,
  type HotkeySectionKey,
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

const UNBOUND = '[<Unbound>]';
const NO_SECTIONS: Array<{ key: HotkeySectionKey; label: string }> = [];

function compareText(section: string, value: string): string {
  if (isSwitchHotkey(section, value)) return value === '1' ? '开' : '关';
  return value ? displayHotkeyValue(value) : '没有';
}

export function HotkeySettings({
  values,
  onChange,
  showNav = true,
}: {
  values: LolHotkeyValues;
  onChange: Change;
  /** 嵌进别的页面时不要自己的分区目录。 */
  showNav?: boolean;
}) {
  const compare = useSettingsCompare();
  const allBindings = useMemo(() => flattenHotkeys(values), [values]);
  const categories = useMemo(() => buildHotkeyCategories(allBindings), [allBindings]);
  const navSections = useMemo(
    () => categories.map((item) => ({ key: item.key, label: item.label })),
    [categories],
  );
  const [activeSection, setActiveSection] = useState<HotkeySectionKey>('hero');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [captureTarget, setCaptureTarget] = useState<HotkeyCaptureTarget | null>(null);
  useSettingsScrollSpy<HotkeySectionKey>('hotkeys', showNav ? navSections : NO_SECTIONS, setActiveSection);

  const goToSection = useCallback((section: HotkeySectionKey) => {
    setActiveSection(section);
    setOpenSections((current) => ({ ...current, [section]: true }));
    window.setTimeout(() => scrollToSettingsSection('hotkeys', section), 0);
  }, []);

  const openCapture = useCallback((binding: HotkeyBinding, label?: string) => {
    setCaptureTarget({ ...binding, label: label ?? hotkeyLabel(binding.key) });
  }, []);

  if (allBindings.length === 0) {
    return (
      <div className="st-empty st-empty--page">
        没读到热键配置（input.ini）。检查一下右上角的游戏目录对不对，或者先进一次游戏让它生成。
      </div>
    );
  }

  return (
    <>
      {showNav && <SectionTabs sections={navSections} active={activeSection} onSelect={goToSection} />}
      <div className="st-sections">
        {categories.some((category) => category.key === 'hero') && (
          <section id="hotkeys-section-hero" className="st-section">
            <header className="st-section__head">
              <h3>英雄热键</h3>
              <p>点键帽改键。下面的「快捷」亮着表示按下就放，不用再点鼠标确认。</p>
            </header>
            <HeroHotkeys values={values} onChange={onChange} onCapture={openCapture} />
          </section>
        )}
        <section className="st-section">
          <header className="st-section__head">
            <h3>其他热键</h3>
            <p>按用途分好了组，点开一组再改。</p>
          </header>
          <div className="st-folds">
            {categories.filter((category) => category.key !== 'hero').map((category) => (
              <HotkeyCategoryPanel
                key={category.key}
                category={category}
                open={openSections[category.key] ?? Boolean(compare && category.bindings.some((binding) => compare.hotkeys.has(`${binding.section}.${binding.key}`)))}
                onToggle={() => setOpenSections((current) => ({
                  ...current,
                  [category.key]: !(current[category.key]
                    ?? Boolean(compare && category.bindings.some((binding) => compare.hotkeys.has(`${binding.section}.${binding.key}`)))),
                }))}
                onChange={onChange}
                onCapture={openCapture}
              />
            ))}
          </div>
        </section>
      </div>
      {captureTarget && (
        <HotkeyCaptureDialog
          target={captureTarget}
          onClose={() => setCaptureTarget(null)}
          onConfirm={(nextValue) => {
            onChange(captureTarget.section, captureTarget.key, nextValue);
            setCaptureTarget(null);
          }}
        />
      )}
    </>
  );
}

function HeroHotkeys({
  values,
  onChange,
  onCapture,
}: {
  values: LolHotkeyValues;
  onChange: Change;
  onCapture: (binding: HotkeyBinding, label?: string) => void;
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
          <span>快捷施法开了 {quickOn}/{quickKeys.length} 个</span>
          <button type="button" className="as-btn as-btn--sm" onClick={() => setAllQuick(true)}>全部改成快捷施法</button>
          <button type="button" className="as-btn as-btn--sm as-btn--ghost" onClick={() => setAllQuick(false)}>全部改成普通施法</button>
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

function HotkeyCategoryPanel({
  category,
  open,
  onToggle,
  onChange,
  onCapture,
}: {
  category: HotkeyCategory;
  open: boolean;
  onToggle: () => void;
  onChange: Change;
  onCapture: (binding: HotkeyBinding) => void;
}) {
  const bound = category.bindings.filter((binding) => displayHotkeyValue(binding.value) !== '未绑定').length;
  return (
    <div id={`hotkeys-section-${category.key}`} className="st-foldbox">
      <button type="button" className="st-fold" aria-expanded={open} onClick={onToggle}>
        <b>{category.label}</b>
        <span>{category.key === 'quickcast' ? `${category.bindings.length} 项` : `${bound}/${category.bindings.length} 已绑定`}</span>
        <ChevronDown />
      </button>
      {open && (
        <div className="st-fold__body">
          {category.bindings.map((binding) => (
            <HotkeyRow
              key={`${binding.section}-${binding.key}`}
              binding={binding}
              onChange={(nextValue) => onChange(binding.section, binding.key, nextValue)}
              onCapture={() => onCapture(binding)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HotkeyRow({
  binding,
  onChange,
  onCapture,
}: {
  binding: HotkeyBinding;
  onChange: (value: string) => void;
  onCapture: () => void;
}) {
  const compare = useSettingsCompare();
  const label = hotkeyLabel(binding.key);
  const display = displayHotkeyValue(binding.value);
  const was = compare?.hotkeys.get(`${binding.section}.${binding.key}`);
  return (
    <div className="st-row" data-diff={was !== undefined ? 'true' : undefined}>
      <div className="st-row__label">
        <b title={label}>{label}</b>
        {was !== undefined && <CompareNote value={compareText(binding.section, was)} />}
      </div>
      <div className="st-row__control">
        {isSwitchHotkey(binding.section, binding.value) ? (
          <SwitchControl checked={binding.value === '1'} onChange={(checked) => onChange(checked ? '1' : '0')} />
        ) : (
          <span className="st-keyline">
            <button
              type="button"
              className="st-key"
              data-unbound={display === '未绑定' ? 'true' : undefined}
              onClick={onCapture}
            >
              {display}
            </button>
            <button
              type="button"
              className="st-icon-btn"
              disabled={display === '未绑定'}
              onClick={() => onChange(UNBOUND)}
              aria-label="解除绑定"
              title="解除绑定"
            >
              <X />
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

function HotkeyCaptureDialog({
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
          <span>直接按键盘或鼠标按键，可以带 Ctrl / Alt / Shift</span>
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
