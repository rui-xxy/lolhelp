import { useCallback, useSyncExternalStore } from 'react';

// 高手雷达里的「加好友」：卡片和速览面板共用同一份状态（按 Riot ID），
// 在一处点了，另一处同步显示「发送中 / 已发送」。只在本次运行内记住。

export type FriendRequestState = 'idle' | 'sending' | 'sent' | 'error';

export interface FriendRequestStatus {
  state: FriendRequestState;
  message: string;
}

const IDLE: FriendRequestStatus = { state: 'idle', message: '' };
const ERROR_RESET_MS = 4000;

const statuses = new Map<string, FriendRequestStatus>();
const listeners = new Set<() => void>();

function setStatus(riotId: string, status: FriendRequestStatus) {
  statuses.set(riotId, status);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function sendFriendRequest(riotId: string): Promise<void> {
  const current = statuses.get(riotId);
  if (!riotId || current?.state === 'sending' || current?.state === 'sent') return;
  setStatus(riotId, { state: 'sending', message: '正在发送好友申请…' });
  try {
    const addFriend = window.lolHelper?.lcu?.addFriend;
    if (typeof addFriend !== 'function') throw new Error('当前版本不支持，请重启应用');
    const result = await addFriend(riotId);
    if (result.success) {
      setStatus(riotId, { state: 'sent', message: result.message || '好友申请已发送' });
      window.dispatchEvent(new CustomEvent('lolhelp:friend-requests-changed'));
      return;
    }
    setStatus(riotId, { state: 'error', message: result.message || '发送失败' });
  } catch (err) {
    setStatus(riotId, { state: 'error', message: err instanceof Error ? err.message : String(err) });
  }
  // 失败的几秒后恢复，可以再点一次
  window.setTimeout(() => {
    if (statuses.get(riotId)?.state === 'error') setStatus(riotId, IDLE);
  }, ERROR_RESET_MS);
}

export function useFriendRequest(riotId: string): [FriendRequestStatus, () => void] {
  const status = useSyncExternalStore(subscribe, () => statuses.get(riotId) ?? IDLE);
  const send = useCallback(() => {
    void sendFriendRequest(riotId);
  }, [riotId]);
  return [status, send];
}
