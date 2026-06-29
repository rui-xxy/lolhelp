import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Folder,
  FolderPlus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { ChampionSummary, PlayerMatchDetail, PlayerRankSummary } from '../../../shared/api';
import { LOL_REGIONS } from '../../../shared/constants';
import { ProfileIcon } from '../ProfileIcon';
import { RankEmblem } from '../RankEmblem';
import { GameIcon } from './GameIcon';
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
type DetailTab = 'info' | 'matches';

function getDisplayName(riotId: string | undefined): string {
  const normalized = (riotId ?? '').trim();
  const [gameName] = normalized.split('#');
  return gameName || normalized || '未知玩家';
}

function getFullRiotId(riotId: string | undefined): string {
  return riotId?.trim() || '未知 Riot ID';
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

function getGroupName(groups: SavedMatchGroup[], groupId: string | undefined): string {
  if (!groupId) return '未分组';
  return groups.find((group) => group.id === groupId)?.name ?? '未分组';
}

function isUsefulRegionName(regionName: string | undefined): regionName is string {
  const normalized = regionName?.trim() ?? '';
  return Boolean(normalized && !normalized.includes('读取') && !normalized.includes('无法'));
}

function getRegionName(account: SavedMatchAccount): string {
  const region = account.region;
  if (!region) {
    const savedRegionName = account.regionName?.trim();
    if (isUsefulRegionName(savedRegionName)) return savedRegionName;
    return '未记录';
  }
  return LOL_REGIONS.find((item) => item.key === region)?.name ?? region;
}

function getRanks(account: SavedMatchAccount): PlayerRankSummary[] {
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

function getMatchStats(matches: PlayerMatchDetail[]) {
  const wins = matches.filter((match) => match.win).length;
  const losses = matches.length - wins;
  const avgKda = matches.length
    ? matches.reduce((sum, match) => sum + match.kda, 0) / matches.length
    : 0;
  const avgDamage = matches.length
    ? matches.reduce((sum, match) => sum + match.damage, 0) / matches.length
    : 0;
  const avgCs = matches.length
    ? matches.reduce((sum, match) => sum + match.cs, 0) / matches.length
    : 0;
  const winRate = matches.length ? Math.round((wins / matches.length) * 100) : 0;
  return { wins, losses, avgKda, avgDamage, avgCs, winRate };
}

function getModeSummary(matches: PlayerMatchDetail[]): string {
  const counts = new Map<string, number>();
  for (const match of matches) {
    counts.set(match.queueName || '未知模式', (counts.get(match.queueName || '未知模式') ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${name} ${count}`)
    .join(' · ') || '暂无';
}

function getChampionName(match: PlayerMatchDetail, championMap: Map<number, ChampionSummary>): string {
  const champion = championMap.get(match.championId);
  return champion?.title || champion?.name || match.championName || '未知英雄';
}

function getChampionSummary(matches: PlayerMatchDetail[], championMap: Map<number, ChampionSummary>): string {
  const counts = new Map<string, number>();
  for (const match of matches) {
    const name = getChampionName(match, championMap);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${name} ${count}`)
    .join(' · ') || '暂无';
}

export function SavedMatchPickerDialog({ open, onClose, onSelect }: SavedMatchPickerDialogProps) {
  const [accounts, setAccounts] = useState<SavedMatchAccount[]>([]);
  const [groups, setGroups] = useState<SavedMatchGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<GroupFilter>('all');
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('info');
  const [groupName, setGroupName] = useState('');
  const [notice, setNotice] = useState('');
  const [champions, setChampions] = useState<ChampionSummary[]>([]);

  const refresh = () => {
    setAccounts(loadSavedMatchAccounts());
    setGroups(loadSavedMatchGroups());
  };

  useEffect(() => {
    if (!open) return;
    refresh();
    setNotice('');
    void window.lolHelper.match.getChampions().then(setChampions).catch(() => setChampions([]));
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
      <section className="relative flex h-[620px] w-[960px] flex-col overflow-hidden rounded-xl border border-app-border bg-app-bg shadow-airbnb">
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          {notice && <span className="rounded-full bg-white/85 px-2.5 py-1 text-xs text-app-primary shadow-sm">{notice}</span>}
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full bg-white/85 text-app-subtle shadow-sm transition-colors hover:bg-app-surface-soft hover:text-app-text"
            title="关闭"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-64 shrink-0 flex-col border-r border-app-border bg-app-bg-soft">
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
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {filteredAccounts.length > 0 ? (
                <div className="space-y-1.5">
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
                <div className="flex h-full items-center justify-center rounded-sm border border-dashed border-app-border bg-app-surface px-3 text-center text-xs text-app-muted">
                  这里还没有保存账号
                </div>
              )}
            </div>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col bg-app-bg">
            {activeAccount ? (
              <>
                <div className="shrink-0 border-b border-app-border bg-gradient-to-r from-app-primary-soft/70 via-app-surface to-app-surface px-5 py-4">
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
                        <span className="shrink-0 rounded-full border border-app-primary/20 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-app-primary shadow-sm">
                          {getRegionName(activeAccount)}
                        </span>
                      </div>
                      <div className="mt-1.5 text-[11px] text-app-muted">
                        {getAccountSummary(activeAccount.matches)} · 保存于 {formatSavedAt(activeAccount.updatedAt)}
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
                        onChange={(event) => moveAccount(activeAccount.id, event.target.value)}
                        className="h-8 w-28 rounded-full border border-app-border bg-white/85 px-3 text-xs text-app-text outline-none focus:border-app-primary"
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
                          onSelect(activeAccount);
                          onClose();
                        }}
                        className="h-8 shrink-0 rounded-full bg-app-primary px-4 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-app-primary-hover"
                      >
                        打开战绩
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteAccount(activeAccount.id)}
                        className="flex size-8 shrink-0 items-center justify-center rounded-full text-app-subtle transition-colors hover:bg-app-danger/10 hover:text-app-danger"
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
                    <AccountInfoPanel
                      account={activeAccount}
                      groups={groups}
                      championMap={championMap}
                    />
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
      </section>
    </div>
  );
}

function AccountListItem({
  account,
  active,
  onClick,
}: {
  account: SavedMatchAccount;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors ${
        active
          ? 'border-app-primary-soft bg-app-surface text-app-text shadow-sm ring-1 ring-app-primary/10'
          : 'border-transparent text-app-muted hover:border-app-border hover:bg-app-surface'
      }`}
    >
      <ProfileIcon
        iconId={account.profile.profileIconId}
        src={account.profile.profileIconUrl}
        alt={getDisplayName(account.profile.riotId)}
        size={34}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold text-app-text">{getDisplayName(account.profile.riotId)}</div>
        <div className="mt-0.5 truncate text-[10px] text-app-subtle">
          {getRegionName(account)} · {getAccountSummary(account.matches)}
        </div>
      </div>
      <span className="shrink-0 text-[10px] text-app-subtle">{formatSavedAt(account.updatedAt)}</span>
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

function AccountInfoPanel({
  account,
  groups,
  championMap,
}: {
  account: SavedMatchAccount;
  groups: SavedMatchGroup[];
  championMap: Map<number, ChampionSummary>;
}) {
  const stats = getMatchStats(account.matches);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl bg-app-surface shadow-sm ring-1 ring-app-border">
        <div className="bg-gradient-to-r from-app-primary-soft/55 to-transparent px-4 py-3">
          <div className="text-xs font-semibold text-app-text">基础信息</div>
          <div className="mt-1 text-[11px] text-app-muted">
            {getRegionName(account)} · {getGroupName(groups, account.groupId)}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-px bg-app-border text-xs">
          <InfoTile label="Riot ID" value={getFullRiotId(account.profile.riotId)} />
          <InfoTile label="等级" value={account.profile.level ? String(account.profile.level) : '未记录'} />
          <InfoTile label="保存战绩" value={`${account.matches.length} 场`} sub={`${stats.wins}胜 ${stats.losses}负 · ${stats.winRate}% 胜率`} />
          <InfoTile label="英雄数量" value={account.profile.championCount == null ? '未记录' : String(account.profile.championCount)} />
          <InfoTile label="皮肤数量" value={account.profile.skinCount == null ? '未记录' : String(account.profile.skinCount)} />
          <InfoTile label="平均表现" value={`${stats.avgKda.toFixed(2)} KDA`} sub={`${formatNumber(stats.avgDamage)} 伤害 · ${stats.avgCs.toFixed(1)} 补刀`} />
          <InfoTile label="主要模式" value={getModeSummary(account.matches)} />
          <InfoTile label="常用英雄" value={getChampionSummary(account.matches, championMap)} />
          <InfoTile label="最近保存" value={formatFullTime(account.updatedAt)} />
        </div>
      </section>
    </div>
  );
}

function SavedMatchesPanel({
  account,
  championMap,
}: {
  account: SavedMatchAccount;
  championMap: Map<number, ChampionSummary>;
}) {
  return (
    <div className="space-y-2">
      {account.matches.map((match) => (
        <div
          key={match.gameId}
          className={`grid grid-cols-[minmax(0,1fr)_90px_80px_80px] items-center gap-3 rounded-xl px-3 py-2.5 shadow-sm ring-1 ${
            match.win
              ? 'bg-app-win-bg/35 ring-app-win-border'
              : 'bg-app-loss-bg/35 ring-app-loss-border'
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

function InfoTile({
  label,
  value,
  sub,
  wide = false,
}: {
  label: string;
  value: string;
  sub?: string;
  wide?: boolean;
}) {
  return (
    <div className={`bg-app-surface px-4 py-3 ${wide ? 'col-span-3' : ''}`}>
      <div className="text-[11px] text-app-subtle">{label}</div>
      <div className="mt-1 break-all text-sm font-semibold text-app-text">{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-app-muted">{sub}</div>}
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
      className={`h-8 rounded-full px-4 text-xs font-semibold transition-colors ${
        active
          ? 'bg-app-primary text-white shadow-sm'
          : 'bg-white/70 text-app-muted hover:bg-app-surface hover:text-app-text'
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
        className={`flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left text-sm font-medium transition-colors ${
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
