import type { LolHelper } from './shared/api';

// 让 renderer 端 window.lolHelper 拿到完整嵌套类型提示。
// preload 通过 contextBridge.exposeInMainWorld('lolHelper', ...) 注入运行时实现。
declare global {
  interface Window {
    lolHelper: LolHelper;
  }
}
