// 三端（main / preload / renderer）共享的类型契约。
// 用 import type 引入，编译期擦除，不产生运行时代码，三端独立构建无冲突。

// 主进程返回给渲染进程的应用状态信息
export interface AppStatus {
  appName: string; // 应用名（来自 app.getName()，即 productName）
  appVersion: string; // 应用版本
  electronVersion: string; // Electron 版本
  chromeVersion: string; // Chromium 版本
  nodeVersion: string; // Node 版本
  platform: string; // win32 / darwin / linux
  arch: string; // x64 / arm64
  uptime: number; // 应用已运行秒数
  serverTime: string; // 主进程当前时间（ISO，演示动态数据）
  lcuConnected: boolean; // LCU 客户端连接占位（后续阶段实现）
}

// 按功能域分组的 API 契约。每加一个功能域，这里加一个子 interface。
export interface AppApi {
  getStatus: () => Promise<AppStatus>;
}

// 占位接口：后续阶段接入 LCU 时填充方法签名
// detectClient / connect / getCurrentSummoner / getLobby / getChampSelectSession ...
export interface LcuApi {}

// 占位接口：后续阶段接入本地数据时填充
// getSettings / saveSettings ...
export interface DbApi {}

// preload 暴露给 renderer 的总入口
// （与 contextBridge.exposeInMainWorld 的 key 'lolHelper' 对齐）
export interface LolHelper {
  app: AppApi;
  lcu: LcuApi;
  db: DbApi;
}
