import { describe, expect, it } from 'vitest';
import { lcuAsset, ownedFlag, parseInventoryDate, rarityOf, skinFrom } from './collectionParse';

describe('collectionParse', () => {
  it('把 game-data 路径换成 CommunityDragon 地址', () => {
    expect(lcuAsset('/lol-game-data/assets/ASSETS/Loadouts/Wards/Foo.PNG')).toBe(
      'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/loadouts/wards/foo.png',
    );
    expect(lcuAsset('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(lcuAsset('/lol-champions/v1/whatever')).toBe('');
    expect(lcuAsset('')).toBe('');
  });

  it('从 rarity 或宝石图标路径认出品质', () => {
    expect(rarityOf({ rarity: 'kLegendary' })).toBe('legendary');
    expect(rarityOf({ rarityGemPath: '/lol-game-data/assets/v1/rarity-gem-icons/ultimate.png' })).toBe('ultimate');
    expect(rarityOf({ rarity: 'kNoRarity' })).toBe('none');
    expect(rarityOf({})).toBe('none');
  });

  it('解析背包里的购买时间', () => {
    expect(parseInventoryDate('20210115T183019.000Z')).toBe(Date.UTC(2021, 0, 15, 18, 30, 19));
    expect(parseInventoryDate('')).toBeUndefined();
    expect(parseInventoryDate(1700000000000)).toBe(1700000000000);
  });

  it('租来的不算拥有', () => {
    expect(ownedFlag({ ownership: { owned: true, rental: { rented: false } } })).toBe(true);
    expect(ownedFlag({ ownership: { owned: true, rental: { rented: true } } })).toBe(false);
    expect(ownedFlag({ ownership: { owned: false } })).toBe(false);
    expect(ownedFlag({ owned: true })).toBe(true);
  });

  it('皮肤：基础皮肤叫经典，炫彩挂在下面，别的英雄的皮肤不收', () => {
    const owned = new Set([157001, 157003]);
    const raw = {
      id: 157001,
      name: '西部牛仔',
      rarity: 'kEpic',
      loadScreenPath: '/lol-game-data/assets/ASSETS/Characters/Yasuo/Skins/Skin01/YasuoLoadScreen_1.jpg',
      chromas: [
        { id: 157003, name: '红', colors: ['#AA0000', '#BB1111', 'bad'] },
        { id: 157004, name: '蓝', colors: ['#0000AA'] },
      ],
    };
    const skin = skinFrom(raw, 157, (id) => owned.has(id));
    expect(skin).toMatchObject({ id: 157001, name: '西部牛仔', rarity: 'epic', owned: true, isBase: false });
    expect(skin?.portrait).toBe('https://game.gtimg.cn/images/lol/act/img/skinloading/157001.jpg');
    expect(skin?.chromas.map((c) => [c.id, c.owned, c.colors.length])).toEqual([[157003, true, 2], [157004, false, 1]]);
    expect(skinFrom({ id: 157000, name: 'Yasuo' }, 157, () => true)?.name).toBe('经典');
    expect(skinFrom({ id: 103001 }, 157, () => true)).toBeNull();
  });
});
