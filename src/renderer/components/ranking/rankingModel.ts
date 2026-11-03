import type {
  ChampionDetailGameLength,
  ChampionRankingEntry,
  ChampionRankingMode,
} from '../../../shared/api';

// 英雄排行页的「解读层」：把一张冷冰冰的表变成能直接回答问题的结论——
// 现在玩谁稳？谁在上升？该 Ban 谁？有没有冷门宝藏？这个英雄到底值不值得练？
// 这里只放纯函数，方便单测；组件只负责把结论画出来。

export type TierToken = 'splus' | 's' | 'a' | 'b' | 'c' | 'd';
export type RankingSortKey = 'rank' | 'winRate' | 'pickRate' | 'banRate' | 'trend';

const TIER_LABELS: Record<number, string> = { 0: 'S+', 1: 'S', 2: 'A', 3: 'B', 4: 'C', 5: 'D' };
const TIER_NOTES: Record<number, string> = {
  0: '版本之子',
  1: '版本强势',
  2: '稳定好用',
  3: '中规中矩',
  4: '略显乏力',
  5: '版本弱势',
};

export function tierLabel(tier: number): string {
  return TIER_LABELS[tier] ?? 'D';
}

export function tierNote(tier: number): string {
  return TIER_NOTES[tier] ?? '';
}

export function tierToken(label: string): TierToken {
  if (label === 'S+') return 'splus';
  const key = label.slice(0, 1).toLowerCase();
  return (['s', 'a', 'b', 'c', 'd'].includes(key) ? key : 'd') as TierToken;
}

export function primaryRateLabel(mode: ChampionRankingMode): string {
  return mode === 'arena' ? '前二率' : '胜率';
}

export function thirdRateLabel(mode: ChampionRankingMode): string {
  return mode === 'arena' ? '登顶率' : '禁用率';
}

export function thirdRate(entry: ChampionRankingEntry, mode: ChampionRankingMode): number | null {
  return mode === 'arena' ? entry.firstPlaceRate : entry.banRate;
}

export function rankChange(entry: ChampionRankingEntry): number | null {
  return entry.previousRank === null ? null : entry.previousRank - entry.rank;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)}%`;
}

export function formatSigned(value: number, digits = 1): string {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return '±0';
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(digits)}`;
}

export function formatGames(value: number | null | undefined): string {
  if (!value) return '0';
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(value >= 1_000_000 ? 0 : 1)}万`;
  return String(Math.round(value));
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export interface RankingAverages {
  // 按场次加权的平均胜率：大样本英雄说了算，避免冷门英雄把均值拉偏
  winRate: number;
  pickRate: number;
  banRate: number | null;
}

export function rankingAverages(entries: ChampionRankingEntry[]): RankingAverages {
  const games = entries.reduce((sum, entry) => sum + entry.games, 0);
  const winRate = games > 0
    ? entries.reduce((sum, entry) => sum + entry.winRate * entry.games, 0) / games
    : entries.reduce((sum, entry) => sum + entry.winRate, 0) / Math.max(1, entries.length);
  const bans = entries.flatMap((entry) => (entry.banRate === null ? [] : [entry.banRate]));
  return {
    winRate,
    pickRate: median(entries.map((entry) => entry.pickRate)),
    banRate: bans.length ? median(bans) : null,
  };
}

export type InsightKind = 'answer' | 'rising' | 'ban' | 'hidden';

export interface RankingInsight {
  kind: InsightKind;
  label: string;
  entry: ChampionRankingEntry;
  value: string;
  note: string;
}

// 至少要有一定样本，否则「冷门宝藏」会被十几场的偶然高胜率霸占。
function reliable(entries: ChampionRankingEntry[]): ChampionRankingEntry[] {
  const maxGames = Math.max(0, ...entries.map((entry) => entry.games));
  return entries.filter((entry) => entry.games >= maxGames * 0.02);
}

export function rankingInsights(entries: ChampionRankingEntry[], mode: ChampionRankingMode): RankingInsight[] {
  if (entries.length < 4) return [];
  const pool = reliable(entries);
  const averages = rankingAverages(pool);
  const rateLabel = primaryRateLabel(mode);
  const insights: RankingInsight[] = [];
  const used = new Set<number>();
  const take = (candidate: ChampionRankingEntry | undefined, build: (entry: ChampionRankingEntry) => RankingInsight) => {
    if (!candidate || used.has(candidate.champion.id)) return;
    used.add(candidate.champion.id);
    insights.push(build(candidate));
  };

  const popular = pool.filter((entry) => entry.pickRate >= averages.pickRate);
  const answer = [...popular].sort((a, b) => b.winRate - a.winRate)[0];
  take(answer, (entry) => ({
    kind: 'answer',
    label: '版本答案',
    entry,
    value: formatPercent(entry.winRate),
    note: `热门英雄里${rateLabel}第一`,
  }));

  const rising = [...pool]
    .filter((entry) => (rankChange(entry) ?? 0) >= 2)
    .sort((a, b) => (rankChange(b) ?? 0) - (rankChange(a) ?? 0))[0];
  take(rising, (entry) => ({
    kind: 'rising',
    label: '上升最快',
    entry,
    value: `↑${rankChange(entry)}`,
    note: `比上版本前进 ${rankChange(entry)} 名`,
  }));

  if (mode === 'arena') {
    const crown = [...pool]
      .filter((entry) => entry.firstPlaceRate !== null)
      .sort((a, b) => (b.firstPlaceRate ?? 0) - (a.firstPlaceRate ?? 0))[0];
    take(crown, (entry) => ({
      kind: 'ban',
      label: '登顶专业户',
      entry,
      value: formatPercent(entry.firstPlaceRate),
      note: '拿第一的频率最高',
    }));
  } else {
    const banned = [...pool]
      .filter((entry) => entry.banRate !== null)
      .sort((a, b) => (b.banRate ?? 0) - (a.banRate ?? 0))[0];
    take(banned, (entry) => ({
      kind: 'ban',
      label: 'Ban 位焦点',
      entry,
      value: formatPercent(entry.banRate),
      note: `每 ${Math.max(1, Math.round(100 / Math.max(entry.banRate ?? 1, 1)))} 局就被禁一次`,
    }));
  }

  const hidden = [...pool]
    .filter((entry) => entry.pickRate < averages.pickRate * 0.6 && entry.winRate > averages.winRate)
    .sort((a, b) => b.winRate - a.winRate)[0];
  take(hidden, (entry) => ({
    kind: 'hidden',
    label: '冷门宝藏',
    entry,
    value: formatPercent(entry.winRate),
    note: `只有 ${formatPercent(entry.pickRate)} 的人在玩`,
  }));

  return insights;
}

export type VerdictTone = 'strong' | 'good' | 'neutral' | 'trap' | 'weak';

export interface ChampionVerdict {
  tone: VerdictTone;
  headline: string;
  reasons: string[];
}

// 一句话结论：先给定性（值不值得玩），再列出依据。
export function championVerdict(
  entry: ChampionRankingEntry,
  averages: RankingAverages,
  mode: ChampionRankingMode,
): ChampionVerdict {
  const winDelta = entry.winRate - averages.winRate;
  const popular = entry.pickRate >= averages.pickRate;
  const rateLabel = primaryRateLabel(mode);
  const reasons: string[] = [];

  let tone: VerdictTone;
  let headline: string;
  if (winDelta >= 1.5 && popular) {
    tone = 'strong';
    headline = '版本强势又热门，放心秒选';
  } else if (winDelta >= 1) {
    tone = 'good';
    headline = popular ? '表现亮眼，值得优先考虑' : '冷门但很能赢，会玩就是上分利器';
  } else if (winDelta <= -1.5 && popular) {
    tone = 'trap';
    headline = '人气很高但赢得不多，小心人气陷阱';
  } else if (winDelta <= -1.5) {
    tone = 'weak';
    headline = '当前版本偏弱，除非是绝活';
  } else {
    tone = 'neutral';
    headline = '表现中规中矩，看阵容和熟练度';
  }

  reasons.push(`${rateLabel}${winDelta >= 0 ? '高于' : '低于'}平均 ${Math.abs(winDelta).toFixed(1)} 个百分点`);
  const change = rankChange(entry);
  if (change !== null && Math.abs(change) >= 3) {
    reasons.push(change > 0 ? `比上版本上升 ${change} 名` : `比上版本下滑 ${Math.abs(change)} 名`);
  }
  if (mode !== 'arena' && entry.banRate !== null && entry.banRate >= 10) {
    reasons.push(`禁用率 ${formatPercent(entry.banRate)}，经常进 Ban 位`);
  }
  if (entry.roleRate !== null && entry.roleRate < 35) {
    reasons.push(`只有 ${formatPercent(entry.roleRate, 0)} 的对局走这个位置，属于摇摆位`);
  }
  return { tone, headline, reasons };
}

export interface PowerCurve {
  label: string;
  note: string;
  peak: ChampionDetailGameLength | null;
}

// 不同对局时长下的胜率：判断英雄是「前期强」还是「后期强」。
export function powerCurve(points: ChampionDetailGameLength[]): PowerCurve {
  if (points.length < 2) return { label: '', note: '', peak: null };
  const sorted = [...points].sort((a, b) => a.minute - b.minute);
  const early = sorted[0].winRate;
  const late = sorted[sorted.length - 1].winRate;
  const peak = sorted.reduce((best, point) => (point.winRate > best.winRate ? point : best), sorted[0]);
  const drift = late - early;
  if (drift >= 2) return { label: '后期发力', note: '对局越久越强，前期稳住就是胜利', peak };
  if (drift <= -2) return { label: '前期强势', note: '优势期在前中期，要主动找机会', peak };
  return { label: '全程平稳', note: '各个时间段的表现都差不多', peak };
}

export function gameLengthLabel(minute: number, index: number): string {
  return index === 0 || minute === 0 ? '<25' : `${minute}+`;
}

export function sortEntries(
  entries: ChampionRankingEntry[],
  key: RankingSortKey,
  mode: ChampionRankingMode,
): ChampionRankingEntry[] {
  const value = (entry: ChampionRankingEntry): number => {
    if (key === 'winRate') return entry.winRate;
    if (key === 'pickRate') return entry.pickRate;
    if (key === 'banRate') return thirdRate(entry, mode) ?? -1;
    if (key === 'trend') return rankChange(entry) ?? -999;
    return -entry.rank;
  };
  return [...entries].sort((a, b) => value(b) - value(a) || a.rank - b.rank);
}

export interface QuadrantDomain {
  minWin: number;
  maxWin: number;
  maxPick: number;
}

export function quadrantDomain(entries: ChampionRankingEntry[], averages: RankingAverages): QuadrantDomain {
  const wins = entries.map((entry) => entry.winRate);
  const spread = Math.max(3, ...wins.map((value) => Math.abs(value - averages.winRate)));
  const pad = Math.min(8, spread) + 0.4;
  return {
    minWin: averages.winRate - pad,
    maxWin: averages.winRate + pad,
    maxPick: Math.max(1, ...entries.map((entry) => entry.pickRate)) * 1.06,
  };
}

// 登场率用平方根刻度：大部分英雄挤在低登场率区间，线性刻度会糊成一团。
export function quadrantPosition(entry: ChampionRankingEntry, domain: QuadrantDomain): { x: number; y: number } {
  const x = Math.sqrt(Math.max(0, entry.pickRate) / domain.maxPick) * 100;
  const y = (1 - (entry.winRate - domain.minWin) / (domain.maxWin - domain.minWin)) * 100;
  return { x: Math.min(98, Math.max(2, x)), y: Math.min(97, Math.max(3, y)) };
}

export function quadrantPickPosition(pickRate: number, domain: QuadrantDomain): number {
  return Math.sqrt(Math.max(0, pickRate) / domain.maxPick) * 100;
}

// 胜率条：以平均值为中线；scale 是榜单里离平均最远的差值，让差距在任何模式下都看得清。
export function winBar(winRate: number, average: number, scale = 4): { side: 'up' | 'down'; width: number } {
  const delta = winRate - average;
  const full = Math.max(1.5, scale);
  return { side: delta >= 0 ? 'up' : 'down', width: Math.min(50, (Math.abs(delta) / full) * 50) };
}

export function winScale(entries: ChampionRankingEntry[], average: number): number {
  const deltas = entries.map((entry) => Math.abs(entry.winRate - average)).sort((a, b) => b - a);
  // 取第 3 大的差值，避免一个极端样本把其他人压扁
  return deltas[Math.min(2, deltas.length - 1)] ?? 4;
}
