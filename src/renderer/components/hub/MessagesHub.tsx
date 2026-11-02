import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  MessageCircleMore,
  MessagesSquare,
  Search,
  UserCheck,
  UserPlus,
  UserRoundSearch,
  X,
} from 'lucide-react';
import type {
  ChatAccountSummary,
  ChatConversation,
  FriendRequestInfo,
} from '../../../shared/api';
import { ProfileIcon } from '../ProfileIcon';
import type { FriendAcceptedAlert } from '../friends/friendRequestTracking';
import { AddFriendPanel } from './AddFriendPanel';
import { ChatPanel, conversationStatus } from './ChatPanel';
import { AvatarBadge, HubDialog, useHubNotice } from './HubDialog';
import { PlayerPeek } from './PlayerPeek';
import { chatTimestamp, formatAgo, formatListTime, splitRiotId } from './hubFormat';

// 消息：聊天、好友申请、加好友都在这里。
// - 有人加你：申请直接出现在左侧列表最上面，行内就能通过 / 拒绝；点开能先看他的战绩。
// - 有人通过了你的申请：列表顶部出现一次「新朋友」，关掉或关闭窗口后就不再显示（历史在加好友页）。
// - 加好友：左上角的加号，打开后输入 名字#编号；已发出的申请和添加历史也在那一页。

export const FRIENDS_CHANGED_EVENT = 'lolhelp:friends-changed';
export const FRIEND_REQUESTS_CHANGED_EVENT = 'lolhelp:friend-requests-changed';

export type MessagesHubSection = 'chats' | 'requests' | 'add';

type Selection =
  | { kind: 'chat'; id: string }
  | { kind: 'add' }
  | { kind: 'request'; puuid: string }
  | { kind: 'friend'; id: string };

const CHAT_REFRESH_INTERVAL_MS = 5_000;
const REQUEST_REFRESH_INTERVAL_MS = 15_000;

interface MessagesHubProps {
  open: boolean;
  onClose: () => void;
  initialSection?: MessagesHubSection;
  acceptedAlerts?: FriendAcceptedAlert[];
  /** 把一条「新朋友」标为已读（看过或手动关掉）。 */
  onAcceptedRead?: (id: string) => void;
  /** 在战绩页查询这个玩家。 */
  onViewPlayer: (riotId: string) => void;
}

function requestRiotId(request: FriendRequestInfo): string {
  return request.gameTag ? `${request.gameName}#${request.gameTag}` : request.gameName;
}

export function MessagesHub({
  open,
  onClose,
  initialSection = 'chats',
  acceptedAlerts = [],
  onAcceptedRead,
  onViewPlayer,
}: MessagesHubProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [accounts, setAccounts] = useState<ChatAccountSummary[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<ChatAccountSummary | null>(null);
  const [selectedAccountKey, setSelectedAccountKey] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [requests, setRequests] = useState<FriendRequestInfo[]>([]);
  const [requestsLoaded, setRequestsLoaded] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [selection, setSelection] = useState<Selection | null>(
    initialSection === 'add' ? { kind: 'add' } : null,
  );
  const [query, setQuery] = useState('');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  // 打开窗口时还没看过的「新朋友」；本次打开期间一直显示，除非手动关掉。
  const [freshAcceptedIds] = useState(() => new Set(acceptedAlerts.filter((alert) => !alert.read).map((alert) => alert.id)));
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const [notice, showNotice] = useHubNotice();
  const loadingRef = useRef(false);
  const accountKeyRef = useRef('');
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async (accountKey?: string, quiet = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (!quiet) setChatLoading(true);
    try {
      const response = await window.lolHelper.lcu.getChatConversations(
        accountKey ?? (accountKeyRef.current || undefined),
      );
      accountKeyRef.current = response.selectedAccountKey;
      setAccounts(response.accounts);
      setSelectedAccount(response.selectedAccount ?? response.currentAccount ?? null);
      setSelectedAccountKey(response.selectedAccountKey);
      setReadOnly(response.readOnly);
      setConversations(response.conversations);
      setChatError('');
    } catch (error) {
      setChatError(error instanceof Error ? error.message : String(error));
      if (!quiet) setConversations([]);
    } finally {
      loadingRef.current = false;
      setChatLoading(false);
      setChatLoaded(true);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      setRequests(await window.lolHelper.lcu.getFriendRequests());
    } catch {
      // 未连接客户端时保留上一份列表。
    } finally {
      setRequestsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    accountKeyRef.current = '';
    void loadConversations('');
    void loadRequests();
    const chatTimer = window.setInterval(() => void loadConversations(undefined, true), CHAT_REFRESH_INTERVAL_MS);
    const requestTimer = window.setInterval(() => void loadRequests(), REQUEST_REFRESH_INTERVAL_MS);
    const onRequestsChanged = () => void loadRequests();
    window.addEventListener(FRIEND_REQUESTS_CHANGED_EVENT, onRequestsChanged);
    return () => {
      window.clearInterval(chatTimer);
      window.clearInterval(requestTimer);
      window.removeEventListener(FRIEND_REQUESTS_CHANGED_EVENT, onRequestsChanged);
    };
  }, [loadConversations, loadRequests, open]);

  useEffect(() => {
    if (!accountMenuOpen) return undefined;
    const close = (event: MouseEvent) => {
      if (event.target instanceof Node && !accountMenuRef.current?.contains(event.target)) setAccountMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [accountMenuOpen]);

  const incoming = useMemo(() => requests.filter((request) => request.direction !== 'out'), [requests]);
  const outgoing = useMemo(() => requests.filter((request) => request.direction === 'out'), [requests]);
  const freshAccepted = useMemo(
    () => acceptedAlerts.filter((alert) => (freshAcceptedIds.has(alert.id) || !alert.read) && !dismissedIds.has(alert.id)),
    [acceptedAlerts, dismissedIds, freshAcceptedIds],
  );

  // 默认选中：先处理别人的申请，再看最近的会话，什么都没有就打开加好友。
  useEffect(() => {
    if (!open || !chatLoaded || !requestsLoaded || selection) return;
    if (initialSection === 'requests' && incoming[0]) setSelection({ kind: 'request', puuid: incoming[0].puuid });
    else if (conversations[0]) setSelection({ kind: 'chat', id: conversations[0].id });
    else if (incoming[0]) setSelection({ kind: 'request', puuid: incoming[0].puuid });
    else setSelection({ kind: 'add' });
  }, [chatLoaded, conversations, incoming, initialSection, open, requestsLoaded, selection]);

  // 选中的会话 / 申请不在了，就回到列表里的第一项。
  useEffect(() => {
    if (!selection) return;
    if (selection.kind === 'chat' && chatLoaded && !conversations.some((item) => item.id === selection.id)) {
      setSelection(conversations[0] ? { kind: 'chat', id: conversations[0].id } : { kind: 'add' });
    }
    if (selection.kind === 'request' && requestsLoaded && !incoming.some((item) => item.puuid === selection.puuid)) {
      setSelection(incoming[0] ? { kind: 'request', puuid: incoming[0].puuid } : conversations[0] ? { kind: 'chat', id: conversations[0].id } : { kind: 'add' });
    }
  }, [chatLoaded, conversations, incoming, requestsLoaded, selection]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return conversations;
    return conversations.filter((conversation) =>
      conversation.riotId.toLowerCase().includes(text)
      || conversation.messages.some((message) => message.body.toLowerCase().includes(text)));
  }, [conversations, query]);

  const conversationByPuuid = useMemo(
    () => new Map(conversations.filter((item) => item.puuid).map((item) => [item.puuid, item])),
    [conversations],
  );

  const viewPlayer = (riotId: string) => {
    onViewPlayer(riotId);
    onClose();
  };

  const switchAccount = (account: ChatAccountSummary) => {
    setAccountMenuOpen(false);
    accountKeyRef.current = account.key;
    setSelectedAccountKey(account.key);
    setChatLoaded(false);
    if (selection?.kind === 'chat') setSelection(null);
    void loadConversations(account.key);
  };

  const addFriend = async (riotId: string): Promise<boolean> => {
    const trimmed = riotId.trim();
    if (!trimmed.includes('#')) {
      showNotice('请输入 名字#编号', 'error');
      return false;
    }
    setBusyKey(`add:${trimmed}`);
    try {
      const result = await window.lolHelper.lcu.addFriend(trimmed);
      showNotice(result.success ? `已向 ${splitRiotId(trimmed).name} 发送申请` : result.message || '发送失败', result.success ? 'ok' : 'error');
      if (result.success) {
        await loadRequests();
        window.dispatchEvent(new CustomEvent(FRIEND_REQUESTS_CHANGED_EVENT));
      }
      return result.success;
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '发送失败', 'error');
      return false;
    } finally {
      setBusyKey('');
    }
  };

  const accept = async (request: FriendRequestInfo) => {
    setBusyKey(`request:${request.puuid}`);
    try {
      const result = await window.lolHelper.lcu.acceptFriendRequest(request.puuid);
      showNotice(result.success ? `已和 ${request.gameName} 成为好友` : result.message || '操作失败', result.success ? 'ok' : 'error');
      if (result.success) {
        setRequests((current) => current.filter((item) => item.puuid !== request.puuid));
        window.dispatchEvent(new CustomEvent(FRIENDS_CHANGED_EVENT));
        window.setTimeout(() => void loadRequests(), 1_200);
      }
    } finally {
      setBusyKey('');
    }
  };

  const removeRequest = async (request: FriendRequestInfo, kind: 'decline' | 'withdraw') => {
    setBusyKey(`${kind === 'decline' ? 'request' : 'withdraw'}:${request.puuid}`);
    try {
      const result = await window.lolHelper.lcu.deleteFriendRequest(request.puuid);
      showNotice(
        result.success ? (kind === 'decline' ? '已拒绝' : '已撤回') : result.message || '操作失败',
        result.success ? 'neutral' : 'error',
      );
      if (result.success) {
        setRequests((current) => current.filter((item) => item.puuid !== request.puuid));
        window.dispatchEvent(new CustomEvent(FRIEND_REQUESTS_CHANGED_EVENT));
        window.setTimeout(() => void loadRequests(), 1_200);
      }
    } finally {
      setBusyKey('');
    }
  };

  const dismissAccepted = (alert: FriendAcceptedAlert) => {
    setDismissedIds((current) => new Set(current).add(alert.id));
    onAcceptedRead?.(alert.id);
    if (selection?.kind === 'friend' && selection.id === alert.id) {
      setSelection(conversations[0] ? { kind: 'chat', id: conversations[0].id } : { kind: 'add' });
    }
  };

  const openAccepted = (alert: FriendAcceptedAlert) => {
    setSelection({ kind: 'friend', id: alert.id });
    onAcceptedRead?.(alert.id);
  };

  const selectedConversation = selection?.kind === 'chat'
    ? conversations.find((item) => item.id === selection.id) ?? null
    : null;
  const selectedRequest = selection?.kind === 'request'
    ? incoming.find((item) => item.puuid === selection.puuid) ?? null
    : null;
  const selectedFriend = selection?.kind === 'friend'
    ? acceptedAlerts.find((item) => item.id === selection.id) ?? null
    : null;
  const hasInbox = incoming.length > 0 || freshAccepted.length > 0;

  const accountSwitcher = selectedAccount ? (
    <div ref={accountMenuRef} className="msg-account">
      <button
        type="button"
        className="msg-account__btn"
        onClick={() => setAccountMenuOpen((current) => !current)}
        aria-expanded={accountMenuOpen}
        disabled={accounts.length <= 1}
        title={accounts.length > 1 ? '切换账号' : selectedAccount.riotId}
      >
        <ProfileIcon iconId={selectedAccount.icon} src={selectedAccount.iconUrl} srcs={selectedAccount.iconUrls} alt={selectedAccount.riotId} size={24} />
        <b>{splitRiotId(selectedAccount.riotId).name}</b>
        {readOnly && <span className="hub-tag">只读</span>}
        {accounts.length > 1 && <ChevronDown />}
      </button>
      {accountMenuOpen && (
        <div className="msg-account__menu" role="menu">
          {accounts.map((account) => (
            <button
              key={account.key}
              type="button"
              role="menuitemradio"
              aria-checked={selectedAccountKey === account.key}
              onClick={() => switchAccount(account)}
            >
              <ProfileIcon iconId={account.icon} src={account.iconUrl} srcs={account.iconUrls} alt={account.riotId} size={28} />
              <span>
                <b>{account.riotId}</b>
                <small>{account.current ? '当前登录' : `${account.conversationCount} 个会话`}</small>
              </span>
              {selectedAccountKey === account.key && <Check />}
            </button>
          ))}
        </div>
      )}
    </div>
  ) : null;

  return (
    <HubDialog
      open={open}
      onClose={onClose}
      variant="messages"
      title="消息"
      icon={<MessagesSquare />}
      notice={notice}
      actions={accountSwitcher}
    >
      <div className="hub-split">
        <aside className="hub-side">
          <div className="msg-side-top">
            <label className="hub-search">
              <Search />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索"
                aria-label="搜索会话"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} aria-label="清空搜索"><X /></button>
              )}
            </label>
            <button
              type="button"
              className="msg-add-btn"
              aria-pressed={selection?.kind === 'add'}
              onClick={() => setSelection({ kind: 'add' })}
              title="加好友"
              aria-label="加好友"
            >
              <UserPlus />
            </button>
          </div>

          <div className="hub-side__list">
            {!query && incoming.length > 0 && (
              <>
                <h4 className="msg-group">好友申请 <em>{incoming.length}</em></h4>
                {incoming.map((request) => {
                  const id = requestRiotId(request);
                  const { name, tag } = splitRiotId(id);
                  const busy = busyKey === `request:${request.puuid}`;
                  const active = selection?.kind === 'request' && selection.puuid === request.puuid;
                  return (
                    <div key={request.puuid} className="msg-inbox" data-kind="request" aria-current={active ? 'true' : undefined}>
                      <button type="button" className="msg-inbox__main" onClick={() => setSelection({ kind: 'request', puuid: request.puuid })}>
                        <ProfileIcon iconId={request.icon} src={request.iconUrl} srcs={request.iconUrls} alt={name} size={40} />
                        <span className="msg-inbox__text">
                          <b>{name}{tag && <small>#{tag}</small>}</b>
                          {request.note && <span>{request.note}</span>}
                        </span>
                      </button>
                      <button type="button" className="msg-round" data-tone="accept" disabled={busy} onClick={() => void accept(request)} title="通过" aria-label={`通过 ${name} 的申请`}>
                        <Check />
                      </button>
                      <button type="button" className="msg-round" disabled={busy} onClick={() => void removeRequest(request, 'decline')} title="拒绝" aria-label={`拒绝 ${name} 的申请`}>
                        <X />
                      </button>
                    </div>
                  );
                })}
              </>
            )}

            {!query && freshAccepted.length > 0 && (
              <>
                <h4 className="msg-group">新朋友</h4>
                {freshAccepted.map((alert) => {
                  const { name, tag } = splitRiotId(alert.riotId);
                  const active = selection?.kind === 'friend' && selection.id === alert.id;
                  return (
                    <div key={alert.id} className="msg-inbox" data-kind="friend" aria-current={active ? 'true' : undefined}>
                      <button type="button" className="msg-inbox__main" onClick={() => openAccepted(alert)}>
                        <span className="hub-avatar">
                          <ProfileIcon iconId={alert.icon} src={alert.iconUrl} srcs={alert.iconUrls} alt={name} size={40} />
                          <AvatarBadge tone="ok"><UserCheck /></AvatarBadge>
                        </span>
                        <span className="msg-inbox__text">
                          <b>{name}{tag && <small>#{tag}</small>}</b>
                          <span>{formatAgo(alert.acceptedAt)}</span>
                        </span>
                      </button>
                      <button type="button" className="msg-round" data-tone="ghost" onClick={() => dismissAccepted(alert)} title="知道了" aria-label="不再显示">
                        <X />
                      </button>
                    </div>
                  );
                })}
              </>
            )}

            {!query && hasInbox && <h4 className="msg-group">会话</h4>}

            {chatLoading && !chatLoaded ? (
              <div className="hub-side__empty">读取中…</div>
            ) : chatError && conversations.length === 0 ? (
              <div className="hub-side__empty" data-tone="error">
                {chatError.includes('未连接') ? '未连接客户端' : `读取失败：${chatError}`}
              </div>
            ) : filtered.length === 0 ? (
              <div className="hub-side__empty">{query ? '无匹配' : '暂无会话'}</div>
            ) : (
              filtered.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  active={selection?.kind === 'chat' && selection.id === conversation.id}
                  onClick={() => setSelection({ kind: 'chat', id: conversation.id })}
                />
              ))
            )}
          </div>
        </aside>

        <main className="hub-main">
          {selection?.kind === 'add' ? (
            <AddFriendPanel
              outgoing={outgoing}
              acceptedAlerts={acceptedAlerts}
              busyKey={busyKey}
              onAdd={addFriend}
              onWithdraw={(request) => void removeRequest(request, 'withdraw')}
              onViewPlayer={viewPlayer}
            />
          ) : selectedRequest ? (
            <PlayerPeek
              key={selectedRequest.puuid}
              puuid={selectedRequest.puuid}
              riotId={requestRiotId(selectedRequest)}
              icon={selectedRequest.icon}
              iconUrl={selectedRequest.iconUrl}
              iconUrls={selectedRequest.iconUrls}
              tag={<span className="pv-chip" data-tone="ally"><UserPlus />请求添加好友</span>}
              note={selectedRequest.note}
              onViewPlayer={viewPlayer}
              actions={(
                <>
                  <button type="button" className="hub-btn" data-variant="primary" disabled={busyKey === `request:${selectedRequest.puuid}`} onClick={() => void accept(selectedRequest)}>
                    <Check />
                    通过
                  </button>
                  <button type="button" className="hub-btn" disabled={busyKey === `request:${selectedRequest.puuid}`} onClick={() => void removeRequest(selectedRequest, 'decline')}>
                    拒绝
                  </button>
                  <button type="button" className="hub-btn" data-variant="ghost" onClick={() => viewPlayer(requestRiotId(selectedRequest))}>
                    <UserRoundSearch />
                    完整战绩
                  </button>
                </>
              )}
            />
          ) : selectedFriend ? (
            <PlayerPeek
              key={selectedFriend.id}
              puuid={selectedFriend.puuid}
              riotId={selectedFriend.riotId}
              icon={selectedFriend.icon}
              iconUrl={selectedFriend.iconUrl}
              iconUrls={selectedFriend.iconUrls}
              tag={<span className="pv-chip" data-tone="ok"><UserCheck />{formatAgo(selectedFriend.acceptedAt)}成为好友</span>}
              onViewPlayer={viewPlayer}
              actions={(
                <>
                  {conversationByPuuid.get(selectedFriend.puuid) && (
                    <button
                      type="button"
                      className="hub-btn"
                      data-variant="primary"
                      onClick={() => {
                        const conversation = conversationByPuuid.get(selectedFriend.puuid);
                        if (conversation) setSelection({ kind: 'chat', id: conversation.id });
                      }}
                    >
                      <MessageCircleMore />
                      发消息
                    </button>
                  )}
                  <button type="button" className="hub-btn" onClick={() => viewPlayer(selectedFriend.riotId)}>
                    <UserRoundSearch />
                    完整战绩
                  </button>
                </>
              )}
            />
          ) : selectedConversation ? (
            <ChatPanel
              key={selectedConversation.id}
              conversation={selectedConversation}
              readOnly={readOnly}
              onSent={() => loadConversations(undefined, true)}
              onViewPlayer={viewPlayer}
            />
          ) : (
            <div className="hub-empty">
              <span className="hub-empty__art"><MessageCircleMore /></span>
            </div>
          )}
        </main>
      </div>
    </HubDialog>
  );
}

function ConversationRow({
  conversation,
  active,
  onClick,
}: {
  conversation: ChatConversation;
  active: boolean;
  onClick: () => void;
}) {
  const { name, tag } = splitRiotId(conversation.riotId);
  const status = conversationStatus(conversation);
  const unread = conversation.unreadMessageCount;
  const last = conversation.messages.at(-1);
  const preview = conversation.lastMessage || last?.body || '';
  return (
    <button
      type="button"
      className="msg-row"
      aria-current={active ? 'true' : undefined}
      data-muted={conversation.friendDeleted ? 'true' : 'false'}
      onClick={onClick}
    >
      <span className="hub-avatar">
        <ProfileIcon iconId={conversation.icon} src={conversation.iconUrl} srcs={conversation.iconUrls} alt={name} size={40} />
        {unread > 0 && <AvatarBadge tone="alert">{unread > 99 ? '99+' : unread}</AvatarBadge>}
      </span>
      <span className="msg-row__body">
        <span className="msg-row__top">
          <b>{name}</b>
          {tag && <small>#{tag}</small>}
          <time>{formatListTime(chatTimestamp(conversation.lastMessageAt))}</time>
        </span>
        <span className="msg-row__preview" data-unread={unread > 0 ? 'true' : 'false'}>
          {status && <span className="hub-tag">{status}</span>}
          {last?.fromSelf && <span className="msg-row__me">我：</span>}
          <span className="truncate">{preview}</span>
        </span>
      </span>
    </button>
  );
}
