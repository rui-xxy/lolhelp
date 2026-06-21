import { useState } from 'react';
import { PanelLeft, Home, Swords, Users } from 'lucide-react';

// 视图标识：每加一个页面，这里加一个值，并在 App.tsx 的页面映射里对应。
export type View = 'home' | 'matches';

interface AppShellProps {
  title: string; // 右侧顶部页面标题（占位）
  activeView: View; // 当前激活的视图（用于导航项高亮）
  onNavigate: (view: View) => void; // 点击导航项回调
  children: React.ReactNode; // 主工作区内容
  fullBleed?: boolean; // true=主区不加 max-w/padding，由内容自己管布局
  headerExtra?: React.ReactNode; // 顶部标题区右侧自定义内容（如战绩页搜索框）
  onFriendClick: (riotId: string) => void; // 点击好友查战绩
  friendPanel?: React.ReactNode; // 右侧好友面板内容（可选，不传则不显示栏）
  showFriendPanel: boolean; // 好友面板是否展开
  onToggleFriendPanel: () => void; // 切换好友面板显隐
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
  activeView,
  onNavigate,
  children,
  fullBleed = false,
  headerExtra,
  onFriendClick,
  friendPanel,
  showFriendPanel,
  onToggleFriendPanel,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  // activeView 暂时只用于潜在的状态追踪，当前页不做视觉标记（仅 hover 高亮）。

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
        </nav>

        {/* 底部：状态占位区 */}
        <div className="shrink-0 border-t border-app-border p-3">
          {!collapsed && <p className="text-xs text-app-subtle">状态 · 待填充</p>}
        </div>
      </aside>

      {/* ===== 右侧主工作区（顶部标题 + 主内容）===== */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 顶部标题区：延续主工作区背景（app-surface）。
            可拖拽移动窗口（-webkit-app-region:drag）。
            右侧 padding 留出 titleBarOverlay 原生控制按钮的空间。 */}
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-app-border bg-app-surface pr-[138px] pl-4 [-webkit-app-region:drag]">
          {headerExtra ? (
            <div className="[-webkit-app-region:no-drag]">{headerExtra}</div>
          ) : (
            <span className="text-sm font-medium text-app-text">{title}</span>
          )}
          {/* 右侧：好友面板开关图标 */}
          <button
            onClick={onToggleFriendPanel}
            className={`relative ml-auto flex size-8 items-center justify-center rounded-sm transition-colors [-webkit-app-region:no-drag] ${
              showFriendPanel
                ? 'bg-app-surface-soft text-app-primary'
                : 'text-app-muted hover:bg-app-surface-soft hover:text-app-text'
            }`}
            title="好友列表"
          >
            <Users className="size-4" />
          </button>
        </header>

        {/* 主内容区：纯白 canvas（Airbnb 风格，无网格背景），承载功能模块。
            fullBleed=true 时不加 max-w/padding，由内容自己管布局（战绩页双栏全宽）。
            fullBleed=false（默认）时 max-w-5xl 居中。 */}
        <main className={`flex-1 overflow-y-auto bg-app-bg ${fullBleed ? '' : 'p-8'}`}>
          <div className={fullBleed ? 'h-full' : 'mx-auto max-w-5xl'}>{children}</div>
        </main>
      </div>

      {/* ===== 右侧好友面板（flex 并排，从战绩区右侧“推出”）=====
          通过 resize 窗口补偿面板宽度，战绩区宽度恒定不被挤压。 */}
      {showFriendPanel && friendPanel && (
        <div className="flex w-72 shrink-0 flex-col border-l border-app-border bg-app-surface">
          {friendPanel}
        </div>
      )}
    </div>
  );
}
