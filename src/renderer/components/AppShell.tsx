import { useState } from 'react';
import { PanelLeft } from 'lucide-react';

interface AppShellProps {
  title: string; // 右侧顶部页面标题（占位）
  children: React.ReactNode; // 主工作区内容
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
export function AppShell({ title, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden text-app-text">
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

        {/* 中间：占位内容区（折叠时空白） */}
        <div className="flex-1 overflow-hidden p-4">
          {!collapsed && (
            <p className="text-xs text-app-subtle">导航区域 · 待填充</p>
          )}
        </div>

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
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-app-border bg-app-surface pr-[138px] pl-4 [-webkit-app-region:drag]">
          <span className="text-sm font-medium text-app-text">{title}</span>
        </header>

        {/* 主内容区：暖白纸感网格背景，承载功能模块。
            max-w-5xl(1024px) 适配横向信息（战绩列表/英雄/装备/KDA 等）。 */}
        <main className="app-grid-bg flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
