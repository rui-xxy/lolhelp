import type { ChampionSummary, ChatMessage, SavedMatchPreview } from '../../../shared/api';
import { LOL_REGIONS } from '../../../shared/constants';

// 「我的玩家」和「消息」两个窗口共用的纯函数：时间、名字、战绩汇总、聊天分段。
// 不碰 DOM，方便单测。

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function splitRiotId(riotId: string | undefined): { name: string; tag: string } {
  const normalized = (riotId ?? '').trim();
  const hashIndex = normalized.lastIndexOf('#');
  if (hashIndex <= 0) return { name: normalized || '未知玩家', tag: '' };
  return { name: normalized.slice(0, hashIndex), tag: normalized.slice(hashIndex + 1) };
}

function usefulRegionName(name: string | undefined): string {
  const trimmed = name?.trim() ?? '';
  if (!trimmed || trimmed.includes('读取') || trimmed.includes('无法')) return '';
  return trimmed;
}

/** 大区显示名：优先用保存时记下的名字，其次查表，最后给兜底文案。 */
export function regionLabel(regionKey: string | undefined, regionName?: string, fallback = '当前大区'): string {
  const saved = usefulRegionName(regionName);
  if (saved) return saved;
  if (!regionKey) return fallback;
  return LOL_REGIONS.find((region) => region.key === regionKey)?.name ?? regionKey;
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** 相对时间：刚刚 / 12 分钟前 / 3 小时前 / 昨天 / 10月30日。 */
export function formatAgo(timestamp: number | undefined, now = Date.now()): string {
  if (!timestamp || !Number.isFinite(timestamp)) return '';
  const diff = Math.max(0, now - timestamp);
  if (diff < MINUTE) return '刚刚';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;
  if (diff < 12 * HOUR || startOfDay(timestamp) === startOfDay(now)) return `${Math.floor(diff / HOUR)} 小时前`;
  return dayLabel(timestamp, now);
}

export function formatClock(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 日期标题：今天 / 昨天 / 10月30日（跨年带年份）。 */
export function dayLabel(timestamp: number, now = Date.now()): string {
  const day = startOfDay(timestamp);
  const today = startOfDay(now);
  if (day === today) return '今天';
  if (day === today - DAY) return '昨天';
  const date = new Date(timestamp);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return sameYear
    ? `${date.getMonth() + 1}月${date.getDate()}日`
    : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 会话列表右上角的时间：今天显示时刻，其余显示日期。 */
export function formatListTime(timestamp: number, now = Date.now()): string {
  if (!timestamp) return '';
  if (startOfDay(timestamp) === startOfDay(now)) return formatClock(timestamp);
  const label = dayLabel(timestamp, now);
  return label.replace(/^\d+年/, '');
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  return Math.round(value).toLocaleString('zh-CN');
}

export function championName(match: SavedMatchPreview, championMap: Map<number, ChampionSummary>): string {
  const champion = championMap.get(match.championId);
  return champion?.title || champion?.name || match.championName || '未知英雄';
}

/** 汇总只需要这几个字段：保存的对局、战绩简报、完整战绩都满足。 */
export type MatchLike = Pick<SavedMatchPreview, 'win' | 'kills' | 'deaths' | 'assists' | 'championId' | 'championAvatar'>;

export interface ChampionUsage<T extends MatchLike = SavedMatchPreview> {
  championId: number;
  avatar: string;
  games: number;
  wins: number;
  sample: T;
}

export interface MatchSummary<T extends MatchLike = SavedMatchPreview> {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  topChampions: Array<ChampionUsage<T>>;
}

/** 一组对局的汇总：胜率、场均 K/D/A、按场次排序的常用英雄。 */
export function summarizeMatches<T extends MatchLike>(matches: T[]): MatchSummary<T> {
  const games = matches.length;
  const wins = matches.filter((match) => match.win).length;
  const total = matches.reduce(
    (sum, match) => ({
      kills: sum.kills + match.kills,
      deaths: sum.deaths + match.deaths,
      assists: sum.assists + match.assists,
    }),
    { kills: 0, deaths: 0, assists: 0 },
  );
  const usage = new Map<number, ChampionUsage<T>>();
  for (const match of matches) {
    const current = usage.get(match.championId);
    if (current) {
      current.games += 1;
      if (match.win) current.wins += 1;
    } else {
      usage.set(match.championId, {
        championId: match.championId,
        avatar: match.championAvatar,
        games: 1,
        wins: match.win ? 1 : 0,
        sample: match,
      });
    }
  }
  const per = (value: number) => (games > 0 ? value / games : 0);
  return {
    games,
    wins,
    losses: games - wins,
    winRate: games > 0 ? Math.round((wins / games) * 100) : 0,
    kills: per(total.kills),
    deaths: per(total.deaths),
    assists: per(total.assists),
    kda: (total.kills + total.assists) / Math.max(1, total.deaths),
    topChampions: Array.from(usage.values()).sort(
      (left, right) => right.games - left.games || right.wins - left.wins,
    ),
  };
}

export interface DayGroup<T> {
  key: string;
  label: string;
  items: T[];
}

/** 按自然日分组，保持输入顺序（调用方先排好序）。 */
export function groupByDay<T>(items: T[], getTime: (item: T) => number, now = Date.now()): Array<DayGroup<T>> {
  const groups: Array<DayGroup<T>> = [];
  for (const item of items) {
    const time = getTime(item);
    const key = String(startOfDay(time));
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: dayLabel(time, now), items: [item] });
  }
  return groups;
}

/** LCU 的聊天时间可能是秒、毫秒或 ISO 字符串。 */
export function chatTimestamp(value: string): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type ChatBlock =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'system'; key: string; message: ChatMessage }
  | { kind: 'run'; key: string; fromSelf: boolean; sender: string; time: number; messages: ChatMessage[] };

const RUN_GAP_MS = 5 * MINUTE;

/**
 * 把消息切成「日期分隔 / 系统提示 / 连续发言」三种块：
 * 同一个人 5 分钟内连续发的消息合成一段，只显示一次头像和时间。
 */
export function buildChatBlocks(messages: ChatMessage[], now = Date.now()): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  let lastDay = '';
  let run: Extract<ChatBlock, { kind: 'run' }> | null = null;
  let lastTime = 0;

  for (const message of messages) {
    const time = chatTimestamp(message.timestamp);
    if (time > 0) {
      const day = String(startOfDay(time));
      if (day !== lastDay) {
        blocks.push({ kind: 'day', key: `day-${day}`, label: dayLabel(time, now) });
        lastDay = day;
        run = null;
      }
    }

    const isSystem = message.type !== 'chat' && message.type !== '';
    if (isSystem) {
      blocks.push({ kind: 'system', key: `sys-${message.id}`, message });
      run = null;
      continue;
    }

    const sender = message.fromSelf ? '' : message.senderRiotId;
    const continues = run
      && run.fromSelf === message.fromSelf
      && run.sender === sender
      && (time === 0 || lastTime === 0 || time - lastTime <= RUN_GAP_MS);
    if (run && continues) {
      run.messages.push(message);
    } else {
      run = { kind: 'run', key: `run-${message.id}`, fromSelf: message.fromSelf, sender, time, messages: [message] };
      blocks.push(run);
    }
    if (time > 0) lastTime = time;
  }
  return blocks;
}

type TimedResult = { gameCreation: number; gameDuration: number; win: boolean };

export interface MatchSession<T extends TimedResult> {
  key: string;
  /** 这一段第一局开始的时间。 */
  start: number;
  /** 这一段最后一局结束的时间。 */
  end: number;
  /** 新的在前。 */
  matches: T[];
  wins: number;
  losses: number;
}

/**
 * 把对局切成「一段一段连着打的」：前后两局间隔不超过 gapMs 就算同一段。
 * 输入顺序无所谓，输出新的在前。
 */
export function groupSessions<T extends TimedResult>(matches: T[], gapMs = 90 * MINUTE): Array<MatchSession<T>> {
  const sorted = [...matches].sort((left, right) => right.gameCreation - left.gameCreation);
  const sessions: Array<MatchSession<T>> = [];
  for (const match of sorted) {
    const end = match.gameCreation + Math.max(0, match.gameDuration) * 1000;
    const current = sessions[sessions.length - 1];
    if (current && current.start - end <= gapMs) {
      current.matches.push(match);
      current.start = match.gameCreation;
    } else {
      sessions.push({ key: `s-${match.gameCreation}`, start: match.gameCreation, end, matches: [match], wins: 0, losses: 0 });
    }
  }
  for (const session of sessions) {
    session.wins = session.matches.filter((match) => match.win).length;
    session.losses = session.matches.length - session.wins;
  }
  return sessions;
}

/** 当前连胜 / 连败（按时间新的在前）。 */
export function currentStreak(matches: Array<Pick<TimedResult, 'gameCreation' | 'win'>>): { win: boolean; count: number } | null {
  const sorted = [...matches].sort((left, right) => right.gameCreation - left.gameCreation);
  if (sorted.length === 0) return null;
  const win = sorted[0].win;
  let count = 0;
  for (const match of sorted) {
    if (match.win !== win) break;
    count += 1;
  }
  return { win, count };
}
