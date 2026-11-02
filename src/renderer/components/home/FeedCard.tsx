import { ArrowRight } from 'lucide-react';
import type { FriendInfo, SavedMatchFollowAlertPreview } from '../../../shared/api';
import { ProfileIcon } from '../ProfileIcon';
import { formatAgo } from './HomeArt';

// 关注的人最近打了什么，加上现在有哪些好友在游戏里。

interface FeedCardProps {
  follows: SavedMatchFollowAlertPreview[];
  friends: FriendInfo[];
  now: number;
  onPlayerSearch: (name: string, region?: string) => void;
  onOpenFollow: () => void;
}

function isPlaying(friend: FriendInfo): boolean {
  const status = friend.lol?.gameStatus ?? '';
  return status === 'inGame' || status === 'championSelect' || status.toLowerCase().includes('progress');
}

export function FeedCard({ follows, friends, now, onPlayerSearch, onOpenFollow }: FeedCardProps) {
  const online = friends.filter((friend) => friend.availability !== 'offline' && friend.availability !== 'mobile');
  const playing = online.filter(isPlaying);

  return (
    <section className="hm-panel hm-feed" aria-label="关注动态">
      <header className="hm-panel__head">
        <h3>关注动态</h3>
        <button type="button" className="hm-panel__link" onClick={onOpenFollow}>
          我的玩家 <ArrowRight className="size-3" aria-hidden="true" />
        </button>
      </header>

      {follows.length > 0 ? (
        <ul className="hm-feed__list">
          {follows.slice(0, 3).map((alert) => (
            <li key={alert.id}>
              <button type="button" onClick={() => onPlayerSearch(alert.riotId, alert.region)}>
                <ProfileIcon iconId={alert.profileIconId} src={alert.profileIconUrl} alt={alert.riotId} size={26} />
                <span>
                  <b>{alert.riotId.split('#')[0]}</b>
                  <small>{alert.match.queueName} · {formatAgo(alert.detectedAt, now)}</small>
                </span>
                <em data-win={alert.match.win ? 'true' : 'false'}>
                  {alert.match.kills}/{alert.match.deaths}/{alert.match.assists}
                </em>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hm-panel__empty">暂无动态</p>
      )}

      <footer className="hm-feed__friends">
        <span>好友 <b>{online.length}</b> 在线 · <b>{playing.length}</b> 在游戏</span>
        <span className="hm-feed__faces">
          {playing.slice(0, 6).map((friend) => (
            <ProfileIcon
              key={friend.puuid || friend.id}
              iconId={friend.icon}
              src={friend.iconUrl}
              srcs={friend.iconUrls}
              alt={friend.gameName}
              title={`${friend.gameName}${friend.lol?.gameQueueName ? ` · ${friend.lol.gameQueueName}` : ''}`}
              size={22}
            />
          ))}
        </span>
      </footer>
    </section>
  );
}
