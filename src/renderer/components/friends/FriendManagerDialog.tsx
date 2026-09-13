import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock3,
  Inbox,
  MailPlus,
  RefreshCw,
  Send,
  X,
} from 'lucide-react';
import type { FriendRequestInfo } from '../../../shared/api';
import type { FriendAcceptedAlert } from './friendRequestTracking';
import { Button } from '../ui/button';
import { LargeDialog } from '../ui/large-dialog';
import { ProfileIcon } from '../ProfileIcon';

export const FRIENDS_CHANGED_EVENT = 'lolhelp:friends-changed';

interface FriendManagerDialogProps {
  open: boolean;
  onClose: () => void;
  acceptedAlerts?: FriendAcceptedAlert[];
}

function requestRiotId(request: FriendRequestInfo): string {
  return request.gameTag ? `${request.gameName}#${request.gameTag}` : request.gameName;
}

function formatAcceptedAge(timestamp: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function FriendManagerDialog({
  open,
  onClose,
  acceptedAlerts = [],
}: FriendManagerDialogProps) {
  const [requests, setRequests] = useState<FriendRequestInfo[]>([]);
  const [riotId, setRiotId] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await window.lolHelper.lcu.getFriendRequests());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '读取好友申请失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    setNotice('');
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [open, refresh]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 4_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const incomingCount = requests.filter((request) => request.direction !== 'out').length;
  const outgoingCount = requests.length - incomingCount;

  const addFriend = async () => {
    const trimmed = riotId.trim();
    if (!trimmed) {
      setNotice('请输入好友的完整 Riot ID');
      return;
    }
    setBusyKey('add');
    try {
      const result = await window.lolHelper.lcu.addFriend(trimmed);
      setNotice(result.message);
      if (result.success) {
        setRiotId('');
        await refresh();
        window.dispatchEvent(new CustomEvent('lolhelp:friend-requests-changed'));
      }
    } finally {
      setBusyKey('');
    }
  };

  const acceptRequest = async (request: FriendRequestInfo) => {
    setBusyKey(`request:${request.puuid}`);
    try {
      const result = await window.lolHelper.lcu.acceptFriendRequest(request.puuid);
      setNotice(result.message);
      if (result.success) {
        await refresh();
        window.dispatchEvent(new CustomEvent(FRIENDS_CHANGED_EVENT));
      }
    } finally {
      setBusyKey('');
    }
  };

  const removeRequest = async (request: FriendRequestInfo) => {
    setBusyKey(`request:${request.puuid}`);
    try {
      const result = await window.lolHelper.lcu.deleteFriendRequest(request.puuid);
      setNotice(result.message);
      if (result.success) {
        setRequests((current) => current.filter((item) => item.puuid !== request.puuid));
        window.dispatchEvent(new CustomEvent('lolhelp:friend-requests-changed'));
        window.setTimeout(() => void refresh(), 1_200);
      }
    } finally {
      setBusyKey('');
    }
  };

  if (!open) return null;

  return (
    <LargeDialog
      open={open}
      onClose={onClose}
      title="好友申请"
      description="发送申请，并处理收到或已经发出的申请"
      icon={<MailPlus className="size-4" />}
      notice={notice}
      className="h-[590px] w-[780px]"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-app-border bg-app-bg-soft/60 px-5 py-3.5">
          <form
            className="flex h-9 w-[470px] max-w-[78%] items-stretch overflow-hidden rounded-md border border-app-border bg-app-surface shadow-sm transition-[border-color,box-shadow] focus-within:border-app-primary/60 focus-within:shadow-[0_0_0_3px_rgba(229,197,140,0.08)]"
            onSubmit={(event) => {
              event.preventDefault();
              void addFriend();
            }}
          >
            <MailPlus className="ml-3 size-4 self-center text-app-muted" />
            <input
              value={riotId}
              onChange={(event) => setRiotId(event.target.value)}
              placeholder="输入名字#编号"
              className="min-w-0 flex-1 bg-transparent px-2.5 text-xs text-app-text outline-none placeholder:text-app-muted"
              aria-label="好友 Riot ID"
            />
            <button
              type="submit"
              disabled={busyKey === 'add'}
              className="flex min-w-[88px] items-center justify-center gap-1.5 bg-app-primary px-3 text-xs font-medium text-app-primary-foreground transition-colors hover:bg-app-primary-hover disabled:opacity-60"
            >
              <Send className="size-3.5" />
              {busyKey === 'add' ? '正在发送' : '发送申请'}
            </button>
          </form>
          <Button
            variant="outline"
            size="icon-sm"
            className="ml-auto"
            onClick={() => void refresh()}
            disabled={loading}
            title="刷新"
            aria-label="刷新好友申请"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {acceptedAlerts.length > 0 && (
          <div className="shrink-0 border-b border-app-border bg-emerald-50/35 px-5 py-2.5">
            <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold text-emerald-700">
              <CheckCircle2 className="size-3.5" />
              最近已添加
              <span className="font-normal text-app-muted">{acceptedAlerts.length}</span>
            </div>
            <div className="divide-y divide-emerald-100/70">
              {acceptedAlerts.slice(0, 3).map((alert) => (
                <div key={alert.id} className="flex h-11 items-center gap-2.5">
                  <ProfileIcon
                    iconId={alert.icon}
                    src={alert.iconUrl}
                    srcs={alert.iconUrls}
                    alt={alert.riotId}
                    size={30}
                    className="ring-1 ring-emerald-200"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-app-text">
                    {alert.riotId}
                  </span>
                  <span className="rounded-sm bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    已添加
                  </span>
                  <span className="flex w-20 items-center justify-end gap-1 text-[10px] text-app-muted">
                    <Clock3 className="size-3" />
                    {formatAcceptedAge(alert.acceptedAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex h-11 shrink-0 items-center border-b border-app-border px-5">
          <div className="flex items-center gap-2 text-xs font-semibold text-app-text">
            <Inbox className="size-3.5 text-app-primary" />
            待处理申请
          </div>
          <span className="ml-2 rounded-full bg-app-primary-soft px-2 py-0.5 text-[10px] font-semibold text-app-primary">
            {requests.length}
          </span>
          <div className="ml-auto flex items-center gap-3 text-[11px] text-app-muted">
            <span>收到 {incomingCount}</span>
            <span className="h-3 w-px bg-app-border" />
            <span>已发 {outgoingCount}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {requests.length > 0 ? (
            <div className="divide-y divide-app-border/70">
              {requests.map((request) => {
                const id = requestRiotId(request);
                const incoming = request.direction !== 'out';
                const requestBusy = busyKey === `request:${request.puuid}`;
                return (
                  <div key={request.puuid} className="flex min-h-[72px] items-center gap-3 py-2.5">
                    <ProfileIcon
                      iconId={request.icon}
                      src={request.iconUrl}
                      srcs={request.iconUrls}
                      alt={id}
                      size={42}
                      className="ring-1 ring-app-border"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-app-text">{id || '未知玩家'}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-app-muted">
                        <span className={`size-1.5 rounded-full ${incoming ? 'bg-app-primary' : 'bg-amber-400'}`} />
                        {incoming ? '对方向你发送了好友申请' : '已发送，等待对方通过'}
                      </div>
                    </div>
                    {incoming && (
                      <Button size="sm" disabled={requestBusy} onClick={() => void acceptRequest(request)}>
                        <Check className="size-3.5" />
                        通过
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={requestBusy}
                      onClick={() => void removeRequest(request)}
                    >
                      <X className="size-3.5" />
                      {incoming ? '拒绝' : '取消申请'}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full min-h-52 flex-col items-center justify-center text-center">
              <Inbox className="size-7 text-app-border-strong" />
              <p className="mt-3 text-xs font-medium text-app-text">没有待处理的申请</p>
              <p className="mt-1 text-[11px] text-app-muted">收到的申请和已经发出的申请都会显示在这里</p>
            </div>
          )}
        </div>
      </div>
    </LargeDialog>
  );
}
