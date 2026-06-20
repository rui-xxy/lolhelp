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

  return (
    <section className="overflow-hidden rounded-sm border border-app-border bg-app-surface">
      {/* 表头（列对齐参考，浅色） */}
      <div className="grid grid-cols-[38px_minmax(170px,1.35fr)_152px_64px_52px_52px_36px] items-center gap-2 border-b border-app-border px-3 py-2 text-[10px] font-medium text-app-subtle">
        <span></span>
        <span>玩家</span>
        <span className="text-center">装备</span>
        <span className="text-center">KDA</span>
        <span className="text-right">经济</span>
        <span className="text-right">伤害</span>
        <span className="text-right">补刀</span>
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
