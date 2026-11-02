import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  FolderOpen,
  FolderSearch,
  Gamepad2,
  Info,
  LoaderCircle,
  Palette,
  RefreshCw,
  X,
} from 'lucide-react';
import type {
  LolConfigPart,
  LolConfigState,
  LolConfigValues,
} from '../../../shared/api';
import { DEFAULT_LOL_ROOT_PATH } from '../../../shared/constants';
import { AboutSettings } from './AboutSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { countConfigChanges } from './configFields';
import { ConfigWorkspace } from './ConfigWorkspace';

interface SettingsDialogProps {
  open: boolean;
  onClose?: () => void;
  /** 作为「设置」页面嵌入外壳。现在只有这一种用法。 */
  embedded?: boolean;
}

// 「游戏设置」一页包办：看、改、存方案、换号应用（见 ConfigWorkspace）。
type TabKey = 'appearance' | 'config' | 'about';
type Notice = { type: 'success' | 'error'; text: string } | null;

const TAB_META: Record<TabKey, { label: string; icon: typeof Palette }> = {
  config: { label: '游戏设置与方案', icon: Gamepad2 },
  appearance: { label: '外观', icon: Palette },
  about: { label: '关于与游戏目录', icon: Info },
};

const NAV_GROUPS: Array<{ title: string; tabs: TabKey[] }> = [
  { title: '英雄联盟', tabs: ['config'] },
  { title: '助手', tabs: ['appearance', 'about'] },
];

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function SettingsDialog({ open }: SettingsDialogProps) {
  const [tab, setTab] = useState<TabKey>('config');
  const [state, setState] = useState<LolConfigState | null>(null);
  const [draft, setDraft] = useState<LolConfigValues | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const rootPathRef = useRef(DEFAULT_LOL_ROOT_PATH);
  const latest = useRef<{ state: LolConfigState | null; draft: LolConfigValues | null }>({ state: null, draft: null });
  latest.current = { state, draft };

  const pendingChanges = useMemo(
    () => (state && draft ? countConfigChanges(draft, state.values) : 0),
    [draft, state],
  );

  // keepDraft：面板里有没应用的改动时只更新状态（登录的号、方案列表），不把改动冲掉。
  const refresh = useCallback(async (
    pathOverride?: string,
    options: { keepDraft?: boolean; quiet?: boolean } = {},
  ): Promise<LolConfigState | null> => {
    if (!options.quiet) setBusy('read');
    try {
      const next = await window.lolHelper.config.read(pathOverride ?? rootPathRef.current);
      const previous = latest.current;
      const keep = options.keepDraft
        && previous.draft
        && previous.state
        && countConfigChanges(previous.draft, previous.state.values) > 0;
      rootPathRef.current = next.rootPath;
      setState(next);
      if (!keep) setDraft(next.values);
      if (!next.found) setNotice({ type: 'error', text: '未找到游戏配置目录' });
      return next;
    } catch (err) {
      setNotice({ type: 'error', text: errorText(err, '读取游戏设置失败') });
      return null;
    } finally {
      if (!options.quiet) setBusy(null);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh(DEFAULT_LOL_ROOT_PATH);
  }, [open, refresh]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), notice.type === 'success' ? 3_500 : 8_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    document.querySelector<HTMLElement>('[data-settings-scroll]')?.scrollTo({ top: 0 });
    // 切回游戏设置时顺手看一眼现在登录的是哪个号。
    if (tab === 'config') void refresh(undefined, { keepDraft: true, quiet: true });
  }, [refresh, tab]);

  const detectRoots = useCallback(async () => {
    setBusy('detect-root');
    try {
      const roots = await window.lolHelper.config.detectRoots();
      if (roots.length === 0) {
        setNotice({ type: 'error', text: '未找到英雄联盟目录，请手动选择' });
        return;
      }
      const next = await refresh(roots[0]);
      if (next?.found) {
        setNotice({
          type: 'success',
          text: roots.length > 1 ? `找到 ${roots.length} 个目录，先用第一个：${roots[0]}` : `找到了：${roots[0]}`,
        });
      }
    } catch (err) {
      setNotice({ type: 'error', text: errorText(err, '自动查找失败') });
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const chooseRoot = useCallback(async () => {
    setBusy('select-root');
    try {
      const selected = await window.lolHelper.config.selectRoot();
      if (!selected) return;
      const next = await refresh(selected);
      if (next?.found) setNotice({ type: 'success', text: `已切换到：${next.rootPath}` });
    } catch (err) {
      setNotice({ type: 'error', text: errorText(err, '选择文件夹失败') });
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const applyDraft = useCallback(async () => {
    if (!draft) return;
    setBusy('apply');
    try {
      const result = await window.lolHelper.config.applyValues({ rootPath: rootPathRef.current, values: draft });
      await refresh(result.rootPath, { quiet: true });
      setNotice({
        type: result.lcuSynced ? 'success' : 'error',
        text: result.lcuSynced
          ? '已应用'
          : `已写入游戏文件，未同步到客户端${result.lcuError ? `：${result.lcuError}` : ''}`,
      });
    } catch (err) {
      setNotice({ type: 'error', text: errorText(err, '应用失败') });
    } finally {
      setBusy(null);
    }
  }, [draft, refresh]);

  const saveProfile = useCallback(async (name: string, values: LolConfigValues): Promise<string | null> => {
    setBusy('save-profile');
    try {
      const trimmed = name.trim();
      const nextProfiles = await window.lolHelper.config.saveProfile({ name: trimmed, rootPath: rootPathRef.current, values });
      setState((current) => (current ? { ...current, profiles: nextProfiles } : current));
      setNotice({ type: 'success', text: `方案「${trimmed}」已保存` });
      return nextProfiles.find((profile) => profile.name === trimmed)?.id ?? null;
    } catch (err) {
      setNotice({ type: 'error', text: errorText(err, '保存方案失败') });
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  const applyProfile = useCallback(async (profileId: string, parts: LolConfigPart[]) => {
    setBusy('apply-profile');
    try {
      const result = await window.lolHelper.config.applyProfile({ profileId, rootPath: rootPathRef.current, parts });
      const next = await refresh(result.rootPath, { quiet: true });
      const account = next?.client?.summonerName?.split('#')[0];
      setNotice({
        type: result.lcuSynced ? 'success' : 'error',
        text: result.lcuSynced
          ? `方案已应用${account ? `到「${account}」` : ''}`
          : `方案已写入游戏文件，未同步到账号${result.lcuError ? `：${result.lcuError}` : ''}`,
      });
    } catch (err) {
      setNotice({ type: 'error', text: errorText(err, '应用方案失败') });
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const deleteProfile = useCallback(async (profileId: string) => {
    setBusy('delete-profile');
    try {
      const nextProfiles = await window.lolHelper.config.deleteProfile(profileId);
      setState((current) => (current ? { ...current, profiles: nextProfiles } : current));
      setNotice({ type: 'success', text: '方案已删除' });
    } catch (err) {
      setNotice({ type: 'error', text: errorText(err, '删除方案失败') });
    } finally {
      setBusy(null);
    }
  }, []);

  if (!open) return null;

  const client = state?.client;
  const navHints: Partial<Record<TabKey, { text: string; tone?: 'on' | 'count' }>> = {
    config: state?.profiles.length ? { text: `${state.profiles.length} 个方案`, tone: 'count' } : undefined,
    about: client?.connected ? { text: '已连接', tone: 'on' } : state ? { text: '未连接' } : undefined,
  };

  const dirControl = (
    <DirControl
      state={state}
      busy={busy}
      pendingChanges={pendingChanges}
      onDetect={() => void detectRoots()}
      onChoose={() => void chooseRoot()}
      onReload={() => void refresh()}
    />
  );

  let content: ReactNode;
  if (tab === 'appearance') {
    content = <AppearanceSettings />;
  } else if (tab === 'about') {
    content = (
      <AboutSettings
        state={state}
        busy={busy}
        onDetect={() => void detectRoots()}
        onChoose={() => void chooseRoot()}
        onReload={() => void refresh()}
      />
    );
  } else if (!draft || !state) {
    content = (
      <div className="as-empty st-empty--page">
        {busy === 'read' ? <LoaderCircle className="as-spin" /> : <AlertCircle />}
        <b>{busy === 'read' ? '正在读取游戏设置…' : '游戏设置读不出来'}</b>
        {busy !== 'read' && <span>去「关于与游戏目录」确认一下英雄联盟装在哪。</span>}
        {busy !== 'read' && <div className="st-empty__tools">{dirControl}</div>}
      </div>
    );
  } else {
    content = (
      <ConfigWorkspace
        state={state}
        draft={draft}
        busy={busy}
        dirControl={dirControl}
        onDraftChange={(update) => setDraft((current) => (current ? update(current) : current))}
        onUndo={() => setDraft(state.values)}
        onApplyDraft={() => void applyDraft()}
        onRefreshClient={() => void refresh(undefined, { keepDraft: true })}
        onSaveProfile={saveProfile}
        onApplyProfile={applyProfile}
        onDeleteProfile={deleteProfile}
      />
    );
  }

  return (
    <div className="st-page">
      <aside className="as-nav">
        <nav aria-label="设置分类">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="as-nav__group">
              <div className="as-nav__group-title">{group.title}</div>
              {group.tabs.map((key) => {
                const meta = TAB_META[key];
                const Icon = meta.icon;
                const hint = navHints[key];
                return (
                  <button
                    key={key}
                    type="button"
                    className="as-nav__item"
                    aria-current={tab === key ? 'page' : undefined}
                    onClick={() => setTab(key)}
                  >
                    <Icon />
                    <span>{meta.label}</span>
                    {hint && <span className="as-nav__hint" data-tone={hint.tone}>{hint.text}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="as-nav__foot">
          {tab === 'appearance'
            ? '外观改动立即生效，只影响助手自己。'
            : tab === 'config'
              ? '每个号的设置是分开存的。存一套方案，换号以后点一下就能用上。'
              : '游戏目录找对了，游戏设置才读得出来。'}
        </div>
      </aside>

      <section className="st-main">
        {tab === 'config' && draft && state ? (
          content
        ) : (
          <main data-settings-scroll className="st-scroll">
            <div className="st-content" data-size={tab === 'appearance' ? 'wide' : undefined}>
              {content}
            </div>
          </main>
        )}

        <AnimatePresence>
          {notice && (
            <motion.div
              key="toast"
              role="status"
              className="as-toast"
              data-tone={notice.type === 'error' ? 'error' : undefined}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18 }}
            >
              {notice.type === 'error' ? <AlertCircle /> : <CheckCircle2 />}
              <p>{notice.text}</p>
              <button type="button" className="as-btn as-btn--sm as-btn--ghost" onClick={() => setNotice(null)} aria-label="关闭">
                <X />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}

// 游戏目录：一个小胶囊，点开能自动查找、手动选、重新读取。
function DirControl({
  state,
  busy,
  pendingChanges,
  onDetect,
  onChoose,
  onReload,
}: {
  state: LolConfigState | null;
  busy: string | null;
  pendingChanges: number;
  onDetect: () => void;
  onChoose: () => void;
  onReload: () => void;
}) {
  const [dirOpen, setDirOpen] = useState(false);
  const dirRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dirOpen) return undefined;
    const close = (event: MouseEvent) => {
      if (!dirRef.current?.contains(event.target as Node)) setDirOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [dirOpen]);

  const folderName = state?.rootPath.split(/[\\/]/).filter(Boolean).pop() ?? '';

  return (
    <div className="st-dir" ref={dirRef}>
      <button
        type="button"
        className="st-dir__chip"
        aria-expanded={dirOpen}
        data-missing={state && !state.found ? 'true' : undefined}
        onClick={() => setDirOpen((value) => !value)}
        title={state?.rootPath}
      >
        <FolderOpen />
        <span>{folderName || '游戏目录'}</span>
        <ChevronDown />
      </button>
      {dirOpen && (
        <div className="st-dir__pop" role="dialog" aria-label="游戏目录">
          <b>游戏目录</b>
          <p title={state?.rootPath}>{state?.rootPath || '还没有目录'}</p>
          <span data-missing={state && !state.found ? 'true' : undefined}>
            {state?.found ? '已找到配置文件' : '这里没有英雄联盟的配置文件'}
          </span>
          <div>
            <button type="button" className="as-btn as-btn--sm" disabled={Boolean(busy)} onClick={() => { setDirOpen(false); onDetect(); }}>
              <FolderSearch />
              自动查找
            </button>
            <button type="button" className="as-btn as-btn--sm" disabled={Boolean(busy)} onClick={() => { setDirOpen(false); onChoose(); }}>
              <FolderOpen />
              选择文件夹
            </button>
            <button type="button" className="as-btn as-btn--sm as-btn--ghost" disabled={Boolean(busy)} onClick={() => { setDirOpen(false); onReload(); }}>
              <RefreshCw />
              {pendingChanges > 0 ? '重新读取（放弃改动）' : '重新读取'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
