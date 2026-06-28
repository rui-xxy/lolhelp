import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  BookmarkCheck,
  Folder,
  FolderPlus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { PlayerMatchDetail } from '../../../shared/api';
import { ProfileIcon } from '../ProfileIcon';
import {
  createSavedMatchGroup,
  deleteSavedMatchAccount,
  deleteSavedMatchGroup,
  loadSavedMatchAccounts,
  loadSavedMatchGroups,
  SAVED_MATCHES_CHANGED_EVENT,
  setSavedMatchAccountGroup,
  type SavedMatchAccount,
  type SavedMatchGroup,
} from './savedMatchesStore';

interface SavedMatchPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (account: SavedMatchAccount) => void;
}

type GroupFilter = 'all' | 'ungrouped' | string;

function getDisplayName(riotId: string | undefined): string {
  const normalized = (riotId ?? '').trim();
  const [gameName] = normalized.split('#');
  return gameName || normalized || '未知玩家';
}

function getAccountSummary(matches: PlayerMatchDetail[]): string {
  const wins = matches.filter((match) => match.win).length;
  const losses = matches.length - wins;
  return `${matches.length} 场 · ${wins}胜 ${losses}负`;
}

function formatSavedAt(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '--';
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getGroupName(groups: SavedMatchGroup[], groupId: string | undefined): string {
  if (!groupId) return '未分组';
  return groups.find((group) => group.id === groupId)?.name ?? '未分组';
}

export function SavedMatchPickerDialog({ open, onClose, onSelect }: SavedMatchPickerDialogProps) {
  const [accounts, setAccounts] = useState<SavedMatchAccount[]>([]);
  const [groups, setGroups] = useState<SavedMatchGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<GroupFilter>('all');
  const [groupName, setGroupName] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = () => {
    setAccounts(loadSavedMatchAccounts());
    setGroups(loadSavedMatchGroups());
  };

  useEffect(() => {
    if (!open) return;
    refresh();
    setNotice('');
    window.addEventListener(SAVED_MATCHES_CHANGED_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(SAVED_MATCHES_CHANGED_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [open]);

  useEffect(() => {
    if (activeGroup === 'all' || activeGroup === 'ungrouped') return;
    if (!groups.some((group) => group.id === activeGroup)) {
      setActiveGroup('all');
    }
  }, [activeGroup, groups]);

  const filteredAccounts = useMemo(() => {
    if (activeGroup === 'all') return accounts;
    if (activeGroup === 'ungrouped') return accounts.filter((account) => !account.groupId);
    return accounts.filter((account) => account.groupId === activeGroup);
  }, [accounts, activeGroup]);

  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const account of accounts) {
      counts.set(account.groupId || 'ungrouped', (counts.get(account.groupId || 'ungrouped') ?? 0) + 1);
    }
    return counts;
  }, [accounts]);

  const createGroup = () => {
    const trimmed = groupName.trim();
    if (!trimmed) {
      setNotice('先输入分组名称');
      return;
    }
    const nextGroups = createSavedMatchGroup(trimmed);
    setGroups(nextGroups);
    setGroupName('');
    setActiveGroup(nextGroups[0]?.id ?? 'all');
    setNotice('分组已创建');
  };

  const deleteGroup = (groupId: string) => {
    const result = deleteSavedMatchGroup(groupId);
    setGroups(result.groups);
    setAccounts(result.accounts);
    setActiveGroup('all');
    setNotice('分组已删除，里面的账号已移到未分组');
  };

  const deleteAccount = (accountId: string) => {
    setAccounts(deleteSavedMatchAccount(accountId));
    setNotice('保存账号已删除');
  };

  const moveAccount = (accountId: string, groupId: string) => {
    setAccounts(setSavedMatchAccountGroup(accountId, groupId || undefined));
    setNotice('分组已更新');
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 [-webkit-app-region:no-drag]"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="flex h-[560px] w-[860px] flex-col overflow-hidden rounded-md border border-app-border bg-app-surface shadow-airbnb">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-app-border px-4">
          <div className="flex size-8 items-center justify-center rounded-sm bg-app-surface-soft text-app-primary">
            <BookmarkCheck className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-app-text">保存的战绩</h2>
            <p className="truncate text-xs text-app-muted">选择账号后，会在战绩页打开本地保存的战绩</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-sm text-app-subtle transition-colors hover:bg-app-surface-soft hover:text-app-text"
            title="关闭"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="w-48 shrink-0 border-r border-app-border bg-app-bg-soft p-3">
            <nav className="space-y-1">
              <GroupButton
                active={activeGroup === 'all'}
                label="全部账号"
                count={accounts.length}
                icon={<Users className="size-4" />}
                onClick={() => setActiveGroup('all')}
              />
              <GroupButton
                active={activeGroup === 'ungrouped'}
                label="未分组"
                count={groupCounts.get('ungrouped') ?? 0}
                icon={<Folder className="size-4" />}
                onClick={() => setActiveGroup('ungrouped')}
              />
              {groups.map((group) => (
                <GroupButton
                  key={group.id}
                  active={activeGroup === group.id}
                  label={group.name}
                  count={groupCounts.get(group.id) ?? 0}
                  icon={<Folder className="size-4" />}
                  onClick={() => setActiveGroup(group.id)}
                  onDelete={() => deleteGroup(group.id)}
                />
              ))}
            </nav>

            <div className="mt-3 border-t border-app-border pt-3">
              <div className="mb-1.5 text-[11px] font-medium text-app-muted">新建分组</div>
              <div className="flex gap-1.5">
                <input
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') createGroup();
                  }}
                  placeholder="比如：朋友"
                  className="h-8 min-w-0 flex-1 rounded-sm border border-app-border bg-app-surface px-2 text-xs text-app-text outline-none focus:border-app-primary"
                />
                <button
                  type="button"
                  onClick={createGroup}
                  className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-app-primary text-white transition-colors hover:bg-app-primary-hover"
                  title="新建分组"
                  aria-label="新建分组"
                >
                  <FolderPlus className="size-4" />
                </button>
              </div>
            </div>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-app-border px-4">
              <div>
                <div className="text-sm font-semibold text-app-text">
                  {activeGroup === 'all'
                    ? '全部账号'
                    : activeGroup === 'ungrouped'
                      ? '未分组'
                      : groups.find((group) => group.id === activeGroup)?.name ?? '分组'}
                </div>
                <div className="mt-0.5 text-[11px] text-app-muted">
                  {filteredAccounts.length} 个账号
                  {notice && <span className="ml-2 text-app-primary">{notice}</span>}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {filteredAccounts.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {filteredAccounts.map((account) => (
                    <div
                      key={account.id}
                      className="group rounded-sm border border-app-border bg-app-surface p-3 transition-colors hover:border-app-primary-soft hover:bg-app-bg-soft"
                    >
                      <div className="flex items-center gap-3">
                        <ProfileIcon
                          iconId={account.profile.profileIconId}
                          src={account.profile.profileIconUrl}
                          alt={getDisplayName(account.profile.riotId)}
                          size={40}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-app-text">
                            {getDisplayName(account.profile.riotId)}
                          </div>
                          <div className="mt-0.5 text-[11px] text-app-muted">
                            {getAccountSummary(account.matches)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteAccount(account.id)}
                          className="flex size-7 shrink-0 items-center justify-center rounded-sm text-app-subtle opacity-0 transition-colors hover:bg-app-danger/10 hover:text-app-danger group-hover:opacity-100 focus:opacity-100"
                          title="删除这个保存账号"
                          aria-label="删除这个保存账号"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <select
                          value={account.groupId ?? ''}
                          onChange={(event) => moveAccount(account.id, event.target.value)}
                          className="h-8 min-w-0 flex-1 rounded-sm border border-app-border bg-app-surface-soft px-2 text-xs text-app-text outline-none focus:border-app-primary"
                        >
                          <option value="">未分组</option>
                          {groups.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            onSelect(account);
                            onClose();
                          }}
                          className="h-8 shrink-0 rounded-sm bg-app-primary px-3 text-xs font-medium text-white transition-colors hover:bg-app-primary-hover"
                        >
                          打开
                        </button>
                      </div>

                      <div className="mt-2 flex items-center justify-between text-[10px] text-app-subtle">
                        <span>{getGroupName(groups, account.groupId)}</span>
                        <span>{formatSavedAt(account.updatedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-sm border border-dashed border-app-border bg-app-bg-soft text-center text-xs text-app-muted">
                  <div>
                    <div className="font-semibold text-app-text">这里还没有保存账号</div>
                    <div className="mt-1">去战绩页点击“保存战绩”，勾选对局后保存。</div>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </section>
    </div>
  );
}

function GroupButton({
  active,
  label,
  count,
  icon,
  onClick,
  onDelete,
}: {
  active: boolean;
  label: string;
  count: number;
  icon: ReactNode;
  onClick: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="group flex items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        className={`flex h-9 min-w-0 flex-1 items-center gap-2 rounded-sm border-l-2 px-2 text-left text-sm font-medium transition-colors ${
          active
            ? 'border-app-primary bg-app-surface text-app-text'
            : 'border-transparent text-app-muted hover:bg-app-nav-hover hover:text-app-text'
        }`}
      >
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 text-[10px] text-app-subtle">{count}</span>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="flex size-7 shrink-0 items-center justify-center rounded-sm text-app-subtle opacity-0 transition-colors hover:bg-app-danger/10 hover:text-app-danger group-hover:opacity-100 focus:opacity-100"
          title="删除分组"
          aria-label="删除分组"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}
