import type { MatchParticipantSummary, MatchTimelineEvent } from '../../../shared/api';

export function isSpecialMultiKill(event: MatchTimelineEvent): boolean {
  return event.type === 'CHAMPION_SPECIAL_KILL' && event.killType === 'KILL_MULTI';
}

export function isMultiKillEvent(event: MatchTimelineEvent): boolean {
  return isSpecialMultiKill(event) || (event.type === 'CHAMPION_KILL' && Number(event.multiKillLength) >= 2);
}

export function multiKillLabel(event: MatchTimelineEvent): string {
  const length = Number(event.multiKillLength);
  return ({ 2: '双杀', 3: '三杀', 4: '四杀', 5: '五杀' } as Record<number, string>)[length]
    ?? (Number.isInteger(length) && length >= 2 ? `${length} 杀` : '多杀');
}

/**
 * Multi-kill awards may be separate CHAMPION_SPECIAL_KILL / KILL_MULTI events.
 * Join only explicit awards to the same killer's exact (or unambiguous <=1s
 * preceding) kill. Do NOT infer awards from the UI's cross-player fight windows.
 * Keep unmatchable awards as standalone events instead of inventing victims.
 */
export function prepareEventTimeline(source: MatchTimelineEvent[]): MatchTimelineEvent[] {
  const events = source.map(event => ({ ...event })).sort((a, b) => a.timestamp - b.timestamp);
  const kills = new Map<number, number[]>();
  events.forEach((event, index) => {
    if (event.type !== 'CHAMPION_KILL' || !(Number(event.killerId) > 0)) return;
    const id = Number(event.killerId);
    kills.set(id, [...(kills.get(id) ?? []), index]);
  });
  const consumed = new Set<number>();
  const assigned = new Set<number>();
  const seen = new Set<string>();
  events.forEach((award, index) => {
    if (!isSpecialMultiKill(award)) return;
    const id = Number(award.killerId);
    const signature = `${id}:${award.timestamp}:${award.multiKillLength ?? ''}`;
    if (seen.has(signature)) { consumed.add(index); return; }
    seen.add(signature);
    if (!(id > 0) || !Number.isFinite(award.timestamp)) return;
    const candidates = (kills.get(id) ?? []).filter(i => {
      const delta = award.timestamp - events[i].timestamp;
      return delta >= 0 && delta <= 1000;
    });
    const exact = candidates.filter(i => events[i].timestamp === award.timestamp);
    const pool = exact.length ? exact : candidates.length === 1 ? candidates : [];
    // A provider may emit both the inline value and the separate notification.
    const inline = pool.find(i => isMultiKillEvent(events[i]) && Number(events[i].multiKillLength) === Number(award.multiKillLength));
    const available = pool.filter(i => !assigned.has(i) && !isMultiKillEvent(events[i]));
    const preceding = available.filter(i => i < index);
    const target = inline ?? preceding.at(-1) ?? available[0];
    if (target === undefined || !(Number(award.multiKillLength) >= 2)) return;
    events[target] = { ...events[target], multiKillLength: Number(award.multiKillLength), killType: 'KILL_MULTI' };
    assigned.add(target);
    consumed.add(index);
  });
  return events.filter((_, index) => !consumed.has(index));
}

export function hasMultiKillSummary(players: MatchParticipantSummary[]): boolean {
  return players.some(player => {
    const stats = { ...player.stats, ...player.rawStats } as Record<string, unknown>;
    return Number(stats.largestMultiKill) >= 2 || ['doubleKills', 'tripleKills', 'quadraKills', 'pentaKills', 'multikills'].some(key => Number(stats[key]) > 0);
  });
}
