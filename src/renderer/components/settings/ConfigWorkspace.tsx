import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, CircleAlert, FileText, Gamepad2, LoaderCircle, Upload } from 'lucide-react';
import type {
  LolClientConfigValues,
  LolConfigPart,
  LolConfigProfileDetail,
  LolConfigState,
  LolConfigValues,
  LolGameConfigValues,
} from '../../../shared/api';
import { ALL_CONFIG_PARTS } from '../../../shared/configParts';
import { ConfirmDialog } from '../ui/confirm-dialog';
import {
  CLIENT_PHASE_LABELS,
  CONFIG_BLOCKED_PHASES,
  buildHotkeyBaseline,
  countConfigChanges,
  countPartDiffs,
  withClientValue,
  withGameValue,
  withHotkeyValue,
} from './configFields';
import { buildConfigDiff, revertConfigRow, type ConfigDiffRow } from './configDiff';
import { ConfigHero, type HeroState } from './ConfigHero';
import { ConfigTabs, DiffPanel, HotkeyPanel, PartPanel, type RowCompare, type Subject, type Tab } from './ConfigPanels';
import { SettingsCompareContext } from './SettingsControls';

// 游戏设置与方案。
//
// 这一页回答一个问题：我存的方案，和现在登录的这个号，一不一样？
// 顶上一句话就是答案：「完全一样」，或者「有 6 处不一样」+「应用到这个号」。
// 不一样的时候也可能是在游戏里刚调过手感，所以旁边还有一个反方向的「存进方案」。
// 下面按块分开（画面、操作…客户端），第一块「不一样」只列出差的那几行，前后对照着看。
// 看方案时改的是方案（自动保存）；切到「游戏里」改的是游戏，要点「写入游戏」才生效。

type Confirm = 'overwrite' | 'delete' | 'offline' | null;

const AUTOSAVE_MS = 700;

const sum = (stats: Record<LolConfigPart, number>, parts: LolConfigPart[] = ALL_CONFIG_PARTS) =>
  parts.reduce((total, part) => total + stats[part], 0);

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
  const [subject, setSubject] = useState<Subject>('account');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [details, setDetails] = useState<Map<string, LolConfigProfileDetail>>(new Map());
  const [detailErrors, setDetailErrors] = useState<Map<string, string>>(new Map());
  // 方案里正在改的值（乐观更新），自动保存成功、和存好的一样后清掉。
  const [local, setLocal] = useState<Map<string, LolConfigValues>>(new Map());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [excluded, setExcluded] = useState<Set<LolConfigPart>>(new Set());
  const [naming, setNaming] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [tabChoice, setTabChoice] = useState<{ key: string; tab: Tab } | null>(null);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const touchedRef = useRef(false);
  const timersRef = useRef(new Map<string, number>());
  const pendingSaveRef = useRef(new Map<string, () => Promise<unknown>>());
  // 和 local 同步的一份：同一时刻连着改两项（比如分辨率的宽和高）时，第二次要接着第一次改。
  const localRef = useRef(new Map<string, LolConfigValues>());
  const scrollRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [heroOut, setHeroOut] = useState(false);

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
  // 选中的方案：这个号正在用的那个，没有就选最近存的。有方案时先看方案。
  useEffect(() => {
    if (entries.length === 0) {
      if (profileId !== null) setProfileId(null);
      if (subject !== 'account') setSubject('account');
      return;
    }
    if (profileId && entries.some((entry) => entry.profile.id === profileId)) return;
    if (entries.some((entry) => !entry.stats && !entry.error)) return;
    const matched = entries.find((entry) => entry.stats && sum(entry.stats) === 0);
    const newest = [...entries].sort((a, b) => b.profile.updatedAt - a.profile.updatedAt)[0];
    setProfileId((matched ?? newest).profile.id);
    if (!touchedRef.current) {
      touchedRef.current = true;
      setSubject('profile');
    }
  }, [entries, profileId, subject]);

  const entry = entries.find((item) => item.profile.id === profileId) ?? null;
  const showingProfile = subject === 'profile' && Boolean(entry);
  const values = showingProfile ? entry?.values ?? null : draft;

  const connected = Boolean(client?.connected);
  const [accountName = '', accountTag = ''] = (connected ? client?.summonerName || '当前账号' : '').split('#');
  const who = connected ? accountName : '这台电脑';
  const blocked = connected && client ? CONFIG_BLOCKED_PHASES[client.phase] : undefined;
  const pending = countConfigChanges(draft, account);
  const chosenParts = ALL_CONFIG_PARTS.filter((part) => !excluded.has(part));

  // 正在看的这边和游戏里比（看游戏里时，比的是改之前）。
  const diffGroups = useMemo(() => (values ? buildConfigDiff(values, account) : []), [account, values]);
  const partStats = useMemo(() => {
    const stats = Object.fromEntries(ALL_CONFIG_PARTS.map((part) => [part, 0])) as Record<LolConfigPart, number>;
    for (const group of diffGroups) stats[group.part] = group.rows.length;
    return stats;
  }, [diffGroups]);
  const diffTotal = sum(partStats);

  const settingsCompare = useMemo(() => (values ? {
    label: showingProfile ? '游戏里' : '改之前',
    fields: new Map<string, string>(),
    hotkeys: buildHotkeyBaseline(values.hotkeys, account.hotkeys),
  } : null), [account, showingProfile, values]);

  // ---------- 选哪一块 ----------
  // 换了方案、换了看哪边（或者方案刚读出来）时定一次：有不一样的先看「不一样」，否则看画面。
  // 定下来以后不再跟着变，免得改着改着页面自己跳走。
  const tabKey = `${showingProfile ? 'profile' : 'account'}:${profileId ?? ''}:${values ? 'ready' : 'wait'}`;
  const defaultTab: Tab = diffTotal > 0 ? 'diff' : 'video';
  useEffect(() => {
    setTabChoice({ key: tabKey, tab: defaultTab });
    // 只在 tabKey 变的时候定；defaultTab 之后再变不跟。
  }, [tabKey]);
  const tab: Tab = tabChoice?.key === tabKey ? tabChoice.tab : defaultTab;
  const pickTab = (next: Tab) => setTabChoice({ key: tabKey, tab: next });
  const showDiffTab = diffTotal > 0 || tab === 'diff';

  // 换块时回到这一块的开头：已经往下翻过的，停在标签栏下面；没翻过的不动，顶上那句话还看得见。
  useEffect(() => {
    const host = scrollRef.current;
    if (!host) return;
    // 标签栏吸顶时 offsetTop 会跟着变，用它上面那张卡的高度算。
    const top = heroRef.current?.offsetHeight ?? 0;
    if (host.scrollTop > top) host.scrollTo({ top });
  }, [tab, subject, profileId]);

  // 顶上那张卡翻出去以后，标签栏右边补一个小的「应用」，不用再翻回去。
  useEffect(() => {
    const root = scrollRef.current;
    const node = heroRef.current;
    if (!root || !node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([item]) => setHeroOut(item.intersectionRatio < 0.35), { root, threshold: [0, 0.35, 1] });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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
  const revert = useCallback((id: string) => {
    edit((current) => revertConfigRow(current, account, id));
  }, [account, edit]);

  const toggleExclude = (part: LolConfigPart) => setExcluded((set) => {
    const next = new Set(set);
    if (next.has(part)) next.delete(part);
    else next.add(part);
    return next;
  });

  const jump = (row: ConfigDiffRow) => {
    pickTab(row.part);
    setFocus({ id: row.id, n: Date.now() });
  };

  // ---------- 存、应用、删 ----------
  const forgetLocal = (id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) window.clearTimeout(timer);
    timersRef.current.delete(id);
    pendingSaveRef.current.delete(id);
    localRef.current.delete(id);
    setLocal(new Map(localRef.current));
  };

  const createProfile = async (name: string) => {
    const id = await onSaveProfile(name, draft);
    if (id) {
      setNaming(false);
      setProfileId(id);
      setSubject('profile');
    }
  };

  const applyProfile = async () => {
    if (!entry) return;
    await saveProfileNow(entry.profile.id);
    await onApplyProfile(entry.profile.id, chosenParts);
  };

  // ---------- 顶上那句话 ----------
  const syncStats = entry?.values ? countPartDiffs(entry.values, account) : null;
  let hero: HeroState;
  if (pending > 0) hero = { kind: 'pending', total: pending, stats: countPartDiffs(draft, account) };
  else if (!entry) hero = { kind: 'none' };
  else if (entry.error) hero = { kind: 'error', text: entry.error };
  else if (!syncStats) hero = { kind: 'loading' };
  else if (sum(syncStats) === 0) hero = { kind: 'synced' };
  else hero = { kind: 'diff', total: sum(syncStats), stats: syncStats };

  const compare: RowCompare = showingProfile
    ? { wasLabel: '游戏里', revertLabel: '改成和游戏里一样', onRevert: revert }
    : { wasLabel: '改之前', revertLabel: '撤销这一项', onRevert: revert };

  let panel: ReactNode = null;
  if (values) {
    if (tab === 'diff') {
      panel = (
        <DiffPanel
          groups={diffGroups}
          subject={showingProfile ? 'profile' : 'account'}
          excluded={excluded}
          beforeLabel={showingProfile ? `${connected ? `${who} ` : '游戏里'}现在` : '改之前'}
          afterLabel={showingProfile ? `方案「${entry?.profile.name ?? ''}」` : '改之后'}
          revertLabel={showingProfile ? '用游戏里的' : '撤销'}
          emptyText={showingProfile ? '方案和游戏里已经完全一样了' : '没有改动了'}
          onToggleExclude={toggleExclude}
          onRevert={revert}
          onJump={jump}
        />
      );
    } else if (tab === 'hotkeys') {
      panel = <HotkeyPanel values={values} baseline={account} compare={compare} focus={focus} onChange={setHotkey} />;
    } else {
      panel = (
        <PartPanel
          part={tab}
          values={values}
          baseline={account}
          compare={compare}
          focus={focus}
          showBlocked={!showingProfile}
          onGame={setGame}
          onClient={setClient}
        />
      );
    }
  }

  const profileName = entry?.profile.name ?? '';
  const caption = showingProfile ? (
    <>
      <b>方案「{profileName}」里存的设置</b>
      <span>改了自动保存，点上面的「应用」才会写进游戏</span>
    </>
  ) : (
    <>
      <b>{connected ? `${who} 现在的设置` : '这台电脑上的游戏设置'}</b>
      <span>改完点上面的「写入游戏」才生效</span>
    </>
  );

  // 顶上那张卡翻出去以后，底下浮一条小栏：还差几处、一个按钮，不用翻回去。
  let dock: ReactNode = null;
  if (heroOut && hero.kind === 'diff' && !blocked && entry) {
    const taken = ALL_CONFIG_PARTS.filter((part) => !excluded.has(part)).reduce((total, part) => total + hero.stats[part], 0);
    if (taken > 0) {
      dock = (
        <>
          <span>和「{entry.profile.name}」还有 <b className="num">{hero.total}</b> 处不一样</span>
          <button type="button" className="cw-btn cw-btn--primary cw-btn--sm" disabled={Boolean(busy)} onClick={() => (connected ? void applyProfile() : setConfirm('offline'))}>
            {connected ? '应用到这个号' : '应用到本机'}
            <ArrowRight />
          </button>
        </>
      );
    }
  } else if (heroOut && hero.kind === 'pending' && !blocked) {
    dock = (
      <>
        <span>改了 <b className="num">{hero.total}</b> 项，还没写进游戏</span>
        <button type="button" className="cw-btn cw-btn--sm" disabled={Boolean(busy)} onClick={onUndo}>撤销</button>
        <button type="button" className="cw-btn cw-btn--primary cw-btn--sm" disabled={Boolean(busy)} onClick={onApplyDraft}>
          <Upload />
          写入游戏
        </button>
      </>
    );
  }

  return (
    <div className="cw">
      <main ref={scrollRef} data-settings-scroll className="cw-scroll">
        <div ref={heroRef}>
          <ConfigHero
            state={hero}
            profiles={entries.map((item) => ({ profile: item.profile, total: item.stats ? sum(item.stats) : null, error: item.error }))}
            selected={entry ? { profile: entry.profile, total: syncStats ? sum(syncStats) : null, error: entry.error } : null}
            account={{
              connected,
              name: accountName,
              tag: accountTag,
              who,
              phase: blocked ?? CLIENT_PHASE_LABELS[client?.phase ?? ''] ?? '在线',
              blocked,
            }}
            excluded={excluded}
            busy={busy}
            saving={Boolean(entry && (saving.has(entry.profile.id) || local.has(entry.profile.id)))}
            naming={naming}
            dirControl={dirControl}
            onPick={(id) => {
              setProfileId(id);
              setSubject('profile');
            }}
            onStartNaming={() => setNaming(true)}
            onCancelNaming={() => setNaming(false)}
            onCreate={(name) => void createProfile(name)}
            onOverwrite={() => setConfirm('overwrite')}
            onDelete={() => setConfirm('delete')}
            onToggleExclude={toggleExclude}
            onApply={() => (connected ? void applyProfile() : setConfirm('offline'))}
            onUpdateProfile={() => setConfirm('overwrite')}
            onWrite={onApplyDraft}
            onUndo={onUndo}
            onRefreshClient={onRefreshClient}
          />
        </div>

        <div ref={tabsRef} className="cw-sticky">
          <ConfigTabs
            tab={tab}
            onTab={pickTab}
            stats={partStats}
            subject={showingProfile ? 'profile' : 'account'}
            excluded={excluded}
            diffTotal={diffTotal}
            showDiff={showDiffTab}
            diffLabel={showingProfile ? '不一样' : '改过的'}
            onSubject={setSubject}
            subjects={entry ? [
              { key: 'profile', label: '方案', title: `看、改方案「${profileName}」`, icon: <FileText /> },
              { key: 'account', label: '游戏里', title: connected ? `看、改 ${who} 现在的设置` : '看、改这台电脑上的游戏设置', icon: <Gamepad2 /> },
            ] : []}
          />
        </div>

        <div className="cw-body">
          {!values ? (
            <div className="cw-calm">
              {entry?.error ? <CircleAlert /> : <LoaderCircle className="as-spin" />}
              <b>{entry?.error || '读取中…'}</b>
            </div>
          ) : (
            <SettingsCompareContext.Provider value={settingsCompare}>
              <p className="cw-caption">
                {caption}
                {tab !== 'diff' && partStats[tab] > 0 && (
                  <em><i />{showingProfile ? '和游戏里不一样' : '改过的'}</em>
                )}
              </p>
              {panel}
            </SettingsCompareContext.Provider>
          )}
        </div>

        {dock && (
          <div className="cw-dock">
            <div className="cw-dock__bar" role="status">{dock}</div>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={confirm === 'overwrite'}
        title={`把${connected ? ` ${who} ` : '游戏里'}现在的设置存进方案`}
        description={`「${profileName}」会整个换成${connected ? ` ${who} ` : '游戏里'}现在的设置${syncStats && sum(syncStats) > 0 ? `，那 ${sum(syncStats)} 处不一样的以游戏里为准` : ''}。`}
        confirmLabel="存进方案"
        busy={busy === 'save-profile'}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        onConfirm={() => {
          if (!entry) return;
          forgetLocal(entry.profile.id);
          void onSaveProfile(entry.profile.name, draft).then(() => setConfirm(null));
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="删除方案"
        description={`删除「${profileName}」？游戏里现在的设置不受影响。`}
        confirmLabel="删除"
        destructive
        busy={busy === 'delete-profile'}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        onConfirm={() => {
          if (!entry) return;
          forgetLocal(entry.profile.id);
          void onDeleteProfile(entry.profile.id).then(() => {
            setProfileId(null);
            setConfirm(null);
          });
        }}
      />
      <ConfirmDialog
        open={confirm === 'offline'}
        title="客户端没登录"
        description="只能写进这台电脑上的游戏文件。之后登录的号如果开着云端同步，可能会被它自己的设置盖掉。"
        confirmLabel="仍然写入"
        busy={busy === 'apply-profile'}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        onConfirm={() => {
          setConfirm(null);
          void applyProfile();
        }}
      />
    </div>
  );
}

