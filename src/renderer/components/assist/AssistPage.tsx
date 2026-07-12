import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Gift,
  LoaderCircle,
  PackageOpen,
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
import { ChampionPickerDialog } from '../scout/ChampionPickerDialog';
import { Button } from '../ui/button';
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
import { TextInput } from './AssistControls';
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

const sections: Array<{
  key: SectionKey;
  label: string;
  description: string;
  icon: typeof Sparkles;
}> = [
  { key: 'automation', label: '自动操作', description: '对局接受、结算返回与队友点赞', icon: Bot },
  { key: 'champions', label: '英雄禁选', description: '按模式和位置管理选用与禁用', icon: WandSparkles },
  { key: 'builds', label: '符文装备', description: '自动应用装备方案与符文配置', icon: Sparkles },
  { key: 'friends', label: '好友管理', description: '在线展示、签名与好友批量操作', icon: Users },
  { key: 'loot', label: '碎片分解', description: '查看英雄碎片并进行批量分解', icon: PackageOpen },
  { key: 'rewards', label: '奖励获取', description: '集中查看并领取可用奖励', icon: Gift },
  { key: 'account', label: '账号展示', description: '段位、头像、生涯背景与装饰', icon: UserRoundCog },
  { key: 'blacklist', label: '黑名单', description: '记录玩家标签并快速查询战绩', icon: ShieldAlert },
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
      setOperationState(`已删除 ${successCount}/${results.length} 位好友`);
      setSelectedFriendIds(new Set());
      setFriendDeleteConfirmOpen(false);
      await refreshFriends();
    } catch (error) {
      setOperationState(`删除好友失败：${String(error)}`);
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
  const activeSectionMeta = sections.find((section) => section.key === activeSection) ?? sections[0];
  const saveFailed = saveState.includes('失败');
  const savePending = saveState.includes('中') || saveState.includes('正在');
  const operationFailed = /失败|错误|×|请先|请输入/.test(operationState);

  return (
    <div className="grid h-full grid-cols-[208px_minmax(0,1fr)] overflow-hidden bg-app-surface">
      <aside className="flex min-h-0 flex-col border-r border-app-border bg-app-bg-soft/80 px-3 py-4">
        <div className="mb-3 px-2 text-[11px] font-medium text-app-subtle">功能分类</div>
        <nav className="space-y-1">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveSection(section.key)}
                className={`group relative flex h-9 w-full items-center gap-2.5 rounded-sm px-3 text-left text-sm transition-[background-color,color,box-shadow] ${
                  activeSection === section.key
                    ? 'bg-app-surface text-app-text shadow-sm ring-1 ring-app-border/70'
                    : 'text-app-muted hover:bg-app-nav-hover hover:text-app-text'
                }`}
              >
                <Icon className={`size-4 ${activeSection === section.key ? 'text-app-primary' : 'text-app-subtle group-hover:text-app-muted'}`} />
                <span className="truncate">{section.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-app-border/70 px-2 pt-3 text-[10px] leading-4 text-app-subtle">
          设置变更会自动保存
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col">
        <header className="flex h-[58px] shrink-0 items-center gap-4 border-b border-app-border px-6">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-app-text">{activeSectionMeta.label}</h2>
            <p className="mt-0.5 truncate text-[11px] text-app-muted">{activeSectionMeta.description}</p>
          </div>
          <div className={`flex shrink-0 items-center gap-2 text-[11px] ${saveFailed ? 'text-app-danger' : 'text-app-muted'}`}>
            {savePending ? (
              <LoaderCircle className="size-3.5 animate-spin text-app-primary" />
            ) : (
              <span className={`size-1.5 rounded-full ${saveFailed ? 'bg-app-danger' : 'bg-app-success'}`} />
            )}
            <span>{saveState}</span>
          </div>
        </header>

        {operationState && (
          <div
            role="status"
            className={`mx-6 mt-4 flex min-h-9 items-center gap-2 rounded-sm border px-3 text-xs ${
              operationFailed
                ? 'border-app-danger/20 bg-app-danger/5 text-app-danger'
                : 'border-app-success/20 bg-app-success/5 text-app-body'
            }`}
          >
            {operationState === '正在执行…' ? (
              <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
            ) : operationFailed ? (
              <AlertCircle className="size-3.5 shrink-0" />
            ) : (
              <CheckCircle2 className="size-3.5 shrink-0 text-app-success" />
            )}
            <span className="min-w-0 flex-1 truncate">{operationState}</span>
            {operationState !== '正在执行…' && (
              <Button variant="ghost" size="icon-xs" onClick={() => setOperationState('')} aria-label="关闭提示">
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="mx-auto max-w-[896px] space-y-7 pb-8">
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
      </section>

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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-8 backdrop-blur-[1px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setProfileIconPickerOpen(false);
            }
          }}
        >
          <div className="flex max-h-[78vh] w-[760px] flex-col overflow-hidden rounded-md border border-app-border bg-app-surface shadow-airbnb">
            <div className="flex h-14 items-center gap-3 border-b border-app-border px-5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-app-text">选择玩家头像</div>
                <div className="mt-0.5 text-[10px] text-app-muted">点击头像后立即应用</div>
              </div>
              <div className="ml-auto w-56">
                <TextInput
                  value={profileIconSearch}
                  placeholder="搜索头像 ID 或名称"
                  onChange={setProfileIconSearch}
                />
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setProfileIconPickerOpen(false)} aria-label="关闭">
                <X className="size-4" />
              </Button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-9 gap-2 overflow-y-auto bg-app-bg-soft/45 p-4">
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
                    className={`rounded-sm border bg-app-surface p-1 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-app-primary/50 hover:shadow-sm ${
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

      <ConfirmDialog
        open={friendDeleteConfirmOpen}
        title="删除选中的好友"
        description={`将从客户端好友列表中删除选中的 ${selectedFriendIds.size} 位好友。此操作无法直接撤销。`}
        confirmLabel="删除好友"
        destructive
        busy={deletingFriends}
        onOpenChange={setFriendDeleteConfirmOpen}
        onConfirm={() => void deleteSelectedFriends()}
      />
    </div>
  );
}
