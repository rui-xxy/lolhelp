import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import type { FriendInfo } from '../../shared/api';
import { ProfileIcon } from './ProfileIcon';
import type { CSSProperties } from 'react';

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

const FRIEND_REFRESH_INTERVAL_MS = 3000;

type FriendStatusKind =
  | 'ranked-solo'
  | 'ranked-flex'
  | 'normal-game'
  | 'aram'
  | 'queue'
  | 'champ-select'
  | 'lobby'
  | 'online'
  | 'offline';

const FRIEND_STATUS_CLASS: Record<FriendStatusKind, string> = {
  'ranked-solo': 'friend-status--ranked-solo',
  'ranked-flex': 'friend-status--ranked-flex',
  'normal-game': 'friend-status--normal-game',
  aram: 'friend-status--aram',
  queue: 'friend-status--queue',
  'champ-select': 'friend-status--champ-select',
  lobby: 'friend-status--lobby',
  online: 'friend-status--online',
  offline: 'friend-status--offline',
};

function getFriendStatusKind(friend: FriendInfo): FriendStatusKind {
  if (friend.availability === 'offline') return 'offline';
  const lol = friend.lol;
  if (!lol) return 'online';
  if (lol.gameStatus === 'inGame') {
    if (lol.gameQueueType === 'RANKED_SOLO_5x5') return 'ranked-solo';
    if (lol.gameQueueType === 'RANKED_FLEX_SR') return 'ranked-flex';
    if (lol.gameMode === 'ARAM') return 'aram';
    return 'normal-game';
  }
  if (lol.gameStatus === 'inQueue') return 'queue';
  if (lol.gameStatus === 'championSelect') return 'champ-select';
  return 'lobby';
}

function getGameStatus(friend: FriendInfo): string {
  if (friend.availability === 'offline') return '';
  const lol = friend.lol;
  if (!lol) return '在线';
  if (lol.gameStatus === 'inGame') {
    return lol.gameQueueType === 'RANKED_SOLO_5x5' ? '排位中'
      : lol.gameQueueType === 'RANKED_FLEX_SR' ? '灵活排位中'
      : lol.gameMode === 'ARAM' ? '大乱斗' : '游戏中';
  }
  if (lol.gameStatus === 'inQueue') return '排队中';
  if (lol.gameStatus === 'championSelect') return '选人中';
  return '大厅';
}

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

export function FriendPanel({ onFriendClick }: FriendPanelProps) {
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [currentTime, setCurrentTime] = useState(() => Date.now());
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
    const riotId = friend.gameTag ? `${friend.gameName}#${friend.gameTag}` : friend.gameName;
    onFriendClick(riotId);
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
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
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
              <div key={groupName} className="mb-1">
                <button
                  onClick={() => toggleGroup(groupName)}
                  className="flex w-full items-center gap-1 px-1 py-1 text-[11px] font-medium text-app-muted hover:text-app-text"
                >
                  <span className="text-app-subtle">{collapsed ? '▶' : '▼'}</span>
                  <span>{displayName}</span>
                  <span className="text-app-subtle">（{groupOnline}/{list.length}）</span>
                </button>
                {!collapsed && (
                  <div>
                    {list.map((friend) => {
                      const isOffline = friend.availability === 'offline';
                      const statusKind = getFriendStatusKind(friend);
                      const statusText = getGameStatus(friend);
                      const statusColor = AVAILABILITY_COLOR[friend.availability] ?? 'bg-gray-400';
                      const championSplashUrl = friend.lol?.championSplashUrl ?? '';
                      const gameDuration =
                        friend.lol?.gameStatus === 'inGame'
                          ? formatGameDuration(friend.lol.timeStamp, currentTime)
                          : '';
                      return (
                        <button
                          key={friend.puuid}
                          onClick={() => handleFriendClick(friend)}
                          className={`friend-row flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left ${
                            championSplashUrl ? 'friend-row--has-skin' : ''
                          } ${
                            gameDuration ? 'pr-14' : ''
                          } ${
                            isOffline ? 'opacity-50' : ''
                          }`}
                          style={
                            championSplashUrl
                              ? ({ '--friend-skin-bg': `url("${championSplashUrl}")` } as CSSProperties)
                              : undefined
                          }
                        >
                          {/* 头像 + 状态圆点 */}
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
                          {/* 名字 + 状态 */}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium text-app-text">
                              {friend.note || friend.gameName}
                            </div>
                            <span className={`friend-status ${FRIEND_STATUS_CLASS[statusKind]}`}>
                              {statusText || '离线'}
                            </span>
                          </div>
                          {gameDuration && (
                            <span className="friend-row-timer tabular-nums">
                              {gameDuration}
                            </span>
                          )}
                        </button>
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
