import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, ChevronDown, Search, X } from 'lucide-react';
import type {
  ChampionSummary,
  PlayerMatchDetail,
  SavedMatchAccount,
  SavedMatchFollowAlert,
} from '../../../shared/api';
import { LOL_REGIONS } from '../../../shared/constants';
import { GameIcon } from './GameIcon';
import { ProfileIcon } from '../ProfileIcon';
import {
  loadSavedMatchesState,
  saveMatchesForProfile,
  SAVED_MATCHES_CHANGED_EVENT,
  setSavedMatchAccountFollow,
} from './savedMatchesStore';

export interface FollowAccountRequest {
  riotId: string;
  region?: string;
  nonce: number;
}

interface FollowAccountsDialogProps {
  open: boolean;
  onClose: () => void;
  currentRegionKey: string;
  currentRegionName: string;
  request?: FollowAccountRequest | null;
}

function getDisplayName(riotId: string | undefined): string {
  const normalized = (riotId ?? '').trim();
  const [gameName] = normalized.split('#');
  return gameName || normalized || '未知玩家';
}

function getRegionName(regionKey: string | undefined, regionName?: string): string {
  if (regionName?.trim()) return regionName.trim();
  if (!regionKey) return '当前大区';
  return LOL_REGIONS.find((region) => region.key === regionKey)?.name ?? regionKey;
}

function formatFullTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '--';
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRecentAge(timestamp: number | undefined): string {
  if (!timestamp || !Number.isFinite(timestamp)) return '--';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  return `${Math.floor(minutes / 60)}小时前`;
}

function getChampionName(match: PlayerMatchDetail, championMap: Map<number, ChampionSummary>): string {
  const champion = championMap.get(match.championId);
  return champion?.title || champion?.name || match.championName || '未知英雄';
}

function latestMatch(account: SavedMatchAccount): PlayerMatchDetail | null {
  return account.matches[0] ?? null;
}

export function FollowAccountsDialog({
  open,
  onClose,
  currentRegionKey,
  currentRegionName,
  request,
}: FollowAccountsDialogProps) {
  const [accounts, setAccounts] = useState<SavedMatchAccount[]>([]);
  const [alerts, setAlerts] = useState<SavedMatchFollowAlert[]>([]);
  const [champions, setChampions] = useState<ChampionSummary[]>([]);
  const [riotId, setRiotId] = useState('');
  const [region, setRegion] = useState('');
  const [notice, setNotice] = useState('');
  const [following, setFollowing] = useState(false);
  const handledRequestNonceRef = useRef<number | null>(null);

  const regionOptions = useMemo(
    () => [{ key: '', name: currentRegionName || '当前大区' }, ...LOL_REGIONS],
    [currentRegionName],
  );
  const championMap = useMemo(() => new Map(champions.map((champion) => [champion.id, champion])), [champions]);
  const followedAccounts = useMemo(
    () => accounts.filter((account) => account.follow?.enabled),
    [accounts],
  );

  const refresh = useCallback(async () => {
    const state = await loadSavedMatchesState();
    setAccounts(state.accounts);
    setAlerts(state.followAlerts ?? []);
  }, []);

  const followRiotId = useCallback(
    async (targetRiotId: string, targetRegion: string) => {
      const trimmed = targetRiotId.trim();
      if (!trimmed) {
        setNotice('先输入要关注的 Riot ID');
        return;
      }

      setFollowing(true);
      setNotice('正在查询并关注...');
      try {
        const result = await window.lolHelper.match.search({
          name: trimmed,
          region: targetRegion,
          pageSize: 1,
          maxMatches: 1,
        });
        if (result.error || !result.profile.puuid) {
          setNotice(result.error || '没有找到这个账号');
          return;
        }

        const regionLabel = getRegionName(targetRegion || currentRegionKey, targetRegion ? undefined : currentRegionName);
        const saved = await saveMatchesForProfile(
          result.profile,
          targetRegion,
          result.matches,
          regionLabel,
        );
        const state = await setSavedMatchAccountFollow(saved.id, true);
        setAccounts(state.accounts);
        setAlerts(state.followAlerts ?? []);
        setRiotId('');
        setNotice(`已关注 ${result.profile.riotId || trimmed}`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error));
      } finally {
        setFollowing(false);
      }
    },
    [currentRegionKey, currentRegionName],
  );

  const unfollowAccount = async (accountId: string) => {
    const state = await setSavedMatchAccountFollow(accountId, false);
    setAccounts(state.accounts);
    setAlerts(state.followAlerts ?? []);
    setNotice('已取消关注');
  };

  useEffect(() => {
    if (!open) return;
    setNotice('');
    setRegion(currentRegionKey || '');
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
  }, [currentRegionKey, open, refresh]);

  useEffect(() => {
    if (!open || !request || handledRequestNonceRef.current === request.nonce) return;
    handledRequestNonceRef.current = request.nonce;
    const nextRegion = request.region ?? currentRegionKey ?? '';
    setRegion(nextRegion);
    setRiotId(request.riotId);
    void followRiotId(request.riotId, nextRegion);
  }, [currentRegionKey, followRiotId, open, request]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 [-webkit-app-region:no-drag]"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="relative flex h-[640px] w-[920px] flex-col overflow-hidden rounded-xl border border-app-border bg-app-bg shadow-airbnb">
        <div className="flex shrink-0 items-center gap-3 border-b border-app-border bg-gradient-to-r from-app-primary-soft/70 via-app-surface to-app-surface px-5 py-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-white text-app-primary shadow-sm">
            <Bell className="size-4.5 fill-app-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-app-text">关注账号</div>
          </div>
          {notice && <span className="max-w-72 truncate rounded-full bg-white/85 px-3 py-1 text-xs text-app-primary shadow-sm">{notice}</span>}
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

        <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r border-app-border bg-app-bg-soft p-3">
            <form
              className="flex h-10 shrink-0 items-stretch overflow-hidden rounded-md border border-app-border bg-app-surface shadow-sm transition-colors focus-within:border-app-primary"
              onSubmit={(event) => {
                event.preventDefault();
                void followRiotId(riotId, region);
              }}
            >
              <div className="relative w-[94px] shrink-0 border-r border-app-border bg-app-bg-soft/60">
                <select
                  value={region}
                  onChange={(event) => setRegion(event.target.value)}
                  className="h-full w-full appearance-none bg-transparent pl-3 pr-7 text-xs text-app-text outline-none"
                  aria-label="大区"
                >
                  {regionOptions.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-app-subtle" />
              </div>
              <input
                value={riotId}
                onChange={(event) => setRiotId(event.target.value)}
                placeholder="名字#编号"
                className="min-w-0 flex-1 bg-transparent px-3 text-xs text-app-text outline-none placeholder:text-app-muted"
                aria-label="Riot ID"
              />
              <button
                type="submit"
                disabled={following}
                className="flex w-10 shrink-0 items-center justify-center bg-app-primary text-white transition-colors hover:bg-app-primary-hover disabled:opacity-60"
                title="关注"
                aria-label="关注"
              >
                <Search className="size-4" />
              </button>
            </form>

            <div className="mt-2.5 flex items-center justify-between px-1 text-xs">
              <span className="font-semibold text-app-text">已关注</span>
              <span className="text-app-muted">{followedAccounts.length}</span>
            </div>
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto space-y-2 pr-1">
              {followedAccounts.length > 0 ? (
                followedAccounts.map((account) => (
                  <FollowAccountCard
                    key={account.id}
                    account={account}
                    onUnfollow={() => void unfollowAccount(account.id)}
                  />
                ))
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-app-border bg-app-surface px-3 text-center text-xs text-app-muted">
                  暂无关注
                </div>
              )}
            </div>
          </aside>

          <main className="min-h-0 overflow-y-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-app-text">新战绩</div>
              {alerts.length > 0 && (
                <span className="rounded-full bg-app-primary-soft px-2.5 py-1 text-xs font-semibold text-app-primary">
                  {alerts.length}
                </span>
              )}
            </div>

            {alerts.length > 0 ? (
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <FollowAlertRow key={alert.id} alert={alert} championMap={championMap} />
                ))}
              </div>
            ) : (
              <div className="flex h-[440px] items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-app-muted">
                  <div className="flex size-10 items-center justify-center rounded-full bg-app-primary-soft/70 text-app-primary/70">
                    <Bell className="size-4" />
                  </div>
                  <span className="text-xs">暂无新战绩</span>
                </div>
              </div>
            )}
          </main>
        </div>
      </section>
    </div>
  );
}

function FollowAccountCard({
  account,
  onUnfollow,
}: {
  account: SavedMatchAccount;
  onUnfollow: () => void;
}) {
  const match = latestMatch(account);
  const latestGameText = match ? ` · 最近游戏 ${formatFullTime(match.gameCreation)}` : '';
  return (
    <div className="rounded-xl border border-app-border bg-app-surface p-2.5 shadow-sm">
      <div className="flex items-center gap-2">
        <ProfileIcon
          iconId={account.profile.profileIconId}
          src={account.profile.profileIconUrl}
          alt={getDisplayName(account.profile.riotId)}
          size={34}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-app-text">{account.profile.riotId}</div>
          <div className="mt-0.5 truncate text-[10px] text-app-muted">
            {getRegionName(account.region, account.regionName)}{latestGameText}
          </div>
        </div>
        <button
          type="button"
          onClick={onUnfollow}
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-app-subtle transition-colors hover:bg-app-danger/10 hover:text-app-danger"
          title="取消关注"
          aria-label="取消关注"
        >
          <Bell className="size-3.5 fill-app-primary text-app-primary" />
        </button>
      </div>
      {account.follow?.lastError && (
        <div className="mt-2 truncate text-[10px] text-app-danger">{account.follow.lastError}</div>
      )}
    </div>
  );
}

function FollowAlertRow({
  alert,
  championMap,
}: {
  alert: SavedMatchFollowAlert;
  championMap: Map<number, ChampionSummary>;
}) {
  const match = alert.match;
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_94px_88px] items-center gap-3 rounded-xl px-3 py-2.5 shadow-sm ring-1 ${
        match.win
          ? 'bg-app-win-bg/35 ring-app-win-border'
          : 'bg-app-loss-bg/35 ring-app-loss-border'
      }`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <ProfileIcon
          iconId={alert.profileIconId}
          src={alert.profileIconUrl}
          alt={getDisplayName(alert.riotId)}
          size={34}
        />
        <GameIcon src={match.championAvatar} alt={getChampionName(match, championMap)} size={32} rounded />
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-app-text">
            {alert.riotId}
            <span className="ml-1.5 text-app-primary">{match.win ? '胜利' : '失败'}</span>
            <span className="ml-1.5 text-app-muted">{getChampionName(match, championMap)}</span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-app-muted">
            {getRegionName(alert.region, alert.regionName)} · {match.queueName || '未知模式'} · {formatFullTime(match.gameCreation)}
          </div>
        </div>
      </div>
      <div className="text-right text-xs font-semibold tabular-nums text-app-text">
        {match.kills} / {match.deaths} / {match.assists}
        <div className="text-[10px] font-normal text-app-muted">{match.kda.toFixed(2)} KDA</div>
      </div>
      <div className="text-right text-xs font-semibold tabular-nums text-app-text">
        {formatRecentAge(match.gameCreation)}
        <div className="text-[10px] font-normal text-app-muted">检测 {formatRecentAge(alert.detectedAt)}</div>
      </div>
    </div>
  );
}
