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
  const gameName = conversation.gameName?.trim() ?? '';
  const gameTag = conversation.gameTag?.trim() ?? '';
  const fullRiotId = gameName && gameTag ? `${gameName}#${gameTag}` : '';
  return [
    conversation.id,
    conversation.puuid,
    conversation.riotId,
    fullRiotId,
    fullRiotId ? '' : gameName,
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

function conversationsMatch(a: ChatConversation, b: ChatConversation): boolean {
  const aKeys = new Set(conversationKeys(a));
  return conversationKeys(b).some((key) => aKeys.has(key));
}

function firstNonEmpty(primary: string | undefined, fallback: string | undefined): string {
  return primary?.trim() || fallback?.trim() || '';
}

function mergeUrlList(primary: string[] | undefined, fallback: string[] | undefined): string[] {
  return Array.from(new Set([...(primary ?? []), ...(fallback ?? [])].filter(Boolean)));
}

function mergeConversationData(
  primary: ChatConversation,
  fallback?: ChatConversation,
): ChatConversation {
  if (!fallback) return primary;
  const messages = mergeMessages(fallback.messages, primary.messages);
  const lastMessage = messages[messages.length - 1];
  const icon = primary.icon > 0 ? primary.icon : fallback.icon;
  const iconUrl = firstNonEmpty(primary.iconUrl, fallback.iconUrl);
  const iconUrls = mergeUrlList(primary.iconUrls, fallback.iconUrls);
  const selfIcon = (primary.selfIcon ?? 0) > 0 ? primary.selfIcon : fallback.selfIcon;
  const selfIconUrl = firstNonEmpty(primary.selfIconUrl, fallback.selfIconUrl) || undefined;
  const selfIconUrls = mergeUrlList(primary.selfIconUrls, fallback.selfIconUrls);

  return {
    ...fallback,
    ...primary,
    id: firstNonEmpty(primary.id, fallback.id),
    type: firstNonEmpty(primary.type, fallback.type) || 'chat',
    gameName: firstNonEmpty(primary.gameName, fallback.gameName),
    gameTag: firstNonEmpty(primary.gameTag, fallback.gameTag),
    riotId: firstNonEmpty(primary.riotId, fallback.riotId) || '未知玩家',
    puuid: firstNonEmpty(primary.puuid, fallback.puuid),
    icon,
    iconUrl: iconUrl || iconUrls[0] || '',
    iconUrls,
    selfIcon,
    selfIconUrl,
    selfIconUrls: selfIconUrls.length > 0 ? selfIconUrls : undefined,
    unreadMessageCount: primary.unreadMessageCount,
    lastMessage: lastMessage?.body ?? primary.lastMessage ?? fallback.lastMessage,
    lastMessageAt: lastMessage?.timestamp ?? primary.lastMessageAt ?? fallback.lastMessageAt,
    messages,
  };
}

function dedupeConversations(conversations: ChatConversation[]): ChatConversation[] {
  const deduped: ChatConversation[] = [];
  for (const conversation of conversations) {
    const existingIndex = deduped.findIndex((item) => conversationsMatch(item, conversation));
    if (existingIndex >= 0) {
      deduped[existingIndex] = mergeConversationData(deduped[existingIndex], conversation);
    } else {
      deduped.push(conversation);
    }
  }
  return deduped.sort(
    (a, b) => timestampValue(b.lastMessageAt) - timestampValue(a.lastMessageAt),
  );
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

export function readChatArchiveForDisplay(): ChatConversation[] {
  return dedupeConversations(readChatArchive()).map((conversation) => ({
    ...conversation,
    archivedOnly: true,
    unreadMessageCount: 0,
  }));
}

export function mergeChatArchive(
  liveConversations: ChatConversation[],
  friendKeys?: Set<string>,
): ChatConversation[] {
  const archived = dedupeConversations(readChatArchive());
  const usedArchivedIndexes = new Set<number>();
  const merged: ChatConversation[] = [];

  for (const live of liveConversations) {
    const archivedIndex = archived.findIndex((conversation, index) =>
      !usedArchivedIndexes.has(index) && conversationsMatch(conversation, live));
    const archivedConversation = archivedIndex >= 0 ? archived[archivedIndex] : undefined;
    if (archivedIndex >= 0) usedArchivedIndexes.add(archivedIndex);
    const mergedConversation = mergeConversationData(live, archivedConversation);
    const messages = mergedConversation.messages;
    const lastMessage = messages[messages.length - 1];
    const knownFriend = isKnownFriend(mergedConversation, friendKeys);
    merged.push({
      ...mergedConversation,
      messages,
      lastMessage: lastMessage?.body ?? mergedConversation.lastMessage,
      lastMessageAt: lastMessage?.timestamp ?? mergedConversation.lastMessageAt,
      friendDeleted: knownFriend === null ? Boolean(mergedConversation.friendDeleted) : !knownFriend,
      archivedOnly: false,
    });
  }

  for (const [index, archivedConversation] of archived.entries()) {
    if (usedArchivedIndexes.has(index)) continue;
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

  const sorted = dedupeConversations(merged);
  writeChatArchive(sorted);
  return sorted;
}
