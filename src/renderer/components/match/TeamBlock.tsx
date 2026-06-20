import { PlayerRow } from './PlayerRow';
import type { MatchParticipantSummary } from '../../../shared/api';

// 队伍区块：只展示玩家明细表，避免额外团队摘要占用视觉焦点。
interface TeamBlockProps {
  teamId: number;
  participants: MatchParticipantSummary[];
  targetPuuid: string; // 当前查询的玩家 puuid（PlayerRow 高亮用）
  onPlayerSearch?: (riotId: string) => void;
}

export function TeamBlock({ teamId, participants, targetPuuid, onPlayerSearch }: TeamBlockProps) {
  const teamPlayers = participants.filter((p) => p.teamId === teamId);
  const teamName = teamId === 100 ? '蓝色方' : '红色方';
  const teamTone = teamId === 100 ? 'team-detail-block--blue' : 'team-detail-block--red';
  const teamWon = teamPlayers[0]?.win ?? false;

  return (
    <section className={`team-detail-block ${teamTone}`}>
      <div className="team-detail-divider">
        <span className="team-detail-name">{teamName}</span>
        <span className="team-detail-result">{teamWon ? 'WIN' : 'LOSE'}</span>
      </div>
      {teamPlayers.map((p) => (
        <PlayerRow
          key={`${p.puuid}-${p.championId}`}
          participant={p}
          isTarget={p.puuid === targetPuuid}
          onPlayerSearch={onPlayerSearch}
        />
      ))}
    </section>
  );
}
