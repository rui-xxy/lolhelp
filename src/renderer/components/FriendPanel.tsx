import { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, Eye, MoreHorizontal, RefreshCw, Search, Trash2 } from 'lucide-react';
import type { FriendInfo } from '../../shared/api';
import { ProfileIcon } from './ProfileIcon';
import type { CSSProperties } from 'react';
import {
  getFriendStatusDisplay,
  type FriendStatusKind,
} from './friendStatus';

// 好友列表面板（内联侧栏，不是弹窗）。
// 分组显示好友、在线状态、备注，点击好友查战绩。
// 排版参考 LOL 客户端好友列表：在线优先 → 按分组 → 头像+名字+状态。

interface FriendPanelProps {
  onFriendClick: (riotId: string) => void;
}

const AVAILABILITY_COLOR: Record<string, string> = {
  online: 'bg-green-500',
  chat: 'bg-green-500',
  dnd: 'bg-red-500',
  away: 'bg-yellow-500',
  mobile: 'bg-blue-500',
  invisible: 'bg-gray-400',
  offline: 'bg-gray-400',
};

const FRIEND_REFRESH_INTERVAL_MS = 5_000;

const FRIEND_STATUS_CLASS: Record<FriendStatusKind, string> = {
  'ranked-solo': 'friend-status--ranked-solo',
  'ranked-flex': 'friend-status--ranked-flex',
  'normal-game': 'friend-status--normal-game',
  aram: 'friend-status--aram',
  arena: 'friend-status--arena',
  tft: 'friend-status--tft',
  queue: 'friend-status--queue',
  'champ-select': 'friend-status--champ-select',
  lobby: 'friend-status--lobby',
  online: 'friend-status--online',
  offline: 'friend-status--offline',
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatGameDuration(startedAt: string | number | undefined, now: number): string {
  let startedAtMs = Number(startedAt ?? 0);
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) return '';
  if (startedAtMs < 1_000_000_000_000) startedAtMs *= 1000;

  const elapsed = Math.max(0, now - startedAtMs);
  const totalSeconds = Math.floor(elapsed / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
  return `${minutes}:${pad2(seconds)}`;
}

function timestampValue(value: string | number | null | undefined): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number' || /^\d+$/.test(String(value).trim())) {
    let timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
    if (timestamp < 1_000_000_000_000) timestamp *= 1000;
    return timestamp;
  }

  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

function friendAddedTimestamp(friend: FriendInfo): number {
  return friend.friendSinceTimestamp ?? timestampValue(friend.friendSince);
}

function formatFriendAddedTime(friend: FriendInfo): string {
  const timestamp = friendAddedTimestamp(friend);
  if (!timestamp) return '添加时间未知';
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function FriendPanel({ onFriendClick }: FriendPanelProps) {
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [sortByAddedAt, setSortByAddedAt] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [actionFriendId, setActionFriendId] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const refreshingRef = useRef(false);

  const loadFriends = useCallback(async (showLoading = true) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    if (showLoading) setLoading(true);
    try {
      const list = await window.lolHelper.lcu.getFriends();
      setFriends(list);
    } catch {
      setFriends([]);
    } finally {
      refreshingRef.current = false;
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFriends(true);
    const timer = window.setInterval(() => {
      void loadFriends(false);
    }, FRIEND_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadFriends]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime((time) => time + 1000), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!actionFriendId) return undefined;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        event.target instanceof Element
        && event.target.closest('[data-friend-action-menu]')
      ) {
        return;
      }
      setActionFriendId('');
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActionFriendId('');
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [actionFriendId]);

  // 按分组归类
  const groups = new Map<string, FriendInfo[]>();
  for (const f of friends) {
    const g = f.groupName || '**Default';
    const list = groups.get(g) ?? [];
    list.push(f);
    groups.set(g, list);
  }
  for (const [, list] of groups) {
    list.sort((a, b) => {
      if (sortByAddedAt) {
        const addedDiff = friendAddedTimestamp(b) - friendAddedTimestamp(a);
        if (addedDiff !== 0) return addedDiff;
        return a.gameName.localeCompare(b.gameName);
      }
      const aOnline = a.availability !== 'offline' ? 0 : 1;
      const bOnline = b.availability !== 'offline' ? 0 : 1;
      if (aOnline !== bOnline) return aOnline - bOnline;
      return a.gameName.localeCompare(b.gameName);
    });
  }

  const onlineCount = friends.filter((f) => f.availability !== 'offline').length;

  const toggleGroup = (name: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleFriendClick = (friend: FriendInfo) => {
    if (!friend.gameName) return;
    setActionFriendId('');
    const riotId = friend.gameTag ? `${friend.gameName}#${friend.gameTag}` : friend.gameName;
    onFriendClick(riotId);
  };

  const handleSpectate = async (friend: FriendInfo) => {
    const result = await window.lolHelper.lcu.spectateFriend(friend.puuid);
    setActionMessage(result.message);
    if (result.success) setActionFriendId('');
  };

  const handleDeleteFriend = async (friend: FriendInfo) => {
    const displayName = friend.note || friend.gameName;
    if (!window.confirm(`确定删除好友“${displayName}”吗？`)) return;
    const result = await window.lolHelper.lcu.deleteFriend(friend.id);
    setActionMessage(result.message);
    if (result.success) {
      setActionFriendId('');
      await loadFriends(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-app-surface">
      {/* 头部 */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-app-border bg-app-surface pr-[138px] pl-3 [-webkit-app-region:drag]">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-app-text">
          好友 {onlineCount}/{friends.length}
        </span>
        <button
          onClick={() => loadFriends(true)}
          disabled={loading}
          className="rounded-xs p-1 text-app-subtle transition-colors [-webkit-app-region:no-drag] hover:bg-app-surface-soft hover:text-app-text"
          title="刷新"
        >
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 好友列表 */}
      <div
        className="min-h-0 flex-1 overflow-y-auto p-1.5"
        onScroll={() => setActionFriendId('')}
      >
        {actionMessage && (
          <button
            type="button"
            onClick={() => setActionMessage('')}
            className="mb-1 w-full rounded-sm bg-app-primary-soft px-2 py-1.5 text-left text-[11px] text-app-body"
          >
            {actionMessage}
          </button>
        )}
        {loading && friends.length === 0 ? (
          <div className="flex h-20 items-center justify-center text-xs text-app-subtle">加载中...</div>
        ) : friends.length === 0 ? (
          <div className="flex h-20 items-center justify-center text-xs text-app-subtle">
            无好友数据（客户端未启动？）
          </div>
        ) : (
          Array.from(groups.entries()).map(([groupName, list]) => {
            const collapsed = collapsedGroups.has(groupName);
            const groupOnline = list.filter((f) => f.availability !== 'offline').length;
            const displayName = groupName === '**Default' ? '默认分组' : groupName;
            return (
              <div key={groupName} className="relative mb-1">
                <button
                  onClick={() => toggleGroup(groupName)}
                  className="flex w-full items-center gap-1 px-1 py-1 pr-7 text-[11px] font-medium text-app-muted hover:text-app-text"
                >
                  <span className="text-app-subtle">{collapsed ? '▶' : '▼'}</span>
                  <span>{displayName}</span>
                  <span className="text-app-subtle">（{groupOnline}/{list.length}）</span>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSortByAddedAt((value) => !value);
                  }}
                  className={`absolute right-1 top-0.5 z-10 flex size-5 items-center justify-center rounded-xs transition-colors ${
                    sortByAddedAt
                      ? 'bg-app-primary-soft text-app-primary'
                      : 'text-app-subtle hover:bg-app-surface-soft hover:text-app-text'
                  }`}
                  title={sortByAddedAt ? '恢复默认好友排序' : '按添加好友时间排序'}
                  aria-label={sortByAddedAt ? '恢复默认好友排序' : '按添加好友时间排序'}
                >
                  <Clock className="size-3.5" />
                </button>
                {!collapsed && (
                  <div>
                    {list.map((friend) => {
                      const isOffline = friend.availability === 'offline';
                      const status = getFriendStatusDisplay(friend);
                      const statusColor = AVAILABILITY_COLOR[friend.availability] ?? 'bg-gray-400';
                      const championSplashUrls = friend.lol?.championSplashUrls?.length
                        ? friend.lol.championSplashUrls
                        : friend.lol?.championSplashUrl
                          ? [friend.lol.championSplashUrl]
                          : [];
                      const championSplashBackground = championSplashUrls
                        .map((url) => `url("${url}")`)
                        .join(', ');
                      const gameDuration =
                        friend.lol?.gameStatus === 'inGame'
                          ? formatGameDuration(friend.lol.timeStamp, currentTime)
                          : '';
                      const addedTime = sortByAddedAt ? formatFriendAddedTime(friend) : '';
                      return (
                        <div
                          key={friend.puuid}
                          className={`friend-row group flex w-full items-center rounded-sm text-left ${
                            championSplashBackground ? 'friend-row--has-skin' : ''
                          } ${
                            gameDuration ? 'pr-12' : ''
                          } ${
                            isOffline ? 'opacity-50' : ''
                          } ${
                            actionFriendId === friend.id ? 'z-20 overflow-visible' : ''
                          }`}
                          style={
                            championSplashBackground
                              ? ({ '--friend-skin-bg': championSplashBackground } as CSSProperties)
                              : undefined
                          }
                        >
                          <button
                            type="button"
                            onClick={() => handleFriendClick(friend)}
                            className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                          >
                            <div className="relative shrink-0">
                              <ProfileIcon
                                iconId={friend.icon}
                                src={friend.iconUrl}
                                srcs={friend.iconUrls}
                                alt={friend.note || friend.gameName}
                                size={32}
                                className="border border-app-border"
                              />
                              <span className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border border-app-surface ${statusColor}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-medium text-app-text">
                                {friend.note || friend.gameName}
                              </div>
                              <span className={`friend-status ${FRIEND_STATUS_CLASS[status.kind]}`}>
                                {status.text || '离线'}
                              </span>
                              {addedTime && (
                                <span className="friend-added-time" title={addedTime}>
                                  添加：{addedTime}
                                </span>
                              )}
                            </div>
                          </button>
                          <button
                            type="button"
                            data-friend-action-menu
                            onClick={() => setActionFriendId((current) =>
                              current === friend.id ? '' : friend.id)}
                            className="relative z-10 mr-1 flex size-6 shrink-0 items-center justify-center rounded-sm text-app-subtle opacity-0 transition-opacity hover:bg-white/70 hover:text-app-text group-hover:opacity-100"
                            title="好友操作"
                          >
                            <MoreHorizontal className="size-3.5" />
                          </button>
                          {gameDuration && (
                            <span className="friend-row-timer tabular-nums">
                              {gameDuration}
                            </span>
                          )}
                          {actionFriendId === friend.id && (
                            <div
                              data-friend-action-menu
                              className="absolute right-2 top-9 z-30 w-28 overflow-hidden rounded-sm border border-app-border bg-app-surface py-1 shadow-airbnb"
                            >
                              <button
                                type="button"
                                onClick={() => handleFriendClick(friend)}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-app-body hover:bg-app-surface-soft"
                              >
                                <Search className="size-3.5" />
                                查战绩
                              </button>
                              {friend.lol?.gameStatus === 'inGame' && (
                                <button
                                  type="button"
                                  onClick={() => void handleSpectate(friend)}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-app-body hover:bg-app-surface-soft"
                                >
                                  <Eye className="size-3.5" />
                                  观战
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void handleDeleteFriend(friend)}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-app-danger hover:bg-red-50"
                              >
                                <Trash2 className="size-3.5" />
                                删除好友
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
