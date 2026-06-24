import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Check,
  Download,
  FolderSearch,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
import type {
  LolClientConfigValues,
  LolConfigProfileSummary,
  LolConfigState,
  LolConfigValues,
  LolGameConfigValues,
} from '../../../shared/api';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

type TabKey = 'client' | 'game' | 'profiles';
type ClientSectionKey = 'general' | 'notifications' | 'chat' | 'sound' | 'voice' | 'blocked';
type GameSectionKey = 'controls' | 'gameplay' | 'alerts' | 'combat' | 'cooldowns' | 'video' | 'interface' | 'audio';
type Notice = { type: 'success' | 'error'; text: string } | null;

const DEFAULT_ROOT_PATH = 'D:\\WeGameApps\\英雄联盟';

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

const CLIENT_SECTIONS: { key: ClientSectionKey; label: string }[] = [
  { key: 'general', label: '综合' },
  { key: 'notifications', label: '通知弹窗' },
  { key: 'chat', label: '聊天&好友' },
  { key: 'sound', label: '声音' },
  { key: 'voice', label: '语音' },
  { key: 'blocked', label: '聊天黑名单' },
];

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

function formatTime(timestamp: number | null): string {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString();
}

function percentLabel(value: number): string {
  return `${Math.round(value)}`;
}

function profileLabel(profile: LolConfigProfileSummary): string {
  return `${profile.name} · ${profile.gameResolution}`;
}

function useSettingsScrollSpy<TSection extends string>(
  prefix: string,
  sections: { key: TSection; label: string }[],
  setActiveSection: (section: TSection) => void,
) {
  useEffect(() => {
    const scrollHost = document.querySelector<HTMLElement>('[data-settings-scroll]');
    if (!scrollHost) return undefined;

    let frame = 0;
    const update = () => {
      frame = 0;
      const sectionNodes = sections
        .map((section) => ({
          key: section.key,
          node: document.getElementById(`${prefix}-section-${section.key}`),
        }))
        .filter((item): item is { key: TSection; node: HTMLElement } => Boolean(item.node));

      if (sectionNodes.length === 0) return;

      const maxScrollTop = scrollHost.scrollHeight - scrollHost.clientHeight;
      if (maxScrollTop - scrollHost.scrollTop <= 2) {
        setActiveSection(sectionNodes[sectionNodes.length - 1].key);
        return;
      }

      const hostRect = scrollHost.getBoundingClientRect();
      const anchorY = hostRect.top + Math.min(180, hostRect.height * 0.38);
      let active = sectionNodes[0].key;

      for (const item of sectionNodes) {
        if (item.node.getBoundingClientRect().top <= anchorY) {
          active = item.key;
        } else {
          break;
        }
      }

      setActiveSection(active);
    };

    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    scrollHost.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    scheduleUpdate();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      scrollHost.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [prefix, sections, setActiveSection]);
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [tab, setTab] = useState<TabKey>('client');
  const [rootPath, setRootPath] = useState(DEFAULT_ROOT_PATH);
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
    void refresh(DEFAULT_ROOT_PATH);
  }, [open]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
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
          <TabButton active={tab === 'profiles'} onClick={() => setTab('profiles')}>方案</TabButton>
        </nav>

        <div className="flex min-h-0 flex-1">
          <aside className="w-40 shrink-0 border-r border-app-border bg-app-bg-soft p-3">
            <nav className="space-y-1">
              <TabButton active={tab === 'client'} onClick={() => setTab('client')}>客户端</TabButton>
              <TabButton active={tab === 'game'} onClick={() => setTab('game')}>游戏内</TabButton>
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

function ClientSettings({
  values,
  onChange,
}: {
  values: LolClientConfigValues;
  onChange: <K extends keyof LolClientConfigValues>(key: K, value: LolClientConfigValues[K]) => void;
}) {
  const [activeSection, setActiveSection] = useState<ClientSectionKey>('general');
  useSettingsScrollSpy<ClientSectionKey>('client', CLIENT_SECTIONS, setActiveSection);

  const goToSection = useCallback((section: ClientSectionKey) => {
    setActiveSection(section);
    document.getElementById(`client-section-${section}`)?.scrollIntoView({
      block: 'start',
      behavior: 'smooth',
    });
  }, []);

  return (
    <div className="mx-auto grid w-full max-w-[580px] grid-cols-[minmax(0,1fr)_32px] gap-4 pb-8">
      <div className="min-w-0 space-y-8">
      <SettingsSection prefix="client" id="general" title="综合">
        <div className="space-y-7">
          <SettingsGroup title="界面">
            <CheckboxRow label="低配机器适应模式" checked={values.lowSpecMode} onChange={(v) => onChange('lowSpecMode', v)} />
            <CheckboxRow label="禁用互动背景效果" checked={values.disableInteractiveBackground} onChange={(v) => onChange('disableInteractiveBackground', v)} />
            <CheckboxRow label="游戏期间关闭客户端" checked={values.closeClientDuringGame} onChange={(v) => onChange('closeClientDuringGame', v)} />
            <CheckboxRow label="禁用英雄技能说明文本" checked={values.disableChampionSkillText} onChange={(v) => onChange('disableChampionSkillText', v)} />
          </SettingsGroup>

          <SettingsGroup title="系统">
            <CheckboxRow label="自动发送崩溃报告" checked={values.uploadCrashReports} onChange={(v) => onChange('uploadCrashReports', v)} />
            <CheckboxRow label="将我的生涯设为不公开" checked={values.careerPrivate} onChange={(v) => onChange('careerPrivate', v)} />
          </SettingsGroup>

          <SettingsGroup title="主播模式">
            <CheckboxRow label="隐藏所有名称（仅对我）" checked={values.hideAllPlayerNamesForMe} onChange={(v) => onChange('hideAllPlayerNamesForMe', v)} />
            <CheckboxRow label="对所有人隐藏我的名称" checked={values.hideMyNameFromOthers} onChange={(v) => onChange('hideMyNameFromOthers', v)} />
            <CheckboxRow label="对所有人隐藏我的身份信息" checked={values.hideMyIdentityFromOthers} onChange={(v) => onChange('hideMyIdentityFromOthers', v)} />
          </SettingsGroup>
        </div>
      </SettingsSection>

      <SettingsSection prefix="client" id="notifications" title="通知弹窗">
        <SettingsGroup>
          <CheckboxRow label="只接受好友游戏邀请" checked={values.blockNonFriendGameInvites} onChange={(v) => onChange('blockNonFriendGameInvites', v)} />
          <ReadonlyRow label="关闭比赛通知功能" value="未定位到稳定字段" />
          <ReadonlyRow label="禁用商品·新获内容的提醒" value="未定位到稳定字段" />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection prefix="client" id="chat" title="聊天&好友">
        <SettingsGroup>
          <CheckboxRow label="当我在聊天框中点击了跳转链接时，请警告我" checked={values.linkClickWarningEnabled} onChange={(v) => onChange('linkClickWarningEnabled', v)} />
          <CheckboxRow label="显示“更多未读”指示条" checked={values.moreUnreadsEnabled} onChange={(v) => onChange('moreUnreadsEnabled', v)} />
          <CheckboxRow label="显示新的好友请求浮标" checked={values.friendRequestToastsEnabled} onChange={(v) => onChange('friendRequestToastsEnabled', v)} />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection prefix="client" id="sound" title="声音">
        <SettingsGroup>
          <CheckboxRow label="开启客户端音效" checked={values.clientAudioEnabled} onChange={(v) => onChange('clientAudioEnabled', v)} />
          <ReadonlyRow label="音效音量" value="客户端未开放稳定字段" />
          <ReadonlyRow label="音乐音量" value="客户端未开放稳定字段" />
          <ReadonlyRow label="播放英雄选择音乐" value="客户端未开放稳定字段" />
          <ReadonlyRow label="播放房间/赛前音乐" value="客户端未开放稳定字段" />
          <ReadonlyRow label="播放《英雄联盟》首页" value="客户端未开放稳定字段" />
          <ReadonlyRow label="播放登录音乐" value="客户端未开放稳定字段" />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection prefix="client" id="voice" title="语音">
        <SettingsGroup>
          <CheckboxRow label="启用组队语音" checked={values.teamVoiceEnabled} onChange={(v) => onChange('teamVoiceEnabled', v)} />
          <CheckboxRow label="自动加入队伍语音" checked={values.autoJoinTeamVoice} onChange={(v) => onChange('autoJoinTeamVoice', v)} />
          <CheckboxRow label="在我连上联盟语音时将我静音" checked={values.muteOnConnect} onChange={(v) => onChange('muteOnConnect', v)} />
          <ReadonlyRow label="输入设备" value={values.voiceInputDeviceName || values.voiceInputDeviceHandle || '-'} />
          <SliderRow label="输入音量（增强）" value={values.voiceInputVolume} min={0} max={100} onChange={(v) => onChange('voiceInputVolume', v)} />
          <SelectRow
            label="输入模式"
            value={values.voiceInputMode}
            options={[
              { value: 'voiceActivity', label: '语音活跃度' },
              { value: 'pushToTalk', label: '按住以发言' },
            ]}
            onChange={(v) => onChange('voiceInputMode', v)}
          />
          <SliderRow label="语音激活阈值" value={values.voiceSensitivity} min={0} max={100} onChange={(v) => onChange('voiceSensitivity', v)} />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection prefix="client" id="blocked" title="聊天黑名单">
        <BlockedPlayersList players={values.blockedPlayers} />
      </SettingsSection>
      </div>

      <aside className="sticky top-4 flex h-[360px] flex-col items-center justify-center gap-3">
        {CLIENT_SECTIONS.map((item) => (
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

function SectionDot({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="group relative flex size-7 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-app-primary/40"
    >
      <span
        className={`rounded-full transition-all ${
          active
            ? 'h-6 w-2 bg-app-primary shadow-[0_0_0_4px_rgba(255,56,92,0.12)]'
            : 'size-2 bg-app-border group-hover:size-2.5 group-hover:bg-app-primary/60'
        }`}
      />
      <span className="pointer-events-none absolute right-8 top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-sm bg-app-text px-2 py-1 text-xs font-medium text-app-surface opacity-0 shadow-sm transition-opacity group-hover:opacity-100 xl:block">
        {label}
      </span>
    </button>
  );
}

function SettingsSection<TSection extends string>({
  prefix,
  id,
  title,
  children,
}: {
  prefix: string;
  id: TSection;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={`${prefix}-section-${id}`}
      className="scroll-mt-4 space-y-4"
    >
      <h3 className="text-base font-semibold text-app-text">{title}</h3>
      {children}
    </section>
  );
}

function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="max-w-[460px] space-y-2">
      {title && <h4 className="mb-2 text-sm font-semibold text-app-text">{title}</h4>}
      {children}
    </div>
  );
}

function ReadonlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 py-1.5">
      <span className="text-sm text-app-body">{label}</span>
      <span className="max-w-[160px] truncate text-right text-xs text-app-muted">{value}</span>
    </div>
  );
}

function BlockedPlayersList({
  players,
}: {
  players?: LolClientConfigValues['blockedPlayers'];
}) {
  const safePlayers = Array.isArray(players) ? players : [];

  if (safePlayers.length === 0) {
    return (
      <div className="rounded-sm bg-app-bg-soft px-3 py-8 text-center text-sm text-app-muted">
        暂无聊天黑名单
      </div>
    );
  }

  return (
    <div className="grid gap-2 md:grid-cols-2">
      {safePlayers.map((player, index) => {
        const gameName = player.gameName || '-';
        const fallbackKey = player.id || player.puuid || `${gameName}-${index}`;
        return (
        <div key={fallbackKey} className="flex min-w-0 items-center gap-3 rounded-sm bg-app-bg-soft px-3 py-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-app-surface text-xs font-semibold text-app-muted">
            {player.icon > -1 ? player.icon : gameName.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-app-text">{gameName}</div>
            <div className="truncate text-xs text-app-muted">
              {player.gameTag ? `#${player.gameTag}` : player.puuid}
            </div>
          </div>
        </div>
        );
      })}
    </div>
  );
}

function GameSettings({
  values,
  onChange,
}: {
  values: LolGameConfigValues;
  onChange: <K extends keyof LolGameConfigValues>(key: K, value: LolGameConfigValues[K]) => void;
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
            <SliderRow label="鼠标速度" value={values.gameMouseSpeed} min={0} max={100} onChange={(v) => onChange('gameMouseSpeed', v)} />
            <SliderRow label="镜头移动速度（鼠标）" value={values.mapScrollSpeed} min={0} max={100} onChange={(v) => onChange('mapScrollSpeed', v)} />
            <SliderRow label="镜头移动速度（键盘）" value={values.keyboardScrollSpeed} min={0} max={100} onChange={(v) => onChange('keyboardScrollSpeed', v)} />
            <CheckboxRow label="复活时移动镜头" checked={values.snapCameraOnRespawn} onChange={(v) => onChange('snapCameraOnRespawn', v)} />
            <CheckboxRow label="启用镜头平滑" checked={values.scrollSmoothingEnabled} onChange={(v) => onChange('scrollSmoothingEnabled', v)} />
            <CheckboxRow label="按住鼠标拖拽滚屏" checked={values.middleClickDragScrollEnabled} onChange={(v) => onChange('middleClickDragScrollEnabled', v)} />
            <SelectRow label="镜头锁定模式" value={values.cameraLockMode} options={CAMERA_LOCK_OPTIONS} onChange={(v) => onChange('cameraLockMode', Number(v))} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="game" id="gameplay" title="游戏设置">
          <SettingsGroup>
            <CheckboxRow label="自动攻击" checked={values.autoAcquireTarget} onChange={(v) => onChange('autoAcquireTarget', v)} />
            <CheckboxRow label="使用移动预测" checked={values.predictMovement} onChange={(v) => onChange('predictMovement', v)} />
            <CheckboxRow label="显示防御塔射程指示器" checked={values.showTurretRangeIndicators} onChange={(v) => onChange('showTurretRangeIndicators', v)} />
            <CheckboxRow label="依据鼠标指针攻击移动" checked={values.enableTargetedAttackMove} onChange={(v) => onChange('enableTargetedAttackMove', v)} />
            <CheckboxRow label="显示推荐打野路线" checked={values.recommendJunglePaths} onChange={(v) => onChange('recommendJunglePaths', v)} />
            <CheckboxRow label="“只以英雄为目标”视为可开关选项" checked={values.targetChampionsOnlyAsToggle} onChange={(v) => onChange('targetChampionsOnlyAsToggle', v)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="game" id="alerts" title="通知">
          <SettingsGroup>
            <CheckboxRow label="受伤时屏幕闪烁" checked={values.flashScreenWhenDamaged} onChange={(v) => onChange('flashScreenWhenDamaged', v)} />
            <CheckboxRow label="失控时屏幕闪烁" checked={values.flashScreenWhenStunned} onChange={(v) => onChange('flashScreenWhenStunned', v)} />
            <CheckboxRow label="显示屏幕外的事件信号" checked={values.showOffScreenPointsOfInterest} onChange={(v) => onChange('showOffScreenPointsOfInterest', v)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="game" id="combat" title="技能和攻击显示">
          <SettingsGroup>
            <CheckboxRow label="攻击时显示目标框架" checked={values.autoDisplayTarget} onChange={(v) => onChange('autoDisplayTarget', v)} />
            <CheckboxRow label="启用线状弹道显示" checked={values.enableLineMissileVis} onChange={(v) => onChange('enableLineMissileVis', v)} />
            <CheckboxRow label="显示攻击距离" checked={values.showAttackRadius} onChange={(v) => onChange('showAttackRadius', v)} />
            <CheckboxRow label="只能使用热键施放技能" checked={values.disableHudSpellClick} onChange={(v) => onChange('disableHudSpellClick', v)} />
            <CheckboxRow label="显示技能消耗" checked={values.showSpellCosts} onChange={(v) => onChange('showSpellCosts', v)} />
            <CheckboxRow label="显示推荐技能加点" checked={values.showSpellRecommendations} onChange={(v) => onChange('showSpellRecommendations', v)} />
            <CheckboxRow label="显示中立营地计时" checked={values.showNeutralCamps} onChange={(v) => onChange('showNeutralCamps', v)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="game" id="cooldowns" title="技能冷却显示">
          <SettingsGroup>
            <SelectRow label="冷却格式" value={values.numericCooldownFormat} options={COOLDOWN_FORMAT_OPTIONS} onChange={(v) => onChange('numericCooldownFormat', Number(v))} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="game" id="video" title="画面">
          <SettingsGroup>
            <SelectRow label="窗口模式" value={values.windowMode} options={WINDOW_MODES} onChange={(v) => onChange('windowMode', v)} />
            <div className="grid grid-cols-[120px_1fr] items-center gap-3 py-1.5">
              <span className="text-sm text-app-body">分辨率</span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  value={values.width}
                  onChange={(e) => onChange('width', Number(e.target.value))}
                  className="h-8 w-24 rounded-sm border border-app-border bg-app-surface px-2 text-sm"
                />
                <span className="text-xs text-app-muted">x</span>
                <input
                  type="number"
                  value={values.height}
                  onChange={(e) => onChange('height', Number(e.target.value))}
                  className="h-8 w-24 rounded-sm border border-app-border bg-app-surface px-2 text-sm"
                />
                <select
                  value={`${values.width}x${values.height}`}
                  onChange={(e) => {
                    const [width, height] = e.target.value.split('x').map(Number);
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
            <SelectRow label="阴影质量" value={values.shadowQuality} options={QUALITY_OPTIONS} onChange={(v) => onChange('shadowQuality', Number(v))} />
            <SelectRow label="角色质量" value={values.characterQuality} options={QUALITY_OPTIONS} onChange={(v) => onChange('characterQuality', Number(v))} />
            <SelectRow label="特效质量" value={values.effectsQuality} options={QUALITY_OPTIONS} onChange={(v) => onChange('effectsQuality', Number(v))} />
            <SelectRow label="环境质量" value={values.environmentQuality} options={QUALITY_OPTIONS} onChange={(v) => onChange('environmentQuality', Number(v))} />
            <SelectRow label="帧率上限" value={values.frameCapType} options={FRAME_CAP_OPTIONS} onChange={(v) => onChange('frameCapType', Number(v))} />
            <CheckboxRow label="垂直同步" checked={values.waitForVerticalSync} onChange={(v) => onChange('waitForVerticalSync', v)} />
            <CheckboxRow label="抗锯齿 FXAA" checked={values.enableFxaa} onChange={(v) => onChange('enableFxaa', v)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="game" id="interface" title="界面">
          <SettingsGroup>
            <SelectRow label="生命槽上方名称" value={values.showSummonerNames} options={SUMMONER_NAME_OPTIONS} onChange={(v) => onChange('showSummonerNames', Number(v))} />
            <SliderRow label="用户界面缩放" value={values.globalScale} min={0} max={100} onChange={(v) => onChange('globalScale', v)} />
            <SliderRow label="聊天缩放" value={values.chatScale} min={0} max={100} onChange={(v) => onChange('chatScale', v)} />
            <SliderRow label="小地图缩放" value={values.minimapScale} min={0} max={100} onChange={(v) => onChange('minimapScale', v)} />
            <SliderRow label="指针缩放" value={values.cursorScale} min={0} max={100} onChange={(v) => onChange('cursorScale', v)} />
            <CheckboxRow label="启用用户界面动画" checked={values.enableHudAnimations} onChange={(v) => onChange('enableHudAnimations', v)} />
            <CheckboxRow label="显示 FPS 和延迟" checked={values.showFpsAndLatency} onChange={(v) => onChange('showFpsAndLatency', v)} />
            <CheckboxRow label="聊天显示时间戳" checked={values.showTimestamps} onChange={(v) => onChange('showTimestamps', v)} />
            <CheckboxRow label="显示队友聊天" checked={values.showAlliedChat} onChange={(v) => onChange('showAlliedChat', v)} />
            <CheckboxRow label="显示所有人聊天" checked={values.showAllChannelChat} onChange={(v) => onChange('showAllChannelChat', v)} />
            <CheckboxRow label="隐藏玩家名字" checked={values.hidePlayerNames} onChange={(v) => onChange('hidePlayerNames', v)} />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection prefix="game" id="audio" title="声音">
          <SettingsGroup>
            <CheckboxRow label="启用游戏音频" checked={values.enableAudio} onChange={(v) => onChange('enableAudio', v)} />
            <VolumeRow label="总音量" volume={values.masterVolume} muted={values.masterMute} onVolume={(v) => onChange('masterVolume', v)} onMuted={(v) => onChange('masterMute', v)} />
            <VolumeRow label="音乐" volume={values.musicVolume} muted={values.musicMute} onVolume={(v) => onChange('musicVolume', v)} onMuted={(v) => onChange('musicMute', v)} />
            <VolumeRow label="音效" volume={values.sfxVolume} muted={values.sfxMute} onVolume={(v) => onChange('sfxVolume', v)} onMuted={(v) => onChange('sfxMute', v)} />
            <VolumeRow label="环境音" volume={values.ambienceVolume} muted={values.ambienceMute} onVolume={(v) => onChange('ambienceVolume', v)} onMuted={(v) => onChange('ambienceMute', v)} />
            <VolumeRow label="信号" volume={values.pingsVolume} muted={values.pingsMute} onVolume={(v) => onChange('pingsVolume', v)} onMuted={(v) => onChange('pingsMute', v)} />
            <VolumeRow label="播报员" volume={values.announcerVolume} muted={values.announcerMute} onVolume={(v) => onChange('announcerVolume', v)} onMuted={(v) => onChange('announcerMute', v)} />
            <VolumeRow label="语音" volume={values.voiceVolume} muted={values.voiceMute} onVolume={(v) => onChange('voiceVolume', v)} onMuted={(v) => onChange('voiceMute', v)} />
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

function ProfileSettings({
  state,
  profileName,
  setProfileName,
  profiles,
  selectedProfileId,
  setSelectedProfileId,
  onSaveProfile,
  onApplyProfile,
  onDeleteProfile,
  busy,
}: {
  state: LolConfigState | null;
  profileName: string;
  setProfileName: (value: string) => void;
  profiles: LolConfigProfileSummary[];
  selectedProfileId: string;
  setSelectedProfileId: (value: string) => void;
  onSaveProfile: () => void;
  onApplyProfile: () => void;
  onDeleteProfile: () => void;
  busy: string | null;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Panel title="方案">
        <div className="space-y-2">
          <input
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            className="h-9 w-full rounded-sm border border-app-border bg-app-surface px-2 text-sm outline-none focus:border-app-primary"
          />
          <Button className="w-full" onClick={onSaveProfile} disabled={Boolean(busy)}>
            <Save className="size-4" />
            保存为方案
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          <select
            value={selectedProfileId}
            onChange={(e) => setSelectedProfileId(e.target.value)}
            className="h-9 w-full rounded-sm border border-app-border bg-app-surface px-2 text-sm outline-none focus:border-app-primary"
          >
            {profiles.length === 0 ? (
              <option value="">暂无方案</option>
            ) : (
              profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profileLabel(profile)}</option>
              ))
            )}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={onApplyProfile} disabled={!selectedProfileId || Boolean(busy)}>
              <Download className="size-4" />
              一键应用
            </Button>
            <Button variant="outline" onClick={onDeleteProfile} disabled={!selectedProfileId || Boolean(busy)}>
              <Trash2 className="size-4" />
              删除
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="文件">
        <div className="space-y-2">
          {(state?.files ?? []).map((file) => (
            <div key={file.key} className="grid grid-cols-[1fr_auto] gap-3 rounded-sm border border-app-border bg-app-bg-soft px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${file.exists ? 'bg-app-success' : 'bg-app-danger'}`} />
                  <span className="text-sm font-medium text-app-text">{file.label}</span>
                </div>
                <p className="mt-1 break-all text-xs text-app-muted">{file.path}</p>
              </div>
              <div className="text-right text-xs text-app-muted">
                <div>{file.exists ? `${Math.round(file.size / 1024)} KB` : '缺失'}</div>
                <div className="mt-1">{formatTime(file.updatedAt)}</div>
              </div>
            </div>
          ))}
        </div>
        {state?.warnings.length ? (
          <div className="mt-3 rounded-sm border border-app-danger/25 bg-app-danger/5 px-3 py-2 text-xs text-app-danger">
            {state.warnings.slice(0, 3).map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-app-border bg-app-surface p-4">
      <h3 className="mb-3 text-sm font-semibold text-app-text">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-3 py-1.5">
      <span className="text-sm text-app-body">{label}</span>
      <SwitchControl checked={checked} onChange={onChange} />
    </label>
  );
}

function SwitchControl({
  checked,
  onChange,
  size = 'md',
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  size?: 'sm' | 'md';
}) {
  const trackClass = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const thumbClass = size === 'sm'
    ? checked ? 'size-4 translate-x-4' : 'size-4 translate-x-0.5'
    : checked ? 'size-5 translate-x-5' : 'size-5 translate-x-0.5';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(event) => {
        event.preventDefault();
        onChange(!checked);
      }}
      className={`${trackClass} relative shrink-0 rounded-full transition-colors ${
        checked ? 'bg-blue-500' : 'bg-app-border'
      }`}
    >
      <span
        className={`absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform ${thumbClass}`}
      />
    </button>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr_42px] items-center gap-3 py-1.5">
      <span className="text-sm text-app-body">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="text-right text-xs font-medium text-app-muted">{percentLabel(value)}</span>
    </div>
  );
}

function SelectRow<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="grid grid-cols-[120px_1fr] items-center gap-3 py-1.5">
      <span className="text-sm text-app-body">{label}</span>
      <select
        value={value}
        onChange={(e) => {
          const selected = options.find((option) => String(option.value) === e.target.value);
          if (selected) onChange(selected.value);
        }}
        className="h-8 rounded-sm border border-app-border bg-app-surface px-2 text-sm outline-none focus:border-app-primary"
      >
        {options.map((option) => (
          <option key={String(option.value)} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function VolumeRow({
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
    <div className="grid grid-cols-[78px_1fr_42px_54px] items-center gap-3 py-1.5">
      <span className="text-sm text-app-body">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={volume}
        onChange={(e) => onVolume(Number(e.target.value))}
      />
      <span className="text-right text-xs font-medium text-app-muted">{percentLabel(volume)}</span>
      <label className="flex items-center justify-end gap-2 text-xs text-app-muted">
        <span>静音</span>
        <SwitchControl checked={muted} onChange={onMuted} size="sm" />
      </label>
    </div>
  );
}
