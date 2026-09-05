import { describe, expect, it } from 'vitest';
import {
  parseMayhemAugmentRanking,
  parseMayhemChampionBuild,
  parseMayhemComboManifest,
  parseMayhemCombos,
  parseMayhemTierList,
} from './mayhemGuide';

describe('ARAM Mayhem guide parsing', () => {
  it('keeps champion, augment, tier and description from featured combos', () => {
    const result = parseMayhemCombos(`
      <main>
        <h1>海克斯大乱斗组合</h1>
        <p>666 个组合，覆盖 157 位英雄</p>
        <article class="combo-card" data-combo-id="738" data-tier="S+" data-types='["god"]'
          data-upvote-count="17" data-rank-score="133">
          <a href="/zh-cn/combo/vayne-featured/"><img src="/augments/Fan_The_Hammer_mayhem_augment.webp" alt="连拨击锤"></a>
          <a href="/zh-cn/build/vayne/"><img src="https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/67.png" alt="暗夜猎手"></a>
          <span>Curated</span><span>S+</span>
          <p>普攻能够连续触发攻击特效。</p>
        </article>
      </main>
    `);

    expect(result.meta).toEqual({
      totalCount: 666,
      championCount: 157,
      featuredCount: 1,
      pageSize: 30,
      pageCount: 23,
      source: 'ARAM Mayhem',
    });
    expect(result.entries[0]).toMatchObject({
      id: '738',
      slug: 'vayne-featured',
      rank: 1,
      tier: 'S+',
      types: ['god'],
      description: '普攻能够连续触发攻击特效。',
      votes: 17,
      rankScore: 133,
      curated: true,
      champion: { id: 67, slug: 'vayne', name: '暗夜猎手' },
      augment: { name: '连拨击锤' },
    });
  });

  it('keeps every combo from the index manifest for real pagination', () => {
    const result = parseMayhemComboManifest({
      pageSize: 30,
      totalCombos: 666,
      cards: [
        {
          id: 738,
          slug: 'vayne-featured',
          championId: 'Vayne',
          augmentId: 'fan_the_hammer',
          tier: 'S+',
          types: ['god'],
          champName: '暗夜猎手',
          champIcon: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/67.png',
          championHref: '/zh-cn/build/vayne/',
          augmentName: '连拨击锤',
          augmentIcon: '/augments/Fan_The_Hammer_mayhem_augment.webp',
          comboHref: '/zh-cn/combo/vayne-featured/',
          comboDescription: '普攻能够连续触发攻击特效。',
          comboRef: 'curated:vayne-featured',
          upvoteCount: 17,
          rankScore: 133,
        },
      ],
    });

    expect(result.meta).toMatchObject({
      totalCount: 666,
      championCount: 1,
      featuredCount: 1,
      pageSize: 30,
      pageCount: 23,
    });
    expect(result.entries[0]).toMatchObject({
      rank: 1,
      champion: { id: 67, slug: 'vayne', name: '暗夜猎手' },
      augment: { slug: 'fan-the-hammer', name: '连拨击锤' },
      curated: true,
    });
  });

  it('keeps real augment ranking fields and separates removed entries', () => {
    const result = parseMayhemAugmentRanking(`
      <main>
        <p>数据更新 7月10日</p>
        <a class="augment-rank-row" href="/zh-cn/augments/tank-engine"
          data-rarity="gold" data-availability="live" data-live-rank="1" data-all-rank="1">
          <div><span data-rank-label>1</span></div>
          <div><img src="/augments/tank-engine.webp" alt="坦克引擎"><span>金色</span><span>67.14%</span></div>
          <div>67.48%</div><div>67.14%</div>
          <div><img src="https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/111.png" alt="深海泰坦"></div>
        </a>
        <a class="augment-rank-row" href="/zh-cn/augments/old-one"
          data-rarity="silver" data-availability="removed" data-live-rank="" data-all-rank="2">
          <div><span data-rank-label>2</span></div>
          <div><img src="/augments/old-one.webp" alt="旧强化"><span>银色</span></div>
          <div>—</div><div>—</div><div></div>
        </a>
      </main>
    `);

    expect(result.meta).toEqual({
      updatedAt: '7月10日',
      activeCount: 1,
      removedCount: 1,
      rarityCounts: { prismatic: 0, gold: 1, silver: 0 },
      source: 'ARAM Mayhem',
    });
    expect(result.entries[0]).toMatchObject({
      slug: 'tank-engine',
      name: '坦克引擎',
      rarity: 'gold',
      availability: 'live',
      rank: 1,
      winRate: 67.48,
      pickRate: 67.14,
      topChampions: [{ id: 111, name: '深海泰坦' }],
    });
    expect(result.entries[1]).toMatchObject({
      availability: 'removed',
      winRate: null,
      pickRate: null,
    });
  });

  it('keeps champion tier, roles and rates from the tier list', () => {
    const result = parseMayhemTierList(`
      <main>
        <h1>海克斯大乱斗英雄强度等级表</h1>
        <p>已更新至补丁 26.13 · 数据更新时间：2026-07-11</p>
        <div class="tier-section">
          <div>神级 / S+ <span>(1 位英雄)</span></div>
          <div>
            <a class="champion-card" href="/zh-cn/build/brand/" data-tags="mage,support"
              title="复仇焰魂\n排名：#1\n胜率：55.60%\n登场率：14.19%">
              <img src="https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/63.png" alt="复仇焰魂">
              <span>▼1</span>
            </a>
          </div>
        </div>
      </main>
    `);

    expect(result.meta).toMatchObject({ patch: '26.13', updatedAt: '2026-07-11' });
    expect(result.entries).toEqual([expect.objectContaining({
      id: 63,
      slug: 'brand',
      name: '复仇焰魂',
      rank: 1,
      tier: 'S+',
      roles: ['mage', 'support'],
      winRate: 55.6,
      pickRate: 14.19,
      trend: -1,
    })]);
  });

  it('keeps grouped items, skill orders and augment rarity on a build page', () => {
    const build = parseMayhemChampionBuild(`
      <main>
        <div>
          <img width="96" src="https://example.com/brand.png" alt="复仇焰魂">
          <div>
            <h1>复仇焰魂 S+ 级 海克斯大乱斗出装</h1>
            <p>复仇焰魂 · 布兰德</p>
            <span data-slot="badge">法师</span><span data-slot="badge">辅助</span>
            <span>55.60% WR</span><span>14.19% PR</span><span>补丁：26.13</span>
          </div>
          <span title="大乱斗平衡改动"><span>↓</span><span>造成伤害</span><span>-5%</span></span>
        </div>
        <section>
          <div>技能主升顺序</div>
          <div class="space-y-3">
            <div class="rounded-lg">
              <div><span>Q&gt;E&gt;W</span><span>登场率: 34.27%</span><span>胜率: 52.90%</span></div>
              <div class="mt-2"><div><span>Q W E Q Q R</span><span>登场率: 12.11%</span><span>胜率: 52.99%</span></div></div>
            </div>
          </div>
        </section>
        <section>
          <div>核心出装</div>
          <div>
            <div>
              <div>
                <a href="/zh-cn/items/torch/" title="黯炎火炬"><img src="/items/2503.png"></a>
                <a href="/zh-cn/items/liandry/" title="兰德里的折磨"><img src="/items/6653.png"></a>
              </div>
              <div>登场率: 21.06% 胜率: 55.32%</div>
            </div>
          </div>
        </section>
        <a href="/zh-cn/augments/infernal-conduit" class="group flex items-start border-rarity-prismatic">
          <img src="/augments/infernal.webp" alt="炼狱导管">
          <div>炼狱导管 <span>胜率: 58.74%</span><div class="mt-2">技能命中会施加灼烧。</div></div>
        </a>
      </main>
    `, 'brand');

    expect(build).toMatchObject({
      slug: 'brand',
      name: '复仇焰魂',
      alias: '布兰德',
      tier: 'S+',
      roles: ['法师', '辅助'],
      winRate: 55.6,
      pickRate: 14.19,
      patch: '26.13',
    });
    expect(build.balance[0]).toEqual({ direction: 'down', label: '造成伤害', value: '-5%' });
    expect(build.skillOrders[0]).toMatchObject({ priority: 'Q>E>W', pickRate: 34.27, winRate: 52.9 });
    expect(build.itemGroups.core[0].items.map((item) => item.name)).toEqual(['黯炎火炬', '兰德里的折磨']);
    expect(build.augments[0]).toMatchObject({
      slug: 'infernal-conduit',
      rarity: 'prismatic',
      name: '炼狱导管',
      winRate: 58.74,
      effect: '技能命中会施加灼烧。',
    });
  });
});
