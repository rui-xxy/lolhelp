import { useEffect, useState } from 'react';
import {
  Bell,
  Crosshair,
  BookmarkCheck,
  Home,
  MessageCircleMore,
  PanelLeft,
  Radar,
  Settings,
  Sparkles,
  Swords,
  Users,
} from 'lucide-react';
import { APP_LAYOUT } from '../../shared/constants';
import type { ScoutHit, ScoutProgress } from '../../shared/api';
import { ProfileIcon } from './ProfileIcon';
import { GameIcon } from './match/GameIcon';

// 视图标识：每加一个页面，这里加一个值，并在 App.tsx 的页面映射里对应。
export type View = 'home' | 'matches' | 'live' | 'scout' | 'assist';

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
  title: string; // 右侧顶部页面标题（占位）
  onNavigate: (view: View) => void; // 点击导航项回调
  children: React.ReactNode; // 主工作区内容
  fullBleed?: boolean; // true=主区不加 max-w/padding，由内容自己管布局
  headerExtra?: React.ReactNode; // 顶部标题区右侧自定义内容（如战绩页搜索框）
  friendPanelHidden?: boolean; // 好友栏是否隐藏
  onToggleFriendPanel?: () => void; // 展开/隐藏好友栏
  chatSessionsOpen?: boolean; // 会话管理窗口是否打开
  savedMatchesOpen?: boolean;
  followAccountsOpen?: boolean;
  followAlertCount?: number;
  onOpenSavedMatches?: () => void;
  onOpenFollowAccounts?: () => void;
  onOpenChatSessions?: () => void; // 打开会话管理窗口
  friendPanel?: React.ReactNode; // 常驻右侧好友栏
  onOpenSettings?: () => void; // 打开设置窗口
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
  const latestRiotId = getScoutHitRiotId(latestHit);
  const latestMatch = latestHit?.qualifyingMatches[0];
  const latestScore = latestMatch
    ? `${latestMatch.kills}/${latestMatch.deaths}/${latestMatch.assists}`
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
          {latestHit ? (
            <ProfileIcon
              iconId={latestHit.profile.profileIconId}
              src={latestHit.profile.profileIconUrl}
              alt={getScoutHitDisplayName(latestHit)}
              size={30}
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
    <section className={`sidebar-scout-card ${status.running ? 'sidebar-scout-card--running' : ''}`}>
      <button
        type="button"
        onClick={openLatest}
        disabled={!canOpenLatest && !onRestore}
        className="sidebar-scout-player"
      >
        <span className="sidebar-scout-avatar">
          {latestHit ? (
            <ProfileIcon
              iconId={latestHit.profile.profileIconId}
              src={latestHit.profile.profileIconUrl}
              alt={getScoutHitDisplayName(latestHit)}
              size={34}
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
            {latestMatch ? (
              <>
                <GameIcon src={latestMatch.championAvatar} alt={latestMatch.championName} size={14} rounded />
                <span className="truncate">{latestMatch.championName}</span>
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
  );
}

// 应用外壳：左右分栏 + 自定义顶部标题栏（系统标题栏已隐藏，原生窗口控制按钮由 titleBarOverlay 保留）。
// 折叠状态是布局状态（非业务数据），故 useState 放这里。
//
// 折叠交互：唯一入口在左上角 Logo 区。
// - 默认展开：显示 Logo 色块 + "LOL助手"
// - hover：Logo 色块切换成 PanelLeft 图标 + hover 态 + tooltip "切换侧边栏"
// - 折叠后：只留 Logo 区（窄栏），hover 同样切换图标
//
// 颜色分区：
// - 左侧侧边栏（含左顶部）：app-sidebar 略深略灰暖米色
// - 右侧主工作区（含右顶部）：app-surface 暖白，主内容区带网格纹理
// - 右上角 titleBarOverlay 区（约 138px）保留给原生窗口控制按钮
export function AppShell({
  title,
  onNavigate,
  children,
  fullBleed = false,
  headerExtra,
  friendPanelHidden = false,
  onToggleFriendPanel,
  chatSessionsOpen = false,
  savedMatchesOpen = false,
  followAccountsOpen = false,
  followAlertCount = 0,
  onOpenSavedMatches,
  onOpenFollowAccounts,
  onOpenChatSessions,
  friendPanel,
  onOpenSettings,
  scoutStatus,
  onScoutPlayerSearch,
  onScoutStatusClick,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const sidebarWidth = collapsed
    ? APP_LAYOUT.collapsedSidebarWidth
    : APP_LAYOUT.expandedSidebarWidth;
  const workspaceWidth = APP_LAYOUT.workspaceWidth - sidebarWidth;

  return (
    <div className="flex h-screen overflow-hidden bg-app-bg text-app-text">
      {/* ===== 左侧侧边栏（三段式：顶/中/底）===== */}
      <aside
        className={`flex shrink-0 flex-col border-r border-app-border bg-app-sidebar transition-[width] duration-200 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        {/* 顶部：Logo 区容器可拖拽移动窗口，里面的 button 设 no-drag 保证点击折叠有效。
            是侧边栏折叠/展开的唯一入口。
            默认显示 Logo 色块；hover 时色块切换成 PanelLeft 图标。 */}
        <div className="flex h-12 shrink-0 [-webkit-app-region:drag]">
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? '展开侧边栏' : '折叠侧边栏'}
            aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
            className="group flex h-12 w-full items-center gap-2 border-b border-app-border px-3 text-left transition-colors [-webkit-app-region:no-drag] hover:bg-app-surface-soft"
          >
            {/* Logo 区：默认显示色块，hover 时切换为 PanelLeft 图标（两者同尺寸，叠放） */}
            <span className="relative flex size-7 shrink-0 items-center justify-center">
              <span className="absolute inset-0 rounded-sm bg-app-primary transition-opacity group-hover:opacity-0" />
              <PanelLeft className="size-4 text-app-text opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
            {!collapsed && (
              <span className="truncate text-sm font-semibold">LOL助手</span>
            )}
          </button>
        </div>

        {/* 中间：导航区。折叠时只显图标，展开时图标+文本。
            只有鼠标 hover 才显示浅灰高亮 + 文字加深；当前页不特殊标记。 */}
        <nav className="flex-1 overflow-hidden p-2">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('home');
            }}
            title={collapsed ? '主页' : undefined}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-app-muted transition-colors hover:bg-app-nav-hover hover:text-app-text"
          >
            <Home className="size-4 shrink-0" />
            {!collapsed && <span className="truncate">主页</span>}
          </a>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('matches');
            }}
            title={collapsed ? '战绩' : undefined}
            className="mt-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-app-muted transition-colors hover:bg-app-nav-hover hover:text-app-text"
          >
            <Swords className="size-4 shrink-0" />
            {!collapsed && <span className="truncate">战绩</span>}
          </a>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('live');
            }}
            title={collapsed ? '实时对局' : undefined}
            className="mt-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-app-muted transition-colors hover:bg-app-nav-hover hover:text-app-text"
          >
            <Radar className="size-4 shrink-0" />
            {!collapsed && <span className="truncate">实时对局</span>}
          </a>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('scout');
            }}
            title={collapsed ? '高手雷达' : undefined}
            className="mt-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-app-muted transition-colors hover:bg-app-nav-hover hover:text-app-text"
          >
            <Crosshair className="size-4 shrink-0" />
            {!collapsed && <span className="truncate">高手雷达</span>}
          </a>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('assist');
            }}
            title={collapsed ? '辅助功能' : undefined}
            className="mt-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-app-muted transition-colors hover:bg-app-nav-hover hover:text-app-text"
          >
            <Sparkles className="size-4 shrink-0" />
            {!collapsed && <span className="truncate">辅助功能</span>}
          </a>
          <SidebarScoutStatus
            status={scoutStatus}
            collapsed={collapsed}
            onPlayerSearch={onScoutPlayerSearch}
            onRestore={onScoutStatusClick}
          />
        </nav>

        {/* 底部：设置入口与状态区 */}
        <div className="shrink-0 border-t border-app-border p-2">
          {onOpenSettings && (
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onOpenSettings();
              }}
              title={collapsed ? '设置' : undefined}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-app-muted transition-colors hover:bg-app-nav-hover hover:text-app-text"
            >
              <Settings className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">设置</span>}
            </a>
          )}
          {!collapsed && (
            <p className="mt-2 border-t border-app-border px-3 pt-2 text-xs text-app-subtle">
              状态 · 待填充
            </p>
          )}
        </div>
      </aside>

      {/* ===== 右侧主工作区（顶部标题 + 主内容）===== */}
      <div
        className="flex min-w-0 flex-none flex-col"
        style={{ width: `${workspaceWidth}px` }}
      >
        {/* 顶部标题区：延续主工作区背景（app-surface），可拖拽移动窗口。 */}
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-app-border bg-app-surface pr-[138px] pl-4 [-webkit-app-region:drag]">
          {headerExtra ? (
            <div className="[-webkit-app-region:no-drag]">{headerExtra}</div>
          ) : (
            <span className="text-sm font-medium text-app-text">{title}</span>
          )}
          {(onOpenSavedMatches || onOpenFollowAccounts || onOpenChatSessions || onToggleFriendPanel) && (
            <div className="ml-auto flex items-center gap-1 [-webkit-app-region:no-drag]">
              {onOpenSavedMatches && (
                <button
                  type="button"
                  onClick={onOpenSavedMatches}
                  className={`flex size-8 items-center justify-center rounded-sm transition-colors ${
                    savedMatchesOpen
                      ? 'bg-app-surface-soft text-app-primary'
                      : 'text-app-muted hover:bg-app-surface-soft hover:text-app-text'
                  }`}
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
                  className={`relative flex size-8 items-center justify-center rounded-sm transition-colors ${
                    followAccountsOpen
                      ? 'bg-app-surface-soft text-app-primary'
                      : 'text-app-muted hover:bg-app-surface-soft hover:text-app-text'
                  }`}
                  title="关注账号"
                  aria-label="关注账号"
                >
                  <Bell className="size-4" />
                  {followAlertCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-app-primary px-1 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-app-surface">
                      {followAlertCount > 99 ? '99+' : followAlertCount}
                    </span>
                  )}
                </button>
              )}
              {onOpenChatSessions && (
                <button
                  type="button"
                  onClick={onOpenChatSessions}
                  className={`flex size-8 items-center justify-center rounded-sm transition-colors ${
                    chatSessionsOpen
                      ? 'bg-app-surface-soft text-app-primary'
                      : 'text-app-muted hover:bg-app-surface-soft hover:text-app-text'
                  }`}
                  title="会话管理"
                  aria-label="会话管理"
                >
                  <MessageCircleMore className="size-4" />
                </button>
              )}
              {onToggleFriendPanel && (
                <button
                  type="button"
                  onClick={onToggleFriendPanel}
                  className={`flex size-8 items-center justify-center rounded-sm transition-colors ${
                    friendPanelHidden
                      ? 'text-app-muted hover:bg-app-surface-soft hover:text-app-text'
                      : 'bg-app-surface-soft text-app-primary hover:bg-app-nav-hover'
                  }`}
                  title={friendPanelHidden ? '展开好友栏' : '隐藏好友栏'}
                  aria-label={friendPanelHidden ? '展开好友栏' : '隐藏好友栏'}
                >
                  <Users className="size-4" />
                </button>
              )}
            </div>
          )}
        </header>

        {/* 主内容区：纯白 canvas（Airbnb 风格，无网格背景），承载功能模块。
            fullBleed=true 时不加 max-w/padding，由内容自己管布局（战绩页双栏全宽）。
            fullBleed=false（默认）时 max-w-5xl 居中。 */}
        <main className={`flex-1 overflow-y-auto bg-app-bg ${fullBleed ? '' : 'p-8'}`}>
          <div className={fullBleed ? 'h-full' : 'mx-auto max-w-5xl'}>{children}</div>
        </main>
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
