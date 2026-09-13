import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bell,
  Bookmark,
  Folder,
  FolderPlus,
  Trash2,
  Users,
} from 'lucide-react';
import type { ChampionSummary, PlayerRankSummary, SavedMatchPreview } from '../../../shared/api';
import { LOL_REGIONS } from '../../../shared/constants';
import { ProfileIcon } from '../ProfileIcon';
import { RankEmblem } from '../RankEmblem';
import { GameIcon } from './GameIcon';
import { LargeDialog } from '../ui/large-dialog';
import { ConfirmDialog } from '../ui/confirm-dialog';
import {
  createSavedMatchGroup,
  deleteSavedMatchAccount,
  deleteSavedMatchGroup,
  loadSavedMatchAccount,
  loadSavedMatchesCatalog,
  SAVED_MATCHES_CHANGED_EVENT,
  setSavedMatchAccountFollow,
  setSavedMatchAccountGroup,
  type SavedMatchAccount,
  type SavedMatchAccountCatalogEntry,
  type SavedMatchGroup,
} from './savedMatchesStore';

interface SavedMatchPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (account: SavedMatchAccount) => void;
}

type GroupFilter = 'all' | 'ungrouped' | string;
type DetailTab = 'info' | 'matches';

function getDisplayName(riotId: string | undefined): string {
  const normalized = (riotId ?? '').trim();
  const [gameName] = normalized.split('#');
  return gameName || normalized || '未知玩家';
}

function getFullRiotId(riotId: string | undefined): string {
  return riotId?.trim() || '未知 Riot ID';
}

function getAccountSummary(matches: SavedMatchPreview[]): string {
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

function getSavedAt(account: SavedMatchAccountCatalogEntry): number {
  return Number.isFinite(account.createdAt) ? account.createdAt : account.updatedAt;
}

function formatFullTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '--';
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value >= 10000) return `${(value / 1000).toFixed(1)}k`;
  return Math.round(value).toLocaleString('zh-CN');
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function isUsefulRegionName(regionName: string | undefined): regionName is string {
  const normalized = regionName?.trim() ?? '';
  return Boolean(normalized && !normalized.includes('读取') && !normalized.includes('无法'));
}

function getRegionName(account: SavedMatchAccountCatalogEntry): string {
  const region = account.region;
  if (!region) {
    const savedRegionName = account.regionName?.trim();
    if (isUsefulRegionName(savedRegionName)) return savedRegionName;
    return '未记录';
  }
  return LOL_REGIONS.find((item) => item.key === region)?.name ?? region;
}

function getRanks(account: SavedMatchAccountCatalogEntry): PlayerRankSummary[] {
  if (account.profile.ranks?.length) return account.profile.ranks;
  return account.profile.rank ? [account.profile.rank] : [];
}

function getRankText(rank: PlayerRankSummary): string {
  if (rank.displayText) return rank.displayText;
  return [
    rank.queueName,
    rank.tier,
    rank.division,
    rank.leaguePoints > 0 ? `${rank.leaguePoints} LP` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function getRankQueueLabel(rank: PlayerRankSummary): string {
  return rank.queueName || rank.queueType || '排位';
}

function getRankDetailText(rank: PlayerRankSummary): string {
  const text = getRankText(rank);
  const queueLabel = getRankQueueLabel(rank);
  const withoutQueue = text.startsWith(queueLabel) ? text.slice(queueLabel.length).trim() : text;
  return withoutQueue || text;
}

function getChampionName(match: SavedMatchPreview, championMap: Map<number, ChampionSummary>): string {
  const champion = championMap.get(match.championId);
  return champion?.title || champion?.name || match.championName || '未知英雄';
}

export function SavedMatchPickerDialog({ open, onClose, onSelect }: SavedMatchPickerDialogProps) {
  const [accounts, setAccounts] = useState<SavedMatchAccountCatalogEntry[]>([]);
  const [groups, setGroups] = useState<SavedMatchGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<GroupFilter>('all');
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('info');
  const [groupName, setGroupName] = useState('');
  const [notice, setNotice] = useState('');
  const [champions, setChampions] = useState<ChampionSummary[]>([]);
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);
  const [openingAccountId, setOpeningAccountId] = useState<string | null>(null);

  const refresh = async () => {
    const state = await loadSavedMatchesCatalog();
    setAccounts(state.accounts);
    setGroups(state.groups);
  };

  useEffect(() => {
    if (!open) return;
    void refresh();
    setNotice('');
    void window.lolHelper.match.getChampions().then(setChampions).catch(() => setChampions([]));
    const refreshListener = () => void refresh();
    window.addEventListener(SAVED_MATCHES_CHANGED_EVENT, refreshListener);
    window.addEventListener('focus', refreshListener);
    const timer = window.setInterval(refreshListener, 30_000);
    return () => {
      window.removeEventListener(SAVED_MATCHES_CHANGED_EVENT, refreshListener);
      window.removeEventListener('focus', refreshListener);
      window.clearInterval(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 3_500);
    return () => window.clearTimeout(timer);
  }, [notice]);

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

  useEffect(() => {
    if (filteredAccounts.length === 0) {
      setActiveAccountId(null);
      return;
    }
    if (!activeAccountId || !filteredAccounts.some((account) => account.id === activeAccountId)) {
      setActiveAccountId(filteredAccounts[0].id);
      setActiveTab('info');
    }
  }, [activeAccountId, filteredAccounts]);

  const activeAccount = useMemo(
    () => filteredAccounts.find((account) => account.id === activeAccountId) ?? null,
    [filteredAccounts, activeAccountId],
  );
  const activeRanks = useMemo(() => (activeAccount ? getRanks(activeAccount) : []), [activeAccount]);
  const championMap = useMemo(() => new Map(champions.map((champion) => [champion.id, champion])), [champions]);

  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const account of accounts) {
      counts.set(account.groupId || 'ungrouped', (counts.get(account.groupId || 'ungrouped') ?? 0) + 1);
    }
    return counts;
  }, [accounts]);

  const createGroup = async () => {
    const trimmed = groupName.trim();
    if (!trimmed) {
      setNotice('先输入分组名称');
      return;
    }
    const state = await createSavedMatchGroup(trimmed);
    setGroups(state.groups);
    setAccounts(state.accounts);
    setGroupName('');
    setActiveGroup(state.groups[0]?.id ?? 'all');
    setNotice('分组已创建');
  };

  const deleteGroup = async (groupId: string) => {
    const state = await deleteSavedMatchGroup(groupId);
    setGroups(state.groups);
    setAccounts(state.accounts);
    setActiveGroup('all');
    setNotice('分组已删除，里面的账号已移到未分组');
  };

  const deleteAccount = async (accountId: string) => {
    const catalog = await deleteSavedMatchAccount(accountId);
    setAccounts(catalog.accounts);
    setGroups(catalog.groups);
    setDeleteAccountId(null);
    setNotice('保存账号已删除');
  };

  const moveAccount = async (accountId: string, groupId: string) => {
    const catalog = await setSavedMatchAccountGroup(accountId, groupId || undefined);
    setAccounts(catalog.accounts);
    setGroups(catalog.groups);
    setNotice('分组已更新');
  };

  const toggleFollow = async (accountId: string, enabled: boolean) => {
    const state = await setSavedMatchAccountFollow(accountId, enabled);
    setAccounts(state.accounts);
    setGroups(state.groups);
    setNotice(enabled ? '已关注，后台每分钟检查最新战绩' : '已取消关注');
  };

  const openSavedAccount = async (accountId: string) => {
    if (openingAccountId) return;
    setOpeningAccountId(accountId);
    try {
      const account = await loadSavedMatchAccount(accountId);
      if (!account) {
        setNotice('这个保存账号已不存在，请刷新后重试');
        await refresh();
        return;
      }
      onSelect(account);
      onClose();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '打开保存战绩失败');
    } finally {
      setOpeningAccountId(null);
    }
  };

  if (!open) return null;

  return (
    <>
    <LargeDialog
      open={open}
      onClose={onClose}
      title="保存战绩"
      description={`${accounts.length} 个保存账号 · 按分组管理并随时重新打开`}
      icon={<Bookmark className="size-4" />}
      notice={notice}
      className="h-[660px] w-[1020px]"
    >
        <div className="flex h-full min-h-0">
          <aside className="flex w-[270px] shrink-0 flex-col border-r border-app-border bg-app-bg-soft/80">
            <div className="shrink-0 border-b border-app-border p-3">
              <nav className="space-y-1">
                <GroupButton
                  active={activeGroup === 'all'}
                  label="全部"
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
                    onDelete={() => void deleteGroup(group.id)}
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
                      if (event.key === 'Enter') void createGroup();
                    }}
                    placeholder="比如：朋友"
                    className="h-8 min-w-0 flex-1 rounded-sm border border-app-border bg-app-surface px-2 text-xs text-app-text outline-none focus:border-app-primary"
                  />
                  <button
                    type="button"
                    onClick={() => void createGroup()}
                    className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-app-primary text-app-primary-foreground transition-colors hover:bg-app-primary-hover"
                    title="新建分组"
                    aria-label="新建分组"
                  >
                    <FolderPlus className="size-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {filteredAccounts.length > 0 ? (
                <div className="overflow-hidden rounded-sm border border-app-border bg-app-surface divide-y divide-app-border/70">
                  {filteredAccounts.map((account) => (
                    <AccountListItem
                      key={account.id}
                      account={account}
                      active={activeAccount?.id === account.id}
                      onClick={() => {
                        setActiveAccountId(account.id);
                        setActiveTab('info');
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center px-3 text-center text-xs text-app-muted">
                  这里还没有保存账号
                </div>
              )}
            </div>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col bg-app-surface">
            {activeAccount ? (
              <>
                <div className="shrink-0 border-b border-app-border bg-app-surface px-5 py-4">
                  <div className="flex items-start gap-3.5">
                    <ProfileIcon
                      iconId={activeAccount.profile.profileIconId}
                      src={activeAccount.profile.profileIconUrl}
                      alt={getDisplayName(activeAccount.profile.riotId)}
                      size={56}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <h3 className="truncate text-lg font-semibold text-app-text">
                          {getFullRiotId(activeAccount.profile.riotId)}
                        </h3>
                        <span className="shrink-0 rounded-sm bg-app-primary-soft px-2 py-1 text-[10px] font-medium text-app-primary">
                          {getRegionName(activeAccount)}
                        </span>
                      </div>
                      <div className="mt-1.5 text-[11px] text-app-muted">
                        {getAccountSummary(activeAccount.matches)} · 保存于 {formatSavedAt(getSavedAt(activeAccount))}
                      </div>
                    </div>
                    <RankSummary ranks={activeRanks} />
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <div className="flex gap-2">
                      <TabButton active={activeTab === 'info'} onClick={() => setActiveTab('info')}>
                        账号信息
                      </TabButton>
                      <TabButton active={activeTab === 'matches'} onClick={() => setActiveTab('matches')}>
                        战绩
                      </TabButton>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <select
                        value={activeAccount.groupId ?? ''}
                        onChange={(event) => void moveAccount(activeAccount.id, event.target.value)}
                        className="h-8 w-28 rounded-sm border border-app-border bg-app-surface px-2.5 text-xs text-app-text outline-none focus:border-app-primary/55 focus:ring-2 focus:ring-app-primary/10"
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
                        onClick={() => void toggleFollow(activeAccount.id, !activeAccount.follow?.enabled)}
                        className={`flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-3 text-xs font-medium transition-colors ${
                          activeAccount.follow?.enabled
                            ? 'bg-app-primary-soft text-app-primary hover:bg-app-primary-soft/70'
                            : 'border border-app-border bg-app-surface text-app-muted hover:text-app-primary'
                        }`}
                        title={activeAccount.follow?.enabled ? '取消关注这个账号' : '关注这个账号'}
                      >
                        {activeAccount.follow?.enabled ? (
                          <Bell className="size-3.5 fill-app-primary" />
                        ) : (
                          <Bell className="size-3.5" />
                        )}
                        {activeAccount.follow?.enabled ? '已关注' : '关注'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void openSavedAccount(activeAccount.id)}
                        disabled={openingAccountId !== null}
                        className="h-8 shrink-0 rounded-sm bg-app-primary px-4 text-xs font-medium text-app-primary-foreground transition-colors hover:bg-app-primary-hover disabled:opacity-60"
                      >
                        {openingAccountId === activeAccount.id ? '正在打开…' : '打开战绩'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteAccountId(activeAccount.id)}
                        className="flex size-8 shrink-0 items-center justify-center rounded-sm text-app-subtle transition-colors hover:bg-app-danger/10 hover:text-app-danger"
                        title="删除这个保存账号"
                        aria-label="删除这个保存账号"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  {activeTab === 'info' ? (
                    <AccountInfoPanel account={activeAccount} />
                  ) : (
                    <SavedMatchesPanel account={activeAccount} championMap={championMap} />
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-xs text-app-muted">
                <div>
                  <div className="font-semibold text-app-text">这里还没有保存账号</div>
                  <div className="mt-1">去战绩页点击“保存战绩”，勾选对局后保存。</div>
                </div>
              </div>
            )}
          </main>
        </div>
    </LargeDialog>
    <ConfirmDialog
      open={Boolean(deleteAccountId)}
      title="删除保存账号"
      description="该账号保存的战绩、分组和关注状态都会被删除。此操作无法撤销。"
      confirmLabel="删除账号"
      destructive
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setDeleteAccountId(null);
      }}
      onConfirm={() => {
        if (deleteAccountId) void deleteAccount(deleteAccountId);
      }}
    />
    </>
  );
}

function AccountListItem({
  account,
  active,
  onClick,
}: {
  account: SavedMatchAccountCatalogEntry;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors ${
        active
          ? 'bg-app-primary-soft/60 text-app-text'
          : 'text-app-muted hover:bg-app-bg-soft hover:text-app-text'
      }`}
    >
      <ProfileIcon
        iconId={account.profile.profileIconId}
        src={account.profile.profileIconUrl}
        alt={getDisplayName(account.profile.riotId)}
        size={34}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-xs font-semibold text-app-text">
            {getDisplayName(account.profile.riotId)}
          </span>
          {account.follow?.enabled && <Bell className="size-3 shrink-0 fill-app-primary text-app-primary" />}
        </div>
        <div className="mt-0.5 truncate text-[10px] text-app-subtle">
          {getRegionName(account)} · {getAccountSummary(account.matches)}
        </div>
      </div>
      <span className="shrink-0 text-[10px] text-app-subtle">{formatSavedAt(getSavedAt(account))}</span>
    </button>
  );
}

function RankSummary({ ranks }: { ranks: PlayerRankSummary[] }) {
  if (ranks.length === 0) {
    return (
      <div className="hidden w-20 shrink-0 justify-end md:flex">
        <div className="text-center text-[11px] text-app-muted">
          未保存到段位信息
        </div>
      </div>
    );
  }

  return (
    <div className="hidden max-w-[180px] shrink-0 items-start justify-end gap-2 md:flex">
      {ranks.slice(0, 2).map((rank) => (
        <div
          key={`${rank.queueType}-${rank.tier}-${rank.division}`}
          className="flex w-20 flex-col items-center text-center"
          title={getRankText(rank)}
        >
          <RankEmblem rank={rank} size={44} />
          <div className="mt-0.5 w-full truncate text-[10px] text-app-muted">{getRankQueueLabel(rank)}</div>
          <div className="w-full truncate text-xs font-semibold text-app-text">{getRankDetailText(rank)}</div>
        </div>
      ))}
    </div>
  );
}

function AccountInfoPanel({ account }: { account: SavedMatchAccountCatalogEntry }) {
  const wins = account.matches.filter((match) => match.win).length;
  const losses = account.matches.length - wins;
  const winRate = account.matches.length > 0
    ? Math.round((wins / account.matches.length) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-[680px] space-y-6 py-2">
      <section>
        <h4 className="mb-2 text-xs font-semibold text-app-text">保存概览</h4>
        <div className="grid grid-cols-3 overflow-hidden rounded-sm border border-app-border bg-app-surface divide-x divide-app-border">
          <div className="px-4 py-3">
            <div className="text-[10px] text-app-muted">保存对局</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-app-text">{account.matches.length}</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[10px] text-app-muted">胜负</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-app-text">
              <span className="text-app-success">{wins}</span>
              <span className="mx-1 text-app-subtle">/</span>
              <span className="text-app-danger">{losses}</span>
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[10px] text-app-muted">胜率</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-app-text">{winRate}%</div>
          </div>
        </div>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold text-app-text">账号资料</h4>
        <div className="overflow-hidden rounded-sm border border-app-border bg-app-surface divide-y divide-app-border/70">
          <InfoRow label="Riot ID" value={getFullRiotId(account.profile.riotId)} />
          <InfoRow label="大区" value={getRegionName(account)} />
          <InfoRow label="保存时间" value={formatSavedAt(getSavedAt(account))} />
          <InfoRow label="关注状态" value={account.follow?.enabled ? '已关注' : '未关注'} />
        </div>
      </section>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-h-10 grid-cols-[120px_minmax(0,1fr)] items-center gap-4 px-3 py-2 text-xs">
      <span className="text-app-muted">{label}</span>
      <span className="truncate text-right font-medium text-app-text">{value}</span>
    </div>
  );
}

function SavedMatchesPanel({
  account,
  championMap,
}: {
  account: SavedMatchAccountCatalogEntry;
  championMap: Map<number, ChampionSummary>;
}) {
  return (
    <div className="overflow-hidden rounded-sm border border-app-border bg-app-surface divide-y divide-app-border/70">
      {account.matches.map((match) => (
        <div
          key={match.gameId}
          className={`saved-match-row grid grid-cols-[minmax(0,1fr)_90px_80px_80px] items-center gap-3 border-l-2 px-3 py-2.5 ${
            match.win
              ? 'border-l-app-success bg-app-win-bg/20'
              : 'border-l-app-danger bg-app-loss-bg/20'
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <GameIcon src={match.championAvatar} alt={getChampionName(match, championMap)} size={34} rounded />
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-app-text">
                {match.win ? '胜利' : '失败'} · {getChampionName(match, championMap)}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-app-muted">
                {match.queueName || '未知模式'} · {formatFullTime(match.gameCreation)} · {formatDuration(match.gameDuration)}
              </div>
            </div>
          </div>
          <div className="text-right text-xs font-semibold tabular-nums text-app-text">
            {match.kills} / {match.deaths} / {match.assists}
            <div className="text-[10px] font-normal text-app-muted">{match.kda.toFixed(2)} KDA</div>
          </div>
          <div className="text-right text-xs font-semibold tabular-nums text-app-text">
            {formatNumber(match.damage)}
            <div className="text-[10px] font-normal text-app-muted">伤害</div>
          </div>
          <div className="text-right text-xs font-semibold tabular-nums text-app-text">
            {match.cs}
            <div className="text-[10px] font-normal text-app-muted">补刀</div>
          </div>
        </div>
      ))}
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
      className={`h-8 rounded-sm px-3 text-xs font-medium transition-colors ${
        active
          ? 'bg-app-primary-soft text-app-primary'
          : 'text-app-muted hover:bg-app-bg-soft hover:text-app-text'
      }`}
    >
      {children}
    </button>
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
        className={`flex h-9 min-w-0 flex-1 items-center gap-2 rounded-sm px-2 text-left text-sm font-medium transition-colors ${
          active
            ? 'bg-app-surface text-app-text shadow-sm'
            : 'text-app-muted hover:bg-app-nav-hover hover:text-app-text'
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
