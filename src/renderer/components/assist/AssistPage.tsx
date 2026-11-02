import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Gift,
  LoaderCircle,
  PackageOpen,
  Search,
  ShieldAlert,
  Sparkles,
  UserRoundCog,
  Users,
  WandSparkles,
  X,
} from 'lucide-react';
import type {
  AppSettings,
  AssistBlacklistEntry,
  AssistOperationResult,
  AssistProfileIcon,
  AssistRole,
  AssistSettings,
  ChampionSummary,
  FriendInfo,
} from '../../../shared/api';
import { DEFAULT_ASSIST_SETTINGS } from '../../../shared/assist';
import { broadcastSettingsChanged, SETTINGS_CHANGED_EVENT } from '../../lib/events';
import { ProfileIcon } from '../ProfileIcon';
import { ConfirmDialog } from '../ui/confirm-dialog';
import {
  AccountSection,
  BlacklistSection,
} from './AssistAccountSections';
import {
  AutomationSection,
} from './AssistBasicSections';
import {
  BuildsSection,
  ChampionsSection,
} from './AssistChampionSections';
import { AssistChampionPicker, type ChampionPickerRequest } from './AssistChampionPicker';
import { AssistSkinPicker } from './AssistSkinPicker';
import { Btn } from './AssistControls';
import { localizeAssistMessage } from './assistText';
import {
  FriendsSection,
} from './AssistSocialSections';
import {
  LootDisenchantSection,
  RewardsClaimSection,
} from './AssistLootRewardsSections';

type SectionKey =
  | 'automation'
  | 'champions'
  | 'builds'
  | 'friends'
  | 'loot'
  | 'rewards'
  | 'account'
  | 'blacklist';

// 侧栏按用途分组：先是对局里自动发生的事，再是选人出装，最后是账号和社交。
const sections: Array<{
  key: SectionKey;
  label: string;
  group: string;
  icon: typeof Sparkles;
}> = [
  { key: 'automation', group: '对局', label: '自动操作', icon: Bot },
  { key: 'champions', group: '选人', label: '自动选禁', icon: WandSparkles },
  { key: 'builds', group: '选人', label: '符文出装', icon: Sparkles },
  { key: 'account', group: '账号', label: '账号展示', icon: UserRoundCog },
  { key: 'rewards', group: '账号', label: '领取奖励', icon: Gift },
  { key: 'loot', group: '账号', label: '碎片分解', icon: PackageOpen },
  { key: 'friends', group: '社交', label: '好友', icon: Users },
  { key: 'blacklist', group: '社交', label: '黑名单', icon: ShieldAlert },
];

const sectionGroups = sections.reduce<Array<{ group: string; items: typeof sections }>>((groups, section) => {
  const last = groups[groups.length - 1];
  if (last && last.group === section.group) last.items.push(section);
  else groups.push({ group: section.group, items: [section] });
  return groups;
}, []);

const emptySettings: AppSettings = {
  favoriteChampions: [],
  championPresets: [],
  assist: DEFAULT_ASSIST_SETTINGS,
  blacklist: [],
};

export function AssistPage({
  onPlayerSearch,
}: {
  onPlayerSearch?: (riotId: string, region?: string) => void;
}) {
  const [activeSection, setActiveSection] = useState<SectionKey>('automation');
  const [settings, setSettings] = useState<AppSettings>(emptySettings);
  const [champions, setChampions] = useState<ChampionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState('正在读取设置…');
  const [operationState, setOperationState] = useState('');
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const [editingBlacklistId, setEditingBlacklistId] = useState('');
  const [profileIcons, setProfileIcons] = useState<AssistProfileIcon[]>([]);
  const [profileIconPickerOpen, setProfileIconPickerOpen] = useState(false);
  const [profileIconSearch, setProfileIconSearch] = useState('');
  const [friendDeleteConfirmOpen, setFriendDeleteConfirmOpen] = useState(false);
  const [deletingFriends, setDeletingFriends] = useState(false);
  const [blacklistDraft, setBlacklistDraft] = useState({
    riotId: '',
    region: '',
    tags: '常见',
    description: '',
  });
  // 每次打开都带一个新的 key，让选择器从这次的已选英雄重新开始。
  const [picker, setPicker] = useState<(ChampionPickerRequest & { key: number }) | null>(null);
  const [skinPickerOpen, setSkinPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      window.lolHelper.db.getSettings(),
      window.lolHelper.match.getChampions(),
      window.lolHelper.lcu.getFriends().catch(() => []),
    ])
      .then(([loadedSettings, loadedChampions, loadedFriends]) => {
        if (cancelled) return;
        setSettings(loadedSettings);
        setChampions(loadedChampions);
        setFriends(loadedFriends);
        setSaveState('设置已同步');
      })
      .catch((error) => {
        if (!cancelled) setSaveState(`读取失败：${localizeAssistMessage(String(error))}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // 首页的快捷开关改了设置后，这里重新读取，避免旧状态把新值覆盖回去。
    const onSettingsChanged = (event: Event) => {
      const source = (event as CustomEvent<{ source?: string }>).detail?.source;
      if (source === 'assist') return;
      void window.lolHelper.db.getSettings().then((loaded) => setSettings(loaded)).catch(() => undefined);
    };
    window.addEventListener(SETTINGS_CHANGED_EVENT, onSettingsChanged);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, onSettingsChanged);
  }, []);

  useEffect(() => {
    if (!operationState || operationState === '正在执行…') return undefined;
    const needsMoreReadingTime = /失败|错误|没成功|请先|请输入/.test(operationState);
    const timer = window.setTimeout(
      () => setOperationState(''),
      needsMoreReadingTime ? 8000 : 3500,
    );
    return () => window.clearTimeout(timer);
  }, [operationState]);

  const championMap = useMemo(
    () => new Map(champions.map((champion) => [champion.id, champion])),
    [champions],
  );

  const persist = (next: AppSettings) => {
    setSettings(next);
    setSaveState('保存中…');
    void window.lolHelper.db.updateSettings({
      assist: next.assist,
      blacklist: next.blacklist,
    }).then((saved) => {
      setSettings((current) => ({
        ...current,
        assist: saved.assist,
        blacklist: saved.blacklist,
      }));
      setSaveState('已自动保存');
      broadcastSettingsChanged('assist');
    }).catch((error) => {
      setSaveState(`保存失败：${localizeAssistMessage(String(error))}`);
    });
  };

  const updateAssist = (updater: (assist: AssistSettings) => AssistSettings) => {
    persist({ ...settings, assist: updater(structuredClone(settings.assist)) });
  };

  const updateBoolean = (key: keyof AssistSettings, value: boolean) => {
    updateAssist((assist) => ({ ...assist, [key]: value }));
  };

  const openPicker = (request: ChampionPickerRequest) => {
    setPicker({ ...request, key: Date.now() });
  };

  const setChampionArray = (
    source: 'normal' | 'aram' | 'arena',
    ids: number[],
  ) => {
    updateAssist((assist) => {
      assist.champions[source] = ids;
      return assist;
    });
  };

  const setRoleChampionArray = (role: AssistRole, ids: number[]) => {
    updateAssist((assist) => {
      assist.champions.byRole[role] = ids;
      return assist;
    });
  };

  const setBan = (role: AssistRole | 'arena', ids: number[]) => {
    updateAssist((assist) => {
      assist.champions.bans[role] = ids.at(-1) ?? 0;
      return assist;
    });
  };

  const runOperation = async (
    operation: () => Promise<AssistOperationResult[]>,
  ) => {
    setOperationState('正在执行…');
    try {
      const results = await operation();
      if (results.length === 0) {
        setOperationState('没有需要改动的地方');
        return;
      }
      const failed = results.filter((result) => !result.success);
      setOperationState(failed.length === 0
        ? results.map((result) => result.message).join('\n')
        : `有 ${failed.length} 项没成功：\n${failed.map((result) => localizeAssistMessage(result.message)).join('\n')}`);
    } catch (error) {
      setOperationState(`执行失败：${localizeAssistMessage(String(error))}`);
    }
  };

  const addBlacklistEntry = () => {
    const riotId = blacklistDraft.riotId.trim();
    if (!riotId) {
      setOperationState('请输入 名字#编号');
      return;
    }
    const now = Date.now();
    const existing = settings.blacklist.find((entry) => entry.id === editingBlacklistId);
    const entry: AssistBlacklistEntry = {
      id: existing?.id ?? crypto.randomUUID(),
      riotId,
      region: blacklistDraft.region.trim(),
      tags: blacklistDraft.tags
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      description: blacklistDraft.description.trim(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    persist({
      ...settings,
      blacklist: existing
        ? settings.blacklist.map((item) => item.id === existing.id ? entry : item)
        : [entry, ...settings.blacklist],
    });
    setEditingBlacklistId('');
    setBlacklistDraft({ riotId: '', region: '', tags: '常见', description: '' });
  };

  const refreshFriends = async () => {
    try {
      setFriends(await window.lolHelper.lcu.getFriends());
    } catch (error) {
      setOperationState(`好友列表刷新失败：${localizeAssistMessage(String(error))}`);
    }
  };

  const requestDeleteSelectedFriends = () => {
    if (selectedFriendIds.size === 0) {
      setOperationState('请先选择要删除的好友');
      return;
    }
    setFriendDeleteConfirmOpen(true);
  };

  const deleteSelectedFriends = async () => {
    setDeletingFriends(true);
    try {
      const results = await Promise.all(
        [...selectedFriendIds].map((id) => window.lolHelper.lcu.deleteFriend(id)),
      );
      const successCount = results.filter((result) => result.success).length;
      setOperationState(successCount === results.length
        ? `已删除 ${successCount} 位好友`
        : `删除了 ${successCount}/${results.length} 位好友，其余的没成功`);
      setSelectedFriendIds(new Set());
      setFriendDeleteConfirmOpen(false);
      await refreshFriends();
    } catch (error) {
      setOperationState(`删除好友失败：${localizeAssistMessage(String(error))}`);
    } finally {
      setDeletingFriends(false);
    }
  };

  const openProfileIconPicker = async () => {
    setProfileIconPickerOpen(true);
    if (profileIcons.length > 0) return;
    try {
      setProfileIcons(await window.lolHelper.assist.getProfileIcons());
    } catch (error) {
      setOperationState(`头像列表加载失败：${localizeAssistMessage(String(error))}`);
    }
  };

  if (loading) {
    return <div className="as-loading">助手设置读取中…</div>;
  }

  const assist = settings.assist;
  const activeSectionMeta = sections.find((section) => section.key === activeSection) ?? sections[0];
  const ActiveIcon = activeSectionMeta.icon;
  const saveFailed = saveState.includes('失败');
  const savePending = saveState.includes('中') || saveState.includes('正在');
  const operationBusy = operationState === '正在执行…';
  const operationFailed = /失败|错误|没成功|请先|请输入/.test(operationState);

  // 目录里每一项右边那句状态：开了几项、有几个人，不用点进去也知道。
  const automationOn = [assist.autoAccept, assist.autoPlayAgain || assist.autoReturnLobby, assist.autoHonorTeammates]
    .filter(Boolean).length;
  const buildsOn = [
    assist.autoWinRateRunes || assist.autoPickRateRunes,
    assist.autoWinRateItems || assist.autoPickRateItems,
  ].filter(Boolean).length;
  const navHints: Partial<Record<SectionKey, { text: string; tone?: 'on' | 'count' }>> = {
    automation: automationOn > 0 ? { text: `开 ${automationOn} 项`, tone: 'on' } : { text: '未开启' },
    champions: assist.autoChampionEnabled ? { text: '已开启', tone: 'on' } : { text: '未开启' },
    builds: buildsOn > 0 ? { text: `开 ${buildsOn} 项`, tone: 'on' } : { text: '未开启' },
    account: assist.spoofRankEnabled ? { text: '展示段位', tone: 'on' } : undefined,
    friends: friends.length > 0 ? { text: String(friends.length), tone: 'count' } : undefined,
    blacklist: settings.blacklist.length > 0 ? { text: String(settings.blacklist.length), tone: 'count' } : undefined,
  };

  const iconQuery = profileIconSearch.trim().toLowerCase();
  const visibleIcons = profileIcons
    .filter((icon) => !iconQuery
      || String(icon.id).includes(iconQuery)
      || icon.title.toLowerCase().includes(iconQuery))
    .slice(0, 800);

  return (
    <div className="as-page">
      <aside className="as-nav">
        <nav aria-label="助手功能">
          {sectionGroups.map(({ group, items }) => (
            <div key={group} className="as-nav__group">
              <div className="as-nav__group-title">{group}</div>
              {items.map((section) => {
                const Icon = section.icon;
                const active = activeSection === section.key;
                const hint = navHints[section.key];
                return (
                  <button
                    key={section.key}
                    type="button"
                    className="as-nav__item"
                    onClick={() => setActiveSection(section.key)}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon />
                    <span>{section.label}</span>
                    {hint && <span className="as-nav__hint" data-tone={hint.tone}>{hint.text}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <section className="as-main">
        <main className="as-scroll">
          <div className="as-content">
            <header className="as-head">
              <span className="as-head__icon" aria-hidden="true"><ActiveIcon /></span>
              <div style={{ minWidth: 0 }}>
                <h2>{activeSectionMeta.label}</h2>
              </div>
              <span
                className="as-save"
                data-state={saveFailed ? 'error' : savePending ? 'pending' : undefined}
                title={saveState}
              >
                <i />
                {saveFailed ? saveState : savePending ? '保存中…' : '已保存'}
              </span>
            </header>

            {activeSection === 'automation' && (
              <AutomationSection
                assist={assist}
                updateAssist={updateAssist}
                updateBoolean={updateBoolean}
              />
            )}
            {activeSection === 'champions' && (
              <ChampionsSection
                assist={assist}
                updateAssist={updateAssist}
                updateBoolean={updateBoolean}
                openPicker={openPicker}
                championMap={championMap}
                setChampionArray={setChampionArray}
                setRoleChampionArray={setRoleChampionArray}
                setBan={setBan}
              />
            )}
            {activeSection === 'builds' && (
              <BuildsSection
                assist={assist}
                updateAssist={updateAssist}
                updateBoolean={updateBoolean}
                runOperation={runOperation}
              />
            )}
            {activeSection === 'friends' && (
              <FriendsSection
                assist={assist}
                updateAssist={updateAssist}
                runOperation={runOperation}
                friends={friends}
                selectedFriendIds={selectedFriendIds}
                setSelectedFriendIds={setSelectedFriendIds}
                refreshFriends={refreshFriends}
                deleteSelectedFriends={requestDeleteSelectedFriends}
                setOperationState={setOperationState}
              />
            )}
            {activeSection === 'loot' && (
              <LootDisenchantSection setOperationState={setOperationState} />
            )}
            {activeSection === 'rewards' && (
              <RewardsClaimSection setOperationState={setOperationState} />
            )}
            {activeSection === 'account' && (
              <AccountSection
                assist={assist}
                updateAssist={updateAssist}
                updateBoolean={updateBoolean}
                openProfileIconPicker={openProfileIconPicker}
                openSkinPicker={() => setSkinPickerOpen(true)}
                championMap={championMap}
                runOperation={runOperation}
              />
            )}
            {activeSection === 'blacklist' && (
              <BlacklistSection
                blacklistDraft={blacklistDraft}
                setBlacklistDraft={setBlacklistDraft}
                editingBlacklistId={editingBlacklistId}
                addBlacklistEntry={addBlacklistEntry}
                settings={settings}
                persist={persist}
                setOperationState={setOperationState}
                onPlayerSearch={onPlayerSearch}
                setEditingBlacklistId={setEditingBlacklistId}
              />
            )}
          </div>
        </main>

        {/* 操作结果从右下角浮出来，不把页面往下挤 */}
        <AnimatePresence>
          {operationState && (
            <motion.div
              key="toast"
              role="status"
              className="as-toast"
              data-tone={operationBusy ? 'busy' : operationFailed ? 'error' : undefined}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18 }}
            >
              {operationBusy ? <LoaderCircle /> : operationFailed ? <AlertCircle /> : <CheckCircle2 />}
              <p>{operationState}</p>
              {!operationBusy && (
                <Btn size="sm" tone="ghost" onClick={() => setOperationState('')} title="关闭">
                  <X />
                </Btn>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {picker && (
        <AssistChampionPicker
          key={picker.key}
          request={picker}
          champions={champions}
          favoriteIds={settings.favoriteChampions}
          onClose={() => setPicker(null)}
        />
      )}

      {skinPickerOpen && (
        <AssistSkinPicker
          champions={champions}
          value={assist.profileBackgroundChampionId}
          onSelect={(skinId) => updateAssist((next) => ({ ...next, profileBackgroundChampionId: skinId }))}
          onClose={() => setSkinPickerOpen(false)}
        />
      )}

      {profileIconPickerOpen && createPortal(
        <div
          className="as-modal"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setProfileIconPickerOpen(false);
          }}
        >
          <div className="as-modal__box" role="dialog" aria-label="选择召唤师头像">
            <div className="as-modal__head">
              <div style={{ minWidth: 0, flex: 1 }}>
                <b>选择召唤师头像</b>
              </div>
              <div className="as-search">
                <Search />
                <input
                  className="as-input"
                  value={profileIconSearch}
                  placeholder="按编号或名称搜索"
                  onChange={(event) => setProfileIconSearch(event.target.value)}
                />
              </div>
              <Btn size="sm" tone="ghost" onClick={() => setProfileIconPickerOpen(false)} title="关闭">
                <X />
              </Btn>
            </div>
            {profileIcons.length === 0 ? (
              <div className="as-empty"><LoaderCircle className="as-spin" /><b>正在读取你拥有的头像…</b></div>
            ) : (
              <div className="as-icon-grid">
                {visibleIcons.map((icon) => (
                  <button
                    key={icon.id}
                    type="button"
                    title={icon.title}
                    aria-pressed={assist.profileIconId === icon.id}
                    onClick={() => {
                      updateAssist((next) => ({ ...next, profileIconId: icon.id }));
                      setProfileIconPickerOpen(false);
                    }}
                  >
                    <ProfileIcon iconId={icon.id} srcs={icon.icon ? [icon.icon] : []} alt={icon.title} size={56} />
                    {icon.id}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}

      <ConfirmDialog
        open={friendDeleteConfirmOpen}
        title="删除选中的好友"
        description={`从好友列表删除 ${selectedFriendIds.size} 位好友`}
        confirmLabel="删除好友"
        destructive
        busy={deletingFriends}
        onOpenChange={setFriendDeleteConfirmOpen}
        onConfirm={() => void deleteSelectedFriends()}
      />
    </div>
  );
}
