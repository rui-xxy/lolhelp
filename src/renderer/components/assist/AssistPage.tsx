import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Bot,
  Gamepad2,
  Keyboard,
  ShieldAlert,
  Sparkles,
  UserRoundCog,
  Users,
  WandSparkles,
} from 'lucide-react';
import type {
  AppSettings,
  AssistBlacklistEntry,
  AssistOperationResult,
  AssistOverlayName,
  AssistProfileIcon,
  AssistRole,
  AssistSettings,
  ChampionSummary,
  FriendInfo,
} from '../../../shared/api';
import { DEFAULT_ASSIST_SETTINGS } from '../../../shared/assist';
import { ChampionPickerDialog } from '../scout/ChampionPickerDialog';
import {
  AccountSection,
  BlacklistSection,
} from './AssistAccountSections';
import {
  AlertsSection,
  AutomationSection,
  MatchSection,
} from './AssistBasicSections';
import {
  BuildsSection,
  ChampionsSection,
} from './AssistChampionSections';
import { TextInput } from './AssistControls';
import {
  FriendsSection,
  PersonalSection,
} from './AssistSocialSections';

type SectionKey =
  | 'match'
  | 'automation'
  | 'alerts'
  | 'champions'
  | 'builds'
  | 'personal'
  | 'friends'
  | 'account'
  | 'blacklist';

const sections: Array<{
  key: SectionKey;
  label: string;
  icon: typeof Sparkles;
}> = [
  { key: 'match', label: '对局设置', icon: Gamepad2 },
  { key: 'automation', label: '自动操作', icon: Bot },
  { key: 'alerts', label: '游戏提示', icon: Bell },
  { key: 'champions', label: '英雄禁选', icon: WandSparkles },
  { key: 'builds', label: '符文装备', icon: Sparkles },
  { key: 'personal', label: '个性设置', icon: Keyboard },
  { key: 'friends', label: '好友管理', icon: Users },
  { key: 'account', label: '账号展示', icon: UserRoundCog },
  { key: 'blacklist', label: '黑名单', icon: ShieldAlert },
];

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
  const [activeSection, setActiveSection] = useState<SectionKey>('match');
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
  const [blacklistDraft, setBlacklistDraft] = useState({
    riotId: '',
    region: '',
    tags: '常见',
    description: '',
  });
  const [picker, setPicker] = useState<{
    open: boolean;
    title: string;
    ids: number[];
    max: number;
    apply: (ids: number[]) => void;
  } | null>(null);

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
        if (!cancelled) setSaveState(`读取失败：${String(error)}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!operationState || operationState === '正在执行…') return undefined;
    const needsMoreReadingTime = /失败|错误|×|请先|请输入/.test(operationState);
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
    }).catch((error) => {
      setSaveState(`保存失败：${String(error)}`);
    });
  };

  const updateAssist = (updater: (assist: AssistSettings) => AssistSettings) => {
    persist({ ...settings, assist: updater(structuredClone(settings.assist)) });
  };

  const updateBoolean = (key: keyof AssistSettings, value: boolean) => {
    updateAssist((assist) => ({ ...assist, [key]: value }));
  };

  const openPicker = (
    title: string,
    ids: number[],
    max: number,
    apply: (ids: number[]) => void,
  ) => {
    setPicker({ open: true, title, ids, max, apply });
  };

  const championSummary = (ids: number[]) => {
    if (ids.length === 0) return '未设置';
    return ids
      .map((id) => championMap.get(id)?.title || championMap.get(id)?.name || id)
      .join('、');
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
      setOperationState(
        results.length
          ? results
            .map((result) => `${result.success ? '✓' : '×'} ${result.message}`)
            .join('；')
          : '当前没有需要执行的项目',
      );
    } catch (error) {
      setOperationState(`执行失败：${String(error)}`);
    }
  };

  const toggleOverlay = async (name: AssistOverlayName) => {
    try {
      const visible = await window.lolHelper.assist.toggleOverlay(name);
      setOperationState(`${visible ? '已打开' : '已关闭'}${name === 'helper' ? '对局助手' : name === 'match' ? '战绩卡片' : '技能计时'}`);
    } catch (error) {
      setOperationState(`浮窗操作失败：${String(error)}`);
    }
  };

  const addBlacklistEntry = () => {
    const riotId = blacklistDraft.riotId.trim();
    if (!riotId) {
      setOperationState('请输入玩家 Riot ID');
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
      setOperationState(`好友列表刷新失败：${String(error)}`);
    }
  };

  const deleteSelectedFriends = async () => {
    if (selectedFriendIds.size === 0) {
      setOperationState('请先选择要删除的好友');
      return;
    }
    if (!window.confirm(`确定删除选中的 ${selectedFriendIds.size} 位好友吗？`)) return;
    const results = await Promise.all(
      [...selectedFriendIds].map((id) => window.lolHelper.lcu.deleteFriend(id)),
    );
    const successCount = results.filter((result) => result.success).length;
    setOperationState(`已删除 ${successCount}/${results.length} 位好友`);
    setSelectedFriendIds(new Set());
    await refreshFriends();
  };

  const openProfileIconPicker = async () => {
    setProfileIconPickerOpen(true);
    if (profileIcons.length > 0) return;
    try {
      setProfileIcons(await window.lolHelper.assist.getProfileIcons());
    } catch (error) {
      setOperationState(`头像列表加载失败：${String(error)}`);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-app-muted">
        辅助功能加载中…
      </div>
    );
  }

  const assist = settings.assist;

  return (
    <div className="grid h-full grid-cols-[190px_minmax(0,1fr)] overflow-hidden bg-app-bg-soft">
      <aside className="border-r border-app-border bg-app-surface p-3">
        <div className="mb-3 px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-app-text">
            <Sparkles className="size-4 text-app-primary" />
            辅助功能
          </div>
          <div className="mt-1 text-[11px] text-app-muted">{saveState}</div>
        </div>
        <nav className="space-y-1">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveSection(section.key)}
                className={`flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors ${
                  activeSection === section.key
                    ? 'bg-app-primary-soft text-app-primary'
                    : 'text-app-muted hover:bg-app-surface-soft hover:text-app-text'
                }`}
              >
                <Icon className="size-4" />
                {section.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          {operationState && (
            <div
              role="status"
              className="flex items-center gap-3 rounded-sm border border-app-primary/25 bg-app-primary-soft/45 px-4 py-3 text-xs text-app-body"
            >
              <span className="min-w-0 flex-1">{operationState}</span>
              {operationState !== '正在执行…' && (
                <button
                  type="button"
                  aria-label="关闭提示"
                  title="关闭提示"
                  onClick={() => setOperationState('')}
                  className="shrink-0 rounded px-1 text-base leading-none text-app-muted hover:bg-app-surface hover:text-app-text"
                >
                  ×
                </button>
              )}
            </div>
          )}

          {activeSection === 'match' && (
            <MatchSection
              assist={assist}
              updateAssist={updateAssist}
              updateBoolean={updateBoolean}
              toggleOverlay={toggleOverlay}
            />
          )}
          {activeSection === 'automation' && (
            <AutomationSection
              assist={assist}
              updateAssist={updateAssist}
              updateBoolean={updateBoolean}
            />
          )}
          {activeSection === 'alerts' && (
            <AlertsSection assist={assist} updateBoolean={updateBoolean} />
          )}
          {activeSection === 'champions' && (
            <ChampionsSection
              assist={assist}
              updateAssist={updateAssist}
              updateBoolean={updateBoolean}
              openPicker={openPicker}
              championSummary={championSummary}
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
          {activeSection === 'personal' && (
            <PersonalSection assist={assist} updateAssist={updateAssist} />
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
              deleteSelectedFriends={deleteSelectedFriends}
              setOperationState={setOperationState}
            />
          )}
          {activeSection === 'account' && (
            <AccountSection
              assist={assist}
              updateAssist={updateAssist}
              updateBoolean={updateBoolean}
              openProfileIconPicker={openProfileIconPicker}
              championSummary={championSummary}
              openPicker={openPicker}
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

      {picker && (
        <ChampionPickerDialog
          open={picker.open}
          onOpenChange={(open) => {
            if (!open) setPicker(null);
          }}
          champions={champions}
          selectedIds={picker.ids}
          favoriteIds={settings.favoriteChampions}
          championPresets={settings.championPresets}
          onChange={(ids) => {
            const limited = picker.max === 1
              ? ids.slice(-1)
              : ids.slice(0, picker.max);
            picker.apply(limited);
            setPicker((current) => current ? { ...current, ids: limited } : current);
          }}
        />
      )}

      {profileIconPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-8"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setProfileIconPickerOpen(false);
            }
          }}
        >
          <div className="flex max-h-[78vh] w-[720px] flex-col overflow-hidden rounded-md border border-app-border bg-app-surface shadow-airbnb">
            <div className="flex items-center gap-3 border-b border-app-border p-4">
              <div className="text-sm font-semibold text-app-text">选择玩家头像</div>
              <div className="ml-auto w-56">
                <TextInput
                  value={profileIconSearch}
                  placeholder="搜索头像 ID 或名称"
                  onChange={setProfileIconSearch}
                />
              </div>
              <button
                type="button"
                onClick={() => setProfileIconPickerOpen(false)}
                className="text-sm text-app-muted"
              >
                关闭
              </button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-8 gap-2 overflow-y-auto p-4">
              {profileIcons
                .filter((icon) => {
                  const query = profileIconSearch.trim().toLowerCase();
                  return !query
                    || String(icon.id).includes(query)
                    || icon.title.toLowerCase().includes(query);
                })
                .slice(0, 800)
                .map((icon) => (
                  <button
                    key={icon.id}
                    type="button"
                    title={`${icon.title} (${icon.id})`}
                    onClick={() => {
                      updateAssist((next) => ({ ...next, profileIconId: icon.id }));
                      setProfileIconPickerOpen(false);
                    }}
                    className={`rounded-sm border p-1 hover:border-app-primary ${
                      assist.profileIconId === icon.id
                        ? 'border-app-primary bg-app-primary-soft'
                        : 'border-app-border'
                    }`}
                  >
                    <img
                      src={icon.icon}
                      alt={icon.title}
                      className="aspect-square w-full rounded-sm"
                    />
                    <div className="mt-1 truncate text-[9px] text-app-muted">
                      {icon.id}
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
