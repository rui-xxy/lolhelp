import type { MatchParticipantSummary, MatchTimeline, MatchTimelineEvent, MatchTimelineFrame, MatchTimelineParticipantFrame } from '../../../shared/api';

export type TimelineMetric = 'gold' | 'cs' | 'xp' | 'damageDealt' | 'damageTaken';
export type TimelineValue = number | null;
export const TIMELINE_METRICS: Array<{ key: TimelineMetric; label: string; detail: string }> = [
  { key: 'gold', label: '金币', detail: '累计获得金币' },
  { key: 'cs', label: '补刀', detail: '小兵与野怪补刀合计' },
  { key: 'xp', label: '经验', detail: '累计获得经验' },
  { key: 'damageDealt', label: '英雄伤害', detail: '累计对英雄造成的伤害，不含对小兵与野怪的伤害' },
  { key: 'damageTaken', label: '承受伤害', detail: '累计承受的全部伤害' },
];
export interface TimelinePlayer { id: number; player: MatchParticipantSummary; name: string; tone: string }
export interface TimelineSeries { id: string; name: string; playerIds: number[]; avatar?: string; tone: string; team: boolean }
export interface EventGroup { timestamp: number; events: MatchTimelineEvent[]; key: string }
export interface LeadMoment { index: number; value: number; kind: 'a' | 'b' | 'switch' }
const finite = (value: unknown): TimelineValue => typeof value === 'number' && Number.isFinite(value) ? value : null;
export const timelineNumber = finite;
export function timelineName(player: MatchParticipantSummary): string {
  return player.riotId || [player.gameName, player.tagLine].filter(Boolean).join('#') || player.summonerName || player.championName;
}
export function timelinePlayers(participants: MatchParticipantSummary[]): TimelinePlayer[] {
  return participants.map((player, index) => ({ id: player.participantId || index + 1, player, name: timelineName(player), tone: `var(--tl-player-${index % 10})` }));
}
export function orderedFrames(timeline: MatchTimeline | null): MatchTimelineFrame[] {
  // Keep the last snapshot at a duplicate timestamp; never interpolate missing data.
  const frames = new Map<number, MatchTimelineFrame>();
  for (const frame of timeline?.frames ?? []) if (Number.isFinite(frame.timestamp) && frame.timestamp >= 0) frames.set(frame.timestamp, frame);
  return [...frames.values()].sort((a, b) => a.timestamp - b.timestamp);
}
export function metricValue(frame: MatchTimelineParticipantFrame | undefined, metric: TimelineMetric): TimelineValue {
  if (!frame) return null;
  if (metric === 'gold') return finite(frame.totalGold);
  if (metric === 'xp') return finite(frame.xp);
  if (metric === 'cs') {
    const lane = finite(frame.minionsKilled), jungle = finite(frame.jungleMinionsKilled);
    return lane === null || jungle === null ? null : lane + jungle;
  }
  return finite(frame.damageStats?.[metric === 'damageDealt' ? 'totalDamageDoneToChampions' : 'totalDamageTaken']);
}
export function seriesValue(frame: MatchTimelineFrame | undefined, series: TimelineSeries, metric: TimelineMetric): TimelineValue {
  if (!frame || !series.playerIds.length) return null;
  const values = series.playerIds.map(id => metricValue(frame.participantFrames?.[String(id)], metric));
  // An incomplete team snapshot is unavailable, not an artificially low team average.
  return values.some(value => value === null) ? null : (values as number[]).reduce((sum, value) => sum + value, 0) / values.length;
}
export function buildTimelineSeries(players: TimelinePlayer[], scope: 'teams' | 'players', selected: number[]): TimelineSeries[] {
  if (scope === 'teams') return [...new Set(players.map(entry => entry.player.teamId))].map((teamId, index) => ({
    id: `team-${teamId}`, name: teamId === 100 ? '蓝方平均' : teamId === 200 ? '红方平均' : `队伍 ${teamId} 平均`,
    playerIds: players.filter(entry => entry.player.teamId === teamId).map(entry => entry.id),
    tone: teamId === 100 ? 'var(--color-app-team-mine)' : teamId === 200 ? 'var(--color-app-team-enemy)' : `var(--tl-player-${index % 10})`, team: true,
  }));
  return selected.flatMap(id => {
    const entry = players.find(player => player.id === id);
    return entry ? [{ id: `player-${id}`, name: entry.name, playerIds: [id], avatar: entry.player.championAvatar, tone: entry.tone, team: false }] : [];
  });
}
export function nearestFrame(frames: MatchTimelineFrame[], timestamp: number): number {
  if (!frames.length) return -1;
  let left = 0, right = frames.length - 1;
  while (left < right) { const middle = Math.floor((left + right) / 2); if (frames[middle].timestamp < timestamp) left = middle + 1; else right = middle; }
  return left > 0 && timestamp - frames[left - 1].timestamp <= frames[left].timestamp - timestamp ? left - 1 : left;
}
export function timelineFraction(timestamp: number, first: number, last: number): number {
  return last <= first ? 0.5 : Math.max(0, Math.min(1, (timestamp - first) / (last - first)));
}
export function subtractValues(a: TimelineValue, b: TimelineValue): TimelineValue { return a === null || b === null ? null : a - b; }
export function numberLabel(value: TimelineValue, signed = false): string {
  if (value === null) return '—';
  const rounded = Math.round(value);
  return `${signed && rounded > 0 ? '+' : ''}${rounded.toLocaleString('zh-CN')}`;
}
export function timeLabel(timestamp: number): string {
  const seconds = Math.max(0, Math.floor(timestamp / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
export function axisDomain(values: TimelineValue[], difference: boolean): { min: number; max: number; ticks: number[] } {
  const maxAbs = Math.max(1, ...values.map(value => Math.abs(value ?? 0)));
  const rawStep = maxAbs / (difference ? 2 : 4);
  const power = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = ([1, 1.5, 2, 2.5, 3, 4, 5, 8, 10].find(multiplier => multiplier * power >= rawStep) ?? 10) * power;
  const intervals = Math.max(1, Math.ceil(maxAbs / step));
  const max = step * intervals, min = difference ? -max : 0;
  const tickCount = difference ? intervals * 2 + 1 : intervals + 1;
  return { min, max, ticks: Array.from({ length: tickCount }, (_, i) => max - i * step) };
}
export function linePath(frames: MatchTimelineFrame[], values: TimelineValue[], domain: { min: number; max: number }, width = 1000, height = 256): string {
  let drawing = false;
  return frames.map((frame, index) => {
    const value = values[index];
    if (value === null || value === undefined) { drawing = false; return ''; }
    const x = timelineFraction(frame.timestamp, frames[0].timestamp, frames.at(-1)?.timestamp ?? 0) * width;
    const y = height - (value - domain.min) / (domain.max - domain.min) * height;
    const part = `${drawing ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`; drawing = true; return part;
  }).join(' ');
}
export function areaPath(frames: MatchTimelineFrame[], values: TimelineValue[], domain: { min: number; max: number }): string {
  const parts: string[] = [];
  let run: number[] = [];
  const x = (i: number) => timelineFraction(frames[i].timestamp, frames[0].timestamp, frames.at(-1)?.timestamp ?? 0) * 1000;
  const zero = 256 - (0 - domain.min) / (domain.max - domain.min) * 256;
  const flush = () => {
    if (run.length) parts.push(`M${x(run[0])},${zero} ${run.map(i => `L${x(i)},${256 - ((values[i] as number) - domain.min) / (domain.max - domain.min) * 256}`).join(' ')} L${x(run[run.length - 1])},${zero}Z`);
    run = [];
  };
  values.forEach((value, index) => { if (value === null) flush(); else run.push(index); }); flush();
  return parts.join(' ');
}
export function leadMoments(values: TimelineValue[]): LeadMoment[] {
  const moments: LeadMoment[] = [];
  let a = -1, b = -1, lastSign = 0, change = -1;
  values.forEach((value, index) => {
    if (value === null) { lastSign = 0; return; }
    if (value > 0 && (a < 0 || value > (values[a] as number))) a = index;
    if (value < 0 && (b < 0 || value < (values[b] as number))) b = index;
    const sign = Math.sign(value);
    if (sign && lastSign && sign !== lastSign) change = index;
    if (sign) lastSign = sign;
  });
  if (a >= 0) moments.push({ kind: 'a', index: a, value: values[a] as number });
  if (b >= 0) moments.push({ kind: 'b', index: b, value: -(values[b] as number) });
  if (change >= 0) moments.push({ kind: 'switch', index: change, value: values[change] as number });
  return moments;
}
export function keyEvents(timeline: MatchTimeline | null): MatchTimelineEvent[] {
  return (timeline?.frames.flatMap(frame => frame.events ?? []) ?? []).filter(event => Number.isFinite(event.timestamp) && ['CHAMPION_KILL', 'ELITE_MONSTER_KILL', 'BUILDING_KILL'].includes(event.type)).sort((a, b) => a.timestamp - b.timestamp);
}
export function groupTimelineEvents(events: MatchTimelineEvent[], first: number, last: number, bins: number): EventGroup[] {
  const groups = new Map<number, MatchTimelineEvent[]>();
  events.filter(event => event.timestamp >= first && event.timestamp <= last).forEach(event => {
    const bucket = Math.min(bins - 1, Math.floor(timelineFraction(event.timestamp, first, last) * bins));
    groups.set(bucket, [...(groups.get(bucket) ?? []), event]);
  });
  return [...groups].map(([bucket, entries]) => ({ key: `event-${bucket}`, timestamp: entries[0].timestamp, events: entries }));
}
export function eventPresentation(event: MatchTimelineEvent, players: TimelinePlayer[]): { art: string; label: string; actor?: TimelinePlayer; victim?: TimelinePlayer } {
  const actor = players.find(player => player.id === event.killerId), victim = players.find(player => player.id === event.victimId);
  const team = actor?.player.teamId === 200 ? 200 : 100;
  if (event.type === 'CHAMPION_KILL') return { art: 'kills.png', label: `${actor?.name || '未知来源'} 击杀 ${victim?.name || '未知玩家'}`, actor, victim };
  if (event.type === 'BUILDING_KILL') {
    const lane = ({ TOP_LANE: '上路', MID_LANE: '中路', BOT_LANE: '下路' } as Record<string, string>)[event.laneType ?? ''] || '';
    const inhibitor = event.buildingType === 'INHIBITOR_BUILDING';
    return { art: `${inhibitor ? 'inhibitor' : 'tower'}-${team}.png`, label: `${actor?.name || '队伍'} 摧毁${lane}${inhibitor ? '水晶' : '防御塔'}`, actor };
  }
  const monster = event.monsterType ?? '';
  const elder = event.monsterSubType === 'ELDER_DRAGON';
  const name = elder ? '远古巨龙' : ({ BARON_NASHOR: '纳什男爵', RIFTHERALD: '峡谷先锋', HORDE: '虚空巢虫', DRAGON: '巨龙' } as Record<string, string>)[monster] || '野区目标';
  const art = monster === 'HORDE' ? 'right_icons_grub.png' : `${elder ? 'elder' : monster === 'BARON_NASHOR' ? 'baron' : monster === 'RIFTHERALD' ? 'herald' : 'dragon'}-${team}.png`;
  return { art, label: `${actor?.name || '队伍'} 击杀${name}`, actor };
}
