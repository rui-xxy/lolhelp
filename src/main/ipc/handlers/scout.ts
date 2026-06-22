import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '../../../shared/channels';
import {
  createScoutSessionState,
  getScoutSessionKey,
  runScoutSession,
  type ScoutSessionState,
} from '../../scout/scoutEngine';
import { fetchMatchesByPuuid, fetchPlayerRankByPuuid, resolvePuuid } from '../../match/matchService';
import type { ScoutConfig, ScoutResult } from '../../../shared/api';

// 注册 scout 域 IPC 处理器：高手扩散搜索。
//
// find：长任务，用 event.sender（webContents）推送进度（scout:progress），
//       返回最终 ScoutResult。每个 webContents 同时只允许一个任务。
// cancel：按 webContents id 取消正在跑的任务（设置取消标志）。

// 取消标志：webContents.id → 是否已取消
const cancelFlags = new Map<number, boolean>();
const sessions = new Map<number, { key: string; session: ScoutSessionState }>();

export function registerScoutHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.SCOUT_FIND,
    async (event: IpcMainInvokeEvent, config: ScoutConfig): Promise<ScoutResult> => {
      const wcId = event.sender.id;
      // 标记新一轮任务（清除上次的取消标志）
      cancelFlags.set(wcId, false);
      const sessionKey = getScoutSessionKey(config);
      const shouldContinue = (config.excludePuuids?.length ?? 0) > 0;
      let entry = sessions.get(wcId);
      if (!shouldContinue || !entry || entry.key !== sessionKey) {
        entry = { key: sessionKey, session: createScoutSessionState() };
        sessions.set(wcId, entry);
      }

      const result = await runScoutSession({
        config,
        session: entry.session,
        now: Date.now(),
        deps: {
          resolvePuuid: (seedId) => resolvePuuid(seedId, config.region),
          fetchMatches: (puuid, count, tag) =>
            fetchMatchesByPuuid(puuid, count, tag, config.region),
          fetchRank: fetchPlayerRankByPuuid,
        },
        onProgress: (progress) => {
          // 推送给发起方 renderer。webContents 可能已销毁（窗口关闭），加保护。
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC_CHANNELS.SCOUT_PROGRESS, progress);
          }
        },
        shouldCancel: () => cancelFlags.get(wcId) === true,
      });

      // 清理本轮标志
      cancelFlags.delete(wcId);
      if (result.error && !entry.session.initialized) {
        sessions.delete(wcId);
      }
      return result;
    },
  );

  ipcMain.handle(IPC_CHANNELS.SCOUT_CANCEL, async (event: IpcMainInvokeEvent): Promise<void> => {
    cancelFlags.set(event.sender.id, true);
  });
}

// webContents 销毁时清理标志，避免内存泄漏
export function cleanupScoutForWebContents(wcId: number): void {
  cancelFlags.delete(wcId);
  sessions.delete(wcId);
}
