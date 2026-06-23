import { TeamBlock } from './TeamBlock';
import type { PlayerMatchDetail } from '../../../shared/api';
import type { RecurringMate } from './MatchList';

// 对局详情：右侧主区，专注双队战绩数据。
// 只展示双方队伍明细，避免额外摘要区占用空间。
interface MatchDetailProps {
  match: PlayerMatchDetail;
  targetPuuid: string;
  recurringMates?: Map<string, RecurringMate>;
  onPlayerSearch?: (riotId: string) => void;
}

export function MatchDetail({ match, targetPuuid, recurringMates, onPlayerSearch }: MatchDetailProps) {
  return (
    <div className="match-detail-table">
      <div className="match-detail-header">
        <span></span>
        <span>玩家</span>
        <span className="text-center">装备</span>
        <span className="text-center">KDA</span>
        <span className="text-right">经济</span>
        <span className="text-right">伤害</span>
        <span className="text-right">补刀</span>
      </div>
      <TeamBlock
        teamId={100}
        participants={match.participants}
        targetPuuid={targetPuuid}
        recurringMates={recurringMates}
        onPlayerSearch={onPlayerSearch}
      />
      <TeamBlock
        teamId={200}
        participants={match.participants}
        targetPuuid={targetPuuid}
        recurringMates={recurringMates}
        onPlayerSearch={onPlayerSearch}
      />
    </div>
  );
}
