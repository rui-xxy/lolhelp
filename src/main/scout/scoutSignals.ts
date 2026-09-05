import type {
  MatchParticipantSummary,
  PlayerMatchDetail,
  ScoutBehaviorShiftSignal,
  ScoutDuoSignal,
  ScoutSignals,
} from '../../shared/api';

interface MatchView {
  match: PlayerMatchDetail;
  target: MatchParticipantSummary;
}

interface WindowStats {
  championIds: Set<number>;
  primaryRole: string;
  primaryRoleShare: number;
  averageKda: number;
  averageDamagePerMinute: number;
  winRate: number;
}

const POSITION_ALIASES: Record<string, string> = {
  TOP: '上路',
  JUNGLE: '打野',
  MIDDLE: '中路',
  MID: '中路',
  BOTTOM: '下路',
  BOT: '下路',
  UTILITY: '辅助',
  SUPPORT: '辅助',
};

function targetView(match: PlayerMatchDetail, targetPuuid: string): MatchView | null {
  const target = match.participants?.find((participant) => participant.puuid === targetPuuid);
  return target ? { match, target } : null;
}

function sortedViews(matches: PlayerMatchDetail[], targetPuuid: string): MatchView[] {
  return matches
    .map((match) => targetView(match, targetPuuid))
    .filter((view): view is MatchView => Boolean(view))
    .sort((a, b) => b.match.gameCreation - a.match.gameCreation);
}

function displayName(participant: MatchParticipantSummary): string {
  return participant.riotId || participant.summonerName || participant.gameName || '未知玩家';
}

function analyzeDuo(views: MatchView[]): ScoutDuoSignal | undefined {
  const sample = views.slice(0, 10);
  const partners = new Map<
    string,
    { participant: MatchParticipantSummary; games: number; partySize: number }
  >();

  for (const { match, target } of sample) {
    if (!target.premadeId) continue;
    const party = match.participants.filter(
      (participant) =>
        participant.puuid !== target.puuid &&
        participant.teamId === target.teamId &&
        participant.premadeId === target.premadeId,
    );
    for (const participant of party) {
      const current = partners.get(participant.puuid);
      partners.set(participant.puuid, {
        participant,
        games: (current?.games ?? 0) + 1,
        partySize: Math.max(current?.partySize ?? 0, party.length + 1),
      });
    }
  }

  const best = [...partners.values()].sort((a, b) => b.games - a.games)[0];
  if (best) {
    return {
      partnerPuuid: best.participant.puuid,
      partnerRiotId: displayName(best.participant),
      gamesTogether: best.games,
      checkedMatches: sample.length,
      evidence: 'premade',
      fixed: best.games >= 2,
      partySize: best.partySize,
    };
  }

  // 国服部分历史对局不返回 premadeId。重复同队只能作为后备线索，不能当成确定组队。
  const recurring = new Map<
    string,
    { participant: MatchParticipantSummary; games: number }
  >();
  for (const { match, target } of sample) {
    const teammates = match.participants.filter(
      (participant) =>
        participant.puuid &&
        participant.puuid !== target.puuid &&
        participant.teamId === target.teamId,
    );
    for (const participant of teammates) {
      const current = recurring.get(participant.puuid);
      recurring.set(participant.puuid, {
        participant,
        games: (current?.games ?? 0) + 1,
      });
    }
  }

  const recurringBest = [...recurring.values()].sort((a, b) => b.games - a.games)[0];
  const minimumRecurringGames = Math.max(2, Math.ceil(sample.length * 0.35));
  if (!recurringBest || recurringBest.games < minimumRecurringGames) return undefined;

  return {
    partnerPuuid: recurringBest.participant.puuid,
    partnerRiotId: displayName(recurringBest.participant),
    gamesTogether: recurringBest.games,
    checkedMatches: sample.length,
    evidence: 'recurring',
    fixed: false,
    partySize: 2,
  };
}

function normalizedRole(position: string): string {
  const key = position.trim().toUpperCase();
  return POSITION_ALIASES[key] ?? key;
}

function statsFor(views: MatchView[]): WindowStats {
  const roleCounts = new Map<string, number>();
  let kdaTotal = 0;
  let damagePerMinuteTotal = 0;
  let wins = 0;

  for (const { match, target } of views) {
    const role = normalizedRole(target.teamPosition || '');
    if (role) roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
    kdaTotal += Math.min(match.kda, 20);
    damagePerMinuteTotal += match.damage / Math.max(1, match.gameDuration / 60);
    if (match.win) wins++;
  }

  const [primaryRole = '', roleCount = 0] = [...roleCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0] ?? [];

  return {
    championIds: new Set(views.map(({ match }) => match.championId)),
    primaryRole,
    primaryRoleShare: views.length ? roleCount / views.length : 0,
    averageKda: views.length ? kdaTotal / views.length : 0,
    averageDamagePerMinute: views.length ? damagePerMinuteTotal / views.length : 0,
    winRate: views.length ? wins / views.length : 0,
  };
}

function formatNumber(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '');
}

function analyzeBehaviorShift(views: MatchView[]): ScoutBehaviorShiftSignal | undefined {
  if (views.length < 5) return undefined;

  const recentCount = views.length >= 10 ? 4 : views.length >= 7 ? 2 : 1;
  const recent = views.slice(0, recentCount);
  const baseline = views.slice(recentCount, recentCount + (views.length >= 10 ? 10 : views.length));
  if (baseline.length < 3) return undefined;

  const current = statsFor(recent);
  const previous = statsFor(baseline);
  const newChampionCount = [...current.championIds].filter(
    (championId) => !previous.championIds.has(championId),
  ).length;
  const championShift = newChampionCount === current.championIds.size;
  if (!championShift) return undefined;

  const roleShift =
    Boolean(current.primaryRole) &&
    Boolean(previous.primaryRole) &&
    current.primaryRole !== previous.primaryRole &&
    current.primaryRoleShare >= 0.5 &&
    previous.primaryRoleShare >= 0.5;
  const kdaJump =
    current.averageKda >= previous.averageKda * 1.65 &&
    current.averageKda - previous.averageKda >= 2;
  const damageJump =
    current.averageDamagePerMinute >= previous.averageDamagePerMinute * 1.45 &&
    current.averageDamagePerMinute - previous.averageDamagePerMinute >= 180;
  const resultJump =
    current.winRate - previous.winRate >= 0.5 &&
    current.averageKda - previous.averageKda >= 1.2;

  const supportingSignals = [roleShift, kdaJump, damageJump, resultJump].filter(Boolean).length;
  if (supportingSignals === 0) return undefined;

  const reasons = [`近 ${recent.length} 场英雄池与此前 ${baseline.length} 场没有重合`];
  if (roleShift) reasons.push(`主要位置由${previous.primaryRole}变为${current.primaryRole}`);
  if (kdaJump) {
    reasons.push(
      `平均 KDA 从 ${formatNumber(previous.averageKda)} 升至 ${formatNumber(current.averageKda)}`,
    );
  }
  if (damageJump) reasons.push('每分钟伤害明显提高');
  if (resultJump) reasons.push('近期胜率和表现同时上升');

  return {
    confidence: supportingSignals >= 2 || views.length >= 10 ? 'high' : 'medium',
    reasons,
    recentMatches: recent.length,
    baselineMatches: baseline.length,
  };
}

export function analyzeScoutSignals(
  matches: PlayerMatchDetail[],
  targetPuuid: string,
): ScoutSignals | undefined {
  const views = sortedViews(matches, targetPuuid);
  if (views.length === 0) return undefined;

  const duo = analyzeDuo(views);
  const behaviorShift = analyzeBehaviorShift(views);
  if (!duo && !behaviorShift) return undefined;
  return { duo, behaviorShift };
}
