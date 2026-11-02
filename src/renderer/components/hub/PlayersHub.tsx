import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  BellOff,
  BellRing,
  BookmarkCheck,
  FolderPlus,
  Plus,
  Search,
  Trash2,
  UserRoundSearch,
  X,
} from 'lucide-react';
import type { ChampionSummary, PlayerRankSummary, SavedMatchPreview } from '../../../shared/api';
import { LOL_REGIONS } from '../../../shared/constants';
import { ProfileIcon } from '../ProfileIcon';
import { GameIcon } from '../match/GameIcon';
import { ConfirmDialog } from '../ui/confirm-dialog';
import {
  createSavedMatchGroup,
  deleteSavedMatchAccount,
  deleteSavedMatchGroup,
  loadSavedMatchAccount,
  loadSavedMatchesCatalog,
  saveMatchesForProfile,
  SAVED_MATCHES_CHANGED_EVENT,
  setSavedMatchAccountFollow,
  setSavedMatchAccountGroup,
  type SavedMatchAccount,
  type SavedMatchAccountCatalogEntry,
  type SavedMatchFollowAlertPreview,
  type SavedMatchGroup,
} from '../match/savedMatchesStore';
import { AvatarBadge, HubDialog, useHubNotice } from './HubDialog';
import { ChampionSplash, ResultDots } from './HubArt';
import { PlayerProfileView } from './PlayerProfileView';
import {
  championName,
  formatAgo,
  formatClock,
  formatDuration,
  groupByDay,
  regionLabel,
  splitRiotId,
} from './hubFormat';

// 我的玩家：把「保存战绩」和「关注账号」合成一个地方。
// 两者底层本来就是同一份数据——关注 = 打开了新对局提醒的保存账号。
// 左边是人，右边是「关注动态」或某个人的档案。

export interface FollowAccountRequest {
  riotId: string;
  region?: string;
  nonce: number;
}

export type PlayersHubView = 'feed' | 'players';

type Filter = 'all' | 'following' | 'ungrouped' | string;
type Selection = { kind: 'feed' } | { kind: 'player'; id: string };

interface PlayersHubProps {
  open: boolean;
  onClose: () => void;
  currentRegionKey: string;
  currentRegionName: string;
  initialView?: PlayersHubView;
  followRequest?: FollowAccountRequest | null;
  /** 打开窗口前已经看过的动态，用来给新动态打「新」标记。 */
  seenAlertIds?: ReadonlySet<string>;
  /** 在战绩页打开保存的对局存档。 */
  onOpenArchive: (account: SavedMatchAccount) => void;
  /** 在战绩页实时查询这个玩家。 */
  onViewPlayer: (riotId: string, region?: string) => void;
}

function latestGameAt(account: SavedMatchAccountCatalogEntry): number {
  return account.matches.reduce((latest, match) => Math.max(latest, match.gameCreation || 0), 0);
}

function sortedMatches(account: SavedMatchAccountCatalogEntry): SavedMatchPreview[] {
  return [...account.matches].sort((left, right) => right.gameCreation - left.gameCreation);
}

function accountRanks(account: SavedMatchAccountCatalogEntry): PlayerRankSummary[] {
  const ranks = account.profile.ranks?.length ? account.profile.ranks : account.profile.rank ? [account.profile.rank] : [];
  return ranks.filter((rank) => rank.tier && !['NONE', 'UNRANKED', ''].includes(rank.tier.toUpperCase()));
}

function accountRegion(account: { region?: string; regionName?: string }): string {
  return regionLabel(account.region, account.regionName, '未记录大区');
}

export function PlayersHub({
  open,
  onClose,
  currentRegionKey,
  currentRegionName,
  initialView = 'feed',
  followRequest,
  seenAlertIds,
  onOpenArchive,
  onViewPlayer,
}: PlayersHubProps) {
  const [accounts, setAccounts] = useState<SavedMatchAccountCatalogEntry[]>([]);
  const [groups, setGroups] = useState<SavedMatchGroup[]>([]);
  const [alerts, setAlerts] = useState<SavedMatchFollowAlertPreview[]>([]);
  const [champions, setChampions] = useState<ChampionSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [addRiotId, setAddRiotId] = useState('');
  const [addRegion, setAddRegion] = useState(currentRegionKey);
  const [adding, setAdding] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupDraft, setGroupDraft] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SavedMatchAccountCatalogEntry | null>(null);
  const [openingId, setOpeningId] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [notice, showNotice] = useHubNotice();
  const addInputRef = useRef<HTMLInputElement>(null);
  const handledRequestRef = useRef<number | null>(null);

  const applyCatalog = useCallback((catalog: {
    accounts: SavedMatchAccountCatalogEntry[];
    groups: SavedMatchGroup[];
    followAlerts?: SavedMatchFollowAlertPreview[];
  }) => {
    setAccounts(catalog.accounts);
    setGroups(catalog.groups);
    if (catalog.followAlerts) setAlerts(catalog.followAlerts);
  }, []);

  const refresh = useCallback(async () => {
    try {
      applyCatalog(await loadSavedMatchesCatalog());
    } finally {
      setLoaded(true);
      setNow(Date.now());
    }
  }, [applyCatalog]);

  useEffect(() => {
    if (!open) return undefined;
    void refresh();
    void window.lolHelper.match.getChampions().then(setChampions).catch(() => setChampions([]));
    const listener = () => void refresh();
    window.addEventListener(SAVED_MATCHES_CHANGED_EVENT, listener);
    window.addEventListener('focus', listener);
    const timer = window.setInterval(listener, 30_000);
    return () => {
      window.removeEventListener(SAVED_MATCHES_CHANGED_EVENT, listener);
      window.removeEventListener('focus', listener);
      window.clearInterval(timer);
    };
  }, [open, refresh]);

  useEffect(() => {
    if (open) setAddRegion(currentRegionKey);
  }, [currentRegionKey, open]);

  const championMap = useMemo(() => new Map(champions.map((champion) => [champion.id, champion])), [champions]);
  const following = useMemo(() => accounts.filter((account) => account.follow?.enabled), [accounts]);

  const sortedAccounts = useMemo(
    () => [...accounts].sort((left, right) => {
      const followDiff = Number(Boolean(right.follow?.enabled)) - Number(Boolean(left.follow?.enabled));
      if (followDiff !== 0) return followDiff;
      return (latestGameAt(right) || right.updatedAt) - (latestGameAt(left) || left.updatedAt);
    }),
    [accounts],
  );

  const counts = useMemo(() => {
    const byGroup = new Map<string, number>();
    for (const account of accounts) {
      const key = account.groupId || 'ungrouped';
      byGroup.set(key, (byGroup.get(key) ?? 0) + 1);
    }
    return byGroup;
  }, [accounts]);

  const visibleAccounts = useMemo(() => {
    const text = query.trim().toLowerCase();
    return sortedAccounts.filter((account) => {
      if (filter === 'following' && !account.follow?.enabled) return false;
      if (filter === 'ungrouped' && account.groupId) return false;
      if (filter !== 'all' && filter !== 'following' && filter !== 'ungrouped' && account.groupId !== filter) return false;
      if (text && !account.profile.riotId.toLowerCase().includes(text)) return false;
      return true;
    });
  }, [filter, query, sortedAccounts]);

  // 自定义分组被删掉后回到「全部」。
  useEffect(() => {
    if (['all', 'following', 'ungrouped'].includes(filter)) return;
    if (!groups.some((group) => group.id === filter)) setFilter('all');
  }, [filter, groups]);

  // 首次加载完决定默认看什么：有关注就看动态，没有就看第一个玩家。
  useEffect(() => {
    if (!open || !loaded || selection) return;
    if (initialView === 'feed' || accounts.length === 0) setSelection({ kind: 'feed' });
    else setSelection({ kind: 'player', id: sortedAccounts[0].id });
  }, [accounts.length, initialView, loaded, open, selection, sortedAccounts]);

  // 选中的玩家被删除后回到动态。
  useEffect(() => {
    if (selection?.kind === 'player' && loaded && !accounts.some((account) => account.id === selection.id)) {
      setSelection({ kind: 'feed' });
    }
  }, [accounts, loaded, selection]);

  const followRiotId = useCallback(async (riotId: string, region: string) => {
    const trimmed = riotId.trim();
    if (!trimmed) {
      showNotice('请输入 名字#编号');
      addInputRef.current?.focus();
      return;
    }
    const existing = accounts.find((account) =>
      account.profile.riotId.toLowerCase() === trimmed.toLowerCase() && (account.region || '') === (region || ''));
    setAdding(true);
    try {
      if (existing) {
        if (!existing.follow?.enabled) applyCatalog(await setSavedMatchAccountFollow(existing.id, true));
        setSelection({ kind: 'player', id: existing.id });
        setAddRiotId('');
        showNotice(`已关注 ${splitRiotId(existing.profile.riotId).name}`, 'ok');
        return;
      }
      const result = await window.lolHelper.match.search({ name: trimmed, region, pageSize: 1, maxMatches: 1 });
      if (result.error || !result.profile.puuid) {
        showNotice(result.error || '没有找到这个玩家', 'error');
        return;
      }
      const label = regionLabel(region || currentRegionKey, region ? undefined : currentRegionName);
      const saved = await saveMatchesForProfile(result.profile, region, result.matches, label);
      applyCatalog(await setSavedMatchAccountFollow(saved.accountId, true));
      setSelection({ kind: 'player', id: saved.accountId });
      setAddRiotId('');
      showNotice(`已关注 ${splitRiotId(result.profile.riotId || trimmed).name}`, 'ok');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setAdding(false);
    }
  }, [accounts, applyCatalog, currentRegionKey, currentRegionName, showNotice]);

  // 从好友栏等地方点「关注」进来。
  useEffect(() => {
    if (!open || !loaded || !followRequest || handledRequestRef.current === followRequest.nonce) return;
    handledRequestRef.current = followRequest.nonce;
    const region = followRequest.region ?? currentRegionKey ?? '';
    setAddRegion(region);
    setAddRiotId(followRequest.riotId);
    void followRiotId(followRequest.riotId, region);
  }, [currentRegionKey, followRequest, followRiotId, loaded, open]);

  const toggleFollow = async (account: SavedMatchAccountCatalogEntry) => {
    const enabled = !account.follow?.enabled;
    try {
      applyCatalog(await setSavedMatchAccountFollow(account.id, enabled));
      showNotice(enabled ? '已关注' : '已取消关注', enabled ? 'ok' : 'neutral');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '操作失败', 'error');
    }
  };

  const moveToGroup = async (account: SavedMatchAccountCatalogEntry, groupId: string) => {
    applyCatalog(await setSavedMatchAccountGroup(account.id, groupId || undefined));
    const name = groups.find((group) => group.id === groupId)?.name;
    showNotice(name ? `已移到「${name}」` : '已移出分组');
  };

  const createGroup = async () => {
    const name = groupDraft.trim();
    if (!name) {
      setCreatingGroup(false);
      return;
    }
    const catalog = await createSavedMatchGroup(name);
    applyCatalog(catalog);
    const created = catalog.groups.find((group) => group.name === name);
    if (created) setFilter(created.id);
    setGroupDraft('');
    setCreatingGroup(false);
    showNotice(`已创建分组「${name}」`, 'ok');
  };

  const removeGroup = async (group: SavedMatchGroup) => {
    applyCatalog(await deleteSavedMatchGroup(group.id));
    setFilter('all');
    showNotice(`已删除分组「${group.name}」`);
  };

  const removeAccount = async (account: SavedMatchAccountCatalogEntry) => {
    applyCatalog(await deleteSavedMatchAccount(account.id));
    setDeleteTarget(null);
    showNotice(`已移除 ${splitRiotId(account.profile.riotId).name}`);
  };

  const openArchive = async (account: SavedMatchAccountCatalogEntry) => {
    if (openingId) return;
    setOpeningId(account.id);
    try {
      const full = await loadSavedMatchAccount(account.id);
      if (!full) {
        showNotice('存档不存在', 'error');
        await refresh();
        return;
      }
      onOpenArchive(full);
      onClose();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '打开存档失败', 'error');
    } finally {
      setOpeningId('');
    }
  };

  const viewPlayer = (riotId: string, region?: string) => {
    onViewPlayer(riotId, region);
    onClose();
  };

  const selectedAccount = selection?.kind === 'player'
    ? accounts.find((account) => account.id === selection.id) ?? null
    : null;
  const unseenCount = alerts.filter((alert) => !seenAlertIds?.has(alert.id)).length;
  const regionOptions = [{ key: currentRegionKey, name: currentRegionName || '当前大区' }, ...LOL_REGIONS.filter((region) => region.key !== currentRegionKey)];

  const filterChips: Array<{ value: Filter; label: string; count: number; group?: SavedMatchGroup }> = [
    { value: 'all', label: '全部', count: accounts.length },
    { value: 'following', label: '关注中', count: following.length },
    ...(groups.length > 0 ? [{ value: 'ungrouped', label: '未分组', count: counts.get('ungrouped') ?? 0 }] : []),
    ...groups.map((group) => ({ value: group.id, label: group.name, count: counts.get(group.id) ?? 0, group })),
  ];

  return (
    <>
      <HubDialog
        open={open}
        onClose={onClose}
        variant="players"
        title="我的玩家"
        icon={<BookmarkCheck />}
        notice={notice}
        actions={(
          <form
            className="hub-add"
            onSubmit={(event) => {
              event.preventDefault();
              void followRiotId(addRiotId, addRegion);
            }}
          >
            <select
              value={addRegion}
              onChange={(event) => setAddRegion(event.target.value)}
              aria-label="大区"
              className="hub-add__region"
            >
              {regionOptions.map((region) => (
                <option key={region.key || 'current'} value={region.key}>{region.name}</option>
              ))}
            </select>
            <input
              ref={addInputRef}
              value={addRiotId}
              onChange={(event) => setAddRiotId(event.target.value)}
              placeholder="名字#编号"
              aria-label="要关注的玩家"
              className="hub-add__input"
            />
            <button type="submit" className="hub-btn" data-variant="primary" disabled={adding}>
              <Bell />
              {adding ? '查找中…' : '关注'}
            </button>
          </form>
        )}
      >
        <div className="hub-split">
          <aside className="hub-side">
            <div className="hub-side__top">
              <label className="hub-search">
                <Search />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索玩家"
                  aria-label="搜索玩家"
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')} aria-label="清空搜索"><X /></button>
                )}
              </label>

              <button
                type="button"
                className="hub-pin"
                aria-current={selection?.kind === 'feed' ? 'true' : undefined}
                onClick={() => setSelection({ kind: 'feed' })}
              >
                <span className="hub-pin__icon" data-tone="accent"><BellRing /></span>
                <b className="hub-pin__label">动态</b>
                {alerts.length > 0 && (
                  <span className="hub-count" data-tone={unseenCount > 0 ? 'alert' : 'neutral'}>
                    {unseenCount > 0 ? `${unseenCount} 新` : alerts.length}
                  </span>
                )}
              </button>
            </div>

            <div className="pl-chips" role="tablist" aria-label="玩家分组">
              {filterChips.map((chip) => (
                <span key={chip.value} className="pl-chip" aria-selected={filter === chip.value} role="tab">
                  <button type="button" onClick={() => setFilter(chip.value)}>
                    {chip.value === 'following' && <Bell />}
                    {chip.label}
                    <em>{chip.count}</em>
                  </button>
                  {chip.group && filter === chip.value && (
                    <button
                      type="button"
                      className="pl-chip__remove"
                      onClick={() => chip.group && void removeGroup(chip.group)}
                      title="删除这个分组（玩家不会被删除）"
                      aria-label={`删除分组 ${chip.label}`}
                    >
                      <X />
                    </button>
                  )}
                </span>
              ))}
              {creatingGroup ? (
                <input
                  autoFocus
                  className="pl-chip-input"
                  value={groupDraft}
                  maxLength={12}
                  placeholder="分组名，回车确认"
                  onChange={(event) => setGroupDraft(event.target.value)}
                  onBlur={() => void createGroup()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void createGroup();
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setGroupDraft('');
                      setCreatingGroup(false);
                    }
                  }}
                />
              ) : (
                <button type="button" className="pl-chip pl-chip--add" onClick={() => setCreatingGroup(true)} title="新建分组">
                  <FolderPlus />
                  分组
                </button>
              )}
            </div>

            <div className="hub-side__list">
              {visibleAccounts.length > 0 ? (
                visibleAccounts.map((account) => (
                  <PlayerRow
                    key={account.id}
                    account={account}
                    championMap={championMap}
                    now={now}
                    active={selection?.kind === 'player' && selection.id === account.id}
                    onClick={() => setSelection({ kind: 'player', id: account.id })}
                  />
                ))
              ) : (
                <div className="hub-side__empty">
                  {!loaded ? '读取中…' : query ? '无匹配' : '暂无玩家'}
                </div>
              )}
            </div>
          </aside>

          <main className="hub-main">
            {selectedAccount ? (
              <PlayerProfile
                key={selectedAccount.id}
                account={selectedAccount}
                groups={groups}
                opening={openingId === selectedAccount.id}
                onToggleFollow={() => void toggleFollow(selectedAccount)}
                onMoveGroup={(groupId) => void moveToGroup(selectedAccount, groupId)}
                onDelete={() => setDeleteTarget(selectedAccount)}
                onOpenArchive={() => void openArchive(selectedAccount)}
                onViewLatest={() => viewPlayer(selectedAccount.profile.riotId, selectedAccount.region)}
                onViewPlayer={viewPlayer}
              />
            ) : (
              <FollowFeed
                alerts={alerts}
                following={following}
                championMap={championMap}
                seenAlertIds={seenAlertIds}
                now={now}
                onSelectAccount={(id) => setSelection({ kind: 'player', id })}
                onViewPlayer={viewPlayer}
                onFocusAdd={() => addInputRef.current?.focus()}
              />
            )}
          </main>
        </div>
      </HubDialog>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="移除这个玩家"
        description={`${deleteTarget?.profile.riotId ?? ''} 保存的对局、分组和关注都会一起删除，无法撤销。`}
        confirmLabel="移除"
        destructive
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (deleteTarget) void removeAccount(deleteTarget);
        }}
      />
    </>
  );
}

function PlayerRow({
  account,
  championMap,
  now,
  active,
  onClick,
}: {
  account: SavedMatchAccountCatalogEntry;
  championMap: Map<number, ChampionSummary>;
  now: number;
  active: boolean;
  onClick: () => void;
}) {
  const { name, tag } = splitRiotId(account.profile.riotId);
  const matches = sortedMatches(account);
  const latest = matches[0];
  const followed = Boolean(account.follow?.enabled);
  const hasError = Boolean(followed && account.follow?.lastError);
  return (
    <button type="button" className="pl-row" aria-current={active ? 'true' : undefined} onClick={onClick}>
      <span className="hub-avatar">
        <ProfileIcon iconId={account.profile.profileIconId} src={account.profile.profileIconUrl} alt={name} size={40} />
        {followed && (
          <AvatarBadge tone={hasError ? 'alert' : 'accent'}>
            {hasError ? <AlertTriangle /> : <Bell />}
          </AvatarBadge>
        )}
      </span>
      <span className="pl-row__body">
        <span className="pl-row__name">
          <b>{name}</b>
          {tag && <small>#{tag}</small>}
        </span>
        <span className="pl-row__meta">
          {latest ? (
            <>
              <GameIcon src={latest.championAvatar} alt="" size={16} rounded />
              <span data-win={latest.win ? 'true' : 'false'}>{latest.win ? '胜' : '负'}</span>
              <span className="pl-row__sep">·</span>
              <span className="truncate">{championName(latest, championMap)}</span>
              <span className="pl-row__sep">·</span>
              <span className="shrink-0">{formatAgo(latest.gameCreation, now)}</span>
            </>
          ) : (
            <span>{accountRegion(account)} · 暂无对局</span>
          )}
        </span>
      </span>
      <ResultDots results={matches.slice(0, 5).map((match) => ({ key: match.gameId, win: match.win }))} />
    </button>
  );
}

function FollowFeed({
  alerts,
  following,
  championMap,
  seenAlertIds,
  now,
  onSelectAccount,
  onViewPlayer,
  onFocusAdd,
}: {
  alerts: SavedMatchFollowAlertPreview[];
  following: SavedMatchAccountCatalogEntry[];
  championMap: Map<number, ChampionSummary>;
  seenAlertIds?: ReadonlySet<string>;
  now: number;
  onSelectAccount: (id: string) => void;
  onViewPlayer: (riotId: string, region?: string) => void;
  onFocusAdd: () => void;
}) {
  const days = useMemo(
    () => groupByDay(
      [...alerts].sort((left, right) => right.match.gameCreation - left.match.gameCreation),
      (alert) => alert.match.gameCreation,
      now,
    ),
    [alerts, now],
  );
  return (
    <div className="hub-scroll">
      <div className="pl-feed">
        {following.length > 0 && (
          <div className="pl-watch">
            {following.map((account) => {
              const { name } = splitRiotId(account.profile.riotId);
              const error = account.follow?.lastError;
              return (
                <button
                  key={account.id}
                  type="button"
                  className="pl-watch__item"
                  onClick={() => onSelectAccount(account.id)}
                  title={error ? `检查失败：${error}` : account.profile.riotId}
                >
                  <span className="hub-avatar">
                    <ProfileIcon iconId={account.profile.profileIconId} src={account.profile.profileIconUrl} alt={name} size={36} />
                    {error && <AvatarBadge tone="alert"><AlertTriangle /></AvatarBadge>}
                  </span>
                  <span>{name}</span>
                </button>
              );
            })}
            <button type="button" className="pl-watch__item pl-watch__add" onClick={onFocusAdd} title="关注新玩家" aria-label="关注新玩家">
              <span className="pl-watch__plus"><Plus /></span>
            </button>
          </div>
        )}

        {days.length > 0 ? (
          days.map((day) => (
            <section key={day.key} className="pl-day">
              <h4 className="hub-day-label"><span>{day.label}</span></h4>
              <div className="pl-day__cards">
                {day.items.map((alert) => (
                  <FeedCard
                    key={alert.id}
                    alert={alert}
                    isNew={Boolean(seenAlertIds) && !seenAlertIds?.has(alert.id)}
                    championMap={championMap}
                    now={now}
                    onOpenProfile={() => onSelectAccount(alert.accountId)}
                    onViewPlayer={() => onViewPlayer(alert.riotId, alert.region)}
                  />
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="hub-empty">
            <span className="hub-empty__art"><BellRing /></span>
            {following.length > 0 ? (
              <b>暂无新对局</b>
            ) : (
              <>
                <b>暂无关注</b>
                <button type="button" className="hub-btn" data-variant="primary" onClick={onFocusAdd}>
                  <Plus />
                  关注玩家
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FeedCard({
  alert,
  isNew,
  championMap,
  now,
  onOpenProfile,
  onViewPlayer,
}: {
  alert: SavedMatchFollowAlertPreview;
  isNew: boolean;
  championMap: Map<number, ChampionSummary>;
  now: number;
  onOpenProfile: () => void;
  onViewPlayer: () => void;
}) {
  const { match } = alert;
  const { name, tag } = splitRiotId(alert.riotId);
  const endedAt = match.gameCreation + match.gameDuration * 1000;
  return (
    <article className="pl-card" data-win={match.win ? 'true' : 'false'}>
      <button type="button" className="pl-card__art" onClick={onOpenProfile} aria-label={`查看 ${alert.riotId} 的档案`}>
        <ChampionSplash avatar={match.championAvatar} championId={match.championId} className="pl-card__splash" />
        <span className="pl-card__result">{match.win ? '胜利' : '失败'}</span>
        <GameIcon src={match.championAvatar} alt="" size={34} rounded className="pl-card__champ" />
      </button>
      <div className="pl-card__body">
        <div className="pl-card__who">
          <ProfileIcon iconId={alert.profileIconId} src={alert.profileIconUrl} alt={name} size={20} />
          <b>{name}</b>
          {tag && <small>#{tag}</small>}
          {isNew && <span className="hub-tag" data-tone="alert">新</span>}
        </div>
        <div className="pl-card__line">
          <b>{championName(match, championMap)}</b> · {match.queueName || '对局'}
        </div>
        <div className="pl-card__meta">
          {formatClock(endedAt)} · {formatDuration(match.gameDuration)} · {regionLabel(alert.region, alert.regionName)}
        </div>
      </div>
      <div className="pl-card__stats">
        <span className="pl-kda">
          {match.kills}<i>/</i><em>{match.deaths}</em><i>/</i>{match.assists}
        </span>
        <small>{match.kda.toFixed(2)} KDA · {formatAgo(endedAt, now)}</small>
      </div>
      <button type="button" className="hub-btn pl-card__go" onClick={onViewPlayer} title="在战绩页查看 TA 的完整战绩">
        战绩
        <ArrowUpRight />
      </button>
    </article>
  );
}

function PlayerProfile({
  account,
  groups,
  opening,
  onToggleFollow,
  onMoveGroup,
  onDelete,
  onOpenArchive,
  onViewLatest,
  onViewPlayer,
}: {
  account: SavedMatchAccountCatalogEntry;
  groups: SavedMatchGroup[];
  opening: boolean;
  onToggleFollow: () => void;
  onMoveGroup: (groupId: string) => void;
  onDelete: () => void;
  onOpenArchive: () => void;
  onViewLatest: () => void;
  onViewPlayer: (riotId: string, region?: string) => void;
}) {
  const followed = Boolean(account.follow?.enabled);
  const followError = followed ? account.follow?.lastError : '';

  return (
    <PlayerProfileView
      puuid={account.profile.puuid}
      riotId={account.profile.riotId}
      region={account.region || undefined}
      regionName={accountRegion(account)}
      iconId={account.profile.profileIconId}
      iconUrl={account.profile.profileIconUrl}
      fallbackLevel={account.profile.level}
      fallbackRanks={accountRanks(account)}
      fallbackCollection={{ champions: account.profile.championCount, skins: account.profile.skinCount }}
      onViewPlayer={onViewPlayer}
      saved={{ matches: account.matches, opening, onOpen: onOpenArchive }}
      tags={(
        <>
          {followed && <span className="pv-chip" data-tone="gold"><Bell />关注中</span>}
          {followError && <span className="pv-chip" data-tone="warn" title={followError}><AlertTriangle />检查失败</span>}
        </>
      )}
      actions={(
        <>
          <button type="button" className="hub-btn" data-variant="primary" onClick={onViewLatest}>
            <UserRoundSearch />
            查战绩
          </button>
          <button
            type="button"
            className="hub-btn"
            data-variant={followed ? 'active' : undefined}
            onClick={onToggleFollow}
            title={followed ? '取消关注，保存的对局会保留' : 'TA 打完一把就提醒你'}
          >
            {followed ? <BellOff /> : <Bell />}
            {followed ? '取消关注' : '关注'}
          </button>
          <label className="hub-select" title="移到分组">
            <select value={account.groupId ?? ''} onChange={(event) => onMoveGroup(event.target.value)} aria-label="分组">
              <option value="">未分组</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </label>
          <button type="button" className="hub-icon-btn" data-tone="danger" onClick={onDelete} title="移除这个玩家" aria-label="移除这个玩家">
            <Trash2 />
          </button>
        </>
      )}
    />
  );
}
