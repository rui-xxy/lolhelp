import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/channels';
import { readLockfile } from '../../lcu/lockfile';
import { LcuClient } from '../../lcu/client';
import { getCurrentRegionFromLog, getSgpAuth } from '../../sgp/auth';
import type { LcuConnection, LcuRegion } from '../../../shared/api';

// 注册 lcu 域 IPC 处理器。
// 当前实现 detect-client：lockfile 读取 + 真实 LCU 请求验证连通。
// 后续 connect/getCurrentSummoner/getLobby/getChampSelectSession 在此追加。
export function registerLcuHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.LCU_DETECT_CLIENT,
    async (): Promise<LcuConnection> => {
      // 1. 读 lockfile（客户端没跑则找不到）
      let creds;
      try {
        creds = readLockfile();
      } catch (err) {
        return {
          found: false,
          connected: false,
          error: `lockfile 解析失败：${err instanceof Error ? err.message : String(err)}`,
        };
      }
      if (!creds) {
        return {
          found: false,
          connected: false,
          error: '未检测到 LOL 客户端（lockfile 不存在或为空）',
        };
      }

      // 2. 用凭证发验证请求（current-summoner 是文档唯一给完整字段的端点）
      try {
        const client = new LcuClient(creds);
        // 国服把召唤师名放在 gameName（displayName 为空），国际服在 displayName。
        // 按 gameName > displayName > name 优先级取第一个非空的。
        const summoner = await client.get<{
          gameName?: string;
          displayName?: string;
          name?: string;
        }>('/lol-summoner/v1/current-summoner');
        const summonerName =
          summoner.gameName || summoner.displayName || summoner.name || '';
        return {
          found: true,
          connected: true,
          summonerName,
        };
      } catch (err) {
        return {
          found: true,
          connected: false,
          error: `连接失败：${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.LCU_GET_CURRENT_REGION,
    async (): Promise<LcuRegion> => {
      const region = getCurrentRegionFromLog();
      if (region) {
        return { key: region.key, name: region.name };
      }

      try {
        const auth = await getSgpAuth();
        return { key: auth.region.key, name: auth.region.name };
      } catch (err) {
        return {
          key: '',
          name: '',
          error: `无法读取当前登录大区：${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  );
}
