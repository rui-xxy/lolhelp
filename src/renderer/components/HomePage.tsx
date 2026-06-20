import { LcuConnectionCard } from './LcuConnectionCard';

// 主页：应用默认视图。当前放 LCU 连通验证卡，后续填充真实首页内容
// （如 LCU 状态概览、当前召唤师、最近对局、快捷入口等）。
export function HomePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">主页</h1>
      <LcuConnectionCard />
    </div>
  );
}
