import { describe, expect, it } from 'vitest';
import type { ChatMessage, SavedMatchPreview } from '../../../shared/api';
import {
  buildChatBlocks,
  currentStreak,
  groupSessions,
  dayLabel,
  formatAgo,
  groupByDay,
  splitRiotId,
  summarizeMatches,
} from './hubFormat';

const NOW = new Date(2026, 10, 1, 18, 0).getTime();

function match(partial: Partial<SavedMatchPreview>): SavedMatchPreview {
  return {
    gameId: 1,
    queueId: 420,
    queueName: '单双排',
    gameCreation: NOW,
    gameDuration: 1800,
    championId: 1,
    championName: 'Annie',
    championAvatar: '',
    kills: 0,
    deaths: 0,
    assists: 0,
    kda: 0,
    win: true,
    damage: 0,
    cs: 0,
    ...partial,
  };
}

function chat(id: string, minutesAgo: number, fromSelf: boolean, type = 'chat'): ChatMessage {
  return {
    id,
    body: id,
    type,
    timestamp: String(NOW - minutesAgo * 60_000),
    fromSelf,
    senderRiotId: fromSelf ? '' : 'A#1',
  };
}

describe('hubFormat', () => {
  it('splits riot id on the last hash', () => {
    expect(splitRiotId('关于琳的一切、龙#76988')).toEqual({ name: '关于琳的一切、龙', tag: '76988' });
    expect(splitRiotId('NoTag')).toEqual({ name: 'NoTag', tag: '' });
    expect(splitRiotId('')).toEqual({ name: '未知玩家', tag: '' });
  });

  it('formats relative time and day labels', () => {
    expect(formatAgo(NOW - 30_000, NOW)).toBe('刚刚');
    expect(formatAgo(NOW - 12 * 60_000, NOW)).toBe('12 分钟前');
    expect(formatAgo(NOW - 3 * 3_600_000, NOW)).toBe('3 小时前');
    expect(dayLabel(NOW - 24 * 3_600_000, NOW)).toBe('昨天');
    expect(dayLabel(new Date(2026, 9, 30, 6).getTime(), NOW)).toBe('10月30日');
  });

  it('summarizes matches with most played champions first', () => {
    const summary = summarizeMatches([
      match({ championId: 1, win: true, kills: 4, deaths: 2, assists: 6 }),
      match({ championId: 2, win: false, kills: 1, deaths: 5, assists: 2 }),
      match({ championId: 2, win: true, kills: 7, deaths: 1, assists: 4 }),
    ]);
    expect(summary.games).toBe(3);
    expect(summary.wins).toBe(2);
    expect(summary.winRate).toBe(67);
    expect(summary.kda).toBeCloseTo(24 / 8);
    expect(summary.topChampions.map((item) => [item.championId, item.games])).toEqual([[2, 2], [1, 1]]);
    expect(summarizeMatches([]).winRate).toBe(0);
  });

  it('groups items by day preserving order', () => {
    const groups = groupByDay([NOW, NOW - 3_600_000, NOW - 30 * 3_600_000], (time) => time, NOW);
    expect(groups.map((group) => [group.label, group.items.length])).toEqual([['今天', 2], ['昨天', 1]]);
  });

  it('merges consecutive messages from the same sender', () => {
    const blocks = buildChatBlocks([
      chat('a', 30, false),
      chat('b', 29, false),
      chat('c', 28, true),
      chat('d', 10, true),
      chat('e', 9, false, 'system'),
      chat('f', 8, false),
    ], NOW);
    expect(blocks.map((block) => (block.kind === 'run' ? `run:${block.messages.length}` : block.kind))).toEqual([
      'day',
      'run:2',
      'run:1',
      'run:1',
      'system',
      'run:1',
    ]);
  });

  it('groups matches into play sessions', () => {
    const at = (hoursAgo: number, win = true) => ({ gameCreation: NOW - hoursAgo * 3_600_000, gameDuration: 1800, win });
    const sessions = groupSessions([at(0.6), at(1.2, false), at(1.8), at(6), at(6.7, false)]);
    expect(sessions.map((session) => [session.matches.length, session.wins, session.losses])).toEqual([[3, 2, 1], [2, 1, 1]]);
    expect(sessions[0].start).toBe(NOW - 1.8 * 3_600_000);
  });

  it('reads the current streak', () => {
    const at = (hoursAgo: number, win: boolean) => ({ gameCreation: NOW - hoursAgo * 3_600_000, win });
    expect(currentStreak([at(1, true), at(2, true), at(3, false)])).toEqual({ win: true, count: 2 });
    expect(currentStreak([])).toBe(null);
  });
});
