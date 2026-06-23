import { PlayerRow } from './PlayerRow';
import type { MatchParticipantSummary } from '../../../shared/api';
import type { RecurringMate } from './MatchList';

// 队伍区块：只展示玩家明细表，避免额外团队摘要占用视觉焦点。
interface TeamBlockProps {
  teamId: number;
  participants: MatchParticipantSummary[];
  targetPuuid: string; // 当前查询的玩家 puuid（PlayerRow 高亮用）
  recurringMates?: Map<string, RecurringMate>;
  onPlayerSearch?: (riotId: string) => void;
}

const PREMADE_TONES = ['amber', 'cyan', 'violet', 'rose', 'emerald'] as const;

export function TeamBlock({
  teamId,
  participants,
  targetPuuid,
  recurringMates,
  onPlayerSearch,
}: TeamBlockProps) {
  const teamPlayers = participants.filter((p) => p.teamId === teamId);
  const teamName = teamId === 100 ? '蓝色方' : '红色方';
  const teamTone = teamId === 100 ? 'team-detail-block--blue' : 'team-detail-block--red';
  const teamWon = teamPlayers[0]?.win ?? false;
  const premadeCounts = new Map<string, number>();
  for (const player of teamPlayers) {
    if (!player.premadeId) continue;
    premadeCounts.set(player.premadeId, (premadeCounts.get(player.premadeId) ?? 0) + 1);
  }
  const premadeToneById = new Map<string, (typeof PREMADE_TONES)[number]>();
  for (const [premadeId, count] of premadeCounts) {
    if (count < 2) continue;
    premadeToneById.set(premadeId, PREMADE_TONES[premadeToneById.size % PREMADE_TONES.length]);
  }
  const hasRecurringMate = teamPlayers.some(
    (player) => player.puuid !== targetPuuid && Boolean(recurringMates?.has(player.puuid)),
  );

  return (
    <section className={`team-detail-block ${teamTone}`}>
      <div className="team-detail-divider">
        <span className="team-detail-name">{teamName}</span>
        <span className="team-detail-result">{teamWon ? 'WIN' : 'LOSE'}</span>
      </div>
      {teamPlayers.map((p) => {
        const recurringTone =
          hasRecurringMate && (p.puuid === targetPuuid || Boolean(recurringMates?.has(p.puuid)))
            ? 'amber'
            : undefined;
        return (
          <PlayerRow
            key={`${p.puuid}-${p.championId}`}
            participant={p}
            isTarget={p.puuid === targetPuuid}
            premadeTone={
              recurringTone ?? (p.premadeId ? premadeToneById.get(p.premadeId) : undefined)
            }
            onPlayerSearch={onPlayerSearch}
          />
        );
      })}
    </section>
  );
}
