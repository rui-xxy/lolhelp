import { registerAppHandlers } from './handlers/app';
import { registerLcuHandlers } from './handlers/lcu';
import { registerDbHandlers } from './handlers/db';

// 统一注册所有 IPC handler。在主进程启动时调用一次。
// 新增功能域时：新建 handlers/<域>.ts 实现 register 函数，然后在这里加一行。
export function registerIpcHandlers(): void {
  registerAppHandlers();
  registerLcuHandlers();
  registerDbHandlers();
}
