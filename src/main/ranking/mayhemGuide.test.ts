import { describe, expect, it } from 'vitest';
import {
  cleanEffect,
  isMayhemSourceUrl,
  needsIconFallback,
  parseMayhemAugmentDetail,
  parseMayhemAugmentRanking,
  parseMayhemChampionBuild,
  parseMayhemComboManifest,
  parseMayhemTierList,
} from './mayhemGuide';

// 片段按 arammayhem.com 2026-11（26.21）改版后的真实结构精简而来。

describe('ARAM Mayhem tier list', () => {
  it('reads tier, rank, win rate, roles and rank change from champion cards', () => {
    const result = parseMayhemTierList(`
      <main>
        <h1>海克斯大乱斗英雄强度等级表（26.21版本）</h1>
        <p>已更新至补丁 26.21 · 数据更新时间：2026-11-01</p>
        <div class="tier-section" data-tier="S+">
          <div><span>神级 / S+</span></div>
          <a href="/zh-cn/build/teemo/" class="champion-card group" data-tags="marksman,mage" data-win-rate="54.47" data-hero-rank="1">
            <div><img src="https://cdn.example/champions/square/teemo.jpg" alt="迅捷斥候">
              <div><span class="champion-tier-chip">S+</span><span class="champion-win-rate">54.47%</span></div>
            </div>
          </a>
        </div>
        <div class="tier-section" data-tier="C">
          <div><span>偏弱 / C</span></div>
          <a href="/zh-cn/build/garen/" class="champion-card group" data-tags="fighter,tank" data-win-rate="46.29" data-hero-rank="110">
            <div><img src="https://cdn.example/champions/square/garen.jpg" alt="德玛西亚之力">
              <div><span class="champion-tier-chip">C</span><span class="champion-rank-delta">▼1</span></div>
            </div>
          </a>
        </div>
      </main>
    `);

    expect(result.meta).toEqual({ patch: '26.21', updatedAt: '2026-11-01' });
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      slug: 'teemo',
      name: '迅捷斥候',
      rank: 1,
      tier: 'S+',
      roles: ['marksman', 'mage'],
      winRate: 54.47,
      pickRate: null,
      trend: null,
    });
    expect(result.entries[1]).toMatchObject({ slug: 'garen', tier: 'C', rank: 110, trend: -1 });
  });
});

describe('ARAM Mayhem augment ranking', () => {
  it('uses tier and pick rate columns and attaches effects for new augments', () => {
    const result = parseMayhemAugmentRanking(`
      <main>
        <h1>海克斯大乱斗强化符文强度榜（26.21版本）</h1>
        <a href="/zh-cn/augments/bees/" data-latest-augment="bees"><img src="/augments/bees.webp" alt="小蜜蜂！！！">
          <div><h3>小蜜蜂！！！</h3><p>你的技能有时会向敌人投掷一个爆炸蜂巢。</p></div></a>
        <a href="/zh-cn/augments/bees/" class="augment-rank-row" data-rarity="gold" data-availability="live" data-live-rank="1" data-all-rank="1">
          <div><span>1</span></div>
          <div><img src="/augments/bees.webp" alt="小蜜蜂！！！"><span>小蜜蜂！！！</span><span>新</span></div>
          <div>S+</div>
          <div>73.95%</div>
          <div><img src="https://cdn.example/champions/icons/teemo/64.png" alt="迅捷斥候"></div>
        </a>
        <a href="/zh-cn/augments/tank-engine/" class="augment-rank-row" data-rarity="gold" data-availability="live" data-live-rank="2" data-all-rank="2">
          <div><span>2</span></div>
          <div><img src="/augments/tank.webp" alt="坦克引擎"></div>
          <div>S-</div>
          <div>12.10%</div>
          <div></div>
        </a>
      </main>
    `);

    expect(result.meta).toMatchObject({ patch: '26.21', activeCount: 2, removedCount: 0 });
    expect(result.entries[0]).toMatchObject({
      slug: 'bees',
      tier: 'S+',
      winRate: null,
      pickRate: 73.95,
      isNew: true,
      effect: '你的技能有时会向敌人投掷一个爆炸蜂巢。',
      icon: 'https://arammayhem.com/augments/bees.webp',
    });
    expect(result.entries[0].topChampions[0]).toMatchObject({ slug: 'teemo', name: '迅捷斥候' });
    // 没有出现在「新增」区块的强化，用内置效果快照补上说明。
    expect(result.entries[1].effect).toContain('参与击杀');
  });
});

describe('ARAM Mayhem combos', () => {
  it('resolves champion and augment from the v2 lookup tables', () => {
    const result = parseMayhemComboManifest({
      schemaVersion: 2,
      pageSize: 30,
      totalCombos: 419,
      typeLabels: { god: '神级' },
      champions: [{ id: 'Aurora', name: '双界灵兔', icon: 'https://cdn.example/v1/champion-icons/893.png' }],
      augments: [{ id: 'ethereal_weapon', name: '虚幻武器', icon: '/augments/Ethereal_Weapon_mayhem_augment.webp' }],
      cards: [{
        id: 639,
        slug: 'aurora-虚幻武器兔子',
        publicSlug: 'aurora-ethereal-weapon-639',
        championId: 'Aurora',
        augmentId: 'ethereal_weapon',
        tier: 'S+',
        types: ['god'],
        description: '多次触发三环效果。',
        upvoteCount: 3,
      }],
    });

    expect(result.meta).toMatchObject({ totalCount: 419, pageCount: 14, typeLabels: { god: '神级' } });
    expect(result.entries[0]).toMatchObject({
      id: '639',
      slug: 'aurora-ethereal-weapon-639',
      tier: 'S+',
      types: ['god'],
      votes: 3,
      champion: { id: 893, slug: 'aurora', name: '双界灵兔' },
      augment: { slug: 'ethereal-weapon', name: '虚幻武器', icon: 'https://arammayhem.com/augments/Ethereal_Weapon_mayhem_augment.webp' },
      sourceUrl: 'https://arammayhem.com/zh-cn/combo/aurora-ethereal-weapon-639/',
    });
  });
});

describe('ARAM Mayhem champion build', () => {
  it('reads header facts, augment tiers, skills, items, combos and partners', () => {
    const build = parseMayhemChampionBuild(`
      <main>
        <header id="champion-summary"><section><div>
          <div><img src="https://cdn.example/champions/square/teemo.jpg" alt="迅捷斥候"><span data-slot="badge">S+</span></div>
          <div>
            <h1>迅捷斥候 海克斯大乱斗出装</h1>
            <dl>
              <div><dt>胜率</dt><dd>54.47%</dd></div>
              <div><dt>登场率</dt><dd>13.82%</dd></div>
              <div><dt>梯队</dt><dd><span>S+</span><span>#1</span><span>排名变化: ▲2</span></dd></div>
              <div><dt>数据日期</dt><dd><time>2026-11-01</time></dd></div>
            </dl>
            <p>迅捷斥候 · 提莫</p>
            <div><span data-slot="badge">射手</span><span data-slot="badge">法师</span><span>补丁：26.21</span></div>
          </div>
          <div><span title="大乱斗平衡改动"><span>↓</span><span>造成伤害</span><span>-5%</span></span></div>
        </div><p>迅捷斥候在海克斯大乱斗 26.21版本为S+级强度，胜率 54.47%。</p></section></header>
        <section id="best-augments"><div>
          <div><h3>棱彩强化符文</h3><div>
            <a href="/zh-cn/augments/goliath/"><img src="/augments/Goliath.webp" alt="歌利亚巨人"><div>
              <span data-recommendation-rank="rarity">S · #4</span><span data-recommendation-rank="overall">总榜 S- · #15</span>
              <span>登场率: <span>7.47%</span></span></div></a>
          </div></div>
        </div></section>
        <section id="combos"><article data-combo-card>
          <div><a href="/zh-cn/combo/teemo-eureka-929/"><img src="/augments/Eureka.webp" alt="尤里卡"></a></div>
          <div><a href="/zh-cn/combo/teemo-eureka-929/"><div><span>尤里卡 + 缩小引擎 组合</span><span data-slot="badge">S</span><span data-slot="badge">强力</span></div><p>堆冷却，全图种蘑菇</p></a></div>
        </article></section>
        <section id="mayhem-build">
          <section><div>技能主升顺序</div><div><div>
            <div><span>Q&gt;E&gt;W</span><span>登场率 <span>38.93%</span></span><span>胜率 <span>49.98%</span></span></div>
            <div><div><div><table></table></div><div><span>登场率 <span>12.90%</span></span><span>胜率 <span>49.80%</span></span></div></div>
              <span>技能加点序列: Q W E Q Q R Q E Q E R E E W W</span></div>
          </div></div></section>
          <section><div>核心出装</div><div>
            <div><div><a href="/zh-cn/items/malignance/" title="残疫"><img src="https://cdn.example/items/malignance.png"></a></div>
              <div><span>登场率 <span>16.22%</span></span><span>胜率 <span>49.90%</span></span></div></div>
          </div></section>
          <section><div>其他成装</div><div>
            <div><div><a href="/zh-cn/items/rabadon/" title="灭世者的死亡之帽"><img src="https://cdn.example/items/rabadon.png"></a></div>
              <div><span>登场率 <span>40.00%</span></span><span>胜率 <span>51.20%</span></span></div></div>
          </div></section>
        </section>
        <section id="best-partners"><div>
          <a href="/zh-cn/build/yasuo/"><div><img src="https://cdn.example/icons/yasuo/64.png" alt="疾风剑豪"><span>#1 疾风剑豪</span></div>
            <div><span>登场率 <strong>3.39%</strong></span><span>胜率 <strong>64.24%</strong></span></div></a>
        </div></section>
      </main>
    `, 'teemo');

    expect(build).toMatchObject({
      slug: 'teemo',
      name: '迅捷斥候',
      title: '提莫',
      tier: 'S+',
      rank: 1,
      trend: 2,
      roles: ['射手', '法师'],
      winRate: 54.47,
      pickRate: 13.82,
      patch: '26.21',
      updatedAt: '2026-11-01',
      balance: [{ direction: 'down', label: '造成伤害', value: '-5%' }],
    });
    expect(build.augments[0]).toMatchObject({
      slug: 'goliath',
      rarity: 'prismatic',
      tier: 'S',
      rarityRank: 4,
      overallTier: 'S-',
      overallRank: 15,
      pickRate: 7.47,
    });
    expect(build.skillOrders[0]).toMatchObject({
      priority: 'Q>E>W',
      pickRate: 38.93,
      winRate: 49.98,
      sequences: [{ sequence: 'QWEQQRQEQEREEWW', pickRate: 12.9, winRate: 49.8 }],
    });
    expect(build.itemGroups.core[0]).toMatchObject({ pickRate: 16.22, winRate: 49.9, items: [{ name: '残疫' }] });
    expect(build.itemGroups.late[0].items[0].name).toBe('灭世者的死亡之帽');
    expect(build.combos[0]).toMatchObject({
      slug: 'teemo-eureka-929',
      title: '尤里卡 + 缩小引擎',
      tier: 'S',
      types: ['强力'],
      description: '堆冷却，全图种蘑菇',
    });
    expect(build.partners[0]).toMatchObject({ slug: 'yasuo', name: '疾风剑豪', winRate: 64.24, pickRate: 3.39 });
  });
});

describe('ARAM Mayhem augment detail', () => {
  it('reads stats, guide, history and best champions', () => {
    const detail = parseMayhemAugmentDetail(`
      <main>
        <div><img src="/augments/bees.webp" alt="小蜜蜂！！！"><h1>小蜜蜂！！！</h1><span data-slot="badge">金色</span></div>
        <section aria-label="stats">
          <div><div>等级</div><div><span>S+</span></div></div>
          <div><div>登场率</div><div><span>73.95<span>%</span></span><span>▲ 0.28</span></div></div>
          <div><div>排名</div><div><span>#1</span></div></div>
          <div><div>当前版本</div><div><span>26.21</span></div></div>
        </section>
        <div id="trend"><table><tbody>
          <tr><td>2026-11-01</td><td>26.21</td><td>#1</td><td>S+</td><td>73.95%</td></tr>
        </tbody></table></div>
        <div data-augment-official-guide>
          <p>你的技能有时会向敌人投掷一个爆炸蜂巢。</p>
          <h3>适合何时选择</h3><p>适合技能命中可靠的英雄。</p>
        </div>
        <div id="best-champions"><table><tbody>
          <tr><td><div><a href="/zh-cn/build/brand/"><img src="https://cdn.example/icons/brand/64.png"><span>复仇焰魂</span></a><span data-slot="badge">上分英雄</span></div></td>
            <td><strong>S</strong> #1</td><td>18.24%</td></tr>
        </tbody></table></div>
      </main>
    `, 'bees');

    expect(detail).toMatchObject({
      name: '小蜜蜂！！！',
      rarity: 'gold',
      tier: 'S+',
      rank: 1,
      pickRate: 73.95,
      pickDelta: 0.28,
      patch: '26.21',
      effect: '你的技能有时会向敌人投掷一个爆炸蜂巢。',
      guide: [{ title: '适合何时选择', text: '适合技能命中可靠的英雄。' }],
      history: [{ date: '2026-11-01', patch: '26.21', rank: 1, tier: 'S+', pickRate: 73.95 }],
      champions: [{ slug: 'brand', name: '复仇焰魂', tier: 'S', rank: 1, pickRate: 18.24, highlight: true }],
    });
  });

  it('replaces client placeholders in effect text', () => {
    expect(cleanEffect('获得@ADAmp*100@%攻击力。')).toBe('获得若干攻击力。');
    expect(cleanEffect('持续@InvulnDuration@秒的免疫状态')).toBe('持续若干秒的免疫状态');
  });

  it('flags icon names the source server cannot serve to browsers', () => {
    expect(needsIconFallback("https://arammayhem.com/augments/Don't_Blink_mayhem_augment.webp")).toBe(true);
    expect(needsIconFallback('https://arammayhem.com/augments/Stats_on_Stats%21_mayhem_augment.webp')).toBe(true);
    expect(needsIconFallback('https://arammayhem.com/augments/bees.webp')).toBe(false);
  });

  it('only lets data source pages open externally', () => {
    expect(isMayhemSourceUrl('https://arammayhem.com/zh-cn/build/garen/')).toBe(true);
    expect(isMayhemSourceUrl('http://arammayhem.com/')).toBe(false);
    expect(isMayhemSourceUrl('https://evil.example/arammayhem.com')).toBe(false);
  });
});
