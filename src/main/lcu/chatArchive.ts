import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { ChatConversation, ChatMessage } from '../../shared/api';

const CHAT_ARCHIVE_FILE = 'lolhelper-chat-archive.json';

function archivePath(): string {
  return path.join(app.getPath('userData'), CHAT_ARCHIVE_FILE);
}

function timestampValue(value: string): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<ChatMessage>;
  const body = typeof source.body === 'string' ? source.body : '';
  if (!body) return null;
  return {
    id: typeof source.id === 'string' ? source.id : '',
    body,
    type: typeof source.type === 'string' ? source.type : 'chat',
    timestamp: typeof source.timestamp === 'string' ? source.timestamp : '',
    fromSelf: Boolean(source.fromSelf),
    senderRiotId: typeof source.senderRiotId === 'string' ? source.senderRiotId : '',
  };
}

function messageKey(message: ChatMessage): string {
  return message.id
    || [
      message.fromSelf ? 'self' : 'other',
      message.timestamp,
      message.senderRiotId,
      message.body,
    ].join('|');
}

function mergeMessages(
  archivedMessages: ChatMessage[],
  liveMessages: ChatMessage[],
): ChatMessage[] {
  const byKey = new Map<string, ChatMessage>();
  for (const message of archivedMessages) {
    byKey.set(messageKey(message), message);
  }
  for (const message of liveMessages) {
    byKey.set(messageKey(message), message);
  }
  return Array.from(byKey.values())
    .sort((a, b) => timestampValue(a.timestamp) - timestampValue(b.timestamp));
}

function conversationKeys(conversation: ChatConversation): string[] {
  return [
    conversation.id,
    conversation.puuid,
    conversation.riotId,
    conversation.gameName,
    conversation.gameTag ? `${conversation.gameName}#${conversation.gameTag}` : '',
  ]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value));
}

function isKnownFriend(
  conversation: ChatConversation,
  friendKeys?: Set<string>,
): boolean | null {
  if (!friendKeys) return null;
  const keys = conversationKeys(conversation);
  if (keys.length === 0) return null;
  return keys.some((key) => friendKeys.has(key));
}

function normalizeConversation(value: unknown): ChatConversation | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<ChatConversation>;
  const messages = Array.isArray(source.messages)
    ? source.messages.map(normalizeMessage).filter((message): message is ChatMessage => Boolean(message))
    : [];
  if (!source.id || typeof source.id !== 'string' || messages.length === 0) return null;
  const lastMessage = messages[messages.length - 1];
  return {
    id: source.id,
    type: typeof source.type === 'string' ? source.type : 'chat',
    gameName: typeof source.gameName === 'string' ? source.gameName : '',
    gameTag: typeof source.gameTag === 'string' ? source.gameTag : '',
    riotId: typeof source.riotId === 'string' ? source.riotId : '未知玩家',
    puuid: typeof source.puuid === 'string' ? source.puuid : '',
    icon: Number.isFinite(source.icon) ? Number(source.icon) : 0,
    iconUrl: typeof source.iconUrl === 'string' ? source.iconUrl : '',
    iconUrls: Array.isArray(source.iconUrls)
      ? source.iconUrls.filter((url): url is string => typeof url === 'string')
      : [],
    selfIcon: Number.isFinite(source.selfIcon) ? Number(source.selfIcon) : undefined,
    selfIconUrl: typeof source.selfIconUrl === 'string' ? source.selfIconUrl : undefined,
    selfIconUrls: Array.isArray(source.selfIconUrls)
      ? source.selfIconUrls.filter((url): url is string => typeof url === 'string')
      : undefined,
    friendDeleted: Boolean(source.friendDeleted),
    archivedOnly: Boolean(source.archivedOnly),
    unreadMessageCount: Number.isFinite(source.unreadMessageCount)
      ? Number(source.unreadMessageCount)
      : 0,
    lastMessage: typeof source.lastMessage === 'string' ? source.lastMessage : lastMessage?.body ?? '',
    lastMessageAt: typeof source.lastMessageAt === 'string' ? source.lastMessageAt : lastMessage?.timestamp ?? '',
    messages,
  };
}

export function readChatArchive(): ChatConversation[] {
  try {
    const raw = fs.readFileSync(archivePath(), 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeConversation)
      .filter((conversation): conversation is ChatConversation => Boolean(conversation))
      .sort((a, b) => timestampValue(b.lastMessageAt) - timestampValue(a.lastMessageAt));
  } catch {
    return [];
  }
}

function writeChatArchive(conversations: ChatConversation[]): void {
  const filePath = archivePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(conversations, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

function conversationArchiveKey(conversation: ChatConversation): string {
  return conversation.puuid || conversation.id || conversation.riotId;
}

export function readChatArchiveForDisplay(): ChatConversation[] {
  return readChatArchive().map((conversation) => ({
    ...conversation,
    archivedOnly: true,
    unreadMessageCount: 0,
  }));
}

export function mergeChatArchive(
  liveConversations: ChatConversation[],
  friendKeys?: Set<string>,
): ChatConversation[] {
  const archived = readChatArchive();
  const archivedByKey = new Map(
    archived.map((conversation) => [conversationArchiveKey(conversation), conversation]),
  );
  const liveKeys = new Set(liveConversations.map(conversationArchiveKey));
  const merged: ChatConversation[] = [];

  for (const live of liveConversations) {
    const archivedConversation = archivedByKey.get(conversationArchiveKey(live));
    const messages = mergeMessages(archivedConversation?.messages ?? [], live.messages);
    const lastMessage = messages[messages.length - 1];
    const knownFriend = isKnownFriend(live, friendKeys);
    merged.push({
      ...archivedConversation,
      ...live,
      messages,
      lastMessage: lastMessage?.body ?? live.lastMessage,
      lastMessageAt: lastMessage?.timestamp ?? live.lastMessageAt,
      friendDeleted: knownFriend === null ? Boolean(live.friendDeleted) : !knownFriend,
      archivedOnly: false,
    });
  }

  for (const archivedConversation of archived) {
    if (liveKeys.has(conversationArchiveKey(archivedConversation))) continue;
    const knownFriend = isKnownFriend(archivedConversation, friendKeys);
    merged.push({
      ...archivedConversation,
      archivedOnly: true,
      unreadMessageCount: 0,
      friendDeleted: knownFriend === null
        ? Boolean(archivedConversation.friendDeleted)
        : !knownFriend,
    });
  }

  const sorted = merged.sort(
    (a, b) => timestampValue(b.lastMessageAt) - timestampValue(a.lastMessageAt),
  );
  writeChatArchive(sorted);
  return sorted;
}
