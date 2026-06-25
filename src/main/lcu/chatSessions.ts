import type {
  ChatConversation,
  ChatMessage,
  FriendActionResult,
} from '../../shared/api';
import { buildProfileIconCandidates } from '../../shared/gameAssets';
import { LcuClient } from './client';

type RawRecord = Record<string, unknown>;

const CHAT_MESSAGE_CONCURRENCY = 6;
export const CHAT_MESSAGE_MAX_LENGTH = 1000;

interface ChatPostClient {
  post(requestPath: string, body: unknown): Promise<unknown>;
}

function asRecord(value: unknown): RawRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as RawRecord
    : {};
}

function asRecords(value: unknown, nestedKey?: string): RawRecord[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is RawRecord =>
      Boolean(item && typeof item === 'object' && !Array.isArray(item)));
  }
  const nested = nestedKey ? asRecord(value)[nestedKey] : undefined;
  return Array.isArray(nested)
    ? nested.filter((item): item is RawRecord =>
      Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    : [];
}

function readString(source: RawRecord, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function readNumber(source: RawRecord, keys: string[]): number {
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return 0;
}

function readBoolean(source: RawRecord, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

function timestampValue(value: string): number {
  if (!value) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function riotId(gameName: string, gameTag: string): string {
  if (!gameName) return '';
  return gameTag ? `${gameName}#${gameTag}` : gameName;
}

function identityValues(source: RawRecord): Set<string> {
  const values = [
    readString(source, ['id']),
    readString(source, ['pid']),
    readString(source, ['puuid']),
    readString(source, ['summonerId']),
    readString(source, ['gameName']),
    riotId(
      readString(source, ['gameName']),
      readString(source, ['gameTag', 'tagLine']),
    ),
  ];
  return new Set(values.filter(Boolean).map((value) => value.toLowerCase()));
}

function identitiesOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const value of a) {
    if (b.has(value)) return true;
  }
  return false;
}

function participantRecords(conversation: RawRecord): RawRecord[] {
  return asRecords(
    conversation.participants
      ?? conversation.members
      ?? conversation.participant,
  );
}

function findConversationPartner(
  conversation: RawRecord,
  me: RawRecord,
  friends: RawRecord[],
): RawRecord {
  const meIdentity = identityValues(me);
  const participants = participantRecords(conversation);
  const participant = participants.find(
    (item) => !identitiesOverlap(identityValues(item), meIdentity),
  );

  const conversationIdentity = identityValues(conversation);
  const friend = friends.find((item) => {
    const friendIdentity = identityValues(item);
    return identitiesOverlap(friendIdentity, identityValues(participant ?? {}))
      || identitiesOverlap(friendIdentity, conversationIdentity);
  });

  return {
    ...conversation,
    ...friend,
    ...participant,
  };
}

function isOwnMessage(
  message: RawRecord,
  me: RawRecord,
): boolean {
  const explicit = readBoolean(message, ['isSelf', 'fromSelf', 'isLocalPlayer']);
  if (explicit !== undefined) return explicit;

  const sender = {
    id: readString(message, ['fromId', 'senderId', 'authorId']),
    pid: readString(message, ['fromPid', 'senderPid']),
    puuid: readString(message, ['fromPuuid', 'senderPuuid']),
    summonerId: readString(message, ['fromSummonerId', 'senderSummonerId']),
    gameName: readString(message, ['gameName', 'fromGameName', 'senderGameName']),
    gameTag: readString(message, ['gameTag', 'fromGameTag', 'senderGameTag']),
  };
  return identitiesOverlap(identityValues(sender), identityValues(me));
}

function mapMessage(
  raw: RawRecord,
  me: RawRecord,
  partner: RawRecord,
  index: number,
): ChatMessage | null {
  const body = readString(raw, ['body', 'message', 'content', 'text']);
  if (!body) return null;
  const type = readString(raw, ['type']).toLowerCase();
  if (type && type !== 'chat') return null;

  const fromSelf = isOwnMessage(raw, me);
  const fallbackSender = fromSelf ? me : partner;
  const gameName = readString(raw, [
    'gameName',
    'fromGameName',
    'senderGameName',
  ]) || readString(fallbackSender, ['gameName', 'displayName', 'name']);
  const gameTag = readString(raw, [
    'gameTag',
    'fromGameTag',
    'senderGameTag',
  ]) || readString(fallbackSender, ['gameTag', 'tagLine']);
  const timestamp = readString(raw, [
    'timestamp',
    'time',
    'createdAt',
    'sentAt',
  ]);

  return {
    id: readString(raw, ['id', 'messageId']) || `${timestamp}-${index}`,
    body,
    type: type || 'chat',
    timestamp,
    fromSelf,
    senderRiotId: riotId(gameName, gameTag) || gameName,
  };
}

export function buildChatConversations({
  me,
  friends,
  conversations,
  messagesByConversation,
}: {
  me: RawRecord;
  friends: RawRecord[];
  conversations: RawRecord[];
  messagesByConversation: Map<string, RawRecord[]>;
}): ChatConversation[] {
  return conversations
    .filter((conversation) => {
      const type = readString(conversation, ['type']).toLowerCase();
      return !type || type === 'chat' || type === 'direct';
    })
    .map((conversation): ChatConversation | null => {
      const id = readString(conversation, ['id']);
      if (!id) return null;

      const partner = findConversationPartner(conversation, me, friends);
      const gameName = readString(partner, [
        'gameName',
        'displayName',
        'summonerName',
        'name',
      ]);
      const gameTag = readString(partner, ['gameTag', 'tagLine']);
      const messages = (messagesByConversation.get(id) ?? [])
        .map((message, index) => mapMessage(message, me, partner, index))
        .filter((message): message is ChatMessage => Boolean(message))
        .sort((a, b) => timestampValue(a.timestamp) - timestampValue(b.timestamp));

      const rawLastMessage = asRecord(conversation.lastMessage);
      const mappedLastMessage = mapMessage(rawLastMessage, me, partner, messages.length);
      if (mappedLastMessage && !messages.some((message) => message.id === mappedLastMessage.id)) {
        messages.push(mappedLastMessage);
      }
      messages.sort(
        (a, b) => timestampValue(a.timestamp) - timestampValue(b.timestamp),
      );
      if (messages.length === 0) return null;

      const lastMessage = messages[messages.length - 1];
      if (!lastMessage) return null;
      const icon = readNumber(partner, [
        'icon',
        'iconId',
        'profileIconId',
        'profileIcon',
      ]);
      const iconUrls = buildProfileIconCandidates(icon);
      const displayRiotId = riotId(gameName, gameTag)
        || readString(partner, ['name'])
        || '未知玩家';

      return {
        id,
        type: readString(conversation, ['type']) || 'chat',
        gameName: gameName || displayRiotId,
        gameTag,
        riotId: displayRiotId,
        puuid: readString(partner, ['puuid']),
        icon,
        iconUrl: iconUrls[0] ?? '',
        iconUrls,
        unreadMessageCount: readNumber(conversation, [
          'unreadMessageCount',
          'unreadCount',
        ]),
        lastMessage: lastMessage.body,
        lastMessageAt: lastMessage.timestamp,
        messages,
      };
    })
    .filter((conversation): conversation is ChatConversation => Boolean(conversation))
    .sort(
      (a, b) =>
        timestampValue(b.lastMessageAt) - timestampValue(a.lastMessageAt),
    );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export async function getChatConversations(
  client: LcuClient,
): Promise<ChatConversation[]> {
  const [meValue, friendsValue, conversationsValue] = await Promise.all([
    client.get<unknown>('/lol-chat/v1/me'),
    client.get<unknown>('/lol-chat/v1/friends'),
    client.get<unknown>('/lol-chat/v1/conversations'),
  ]);

  const me = asRecord(meValue);
  const friends = asRecords(friendsValue, 'friends');
  const conversations = asRecords(conversationsValue, 'conversations');
  const directConversations = conversations.filter((conversation) => {
    const type = readString(conversation, ['type']).toLowerCase();
    return !type || type === 'chat' || type === 'direct';
  });

  const messageEntries = await mapWithConcurrency(
    directConversations,
    CHAT_MESSAGE_CONCURRENCY,
    async (conversation): Promise<[string, RawRecord[]]> => {
      const id = readString(conversation, ['id']);
      if (!id) return ['', []];
      try {
        const value = await client.get<unknown>(
          `/lol-chat/v1/conversations/${encodeURIComponent(id)}/messages`,
        );
        return [id, asRecords(value, 'messages')];
      } catch {
        return [id, []];
      }
    },
  );

  return buildChatConversations({
    me,
    friends,
    conversations: directConversations,
    messagesByConversation: new Map(messageEntries.filter(([id]) => Boolean(id))),
  });
}

export async function sendChatMessage(
  client: ChatPostClient,
  conversationId: string,
  body: string,
): Promise<FriendActionResult> {
  const normalizedConversationId = conversationId.trim();
  const normalizedBody = body.trim();
  if (!normalizedConversationId) {
    return { success: false, message: '会话信息无效' };
  }
  if (!normalizedBody) {
    return { success: false, message: '请输入消息内容' };
  }
  if (normalizedBody.length > CHAT_MESSAGE_MAX_LENGTH) {
    return {
      success: false,
      message: `消息最多 ${CHAT_MESSAGE_MAX_LENGTH} 个字符`,
    };
  }

  try {
    await client.post(
      `/lol-chat/v1/conversations/${encodeURIComponent(
        normalizedConversationId,
      )}/messages`,
      {
        body: normalizedBody,
        type: 'chat',
      },
    );
    return { success: true, message: '消息已发送' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '消息发送失败',
    };
  }
}
