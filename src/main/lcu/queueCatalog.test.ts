import { describe, expect, it } from 'vitest';
import { buildQueueCatalog, getQueueDisplayName } from './queueCatalog';

describe('LCU queue catalog', () => {
  it.each([
    [{ id: 420, name: '排位赛 单排/双排', gameMode: 'CLASSIC', type: 'RANKED_SOLO_5x5', isRanked: true }, '单双排位'],
    [{ id: 1100, name: '云顶之弈 (排位赛)', gameMode: 'TFT', type: 'RANKED_TFT', isRanked: true }, '云顶之弈（排位）'],
    [{ id: 1090, name: '云顶之弈（匹配模式）', gameMode: 'TFT', type: 'NORMAL_TFT', isRanked: false }, '云顶之弈（匹配）'],
    [{ id: 1130, name: '云顶之弈(狂暴模式)', gameMode: 'TFT', type: 'RANKED_TFT_TURBO', isRanked: true }, '云顶之弈（狂暴模式）'],
    [{ id: 1150, name: '云顶之弈 (双人作战)', gameMode: 'TFT', type: 'RANKED_TFT_PAIRS', isRanked: true }, '云顶之弈（双人作战）'],
    [{ id: 6120, name: '7周年时光机', gameMode: 'TFT', type: 'FIVE_YEAR_ANNIVERSARY_TFT', isRanked: false }, '云顶之弈（7周年时光机）'],
    [{ id: 1750, name: '斗魂竞技场 3x6', gameMode: 'CHERRY', type: 'CHERRY', isRanked: false }, '斗魂竞技场 3x6'],
    [{ id: 2400, name: '海克斯大乱斗 ', gameMode: 'KIWI', type: 'KIWI', isRanked: false }, '海克斯大乱斗'],
    [{ id: 3110, name: '召唤师峡谷 征召 自定义', gameMode: 'CLASSIC', type: 'NORMAL', isRanked: false }, '自定义对局'],
  ])('normalizes queue %s', (queue, expected) => {
    expect(getQueueDisplayName(queue)).toBe(expected);
  });

  it('builds a numeric queue lookup', () => {
    const catalog = buildQueueCatalog([{ id: 450, name: '极地大乱斗', gameMode: 'ARAM' }]);
    expect(catalog.get(450)?.name).toBe('极地大乱斗');
  });
});
