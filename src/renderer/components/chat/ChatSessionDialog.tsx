import {
  MessageCircleMore,
  RefreshCw,
  Search,
  SendHorizontal,
  Smile,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ChatConversation, ChatMessage } from '../../../shared/api';
import { ProfileIcon } from '../ProfileIcon';

const CHAT_REFRESH_INTERVAL_MS = 5_000;
const EMOJI_PAGES = [
  {
    label: '笑脸',
    title: '😀 笑脸与情感',
    groups: [
      {
        title: '😀 笑脸与情感',
        emojis: [
          '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
          '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
          '😘', '😗', '☺️', '😚', '😙', '🥲', '😋', '😛',
          '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
          '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄',
          '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷',
          '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴',
          '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕',
          '😟', '😒', '😣', '😞', '😟', '😢', '😭', '😤',
          '😠', '😡', '🤬', '🥺', '😨', '😰', '😱', '😖',
          '😞', '😓', '😩', '😫', '🥱', '😵', '😲', '😳',
          '🤔', '🫡', '😴', '💤', '😬', '🙄', '😏', '😬',
          '🤥', '😌', '😔', '😋',
        ],
      },
    ],
  },
  {
    label: '更多',
    title: '❤️ 心形 / 👋 手势 / 🔢 数字',
    groups: [
      {
        title: '❤️ 心形与情感符号',
        emojis: [
          '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
          '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖',
          '💘', '💝', '💟', '♥️', '💋', '💌', '😘', '😍',
          '🥰', '💑', '👩‍❤️‍👨', '💏', '💆', '💇', '🧖', '🧖‍♀️',
          '🧖‍♂️', '🫂', '🤝', '🤗',
        ],
      },
      {
        title: '👋 手势与肢体',
        emojis: [
          '👋', '🤚', '🖐', '✋', '🖖', '👌', '🤌', '🤏',
          '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆',
          '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛',
          '🤜', '👏', '🙌', '👐', '🤲', '🙏', '✍️', '💅',
          '🤝', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '👃',
          '🧠', '🦷', '🦴', '👀', '👁', '👅', '👄',
        ],
      },
      {
        title: '🔢 数字表情',
        emojis: [
          '#️⃣', '*️⃣', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣',
          '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢',
        ],
      },
    ],
  },
];

function uniqueEmojis(emojis: string[]): string[] {
  return Array.from(new Set(emojis));
}

function timestampValue(value: string): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatConversationTime(value: string): string {
  const timestamp = timestampValue(value);
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return '昨天';
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function formatMessageTime(value: string): string {
  const timestamp = timestampValue(value);
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function MessageBubble({
  message,
  conversation,
}: {
  message: ChatMessage;
  conversation: ChatConversation;
}) {
  const isSystem = message.type !== 'chat' && message.type !== '';
  if (isSystem) {
    return (
      <div className="flex flex-col items-center gap-1 py-1">
        {message.timestamp && (
          <span className="text-[10px] text-app-subtle">
            {formatMessageTime(message.timestamp)}
          </span>
        )}
        <span className="max-w-[70%] rounded-full bg-app-bg-soft px-3 py-1 text-center text-[11px] text-app-muted">
          {message.body}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex gap-2.5 ${message.fromSelf ? 'flex-row-reverse' : ''}`}>
      <ProfileIcon
        iconId={message.fromSelf ? undefined : conversation.icon}
        src={message.fromSelf ? undefined : conversation.iconUrl}
        srcs={message.fromSelf ? [] : conversation.iconUrls}
        alt={message.fromSelf ? '我' : conversation.riotId}
        size={34}
        className="mt-4 border border-app-border"
      />
      <div className={`max-w-[68%] ${message.fromSelf ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className="mb-1 flex items-center gap-2 text-[10px] text-app-subtle">
          {!message.fromSelf && (
            <span className="max-w-48 truncate">
              {message.senderRiotId || conversation.riotId}
            </span>
          )}
          <span>{formatMessageTime(message.timestamp)}</span>
        </div>
        <div
          className={`whitespace-pre-wrap break-words rounded-md px-3 py-2 text-sm leading-5 shadow-sm ${
            message.fromSelf
              ? 'rounded-tr-xs bg-app-primary text-white'
              : 'rounded-tl-xs border border-app-border bg-app-surface text-app-text'
          }`}
        >
          {message.body}
        </div>
      </div>
    </div>
  );
}

export function ChatSessionDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiPageIndex, setEmojiPageIndex] = useState(0);
  const loadingRef = useRef(false);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const closeDialog = useCallback(() => {
    setSearch('');
    setDraft('');
    setSendError('');
    setEmojiOpen(false);
    setEmojiPageIndex(0);
    onClose();
  }, [onClose]);

  const loadConversations = useCallback(async (showLoading: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (showLoading) setLoading(true);
    else setRefreshing(true);
    try {
      const next = await window.lolHelper.lcu.getChatConversations();
      setConversations(next);
      setSelectedId((current) => {
        if (current && next.some((conversation) => conversation.id === current)) {
          return current;
        }
        return next[0]?.id ?? '';
      });
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      if (showLoading) setConversations([]);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    setSearch('');
    void loadConversations(true);
    const timer = window.setInterval(() => {
      void loadConversations(false);
    }, CHAT_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadConversations, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDialog();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeDialog, open]);

  useEffect(() => {
    if (!emojiOpen) return undefined;
    const closeEmojiPicker = (event: MouseEvent) => {
      if (
        event.target instanceof Node
        && !emojiPickerRef.current?.contains(event.target)
      ) {
        setEmojiOpen(false);
      }
    };
    document.addEventListener('mousedown', closeEmojiPicker);
    return () => document.removeEventListener('mousedown', closeEmojiPicker);
  }, [emojiOpen]);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) =>
      conversation.riotId.toLowerCase().includes(query)
      || conversation.lastMessage.toLowerCase().includes(query)
      || conversation.messages.some((message) =>
        message.body.toLowerCase().includes(query)));
  }, [conversations, search]);

  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedId,
  ) ?? null;
  const activeEmojiPage = EMOJI_PAGES[emojiPageIndex] ?? EMOJI_PAGES[0];

  const submitMessage = useCallback(async () => {
    const body = draft.trim();
    if (!selectedConversation || !body || sending) return;
    setSending(true);
    setSendError('');
    try {
      const result = await window.lolHelper.lcu.sendChatMessage(
        selectedConversation.id,
        body,
      );
      if (!result.success) {
        setSendError(result.message);
        return;
      }
      setDraft('');
      await loadConversations(false);
    } catch (sendFailure) {
      setSendError(
        sendFailure instanceof Error ? sendFailure.message : String(sendFailure),
      );
    } finally {
      setSending(false);
    }
  }, [draft, loadConversations, selectedConversation, sending]);

  const insertEmoji = useCallback((emoji: string) => {
    const textarea = textareaRef.current;
    const selectionStart = textarea?.selectionStart ?? draft.length;
    const selectionEnd = textarea?.selectionEnd ?? selectionStart;
    const nextDraft =
      draft.slice(0, selectionStart)
      + emoji
      + draft.slice(selectionEnd);
    if (nextDraft.length > 1000) return;

    setDraft(nextDraft);
    setEmojiOpen(false);
    const nextCursorPosition = selectionStart + emoji.length;
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(
        nextCursorPosition,
        nextCursorPosition,
      );
    });
  }, [draft]);

  useEffect(() => {
    if (!selectedConversation) return;
    messageEndRef.current?.scrollIntoView({ block: 'end' });
  }, [selectedConversation, selectedConversation?.messages.length]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <section className="flex h-[680px] max-h-[88vh] w-[1040px] max-w-[94vw] overflow-hidden rounded-md border border-app-border bg-app-surface shadow-airbnb">
        <aside className="flex w-[330px] shrink-0 flex-col border-r border-app-border bg-app-bg-soft">
          <header className="border-b border-app-border px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-sm bg-app-primary-soft text-app-primary">
                <MessageCircleMore className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-app-text">会话管理</h2>
                <p className="text-[11px] text-app-muted">
                  {conversations.length} 个有聊天记录的玩家
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadConversations(false)}
                disabled={loading || refreshing}
                title="刷新会话"
                aria-label="刷新会话"
                className="flex size-8 items-center justify-center rounded-sm text-app-muted hover:bg-app-nav-hover hover:text-app-text disabled:opacity-50"
              >
                <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="relative mt-3">
              <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-app-subtle" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索玩家或聊天内容"
                className="h-8 w-full rounded-sm border border-app-border bg-app-surface pr-3 pl-8 text-xs text-app-text outline-none placeholder:text-app-subtle focus:border-app-primary"
              />
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex h-40 items-center justify-center text-xs text-app-muted">
                正在读取聊天记录…
              </div>
            ) : error ? (
              <div className="m-4 rounded-sm border border-app-danger/20 bg-red-50 p-3 text-xs leading-5 text-app-danger">
                {error.includes('未连接')
                  ? '未连接英雄联盟客户端，启动客户端并登录后再试。'
                  : `会话读取失败：${error}`}
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 px-6 text-center">
                <MessageCircleMore className="size-7 text-app-border-strong" />
                <span className="text-xs text-app-muted">
                  {search ? '没有匹配的会话' : '当前账号暂无聊天记录'}
                </span>
              </div>
            ) : (
              filteredConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(conversation.id);
                    setDraft('');
                    setSendError('');
                    setEmojiOpen(false);
                    setEmojiPageIndex(0);
                  }}
                  className={`flex w-full items-center gap-3 border-b border-app-border/70 px-3 py-3 text-left transition-colors ${
                    selectedId === conversation.id
                      ? 'bg-app-surface'
                      : 'hover:bg-app-nav-hover'
                  }`}
                >
                  <div className="relative shrink-0">
                    <ProfileIcon
                      iconId={conversation.icon}
                      src={conversation.iconUrl}
                      srcs={conversation.iconUrls}
                      alt={conversation.riotId}
                      size={42}
                      className="border border-app-border"
                    />
                    {conversation.unreadMessageCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 flex min-w-4 items-center justify-center rounded-full bg-app-primary px-1 text-[9px] font-semibold leading-4 text-white">
                        {conversation.unreadMessageCount > 99
                          ? '99+'
                          : conversation.unreadMessageCount}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-app-text">
                        {conversation.riotId}
                      </span>
                      <span className="shrink-0 text-[10px] text-app-subtle">
                        {formatConversationTime(conversation.lastMessageAt)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-app-muted">
                      {conversation.lastMessage}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col bg-app-bg">
          <header className="flex h-[65px] shrink-0 items-center gap-3 border-b border-app-border px-5">
            {selectedConversation ? (
              <>
                <ProfileIcon
                  iconId={selectedConversation.icon}
                  src={selectedConversation.iconUrl}
                  srcs={selectedConversation.iconUrls}
                  alt={selectedConversation.riotId}
                  size={36}
                  className="border border-app-border"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-app-text">
                    {selectedConversation.riotId}
                  </div>
                  <div className="text-[11px] text-app-muted">
                    共 {selectedConversation.messages.length} 条聊天内容
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 text-sm font-semibold text-app-text">聊天内容</div>
            )}
            <button
              type="button"
              onClick={closeDialog}
              title="关闭会话管理"
              aria-label="关闭会话管理"
              className="flex size-8 items-center justify-center rounded-sm text-app-muted hover:bg-app-surface-soft hover:text-app-text"
            >
              <X className="size-4" />
            </button>
          </header>

          {selectedConversation ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto bg-app-bg-soft px-6 py-5">
                <div className="mx-auto max-w-[680px] space-y-4">
                  {selectedConversation.messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      conversation={selectedConversation}
                    />
                  ))}
                  <div ref={messageEndRef} />
                </div>
              </div>
              <div className="shrink-0 border-t border-app-border bg-app-surface p-4">
                <div className="mx-auto max-w-[680px]">
                  {sendError && (
                    <div className="mb-2 text-xs text-app-danger">{sendError}</div>
                  )}
                  <div className="rounded-md border border-app-border bg-app-bg-soft transition-colors focus-within:border-app-primary">
                    <textarea
                      ref={textareaRef}
                      value={draft}
                      maxLength={1000}
                      rows={3}
                      disabled={sending}
                      placeholder={`发送给 ${selectedConversation.riotId}`}
                      onChange={(event) => {
                        setDraft(event.target.value);
                        if (sendError) setSendError('');
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.key === 'Enter'
                          && !event.shiftKey
                          && !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault();
                          void submitMessage();
                        }
                      }}
                      className="block min-h-24 w-full resize-none bg-transparent px-3 pt-3 pb-2 text-sm leading-5 text-app-text outline-none placeholder:text-app-subtle disabled:opacity-60"
                    />
                    <div className="flex items-center gap-2 px-2 pb-2">
                      <div ref={emojiPickerRef} className="relative">
                        <button
                          type="button"
                          onClick={() => setEmojiOpen((current) => !current)}
                          title="选择表情"
                          aria-label="选择表情"
                          aria-expanded={emojiOpen}
                          className={`flex size-8 items-center justify-center rounded-sm transition-colors ${
                            emojiOpen
                              ? 'bg-app-primary-soft text-app-primary'
                              : 'text-app-muted hover:bg-app-surface hover:text-app-text'
                          }`}
                        >
                          <Smile className="size-[18px]" />
                        </button>
                        {emojiOpen && (
                          <div className="absolute bottom-10 left-0 z-40 w-[356px] rounded-md border border-app-border bg-app-surface p-2 shadow-airbnb">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <div className="min-w-0 truncate px-1 text-[11px] font-medium text-app-muted">
                                {activeEmojiPage.title}
                              </div>
                              <div className="flex shrink-0 rounded-sm bg-app-bg-soft p-0.5">
                                {EMOJI_PAGES.map((page, index) => (
                                  <button
                                    key={page.label}
                                    type="button"
                                    onClick={() => setEmojiPageIndex(index)}
                                    className={`h-6 rounded-xs px-2 text-[10px] font-medium transition-colors ${
                                      emojiPageIndex === index
                                        ? 'bg-app-surface text-app-primary shadow-sm'
                                        : 'text-app-muted hover:text-app-text'
                                    }`}
                                  >
                                    {index + 1} {page.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="max-h-[304px] space-y-3 overflow-y-auto pr-1">
                              {activeEmojiPage.groups.map((group) => (
                                <div key={group.title}>
                                  <div className="mb-1 px-1 text-[10px] font-medium text-app-subtle">
                                    {group.title}
                                  </div>
                                  <div className="grid grid-cols-9 gap-1">
                                    {uniqueEmojis(group.emojis).map((emoji) => (
                                      <button
                                        key={`${group.title}-${emoji}`}
                                        type="button"
                                        onClick={() => insertEmoji(emoji)}
                                        className="flex size-8 items-center justify-center rounded-sm text-xl transition-colors hover:bg-app-nav-hover"
                                        title={emoji}
                                        aria-label={`插入表情 ${emoji}`}
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-app-subtle">
                        Enter 发送 · Shift+Enter 换行
                      </span>
                      <span className="ml-auto text-[10px] text-app-subtle">
                        {draft.length}/1000
                      </span>
                      <button
                        type="button"
                        onClick={() => void submitMessage()}
                        disabled={!draft.trim() || sending}
                        className="flex h-8 shrink-0 items-center gap-1.5 rounded-sm bg-app-primary px-3 text-xs font-semibold text-white transition-colors hover:bg-app-primary-hover disabled:cursor-not-allowed disabled:bg-app-nav-hover disabled:text-app-subtle"
                      >
                        <SendHorizontal className="size-3.5" />
                        {sending ? '发送中' : '发送'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-app-bg-soft">
                <MessageCircleMore className="size-6 text-app-border-strong" />
              </div>
              <div>
                <p className="text-sm font-medium text-app-text">选择一个会话</p>
                <p className="mt-1 text-xs text-app-muted">
                  左侧会显示当前账号所有有聊天内容的玩家
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
