import { load, type Cheerio, type CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';
import type {
  MayhemAugmentChampionFit,
  MayhemAugmentChampionRef,
  MayhemAugmentDetail,
  MayhemAugmentDetailResult,
  MayhemAugmentRankingResult,
  MayhemAugmentRarity,
  MayhemAugmentRecommendation,
  MayhemBuildCombo,
  MayhemChampionBuild,
  MayhemChampionBuildResult,
  MayhemChampionRole,
  MayhemChampionTier,
  MayhemComboResult,
  MayhemComboTier,
  MayhemDataOrigin,
  MayhemItemBuildOption,
  MayhemItemGroupKey,
  MayhemPartner,
  MayhemSkillOrder,
  MayhemTierListResult,
} from '../../shared/api';
import { getAllHeroes, type HeroSummary } from '../lcu/heroData';
import effectSnapshot from './mayhemAugmentEffects.json';
import { readDiskCache, writeDiskCache } from './rankingDiskCache';

// 海克斯大乱斗数据：arammayhem.com（Astro 静态页 + 组合索引 JSON）。
// 网站 2026-10 改版后：强化不再公开胜率，改成「等级 + 登场率」；出装页新增
// 强化组合、最佳搭档；英雄卡片把胜率、名次放进 data-* 属性。
// 解析尽量认语义（data-*、标题文字），不依赖样式类名，下次改版时更不容易整页失效。

const MAYHEM_BASE_URL = 'https://arammayhem.com';
const MAYHEM_TIER_LIST_URL = `${MAYHEM_BASE_URL}/zh-cn/tier-list/`;
const MAYHEM_AUGMENTS_URL = `${MAYHEM_BASE_URL}/zh-cn/augments/`;
const MAYHEM_COMBOS_INDEX_URL = `${MAYHEM_BASE_URL}/zh-cn/combo-index-data.json`;
const SOURCE_NAME = 'ARAM Mayhem';
const CACHE_TTL_MS = 15 * 60_000;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 6 * 1024 * 1024;
const SLUG_PATTERN = /^[a-z0-9-]{1,64}$/;

const VALID_TIERS = new Set<MayhemChampionTier>(['S+', 'S', 'A', 'B', 'C', 'D']);
const VALID_COMBO_TIERS = new Set<MayhemComboTier>(['S+', 'S', 'A', 'B', 'C']);
const VALID_ROLES = new Set<MayhemChampionRole>(['assassin', 'fighter', 'mage', 'marksman', 'support', 'tank']);
const ROLE_NAMES_ZH = ['刺客', '战士', '法师', '射手', '辅助', '坦克'];
const SKILL_PRIORITY = /^[QWE]\s*>\s*[QWE]\s*>\s*[QWE]$/;
const AUGMENT_EFFECTS = effectSnapshot as Record<string, string>;

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// 「登场率 35.27%」「胜率: 48.74%」里取百分比；不带 label 时取第一个百分比。
function percentAfter(value: string, label?: string): number | null {
  const match = label
    ? value.match(new RegExp(`${label}\\s*[:：]?\\s*(-?\\d+(?:\\.\\d+)?)\\s*%`, 'i'))
    : value.match(/(-?\d+(?:\.\d+)?)\s*%/);
  return match ? finiteNumber(match[1]) : null;
}

function absoluteUrl(value: string | undefined): string {
  if (!value) return '';
  try {
    return new URL(value, MAYHEM_BASE_URL).toString();
  } catch {
    return '';
  }
}

function championTier(value: string): MayhemChampionTier {
  const match = value.match(/S\+|S|A|B|C|D/)?.[0] as MayhemChampionTier | undefined;
  return match && VALID_TIERS.has(match) ? match : 'C';
}

// 强化等级带细分：S+ / S / S- / A+ / A / A- …
function augmentTier(value: string): string {
  return value.match(/[SABCD][+-]?/)?.[0] ?? '';
}

function rankNumber(value: string): number | null {
  const match = value.match(/#\s*(\d+)/);
  return match ? finiteNumber(match[1]) : null;
}

function trendFromText(value: string): number | null {
  const match = value.match(/([▲▼])\s*(\d+)/);
  if (!match) return null;
  return finiteNumber(match[2]) * (match[1] === '▲' ? 1 : -1);
}

function slugFrom(href: string | undefined, segment: string): string {
  return (href ?? '').match(new RegExp(`/${segment}/([^/?#]+)`))?.[1]?.toLocaleLowerCase() ?? '';
}

function rarityFromText(value: string): MayhemAugmentRarity | null {
  if (/棱彩|prismatic/i.test(value)) return 'prismatic';
  if (/金色|gold/i.test(value)) return 'gold';
  if (/银色|silver/i.test(value)) return 'silver';
  return null;
}

// arammayhem 的英雄 slug 就是 Data Dragon 英雄 key 的小写（monkeyking、jarvaniv…）。
let heroBySlug: Map<string, HeroSummary> | null = null;

function heroForSlug(slug: string): HeroSummary | null {
  if (!heroBySlug) {
    heroBySlug = new Map();
    try {
      for (const hero of getAllHeroes()) {
        if (hero.alias) heroBySlug.set(hero.alias.toLocaleLowerCase(), hero);
      }
    } catch {
      // datas.json 不可用时只是少了真名和 ID，不影响主体数据。
    }
  }
  return heroBySlug.get(slug.toLocaleLowerCase()) ?? null;
}

function championIdFromIcon(icon: string): number {
  return finiteNumber(icon.match(/champion-icons\/(\d+)\.png/)?.[1]);
}

function championSlugFromIcon(icon: string): string {
  return icon.match(/\/champions\/(?:icons|square)\/([a-z0-9]+)/i)?.[1]?.toLocaleLowerCase() ?? '';
}

function championRef(icon: string, name: string, slugHint = ''): MayhemAugmentChampionRef {
  const slug = slugHint || championSlugFromIcon(icon);
  const hero = slug ? heroForSlug(slug) : null;
  return {
    id: championIdFromIcon(icon) || hero?.id || 0,
    slug: slug || hero?.alias.toLocaleLowerCase() || '',
    name,
    icon,
  };
}

// 客户端文本里残留的 @变量@ 占位符和多余空格，读起来像乱码，统一换成「若干」。
export function cleanEffect(value: string): string {
  return value
    .replace(/@[^@\s]*@\s*%?/g, '若干')
    .replace(/\s+%/g, '%')
    .replace(/\s+/g, ' ')
    .trim();
}

function effectFor(slug: string): string {
  return cleanEffect(AUGMENT_EFFECTS[slug] ?? AUGMENT_EFFECTS[slug.replace(/_/g, '-')] ?? '');
}

function sectionByHeading($: CheerioAPI, heading: string | RegExp): Cheerio<AnyNode> | null {
  let result: Cheerio<AnyNode> | null = null;
  $('main section').each((_index, element) => {
    if (result) return;
    const firstChildText = cleanText($(element).children().first().text());
    const matches = typeof heading === 'string' ? firstChildText === heading : heading.test(firstChildText);
    if (matches) result = $(element);
  });
  return result;
}

export function isMayhemSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['arammayhem.com', 'www.op.gg', 'op.gg'].includes(url.hostname);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 英雄强度榜
// ---------------------------------------------------------------------------

export function parseMayhemTierList(html: string): Omit<MayhemTierListResult, 'meta'> & {
  meta: { patch: string; updatedAt: string };
} {
  const $ = load(html);
  const pageText = cleanText($('main').text());
  const patch = pageText.match(/补丁\s*([\d.]+)/)?.[1] ?? pageText.match(/（([\d.]+)\s*版本）/)?.[1] ?? '';
  const updatedAt = pageText.match(/数据更新时间[:：]\s*([\d-]+)/)?.[1] ?? '';
  const seen = new Set<string>();
  const entries: MayhemTierListResult['entries'] = [];

  $('.tier-section').each((_sectionIndex, section) => {
    const sectionTier = championTier(
      $(section).attr('data-tier') ?? cleanText($(section).children().first().text()),
    );
    $(section).find('a[href*="/build/"]').each((_cardIndex, card) => {
      const element = $(card);
      const slug = slugFrom(element.attr('href'), 'build');
      if (!slug || seen.has(slug)) return;
      const title = element.attr('title') ?? '';
      const image = absoluteUrl(element.find('img').first().attr('src'));
      const name = cleanText(element.find('img').first().attr('alt'))
        || cleanText(element.find('[title]').first().attr('title'));
      const rank = finiteNumber(element.attr('data-hero-rank') ?? title.match(/排名[:：]\s*#?(\d+)/)?.[1]);
      const winRate = optionalNumber(element.attr('data-win-rate')) ?? percentAfter(title, '胜率') ?? 0;
      const chip = cleanText(element.find('[class*="tier-chip"]').first().text());
      const roles = (element.attr('data-tags') ?? '')
        .split(',')
        .map((role) => role.trim())
        .filter((role): role is MayhemChampionRole => VALID_ROLES.has(role as MayhemChampionRole));
      if (!name || !rank) return;

      const hero = heroForSlug(slug);
      seen.add(slug);
      entries.push({
        id: hero?.id ?? championIdFromIcon(image),
        slug,
        name,
        title: hero?.title ?? '',
        alias: hero?.alias ?? '',
        image,
        rank,
        tier: chip ? championTier(chip) : sectionTier,
        roles,
        winRate,
        pickRate: percentAfter(title, '登场率'),
        trend: trendFromText(cleanText(element.text())),
      });
    });
  });

  return {
    entries: entries.sort((left, right) => left.rank - right.rank),
    meta: { patch, updatedAt },
  };
}

// ---------------------------------------------------------------------------
// 强化符文总榜
// ---------------------------------------------------------------------------

export function parseMayhemAugmentRanking(html: string): Omit<MayhemAugmentRankingResult, 'meta'> & {
  meta: Omit<MayhemAugmentRankingResult['meta'], 'source' | 'origin' | 'fetchedAt'>;
} {
  const $ = load(html);
  const entries: MayhemAugmentRankingResult['entries'] = [];

  // 「本版本新增」区块带效果说明，优先于内置的效果快照。
  const latestEffects = new Map<string, string>();
  $('a[data-latest-augment]').each((_index, element) => {
    const slug = slugFrom($(element).attr('href'), 'augments');
    const effect = cleanText($(element).find('p').first().text());
    if (slug && effect) latestEffects.set(slug, effect);
  });

  $('a.augment-rank-row, a[data-all-rank]').each((_index, row) => {
    const element = $(row);
    const slug = slugFrom(element.attr('href'), 'augments');
    const rarity = rarityFromText(element.attr('data-rarity') ?? '');
    const availabilityValue = element.attr('data-availability') ?? 'live';
    if (!slug || !rarity || !['live', 'removed'].includes(availabilityValue)) return;
    if (entries.some((entry) => entry.slug === slug && entry.availability === availabilityValue)) return;

    const images = element.find('img').toArray();
    const name = cleanText($(images[0]).attr('alt'));
    if (!name) return;

    const children = element.children();
    const scoreText = cleanText(children.eq(2).text());
    const allRank = finiteNumber(element.attr('data-all-rank'));
    const liveRank = finiteNumber(element.attr('data-live-rank'));
    const availability = availabilityValue as 'live' | 'removed';

    entries.push({
      slug,
      name,
      icon: absoluteUrl($(images[0]).attr('src')),
      rarity,
      availability,
      rank: availability === 'live' && liveRank > 0 ? liveRank : allRank,
      allRank,
      // 旧版第三列是胜率，新版是等级：两种都认。
      tier: scoreText.includes('%') ? null : augmentTier(scoreText) || null,
      winRate: scoreText.includes('%') ? percentAfter(scoreText) : null,
      pickRate: percentAfter(cleanText(children.eq(3).text())),
      isNew: element.find('span').toArray().some((span) => cleanText($(span).text()) === '新'),
      effect: latestEffects.get(slug) ?? effectFor(slug),
      topChampions: images.slice(1).flatMap((image) => {
        const icon = absoluteUrl($(image).attr('src'));
        const championName = cleanText($(image).attr('alt'));
        return icon && championName ? [championRef(icon, championName)] : [];
      }),
    });
  });

  const liveEntries = entries.filter((entry) => entry.availability === 'live');
  const pageText = cleanText($('main').text());
  const rarityCounts = liveEntries.reduce<MayhemAugmentRankingResult['meta']['rarityCounts']>(
    (counts, entry) => ({ ...counts, [entry.rarity]: counts[entry.rarity] + 1 }),
    { prismatic: 0, gold: 0, silver: 0 },
  );

  return {
    entries: entries.sort((left, right) => left.allRank - right.allRank),
    meta: {
      patch: pageText.match(/（([\d.]+)\s*版本）/)?.[1] ?? '',
      updatedAt: pageText.match(/数据更新\s*[:：]?\s*([0-9年月日-]+)/)?.[1] ?? '',
      activeCount: liveEntries.length,
      removedCount: entries.length - liveEntries.length,
      rarityCounts,
    },
  };
}

// ---------------------------------------------------------------------------
// 强化符文详情
// ---------------------------------------------------------------------------

export function parseMayhemAugmentDetail(html: string, slug: string): MayhemAugmentDetail {
  const $ = load(html);
  const main = $('main');
  const name = cleanText(main.find('h1').first().text());
  const icon = absoluteUrl(main.find(`img[alt="${name.replace(/"/g, '')}"]`).first().attr('src'));
  const badges = main.find('[data-slot="badge"]').toArray().map((badge) => cleanText($(badge).text()));
  const stats = new Map<string, string>();
  main.find('section[aria-label="stats"] > div').each((_index, element) => {
    const label = cleanText($(element).children().first().text());
    const value = cleanText($(element).children().eq(1).text());
    if (label) stats.set(label, value);
  });

  const guide: MayhemAugmentDetail['guide'] = [];
  const guideRoot = main.find('[data-augment-official-guide]').first();
  const officialEffect = cleanText(guideRoot.children('p').first().text());
  guideRoot.find('h3').each((_index, heading) => {
    const text = cleanText($(heading).nextUntil('h3', 'p').first().text());
    if (text) guide.push({ title: cleanText($(heading).text()), text });
  });

  const history = main.find('#trend tbody tr').toArray().flatMap((row) => {
    const cells = $(row).find('td').toArray().map((cell) => cleanText($(cell).text()));
    if (cells.length < 5) return [];
    return [{
      date: cells[0],
      patch: cells[1],
      rank: rankNumber(cells[2]),
      tier: augmentTier(cells[3]),
      pickRate: percentAfter(cells[4]),
    }];
  });

  const champions: MayhemAugmentChampionFit[] = main.find('#best-champions tbody tr').toArray().flatMap((row) => {
    const link = $(row).find('a[href*="/build/"]').first();
    const championSlug = slugFrom(link.attr('href'), 'build');
    const cells = $(row).find('td').toArray().map((cell) => cleanText($(cell).text()));
    const championName = cleanText(link.find('span').first().text());
    if (!championSlug || !championName) return [];
    return [{
      slug: championSlug,
      name: championName,
      icon: absoluteUrl(link.find('img').first().attr('src')),
      tier: augmentTier(cells[1] ?? ''),
      rank: rankNumber(cells[1] ?? ''),
      pickRate: percentAfter(cells[2] ?? ''),
      highlight: $(row).find('[data-slot="badge"]').length > 0,
    }];
  });

  const pickText = stats.get('登场率') ?? '';
  const pickDelta = pickText.match(/([▲▼])\s*(\d+(?:\.\d+)?)/);

  return {
    slug,
    name,
    icon,
    rarity: badges.map(rarityFromText).find((value): value is MayhemAugmentRarity => value !== null) ?? null,
    tier: augmentTier(stats.get('等级') ?? ''),
    rank: rankNumber(stats.get('排名') ?? ''),
    pickRate: percentAfter(pickText),
    pickDelta: pickDelta ? finiteNumber(pickDelta[2]) * (pickDelta[1] === '▲' ? 1 : -1) : null,
    patch: (stats.get('当前版本') ?? '').match(/[\d.]+/)?.[0] ?? '',
    effect: officialEffect || effectFor(slug),
    guide,
    history,
    champions,
    sourceUrl: `${MAYHEM_BASE_URL}/zh-cn/augments/${slug}/`,
  };
}

// ---------------------------------------------------------------------------
// 强势组合（组合索引 JSON）
// ---------------------------------------------------------------------------

interface MayhemComboLookup {
  id?: string;
  name?: string;
  icon?: string;
}

interface MayhemComboManifestCard {
  id?: string | number;
  slug?: string;
  publicSlug?: string;
  championId?: string;
  augmentId?: string;
  tier?: string;
  types?: unknown;
  description?: string;
  champName?: string;
  champIcon?: string;
  championHref?: string;
  augmentName?: string;
  augmentIcon?: string;
  comboHref?: string;
  comboDescription?: string;
  comboRef?: string;
  upvoteCount?: number;
  rankScore?: number;
}

interface MayhemComboManifest {
  schemaVersion?: number;
  cards?: MayhemComboManifestCard[];
  champions?: MayhemComboLookup[];
  augments?: MayhemComboLookup[];
  typeLabels?: Record<string, string>;
  pageSize?: number;
  totalCombos?: number;
}

export function parseMayhemComboManifest(manifest: MayhemComboManifest): Omit<MayhemComboResult, 'meta'> & {
  meta: Omit<MayhemComboResult['meta'], 'source' | 'origin' | 'fetchedAt'>;
} {
  const cards = Array.isArray(manifest.cards) ? manifest.cards : [];
  const championLookup = new Map((manifest.champions ?? []).map((item) => [cleanText(item.id), item]));
  const augmentLookup = new Map((manifest.augments ?? []).map((item) => [cleanText(item.id), item]));

  const entries = cards.flatMap<MayhemComboResult['entries'][number]>((card, index) => {
    const id = cleanText(String(card.id ?? ''));
    const slug = cleanText(card.publicSlug || card.slug);
    const tier = cleanText(card.tier) as MayhemComboTier;
    const championKey = cleanText(card.championId);
    const augmentKey = cleanText(card.augmentId);
    const champion = championLookup.get(championKey);
    const augment = augmentLookup.get(augmentKey);
    const championName = cleanText(card.champName || champion?.name);
    const championIcon = absoluteUrl(card.champIcon || champion?.icon);
    const augmentName = cleanText(card.augmentName || augment?.name);
    const augmentIcon = absoluteUrl(card.augmentIcon || augment?.icon);
    if (!id || !slug || !championName || !augmentName || !VALID_COMBO_TIERS.has(tier)) return [];

    const championSlug = slugFrom(card.championHref, 'build') || championKey.toLocaleLowerCase();
    const ref = championRef(championIcon, championName, championSlug);
    return [{
      id,
      slug,
      rank: index + 1,
      tier,
      types: Array.isArray(card.types)
        ? card.types.filter((value): value is string => typeof value === 'string')
        : [],
      description: cleanText(card.description || card.comboDescription),
      votes: finiteNumber(card.upvoteCount),
      rankScore: finiteNumber(card.rankScore),
      curated: card.comboRef?.startsWith('curated:') ?? false,
      champion: { id: ref.id, slug: ref.slug, name: championName, icon: championIcon },
      augment: {
        slug: augmentKey.replace(/_/g, '-').toLocaleLowerCase(),
        name: augmentName,
        icon: augmentIcon,
      },
      sourceUrl: absoluteUrl(card.comboHref || `/zh-cn/combo/${encodeURIComponent(slug)}/`),
    }];
  });
  const totalCount = Math.max(finiteNumber(manifest.totalCombos), entries.length);
  const pageSize = Math.max(1, finiteNumber(manifest.pageSize, 30));

  return {
    entries,
    meta: {
      totalCount,
      championCount: new Set(entries.map((entry) => entry.champion.slug)).size,
      featuredCount: entries.length,
      pageSize,
      pageCount: Math.max(1, Math.ceil(totalCount / pageSize)),
      typeLabels: manifest.typeLabels && typeof manifest.typeLabels === 'object' ? manifest.typeLabels : {},
    },
  };
}

// ---------------------------------------------------------------------------
// 英雄出装页
// ---------------------------------------------------------------------------

function parseItemGroup($: CheerioAPI, headings: string[]): MayhemItemBuildOption[] {
  const section = headings.map((heading) => sectionByHeading($, heading)).find(Boolean);
  if (!section) return [];
  return section.children('div').eq(1).children('div').toArray().flatMap((row) => {
    const items = $(row).find('a[href*="/items/"]').toArray().flatMap((item) => {
      const name = cleanText($(item).attr('title') || $(item).text() || $(item).find('img').attr('alt'));
      const icon = absoluteUrl($(item).find('img').attr('src'));
      return name && icon ? [{ name, icon }] : [];
    });
    const statsText = cleanText($(row).text());
    if (!items.length) return [];
    return [{
      items,
      pickRate: percentAfter(statsText, '登场率') ?? 0,
      winRate: percentAfter(statsText, '胜率') ?? 0,
    }];
  });
}

function parseSkillOrders($: CheerioAPI): MayhemSkillOrder[] {
  const section = sectionByHeading($, '技能主升顺序');
  if (!section) return [];
  const orders: MayhemSkillOrder[] = [];
  section.find('span').each((_index, span) => {
    const priority = cleanText($(span).text());
    if (!SKILL_PRIORITY.test(priority)) return;
    const summary = $(span).parent();
    const block = summary.parent();
    const summaryText = cleanText(summary.text());
    const sequences = block.find('span').toArray().flatMap((candidate) => {
      const text = cleanText($(candidate).text());
      const sequence = text.match(/技能加点序列[:：]\s*([QWER](?:\s+[QWER])+)/)?.[1];
      if (!sequence) return [];
      const statsText = cleanText($(candidate).prev().text());
      return [{
        sequence: sequence.replace(/\s+/g, ''),
        pickRate: percentAfter(statsText, '登场率') ?? 0,
        winRate: percentAfter(statsText, '胜率') ?? 0,
      }];
    });
    orders.push({
      priority: priority.replace(/\s+/g, ''),
      pickRate: percentAfter(summaryText, '登场率') ?? 0,
      winRate: percentAfter(summaryText, '胜率') ?? 0,
      sequences,
    });
  });
  return orders;
}

function parseBuildAugments($: CheerioAPI): MayhemAugmentRecommendation[] {
  const root = $('#best-augments');
  const augments: MayhemAugmentRecommendation[] = [];
  root.find('h3').each((_index, heading) => {
    const rarity = rarityFromText(cleanText($(heading).text()));
    if (!rarity) return;
    $(heading).next().find('a[href*="/augments/"]').each((_linkIndex, link) => {
      const element = $(link);
      const slug = slugFrom(element.attr('href'), 'augments');
      const name = cleanText(element.find('img').first().attr('alt'))
        || cleanText(element.find('[title]').first().attr('title'));
      if (!slug || !name) return;
      const rarityRank = cleanText(element.find('[data-recommendation-rank="rarity"]').text());
      const overallRank = cleanText(element.find('[data-recommendation-rank="overall"]').text())
        .replace(/^总榜\s*/, '');
      const text = cleanText(element.text());
      augments.push({
        slug,
        name,
        rarity,
        icon: absoluteUrl(element.find('img').first().attr('src')),
        tier: augmentTier(rarityRank),
        rarityRank: rankNumber(rarityRank),
        overallTier: augmentTier(overallRank),
        overallRank: rankNumber(overallRank),
        pickRate: percentAfter(text, '登场率'),
        winRate: percentAfter(text, '胜率'),
        effect: effectFor(slug),
      });
    });
  });
  return augments;
}

function parseBuildCombos($: CheerioAPI): MayhemBuildCombo[] {
  return $('#combos article[data-combo-card]').toArray().flatMap((article) => {
    const element = $(article);
    const link = element.find('a[href*="/combo/"]').last();
    const slug = slugFrom(link.attr('href'), 'combo');
    if (!slug) return [];
    const badges = link.find('[data-slot="badge"]').toArray().map((badge) => cleanText($(badge).text()));
    const title = cleanText(link.find('span').first().text()).replace(/\s*组合$/, '');
    return [{
      slug,
      title,
      tier: badges.find((badge) => /^[SABCD][+-]?$/.test(badge)) ?? '',
      types: badges.filter((badge) => !/^[SABCD][+-]?$/.test(badge)),
      description: cleanText(link.find('p').first().text()),
      augments: element.find('img').toArray().flatMap((image) => {
        const name = cleanText($(image).attr('alt'));
        const icon = absoluteUrl($(image).attr('src'));
        return name && icon ? [{ name, icon }] : [];
      }),
      sourceUrl: absoluteUrl(link.attr('href')),
    }];
  });
}

function parsePartners($: CheerioAPI): MayhemPartner[] {
  return $('#best-partners a[href*="/build/"]').toArray().flatMap((link) => {
    const element = $(link);
    const slug = slugFrom(element.attr('href'), 'build');
    const name = cleanText(element.find('span').first().text()).replace(/^#\d+\s*/, '')
      || cleanText(element.find('img').attr('alt'));
    const text = cleanText(element.text());
    if (!slug || !name) return [];
    return [{
      slug,
      name,
      icon: absoluteUrl(element.find('img').first().attr('src')),
      winRate: percentAfter(text, '胜率') ?? 0,
      pickRate: percentAfter(text, '登场率') ?? 0,
    }];
  });
}

export function parseMayhemChampionBuild(html: string, slug: string): MayhemChampionBuild {
  const $ = load(html);
  const header = $('#champion-summary').length ? $('#champion-summary') : $('main');
  const headerText = cleanText(header.text());
  const portrait = header.find('img').first();
  const name = cleanText(portrait.attr('alt')) || cleanText(header.find('h1').first().text()).replace(/\s*海克斯大乱斗出装$/, '');

  const facts = new Map<string, string>();
  header.find('dt').each((_index, term) => {
    facts.set(cleanText($(term).text()), cleanText($(term).next('dd').text()));
  });
  const tierFact = facts.get('梯队') ?? '';
  const badges = header.find('[data-slot="badge"]').toArray().map((badge) => cleanText($(badge).text()));
  const tierBadge = badges.find((badge) => VALID_TIERS.has(badge as MayhemChampionTier));
  const aliasLine = header.find('p').toArray()
    .map((paragraph) => cleanText($(paragraph).text()))
    .find((text) => text.includes('·') && !text.includes('版本')) ?? '';
  const summary = header.find('p').toArray()
    .map((paragraph) => cleanText($(paragraph).text()))
    .find((text) => text.includes('级强度')) ?? '';

  const balance = $('[title="大乱斗平衡改动"]').toArray().map((modifier) => {
    const parts = $(modifier).children('span').toArray().map((part) => cleanText($(part).text()));
    const arrow = parts[0] ?? '';
    return {
      direction: arrow.includes('↑') ? 'up' as const : arrow.includes('↓') ? 'down' as const : 'neutral' as const,
      label: parts[1] ?? '',
      value: parts[2] ?? '',
    };
  }).filter((modifier) => modifier.label && modifier.value);

  const itemGroups: Record<MayhemItemGroupKey, MayhemItemBuildOption[]> = {
    starting: parseItemGroup($, ['出门装']),
    boots: parseItemGroup($, ['鞋子']),
    core: parseItemGroup($, ['核心出装']),
    late: parseItemGroup($, ['其他成装', '后期出装']),
  };
  const hero = heroForSlug(slug);

  return {
    slug,
    id: hero?.id ?? 0,
    name,
    alias: hero?.alias ?? '',
    title: cleanText(aliasLine.split('·').slice(1).join('·')) || hero?.title || '',
    image: absoluteUrl(portrait.attr('src')),
    tier: championTier(tierBadge ?? tierFact),
    rank: rankNumber(tierFact),
    trend: trendFromText(tierFact),
    roles: badges.filter((badge) => ROLE_NAMES_ZH.includes(badge)),
    winRate: percentAfter(facts.get('胜率') ?? '') ?? percentAfter(headerText, '胜率') ?? 0,
    pickRate: percentAfter(facts.get('登场率') ?? '') ?? percentAfter(headerText, '登场率') ?? 0,
    patch: headerText.match(/补丁[:：]\s*([\d.]+)/)?.[1] ?? '',
    updatedAt: (facts.get('数据日期') ?? '').match(/[\d-]{8,10}/)?.[0] ?? '',
    summary,
    balance,
    skillOrders: parseSkillOrders($),
    itemGroups,
    augments: parseBuildAugments($),
    combos: parseBuildCombos($),
    partners: parsePartners($),
    sourceUrl: `${MAYHEM_BASE_URL}/zh-cn/build/${slug}/`,
  };
}

// ---------------------------------------------------------------------------
// 请求 + 缓存（内存 15 分钟；失败时退回磁盘上次成功的结果）
// ---------------------------------------------------------------------------

async function fetchText(url: string, accept: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: accept,
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'User-Agent': 'Mozilla/5.0 lolhelp/1.0',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`数据源返回 HTTP ${response.status}`);
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('数据源返回的内容过大');
    return text;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('数据源响应超时');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

interface Loaded<T> {
  value: T;
  origin: MayhemDataOrigin;
  fetchedAt: string;
  error?: string;
}

const memoryCache = new Map<string, { expiresAt: number; loaded: Loaded<unknown> }>();

async function loadWithFallback<T>(
  key: string,
  refresh: boolean,
  loader: () => Promise<T>,
): Promise<Loaded<T>> {
  const memory = memoryCache.get(key) as { expiresAt: number; loaded: Loaded<T> } | undefined;
  if (!refresh && memory && memory.expiresAt > Date.now()) return memory.loaded;
  try {
    const value = await loader();
    const loaded: Loaded<T> = { value, origin: 'live', fetchedAt: new Date().toISOString() };
    memoryCache.set(key, { loaded, expiresAt: Date.now() + CACHE_TTL_MS });
    writeDiskCache(`mayhem-${key}`, value);
    return loaded;
  } catch (error) {
    const reason = error instanceof Error ? error.message : '数据源暂时不可用';
    const fallback = memory?.loaded.value !== undefined
      ? { value: memory.loaded.value, savedAt: memory.loaded.fetchedAt }
      : readDiskCache<T>(`mayhem-${key}`);
    if (fallback) {
      return {
        value: fallback.value,
        origin: 'cache',
        fetchedAt: fallback.savedAt,
        error: `${reason}，先展示本机上次保存的数据`,
      };
    }
    throw new Error(reason);
  }
}

// arammayhem 有些图标文件名带 ' 或 !（Don't_Blink…），浏览器请求时会被编码成 %27，
// 服务器又重定向回原样，形成无限重定向。这类图标改用 CommunityDragon 的官方游戏图标。
const CDRAGON_AUGMENTS_URL = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/zh_cn/v1/cherry-augments.json';
const CDRAGON_ASSET_BASE = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/';
let iconFallbacks: { expiresAt: number; map: Map<string, string> } | null = null;

interface CdragonAugment {
  augmentNameId?: string;
  nameTRA?: string;
  augmentSmallIconPath?: string;
}

export function needsIconFallback(icon: string): boolean {
  let decoded = icon;
  try {
    decoded = decodeURI(icon);
  } catch {
    // 编码不合法时按原样判断
  }
  return /['!]/.test(decoded);
}

async function loadIconFallbacks(): Promise<Map<string, string>> {
  if (iconFallbacks && iconFallbacks.expiresAt > Date.now()) return iconFallbacks.map;
  const map = new Map<string, string>();
  try {
    const rows = JSON.parse(await fetchText(CDRAGON_AUGMENTS_URL, 'application/json')) as CdragonAugment[];
    for (const row of Array.isArray(rows) ? rows : []) {
      const name = cleanText(row.nameTRA);
      const path = (row.augmentSmallIconPath ?? '').replace(/^\/lol-game-data\/assets\//i, '').toLocaleLowerCase();
      if (!name || !path) continue;
      // 同名强化（斗魂竞技场 / 大乱斗）优先取大乱斗那份
      const mayhem = /^aram_/i.test(row.augmentNameId ?? '') || path.includes('/kiwi/');
      if (!map.has(name) || mayhem) map.set(name, `${CDRAGON_ASSET_BASE}${path}`);
    }
  } catch {
    // 拿不到就保持原图标
  }
  iconFallbacks = { expiresAt: Date.now() + 6 * 60 * 60_000, map };
  return map;
}

async function withIconFallbacks<T extends { name: string; icon: string }>(items: T[]): Promise<T[]> {
  if (!items.some((item) => needsIconFallback(item.icon))) return items;
  const map = await loadIconFallbacks();
  return items.map((item) => (needsIconFallback(item.icon) && map.has(item.name)
    ? { ...item, icon: map.get(item.name) as string }
    : item));
}

function sourceMeta(loaded: Loaded<unknown>) {
  return { source: SOURCE_NAME, origin: loaded.origin, fetchedAt: loaded.fetchedAt };
}

export async function getMayhemTierList(refresh = false): Promise<MayhemTierListResult> {
  try {
    const loaded = await loadWithFallback('tier-list', refresh, async () => {
      const parsed = parseMayhemTierList(await fetchText(MAYHEM_TIER_LIST_URL, 'text/html'));
      if (!parsed.entries.length) throw new Error('数据源页面结构变了，没能读出英雄强度榜');
      return parsed;
    });
    return {
      entries: loaded.value.entries,
      meta: { ...loaded.value.meta, ...sourceMeta(loaded) },
      error: loaded.error,
    };
  } catch (error) {
    return {
      entries: [],
      meta: { patch: '', updatedAt: '', source: SOURCE_NAME, origin: 'live', fetchedAt: '' },
      error: error instanceof Error ? error.message : '海克斯大乱斗强度榜获取失败',
    };
  }
}

export async function getMayhemAugmentRanking(refresh = false): Promise<MayhemAugmentRankingResult> {
  try {
    const loaded = await loadWithFallback('augments', refresh, async () => {
      const parsed = parseMayhemAugmentRanking(await fetchText(MAYHEM_AUGMENTS_URL, 'text/html'));
      if (!parsed.entries.length) throw new Error('数据源页面结构变了，没能读出强化符文');
      return parsed;
    });
    return {
      entries: await withIconFallbacks(loaded.value.entries),
      meta: { ...loaded.value.meta, ...sourceMeta(loaded) },
      error: loaded.error,
    };
  } catch (error) {
    return {
      entries: [],
      meta: {
        patch: '',
        updatedAt: '',
        activeCount: 0,
        removedCount: 0,
        rarityCounts: { prismatic: 0, gold: 0, silver: 0 },
        source: SOURCE_NAME,
        origin: 'live',
        fetchedAt: '',
      },
      error: error instanceof Error ? error.message : '强化符文排行获取失败',
    };
  }
}

export async function getMayhemCombos(refresh = false): Promise<MayhemComboResult> {
  try {
    const loaded = await loadWithFallback('combos', refresh, async () => {
      const manifest = JSON.parse(await fetchText(MAYHEM_COMBOS_INDEX_URL, 'application/json')) as MayhemComboManifest;
      const parsed = parseMayhemComboManifest(manifest);
      if (!parsed.entries.length) throw new Error('数据源格式变了，没能读出强势组合');
      return parsed;
    });
    const augments = await withIconFallbacks(loaded.value.entries.map((entry) => entry.augment));
    return {
      entries: loaded.value.entries.map((entry, index) => ({ ...entry, augment: augments[index] })),
      meta: { ...loaded.value.meta, ...sourceMeta(loaded) },
      error: loaded.error,
    };
  } catch (error) {
    return {
      entries: [],
      meta: {
        totalCount: 0,
        championCount: 0,
        featuredCount: 0,
        pageSize: 30,
        pageCount: 1,
        typeLabels: {},
        source: SOURCE_NAME,
        origin: 'live',
        fetchedAt: '',
      },
      error: error instanceof Error ? error.message : '强势组合获取失败',
    };
  }
}

export async function getMayhemChampionBuild(slug: string, refresh = false): Promise<MayhemChampionBuildResult> {
  const normalizedSlug = slug.trim().toLocaleLowerCase();
  if (!SLUG_PATTERN.test(normalizedSlug)) return { build: null, error: '英雄标识无效' };
  try {
    const loaded = await loadWithFallback(`build-${normalizedSlug}`, refresh, async () => {
      const html = await fetchText(`${MAYHEM_BASE_URL}/zh-cn/build/${normalizedSlug}/`, 'text/html');
      const build = parseMayhemChampionBuild(html, normalizedSlug);
      if (!build.name) throw new Error('数据源页面结构变了，没能读出英雄出装');
      return build;
    });
    const build = loaded.value;
    return {
      build: { ...build, augments: await withIconFallbacks(build.augments) },
      origin: loaded.origin,
      error: loaded.error,
    };
  } catch (error) {
    return { build: null, error: error instanceof Error ? error.message : '海克斯大乱斗英雄详情获取失败' };
  }
}

export async function getMayhemAugmentDetail(slug: string, refresh = false): Promise<MayhemAugmentDetailResult> {
  const normalizedSlug = slug.trim().toLocaleLowerCase();
  if (!SLUG_PATTERN.test(normalizedSlug)) return { detail: null, error: '强化符文标识无效' };
  try {
    const loaded = await loadWithFallback(`augment-${normalizedSlug}`, refresh, async () => {
      const html = await fetchText(`${MAYHEM_BASE_URL}/zh-cn/augments/${normalizedSlug}/`, 'text/html');
      const detail = parseMayhemAugmentDetail(html, normalizedSlug);
      if (!detail.name) throw new Error('数据源页面结构变了，没能读出强化符文详情');
      return detail;
    });
    const [detail] = await withIconFallbacks([loaded.value]);
    return { detail, origin: loaded.origin, error: loaded.error };
  } catch (error) {
    return { detail: null, error: error instanceof Error ? error.message : '强化符文详情获取失败' };
  }
}
