import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  LoaderCircle,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  LolClientConfigValues,
  LolConfigPart,
  LolConfigProfileDetail,
  LolConfigState,
  LolConfigValues,
  LolGameConfigValues,
} from '../../../shared/api';
import { ALL_CONFIG_PARTS, CONFIG_PARTS } from '../../../shared/configParts';
import { ConfirmDialog } from '../ui/confirm-dialog';
import {
  CLIENT_FIELDS,
  CLIENT_LAYOUT,
  CLIENT_PHASE_LABELS,
  CONFIG_BLOCKED_PHASES,
  GAME_FIELDS,
  GAME_LAYOUT,
  buildHotkeyBaseline,
  countConfigChanges,
  countPartDiffs,
  withClientValue,
  withGameValue,
  withHotkeyValue,
} from './configFields';
import { HeroHotkeys, HotkeyCaptureDialog, compareText } from './HotkeySettings';
import {
  buildHotkeyCategories,
  displayHotkeyValue,
  flattenHotkeys,
  hotkeyLabel,
  isSwitchHotkey,
  type HotkeyBinding,
  type HotkeyCaptureTarget,
} from './hotkeyModel';
import { SettingsCompareContext } from './SettingsControls';
import {
  CLIENT_CONTROLS,
  ChoiceMenu,
  FIELD_HINTS,
  GAME_CONTROLS,
  MiniRange,
  MiniSwitch,
  ResolutionMenu,
  SheetRow,
  VolumeMini,
} from './SheetControls';

// 游戏设置与方案。
//
// 这一页只回答一件事：我的方案，和现在登录的这个号，一不一样？
// 顶上一条「方案 → 号」：左边方案，右边这个号，中间那根线就是答案——
// 一样是绿色实线「已同步」，不一样是金色虚线「12 处不同 · 应用」，点一下就同步过去。
// 下面是一张设置清单：两列小字，名字在左、值在右，点值就地改；
// 和这个号不一样的值标金色，旁边划线的是这个号现在的值。
// 看方案时改的是方案（自动保存），看这个号时改的是游戏（点「写入游戏」才生效）。

type View = 'profile' | 'account';
type Confirm = 'overwrite' | 'delete' | 'offline' | null;

const PART_LABEL = Object.fromEntries(CONFIG_PARTS.map((part) => [part.key, part.label])) as Record<LolConfigPart, string>;
const AUTOSAVE_MS = 700;

const sum = (stats: Record<LolConfigPart, number>, parts: LolConfigPart[] = ALL_CONFIG_PARTS) =>
  parts.reduce((total, part) => total + stats[part], 0);

const shortName = (riotId: string) => riotId.split('#')[0];

function formatDate(time: number): string {
  if (!time) return '';
  const date = new Date(time);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return `${sameYear ? '' : `${date.getFullYear()}年`}${date.getMonth() + 1}月${date.getDate()}日`;
}

export interface ConfigWorkspaceProps {
  state: LolConfigState;
  draft: LolConfigValues;
  busy: string | null;
  dirControl: ReactNode;
  onDraftChange: (update: (values: LolConfigValues) => LolConfigValues) => void;
  onUndo: () => void;
  onApplyDraft: () => void;
  onRefreshClient: () => void;
  onSaveProfile: (name: string, values: LolConfigValues, options?: { quiet?: boolean }) => Promise<string | null>;
  onApplyProfile: (profileId: string, parts: LolConfigPart[]) => Promise<void>;
  onDeleteProfile: (profileId: string) => Promise<void>;
}

export function ConfigWorkspace({
  state,
  draft,
  busy,
  dirControl,
  onDraftChange,
  onUndo,
  onApplyDraft,
  onRefreshClient,
  onSaveProfile,
  onApplyProfile,
  onDeleteProfile,
}: ConfigWorkspaceProps) {
  const { profiles, client } = state;
  const account = state.values;
  const [view, setView] = useState<View>('account');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [details, setDetails] = useState<Map<string, LolConfigProfileDetail>>(new Map());
  const [detailErrors, setDetailErrors] = useState<Map<string, string>>(new Map());
  // 方案里正在改的值（乐观更新），自动保存成功、和存好的一样后清掉。
  const [local, setLocal] = useState<Map<string, LolConfigValues>>(new Map());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [parts, setParts] = useState<Set<LolConfigPart>>(new Set(ALL_CONFIG_PARTS));
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const touchedRef = useRef(false);
  const timersRef = useRef(new Map<string, number>());
  const pendingSaveRef = useRef(new Map<string, () => Promise<unknown>>());
  // 和 local 同步的一份：同一时刻连着改两项（比如分辨率的宽和高）时，第二次要接着第一次改。
  const localRef = useRef(new Map<string, LolConfigValues>());

  // ---------- 读每个方案的内容（要算它和这个号差几处） ----------
  useEffect(() => {
    let cancelled = false;
    for (const profile of profiles) {
      const cached = details.get(profile.id);
      if ((cached && cached.updatedAt === profile.updatedAt) || detailErrors.has(profile.id)) continue;
      const load = typeof window.lolHelper.config.getProfile === 'function'
        ? window.lolHelper.config.getProfile(profile.id)
        : Promise.reject(new Error('No handler registered'));
      load
        .then((loaded) => {
          if (cancelled) return;
          if (loaded) setDetails((map) => new Map(map).set(profile.id, loaded));
          else setDetailErrors((map) => new Map(map).set(profile.id, '方案读取失败'));
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          const text = error instanceof Error ? error.message : String(error);
          setDetailErrors((map) => new Map(map).set(profile.id, /No handler registered/i.test(text) ? '请重启助手' : text));
        });
    }
    return () => {
      cancelled = true;
    };
    // details / detailErrors 只用来跳过已读的。
  }, [profiles]);

  // 自动保存成功后，本地改动和存好的一样了就清掉。
  useEffect(() => {
    setLocal((map) => {
      let changed = false;
      const next = new Map(map);
      for (const [id, values] of map) {
        const saved = details.get(id);
        if (saved && !timersRef.current.has(id) && countConfigChanges(values, saved.values) === 0) {
          next.delete(id);
          localRef.current.delete(id);
          changed = true;
        }
      }
      return changed ? next : map;
    });
  }, [details]);

  // 离开页面时，没来得及存的立刻存。
  useEffect(() => () => {
    for (const timer of timersRef.current.values()) window.clearTimeout(timer);
    for (const save of pendingSaveRef.current.values()) void save();
  }, []);

  const entries = useMemo(() => profiles.map((profile) => {
    const detail = details.get(profile.id) ?? null;
    const values = local.get(profile.id) ?? detail?.values ?? null;
    const stats = values ? countPartDiffs(values, account) : null;
    return { profile, values, stats, error: detailErrors.get(profile.id) ?? '' };
  }), [account, detailErrors, details, local, profiles]);

  // ---------- 一打开停在哪 ----------
  // 选中的方案：这个号正在用的那个，没有就选最近存的。方案和号不一样时直接看方案，下面就是「应用」。
  useEffect(() => {
    if (entries.length === 0) {
      if (profileId !== null) setProfileId(null);
      if (view !== 'account') setView('account');
      return;
    }
    if (profileId && entries.some((entry) => entry.profile.id === profileId)) return;
    if (entries.some((entry) => !entry.stats && !entry.error)) return;
    const matched = entries.find((entry) => entry.stats && sum(entry.stats) === 0);
    const newest = [...entries].sort((a, b) => b.profile.updatedAt - a.profile.updatedAt)[0];
    const pick = matched ?? newest;
    setProfileId(pick.profile.id);
    if (!touchedRef.current) {
      touchedRef.current = true;
      setView(matched ? 'account' : 'profile');
    }
  }, [entries, profileId, view]);

  const entry = entries.find((item) => item.profile.id === profileId) ?? null;
  const showingProfile = view === 'profile' && Boolean(entry);
  const values = showingProfile ? entry?.values ?? null : draft;

  const connected = Boolean(client?.connected);
  const accountName = connected ? client?.summonerName || '当前账号' : '';
  const accountShort = accountName ? shortName(accountName) : '';
  const blocked = connected && client ? CONFIG_BLOCKED_PHASES[client.phase] : undefined;
  const pending = countConfigChanges(draft, account);
  const chosenParts = ALL_CONFIG_PARTS.filter((part) => parts.has(part));
  const skippedParts = ALL_CONFIG_PARTS.filter((part) => !parts.has(part));
  const syncDiff = entry?.stats ? sum(entry.stats, chosenParts) : null;

  const sheetStats = useMemo(() => (values ? countPartDiffs(values, account) : null), [account, values]);
  const compare = useMemo(() => (values ? {
    label: showingProfile ? (connected ? `${accountShort} 现在` : '游戏里现在') : '改之前',
    fields: new Map<string, string>(),
    hotkeys: buildHotkeyBaseline(values.hotkeys, account.hotkeys),
  } : null), [account, accountShort, connected, showingProfile, values]);

  // ---------- 改值 ----------
  const saveProfileNow = useCallback(async (id: string) => {
    const save = pendingSaveRef.current.get(id);
    const timer = timersRef.current.get(id);
    if (timer) window.clearTimeout(timer);
    timersRef.current.delete(id);
    pendingSaveRef.current.delete(id);
    if (save) await save();
  }, []);

  const edit = useCallback((update: (current: LolConfigValues) => LolConfigValues) => {
    if (!showingProfile || !entry?.values) {
      onDraftChange(update);
      return;
    }
    const { profile } = entry;
    const next = update(localRef.current.get(profile.id) ?? entry.values);
    localRef.current.set(profile.id, next);
    setLocal(new Map(localRef.current));
    const save = async () => {
      const latest = localRef.current.get(profile.id);
      if (!latest) return;
      setSaving((set) => new Set(set).add(profile.id));
      await onSaveProfile(profile.name, latest, { quiet: true });
      setSaving((set) => {
        const copy = new Set(set);
        copy.delete(profile.id);
        return copy;
      });
    };
    pendingSaveRef.current.set(profile.id, save);
    const old = timersRef.current.get(profile.id);
    if (old) window.clearTimeout(old);
    timersRef.current.set(profile.id, window.setTimeout(() => void saveProfileNow(profile.id), AUTOSAVE_MS));
  }, [entry, onDraftChange, onSaveProfile, saveProfileNow, showingProfile]);

  const setGame = useCallback(<K extends keyof LolGameConfigValues>(key: K, value: LolGameConfigValues[K]) => {
    edit((current) => withGameValue(current, key, value));
  }, [edit]);
  const setClient = useCallback(<K extends keyof LolClientConfigValues>(key: K, value: LolClientConfigValues[K]) => {
    edit((current) => withClientValue(current, key, value));
  }, [edit]);
  const setHotkey = useCallback((section: string, key: string, value: string) => {
    edit((current) => withHotkeyValue(current, section, key, value));
  }, [edit]);

  const togglePart = (part: LolConfigPart) => setParts((set) => {
    const next = new Set(set);
    if (next.has(part)) next.delete(part);
    else next.add(part);
    return next;
  });

  // ---------- 存、应用、删 ----------
  const createProfile = async () => {
    const name = newName.trim() || `方案 ${profiles.length + 1}`;
    const id = await onSaveProfile(name, draft);
    if (id) {
      setNaming(false);
      setNewName('');
      setProfileId(id);
    }
  };

  const applyProfile = async () => {
    if (!entry) return;
    await saveProfileNow(entry.profile.id);
    await onApplyProfile(entry.profile.id, chosenParts);
  };

  const pickProfile = (id: string) => {
    setProfileId(id);
    setView('profile');
    setMenuOpen(false);
  };

  // ---------- 中间那根线 ----------
  let wireState: 'pending' | 'empty' | 'loading' | 'error' | 'synced' | 'blocked' | 'diff' = 'empty';
  if (pending > 0) wireState = 'pending';
  else if (!entry) wireState = 'empty';
  else if (entry.error) wireState = 'error';
  else if (syncDiff === null) wireState = 'loading';
  else if (chosenParts.length > 0 && syncDiff === 0) wireState = 'synced';
  else if (blocked) wireState = 'blocked';
  else wireState = 'diff';
  const applying = busy === 'apply-profile';

  let wire: ReactNode = null;
  let wireNote = '';
  if (wireState === 'pending') {
    wire = (
      <span className="sy-wire__group">
        <span className="sy-tag" data-tone="gold">改了 <b className="num">{pending}</b> 项</span>
        <button type="button" className="sy-ghost" disabled={Boolean(busy)} onClick={onUndo} title="撤销">
          <RotateCcw />
        </button>
        <button
          type="button"
          className="sy-go"
          disabled={Boolean(busy) || Boolean(blocked)}
          onClick={onApplyDraft}
        >
          {busy === 'apply' ? <LoaderCircle className="as-spin" /> : <Upload />}
          写入游戏
        </button>
      </span>
    );
    wireNote = blocked ? `${blocked}，打完再写入` : '';
  } else if (wireState === 'empty') {
    wire = <span className="sy-tag">还没有方案</span>;
  } else if (wireState === 'error') {
    wire = <span className="sy-tag" data-tone="bad"><CircleAlert />{entry?.error}</span>;
  } else if (wireState === 'loading') {
    wire = <span className="sy-tag"><LoaderCircle className="as-spin" /></span>;
  } else if (wireState === 'synced') {
    wire = <span key="synced" className="sy-tag" data-tone="ok"><Check />已同步</span>;
  } else if (wireState === 'blocked') {
    wire = <span className="sy-tag"><b className="num">{syncDiff}</b> 处不同</span>;
    wireNote = `${blocked}，打完再应用`;
  } else {
    wire = (
      <button
        type="button"
        className="sy-go"
        disabled={Boolean(busy) || chosenParts.length === 0}
        onClick={() => (connected ? void applyProfile() : setConfirm('offline'))}
        title={`把「${entry?.profile.name}」应用到${connected ? ` ${accountShort}` : '本机'}`}
      >
        <b className="num">{syncDiff}</b> 处不同
        <i />
        {applying ? <LoaderCircle className="as-spin" /> : <>应用<ArrowRight /></>}
      </button>
    );
  }
  if (!wireNote && skippedParts.length > 0 && entry && wireState !== 'pending') {
    wireNote = `不带 ${skippedParts.map((part) => PART_LABEL[part]).join('、')}`;
  }

  return (
    <div className="sy">
      {/* ---------- 方案 → 号 ---------- */}
      <header className="sy-bar">
        <div className="sy-link">
          {naming ? (
            <form
              className="sy-node sy-node--naming"
              onSubmit={(event) => {
                event.preventDefault();
                void createProfile();
              }}
            >
              <span className="sy-node__eyebrow">存成方案</span>
              <input
                autoFocus
                id="sy-new-profile"
                className="sy-node__input"
                value={newName}
                placeholder={`方案 ${profiles.length + 1}`}
                maxLength={40}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setNaming(false);
                }}
                onBlur={() => {
                  if (!newName.trim() && busy !== 'save-profile') setNaming(false);
                }}
              />
              <span className="sy-node__meta">{busy === 'save-profile' ? '保存中…' : '回车保存'}</span>
            </form>
          ) : entry ? (
            <div className="sy-node" data-active={showingProfile ? 'true' : undefined}>
              <button type="button" className="sy-node__hit" onClick={() => setView('profile')} aria-label={`查看方案「${entry.profile.name}」`} />
              <span className="sy-node__eyebrow">
                方案{profiles.length > 1 && <span className="num"> · {profiles.findIndex((item) => item.id === entry.profile.id) + 1}/{profiles.length}</span>}
              </span>
              <b>{entry.profile.name}</b>
              <span className="sy-node__meta">
                <span className="num">{entry.values ? `${entry.values.game.width}×${entry.values.game.height}` : entry.profile.gameResolution}</span>
                {' · '}
                {saving.has(entry.profile.id) || local.has(entry.profile.id) ? '保存中…' : formatDate(entry.profile.updatedAt)}
              </span>
              <ProfileMenu
                open={menuOpen}
                onOpenChange={setMenuOpen}
                entries={entries}
                selectedId={entry.profile.id}
                connected={connected}
                busy={busy}
                onPick={pickProfile}
                onNew={() => {
                  setMenuOpen(false);
                  setNewName('');
                  setNaming(true);
                }}
                onOverwrite={() => {
                  setMenuOpen(false);
                  setConfirm('overwrite');
                }}
                onDelete={() => {
                  setMenuOpen(false);
                  setConfirm('delete');
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              className="sy-node sy-node--add"
              disabled={Boolean(busy)}
              onClick={() => {
                setNewName('');
                setNaming(true);
              }}
            >
              <Plus />
              <b>存成方案</b>
              <span className="sy-node__meta">把这个号的设置存下来</span>
            </button>
          )}

          <div className="sy-wire" data-state={wireState} data-running={applying ? 'true' : undefined}>
            <span className="sy-wire__line" aria-hidden="true" />
            {wire}
            {wireNote && <small className="sy-wire__note">{wireNote}</small>}
          </div>

          <div
            className="sy-node sy-node--account"
            data-active={!showingProfile ? 'true' : undefined}
            data-state={!connected ? 'off' : blocked ? 'busy' : 'ok'}
          >
            <button
              type="button"
              className="sy-node__hit"
              onClick={() => setView('account')}
              onDoubleClick={onRefreshClient}
              aria-label="查看这个号现在的设置"
              title="双击刷新账号状态"
            />
            <span className="sy-node__eyebrow"><i />{connected ? '这个号' : '未登录'}</span>
            <b>{connected ? accountName : '本机设置'}</b>
            <span className="sy-node__meta">
              {connected ? (blocked ?? CLIENT_PHASE_LABELS[client?.phase ?? ''] ?? '在线') : '只改本机文件'}
              <span className="num"> · {account.game.width}×{account.game.height}</span>
            </span>
          </div>
        </div>
        <div className="sy-bar__tools">{dirControl}</div>
      </header>

      {/* ---------- 设置清单 ---------- */}
      <main data-settings-scroll className="sy-scroll">
        {!values || !sheetStats ? (
          <div className="as-empty">
            {entry?.error ? <CircleAlert /> : <LoaderCircle className="as-spin" />}
            <b>{entry?.error || '读取中…'}</b>
          </div>
        ) : (
          <SettingsCompareContext.Provider value={compare}>
            <p className="sy-caption">
              {showingProfile ? (
                <>方案「{entry?.profile.name}」<span>· 改动自动保存</span></>
              ) : (
                <>{connected ? accountShort : '本机'} 现在的设置<span>· 改完点「写入游戏」</span></>
              )}
              {(showingProfile ? sum(sheetStats) : pending) > 0 && (
                <em><i />{showingProfile ? `和${connected ? ` ${accountShort} ` : '游戏'}不同` : '改过的'}</em>
              )}
            </p>
            <Sheet
              values={values}
              baseline={account}
              stats={sheetStats}
              mode={showingProfile ? 'profile' : 'account'}
              parts={parts}
              wasLabel={compare?.label ?? ''}
              onTogglePart={togglePart}
              onGame={setGame}
              onClient={setClient}
              onHotkey={setHotkey}
            />
          </SettingsCompareContext.Provider>
        )}
      </main>

      <ConfirmDialog
        open={confirm === 'overwrite'}
        title="用这个号的设置覆盖方案"
        description={`「${entry?.profile.name ?? ''}」会被替换成${connected ? ` ${accountShort} ` : '游戏里'}现在的设置。`}
        confirmLabel="覆盖"
        busy={busy === 'save-profile'}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        onConfirm={() => {
          if (!entry) return;
          const timer = timersRef.current.get(entry.profile.id);
          if (timer) window.clearTimeout(timer);
          timersRef.current.delete(entry.profile.id);
          pendingSaveRef.current.delete(entry.profile.id);
          localRef.current.delete(entry.profile.id);
          setLocal(new Map(localRef.current));
          void onSaveProfile(entry.profile.name, draft).then(() => setConfirm(null));
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="删除方案"
        description={`删除「${entry?.profile.name ?? ''}」？游戏里现在的设置不受影响。`}
        confirmLabel="删除"
        destructive
        busy={busy === 'delete-profile'}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        onConfirm={() => {
          if (!entry) return;
          const timer = timersRef.current.get(entry.profile.id);
          if (timer) window.clearTimeout(timer);
          timersRef.current.delete(entry.profile.id);
          pendingSaveRef.current.delete(entry.profile.id);
          localRef.current.delete(entry.profile.id);
          setLocal(new Map(localRef.current));
          void onDeleteProfile(entry.profile.id).then(() => {
            setProfileId(null);
            setConfirm(null);
          });
        }}
      />
      <ConfirmDialog
        open={confirm === 'offline'}
        title="客户端未登录"
        description="只能写入本机游戏文件，登录后可能被账号的云端设置覆盖。"
        confirmLabel="仍然写入"
        busy={applying}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        onConfirm={() => {
          setConfirm(null);
          void applyProfile();
        }}
      />
    </div>
  );
}

// ---------- 方案菜单：换方案、新建、覆盖、删除 ----------

function ProfileMenu({
  open,
  onOpenChange,
  entries,
  selectedId,
  connected,
  busy,
  onPick,
  onNew,
  onOverwrite,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: Array<{ profile: { id: string; name: string }; stats: Record<LolConfigPart, number> | null; error: string }>;
  selectedId: string;
  connected: boolean;
  busy: string | null;
  onPick: (id: string) => void;
  onNew: () => void;
  onOverwrite: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onOpenChange, open]);

  return (
    <div className="sy-menu" ref={ref}>
      <button
        type="button"
        className="sy-menu__btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="方案菜单"
        onClick={() => onOpenChange(!open)}
      >
        <ChevronDown />
      </button>
      {open && (
        <div className="sy-menu__pop" role="menu">
          {entries.map((item) => {
            const total = item.stats ? sum(item.stats) : null;
            return (
              <button
                key={item.profile.id}
                type="button"
                role="menuitemradio"
                aria-checked={item.profile.id === selectedId}
                onClick={() => onPick(item.profile.id)}
              >
                <span>{item.profile.name}</span>
                {item.error ? (
                  <em data-tone="bad">读不了</em>
                ) : total === null ? null : total === 0 ? (
                  <em data-tone="ok"><Check />{connected ? '正在用' : '一致'}</em>
                ) : (
                  <em><span className="num">{total}</span> 处不同</em>
                )}
              </button>
            );
          })}
          <hr />
          <button type="button" role="menuitem" disabled={Boolean(busy)} onClick={onNew}>
            <Plus />
            <span>把这个号存成新方案</span>
          </button>
          <button type="button" role="menuitem" disabled={Boolean(busy)} onClick={onOverwrite}>
            <RotateCcw />
            <span>用这个号覆盖此方案</span>
          </button>
          <button type="button" role="menuitem" data-tone="danger" disabled={Boolean(busy)} onClick={onDelete}>
            <Trash2 />
            <span>删除此方案</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- 设置清单 ----------

const LEFT: LolConfigPart[] = ['video', 'controls'];
const RIGHT: LolConfigPart[] = ['interface', 'combat', 'audio'];

function Sheet({
  values,
  baseline,
  stats,
  mode,
  parts,
  wasLabel,
  onTogglePart,
  onGame,
  onClient,
  onHotkey,
}: {
  values: LolConfigValues;
  baseline: LolConfigValues;
  stats: Record<LolConfigPart, number>;
  mode: View;
  parts: Set<LolConfigPart>;
  wasLabel: string;
  onTogglePart: (part: LolConfigPart) => void;
  onGame: <K extends keyof LolGameConfigValues>(key: K, value: LolGameConfigValues[K]) => void;
  onClient: <K extends keyof LolClientConfigValues>(key: K, value: LolClientConfigValues[K]) => void;
  onHotkey: (section: string, key: string, value: string) => void;
}) {
  const card = (part: LolConfigPart, children: ReactNode, wide = false) => (
    <SheetCard
      key={part}
      part={part}
      wide={wide}
      diff={stats[part]}
      mode={mode}
      included={parts.has(part)}
      onToggle={() => onTogglePart(part)}
    >
      {children}
    </SheetCard>
  );

  const gameSection = (part: LolConfigPart) => {
    const section = GAME_LAYOUT.find((item) => item.part === part);
    if (!section) return null;
    return card(part, section.groups.map((group, index) => (
      <div key={group.title ?? index} className="sy-group">
        {group.title && <h4>{group.title}</h4>}
        {group.keys.map((key) => (
          <GameRow key={key} field={key} values={values} baseline={baseline} wasLabel={wasLabel} onChange={onGame} />
        ))}
      </div>
    )));
  };

  return (
    <div className="sy-sheet">
      <div className="sy-col">{LEFT.map(gameSection)}</div>
      <div className="sy-col">{RIGHT.map(gameSection)}</div>
      {card('hotkeys', <HotkeySheet values={values} baseline={baseline} wasLabel={wasLabel} onChange={onHotkey} />, true)}
      {card('client', (
        <div className="sy-split">
          {CLIENT_LAYOUT.map((section) => (
            <div key={section.key} className="sy-group">
              <h4>{section.label}</h4>
              {section.groups.flatMap((group) => group.keys).map((key) => (
                <ClientRow key={key} field={key} values={values} baseline={baseline} wasLabel={wasLabel} onChange={onClient} />
              ))}
              {section.key === 'privacy' && mode === 'account' && (
                <SheetRow label="聊天黑名单" hint="在客户端好友列表里管理">
                  <span className="sy-readonly num">{values.client.blockedPlayers?.length ?? 0} 人</span>
                </SheetRow>
              )}
            </div>
          ))}
        </div>
      ), true)}
    </div>
  );
}

function SheetCard({
  part,
  wide,
  diff,
  mode,
  included,
  onToggle,
  children,
}: {
  part: LolConfigPart;
  wide: boolean;
  diff: number;
  mode: View;
  included: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const label = PART_LABEL[part];
  const off = mode === 'profile' && !included;
  let chip: ReactNode = null;
  if (off) chip = <span className="sy-chip">不带</span>;
  else if (diff > 0) chip = <span className="sy-chip" data-tone="gold"><b className="num">{diff}</b> {mode === 'profile' ? '处不同' : '项改动'}</span>;
  else if (mode === 'profile') chip = <span className="sy-chip" data-tone="ok"><Check />一致</span>;

  return (
    <section className="sy-card" data-wide={wide ? 'true' : undefined} data-off={off ? 'true' : undefined} aria-label={label}>
      <header className="sy-card__head">
        {mode === 'profile' && (
          <button
            type="button"
            role="checkbox"
            aria-checked={included}
            className="sy-check"
            aria-label={`应用时带上「${label}」`}
            title={included ? '应用时带上，点一下不带' : '这次不带，点一下带上'}
            onClick={onToggle}
          >
            {included && <Check />}
          </button>
        )}
        <h3>{label}</h3>
        {chip}
      </header>
      <div className="sy-card__body">{children}</div>
    </section>
  );
}

function GameRow({
  field,
  values,
  baseline,
  wasLabel,
  onChange,
}: {
  field: keyof LolGameConfigValues;
  values: LolConfigValues;
  baseline: LolConfigValues;
  wasLabel: string;
  onChange: <K extends keyof LolGameConfigValues>(key: K, value: LolGameConfigValues[K]) => void;
}) {
  const meta = GAME_FIELDS[field];
  if (meta.hidden) return null;
  const game = values.game;
  const now = meta.format(game[field], game);
  const before = meta.format(baseline.game[field], baseline.game);
  const control = GAME_CONTROLS[field] ?? { kind: 'bool' as const };
  const set = onChange as (key: keyof LolGameConfigValues, value: unknown) => void;

  let node: ReactNode;
  switch (control.kind) {
    case 'choice':
      node = <ChoiceMenu label={meta.label} value={game[field] as string | number} options={control.options} onChange={(value) => set(field, value)} />;
      break;
    case 'range':
      node = <MiniRange label={meta.label} value={Number(game[field])} min={control.min} max={control.max} onChange={(value) => set(field, value)} />;
      break;
    case 'volume':
      node = (
        <VolumeMini
          label={meta.label}
          volume={Number(game[field])}
          muted={Boolean(game[control.mute])}
          onVolume={(value) => set(field, value)}
          onMuted={(value) => set(control.mute, value)}
        />
      );
      break;
    case 'resolution':
      node = (
        <ResolutionMenu
          width={game.width}
          height={game.height}
          onChange={(width, height) => {
            set('width', width);
            set('height', height);
          }}
        />
      );
      break;
    case 'readonly':
      node = <span className="sy-readonly">{now}</span>;
      break;
    default:
      node = <MiniSwitch label={meta.label} checked={Boolean(game[field])} onChange={(value) => set(field, value)} />;
  }

  return (
    <SheetRow label={meta.label} hint={FIELD_HINTS[field]} was={now !== before ? before : undefined} wasLabel={wasLabel}>
      {node}
    </SheetRow>
  );
}

function ClientRow({
  field,
  values,
  baseline,
  wasLabel,
  onChange,
}: {
  field: keyof LolClientConfigValues;
  values: LolConfigValues;
  baseline: LolConfigValues;
  wasLabel: string;
  onChange: <K extends keyof LolClientConfigValues>(key: K, value: LolClientConfigValues[K]) => void;
}) {
  const meta = CLIENT_FIELDS[field];
  if (meta.hidden) return null;
  const clientValues = values.client;
  const now = meta.format(clientValues[field], clientValues);
  const before = meta.format(baseline.client[field], baseline.client);
  const control = CLIENT_CONTROLS[field] ?? { kind: 'bool' as const };
  const set = onChange as (key: keyof LolClientConfigValues, value: unknown) => void;

  let node: ReactNode;
  if (control.kind === 'choice') {
    node = <ChoiceMenu label={meta.label} value={clientValues[field] as string} options={control.options} onChange={(value) => set(field, value)} />;
  } else if (control.kind === 'range') {
    node = <MiniRange label={meta.label} value={Number(clientValues[field])} min={control.min} max={control.max} onChange={(value) => set(field, value)} />;
  } else if (control.kind === 'readonly') {
    node = <span className="sy-readonly" title={now}>{now}</span>;
  } else {
    node = <MiniSwitch label={meta.label} checked={Boolean(clientValues[field])} onChange={(value) => set(field, value)} />;
  }

  // 麦克风是这台电脑的设备，不算差异。
  const differs = field !== 'voiceInputDeviceName' && now !== before;
  return (
    <SheetRow label={meta.label} hint={FIELD_HINTS[field]} was={differs ? before : undefined} wasLabel={wasLabel}>
      {node}
    </SheetRow>
  );
}

// ---------- 热键：键帽 + 其他热键按用途折叠 ----------

function HotkeySheet({
  values,
  baseline,
  wasLabel,
  onChange,
}: {
  values: LolConfigValues;
  baseline: LolConfigValues;
  wasLabel: string;
  onChange: (section: string, key: string, value: string) => void;
}) {
  const [capture, setCapture] = useState<HotkeyCaptureTarget | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const categories = useMemo(
    () => buildHotkeyCategories(flattenHotkeys(values.hotkeys)).filter((category) => category.key !== 'hero'),
    [values.hotkeys],
  );
  const changed = (binding: HotkeyBinding) =>
    (binding.value ?? '').trim().toLowerCase() !== (baseline.hotkeys[binding.section]?.[binding.key] ?? '').trim().toLowerCase();

  if (Object.keys(values.hotkeys).length === 0) {
    return <p className="sy-empty">未读取到热键配置（input.ini）</p>;
  }

  return (
    <>
      <HeroHotkeys
        compact
        values={values.hotkeys}
        onChange={onChange}
        onCapture={(binding, label) => setCapture({ ...binding, label: label ?? hotkeyLabel(binding.key) })}
      />
      <div className="sy-keys">
        {categories.map((category) => {
          const diff = category.bindings.filter(changed).length;
          const isOpen = open.has(category.key);
          return (
            <button
              key={category.key}
              type="button"
              className="sy-keys__tab"
              aria-expanded={isOpen}
              onClick={() => setOpen((set) => {
                const next = new Set(set);
                if (next.has(category.key)) next.delete(category.key);
                else next.add(category.key);
                return next;
              })}
            >
              {category.label}
              {diff > 0 ? <em className="num">{diff}</em> : <span className="num">{category.bindings.length}</span>}
            </button>
          );
        })}
      </div>
      {categories.filter((category) => open.has(category.key)).map((category) => (
        <div key={category.key} className="sy-group sy-group--keys">
          <h4>{category.label}</h4>
          {category.bindings.map((binding) => {
            const label = hotkeyLabel(binding.key);
            const before = baseline.hotkeys[binding.section]?.[binding.key] ?? '';
            const display = displayHotkeyValue(binding.value);
            return (
              <SheetRow
                key={`${binding.section}.${binding.key}`}
                label={label}
                was={changed(binding) ? compareText(binding.section, before) : undefined}
                wasLabel={wasLabel}
              >
                {isSwitchHotkey(binding.section, binding.value) ? (
                  <MiniSwitch label={label} checked={binding.value === '1'} onChange={(on) => onChange(binding.section, binding.key, on ? '1' : '0')} />
                ) : (
                  <button
                    type="button"
                    className="sy-key"
                    data-unbound={display === '未绑定' ? 'true' : undefined}
                    onClick={() => setCapture({ ...binding, label })}
                  >
                    {display}
                  </button>
                )}
              </SheetRow>
            );
          })}
        </div>
      ))}
      {capture && (
        <HotkeyCaptureDialog
          target={capture}
          onClose={() => setCapture(null)}
          onConfirm={(next) => {
            onChange(capture.section, capture.key, next);
            setCapture(null);
          }}
        />
      )}
    </>
  );
}
