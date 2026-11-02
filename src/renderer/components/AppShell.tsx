import { useEffect, useState, type ReactNode } from 'react';
import {
  Activity,
  BookmarkCheck,
  Bot,
  ChartNoAxesColumnIncreasing,
  History,
  Home,
  MessageCircleMore,
  ScanSearch,
  Settings,
  Users,
} from 'lucide-react';
import { APP_LAYOUT } from '../../shared/constants';
import type { ScoutHit, ScoutProgress } from '../../shared/api';
import { ProfileIcon } from './ProfileIcon';

// 视图标识：每加一个页面，这里加一个值，并在 App.tsx 的页面映射里对应。
export type View = 'home' | 'matches' | 'live' | 'scout' | 'ranking' | 'assist' | 'settings';

const NAV_ITEMS: Array<{ view: View; label: string; title: string; icon: typeof Home }> = [
  { view: 'home', label: '首页', title: '首页', icon: Home },
  { view: 'matches', label: '战绩', title: '战绩查询', icon: History },
  { view: 'live', label: '对局', title: '当前对局', icon: Activity },
  { view: 'scout', label: '雷达', title: '高手雷达', icon: ScanSearch },
  { view: 'ranking', label: '数据', title: '英雄数据', icon: ChartNoAxesColumnIncreasing },
  { view: 'assist', label: '助手', title: '对局助手', icon: Bot },
];

export interface ScoutSidebarStatus {
  running: boolean;
  progress: ScoutProgress | null;
  hits: ScoutHit[];
  targetCount: number;
  region?: string;
  startedAt?: number | null;
  finishedAt?: number | null;
}

export interface ShellConnection {
  connected: boolean;
  label: string;
}

// 顶栏右侧的两个窗口：我的玩家（保存的账号 + 关注动态）、消息（聊天 + 好友申请）。
export interface ShellActions {
  playersOpen: boolean;
  /** 关注动态里还没看过的新对局。 */
  playersCount: number;
  onOpenPlayers: () => void;
  messagesOpen: boolean;
  /** 待处理的好友申请 + 刚通过的好友。 */
  messagesCount: number;
  onOpenMessages: () => void;
}

interface AppShellProps {
  title: string;
  activeView: View;
  onNavigate: (view: View) => void;
  children: ReactNode;
  headerExtra?: ReactNode;
  search?: ReactNode;
  connection: ShellConnection;
  actions: ShellActions;
  friendDrawerOpen: boolean;
  onToggleFriendDrawer: () => void;
  onCloseFriendDrawer: () => void;
  friendPanel?: ReactNode;
  friendOnlineCount?: number;
  scoutStatus?: ScoutSidebarStatus | null;
  onScoutStatusClick?: () => void;
}

function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

function RailScoutStatus({
  status,
  onClick,
}: {
  status: ScoutSidebarStatus;
  onClick?: () => void;
}) {
  const latestHit = status.progress?.latestHit ?? status.hits[status.hits.length - 1] ?? null;
  const latestRiotId = latestHit?.profile.riotId ?? '';
  const stateText = status.running ? '搜索中' : status.progress?.phase === 'error' ? '异常' : '已完成';
  return (
    <button
      type="button"
      onClick={onClick}
      className="shell-scout"
      data-running={status.running ? 'true' : 'false'}
      title={`高手雷达：${stateText}，已找到 ${status.hits.length} 人${latestRiotId ? `，最新 ${latestRiotId}` : ''}`}
      aria-label="回到高手雷达"
    >
      {latestHit ? (
        <ProfileIcon
          iconId={latestHit.profile.profileIconId}
          src={latestHit.profile.profileIconUrl}
          alt={latestRiotId || '最新命中'}
          size={34}
        />
      ) : (
        <ScanSearch className="size-4 text-text-3" />
      )}
      {status.hits.length > 0 && <span className="shell-scout__count">{status.hits.length}</span>}
    </button>
  );
}

function AlertBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="shell-icon-btn__badge">{count > 99 ? '99+' : count}</span>;
}

export function AppShell({
  title,
  activeView,
  onNavigate,
  children,
  headerExtra,
  search,
  connection,
  actions,
  friendDrawerOpen,
  onToggleFriendDrawer,
  onCloseFriendDrawer,
  friendPanel,
  friendOnlineCount,
  scoutStatus,
  onScoutStatusClick,
}: AppShellProps) {
  const windowWidth = useWindowWidth();
  const canDock = windowWidth >= APP_LAYOUT.friendDrawerDockMinWidth;
  const drawerMode = !friendPanel || !friendDrawerOpen ? 'closed' : canDock ? 'docked' : 'overlay';

  useEffect(() => {
    if (drawerMode !== 'overlay') return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseFriendDrawer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerMode, onCloseFriendDrawer]);

  return (
    <div className="shell" data-drawer={drawerMode}>
      <nav className="shell-rail" aria-label="主导航">
        <div className="shell-rail__drag" aria-hidden="true" />
        <span className="shell-rail__logo" aria-hidden="true">L</span>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.view} className="contents">
              <button
                type="button"
                onClick={() => onNavigate(item.view)}
                title={item.title}
                aria-current={activeView === item.view ? 'page' : undefined}
                className="shell-rail__item"
              >
                <Icon />
                {item.label}
              </button>
              {item.view === 'scout' && scoutStatus && (
                <RailScoutStatus status={scoutStatus} onClick={onScoutStatusClick} />
              )}
            </div>
          );
        })}
        <span className="shell-rail__spacer" />
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          title="设置"
          aria-current={activeView === 'settings' ? 'page' : undefined}
          className="shell-rail__item"
        >
          <Settings />
          设置
        </button>
      </nav>

      <div className="shell-main">
        <header className="shell-topbar">
          <span className="shell-topbar__title">{title}</span>
          {headerExtra && <div className="shell-topbar__extra">{headerExtra}</div>}
          <div className="shell-topbar__fill" aria-hidden="true" />
          {search}
          <div className="shell-topbar__fill" aria-hidden="true" />
          <span className="shell-conn" data-connected={connection.connected ? 'true' : 'false'} title={connection.connected ? '已连接英雄联盟客户端' : '未检测到英雄联盟客户端'}>
            <i />
            {connection.label}
          </span>
          <div className="shell-topbar__actions">
            <button
              type="button"
              className="shell-icon-btn"
              data-active={actions.playersOpen ? 'true' : 'false'}
              onClick={actions.onOpenPlayers}
              title={actions.playersCount > 0 ? `我的玩家 · ${actions.playersCount} 条新动态` : '我的玩家：保存的账号与关注动态'}
              aria-label={actions.playersCount > 0 ? `我的玩家，${actions.playersCount} 条新动态` : '我的玩家'}
            >
              <BookmarkCheck />
              <AlertBadge count={actions.playersCount} />
            </button>
            <button
              type="button"
              className="shell-icon-btn"
              data-active={actions.messagesOpen ? 'true' : 'false'}
              onClick={actions.onOpenMessages}
              title={actions.messagesCount > 0 ? `消息 · ${actions.messagesCount} 条好友提醒` : '消息：聊天记录与好友申请'}
              aria-label={actions.messagesCount > 0 ? `消息，${actions.messagesCount} 条好友提醒` : '消息'}
            >
              <MessageCircleMore />
              <AlertBadge count={actions.messagesCount} />
            </button>
            {friendPanel && (
              <button
                type="button"
                className="shell-icon-btn"
                data-active={friendDrawerOpen ? 'true' : 'false'}
                onClick={onToggleFriendDrawer}
                title={friendDrawerOpen ? '隐藏好友栏' : `展开好友栏${friendOnlineCount ? ` · ${friendOnlineCount} 在线` : ''}`}
                aria-label={friendDrawerOpen ? '隐藏好友栏' : '展开好友栏'}
                aria-pressed={friendDrawerOpen}
              >
                <Users />
              </button>
            )}
          </div>
        </header>

        <div className="shell-body">
          <main
            className="shell-page"
            onPointerDown={drawerMode === 'overlay' ? onCloseFriendDrawer : undefined}
          >
            {children}
          </main>
          {friendPanel && (
            <aside className="shell-drawer" aria-label="好友" aria-hidden={drawerMode === 'closed'}>
              {friendPanel}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
