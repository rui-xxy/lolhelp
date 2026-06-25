import { describe, expect, it } from 'vitest';
import { getQueueName, isRankedQueue } from './queueNames';

describe('queue names', () => {
  it.each([
    [1020, '克隆大作战'],
    [1090, '云顶之弈（匹配）'],
    [1100, '云顶之弈（排位）'],
    [1130, '云顶之弈（狂暴模式）'],
    [1150, '云顶之弈（双人作战）'],
    [1700, '斗魂竞技场'],
    [2400, '海克斯大乱斗'],
  ])('maps queue %i', (queueId, expected) => {
    expect(getQueueName(queueId)).toBe(expected);
  });

  it('marks ranked TFT queues as ranked without treating clone mode as ranked', () => {
    expect(isRankedQueue(1100)).toBe(true);
    expect(isRankedQueue(1020)).toBe(false);
  });
});
