import type { MatchParticipantSummary } from '../../../shared/api';

export type StatsDisplayValue = number | string | boolean;
export interface StatsMetric {
  key: string;
  label: string;
  value?: (participant: MatchParticipantSummary) => number;
  text?: (participant: MatchParticipantSummary) => string;
  rawKey?: string;
  kind?: 'number' | 'decimal' | 'percent' | 'duration' | 'boolean';
  description?: string;
}
export interface StatsGroup { title: string; metrics: StatsMetric[] }

export function participantLabel(player: MatchParticipantSummary): string {
  return player.riotId || player.summonerName || '未知玩家';
}
export function shortParticipantLabel(player: MatchParticipantSummary): string {
  return participantLabel(player).split('#')[0];
}

// Quantitative bars share a zero baseline. Do not map the smallest nonzero
// value to an empty bar; signed metrics use a separate, centered scale.
export function metricBar(value: number | null, values: number[]): { left: number; width: number; signed: boolean } {
  const finite = values.filter(Number.isFinite);
  const signed = finite.some((item) => item < 0);
  if (value === null || !Number.isFinite(value)) return { left: signed ? 50 : 0, width: 0, signed };
  const maximum = Math.max(0, ...finite.map(Math.abs));
  if (maximum === 0) return { left: 0, width: 0, signed };
  const width = Math.min(signed ? 50 : 100, Math.abs(value) / maximum * (signed ? 50 : 100));
  return { left: signed ? (value < 0 ? 50 - width : 50) : 0, width, signed };
}

export function metricHasBar(metric: StatsMetric, value: StatsDisplayValue): value is number {
  return !metric.text && metric.kind !== 'boolean' && typeof value === 'number' && Number.isFinite(value);
}
