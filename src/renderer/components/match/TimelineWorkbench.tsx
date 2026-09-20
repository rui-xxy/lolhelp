import { useMemo, useState, type CSSProperties } from 'react';
import { Activity, ArrowLeftRight, ChevronLeft, ChevronRight, Crosshair, Lock, Pin, RotateCcw, Shield, Sparkles, Swords, Table2, Unlock, Users, Wheat, X } from 'lucide-react';
import type { MatchParticipantSummary, MatchTimeline, MatchTimelineEvent } from '../../../shared/api';
import { GameIcon } from './GameIcon';
import { LeagueArtImage } from './LeagueArtImage';
import { TimelineComparisonChart } from './TimelineComparisonChart';
import { TIMELINE_METRICS, buildTimelineSeries, eventPresentation, keyEvents, leadMoments, metricValue, nearestFrame, numberLabel, orderedFrames, seriesValue, subtractValues, timeLabel, timelineNumber, timelinePlayers, type EventGroup, type TimelineMetric, type TimelineValue } from './timelineWorkbenchModel';

interface Props { participants: MatchParticipantSummary[]; timeline: MatchTimeline | null; loading: boolean; error?: string; targetPuuid: string }
function MetricGlyph({ metric }: { metric: TimelineMetric }) {
  if (metric === 'gold') return <LeagueArtImage name="icon_gold.png" />;
  const Icon = metric === 'cs' ? Wheat : metric === 'xp' ? Sparkles : metric === 'damageDealt' ? Swords : Shield;
  return <Icon aria-hidden="true" />;
}
const initialPair = (participants: MatchParticipantSummary[], targetPuuid: string) => {
  const first = participants.find(player => player.puuid === targetPuuid) ?? participants[0];
  if (!first) return [];
  const other = participants.find(player => player.teamId !== first.teamId && first.teamPosition && player.teamPosition === first.teamPosition)
    ?? participants.find(player => player.teamId !== first.teamId);
  return [first, ...(other ? [other] : [])].map(player => player.participantId || participants.indexOf(player) + 1);
};
const metricOf = (metric: TimelineMetric) => TIMELINE_METRICS.find(item => item.key === metric) ?? TIMELINE_METRICS[0];

export function TimelineWorkbench({ participants, timeline, loading, error, targetPuuid }: Props) {
  const frames = useMemo(() => orderedFrames(timeline), [timeline]);
  const players = useMemo(() => timelinePlayers(participants), [participants]);
  const events = useMemo(() => keyEvents(timeline), [timeline]);
  const [metric, setMetric] = useState<TimelineMetric>('gold');
  const [view, setView] = useState<'chart' | 'history'>('chart');
  const [scope, setScope] = useState<'teams' | 'players'>('teams');
  const [selected, setSelected] = useState<number[]>(() => initialPair(participants, targetPuuid));
  const [historyId, setHistoryId] = useState(() => initialPair(participants, targetPuuid)[0] ?? 1);
  const [difference, setDifference] = useState(false);
  const [swapped, setSwapped] = useState(false);
  const [probe, setProbe] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [baseline, setBaseline] = useState<number | null>(null);
  const [eventGroup, setEventGroup] = useState<EventGroup | null>(null);
  const index = Math.max(0, Math.min(frames.length - 1, probe ?? frames.length - 1));
  const frame = frames[index];
  const series = useMemo(() => {
    const result = buildTimelineSeries(players, scope, selected);
    return swapped && result.length === 2 ? result.reverse() : result;
  }, [players, scope, selected, swapped]);
  const pair = series.length === 2;
  const deltaValues = useMemo(() => pair ? frames.map(sample => subtractValues(seriesValue(sample, series[0], metric), seriesValue(sample, series[1], metric))) : [], [frames, series, metric, pair]);
  const moments = useMemo(() => leadMoments(deltaValues), [deltaValues]);
  const rankedPlayers = useMemo(() => players.map(player => ({ ...player, value: metricValue(frame?.participantFrames?.[String(player.id)], metric) }))
    .sort((a, b) => a.value === null ? (b.value === null ? a.id - b.id : 1) : b.value === null ? -1 : b.value - a.value || a.id - b.id), [players, frame, metric]);
  const nearby = eventGroup?.events ?? events.filter(event => Math.abs(event.timestamp - (frame?.timestamp ?? 0)) <= 45000);
  const currentHistory = players.find(player => player.id === historyId) ?? players[0];
  const selectPlayer = (id: number) => {
    setHistoryId(id); setSwapped(false);
    if (view === 'history') return;
    if (scope === 'teams') { setScope('players'); setSelected([id]); }
    else setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  };
  const inspect = (next: number) => { setProbe(next); setEventGroup(null); };
  const lockAt = (next: number) => { setProbe(next); setLocked(true); };
  const reset = () => { setProbe(null); setLocked(false); setBaseline(null); setEventGroup(null); };
  const renderEvent = (event: MatchTimelineEvent, i: number) => {
    const info = eventPresentation(event, players);
    return <button key={`${event.timestamp}-${i}`} type="button" className="tl-near-event" title={info.label} onClick={() => lockAt(nearestFrame(frames, event.timestamp))}>
      <time>{timeLabel(event.timestamp)}</time>
      {info.actor && <GameIcon src={info.actor.player.championAvatar} size={22} alt="" rounded />}
      <LeagueArtImage name={info.art} />
      {info.victim && <GameIcon src={info.victim.player.championAvatar} size={22} alt="" rounded />}
      <span>{info.label}</span>
    </button>;
  };
  const historyHeaders = ['时间', '等级', '金币', '补刀', '经验', '攻击力', '护甲', '魔抗'];
  if (!frames.length) return <div className="tl-empty" role="status"><Activity aria-hidden="true" /><strong>{loading ? '正在读取时间线' : '暂无时间线数据'}</strong>{!loading && error && <span>{error}</span>}</div>;

  return <div className="tl-workbench" style={{ '--tl-comparison-a': series[0]?.tone, '--tl-comparison-b': series[1]?.tone } as CSSProperties}>
    <header className="tl-toolbar">
      <div className="tl-metrics" role="group" aria-label="时间线指标">
        {TIMELINE_METRICS.map(option => <button key={option.key} type="button" className={metric === option.key ? 'is-active' : ''} aria-pressed={metric === option.key} data-metric={option.key} title={option.detail} onClick={() => setMetric(option.key)}><MetricGlyph metric={option.key} /><span>{option.label}</span></button>)}
      </div>
      <div className="tl-segment" role="group" aria-label="时间线视图">
        <button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')}><Activity aria-hidden="true" />曲线</button>
        <button type="button" aria-pressed={view === 'history'} onClick={() => setView('history')}><Table2 aria-hidden="true" />属性</button>
      </div>
    </header>

    <div className="tl-rosterbar">
      <div className="tl-scope" role="group" aria-label="比较范围">
        <button type="button" className={scope === 'teams' && view === 'chart' ? 'is-active' : ''} onClick={() => { setScope('teams'); setView('chart'); setSwapped(false); }} title="两队人均数据，缺失成员时不计算平均"><Users aria-hidden="true" />队伍</button>
        <button type="button" className={scope === 'players' && view === 'chart' ? 'is-active' : ''} onClick={() => { setScope('players'); setView('chart'); setSelected(initialPair(participants, targetPuuid)); setSwapped(false); }} title="选择两位玩家比较，也可点头像添加更多玩家"><ArrowLeftRight aria-hidden="true" />玩家</button>
      </div>
      <div className="tl-roster" role="group" aria-label="选择对比玩家">
        {[...new Set(players.map(entry => entry.player.teamId))].map(teamId => <div className="tl-roster__team" key={teamId}>
          <span className="tl-roster__team-label">{teamId === 100 ? '蓝' : teamId === 200 ? '红' : teamId}</span>
          {players.filter(entry => entry.player.teamId === teamId).map(entry => {
            const active = view === 'history' ? entry.id === historyId : scope === 'players' && selected.includes(entry.id);
            const letter = series.findIndex(line => line.playerIds.length === 1 && line.playerIds[0] === entry.id);
            return <button key={entry.id} type="button" className={`tl-player${active ? ' is-active' : ''}`} style={{ '--tl-tone': entry.tone } as CSSProperties} aria-label={entry.name} aria-pressed={active} title={`${entry.name} · ${entry.player.championName}`} data-player-id={entry.id} onClick={() => selectPlayer(entry.id)}>
              <GameIcon src={entry.player.championAvatar} alt="" size={34} rounded />
              {active && <b>{pair && letter >= 0 ? (letter === 0 ? 'A' : 'B') : '✓'}</b>}
            </button>;
          })}
        </div>)}
      </div>
      <button className="tl-text-button" type="button" onClick={() => { setScope('players'); setView('chart'); setSelected(selected.length === players.length && scope === 'players' ? [] : players.map(player => player.id)); setSwapped(false); }}>{selected.length === players.length && scope === 'players' ? '清空' : '全选'}</button>
    </div>

    <div className="tl-body">
      {view === 'chart' ? <>
        <div className="tl-chart-controls">
          <div className="tl-segment" role="group" aria-label="曲线模式">
            <button type="button" aria-pressed={!difference || !pair} onClick={() => setDifference(false)}>数值</button>
            <button type="button" aria-pressed={difference && pair} disabled={!pair} title={pair ? 'A 减 B；正值代表 A 较高' : '选择两条曲线后查看差值'} onClick={() => setDifference(true)}>差值 A − B</button>
          </div>
          {pair && <button className="tl-icon-button" type="button" title="交换 A / B" aria-label="交换 A / B" onClick={() => setSwapped(value => !value)}><ArrowLeftRight /></button>}
          <div className="tl-baseline-control">
            {baseline !== null ? <button type="button" className="tl-baseline-tag" onClick={() => setBaseline(null)} title="清除比较基准"><Pin />{timeLabel(frames[baseline].timestamp)}<X /></button>
              : <button type="button" className="tl-text-button" onClick={() => { setBaseline(index); setLocked(false); }} title="将当前采样设为基准，再移动鼠标查看这段时间的增长"><Pin />设为基准</button>}
            <button type="button" className="tl-icon-button" onClick={reset} title="清除锁定与基准" aria-label="重置时间游标"><RotateCcw /></button>
          </div>
        </div>
        <div className="tl-analysis">
          <section className="tl-analysis__main" aria-label={`${metricOf(metric).label}时间曲线`}>
            <TimelineComparisonChart frames={frames} series={series} metric={metric} difference={difference && pair} index={index} baseline={baseline} locked={locked} players={players} events={events}
              onProbe={inspect} onLock={lockAt} onUnlock={() => setLocked(false)} onEvent={group => { setEventGroup(group); if (!locked) setProbe(nearestFrame(frames, group.timestamp)); }} />
            {pair && moments.length > 0 && <div className="tl-moments" aria-label="可定位的差值时刻">
              {moments.map(moment => <button type="button" key={moment.kind} onClick={() => { inspect(moment.index); lockAt(moment.index); }} title={moment.kind === 'switch' ? '最近一次观察到领先方变化的采样点，实际变化可能发生在两帧之间' : '点击定位该采样'}>
                <span>{moment.kind === 'switch' ? '最近换边' : `${moment.kind === 'a' ? 'A' : 'B'} 最大领先`}</span>
                {moment.kind !== 'switch' && <b>{numberLabel(moment.value, true)}</b>}<time>{timeLabel(frames[moment.index].timestamp)}</time>
              </button>)}
            </div>}
          </section>
          <aside className="tl-inspector" aria-label="游标时刻对比">
            <header className="tl-inspector__head"><Crosshair aria-hidden="true" /><span>采样</span><time>{timeLabel(frame.timestamp)}</time>
              <button type="button" className="tl-icon-button" aria-label={locked ? '解锁时间游标' : '锁定时间游标'} title={locked ? '解锁，继续随鼠标查看' : '锁定当前采样'} onClick={() => setLocked(value => !value)}>{locked ? <Lock /> : <Unlock />}</button>
            </header>
            <div className="tl-probe-list">
              {series.map((line, i) => <div key={line.id} className="tl-probe-row" style={{ '--tl-tone': line.tone } as CSSProperties}>
                <span className="tl-series-key">{pair ? (i === 0 ? 'A' : 'B') : i + 1}</span>
                <span title={line.name}>{line.name}</span>
                <strong>{numberLabel(seriesValue(frame, line, metric))}</strong>
                {baseline !== null && <small title={`相对 ${timeLabel(frames[baseline].timestamp)}`}>{numberLabel(subtractValues(seriesValue(frame, line, metric), seriesValue(frames[baseline], line, metric)), true)}</small>}
              </div>)}
              {!series.length && <p className="tl-muted">未选择玩家</p>}
            </div>
            {pair && <table className="tl-compare-table" aria-label="当前采样的五项指标对比"><thead><tr><th>指标</th><th>A</th><th>B</th><th>差值</th></tr></thead>
              <tbody>{TIMELINE_METRICS.map(option => {
                const a = seriesValue(frame, series[0], option.key), b = seriesValue(frame, series[1], option.key), delta = subtractValues(a, b);
                return <tr key={option.key} className={option.key === metric ? 'is-active' : ''}><th><button type="button" onClick={() => setMetric(option.key)}>{option.label}</button></th><td>{numberLabel(a)}</td><td>{numberLabel(b)}</td><td className={delta === null || delta === 0 ? '' : delta > 0 ? 'is-positive' : 'is-negative'}>{numberLabel(delta, true)}</td></tr>;
              })}</tbody>
            </table>}
            <div className="tl-near-events">
              <header><span>{eventGroup ? `事件 · ${timeLabel(eventGroup.timestamp)}` : '附近事件'}</span>{eventGroup && <button className="tl-icon-button" type="button" aria-label="返回附近事件" onClick={() => setEventGroup(null)}><X /></button>}</header>
              {!nearby.length && <p className="tl-muted">该时刻附近无关键事件</p>}
              {nearby.slice(0, 3).map(renderEvent)}
              {nearby.length > 3 && <details><summary>另 {nearby.length - 3} 条</summary>{nearby.slice(3).map(renderEvent)}</details>}
            </div>
            <nav className="tl-sample-nav" aria-label="逐帧检查"><button type="button" disabled={index === 0} onClick={() => inspect(index - 1)} aria-label="上一采样"><ChevronLeft /></button><span>{index + 1} / {frames.length}</span><button type="button" disabled={index === frames.length - 1} onClick={() => inspect(index + 1)} aria-label="下一采样"><ChevronRight /></button></nav>
          </aside>
        </div>

        <section className="tl-snapshot" aria-label="全场玩家时刻快照">
          <header className="tl-section-head"><h3>全场快照</h3><time>{timeLabel(frame.timestamp)}</time><span>{metricOf(metric).label}排序</span></header>
          <table className="tl-data-table"><thead><tr><th>玩家</th>{TIMELINE_METRICS.map(option => <th key={option.key}><button type="button" className={metric === option.key ? 'is-active' : ''} onClick={() => setMetric(option.key)}>{option.label}</button></th>)}<th title={baseline !== null ? `相对基准 ${timeLabel(frames[baseline].timestamp)}` : '相对上一采样的变化'}>{baseline !== null ? '较基准' : '本段增长'}</th></tr></thead>
            <tbody>{rankedPlayers.map(entry => {
              const rank = entry.value === null ? '—' : 1 + rankedPlayers.filter(other => other.value !== null && other.value > (entry.value ?? Infinity)).length;
              const source = frame.participantFrames?.[String(entry.id)];
              const previous = baseline !== null ? frames[baseline] : index > 0 ? frames[index - 1] : undefined;
              const gain = subtractValues(entry.value, metricValue(previous?.participantFrames?.[String(entry.id)], metric));
              return <tr key={entry.id} className={scope === 'players' && selected.includes(entry.id) ? 'is-selected' : ''}>
                <th><button type="button" onClick={() => selectPlayer(entry.id)} title={entry.name}><span className="tl-rank">{rank}</span><GameIcon src={entry.player.championAvatar} size={24} alt="" rounded /><span>{entry.name}</span></button></th>
                {TIMELINE_METRICS.map(option => <td key={option.key} data-label={option.label} className={option.key === metric ? 'is-current' : ''}>{numberLabel(metricValue(source, option.key))}</td>)}
                <td data-label={baseline !== null ? '较基准' : '本段增长'} className={gain === null || gain === 0 ? '' : gain > 0 ? 'is-positive' : 'is-negative'}>{numberLabel(gain, true)}</td>
              </tr>;
            })}</tbody>
          </table>
        </section>
      </> : <section className="tl-history" aria-label="玩家属性时间线">
        <header className="tl-section-head"><h3>属性时间线</h3>{currentHistory && <><GameIcon src={currentHistory.player.championAvatar} size={24} alt="" rounded /><span title={currentHistory.name}>{currentHistory.name}</span></>}</header>
        <table className="tl-data-table tl-history-table"><thead><tr>{historyHeaders.map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>
          {frames.map((sample, sampleIndex) => {
            const data = sample.participantFrames?.[String(currentHistory?.id)];
            const fields: TimelineValue[] = [timelineNumber(data?.level), metricValue(data, 'gold'), metricValue(data, 'cs'), metricValue(data, 'xp'), timelineNumber(data?.championStats?.attackDamage), timelineNumber(data?.championStats?.armor), timelineNumber(data?.championStats?.magicResist)];
            return <tr key={sample.timestamp} className={sampleIndex === index ? 'is-selected' : ''}><th><button type="button" title="在曲线中定位此采样" onClick={() => { setScope('players'); setSelected(currentHistory ? [currentHistory.id] : []); setView('chart'); setDifference(false); lockAt(sampleIndex); }}>{timeLabel(sample.timestamp)}<ChevronRight /></button></th>{fields.map((value, fieldIndex) => <td key={fieldIndex} data-label={historyHeaders[fieldIndex + 1]}>{numberLabel(value)}</td>)}</tr>;
          })}
        </tbody></table>
      </section>}
    </div>
  </div>;
}
