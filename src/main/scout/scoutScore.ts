// MVP 综合分计算（纯函数，可单测）。
//
// SGP 没有现成 MVP 字段，按方案 v3 用每场参与者数据自己算：
//   综合分 = 0.6 * 归一化KDA + 0.4 * 伤害占团队比例(teamDamagePercentage)
// 每场内 10 人各自归一化（KDA 除以本场最高 KDA），伤害占比天然是 0~1。
// 这样辅助/坦克靠高伤害占比也能当种子，不被 KDA 单一指标埋没。
//
// 扩散种子 = 每场综合分最高的 N 人（默认 2），不论英雄、不论输赢。

import type { MatchParticipantSummary, PlayerMatchDetail } from '../../shared/api';

// 权重（硬编码；效果不好再考虑开到设置）
const KDA_WEIGHT = 0.6;
const DAMAGE_WEIGHT = 0.4;

// 把一批数值归一化到 [0,1]（除以最大值；最大为 0 时全部返回 0）
function normalize(values: number[]): number[] {
  const max = Math.max(...values, 0);
  if (max <= 0) return values.map(() => 0);
  return values.map((v) => v / max);
}

// 计算单场所有参与者的综合分，返回 puuid → 分数 的映射。
// 依赖 matchMapper 已经把 teamDamagePercentage 填进去（可能缺失，缺失当 0 处理）。
export function computeMvpScores(match: PlayerMatchDetail): Map<string, number> {
  const participants = match.participants ?? [];
  if (participants.length === 0) return new Map();

  const kdas = participants.map((p) => p.kda ?? 0);
  const normKdas = normalize(kdas);
  const scores = new Map<string, number>();

  participants.forEach((p, i) => {
    // teamDamagePercentage 在 SGP 是 0~100 还是 0~1 不统一，统一压到 [0,1]
    const dmgPct = clamp01(toRatio(p.teamDamagePercentage));
    const score = KDA_WEIGHT * normKdas[i] + DAMAGE_WEIGHT * dmgPct;
    scores.set(p.puuid, score);
  });

  return scores;
}

// 从单场挑出综合分最高的 N 个 puuid（去重、排除空 puuid）。
// 返回顺序按分数从高到低。
export function pickSeeds(match: PlayerMatchDetail, topN = 2): string[] {
  const scores = computeMvpScores(match);
  const entries = [...scores.entries()]
    .filter(([puuid]) => Boolean(puuid))
    .sort((a, b) => b[1] - a[1]);
  return entries.slice(0, topN).map(([puuid]) => puuid);
}

// 辅助：把数值钳制到 [0,1]
function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

// teamDamagePercentage 可能是 0~1（小数）也可能是 0~100（百分比），
// 统一换算成 0~1。
function toRatio(v?: number): number {
  if (v == null || !Number.isFinite(v)) return 0;
  if (v > 1) return v / 100;
  return v;
}

// 给单参与者在单场的综合分（调试/展示用，可选）
export function participantScore(
  p: MatchParticipantSummary,
  matchKdaMax: number,
): number {
  const normKda = matchKdaMax > 0 ? (p.kda ?? 0) / matchKdaMax : 0;
  return KDA_WEIGHT * normKda + DAMAGE_WEIGHT * clamp01(toRatio(p.teamDamagePercentage));
}
