import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ChatAccountSummary,
  ChatConversation,
  ChatConversationsResponse,
  ChatMessage,
} from '../../shared/api';

const CHAT_ARCHIVE_FILE = 'lolhelper-chat-archive.json';
const UNKNOWN_OWNER_KEY = '__unknown__';

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

function normalizeKey(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function riotId(gameName: string | undefined, gameTag: string | undefined): string {
  const name = gameName?.trim() ?? '';
  const tag = gameTag?.trim() ?? '';
  if (!name) return '';
  return tag ? `${name}#${tag}` : name;
}

function ownerKeyFromValues(owner: {
  key?: string;
  puuid?: string;
  riotId?: string;
  gameName?: string;
  gameTag?: string;
}): string {
  return normalizeKey(owner.key)
    || normalizeKey(owner.puuid)
    || normalizeKey(owner.riotId)
    || normalizeKey(riotId(owner.gameName, owner.gameTag))
    || normalizeKey(owner.gameName);
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

function inferredOwnerRiotId(messages: ChatMessage[]): string {
  return messages.find((message) => message.fromSelf && message.senderRiotId.trim())
    ?.senderRiotId.trim() ?? '';
}

function conversationOwnerKey(conversation: ChatConversation): string {
  return ownerKeyFromValues({
    key: conversation.ownerKey,
    puuid: conversation.ownerPuuid,
    riotId: conversation.ownerRiotId,
    gameName: conversation.ownerGameName,
    gameTag: conversation.ownerGameTag,
  });
}

function ownerMatches(conversation: ChatConversation, ownerKey: string): boolean {
  const normalizedOwnerKey = normalizeKey(ownerKey);
  const conversationKey = conversationOwnerKey(conversation);
  if (!normalizedOwnerKey) return true;
  if (normalizedOwnerKey === UNKNOWN_OWNER_KEY) return !conversationKey;
  return conversationKey === normalizedOwnerKey;
}

function sameConversationOwner(a: ChatConversation, b: ChatConversation): boolean {
  const aOwner = conversationOwnerKey(a);
  const bOwner = conversationOwnerKey(b);
  if (!aOwner && !bOwner) return true;
  return Boolean(aOwner && bOwner && aOwner === bOwner);
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
  if (!sameConversationOwner(a, b)) return false;
  const aKeys = new Set(conversationKeys(a));
  return conversationKeys(b).some((key) => aKeys.has(key));
}

function firstNonEmpty(primary: string | undefined, fallback: string | undefined): string {
  return primary?.trim() || fallback?.trim() || '';
}

function mergeUrlList(primary: string[] | undefined, fallback: string[] | undefined): string[] {
  return Array.from(new Set([...(primary ?? []), ...(fallback ?? [])].filter(Boolean)));
}

function accountFromConversation(conversation: ChatConversation): ChatAccountSummary {
  const key = conversationOwnerKey(conversation) || UNKNOWN_OWNER_KEY;
  const ownerIcon = conversation.ownerIcon ?? conversation.selfIcon ?? 0;
  const ownerIconUrls = mergeUrlList(conversation.ownerIconUrls, conversation.selfIconUrls);
  const ownerIconUrl = firstNonEmpty(conversation.ownerIconUrl, conversation.selfIconUrl)
    || ownerIconUrls[0]
    || '';
  const ownerRiotId = firstNonEmpty(
    conversation.ownerRiotId,
    inferredOwnerRiotId(conversation.messages),
  );
  return {
    key,
    riotId: ownerRiotId || '未识别账号',
    gameName: conversation.ownerGameName ?? '',
    gameTag: conversation.ownerGameTag ?? '',
    puuid: conversation.ownerPuuid ?? '',
    icon: ownerIcon,
    iconUrl: ownerIconUrl,
    iconUrls: ownerIconUrls,
    conversationCount: 0,
    lastMessageAt: '',
    unknown: key === UNKNOWN_OWNER_KEY,
  };
}

function mergeAccountSummary(
  primary: ChatAccountSummary,
  fallback?: ChatAccountSummary,
): ChatAccountSummary {
  if (!fallback) return primary;
  const icon = primary.icon > 0 ? primary.icon : fallback.icon;
  const iconUrls = mergeUrlList(primary.iconUrls, fallback.iconUrls);
  const lastMessageAt =
    timestampValue(primary.lastMessageAt) >= timestampValue(fallback.lastMessageAt)
      ? primary.lastMessageAt
      : fallback.lastMessageAt;
  return {
    ...fallback,
    ...primary,
    key: primary.key || fallback.key,
    riotId: firstNonEmpty(primary.riotId, fallback.riotId) || '未识别账号',
    gameName: firstNonEmpty(primary.gameName, fallback.gameName),
    gameTag: firstNonEmpty(primary.gameTag, fallback.gameTag),
    puuid: firstNonEmpty(primary.puuid, fallback.puuid),
    icon,
    iconUrl: firstNonEmpty(primary.iconUrl, fallback.iconUrl) || iconUrls[0] || '',
    iconUrls,
    conversationCount: Math.max(primary.conversationCount, fallback.conversationCount),
    lastMessageAt,
    current: Boolean(primary.current || fallback.current),
    unknown: Boolean(primary.unknown || fallback.unknown),
  };
}

function buildAccountSummaries(
  conversations: ChatConversation[],
  currentOwner?: ChatAccountSummary,
): ChatAccountSummary[] {
  const byKey = new Map<string, ChatAccountSummary>();
  if (currentOwner?.key) {
    byKey.set(currentOwner.key, {
      ...currentOwner,
      current: true,
      conversationCount: 0,
      lastMessageAt: currentOwner.lastMessageAt ?? '',
    });
  }

  for (const conversation of conversations) {
    const account = accountFromConversation(conversation);
    const existing = byKey.get(account.key);
    byKey.set(account.key, mergeAccountSummary({
      ...account,
      conversationCount: (existing?.conversationCount ?? 0) + 1,
      lastMessageAt: conversation.lastMessageAt,
      current: currentOwner?.key === account.key,
    }, existing));
  }

  return Array.from(byKey.values())
    .sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1;
      return timestampValue(b.lastMessageAt) - timestampValue(a.lastMessageAt);
    });
}

function buildChatResponse(
  conversations: ChatConversation[],
  selectedAccountKey: string | undefined,
  currentOwner?: ChatAccountSummary,
): ChatConversationsResponse {
  const accounts = buildAccountSummaries(conversations, currentOwner);
  const fallbackKey = currentOwner?.key || accounts[0]?.key || '';
  const normalizedSelectedKey = normalizeKey(selectedAccountKey) || fallbackKey;
  const selectedKey = accounts.some((account) => account.key === normalizedSelectedKey)
    ? normalizedSelectedKey
    : fallbackKey;
  const selectedConversations = selectedKey
    ? conversations.filter((conversation) => ownerMatches(conversation, selectedKey))
    : [];
  const selectedAccount = accounts.find((account) => account.key === selectedKey);
  const currentAccount = currentOwner
    ? accounts.find((account) => account.key === currentOwner.key) ?? currentOwner
    : undefined;

  return {
    conversations: selectedConversations.map((conversation) => ({
      ...conversation,
      archivedOnly: selectedKey !== currentOwner?.key ? true : conversation.archivedOnly,
      friendDeleted: selectedKey !== currentOwner?.key ? false : conversation.friendDeleted,
      unreadMessageCount: selectedKey !== currentOwner?.key ? 0 : conversation.unreadMessageCount,
    })),
    accounts,
    currentAccount,
    selectedAccount,
    selectedAccountKey: selectedKey,
    readOnly: !currentOwner?.key || selectedKey !== currentOwner.key,
  };
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
  const ownerIcon = (primary.ownerIcon ?? 0) > 0 ? primary.ownerIcon : fallback.ownerIcon;
  const ownerIconUrl = firstNonEmpty(primary.ownerIconUrl, fallback.ownerIconUrl) || undefined;
  const ownerIconUrls = mergeUrlList(primary.ownerIconUrls, fallback.ownerIconUrls);

  return {
    ...fallback,
    ...primary,
    id: firstNonEmpty(primary.id, fallback.id),
    type: firstNonEmpty(primary.type, fallback.type) || 'chat',
    gameName: firstNonEmpty(primary.gameName, fallback.gameName),
    gameTag: firstNonEmpty(primary.gameTag, fallback.gameTag),
    riotId: firstNonEmpty(primary.riotId, fallback.riotId) || '未知玩家',
    puuid: firstNonEmpty(primary.puuid, fallback.puuid),
    ownerKey: firstNonEmpty(primary.ownerKey, fallback.ownerKey),
    ownerRiotId: firstNonEmpty(primary.ownerRiotId, fallback.ownerRiotId),
    ownerPuuid: firstNonEmpty(primary.ownerPuuid, fallback.ownerPuuid),
    ownerGameName: firstNonEmpty(primary.ownerGameName, fallback.ownerGameName),
    ownerGameTag: firstNonEmpty(primary.ownerGameTag, fallback.ownerGameTag),
    ownerIcon,
    ownerIconUrl,
    ownerIconUrls: ownerIconUrls.length > 0 ? ownerIconUrls : undefined,
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
  const legacyOwnerRiotId = inferredOwnerRiotId(messages);
  const ownerGameName = typeof source.ownerGameName === 'string' ? source.ownerGameName : '';
  const ownerGameTag = typeof source.ownerGameTag === 'string' ? source.ownerGameTag : '';
  const ownerRiotId = typeof source.ownerRiotId === 'string'
    ? source.ownerRiotId
    : legacyOwnerRiotId;
  const ownerPuuid = typeof source.ownerPuuid === 'string' ? source.ownerPuuid : '';
  const ownerKey = ownerKeyFromValues({
    key: typeof source.ownerKey === 'string' ? source.ownerKey : '',
    puuid: ownerPuuid,
    riotId: ownerRiotId,
    gameName: ownerGameName,
    gameTag: ownerGameTag,
  });
  return {
    id: source.id,
    type: typeof source.type === 'string' ? source.type : 'chat',
    gameName: typeof source.gameName === 'string' ? source.gameName : '',
    gameTag: typeof source.gameTag === 'string' ? source.gameTag : '',
    riotId: typeof source.riotId === 'string' ? source.riotId : '未知玩家',
    puuid: typeof source.puuid === 'string' ? source.puuid : '',
    ownerKey,
    ownerRiotId,
    ownerPuuid,
    ownerGameName,
    ownerGameTag,
    ownerIcon: Number.isFinite(source.ownerIcon) ? Number(source.ownerIcon) : source.selfIcon,
    ownerIconUrl: typeof source.ownerIconUrl === 'string' ? source.ownerIconUrl : source.selfIconUrl,
    ownerIconUrls: Array.isArray(source.ownerIconUrls)
      ? source.ownerIconUrls.filter((url): url is string => typeof url === 'string')
      : source.selfIconUrls,
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

function stampConversationOwner(
  conversation: ChatConversation,
  owner: ChatAccountSummary,
): ChatConversation {
  return {
    ...conversation,
    ownerKey: owner.key,
    ownerRiotId: owner.riotId,
    ownerPuuid: owner.puuid,
    ownerGameName: owner.gameName,
    ownerGameTag: owner.gameTag,
    ownerIcon: owner.icon,
    ownerIconUrl: owner.iconUrl,
    ownerIconUrls: owner.iconUrls,
    selfIcon: (conversation.selfIcon ?? 0) > 0 ? conversation.selfIcon : owner.icon,
    selfIconUrl: conversation.selfIconUrl || owner.iconUrl,
    selfIconUrls: conversation.selfIconUrls ?? owner.iconUrls,
  };
}

export function readChatArchiveForDisplay(
  selectedAccountKey?: string,
  currentOwner?: ChatAccountSummary,
): ChatConversationsResponse {
  const archived = dedupeConversations(readChatArchive()).map((conversation) => ({
    ...conversation,
    archivedOnly: true,
    unreadMessageCount: 0,
  }));
  return buildChatResponse(archived, selectedAccountKey, currentOwner);
}

export function mergeChatArchive(
  liveConversations: ChatConversation[],
  friendKeys: Set<string> | undefined,
  owner: ChatAccountSummary,
  selectedAccountKey?: string,
): ChatConversationsResponse {
  const ownerKey = owner.key;
  const liveOwned = liveConversations.map((conversation) =>
    stampConversationOwner(conversation, owner));
  const archived = dedupeConversations(readChatArchive());
  const archivedForOwner = archived.filter((conversation) =>
    ownerMatches(conversation, ownerKey));
  const otherArchived = archived.filter((conversation) =>
    !ownerMatches(conversation, ownerKey));
  const usedArchivedIndexes = new Set<number>();
  const merged: ChatConversation[] = [];

  for (const live of liveOwned) {
    const archivedIndex = archivedForOwner.findIndex((conversation, index) =>
      !usedArchivedIndexes.has(index) && conversationsMatch(conversation, live));
    const archivedConversation = archivedIndex >= 0 ? archivedForOwner[archivedIndex] : undefined;
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

  for (const [index, archivedConversation] of archivedForOwner.entries()) {
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

  const sorted = dedupeConversations([...otherArchived, ...merged]);
  writeChatArchive(sorted);
  return buildChatResponse(sorted, selectedAccountKey || ownerKey, owner);
}
