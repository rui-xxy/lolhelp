import { memo, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { MatchTimelineEvent, MatchTimelineFrame } from '../../../shared/api';
import { LeagueArtImage } from './LeagueArtImage';
import { GameIcon } from './GameIcon';
import { areaPath, axisDomain, eventPresentation, groupTimelineEvents, linePath, nearestFrame, numberLabel, seriesValue, subtractValues, timeLabel, timelineFraction, type EventGroup, type TimelineMetric, type TimelinePlayer, type TimelineSeries } from './timelineWorkbenchModel';

interface Props {
  frames: MatchTimelineFrame[]; series: TimelineSeries[]; metric: TimelineMetric; difference: boolean;
  index: number; baseline: number | null; locked: boolean; players: TimelinePlayer[]; events: MatchTimelineEvent[];
  onProbe: (index: number) => void; onLock: (index: number) => void; onUnlock: () => void; onEvent: (group: EventGroup) => void;
}
const HEIGHT = 256;
export const TimelineComparisonChart = memo(function TimelineComparisonChart({ frames, series, metric, difference, index, baseline, locked, players, events, onProbe, onLock, onUnlock, onEvent }: Props) {
  const plotRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const pending = useRef(0);
  const lastProbe = useRef(index);
  const [width, setWidth] = useState(600);
  const [hovering, setHovering] = useState(false);
  const id = useId().replace(/:/g, '');
  const first = frames[0]?.timestamp ?? 0, last = frames.at(-1)?.timestamp ?? first;
  const sample = frames[index];
  const rawValues = useMemo(() => series.map(line => frames.map(frame => seriesValue(frame, line, metric))), [frames, series, metric]);
  const values = useMemo(() => difference && rawValues.length === 2 ? [rawValues[0].map((value, i) => subtractValues(value, rawValues[1][i]))] : rawValues, [difference, rawValues]);
  const domain = useMemo(() => axisDomain(values.flat(), difference), [values, difference]);
  const paths = useMemo(() => values.map(line => linePath(frames, line, domain)), [frames, values, domain]);
  const fill = useMemo(() => difference && values[0] ? areaPath(frames, values[0], domain) : '', [frames, values, domain, difference]);
  const bins = Math.max(4, Math.floor(width / 32));
  const groups = useMemo(() => groupTimelineEvents(events, first, last, bins), [events, first, last, bins]);
  const pct = (timestamp: number) => timelineFraction(timestamp, first, last) * 100;
  const y = (value: number) => HEIGHT - (value - domain.min) / (domain.max - domain.min) * HEIGHT;
  useEffect(() => { lastProbe.current = index; }, [index]);
  useEffect(() => {
    const element = plotRef.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(raf.current); };
  }, []);
  const pointerTime = (clientX: number) => {
    const rect = plotRef.current?.getBoundingClientRect() ?? { left: 0, width: 1 };
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    return { fraction, timestamp: first + fraction * (last - first) };
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    setHovering(true);
    if (locked) return;
    pending.current = event.clientX;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const position = pointerTime(pending.current);
      plotRef.current?.style.setProperty('--tl-pointer', `${position.fraction * 100}%`);
      const next = nearestFrame(frames, position.timestamp);
      if (next !== lastProbe.current) { lastProbe.current = next; onProbe(next); }
    });
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { onUnlock(); return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onLock(index); return; }
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? frames.length - 1 : event.key === 'ArrowLeft' ? index - 1 : event.key === 'ArrowRight' ? index + 1 : null;
    if (next !== null) { event.preventDefault(); onProbe(Math.max(0, Math.min(frames.length - 1, next))); }
  };
  const missing = !values.some(line => line.some(value => value !== null));
  const tickCount = width < 350 ? 4 : 6;
  return <div className="tl-chart" data-difference={difference}>
    <div className="tl-legend" aria-label="当前对比曲线">
      {series.map((line, i) => <div key={line.id} style={{ '--tl-tone': line.tone } as CSSProperties}>
        <span className="tl-series-key">{series.length === 2 ? (i === 0 ? 'A' : 'B') : i + 1}</span>
        {line.avatar && <GameIcon src={line.avatar} alt="" size={22} rounded />}
        <span className="tl-legend__name" title={line.name}>{line.name}</span>
        <strong>{numberLabel(rawValues[i]?.[index] ?? null)}</strong>
      </div>)}
    </div>
    <div className="tl-chart__canvas">
      <div className="tl-y-axis" aria-hidden="true">{domain.ticks.map((tick, i) => <span key={i} style={{ top: `${y(tick) / HEIGHT * 100}%` }}>{numberLabel(tick)}</span>)}</div>
      <div ref={plotRef} className={`tl-plot${locked ? ' is-locked' : ''}`} role="slider" tabIndex={0}
        aria-label="时间游标，左右方向键切换采样，回车锁定，Esc解锁" aria-valuemin={first} aria-valuemax={last} aria-valuenow={sample?.timestamp ?? first} aria-valuetext={timeLabel(sample?.timestamp ?? first)}
        onPointerMove={move} onPointerLeave={() => { setHovering(false); cancelAnimationFrame(raf.current); raf.current = 0; }}
        onClick={event => { cancelAnimationFrame(raf.current); raf.current = 0; onLock(nearestFrame(frames, pointerTime(event.clientX).timestamp)); }} onKeyDown={keyboard}>
        <svg viewBox={`0 0 1000 ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <clipPath id={`${id}-positive`}><rect width="1000" height={y(0)} /></clipPath>
            <clipPath id={`${id}-negative`}><rect y={y(0)} width="1000" height={HEIGHT - y(0)} /></clipPath>
          </defs>
          {domain.ticks.map((tick, i) => <line className={tick === 0 && difference ? 'tl-grid is-zero' : 'tl-grid'} key={i} x1="0" x2="1000" y1={y(tick)} y2={y(tick)} />)}
          {baseline !== null && frames[baseline] && sample && <rect className="tl-interval" x={Math.min(pct(frames[baseline].timestamp), pct(sample.timestamp)) * 10} y="0" width={Math.abs(pct(frames[baseline].timestamp) - pct(sample.timestamp)) * 10} height={HEIGHT} />}
          {difference && <>
            <path className="tl-area is-a" d={fill} clipPath={`url(#${id}-positive)`} style={{ fill: series[0]?.tone }} />
            <path className="tl-area is-b" d={fill} clipPath={`url(#${id}-negative)`} style={{ fill: series[1]?.tone }} />
          </>}
          {paths.map((path, i) => difference ? <g key={i}>
            <path className="tl-line" d={path} style={{ stroke: series[0]?.tone }} clipPath={`url(#${id}-positive)`} />
            <path className="tl-line" d={path} style={{ stroke: series[1]?.tone }} clipPath={`url(#${id}-negative)`} />
          </g> : <path className="tl-line" key={series[i]?.id ?? i} d={path} style={{ stroke: series[i]?.tone, strokeDasharray: i > 4 ? '5 3' : undefined }} />)}
        </svg>
        <div className="tl-samples" aria-hidden="true">{values.map((line, i) => line[index] !== null && line[index] !== undefined && sample ? <span className="tl-sample-dot" key={i} style={{ left: `${pct(sample.timestamp)}%`, top: `${y(line[index] as number) / HEIGHT * 100}%`, background: difference && (line[index] as number) < 0 ? series[1]?.tone : series[i]?.tone }} /> : null)}</div>
        {baseline !== null && frames[baseline] && <div className={`tl-baseline${pct(frames[baseline].timestamp) > 85 ? ' is-end' : ''}`} style={{ left: `${pct(frames[baseline].timestamp)}%` }}><span>基准</span></div>}
        {sample && <div className="tl-crosshair" style={{ left: hovering && !locked ? 'var(--tl-pointer, 100%)' : `${pct(sample.timestamp)}%` }} />}
        {missing && <div className="tl-chart__empty">{series.length ? '此指标暂无采样数据' : '选择玩家开始对比'}</div>}
        {(hovering || locked) && sample && !missing && <div className="tl-chart-tooltip" role="tooltip" style={{ '--tl-tip-x': locked ? `${pct(sample.timestamp)}%` : 'var(--tl-pointer, 100%)' } as CSSProperties}>
          <header><span>{locked ? '已锁定' : '采样'}</span><time>{timeLabel(sample.timestamp)}</time></header>
          {series.slice(0, 4).map((line, i) => <div key={line.id}><i style={{ background: line.tone }} /><span>{line.name}</span><b>{numberLabel(rawValues[i]?.[index] ?? null)}</b></div>)}
          {difference && <footer>A − B <b>{numberLabel(values[0]?.[index] ?? null, true)}</b></footer>}
          {series.length > 4 && <footer>其余 {series.length - 4} 位见右侧快照</footer>}
        </div>}
      </div>
      <div className="tl-x-axis" aria-hidden="true">{Array.from({ length: tickCount }, (_, i) => <span key={i} style={{ left: `${i * 100 / (tickCount - 1)}%` }}>{timeLabel(first + (last - first) * i / (tickCount - 1))}</span>)}</div>
    </div>
    <div className="tl-event-rail" aria-label="关键事件轨道">
      <span>事件</span><div>
        {groups.map(group => {
          const representative = group.events.find(event => event.type !== 'CHAMPION_KILL') ?? group.events[0];
          const presentation = eventPresentation(representative, players);
          const bucket = Number(group.key.split('-')[1]);
          return <button key={group.key} type="button" className="tl-event-mark" style={{ left: `${(bucket + 0.5) / bins * 100}%` }}
            title={`${timeLabel(group.timestamp)} · ${presentation.label}${group.events.length > 1 ? ` · 共${group.events.length}条事件` : ''}`}
            aria-label={`${timeLabel(group.timestamp)}，${presentation.label}，${group.events.length}条事件`}
            onMouseEnter={() => onEvent(group)} onFocus={() => onEvent(group)} onClick={() => { onEvent(group); onLock(nearestFrame(frames, group.timestamp)); }}>
            <LeagueArtImage name={presentation.art} />{group.events.length > 1 && <small>{group.events.length}</small>}
          </button>;
        })}
      </div>
    </div>
  </div>;
});
