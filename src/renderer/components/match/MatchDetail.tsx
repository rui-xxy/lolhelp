import { TeamBlock } from './TeamBlock';
import type { PlayerMatchDetail } from '../../../shared/api';

// 对局详情：右侧主区，专注双队战绩数据。
// 只展示双方队伍明细，避免额外摘要区占用空间。
interface MatchDetailProps {
  match: PlayerMatchDetail;
  targetPuuid: string;
}

export function MatchDetail({ match, targetPuuid }: MatchDetailProps) {
  return (
    <div className="space-y-4">
      {/* 双队详情 */}
      <TeamBlock
        teamId={100}
        participants={match.participants}
        targetPuuid={targetPuuid}
      />
      <TeamBlock
        teamId={200}
        participants={match.participants}
        targetPuuid={targetPuuid}
      />
    </div>
  );
}
