import { useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  BookmarkCheck,
  ChartNoAxesColumnIncreasing,
  History,
  Home,
  MailPlus,
  MessageCircleMore,
  ScanSearch,
  Settings,
  Users,
  Wrench,
} from 'lucide-react';
import { APP_LAYOUT } from '../../shared/constants';
import type { ScoutHit, ScoutPlayerEvent, ScoutProgress } from '../../shared/api';
import { ProfileIcon } from './ProfileIcon';
import { GameIcon } from './match/GameIcon';

// 视图标识：每加一个页面，这里加一个值，并在 App.tsx 的页面映射里对应。
export type View = 'home' | 'matches' | 'live' | 'scout' | 'ranking' | 'assist';

const NAV_ITEMS = [
  { view: 'home', label: '概览', title: '主页概览', icon: Home },
  { view: 'matches', label: '战绩', title: '历史战绩', icon: History },
  { view: 'live', label: '实时', title: '实时对局', icon: Activity },
  { view: 'scout', label: '雷达', title: '高手雷达', icon: ScanSearch },
  { view: 'ranking', label: '排行', title: '英雄排行', icon: ChartNoAxesColumnIncreasing },
  { view: 'assist', label: '工具', title: '辅助功能', icon: Wrench },
] as const;

export interface ScoutSidebarStatus {
  running: boolean;
  progress: ScoutProgress | null;
  hits: ScoutHit[];
  targetCount: number;
  region?: string;
  startedAt?: number | null;
  finishedAt?: number | null;
}

interface AppShellProps {
  title: string;
  activeView: View;
  onNavigate: (view: View) => void; // 点击导航项回调
  children: React.ReactNode; // 主工作区内容
  fullBleed?: boolean;
  headerExtra?: React.ReactNode;
  friendPanelHidden?: boolean; // 好友栏是否隐藏
  onToggleFriendPanel?: () => void; // 展开/隐藏好友栏
  chatSessionsOpen?: boolean; // 会话管理窗口是否打开
  savedMatchesOpen?: boolean;
  followAccountsOpen?: boolean;
  friendManagerOpen?: boolean;
  friendRequestAlertCount?: number;
  followAlertCount?: number;
  onOpenSavedMatches?: () => void;
  onOpenFollowAccounts?: () => void;
  onOpenChatSessions?: () => void; // 打开会话管理窗口
  onOpenFriendManager?: () => void;
  friendPanel?: React.ReactNode; // 常驻右侧好友栏
  onOpenSettings?: () => void; // 打开设置窗口
  settingsOpen?: boolean;
  scoutStatus?: ScoutSidebarStatus | null;
  onScoutPlayerSearch?: (name: string, region?: string) => void;
  onScoutStatusClick?: () => void;
}

function getScoutHitRiotId(hit: ScoutHit | null | undefined): string {
  return hit?.profile.riotId?.trim() || '';
}

function getScoutHitDisplayName(hit: ScoutHit | null | undefined): string {
  const riotId = getScoutHitRiotId(hit);
  return riotId.split('#')[0] || riotId || '搜寻中';
}

function getScoutPlayerRiotId(player: ScoutPlayerEvent | null | undefined): string {
  return player?.profile?.riotId?.trim() || '';
}

function getScoutPlayerDisplayName(player: ScoutPlayerEvent | null | undefined): string {
  const riotId = getScoutPlayerRiotId(player);
  return riotId.split('#')[0] || riotId || '搜寻中';
}

function formatScoutElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

function SidebarScoutStatus({
  status,
  collapsed,
  onPlayerSearch,
  onRestore,
}: {
  status?: ScoutSidebarStatus | null;
  collapsed: boolean;
  onPlayerSearch?: (name: string, region?: string) => void;
  onRestore?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!status?.running) {
      setNow(Date.now());
      return undefined;
    }

    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status?.running, status?.startedAt]);

  if (!status || (!status.running && !status.progress && status.hits.length === 0)) return null;

  const latestHit = status.progress?.latestHit ?? status.hits[status.hits.length - 1] ?? null;
  const latestPlayer = status.progress?.latestPlayer ?? null;
  const latestProfile = latestHit?.profile ?? null;
  const latestChampionAvatar = latestPlayer?.recentChampionAvatar || '';
  const latestChampionName = latestPlayer?.recentChampionName || '最近英雄';
  const latestRiotId = getScoutHitRiotId(latestHit) || getScoutPlayerRiotId(latestPlayer);
  const latestMatch = latestHit?.qualifyingMatches[0];
  const latestScore = latestMatch
    ? `${latestMatch.kills}/${latestMatch.deaths}/${latestMatch.assists}`
    : latestPlayer?.recentKills !== undefined &&
        latestPlayer.recentDeaths !== undefined &&
        latestPlayer.recentAssists !== undefined
      ? `${latestPlayer.recentKills}/${latestPlayer.recentDeaths}/${latestPlayer.recentAssists}`
      : '';
  const foundCount = status.hits.length;
  const elapsedMs = status.startedAt
    ? Math.max(0, (status.running ? now : (status.finishedAt ?? now)) - status.startedAt)
    : 0;
  const elapsedText = formatScoutElapsed(elapsedMs);
  const statusText = status.running
    ? '搜索中'
    : status.progress?.phase === 'aborted'
      ? '已取消'
      : status.progress?.phase === 'error'
        ? '异常'
        : '已完成';
  const canOpenLatest = Boolean(latestRiotId && onPlayerSearch);
  const openLatest = () => {
    if (onRestore) {
      onRestore();
      return;
    }
    if (!canOpenLatest) return;
    onPlayerSearch?.(latestRiotId, status.region);
  };
  const displayName = latestHit
    ? getScoutHitDisplayName(latestHit)
    : latestPlayer?.profile
      ? getScoutPlayerDisplayName(latestPlayer)
    : status.running
      ? '正在搜寻高手'
      : '暂无命中';

  if (collapsed) {
    return (
      <div className="flex justify-center px-2 pt-2">
        <button
          type="button"
          onClick={openLatest}
          disabled={!canOpenLatest && !onRestore}
          title={`高手雷达：${statusText}，已找到 ${foundCount} 人${latestRiotId ? `，最新 ${latestRiotId}` : ''}`}
          className={`sidebar-scout-compact ${status.running ? 'sidebar-scout-compact--running' : ''}`}
        >
          <span className="sidebar-scout-compact__pulse" aria-hidden="true" />
          {latestProfile ? (
            <ProfileIcon
              iconId={latestProfile.profileIconId}
              src={latestProfile.profileIconUrl}
              alt={displayName}
              size={30}
              className="relative z-10 ring-2 ring-white"
            />
          ) : latestChampionAvatar ? (
            <GameIcon
              src={latestChampionAvatar}
              alt={latestChampionName}
              size={30}
              rounded
              className="relative z-10 ring-2 ring-white"
            />
          ) : (
            <span className="sidebar-scout-orb sidebar-scout-orb--compact" aria-hidden="true" />
          )}
          {foundCount > 0 && <span className="sidebar-scout-compact__badge">{foundCount}</span>}
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section className={`sidebar-scout-card shrink-0 ${status.running ? 'sidebar-scout-card--running' : ''}`}>
        <button
          type="button"
          onClick={openLatest}
          disabled={!canOpenLatest && !onRestore}
          className="sidebar-scout-player"
        >
          <span className="sidebar-scout-avatar">
            {latestProfile ? (
              <ProfileIcon
                iconId={latestProfile.profileIconId}
                src={latestProfile.profileIconUrl}
                alt={displayName}
                size={34}
                className="sidebar-scout-avatar__image"
              />
            ) : latestChampionAvatar ? (
              <GameIcon
                src={latestChampionAvatar}
                alt={latestChampionName}
                size={34}
                rounded
                className="sidebar-scout-avatar__image"
              />
            ) : (
              <span className="sidebar-scout-orb" aria-hidden="true" />
            )}
            {status.running && <span className="sidebar-scout-avatar__live" />}
          </span>
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-xs font-semibold text-app-text">
              {displayName}
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] text-app-muted">
              {latestMatch || latestPlayer?.recentChampionAvatar ? (
                <>
                  <GameIcon
                    src={latestMatch?.championAvatar || latestPlayer?.recentChampionAvatar || ''}
                    alt={latestMatch?.championName || latestPlayer?.recentChampionName || '最近英雄'}
                    size={14}
                    rounded
                  />
                  <span className="truncate">
                    {latestMatch?.championName || latestPlayer?.recentChampionName || '正在检查'}
                  </span>
                  <span className="sidebar-scout-score">{latestScore}</span>
                </>
              ) : (
                <span>{status.running ? '实时筛选达标对局' : '命中后显示最新玩家'}</span>
              )}
            </div>
          </div>
        </button>

        <div className="sidebar-scout-foot">
          <span>已找到 <b>{foundCount}</b></span>
          <span>计时 <b>{elapsedText}</b></span>
        </div>
      </section>

      {status.hits.length > 0 && (
        <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden border-t border-app-border/70 pt-2">
          <div className="app-eyebrow flex h-6 shrink-0 items-center justify-between px-1">
            <span>( 已找到的高手 )</span>
            <span>{status.hits.length}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
            {[...status.hits].reverse().map((hit) => {
              const riotId = getScoutHitRiotId(hit);
              const match = hit.qualifyingMatches[0];
              const score = match ? `${match.kills}/${match.deaths}/${match.assists}` : '';
              return (
                <button
                  key={hit.profile.puuid || riotId}
                  type="button"
                  disabled={!riotId || !onPlayerSearch}
                  onClick={() => onPlayerSearch?.(riotId, status.region)}
                  title={riotId ? `查看 ${riotId} 的战绩` : undefined}
                  className="group flex h-11 w-full min-w-0 items-center gap-2 rounded-sm px-1.5 text-left transition-colors hover:bg-app-nav-hover disabled:cursor-default"
                >
                  <ProfileIcon
                    iconId={hit.profile.profileIconId}
                    src={hit.profile.profileIconUrl}
                    alt={riotId || '高手'}
                    size={28}
                    className="ring-1 ring-app-border"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-semibold text-app-text group-hover:text-app-primary">
                      {getScoutHitDisplayName(hit)}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-app-muted">
                      <span>{hit.qualifyingMatches.length} 场达标</span>
                      {score && <span className="font-semibold text-app-primary">{score}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function AppShell({
  title,
  activeView,
  onNavigate,
  children,
  fullBleed = false,
  headerExtra,
  friendPanelHidden = false,
  onToggleFriendPanel,
  chatSessionsOpen = false,
  savedMatchesOpen = false,
  followAccountsOpen = false,
  friendManagerOpen = false,
  friendRequestAlertCount = 0,
  followAlertCount = 0,
  onOpenSavedMatches,
  onOpenFollowAccounts,
  onOpenChatSessions,
  onOpenFriendManager,
  friendPanel,
  onOpenSettings,
  settingsOpen = false,
  scoutStatus,
  onScoutPlayerSearch,
  onScoutStatusClick,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const effectiveCollapsed = collapsed;
  const sidebarWidth = effectiveCollapsed
    ? APP_LAYOUT.collapsedSidebarWidth
    : APP_LAYOUT.expandedSidebarWidth;
  const workspaceWidth = APP_LAYOUT.workspaceWidth - sidebarWidth;
  const toggleSidebar = () => setCollapsed((value) => !value);

  return (
    <div className="app-shell">
      <aside
        className="app-shell-sidebar"
        data-collapsed={effectiveCollapsed ? 'true' : 'false'}
        style={{ width: `${sidebarWidth}px` }}
      >
        <div className="app-shell-drag-region" aria-hidden="true" />
        <div className="app-shell-brand-row">
          <button
            onClick={toggleSidebar}
            title={effectiveCollapsed ? '展开侧边栏' : '折叠侧边栏'}
            aria-label={effectiveCollapsed ? '展开侧边栏' : '折叠侧边栏'}
            className="app-shell-brand"
          >
            <span className="app-shell-brand-mark" aria-hidden="true">L</span>
            {!effectiveCollapsed && (
              <span className="app-shell-brand-copy">
                <span className="app-shell-brand-title">LOL 助手</span>
              </span>
            )}
          </button>
        </div>

        <nav className="app-shell-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.view;
            return (
              <button
                key={item.view}
                type="button"
                onClick={() => onNavigate(item.view)}
                title={effectiveCollapsed ? item.title : undefined}
                aria-label={item.title}
                aria-current={active ? 'page' : undefined}
                data-active={active ? 'true' : 'false'}
                className="app-shell-nav-item"
              >
                <Icon className="app-shell-nav-icon" />
                {!effectiveCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
          <SidebarScoutStatus
            status={scoutStatus}
            collapsed={effectiveCollapsed}
            onPlayerSearch={onScoutPlayerSearch}
            onRestore={onScoutStatusClick}
          />
        </nav>

        <div className="app-shell-sidebar-footer">
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              title={effectiveCollapsed ? '设置' : undefined}
              data-active={settingsOpen ? 'true' : 'false'}
              className="app-shell-nav-item"
            >
              <Settings className="app-shell-nav-icon" />
              {!effectiveCollapsed && <span className="truncate">设置</span>}
            </button>
          )}
        </div>
      </aside>

      <div className="app-shell-workspace" style={{ width: `${workspaceWidth}px` }}>
        <header className={`app-shell-header ${friendPanelHidden ? 'app-shell-header--friend-hidden' : ''}`}>
          {headerExtra ? (
            <div className="[-webkit-app-region:no-drag]">{headerExtra}</div>
          ) : (
            <span className="app-shell-header-title">{title}</span>
          )}
          {(onOpenSavedMatches || onOpenFollowAccounts || onOpenChatSessions || onOpenFriendManager || onToggleFriendPanel) && (
            <div className="app-shell-header-actions">
              {onOpenSavedMatches && (
                <button
                  type="button"
                  onClick={onOpenSavedMatches}
                  data-active={savedMatchesOpen ? 'true' : 'false'}
                  className="app-shell-icon-action"
                  title="保存的战绩"
                  aria-label="保存的战绩"
                >
                  <BookmarkCheck className="size-4" />
                </button>
              )}
              {onOpenFollowAccounts && (
                <button
                  type="button"
                  onClick={onOpenFollowAccounts}
                  data-active={followAccountsOpen ? 'true' : 'false'}
                  className="app-shell-icon-action"
                  title="关注账号"
                  aria-label="关注账号"
                >
                  <Bell className="size-4" />
                  {followAlertCount > 0 && (
                    <span className="app-shell-alert-badge">
                      {followAlertCount > 99 ? '99+' : followAlertCount}
                    </span>
                  )}
                </button>
              )}
              {onOpenChatSessions && (
                <button
                  type="button"
                  onClick={onOpenChatSessions}
                  data-active={chatSessionsOpen ? 'true' : 'false'}
                  className="app-shell-icon-action"
                  title="会话管理"
                  aria-label="会话管理"
                >
                  <MessageCircleMore className="size-4" />
                </button>
              )}
              {onOpenFriendManager && (
                <button
                  type="button"
                  onClick={onOpenFriendManager}
                  data-active={friendManagerOpen ? 'true' : 'false'}
                  className="app-shell-icon-action"
                  title="好友申请"
                  aria-label="好友申请"
                >
                  <MailPlus className="size-4" />
                  {friendRequestAlertCount > 0 && (
                    <span className="app-shell-alert-badge">
                      {friendRequestAlertCount > 99 ? '99+' : friendRequestAlertCount}
                    </span>
                  )}
                </button>
              )}
              {onToggleFriendPanel && (
                <button
                  type="button"
                  onClick={onToggleFriendPanel}
                  data-active={friendPanelHidden ? 'false' : 'true'}
                  className="app-shell-icon-action"
                  title={friendPanelHidden ? '展开好友栏' : '隐藏好友栏'}
                  aria-label={friendPanelHidden ? '展开好友栏' : '隐藏好友栏'}
                >
                  <Users className="size-4" />
                </button>
              )}
            </div>
          )}
        </header>

        <section className="app-shell-frame">
          <main className={`app-shell-main ${fullBleed ? '' : 'p-8'}`}>
            <div className={fullBleed ? 'h-full' : 'mx-auto max-w-5xl'}>{children}</div>
          </main>
        </section>
      </div>

      {friendPanel && (
        <aside
          className={`friend-panel-column ${
            friendPanelHidden ? 'friend-panel-column--hidden' : ''
          }`}
        >
          {friendPanel}
        </aside>
      )}
    </div>
  );
}
