import { contextBridge, ipcRenderer } from 'electron';
import type { LolHelper } from '../shared/api';
import { IPC_CHANNELS } from '../shared/channels';

// 用类型约束实现：确保暴露的 API 与契约 LolHelper 完全一致（多一个少一个都报错）。
// contextIsolation 默认开启，这是 renderer 唯一能接触主进程的合法通路。
// 白名单原则：只暴露下面显式列出的方法，renderer 拿不到 ipcRenderer 本体。
const lolHelper: LolHelper = {
  app: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_STATUS),
  },
  lcu: {
    detectClient: () => ipcRenderer.invoke(IPC_CHANNELS.LCU_DETECT_CLIENT),
  },
  db: {
    // 占位：后续阶段填充
  },
};

contextBridge.exposeInMainWorld('lolHelper', lolHelper);
