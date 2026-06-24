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
  LolHotkeyValues,
} from '../../../shared/api';
import { DEFAULT_LOL_ROOT_PATH } from '../../../shared/constants';
import {
  BlockedPlayersList,
  CheckboxRow,
  Panel,
  ReadonlyRow,
  SectionDot,
  SelectRow,
  SettingsGroup,
  SettingsSection,
  SliderRow,
  SwitchControl,
  VolumeRow,
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

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

type TabKey = 'client' | 'game' | 'hotkeys' | 'profiles';
type ClientSectionKey = 'general' | 'notifications' | 'chat' | 'sound' | 'voice' | 'blocked';
type GameSectionKey = 'controls' | 'gameplay' | 'alerts' | 'combat' | 'cooldowns' | 'video' | 'interface' | 'audio';
type Notice = { type: 'success' | 'error'; text: string } | null;

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

function profileLabel(profile: LolConfigProfileSummary): string {
  return `${profile.name} · ${profile.gameResolution}`;
}

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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35">
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
