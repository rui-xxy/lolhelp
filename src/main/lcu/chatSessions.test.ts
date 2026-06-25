import { describe, expect, it } from 'vitest';
import {
  buildChatConversations,
  CHAT_MESSAGE_MAX_LENGTH,
  sendChatMessage,
} from './chatSessions';

describe('chat sessions', () => {
  it('keeps direct conversations with actual messages and resolves the friend', () => {
    const conversations = buildChatConversations({
      me: {
        id: 'me-id',
        pid: 'me-pid',
        gameName: '自己',
        gameTag: '1000',
      },
      friends: [{
        id: 'friend-id',
        pid: 'friend-pid',
        puuid: 'friend-puuid',
        gameName: '好友',
        gameTag: '2000',
        icon: 29,
      }],
      conversations: [
        {
          id: 'conversation-1',
          type: 'chat',
          unreadMessageCount: 2,
          participants: [
            { id: 'me-id', pid: 'me-pid' },
            { id: 'friend-id', pid: 'friend-pid' },
          ],
        },
        {
          id: 'empty-conversation',
          type: 'chat',
          participants: [{ id: 'friend-id' }],
        },
        {
          id: 'lobby-conversation',
          type: 'groupchat',
          lastMessage: { body: '大厅消息' },
        },
      ],
      messagesByConversation: new Map([
        ['conversation-1', [
          {
            id: 'message-1',
            body: '你好',
            fromId: 'friend-id',
            timestamp: '2026-06-26T10:00:00.000Z',
          },
          {
            id: 'message-2',
            body: '你好呀',
            fromId: 'me-id',
            timestamp: '2026-06-26T10:01:00.000Z',
          },
          {
            id: 'message-3',
            body: 'joined_room',
            type: 'system',
            timestamp: '2026-06-26T10:02:00.000Z',
          },
        ]],
      ]),
    });

    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      riotId: '好友#2000',
      puuid: 'friend-puuid',
      icon: 29,
      unreadMessageCount: 2,
      lastMessage: '你好呀',
    });
    expect(conversations[0].messages.map((message) => message.fromSelf)).toEqual([
      false,
      true,
    ]);
  });

  it('sorts conversations by their latest message', () => {
    const conversations = buildChatConversations({
      me: { id: 'me' },
      friends: [],
      conversations: [
        { id: 'older', type: 'chat', gameName: '旧会话' },
        { id: 'newer', type: 'chat', gameName: '新会话' },
      ],
      messagesByConversation: new Map([
        ['older', [{ body: '旧消息', timestamp: '2026-06-25T10:00:00.000Z' }]],
        ['newer', [{ body: '新消息', timestamp: '2026-06-26T10:00:00.000Z' }]],
      ]),
    });

    expect(conversations.map((conversation) => conversation.id)).toEqual([
      'newer',
      'older',
    ]);
  });

  it('sends a trimmed chat message to the selected conversation', async () => {
    const calls: Array<{ path: string; body: unknown }> = [];
    const result = await sendChatMessage(
      {
        post: async (path, body) => {
          calls.push({ path, body });
          return undefined;
        },
      },
      'conversation/id',
      '  你好  ',
    );

    expect(result).toEqual({ success: true, message: '消息已发送' });
    expect(calls).toEqual([{
      path: '/lol-chat/v1/conversations/conversation%2Fid/messages',
      body: { body: '你好', type: 'chat' },
    }]);
  });

  it('rejects empty and oversized chat messages', async () => {
    const client = {
      post: async () => undefined,
    };

    await expect(sendChatMessage(client, 'conversation', '   ')).resolves.toMatchObject({
      success: false,
    });
    await expect(
      sendChatMessage(
        client,
        'conversation',
        'a'.repeat(CHAT_MESSAGE_MAX_LENGTH + 1),
      ),
    ).resolves.toMatchObject({
      success: false,
    });
  });
});
