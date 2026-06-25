import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import {
  Check,
  FolderSearch,
  RefreshCw,
  Settings,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
import type {
  LolClientConfigValues,
  LolConfigState,
  LolConfigValues,
  LolGameConfigValues,
  LolHotkeyValues,
} from '../../../shared/api';
import { DEFAULT_LOL_ROOT_PATH } from '../../../shared/constants';
import {
  SectionDot,
  SwitchControl,
  useSettingsScrollSpy,
} from './SettingsControls';
import { ClientSettings } from './ClientSettings';
import { GameSettings } from './GameSettings';
import { ProfileSettings } from './ProfileSettings';
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

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

type TabKey = 'client' | 'game' | 'hotkeys' | 'profiles';
type Notice = { type: 'success' | 'error'; text: string } | null;

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [tab, setTab] = useState<TabKey>('client');
  const [rootPath, setRootPath] = useState(DEFAULT_LOL_ROOT_PATH);
  const [state, setState] = useState<LolConfigState | null>(null);
  const [draft, setDraft] = useState<LolConfigValues | null>(null);
  const [profileName, setProfileName] = useState('我的配置');
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const profiles = state?.profiles ?? [];
  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  const refresh = useCallback(async (pathOverride?: string) => {
    setBusy('read');
    setNotice(null);
    try {
      const next = await window.lolHelper.config.read(pathOverride ?? rootPath);
      setState(next);
      setRootPath(next.rootPath);
      setDraft(next.values);
      if (next.profiles.length > 0) {
        setSelectedProfileId((current) =>
          next.profiles.some((profile) => profile.id === current)
            ? current
            : next.profiles[0].id,
        );
      } else {
        setSelectedProfileId('');
      }
      setNotice(next.found ? null : { type: 'error', text: '没有找到可用的英雄联盟配置目录' });
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : '读取配置失败' });
    } finally {
      setBusy(null);
    }
  }, [rootPath]);

  useEffect(() => {
    if (!open) return;
    void refresh(DEFAULT_LOL_ROOT_PATH);
  }, [open]);

  useEffect(() => {
    document.querySelector<HTMLElement>('[data-settings-scroll]')?.scrollTo({ top: 0 });
  }, [tab]);

  const updateClient = useCallback(<K extends keyof LolClientConfigValues>(
    key: K,
    value: LolClientConfigValues[K],
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            client: { ...current.client, [key]: value },
            game: key === 'hideAllPlayerNamesForMe'
              ? { ...current.game, hidePlayerNames: Boolean(value) }
              : current.game,
          }
        : current,
    );
  }, []);

  const updateGame = useCallback(<K extends keyof LolGameConfigValues>(
    key: K,
    value: LolGameConfigValues[K],
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            game: { ...current.game, [key]: value },
            client: key === 'hidePlayerNames'
              ? { ...current.client, hideAllPlayerNamesForMe: Boolean(value) }
              : current.client,
          }
        : current,
    );
  }, []);

  const updateHotkey = useCallback((section: string, key: string, value: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            hotkeys: {
              ...current.hotkeys,
              [section]: {
                ...(current.hotkeys[section] ?? {}),
                [key]: value,
              },
            },
          }
        : current,
    );
  }, []);

  const applyDraft = useCallback(async () => {
    if (!draft) return;
    setBusy('apply');
    setNotice(null);
    try {
      const result = await window.lolHelper.config.applyValues({ rootPath, values: draft });
      await refresh(result.rootPath);
      setNotice({
        type: result.lcuSynced ? 'success' : 'error',
        text: result.lcuSynced
          ? `已写入 ${result.filesWritten.length} 个配置文件，并同步到客户端`
          : `已写入 ${result.filesWritten.length} 个配置文件，但没有同步到正在运行的客户端${result.lcuError ? `：${result.lcuError}` : ''}`,
      });
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : '写入配置失败' });
    } finally {
      setBusy(null);
    }
  }, [draft, refresh, rootPath]);

  const saveProfile = useCallback(async () => {
    if (!draft) return;
    setBusy('save-profile');
    setNotice(null);
    try {
      const nextProfiles = await window.lolHelper.config.saveProfile({
        name: profileName,
        rootPath,
        values: draft,
      });
      setState((current) => (current ? { ...current, profiles: nextProfiles } : current));
      const saved = nextProfiles.find((profile) => profile.name === profileName.trim());
      if (saved) setSelectedProfileId(saved.id);
      setNotice({ type: 'success', text: '方案已保存' });
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : '保存方案失败' });
    } finally {
      setBusy(null);
    }
  }, [draft, profileName, rootPath]);

  const applyProfile = useCallback(async () => {
    if (!selectedProfileId) return;
    setBusy('apply-profile');
    setNotice(null);
    try {
      const result = await window.lolHelper.config.applyProfile({ profileId: selectedProfileId, rootPath });
      await refresh(result.rootPath);
      setNotice({
        type: result.lcuSynced ? 'success' : 'error',
        text: result.lcuSynced
          ? `方案已应用，写入 ${result.filesWritten.length} 个文件，并同步到客户端`
          : `方案已写入 ${result.filesWritten.length} 个文件，但没有同步到正在运行的客户端${result.lcuError ? `：${result.lcuError}` : ''}`,
      });
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : '应用方案失败' });
    } finally {
      setBusy(null);
    }
  }, [refresh, rootPath, selectedProfileId]);

  const deleteProfile = useCallback(async () => {
    if (!selectedProfileId || !selectedProfile) return;
    if (!window.confirm(`删除方案“${selectedProfile.name}”？`)) return;
    setBusy('delete-profile');
    setNotice(null);
    try {
      const nextProfiles = await window.lolHelper.config.deleteProfile(selectedProfileId);
      setState((current) => (current ? { ...current, profiles: nextProfiles } : current));
      setSelectedProfileId(nextProfiles[0]?.id ?? '');
      setNotice({ type: 'success', text: '方案已删除' });
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : '删除方案失败' });
    } finally {
      setBusy(null);
    }
  }, [selectedProfile, selectedProfileId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="flex h-[640px] w-[980px] flex-col overflow-hidden rounded-md border border-app-border bg-app-surface shadow-airbnb">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-app-border px-4">
          <div className="flex size-8 items-center justify-center rounded-sm bg-app-surface-soft text-app-primary">
            <Settings className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-app-text">设置同步</h2>
            <p className="truncate text-xs text-app-muted">{rootPath}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="关闭设置">
            <X className="size-4" />
          </Button>
        </header>

        <div className="border-b border-app-border bg-app-bg-soft px-4 py-3">
          <div className="flex items-center gap-2">
            <FolderSearch className="size-4 shrink-0 text-app-muted" />
            <input
              value={rootPath}
              onChange={(e) => setRootPath(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-sm border border-app-border bg-app-surface px-2 text-xs text-app-text outline-none focus:border-app-primary"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => refresh(rootPath)}
              disabled={Boolean(busy)}
            >
              <RefreshCw className={`size-3.5 ${busy === 'read' ? 'animate-spin' : ''}`} />
              读取
            </Button>
            <Button size="sm" onClick={applyDraft} disabled={!draft || Boolean(busy)}>
              <Upload className="size-3.5" />
              写入当前
            </Button>
          </div>
          {notice && (
            <div
              className={`mt-2 flex items-center gap-2 rounded-sm border px-2 py-1.5 text-xs ${
                notice.type === 'success'
                  ? 'border-app-success/25 bg-app-success/5 text-app-success'
                  : 'border-app-danger/25 bg-app-danger/5 text-app-danger'
              }`}
            >
              {notice.type === 'success' ? <Check className="size-3.5" /> : <X className="size-3.5" />}
              <span>{notice.text}</span>
            </div>
          )}
        </div>

        <nav className="hidden">
          <TabButton active={tab === 'client'} onClick={() => setTab('client')}>客户端</TabButton>
          <TabButton active={tab === 'game'} onClick={() => setTab('game')}>游戏内</TabButton>
          <TabButton active={tab === 'hotkeys'} onClick={() => setTab('hotkeys')}>热键</TabButton>
          <TabButton active={tab === 'profiles'} onClick={() => setTab('profiles')}>方案</TabButton>
        </nav>

        <div className="flex min-h-0 flex-1">
          <aside className="w-40 shrink-0 border-r border-app-border bg-app-bg-soft p-3">
            <nav className="space-y-1">
              <TabButton active={tab === 'client'} onClick={() => setTab('client')}>客户端</TabButton>
              <TabButton active={tab === 'game'} onClick={() => setTab('game')}>游戏内</TabButton>
              <TabButton active={tab === 'hotkeys'} onClick={() => setTab('hotkeys')}>热键</TabButton>
              <TabButton active={tab === 'profiles'} onClick={() => setTab('profiles')}>方案</TabButton>
            </nav>
          </aside>

        <main data-settings-scroll className="scrollbar-none min-w-0 flex-1 overflow-y-auto p-4">
          {!draft ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-app-muted">
              <span>{busy === 'read' ? '正在读取配置...' : '配置读取失败'}</span>
              {notice?.type === 'error' && (
                <span className="max-w-xl text-center text-xs text-app-danger">{notice.text}</span>
              )}
            </div>
          ) : (
            <>
              {tab === 'client' && (
                <ClientSettings values={draft.client} onChange={updateClient} />
              )}
              {tab === 'game' && (
                <GameSettings values={draft.game} onChange={updateGame} />
              )}
              {tab === 'hotkeys' && (
                <HotkeySettings values={draft.hotkeys} onChange={updateHotkey} />
              )}
              {tab === 'profiles' && (
                <ProfileSettings
                  state={state}
                  profileName={profileName}
                  setProfileName={setProfileName}
                  profiles={profiles}
                  selectedProfileId={selectedProfileId}
                  setSelectedProfileId={setSelectedProfileId}
                  onSaveProfile={saveProfile}
                  onApplyProfile={applyProfile}
                  onDeleteProfile={deleteProfile}
                  busy={busy}
                />
              )}
            </>
          )}
        </main>
        </div>
      </section>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-9 w-full items-center rounded-sm border-l-2 px-3 text-left text-sm font-medium transition-colors ${
        active
          ? 'border-app-primary bg-app-surface text-app-text'
          : 'border-transparent text-app-muted hover:bg-app-nav-hover hover:text-app-text'
      }`}
    >
      {children}
    </button>
  );
}

function HotkeySettings({
  values,
  onChange,
}: {
  values: LolHotkeyValues;
  onChange: (section: string, key: string, value: string) => void;
}) {
  const [activeSection, setActiveSection] = useState<HotkeySectionKey>('hero');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ hero: true });
  const [captureTarget, setCaptureTarget] = useState<HotkeyCaptureTarget | null>(null);
  const allBindings = useMemo(() => flattenHotkeys(values), [values]);
  const categories = useMemo(() => buildHotkeyCategories(allBindings), [allBindings]);

  const navSections = useMemo(
    () => categories.map((item) => ({ key: item.key, label: item.label })),
    [categories],
  );
  useSettingsScrollSpy<HotkeySectionKey>('hotkeys', navSections, setActiveSection);

  const goToSection = useCallback((section: HotkeySectionKey) => {
    setActiveSection(section);
    setOpenSections((current) => ({ ...current, [section]: true }));
    document.getElementById(`hotkeys-section-${section}`)?.scrollIntoView({
      block: 'start',
      behavior: 'smooth',
    });
  }, []);

  const toggleSection = useCallback((section: HotkeySectionKey) => {
    setOpenSections((current) => ({ ...current, [section]: !(current[section] ?? false) }));
  }, []);

  const openCapture = useCallback((binding: HotkeyBinding) => {
    setCaptureTarget({ ...binding, label: hotkeyLabel(binding.key) });
  }, []);

  if (allBindings.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-app-muted">
        未读取到 input.ini 热键配置
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-[720px] grid-cols-[minmax(0,1fr)_32px] gap-4 pb-8">
      <div className="min-w-0 space-y-8">
        {categories.map((category) => (
          <HotkeyCategoryPanel
            key={category.key}
            category={category}
            open={openSections[category.key] ?? Boolean(category.defaultOpen)}
            onToggle={() => toggleSection(category.key)}
          >
            {category.key === 'hero' ? (
              <HeroHotkeyOverview
                bindings={category.bindings}
                values={values}
                onChange={onChange}
                onCapture={openCapture}
              />
            ) : (
              <HotkeyRows bindings={category.bindings} onChange={onChange} onCapture={openCapture} />
            )}
          </HotkeyCategoryPanel>
        ))}
      </div>

      <aside className="sticky top-4 flex h-[360px] flex-col items-center justify-center gap-3">
        {navSections.map((item) => (
          <SectionDot
            key={item.key}
            active={activeSection === item.key}
            label={item.label}
            onClick={() => goToSection(item.key)}
          />
        ))}
      </aside>
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
    </div>
  );
}

function HotkeyCategoryPanel({
  category,
  open,
  onToggle,
  children,
}: {
  category: HotkeyCategory;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section id={`hotkeys-section-${category.key}`} className="scroll-mt-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 py-2 text-left"
      >
        <span className="min-w-0">
          <span className="block text-base font-semibold text-app-text">{category.label}</span>
        </span>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-app-bg-soft text-lg font-semibold text-app-muted">
          {open ? '-' : '+'}
        </span>
      </button>
      {open && <div className="pt-2">{children}</div>}
    </section>
  );
}

function HeroHotkeyOverview({
  bindings,
  values,
  onChange,
  onCapture,
}: {
  bindings: HotkeyBinding[];
  values: LolHotkeyValues;
  onChange: (section: string, key: string, value: string) => void;
  onCapture: (binding: HotkeyBinding) => void;
}) {
  const visibleKeys = new Set(bindings.map(hotkeyRefKey));
  const groups = HERO_HOTKEY_GROUPS
    .map((group) => ({
      ...group,
      refs: group.refs.filter((ref) => visibleKeys.has(hotkeyRefKey(ref)) && values[ref.section]?.[ref.key] !== undefined),
    }))
    .filter((group) => group.refs.length > 0);

  const updateAllQuickbinds = (enabled: boolean) => {
    for (const group of HERO_HOTKEY_GROUPS) {
      for (const ref of group.refs) {
        const quickbindKey = quickbindKeyFor(ref.key);
        if (quickbindKey && values.Quickbinds?.[quickbindKey] !== undefined) {
          onChange('Quickbinds', quickbindKey, enabled ? '1' : '0');
        }
      }
    }
  };

  return (
    <div className="space-y-6 rounded-sm bg-app-bg-soft px-5 py-5">
      <div className="mx-auto grid h-16 max-w-[560px] grid-cols-2 rounded-sm bg-app-surface p-1">
        <button type="button" className="rounded-sm bg-app-primary/15 text-sm font-semibold text-app-text">
          全局
        </button>
        <button type="button" className="rounded-sm text-sm font-semibold text-app-muted">
          当前英雄
        </button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_190px] gap-x-6 gap-y-5">
        <div className="space-y-5">
          {groups.filter((group) => group.label === '英雄技能' || group.label === '道具').map((group) => (
            <HeroHotkeyGroup
              key={group.label}
              group={group}
              values={values}
              onChange={onChange}
              onCapture={onCapture}
            />
          ))}
        </div>
        <div className="space-y-5">
          {groups.filter((group) => group.label !== '英雄技能' && group.label !== '道具').map((group) => (
            <HeroHotkeyGroup
              key={group.label}
              group={group}
              values={values}
              onChange={onChange}
              onCapture={onCapture}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => updateAllQuickbinds(true)}>
          全部设为快捷施法
        </Button>
        <Button variant="outline" size="sm" onClick={() => updateAllQuickbinds(false)}>
          全部设为常规施法
        </Button>
      </div>
    </div>
  );
}

function HeroHotkeyGroup({
  group,
  values,
  onChange,
  onCapture,
}: {
  group: { label: string; refs: { section: string; key: string; label: string }[] };
  values: LolHotkeyValues;
  onChange: (section: string, key: string, value: string) => void;
  onCapture: (binding: HotkeyBinding) => void;
}) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-app-muted">{group.label}</h4>
      <div className="flex flex-wrap gap-2">
        {group.refs.map((ref) => {
          const quickbindKey = quickbindKeyFor(ref.key);
          const smartValue = quickbindKey ? values.Quickbinds?.[quickbindKey] : undefined;
          const value = values[ref.section]?.[ref.key] ?? '';
          return (
            <HeroHotkeyBox
              key={`${ref.section}-${ref.key}`}
              label={ref.label}
              value={value}
              smart={smartValue === '1'}
              smartToggleVisible={smartValue !== undefined}
              onCapture={() => onCapture({ section: ref.section, key: ref.key, value })}
              onToggleSmart={() => {
                if (quickbindKey && smartValue !== undefined) {
                  onChange('Quickbinds', quickbindKey, smartValue === '1' ? '0' : '1');
                }
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function HeroHotkeyBox({
  label,
  value,
  smart,
  smartToggleVisible,
  onCapture,
  onToggleSmart,
}: {
  label: string;
  value: string;
  smart: boolean;
  smartToggleVisible: boolean;
  onCapture: () => void;
  onToggleSmart: () => void;
}) {
  const displayValue = displayHotkeyValue(value);
  const compact = displayValue.length > 6;

  return (
    <div className="w-[82px]">
      <button
        type="button"
        onClick={onCapture}
        className="flex h-[74px] w-full flex-col overflow-hidden rounded-sm bg-app-surface text-app-text shadow-sm ring-1 ring-app-border transition hover:ring-app-primary"
        aria-label={`修改${label}`}
      >
        <span className="flex min-h-0 flex-1 items-center justify-center px-1">
          <span className={`truncate font-semibold ${compact ? 'text-sm' : 'text-3xl'}`}>
            {displayValue}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onToggleSmart}
        disabled={!smartToggleVisible}
        className={`mt-1 flex h-6 w-full items-center justify-center rounded-sm text-base transition ${
          smart
            ? 'bg-app-primary/15 text-app-primary'
            : 'bg-app-surface text-app-muted'
        } ${smartToggleVisible ? 'hover:text-app-primary' : 'opacity-35'}`}
        aria-label={`${smart ? '关闭' : '开启'}${label}快捷施法`}
      >
        ↩
      </button>
    </div>
  );
}

function HotkeyRows({
  bindings,
  onChange,
  onCapture,
}: {
  bindings: HotkeyBinding[];
  onChange: (section: string, key: string, value: string) => void;
  onCapture: (binding: HotkeyBinding) => void;
}) {
  return (
    <div className="max-w-[560px] space-y-1">
      {bindings.map((binding) => (
        <HotkeyRow
          key={`${binding.section}-${binding.key}`}
          section={binding.section}
          bindingKey={binding.key}
          value={binding.value}
          onChange={(nextValue) => onChange(binding.section, binding.key, nextValue)}
          onCapture={() => onCapture(binding)}
        />
      ))}
    </div>
  );
}

function KeyBindingButton({
  value,
  onClick,
}: {
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 min-w-0 rounded-sm bg-app-bg-soft px-3 text-left text-sm font-medium text-app-text outline-none ring-1 ring-app-border transition hover:ring-app-primary focus-visible:ring-app-primary"
    >
      <span className="block truncate">{displayHotkeyValue(value)}</span>
    </button>
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

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-[360px] rounded-md border border-app-border bg-app-surface p-4 shadow-airbnb">
        <h3 className="text-base font-semibold text-app-text">修改键位</h3>
        <p className="mt-1 text-sm text-app-muted">{target.label}</p>
        <div
          ref={captureRef}
          tabIndex={0}
          onKeyDown={captureKeyboard}
          onMouseDown={captureMouse}
          onContextMenu={(event) => event.preventDefault()}
          className="mt-4 flex h-28 cursor-crosshair items-center justify-center rounded-sm bg-app-bg-soft px-4 text-center outline-none ring-1 ring-app-border focus:ring-app-primary"
        >
          <span className="text-2xl font-semibold text-app-text">{displayHotkeyValue(captured)}</span>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setCaptured('[<Unbound>]')}>
            清空
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              取消
            </Button>
            <Button size="sm" onClick={() => onConfirm(captured)}>
              确认
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HotkeyRow({
  section,
  bindingKey,
  value,
  onChange,
  onCapture,
}: {
  section: string;
  bindingKey: string;
  value: string;
  onChange: (value: string) => void;
  onCapture: () => void;
}) {
  const label = hotkeyLabel(bindingKey);

  return (
    <div className="grid grid-cols-[220px_260px] items-center gap-3 py-1.5">
      <div className="min-w-0">
        <div className="truncate text-sm text-app-body" title={label}>{label}</div>
      </div>
      {isSwitchHotkey(section, value) ? (
        <div className="flex justify-start">
          <SwitchControl checked={value === '1'} onChange={(checked) => onChange(checked ? '1' : '0')} />
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-2">
          <KeyBindingButton value={value} onClick={onCapture} />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onChange('[<Unbound>]')}
            aria-label="清空热键"
            title="清空"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
