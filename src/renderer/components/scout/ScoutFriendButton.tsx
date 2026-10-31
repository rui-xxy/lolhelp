import { Check, LoaderCircle, RotateCcw, UserPlus } from 'lucide-react';
import { useFriendRequest, type FriendRequestState } from './friendRequests';

// 加好友按钮。两种样子：
// orb  —— 贴在目标卡片头像右下角的小圆钮，悬停时向右展开成「加好友」；
// pill —— 速览面板顶部的胶囊按钮，文字常显。
// 发送中转圈，成功变成对勾并冲出一圈光，失败抖一下，几秒后可以再点。

const LABELS: Record<FriendRequestState, string> = {
  idle: '加好友',
  sending: '发送中',
  sent: '已申请',
  error: '发送失败',
};

const ICONS: Record<FriendRequestState, typeof UserPlus> = {
  idle: UserPlus,
  sending: LoaderCircle,
  sent: Check,
  error: RotateCcw,
};

interface ScoutFriendButtonProps {
  riotId: string;
  variant: 'orb' | 'pill';
}

export function ScoutFriendButton({ riotId, variant }: ScoutFriendButtonProps) {
  const [status, send] = useFriendRequest(riotId);
  const Icon = ICONS[status.state];
  const busy = status.state === 'sending' || status.state === 'sent';
  const title = status.message || (riotId ? `向 ${riotId} 发送好友申请` : '无法识别这位玩家');

  return (
    <button
      type="button"
      className={`scout-friend scout-friend--${variant}`}
      data-state={status.state}
      aria-disabled={busy || !riotId}
      aria-label={`${LABELS[status.state]}：${riotId}`}
      title={title}
      onClick={(event) => {
        // 不触发卡片的「打开速览」
        event.stopPropagation();
        if (!busy && riotId) send();
      }}
    >
      <i className="scout-friend__icon" aria-hidden="true">
        <Icon />
      </i>
      <span className="scout-friend__label">{LABELS[status.state]}</span>
    </button>
  );
}
