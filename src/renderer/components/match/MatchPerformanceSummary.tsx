import { ArrowLeftRight, Coins, Crosshair, Flame, Swords } from 'lucide-react';
import type { MatchParticipantSummary } from '../../../shared/api';
import { GameIcon } from './GameIcon';
import { participantLabel, shortParticipantLabel } from './matchStatsModel';

interface Props {
  participants: MatchParticipantSummary[];
  focus: MatchParticipantSummary;
  compare?: MatchParticipantSummary;
  onCompare: () => void;
}

const kda = (player: MatchParticipantSummary) => (player.kills + player.assists) / Math.max(1, player.deaths);
const number = (value: number) => Math.round(value).toLocaleString('zh-CN');
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${number(Math.abs(value))}`;

/** Final-match distributions, deliberately not fictional time-series sparklines. */
export function MatchPerformanceSummary({ participants, focus, compare, onCompare }: Props) {
  const team = participants.filter((player) => player.teamId === focus.teamId);
  const share = (key: 'damage' | 'gold') => {
    const total = team.reduce((sum, player) => sum + (player[key] || 0), 0);
    return total > 0 ? `占全队 ${((focus[key] || 0) / total * 100).toFixed(1)}%` : '暂无队伍占比';
  };
  const metrics = [
    { key: 'kda', label: 'K / D / A', icon: Swords, read: kda, format: (p: MatchParticipantSummary) => `${p.kills} / ${p.deaths} / ${p.assists}`, context: `${kda(focus).toFixed(2)} KDA` },
    { key: 'damage', label: '英雄伤害', icon: Flame, read: (p: MatchParticipantSummary) => p.damage || 0, format: (p: MatchParticipantSummary) => number(p.damage || 0), context: share('damage') },
    { key: 'gold', label: '获得金币', icon: Coins, read: (p: MatchParticipantSummary) => p.gold || 0, format: (p: MatchParticipantSummary) => number(p.gold || 0), context: share('gold') },
    { key: 'cs', label: '补刀', icon: Crosshair, read: (p: MatchParticipantSummary) => p.cs || 0, format: (p: MatchParticipantSummary) => number(p.cs || 0), context: '小兵与野怪' },
  ];
  const hasPosition = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'].includes(focus.teamPosition);
  const opponent = compare ?? (hasPosition ? participants.find((player) => player.teamId !== focus.teamId && player.teamPosition === focus.teamPosition) : undefined);
  return <div className="md-performance">
    <div className="md-stats__summary" aria-label="当前玩家核心数据">
      {metrics.map((metric) => {
        const sorted = [...participants].sort((a, b) => metric.read(b) - metric.read(a));
        const rank = 1 + sorted.filter((player) => metric.read(player) > metric.read(focus)).length;
        const maximum = Math.max(1, ...sorted.map(metric.read));
        return <div className={`md-performance__metric is-${metric.key}`} key={metric.key}>
          <span className="md-performance__label"><metric.icon aria-hidden="true" />{metric.label}</span>
          <strong>{metric.format(focus)}</strong>
          {compare ? <span className="md-stats__summary-compare"><small>对比</small>{metric.format(compare)}</span> : <small className="md-stats__summary-context">{metric.context}</small>}
          <div className="md-performance__standing"><span>全场第 <b>{rank}</b></span><div className="md-performance__distribution" role="img" aria-label={`${metric.label}全场数值从高到低排列，当前第 ${rank}，共 ${participants.length} 人`}>
            {sorted.map((player) => <i key={player.puuid} className={player.puuid === focus.puuid ? 'is-focus' : ''} style={{ height: `${Math.max(6, metric.read(player) / maximum * 100)}%` }} />)}
          </div></div>
        </div>;
      })}
    </div>
    <aside className="md-duel" aria-label="玩家表现对比">
      <div className="md-duel__heading"><strong>{compare ? '玩家对比' : opponent ? '同位置对手' : '玩家对比'}</strong><button type="button" aria-label="选择对比玩家" title="选择对比玩家" onClick={onCompare}><ArrowLeftRight /></button></div>
      {opponent ? <>
        <div className="md-duel__players"><span title={participantLabel(focus)}><GameIcon src={focus.championAvatar} alt="" size={34} rounded /><small>{shortParticipantLabel(focus)}</small></span><b>VS</b><span title={participantLabel(opponent)}><GameIcon src={opponent.championAvatar} alt="" size={34} rounded /><small>{shortParticipantLabel(opponent)}</small></span></div>
        <dl>{([{ key: 'gold', label: '经济' }, { key: 'cs', label: '补刀' }, { key: 'kills', label: '击杀' }, { key: 'damage', label: '伤害' }] as const).map(({ key, label }) => {
          const delta = (focus[key] || 0) - (opponent[key] || 0);
          return <div key={key}><dt>{label}差值</dt><dd className={delta > 0 ? 'is-positive' : delta < 0 ? 'is-negative' : ''}>{signed(delta)}</dd></div>;
        })}</dl>
      </> : <div className="md-duel__empty"><Swords aria-hidden="true" /><p>选择一位玩家</p><button type="button" className="md-control" onClick={onCompare}>选择对比玩家</button></div>}
    </aside>
  </div>;
}
