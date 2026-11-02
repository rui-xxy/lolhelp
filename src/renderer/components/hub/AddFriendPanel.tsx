import { useEffect, useRef, useState } from 'react';
import { ChevronDown, UserPlus, UserRoundSearch, X } from 'lucide-react';
import type { FriendRequestInfo } from '../../../shared/api';
import { ProfileIcon } from '../ProfileIcon';
import type { FriendAcceptedAlert } from '../friends/friendRequestTracking';
import { dayLabel, splitRiotId } from './hubFormat';

// 加好友：输入 名字#编号 发申请；下面是还在等对方通过的申请（可撤回）和折叠起来的添加历史。

function requestRiotId(request: FriendRequestInfo): string {
  return request.gameTag ? `${request.gameName}#${request.gameTag}` : request.gameName;
}

export function AddFriendPanel({
  outgoing,
  acceptedAlerts,
  busyKey,
  onAdd,
  onWithdraw,
  onViewPlayer,
}: {
  outgoing: FriendRequestInfo[];
  acceptedAlerts: FriendAcceptedAlert[];
  busyKey: string;
  onAdd: (riotId: string) => Promise<boolean>;
  onWithdraw: (request: FriendRequestInfo) => void;
  onViewPlayer: (riotId: string) => void;
}) {
  const [riotId, setRiotId] = useState('');
  const [showAllPending, setShowAllPending] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const visiblePending = showAllPending ? outgoing : outgoing.slice(0, 8);
  const now = Date.now();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async () => {
    const value = riotId.trim();
    if (!value) {
      inputRef.current?.focus();
      return;
    }
    if (await onAdd(value)) setRiotId('');
  };

  return (
    <div className="hub-scroll">
      <div className="af">
        <form
          className="af-hero"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <span className="af-hero__icon" aria-hidden="true"><UserPlus /></span>
          <input
            ref={inputRef}
            value={riotId}
            onChange={(event) => setRiotId(event.target.value)}
            placeholder="名字#编号"
            aria-label="好友的名字和编号"
          />
          <button type="submit" className="hub-btn" data-variant="primary" disabled={!riotId.trim() || busyKey === `add:${riotId.trim()}`}>
            发送申请
          </button>
        </form>

        {outgoing.length > 0 && (
          <section className="af-section">
            <header className="af-section__head">
              <h4>等待通过 <em>{outgoing.length}</em></h4>
            </header>
            <div className="af-pending">
              {visiblePending.map((request) => {
                const id = requestRiotId(request);
                const { name } = splitRiotId(id);
                return (
                  <span key={request.puuid} className="af-chip" title={id}>
                    <ProfileIcon iconId={request.icon} src={request.iconUrl} srcs={request.iconUrls} alt={name} size={24} />
                    <b>{name}</b>
                    <button
                      type="button"
                      onClick={() => onWithdraw(request)}
                      disabled={busyKey === `withdraw:${request.puuid}`}
                      aria-label={`撤回给 ${name} 的申请`}
                      title="撤回"
                    >
                      <X />
                    </button>
                  </span>
                );
              })}
              {outgoing.length > 8 && (
                <button type="button" className="af-chip af-chip--more" onClick={() => setShowAllPending((current) => !current)}>
                  {showAllPending ? '收起' : `+${outgoing.length - 8}`}
                </button>
              )}
            </div>
          </section>
        )}

        {acceptedAlerts.length > 0 && (
          <section className="af-section">
            <button type="button" className="af-history-toggle" onClick={() => setHistoryOpen((current) => !current)} aria-expanded={historyOpen}>
              最近添加 <em>{acceptedAlerts.length}</em>
              <ChevronDown data-open={historyOpen ? 'true' : 'false'} />
            </button>
            {historyOpen && (
              <div className="af-history">
                {acceptedAlerts.map((alert) => {
                  const { name, tag } = splitRiotId(alert.riotId);
                  return (
                    <div key={alert.id} className="af-history__row">
                      <ProfileIcon iconId={alert.icon} src={alert.iconUrl} srcs={alert.iconUrls} alt={name} size={28} />
                      <b>{name}</b>
                      {tag && <small>#{tag}</small>}
                      <time>{dayLabel(alert.acceptedAt, now)}</time>
                      <button type="button" className="hub-icon-btn" onClick={() => onViewPlayer(alert.riotId)} title="查战绩" aria-label={`查看 ${name} 的战绩`}>
                        <UserRoundSearch />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
