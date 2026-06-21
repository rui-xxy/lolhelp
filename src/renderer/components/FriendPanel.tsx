import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import type { FriendInfo } from '../../shared/api';

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

export function FriendPanel({ onFriendClick }: FriendPanelProps) {
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const loadFriends = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.lolHelper.lcu.getFriends();
      setFriends(list);
    } catch {
      setFriends([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

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
          onClick={loadFriends}
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
                      const statusText = getGameStatus(friend);
                      const statusColor = AVAILABILITY_COLOR[friend.availability] ?? 'bg-gray-400';
                      const iconUrl = friend.icon
                        ? `https://ddragon.leagueoflegends.com/cdn/15.21.1/img/profileicon/${friend.icon}.png`
                        : '';
                      return (
                        <button
                          key={friend.puuid}
                          onClick={() => handleFriendClick(friend)}
                          className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-app-nav-hover ${
                            isOffline ? 'opacity-50' : ''
                          }`}
                        >
                          {/* 头像 + 状态圆点 */}
                          <div className="relative shrink-0">
                            {iconUrl ? (
                              <img
                                src={iconUrl}
                                alt={friend.gameName}
                                loading="lazy"
                                className="size-8 rounded-full border border-app-border object-cover"
                              />
                            ) : (
                              <div className="size-8 rounded-full bg-app-surface-soft" />
                            )}
                            <span className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border border-app-surface ${statusColor}`} />
                          </div>
                          {/* 名字 + 状态 */}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium text-app-text">
                              {friend.note || friend.gameName}
                            </div>
                            <span className="truncate text-[10px] text-app-subtle">
                              {statusText || '离线'}
                              {friend.gameTag ? ` · #${friend.gameTag}` : ''}
                            </span>
                          </div>
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
