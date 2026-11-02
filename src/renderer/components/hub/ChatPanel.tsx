import { useEffect, useMemo, useRef, useState } from 'react';
import { SendHorizontal, UserRoundSearch } from 'lucide-react';
import type { ChatConversation } from '../../../shared/api';
import { ProfileIcon } from '../ProfileIcon';
import { EmojiPicker } from './EmojiPicker';
import { buildChatBlocks, chatTimestamp, formatClock, splitRiotId } from './hubFormat';

// 聊天区：日期分隔、连续发言合并、自动长高的输入框。

const MAX_MESSAGE_LENGTH = 1000;

export function conversationStatus(conversation: ChatConversation): string {
  if (conversation.friendDeleted) return '已删除好友';
  if (conversation.archivedOnly) return '本地记录';
  return '';
}

export function ChatPanel({
  conversation,
  readOnly,
  onSent,
  onViewPlayer,
}: {
  conversation: ChatConversation;
  readOnly: boolean;
  onSent: () => Promise<void>;
  onViewPlayer: (riotId: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);
  const { name, tag } = splitRiotId(conversation.riotId);
  const status = conversationStatus(conversation);
  const canSend = !readOnly && !conversation.friendDeleted && !conversation.archivedOnly;
  const blocks = useMemo(() => buildChatBlocks(conversation.messages), [conversation.messages]);
  const lastMessage = conversation.messages.at(-1);
  const messageVersion = `${conversation.messages.length}:${lastMessage?.id ?? ''}`;

  useEffect(() => {
    const list = listRef.current;
    if (!list || !stickToBottomRef.current) return undefined;
    const frame = window.requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messageVersion]);

  useEffect(() => {
    if (canSend) textareaRef.current?.focus();
  }, [canSend]);

  const resizeTextarea = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`;
  };

  useEffect(resizeTextarea, [draft]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || sending || !canSend) return;
    setSending(true);
    setSendError('');
    try {
      const result = await window.lolHelper.lcu.sendChatMessage(conversation.id, body);
      if (!result.success) {
        setSendError(result.message || '发送失败');
        return;
      }
      setDraft('');
      stickToBottomRef.current = true;
      await onSent();
    } catch (error) {
      setSendError(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  };

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? draft.length;
    const end = textarea?.selectionEnd ?? start;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    if (next.length > MAX_MESSAGE_LENGTH) return;
    setDraft(next);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const lockedReason = readOnly
    ? '只读记录'
    : conversation.friendDeleted
      ? '已删除好友'
      : conversation.archivedOnly
        ? '本地记录，暂不能发送'
        : '';

  return (
    <div className="msg-chat">
      <header className="msg-chat__head">
        <ProfileIcon iconId={conversation.icon} src={conversation.iconUrl} srcs={conversation.iconUrls} alt={name} size={36} />
        <div className="msg-chat__who">
          <b data-selectable="true">{name}{tag && <small>#{tag}</small>}</b>
          {status && <span>{status}</span>}
        </div>
        <button type="button" className="hub-btn" onClick={() => onViewPlayer(conversation.riotId)} title="在战绩页查看 TA 的战绩">
          <UserRoundSearch />
          查战绩
        </button>
      </header>

      <div
        ref={listRef}
        className="msg-chat__list"
        onScroll={(event) => {
          const list = event.currentTarget;
          stickToBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
        }}
      >
        <div className="msg-chat__inner">
          {blocks.map((block) => {
            if (block.kind === 'day') {
              return <h4 key={block.key} className="hub-day-label"><span>{block.label}</span></h4>;
            }
            if (block.kind === 'system') {
              return <div key={block.key} className="msg-system">{block.message.body}</div>;
            }
            const self = block.fromSelf;
            return (
              <div key={block.key} className="msg-run" data-self={self ? 'true' : 'false'}>
                <ProfileIcon
                  iconId={self ? conversation.selfIcon : conversation.icon}
                  src={self ? conversation.selfIconUrl : conversation.iconUrl}
                  srcs={self ? conversation.selfIconUrls ?? [] : conversation.iconUrls}
                  alt={self ? '我' : name}
                  size={32}
                  className="msg-run__avatar"
                />
                <div className="msg-run__stack">
                  <span className="msg-run__meta">
                    {!self && block.sender && block.sender !== conversation.riotId && <b>{splitRiotId(block.sender).name}</b>}
                    {block.time > 0 && formatClock(block.time)}
                  </span>
                  {block.messages.map((message) => (
                    <div
                      key={message.id}
                      className="msg-bubble"
                      data-selectable="true"
                      title={formatClock(chatTimestamp(message.timestamp))}
                    >
                      {message.body}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {canSend ? (
        <div className="msg-compose">
          {sendError && <div className="msg-compose__error">{sendError}</div>}
          <div className="msg-compose__box">
            <EmojiPicker disabled={sending} onPick={insertEmoji} />
            <textarea
              ref={textareaRef}
              rows={1}
              value={draft}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder="发消息"
              onChange={(event) => {
                setDraft(event.target.value);
                if (sendError) setSendError('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
            <button
              type="button"
              className="msg-send"
              onClick={() => void submit()}
              disabled={!draft.trim() || sending}
              aria-label="发送"
              title="发送 (Enter)"
            >
              <SendHorizontal />
            </button>
          </div>
          {draft.length > MAX_MESSAGE_LENGTH * 0.8 && (
            <div className="msg-compose__hint">{draft.length}/{MAX_MESSAGE_LENGTH}</div>
          )}
        </div>
      ) : (
        <div className="msg-locked">{lockedReason}</div>
      )}
    </div>
  );
}
