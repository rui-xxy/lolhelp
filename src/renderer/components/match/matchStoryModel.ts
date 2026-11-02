import type { MatchParticipantSummary, MatchTimeline, MatchTimelineDamageRecord, MatchTimelineEvent } from '../../../shared/api';
import { isMultiKillEvent, multiKillLabel, prepareEventTimeline } from './matchEventModel';

// 「事件」页的数据模型：把时间线里零散的击杀、野怪、推塔，整理成玩家能读懂的一局故事。
// - 时间上挨得近的事件合成一个「时刻」：团战、交锋、单杀、拿资源、推进；
// - 整局按对线期 / 中期 / 后期分段，每段给出比分；
// - 经济差曲线 + 几条关键事实（一血、最大领先、领先易主、关键团战）；
// - 站在某个玩家的视角：他被谁杀得最多、参加了几场团战。

export type Side = 'blue' | 'red' | 'neutral';
export type StoryKind = 'kill' | 'objective' | 'building';
export type MomentType = 'teamfight' | 'skirmish' | 'pick' | 'objective' | 'push';
export type PhaseKey = 'early' | 'mid' | 'late';

type RawEvent = MatchTimelineEvent & { killerTeamId?: number; name?: string };

export interface StoryEvent {
  key: string;
  event: MatchTimelineEvent;
  kind: StoryKind;
  /** 这件事让哪一方得利：击杀方、拿下野怪的一方、推掉建筑的一方。 */
  side: Side;
  actorId: number;
  victimId: number;
  assistIds: number[];
  involved: number[];
  multi: number;
  /** 同一波里连着拿的几只虚空巢虫合成一条，记个数。 */
  count: number;
}

export interface StoryMoment {
  id: string;
  start: number;
  end: number;
  type: MomentType;
  events: StoryEvent[];
  kills: { blue: number; red: number };
  ace: Side | null;
  winner: Side;
  title: string;
  phase: PhaseKey;
}

export interface StoryPhase {
  key: PhaseKey;
  label: string;
  start: number;
  end: number;
  kills: { blue: number; red: number };
  dragons: { blue: number; red: number };
  towers: { blue: number; red: number };
}

export interface GoldPoint {
  t: number;
  blue: number;
  red: number;
  diff: number;
}

export interface StoryFact {
  key: string;
  label: string;
  /** 主要的那句话：谁拿的、领先多少。 */
  value: string;
  /** 补充：发生在几分几秒。 */
  meta: string;
  side: Side;
  /** 每条事实都能定位到时间轴上的某一刻。 */
  time: number;
  momentId?: string;
}

export interface StoryCast {
  sideOf: (participantId: number) => Side;
  player: (participantId: number) => MatchParticipantSummary | undefined;
}

// ─── 基础 ──────────────────────────────────────────────────────────────

export function storyTime(timestamp: number): string {
  const seconds = Math.floor(Math.max(0, Number.isFinite(timestamp) ? timestamp : 0) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function compactGold(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return `${(abs / 1000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(abs));
}

export function sideName(side: Side): string {
  return side === 'blue' ? '蓝方' : side === 'red' ? '红方' : '中立';
}

const otherSide = (side: Side): Side => side === 'blue' ? 'red' : side === 'red' ? 'blue' : 'neutral';
const teamSide = (teamId?: number): Side => teamId === 100 ? 'blue' : teamId === 200 ? 'red' : 'neutral';

export function buildCast(participants: MatchParticipantSummary[]): StoryCast {
  const byId = new Map<number, MatchParticipantSummary>();
  participants.forEach((player, index) => byId.set(player.participantId || index + 1, player));
  return {
    sideOf: (id) => teamSide(byId.get(id)?.teamId),
    player: (id) => byId.get(id),
  };
}

export function participantIdOf(participants: MatchParticipantSummary[], puuid: string): number {
  const index = participants.findIndex((player) => player.puuid === puuid);
  if (index < 0) return 0;
  return participants[index].participantId || index + 1;
}

const PHASES: Array<{ key: PhaseKey; label: string; from: number; to: number }> = [
  { key: 'early', label: '对线期', from: 0, to: 14 * 60_000 },
  { key: 'mid', label: '中期', from: 14 * 60_000, to: 25 * 60_000 },
  { key: 'late', label: '后期', from: 25 * 60_000, to: Number.POSITIVE_INFINITY },
];

export function phaseOf(timestamp: number): PhaseKey {
  return PHASES.find((phase) => timestamp >= phase.from && timestamp < phase.to)?.key ?? 'late';
}

// ─── 名称 ──────────────────────────────────────────────────────────────

const MONSTER_NAMES: Record<string, string> = {
  BARON_NASHOR: '纳什男爵',
  RIFTHERALD: '峡谷先锋',
  RIFT_HERALD: '峡谷先锋',
  HORDE: '虚空巢虫',
  ATAKHAN: '阿塔坎',
  DRAGON: '元素亚龙',
  AIR_DRAGON: '云端亚龙',
  WATER_DRAGON: '海洋亚龙',
  EARTH_DRAGON: '山脉亚龙',
  FIRE_DRAGON: '炼狱亚龙',
  HEXTECH_DRAGON: '海克斯科技亚龙',
  CHEMTECH_DRAGON: '炼金科技亚龙',
  ELDER_DRAGON: '远古巨龙',
};

export function monsterKey(event: MatchTimelineEvent): string {
  return String(event.monsterSubType || event.monsterType || '').toUpperCase();
}

export function monsterName(event: MatchTimelineEvent): string {
  const key = monsterKey(event);
  return MONSTER_NAMES[key] ?? MONSTER_NAMES[String(event.monsterType || '').toUpperCase()] ?? '史诗野怪';
}

export function isDragon(event: MatchTimelineEvent): boolean {
  return event.type === 'ELITE_MONSTER_KILL' && monsterKey(event).includes('DRAGON');
}

export function laneName(laneType?: string): string {
  const lane = String(laneType || '').toUpperCase();
  if (lane.includes('TOP')) return '上路';
  if (lane.includes('MID')) return '中路';
  if (lane.includes('BOT')) return '下路';
  return '';
}

export function buildingName(event: MatchTimelineEvent): string {
  const type = String(event.buildingType || '').toUpperCase();
  const tower = String((event as RawEvent & { towerType?: string }).towerType || '').toUpperCase();
  if (type.includes('INHIBITOR')) return `${laneName(event.laneType)}召唤水晶`;
  if (tower.includes('NEXUS')) return '基地塔';
  if (tower.includes('OUTER')) return `${laneName(event.laneType)}一塔`;
  if (tower.includes('INNER')) return `${laneName(event.laneType)}二塔`;
  if (tower.includes('BASE')) return `${laneName(event.laneType)}高地塔`;
  return `${laneName(event.laneType)}防御塔`;
}

/** 事件对应的图标（match-ui 里的官方风格图标，-100 蓝 / -200 红）。 */
export function eventArt(event: MatchTimelineEvent, side: Side): string {
  const team = side === 'red' ? 200 : 100;
  if (event.type === 'ELITE_MONSTER_KILL') {
    const key = monsterKey(event);
    if (key.includes('BARON')) return `baron-${team}.png`;
    if (key.includes('HERALD')) return `herald-${team}.png`;
    if (key.includes('ELDER')) return `elder-${team}.png`;
    if (key.includes('AIR')) return `air-${team}.png`;
    if (key.includes('EARTH')) return `earth-${team}.png`;
    if (key.includes('FIRE')) return `fire-${team}.png`;
    if (key.includes('WATER')) return `water-${team}.png`;
    if (key.includes('DRAGON')) return `dragon-${team}.png`;
    return '';
  }
  if (event.type === 'BUILDING_KILL') {
    return String(event.buildingType || '').toUpperCase().includes('INHIBITOR') ? `inhibitor-${team}.png` : `tower-${team}.png`;
  }
  return '';
}

// ─── 事件整理 ──────────────────────────────────────────────────────────

const STORY_TYPES = new Set(['CHAMPION_KILL', 'ELITE_MONSTER_KILL', 'BUILDING_KILL']);

export function timelineSourceEvents(timeline: MatchTimeline | null): MatchTimelineEvent[] {
  return timeline?.frames.flatMap((frame) => frame.events ?? []) ?? [];
}

export function buildStoryEvents(timeline: MatchTimeline | null, cast: StoryCast): StoryEvent[] {
  const prepared = prepareEventTimeline(timelineSourceEvents(timeline));
  return prepared.flatMap((raw, index): StoryEvent[] => {
    const event = raw as RawEvent;
    if (!STORY_TYPES.has(event.type)) return [];
    const actorId = Number(event.killerId || event.participantId || 0);
    const victimId = Number(event.victimId || 0);
    const assistIds = (event.assistingParticipantIds ?? []).filter((id) => id > 0);
    let kind: StoryKind = 'kill';
    let side: Side = 'neutral';
    if (event.type === 'CHAMPION_KILL') {
      side = actorId > 0 ? cast.sideOf(actorId) : otherSide(cast.sideOf(victimId));
    } else if (event.type === 'ELITE_MONSTER_KILL') {
      kind = 'objective';
      side = event.killerTeamId ? teamSide(event.killerTeamId) : actorId > 0 ? cast.sideOf(actorId) : 'neutral';
    } else {
      kind = 'building';
      // BUILDING_KILL 的 teamId 是丢建筑的一方。
      side = event.teamId ? otherSide(teamSide(event.teamId)) : actorId > 0 ? cast.sideOf(actorId) : 'neutral';
    }
    return [{
      key: `${event.timestamp}-${event.type}-${actorId}-${victimId}-${index}`,
      event,
      kind,
      side,
      actorId,
      victimId,
      assistIds,
      involved: [actorId, victimId, ...assistIds].filter((id) => id > 0),
      multi: kind === 'kill' && isMultiKillEvent(event) ? Number(event.multiKillLength) || 2 : 0,
      count: 1,
    }];
  });
}

// 前后两件事相隔不超过 15 秒、整段不超过 75 秒，就算同一个时刻；
// 打完团去拿龙、推塔通常要走一段路，所以资源和建筑放宽到 35 秒。
const MOMENT_GAP = 15_000;
const FOLLOW_UP_GAP = 35_000;
const MOMENT_SPAN = 75_000;

export function buildMoments(events: StoryEvent[], cast: StoryCast): StoryMoment[] {
  const groups: StoryEvent[][] = [];
  events.forEach((item) => {
    const current = groups.at(-1);
    const last = current?.at(-1);
    const gap = item.kind === 'kill' ? MOMENT_GAP : FOLLOW_UP_GAP;
    if (current && last
      && item.event.timestamp - last.event.timestamp <= gap
      && item.event.timestamp - current[0].event.timestamp <= MOMENT_SPAN) {
      current.push(item);
    } else {
      groups.push([item]);
    }
  });
  return groups.map((group, index) => describeMoment(mergeRepeats(group), index, cast));
}

function mergeRepeats(events: StoryEvent[]): StoryEvent[] {
  const merged: StoryEvent[] = [];
  events.forEach((item) => {
    const previous = merged.at(-1);
    if (previous && item.kind === 'objective' && previous.kind === 'objective'
      && previous.side === item.side && monsterKey(previous.event) === monsterKey(item.event) && monsterKey(item.event).includes('HORDE')) {
      merged[merged.length - 1] = {
        ...previous,
        count: previous.count + item.count,
        assistIds: [...new Set([...previous.assistIds, ...item.assistIds])],
        involved: [...new Set([...previous.involved, ...item.involved])],
      };
      return;
    }
    merged.push(item);
  });
  return merged;
}

/** 「拿下炼狱亚龙」「拿下 3 只虚空巢虫」 */
export function objectiveLabel(item: StoryEvent): string {
  return item.count > 1 ? ` ${item.count} 只${monsterName(item.event)}` : monsterName(item.event);
}

function describeMoment(events: StoryEvent[], index: number, cast: StoryCast): StoryMoment {
  const killEvents = events.filter((item) => item.kind === 'kill');
  const objectives = events.filter((item) => item.kind === 'objective');
  const buildings = events.filter((item) => item.kind === 'building');
  const kills = {
    blue: killEvents.filter((item) => item.side === 'blue').length,
    red: killEvents.filter((item) => item.side === 'red').length,
  };
  const type: MomentType = killEvents.length >= 3 ? 'teamfight'
    : killEvents.length === 2 ? 'skirmish'
      : killEvents.length === 1 ? 'pick'
        : objectives.length > 0 ? 'objective' : 'push';

  // 一方在这个时刻里把对面五个人都杀了一遍：团灭。
  let ace: Side | null = null;
  (['blue', 'red'] as const).forEach((side) => {
    const victims = new Set(killEvents.filter((item) => item.side === side).map((item) => item.victimId));
    if (victims.size >= 5) ace = side;
  });

  const gained = (side: Side) => kills[side as 'blue' | 'red'] * 3
    + objectives.filter((item) => item.side === side).length * 2
    + buildings.filter((item) => item.side === side).length;
  const blueScore = gained('blue');
  const redScore = gained('red');
  const winner: Side = blueScore > redScore ? 'blue' : redScore > blueScore ? 'red' : 'neutral';

  const start = events[0].event.timestamp;
  const end = events.at(-1)?.event.timestamp ?? start;
  return {
    id: `m${index}-${start}`,
    start,
    end,
    type,
    events,
    kills,
    ace,
    winner,
    title: momentTitle(type, events, kills, ace, cast),
    phase: phaseOf(start),
  };
}

function shortName(player?: MatchParticipantSummary): string {
  if (!player) return '';
  return player.gameName || (player.riotId || player.summonerName || '').split('#')[0] || player.championName;
}

function momentTitle(type: MomentType, events: StoryEvent[], kills: { blue: number; red: number }, ace: Side | null, cast: StoryCast): string {
  const objectives = events.filter((item) => item.kind === 'objective');
  const buildings = events.filter((item) => item.kind === 'building');
  const tail: string[] = [];
  if (objectives.length) {
    const bySide = (['blue', 'red'] as const).map((side) => {
      const names = [...new Set(objectives.filter((item) => item.side === side).map(objectiveLabel))];
      return names.length ? `${sideName(side)}拿下${names.join('、')}` : '';
    }).filter(Boolean);
    tail.push(...bySide);
  }
  if (buildings.length) {
    (['blue', 'red'] as const).forEach((side) => {
      const own = buildings.filter((item) => item.side === side);
      if (!own.length) return;
      tail.push(own.length === 1 ? `${sideName(side)}推掉${buildingName(own[0].event)}` : `${sideName(side)}推掉 ${own.length} 座建筑`);
    });
  }

  if (type === 'pick') {
    const kill = events.find((item) => item.kind === 'kill');
    if (!kill) return tail.join('，');
    const killer = cast.player(kill.actorId);
    const victim = cast.player(kill.victimId);
    const head = kill.multi >= 2 ? `${shortName(killer)} ${multiKillLabel(kill.event)}` : `${killer ? shortName(killer) : '防御塔 / 小兵'} 击杀 ${shortName(victim) || '对手'}`;
    return [head, ...tail].join('，');
  }
  if (type === 'teamfight' || type === 'skirmish') {
    const label = type === 'teamfight' ? '团战' : '交锋';
    let head: string;
    if (ace) head = `${sideName(ace)}团灭对手`;
    else if (kills.blue === kills.red) head = `${label}打成 ${kills.blue} 换 ${kills.red}`;
    else {
      const leader: Side = kills.blue > kills.red ? 'blue' : 'red';
      const more = Math.max(kills.blue, kills.red);
      const less = Math.min(kills.blue, kills.red);
      head = `${sideName(leader)}${label} ${more} 换 ${less}`;
    }
    return tail.length ? `${head}，随后${tail.join('，')}` : head;
  }
  return tail.join('，') || '地图事件';
}

export function buildPhases(moments: StoryMoment[], events: StoryEvent[], endTime: number): StoryPhase[] {
  return PHASES.flatMap((phase) => {
    if (phase.from >= endTime && phase.key !== 'early') return [];
    const scoped = events.filter((item) => phaseOf(item.event.timestamp) === phase.key);
    const count = (filter: (item: StoryEvent) => boolean, side: 'blue' | 'red') => scoped.filter((item) => item.side === side && filter(item)).length;
    const isKill = (item: StoryEvent) => item.kind === 'kill';
    const isDragonKill = (item: StoryEvent) => isDragon(item.event);
    const isTower = (item: StoryEvent) => item.kind === 'building' && !String(item.event.buildingType || '').toUpperCase().includes('INHIBITOR');
    if (!moments.some((moment) => moment.phase === phase.key) && phase.key !== 'early') return [];
    return [{
      key: phase.key,
      label: phase.label,
      start: phase.from,
      end: Math.min(phase.to, endTime),
      kills: { blue: count(isKill, 'blue'), red: count(isKill, 'red') },
      dragons: { blue: count(isDragonKill, 'blue'), red: count(isDragonKill, 'red') },
      towers: { blue: count(isTower, 'blue'), red: count(isTower, 'red') },
    }];
  });
}

// ─── 经济差 ────────────────────────────────────────────────────────────

export function buildGoldSeries(timeline: MatchTimeline | null, cast: StoryCast): GoldPoint[] {
  if (!timeline) return [];
  const points = timeline.frames.map((frame) => {
    let blue = 0;
    let red = 0;
    Object.values(frame.participantFrames ?? {}).forEach((participant) => {
      const side = cast.sideOf(Number(participant.participantId));
      const gold = Number(participant.totalGold) || 0;
      if (side === 'blue') blue += gold;
      else if (side === 'red') red += gold;
    });
    return { t: frame.timestamp, blue, red, diff: blue - red };
  }).filter((point) => point.blue > 0 || point.red > 0);
  return points.length >= 2 ? points : [];
}

export function goldAt(series: GoldPoint[], timestamp: number): number | null {
  if (!series.length) return null;
  if (timestamp <= series[0].t) return series[0].diff;
  for (let index = 1; index < series.length; index += 1) {
    const right = series[index];
    if (timestamp <= right.t) {
      const left = series[index - 1];
      const ratio = (timestamp - left.t) / Math.max(1, right.t - left.t);
      return left.diff + (right.diff - left.diff) * ratio;
    }
  }
  return series.at(-1)?.diff ?? null;
}

// ─── 关键事实 ──────────────────────────────────────────────────────────

export function buildFacts(events: StoryEvent[], moments: StoryMoment[], series: GoldPoint[], cast: StoryCast): StoryFact[] {
  const facts: StoryFact[] = [];
  const momentOf = (item: StoryEvent) => moments.find((moment) => moment.events.includes(item))?.id;
  // 经济差这类按时间算的事实，找一分钟以内最近的那个时刻，点了也能跳过去。
  const momentNear = (time: number) => {
    let best: StoryMoment | undefined;
    let bestDistance = 60_000;
    moments.forEach((moment) => {
      const distance = time < moment.start ? moment.start - time : time > moment.end ? time - moment.end : 0;
      if (distance <= bestDistance) {
        best = moment;
        bestDistance = distance;
      }
    });
    return best?.id;
  };
  const fromEvent = (key: string, label: string, item: StoryEvent | undefined, value: (item: StoryEvent) => string) => {
    if (!item) return;
    facts.push({ key, label, value: value(item), meta: storyTime(item.event.timestamp), side: item.side, time: item.event.timestamp, momentId: momentOf(item) });
  };

  fromEvent('first-blood', '一血', events.find((item) => item.kind === 'kill'), (item) => {
    const killer = cast.player(item.actorId);
    return killer ? shortName(killer) : sideName(item.side);
  });
  fromEvent('first-dragon', '首条小龙', events.find((item) => isDragon(item.event)), (item) => sideName(item.side));
  fromEvent('first-tower', '一塔', events.find((item) => item.kind === 'building'), (item) => sideName(item.side));
  fromEvent('first-baron', '首条大龙', events.find((item) => item.kind === 'objective' && monsterKey(item.event).includes('BARON')), (item) => sideName(item.side));

  if (series.length) {
    const top = series.reduce((best, point) => (point.diff > best.diff ? point : best), series[0]);
    const bottom = series.reduce((best, point) => (point.diff < best.diff ? point : best), series[0]);
    if (top.diff >= 500) facts.push({ key: 'blue-lead', label: '蓝方最多领先', value: `+${compactGold(top.diff)}`, meta: storyTime(top.t), side: 'blue', time: top.t, momentId: momentNear(top.t) });
    if (bottom.diff <= -500) facts.push({ key: 'red-lead', label: '红方最多领先', value: `+${compactGold(bottom.diff)}`, meta: storyTime(bottom.t), side: 'red', time: bottom.t, momentId: momentNear(bottom.t) });
    const swings = leadSwings(series);
    const last = swings.at(-1);
    if (last) {
      facts.push({
        key: 'swings',
        label: '领先易主',
        value: `${swings.length} 次`,
        meta: storyTime(last.t),
        side: last.side,
        time: last.t,
        momentId: momentNear(last.t),
      });
    }
  }

  const fights = moments.filter((moment) => moment.type === 'teamfight');
  if (fights.length) {
    // 最大的那场团战（人头最多，一样多取更晚的）往往就是决定比赛的那一波。
    const decisive = fights.reduce((best, moment) => {
      const size = moment.kills.blue + moment.kills.red;
      const bestSize = best.kills.blue + best.kills.red;
      return size > bestSize || (size === bestSize && moment.start > best.start) ? moment : best;
    }, fights[0]);
    facts.push({
      key: 'decisive',
      label: '关键团战',
      value: `${decisive.kills.blue} : ${decisive.kills.red}`,
      meta: storyTime(decisive.start),
      side: decisive.winner,
      time: decisive.start,
      momentId: decisive.id,
    });
  }
  return facts;
}

/** 领先方换手的时刻（差距超过 1000 才算真的领先，避免在 0 附近来回抖）。 */
export function leadSwings(series: GoldPoint[], threshold = 1000): Array<{ t: number; side: Side }> {
  let leader: Side = 'neutral';
  const swings: Array<{ t: number; side: Side }> = [];
  series.forEach((point) => {
    const now: Side = point.diff >= threshold ? 'blue' : point.diff <= -threshold ? 'red' : 'neutral';
    if (now === 'neutral') return;
    if (leader !== 'neutral' && now !== leader) swings.push({ t: point.t, side: now });
    leader = now;
  });
  return swings;
}

export function leadChanges(series: GoldPoint[], threshold = 1000): number {
  return leadSwings(series, threshold).length;
}

// ─── 玩家视角 ──────────────────────────────────────────────────────────

export interface FocusSummary {
  kills: number;
  deaths: number;
  assists: number;
  firstDeath: number | null;
  killedBy: Array<{ id: number; count: number }>;
  killed: Array<{ id: number; count: number }>;
  fights: { joined: number; total: number };
  objectives: number;
  soloKills: number;
}

export function buildFocusSummary(focusId: number, events: StoryEvent[], moments: StoryMoment[]): FocusSummary {
  const kills = events.filter((item) => item.kind === 'kill');
  const own = kills.filter((item) => item.actorId === focusId);
  const deaths = kills.filter((item) => item.victimId === focusId);
  const tally = (ids: number[]) => {
    const map = new Map<number, number>();
    ids.forEach((id) => map.set(id, (map.get(id) ?? 0) + 1));
    return [...map.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count || a.id - b.id);
  };
  const fights = moments.filter((moment) => moment.type === 'teamfight');
  return {
    kills: own.length,
    deaths: deaths.length,
    assists: kills.filter((item) => item.assistIds.includes(focusId)).length,
    firstDeath: deaths[0]?.event.timestamp ?? null,
    killedBy: tally(deaths.map((item) => item.actorId)),
    killed: tally(own.map((item) => item.victimId)),
    fights: { joined: fights.filter((moment) => moment.events.some((item) => item.involved.includes(focusId))).length, total: fights.length },
    objectives: events.filter((item) => item.kind === 'objective' && item.involved.includes(focusId)).length,
    soloKills: own.filter((item) => item.assistIds.length === 0).length,
  };
}

// ─── 伤害明细（击杀详情里「伤害来源」用） ──────────────────────────────

export function damageValue(row: MatchTimelineDamageRecord): number {
  if (Number.isFinite(row.damage) && (row.damage ?? 0) > 0) return row.damage ?? 0;
  return Math.max(0, (row.physicalDamage ?? 0) + (row.magicDamage ?? 0) + (row.trueDamage ?? 0));
}

export function damageSourceKey(row: MatchTimelineDamageRecord): string {
  if (row.basic) return 'AA';
  const raw = String(row.spellName || '').trim().toLowerCase();
  if (raw.includes('passive')) return 'P';
  const slot = row.spellSlot;
  if (slot === 0) return 'Q';
  if (slot === 1) return 'W';
  if (slot === 2) return 'E';
  if (slot === 3) return 'R';
  if (raw.includes('summonerdot') || raw.includes('ignite')) return 'OTHER:IGNITE';
  if (raw.includes('smite')) return 'OTHER:SMITE';
  if (/^\d+(active|passive)/.test(raw)) return `OTHER:ITEM:${raw}`;
  const type = String(row.type || '').toUpperCase();
  if (type === 'MONSTER') return 'OTHER:MONSTER';
  if (type === 'MINION') return 'OTHER:MINION';
  if (type === 'TOWER' || type === 'TURRET') return 'OTHER:TOWER';
  return `OTHER:${raw || type || 'unknown'}`;
}

export function damageSourceLabel(key: string): string {
  if (key === 'AA') return '普通攻击';
  if (key === 'P') return '被动';
  if (['Q', 'W', 'E', 'R'].includes(key)) return `${key} 技能`;
  if (key === 'OTHER:IGNITE') return '点燃';
  if (key === 'OTHER:SMITE') return '惩戒';
  if (key.startsWith('OTHER:ITEM:')) return '装备效果';
  if (key === 'OTHER:MONSTER') return '野怪';
  if (key === 'OTHER:MINION') return '小兵';
  if (key === 'OTHER:TOWER') return '防御塔';
  return '其他';
}

export function damageSourceBadge(key: string): string {
  if (['AA', 'P', 'Q', 'W', 'E', 'R'].includes(key)) return key;
  if (key === 'OTHER:IGNITE') return '燃';
  if (key === 'OTHER:SMITE') return '惩';
  if (key.startsWith('OTHER:ITEM:')) return '装';
  if (key === 'OTHER:MONSTER') return '野';
  if (key === 'OTHER:MINION') return '兵';
  if (key === 'OTHER:TOWER') return '塔';
  return '·';
}

export interface DamageSource {
  key: string;
  damage: number;
  physical: number;
  magic: number;
  true: number;
  sample: MatchTimelineDamageRecord;
}

export interface DamageDealer {
  participantId: number;
  name: string;
  total: number;
  sources: DamageSource[];
}

/** 一次阵亡受到的伤害，按造成伤害的人（或防御塔、小兵）分组，再按技能拆开。 */
export function groupDamage(rows: MatchTimelineDamageRecord[] | undefined): DamageDealer[] {
  const dealers = new Map<string, DamageDealer>();
  (rows ?? []).forEach((row) => {
    const damage = damageValue(row);
    if (damage <= 0) return;
    const participantId = Number(row.participantId) || 0;
    const dealerKey = participantId > 0 ? `p${participantId}` : `n${String(row.type || row.name || 'other')}`;
    const dealer = dealers.get(dealerKey) ?? { participantId, name: participantId > 0 ? '' : damageSourceLabel(damageSourceKey(row)), total: 0, sources: [] };
    dealer.total += damage;
    const key = damageSourceKey(row);
    const source = dealer.sources.find((item) => item.key === key);
    if (source) {
      source.damage += damage;
      source.physical += row.physicalDamage ?? 0;
      source.magic += row.magicDamage ?? 0;
      source.true += row.trueDamage ?? 0;
    } else {
      dealer.sources.push({ key, damage, physical: row.physicalDamage ?? 0, magic: row.magicDamage ?? 0, true: row.trueDamage ?? 0, sample: row });
    }
    dealers.set(dealerKey, dealer);
  });
  return [...dealers.values()]
    .map((dealer) => ({ ...dealer, sources: [...dealer.sources].sort((a, b) => b.damage - a.damage) }))
    .sort((a, b) => b.total - a.total);
}
