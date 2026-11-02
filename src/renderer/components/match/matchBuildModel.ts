import type { MatchParticipantSummary, MatchTimeline, MatchTimelineEvent, PlayerRuneSummary } from '../../../shared/api';
import { buildSkillMatrix, type BuildSkillKey, type BuildSkillStep } from './buildSkillMatrixModel';

// 「构建」页的数据模型：
// - 把时间线里的买、卖、撤销、合成（被消耗）对上账，得到每一次回家买了什么、哪些后来合成了大件、哪些卖掉了；
// - 最终出装每一件是几分钟做出来的（装备成型时间），可以和对位比快慢；
// - 技能主副升顺序（Q > E > W）、前三级怎么点、大招几级点；
// - 符文按系别分组（精密 / 主宰 / 巫术 / 启迪 / 坚决）。

// ─── 装备分类 ──────────────────────────────────────────────────────────
// 渲染进程拿不到装备价格，下面这几组 ID 是从游戏自带的装备数据（datas.json，15.21）里按
// 标签和价格整理出来的：鞋子、饰品、消耗品、出门装、合成小件。剩下的就是「大件」。
// 另外不管 ID，开局 90 秒内买的一律当出门装，新版本加了新的出门装也不会被误算成大件。

const BOOTS = new Set([1001, 1111, 2422, 3005, 3006, 3009, 3010, 3013, 3020, 3047, 3111, 3117, 3158, 3170, 3171, 3172, 3173, 3174, 3175, 3176]);
const TRINKETS = new Set([3330, 3340, 3363, 3364, 3513]);
const CONSUMABLES = new Set([2003, 2009, 2010, 2031, 2033, 2052, 2055, 2138, 2139, 2140, 2141, 2150, 2151, 2152, 2403, 3400, 3599, 3600, 3901, 3902, 3903, 4638, 4641, 7050]);
const STARTERS = new Set([1054, 1055, 1056, 1082, 1083, 1101, 1102, 1103, 1104, 1105, 1106, 1107, 3850, 3854, 3858, 3862, 3865, 3866, 3867, 3869, 3870, 3871, 3876, 3877]);
const COMPONENTS = new Set([
  1004, 1006, 1011, 1018, 1026, 1027, 1028, 1029, 1031, 1033, 1036, 1037, 1038, 1042, 1043, 1052, 1053, 1057, 1058,
  2015, 2019, 2020, 2021, 2022, 2420, 2421, 2508, 3024, 3035, 3044, 3051, 3057, 3066, 3067, 3070, 3076, 3077, 3082,
  3086, 3105, 3108, 3112, 3113, 3114, 3123, 3133, 3134, 3140, 3144, 3145, 3147, 3155, 3177, 3191, 3211, 3801, 3802,
  3803, 3916, 4003, 4630, 4632, 4635, 4642, 6660, 6670, 6690,
]);

export type ItemRole = 'core' | 'boots' | 'trinket' | 'consumable' | 'starter' | 'component';

/** 大乱斗、竞技场等模式的装备 ID 是在普通 ID 前面加两位（如 323070 = 女神之泪），按普通 ID 归类。 */
function baseItemId(id: number): number {
  return id >= 100_000 ? id % 10_000 : id;
}

export function itemRole(id: number): ItemRole {
  const base = baseItemId(id);
  if (BOOTS.has(base)) return 'boots';
  if (TRINKETS.has(base)) return 'trinket';
  if (CONSUMABLES.has(base)) return 'consumable';
  if (STARTERS.has(base)) return 'starter';
  if (COMPONENTS.has(base)) return 'component';
  return 'core';
}

/** 开局 90 秒内买的东西都算出门装。 */
const STARTING_WINDOW = 90_000;

export function buildTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor(timestamp / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// ─── 购买记录对账 ──────────────────────────────────────────────────────

export type PurchaseFate = 'kept' | 'combined' | 'consumed' | 'sold' | 'undone';

export interface BuildPurchase {
  key: string;
  itemId: number;
  name: string;
  icon: string;
  time: number;
  fate: PurchaseFate;
  /** 卖掉 / 合成 / 用掉的时间。 */
  endTime?: number;
  /** 合成进了哪件装备。 */
  intoName?: string;
  final: boolean;
}

export interface BuildSale {
  key: string;
  itemId: number;
  name: string;
  icon: string;
  time: number;
}

export interface BuildTrip {
  key: string;
  label: string;
  time: number;
  purchases: BuildPurchase[];
  sales: BuildSale[];
}

export interface BuildMilestone {
  key: string;
  itemId: number;
  name: string;
  icon: string;
  time: number | null;
  role: ItemRole;
  /** 第几件大件（鞋子不算），从 1 开始；鞋子为 0。 */
  order: number;
  /** 不是买的，而是由这件装备升级来的。 */
  upgradedFrom?: string;
}

const COMBINE_WINDOW = 1500;
const TRIP_GAP = 20_000;

type ItemEvent = MatchTimelineEvent & { goldGain?: number };

function itemInfo(event: MatchTimelineEvent, catalog: Map<number, { name: string; icon: string }>, id: number) {
  const known = catalog.get(id);
  return {
    name: event.itemId === id && event.itemName ? event.itemName : known?.name ?? `装备 ${id}`,
    icon: event.itemId === id && event.itemIcon ? event.itemIcon : known?.icon ?? '',
  };
}

/** 一个人整局的购买记录：处理撤销、卖出、合成，标出最后留在身上的装备。 */
export function reconcilePurchases(events: MatchTimelineEvent[], participantId: number, finalItemIds: number[]): { purchases: BuildPurchase[]; sales: BuildSale[] } {
  const own = (events as ItemEvent[])
    .filter((event) => event.participantId === participantId && event.type.startsWith('ITEM_'))
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.timestamp - b.event.timestamp || a.index - b.index)
    .map(({ event }) => event);

  const catalog = new Map<number, { name: string; icon: string }>();
  own.forEach((event) => {
    if (event.itemId && (event.itemName || event.itemIcon)) catalog.set(event.itemId, { name: event.itemName ?? '', icon: event.itemIcon ?? '' });
  });

  const purchases: BuildPurchase[] = [];
  const sales: BuildSale[] = [];
  const owned = (id: number) => purchases.filter((item) => item.itemId === id && item.fate === 'kept');

  own.forEach((event, index) => {
    const id = Number(event.itemId) || 0;
    switch (event.type) {
      case 'ITEM_PURCHASED': {
        if (!id) return;
        const info = itemInfo(event, catalog, id);
        purchases.push({ key: `p${index}-${event.timestamp}`, itemId: id, ...info, time: event.timestamp, fate: 'kept', final: false });
        return;
      }
      case 'ITEM_UNDO': {
        const before = Number(event.beforeId) || 0;
        const after = Number(event.afterId) || 0;
        if (before > 0) {
          // 撤销一次购买：最近那件买的同名装备不算数。
          const target = owned(before).at(-1);
          if (target) target.fate = 'undone';
          // 买的时候合成掉的材料也要还回来。
          purchases.forEach((item) => {
            if ((item.fate === 'consumed' || item.fate === 'combined') && item.endTime !== undefined && target && Math.abs(item.endTime - target.time) <= COMBINE_WINDOW) {
              item.fate = 'kept';
              item.endTime = undefined;
              item.intoName = undefined;
            }
          });
        } else if (after > 0) {
          // 撤销一次卖出：东西回到身上。
          const saleIndex = sales.map((sale) => sale.itemId).lastIndexOf(after);
          if (saleIndex >= 0) sales.splice(saleIndex, 1);
          const sold = purchases.filter((item) => item.itemId === after && item.fate === 'sold').at(-1);
          if (sold) {
            sold.fate = 'kept';
            sold.endTime = undefined;
          }
        }
        return;
      }
      case 'ITEM_SOLD': {
        if (!id) return;
        const info = itemInfo(event, catalog, id);
        sales.push({ key: `s${index}-${event.timestamp}`, itemId: id, ...info, time: event.timestamp });
        const target = owned(id).at(-1);
        if (target) {
          target.fate = 'sold';
          target.endTime = event.timestamp;
        }
        return;
      }
      case 'ITEM_DESTROYED': {
        if (!id) return;
        const target = owned(id)[0];
        if (!target) return;
        target.fate = 'consumed';
        target.endTime = event.timestamp;
        return;
      }
      default:
    }
  });

  // 被消耗掉的那一刻刚好买了别的装备：说明它是材料，被合成进了那件装备（事件先后顺序不固定，所以放到最后再对）。
  purchases.forEach((item) => {
    if (item.fate !== 'consumed' || item.endTime === undefined) return;
    const product = purchases.find((other) => other !== item && other.fate !== 'undone' && other.itemId !== item.itemId
      && Math.abs(other.time - (item.endTime as number)) <= COMBINE_WINDOW && other.time >= item.time);
    if (product) {
      item.fate = 'combined';
      item.intoName = product.name;
    }
  });

  // 最后还在身上、而且在结算装备栏里的，就是最终出装。
  const remaining = [...finalItemIds];
  [...purchases].reverse().forEach((item) => {
    if (item.fate !== 'kept') return;
    const slot = remaining.indexOf(item.itemId);
    if (slot >= 0) {
      item.final = true;
      remaining.splice(slot, 1);
    }
  });
  return { purchases: purchases.filter((item) => item.fate !== 'undone'), sales };
}

/** 按回家分组：前后 20 秒以内的购买算同一次。第一次叫「出门装」。 */
export function groupTrips(purchases: BuildPurchase[], sales: BuildSale[]): BuildTrip[] {
  const entries = [
    ...purchases.map((item) => ({ time: item.time, purchase: item as BuildPurchase | undefined, sale: undefined as BuildSale | undefined })),
    ...sales.map((sale) => ({ time: sale.time, purchase: undefined as BuildPurchase | undefined, sale: sale as BuildSale | undefined })),
  ].sort((a, b) => a.time - b.time);
  const trips: BuildTrip[] = [];
  entries.forEach((entry) => {
    const current = trips.at(-1);
    const lastTime = current ? Math.max(...current.purchases.map((item) => item.time), ...current.sales.map((sale) => sale.time)) : -Infinity;
    if (!current || entry.time - lastTime > TRIP_GAP) {
      trips.push({ key: `t${trips.length}-${entry.time}`, label: '', time: entry.time, purchases: [], sales: [] });
    }
    const trip = trips[trips.length - 1];
    if (entry.purchase) trip.purchases.push(entry.purchase);
    if (entry.sale) trip.sales.push(entry.sale);
  });
  let back = 0;
  trips.forEach((trip, index) => {
    if (index === 0 && trip.time < 120_000) trip.label = '出门装';
    else {
      back += 1;
      trip.label = `第 ${back} 次回家`;
    }
  });
  return trips;
}

/** 最终出装的成型时间，按做出来的先后排；大件编号，鞋子单独标。 */
export function buildMilestones(player: MatchParticipantSummary, purchases: BuildPurchase[]): BuildMilestone[] {
  const finals = purchases.filter((item) => item.final);
  const used = new Set<BuildPurchase>();
  // 有些装备不是买来的，而是由身上的装备升级 / 变形而来（魔宗 → 魔切、大天使 → 炽天使、辅助任务装……）：
  // 时间线里只有旧装备消失，没有新装备的购买记录。这种情况用旧装备买下的时间。
  const upgradeSources = purchases.filter((item) => item.fate === 'consumed' && ['core', 'starter'].includes(itemRole(item.itemId)));
  const items: BuildMilestone[] = player.items
    .filter((item) => item.id > 0 && itemRole(item.id) !== 'trinket')
    .map((item) => {
      let purchase = finals.find((candidate) => candidate.itemId === item.id && !used.has(candidate));
      let upgradedFrom: string | undefined;
      if (!purchase) {
        const source = upgradeSources.find((candidate) => !used.has(candidate));
        if (source) {
          purchase = source;
          upgradedFrom = source.name;
        }
      }
      if (purchase) used.add(purchase);
      const time = purchase?.time ?? null;
      const role: ItemRole = time !== null && time < STARTING_WINDOW && itemRole(item.id) !== 'boots' && !upgradedFrom ? 'starter' : itemRole(item.id);
      return { key: `${item.slot}-${item.id}`, itemId: item.id, name: item.name, icon: item.icon, time, role, order: 0, upgradedFrom };
    })
    .sort((a, b) => (a.time ?? Number.POSITIVE_INFINITY) - (b.time ?? Number.POSITIVE_INFINITY));
  let order = 0;
  items.forEach((item) => {
    if (item.role === 'core') {
      order += 1;
      item.order = order;
    }
  });
  return items;
}

/** 装备成型时间轴只看大件和鞋子：出门装、小件、药水不算「成型」。 */
export function isPowerSpike(item: BuildMilestone): boolean {
  return (item.role === 'core' || item.role === 'boots') && item.time !== null;
}

// ─── 技能 ──────────────────────────────────────────────────────────────

export interface SkillPlan {
  steps: BuildSkillStep[];
  keys: BuildSkillKey[];
  columnCount: number;
  /** 主升、副升、最后升的顺序，例如 Q > E > W。 */
  priority: Array<'Q' | 'W' | 'E'>;
  /** 前三次加点。 */
  opening: BuildSkillKey[];
  /** 大招是在第几次加点的时候点的。 */
  ultimateAt: number[];
}

export function buildSkillPlan(events: MatchTimelineEvent[]): SkillPlan {
  const matrix = buildSkillMatrix(events);
  const basics: Array<'Q' | 'W' | 'E'> = ['Q', 'W', 'E'];
  const score = (key: 'Q' | 'W' | 'E') => {
    const ranks = matrix.steps.filter((step) => step.key === key);
    const maxed = ranks.find((step) => step.rank >= 5);
    // 先点满的排前面；都没点满的，按点了几级、再按最后一次点的早晚。
    return { key, maxedAt: maxed?.sequence ?? Number.POSITIVE_INFINITY, count: ranks.length, last: ranks.at(-1)?.sequence ?? Number.POSITIVE_INFINITY };
  };
  const priority = basics
    .map(score)
    .sort((a, b) => a.maxedAt - b.maxedAt || b.count - a.count || a.last - b.last)
    .map((item) => item.key);
  return {
    steps: matrix.steps,
    keys: matrix.keys,
    columnCount: matrix.columnCount,
    priority: matrix.steps.length ? priority : [],
    opening: matrix.steps.slice(0, 3).map((step) => step.key),
    ultimateAt: matrix.steps.filter((step) => step.key === 'R').map((step) => step.sequence),
  };
}

// ─── 符文 ──────────────────────────────────────────────────────────────

export type RuneTreeKey = 'precision' | 'domination' | 'sorcery' | 'inspiration' | 'resolve' | 'other';

export const RUNE_TREE_NAMES: Record<RuneTreeKey, string> = {
  precision: '精密',
  domination: '主宰',
  sorcery: '巫术',
  inspiration: '启迪',
  resolve: '坚决',
  other: '符文',
};

const RUNE_TREE_EXCEPTIONS: Record<number, RuneTreeKey> = {
  8299: 'precision',
  8242: 'resolve',
  8410: 'inspiration',
  9923: 'domination',
};

export function runeTree(id: number): RuneTreeKey {
  if (RUNE_TREE_EXCEPTIONS[id]) return RUNE_TREE_EXCEPTIONS[id];
  if (id >= 9100 && id < 9200) return 'precision';
  const family = Math.floor(id / 100);
  if (family === 80) return 'precision';
  if (family === 81) return 'domination';
  if (family === 82) return 'sorcery';
  if (family === 83) return 'inspiration';
  if (family === 84) return 'resolve';
  return 'other';
}

export interface RunePage {
  keystone: PlayerRuneSummary | null;
  primaryTree: RuneTreeKey;
  primary: PlayerRuneSummary[];
  secondaryTree: RuneTreeKey | null;
  secondary: PlayerRuneSummary[];
}

export function buildRunePage(player: MatchParticipantSummary): RunePage {
  const runes = (player.runes ?? []).filter((rune) => rune.kind !== 'augment');
  const keystone = player.primaryRune ?? runes[0] ?? null;
  const primaryTree = keystone ? runeTree(keystone.id) : 'other';
  const primary = runes.filter((rune) => runeTree(rune.id) === primaryTree && rune.id !== keystone?.id);
  const secondary = runes.filter((rune) => runeTree(rune.id) !== primaryTree);
  const secondaryTree = secondary[0] ? runeTree(secondary[0].id) : player.secondaryRune ? runeTree(player.secondaryRune.id) : null;
  return {
    keystone,
    primaryTree,
    primary,
    secondaryTree,
    secondary: secondary.length ? secondary : player.secondaryRune ? [player.secondaryRune] : [],
  };
}

// ─── 对线：和对位逐分钟比 ──────────────────────────────────────────────

export type LaneMetric = 'gold' | 'cs' | 'xp';

export interface LaneSample {
  t: number;
  gold: number;
  cs: number;
  xp: number;
  level: number;
}

export interface LaneCheckpoint {
  minute: number;
  mine: LaneSample;
  theirs: LaneSample;
}

export interface LaneDuel {
  /** 每一帧「我 − 对位」的差值。 */
  diffs: LaneSample[];
  checkpoints: LaneCheckpoint[];
  verdict: 'ahead' | 'behind' | 'even';
  /** 用来下结论的那一分钟（对线期结束，一般是 14 分钟）。 */
  verdictAt: LaneCheckpoint;
}

function sampleOf(timeline: MatchTimeline, participantId: number): LaneSample[] {
  return timeline.frames.flatMap((frame) => {
    const data = frame.participantFrames?.[String(participantId)];
    if (!data) return [];
    return [{
      t: frame.timestamp,
      gold: Number(data.totalGold) || 0,
      cs: (Number(data.minionsKilled) || 0) + (Number(data.jungleMinionsKilled) || 0),
      xp: Number(data.xp) || 0,
      level: Number(data.level) || 0,
    }];
  });
}

const LANE_END_MINUTE = 14;

/** 两个人逐分钟的经济、补刀、经验差；挑 10、15 分钟做对比，用 14 分钟（对线期结束）的经济差下结论。 */
export function buildLaneDuel(timeline: MatchTimeline | null, myId: number, rivalId: number): LaneDuel | null {
  if (!timeline || !myId || !rivalId) return null;
  const mine = sampleOf(timeline, myId);
  const theirs = sampleOf(timeline, rivalId);
  const byTime = new Map(theirs.map((sample) => [sample.t, sample]));
  const pairs = mine.flatMap((sample) => {
    const other = byTime.get(sample.t);
    return other ? [{ mine: sample, theirs: other }] : [];
  });
  if (pairs.length < 3 || pairs.every((pair) => pair.mine.gold === 0 && pair.theirs.gold === 0)) return null;

  const at = (minute: number) => {
    const target = minute * 60_000;
    let best: (typeof pairs)[number] | undefined;
    pairs.forEach((pair) => {
      if (Math.abs(pair.mine.t - target) <= 30_000 && (!best || Math.abs(pair.mine.t - target) < Math.abs(best.mine.t - target))) best = pair;
    });
    return best ? { minute, ...best } : null;
  };
  const checkpoints = [10, 15].map(at).filter((item): item is LaneCheckpoint => item !== null);
  const verdictAt = at(LANE_END_MINUTE) ?? checkpoints.at(-1) ?? { minute: Math.round(pairs[pairs.length - 1].mine.t / 60_000), ...pairs[pairs.length - 1] };
  const goldDiff = verdictAt.mine.gold - verdictAt.theirs.gold;
  return {
    diffs: pairs.map(({ mine: a, theirs: b }) => ({ t: a.t, gold: a.gold - b.gold, cs: a.cs - b.cs, xp: a.xp - b.xp, level: a.level - b.level })),
    checkpoints,
    verdict: goldDiff >= 500 ? 'ahead' : goldDiff <= -500 ? 'behind' : 'even',
    verdictAt,
  };
}
