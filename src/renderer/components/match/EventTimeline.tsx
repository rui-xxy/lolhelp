import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { nearestTimelinePoint, timelineBins, timelineTicks, timelineTime, type TimelineLane, type TimelinePoint } from './eventTimelineModel';

interface EventTimelineProps {
  points: TimelinePoint[];
  duration: number;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  renderPreview?: (point: TimelinePoint) => ReactNode;
}
const LANES: Array<{ key: TimelineLane; label: string }> = [
  { key: 'blue', label: '蓝方' }, { key: 'red', label: '红方' }, { key: 'objective', label: '资源' },
];

const DensityLanes = memo(function DensityLanes({ points, duration }: { points: TimelinePoint[]; duration: number }) {
  const bins = useMemo(() => timelineBins(points, duration), [points, duration]);
  const maximum = Math.max(1, ...bins.flatMap(bin => [bin.blue, bin.red, bin.objective]));
  return <>{LANES.map(lane => <div className={`md-timeline__lane is-${lane.key}`} key={lane.key} aria-hidden="true">
    {bins.map((bin, index) => <span className="md-timeline__bin" key={index}><i style={{ height: bin[lane.key] ? `${Math.max(18, bin[lane.key] / maximum * 100)}%` : '0' }} /></span>)}
  </div>)}</>;
});

export function EventTimeline({ points, duration, selectedKey, onSelect, renderPreview }: EventTimelineProps) {
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const hovering = useRef(false);
  const drag = useRef<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const frame = useRef<number | null>(null);
  const sample = useRef<{ x: number; y: number } | null>(null);
  const previewKeyRef = useRef<string | null>(null);
  const sorted = useMemo(() => [...points].sort((a, b) => a.event.timestamp - b.event.timestamp), [points]);
  const ticks = useMemo(() => timelineTicks(duration), [duration]);
  const byLane = useMemo(() => Object.fromEntries(LANES.map(lane => [lane.key, sorted.filter(point => point.lane === lane.key)])) as Record<TimelineLane, TimelinePoint[]>, [sorted]);
  const selected = sorted.find((point) => point.key === selectedKey);
  const preview = sorted.find((point) => point.key === previewKey);
  const active = preview ?? selected ?? sorted[0];
  const index = active ? sorted.findIndex((point) => point.key === active.key) : -1;
  const end = Math.max(1, duration);
  const cancelFrame = () => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; };
  const paintCursor = (x: number, visible: boolean) => {
    if (!cursorRef.current) return;
    cursorRef.current.style.transform = `translate3d(${x}px, 0, 0)`;
    cursorRef.current.style.opacity = visible ? '1' : '0';
  };
  const restoreSelection = () => {
    const width = plotRef.current?.getBoundingClientRect().width ?? 0;
    paintCursor(Math.max(0, Math.min(1, (selected?.event.timestamp ?? 0) / end)) * width, Boolean(selected));
  };
  const stopHover = () => {
    cancelFrame(); hovering.current = false; sample.current = null;
    previewKeyRef.current = null; setPreviewKey(null); restoreSelection();
  };
  const paintSample = (): TimelinePoint | undefined => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || !sample.current || !sorted.length) return;
    const x = Math.max(0, Math.min(rect.width, sample.current.x - rect.left));
    const lane = LANES[Math.max(0, Math.min(2, Math.floor((sample.current.y - rect.top) / (rect.height / 3))))].key;
    const point = nearestTimelinePoint(byLane[lane].length ? byLane[lane] : sorted, x / Math.max(1, rect.width) * end);
    // Cursor follows exact pointer pixels, not the nearest event timestamp.
    paintCursor(x, true);
    const key = point?.key ?? null;
    if (key !== previewKeyRef.current) { previewKeyRef.current = key; setPreviewKey(key); }
    return point;
  };
  const seek = (event: PointerEvent<HTMLDivElement>) => {
    if (!sorted.length || (drag.current !== null && drag.current !== event.pointerId)) return;
    sample.current = { x: event.clientX, y: event.clientY }; hovering.current = true;
    if (frame.current === null) frame.current = requestAnimationFrame(() => { frame.current = null; paintSample(); });
  };
  const choose = (point?: TimelinePoint) => { if (point) onSelect(point.key); };
  const step = (point?: TimelinePoint) => { stopHover(); choose(point); };
  useEffect(() => { stopHover(); drag.current = null; return cancelFrame; }, [points]);
  useLayoutEffect(() => { if (!hovering.current) restoreSelection(); }, [selectedKey, end, points]);
  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    const observer = new ResizeObserver(() => { if (hovering.current) paintSample(); else restoreSelection(); });
    observer.observe(plot);
    return () => observer.disconnect();
  }, [sorted, selectedKey, end]);

  return (
    <div className="md-timeline" aria-label="对局事件时间导航">
      <div className="md-timeline__axis" aria-hidden="true">
        {ticks.map((time, i) => <span key={time} className={i === 0 ? 'is-first' : i === ticks.length - 1 ? 'is-last' : ''} style={{ left: `${time / end * 100}%` }}>{timelineTime(time)}</span>)}
      </div>
      <div className="md-timeline__body">
        <div className="md-timeline__labels" aria-hidden="true">{LANES.map((lane) => <span className={`is-${lane.key}`} key={lane.key}>{lane.label}</span>)}</div>
        <div ref={plotRef} className="md-timeline__plot" role="slider" tabIndex={0}
          aria-label="定位对局事件" aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={Math.ceil(end / 1000)}
          aria-valuenow={Math.floor((active?.event.timestamp ?? 0) / 1000)}
          aria-valuetext={active ? `${timelineTime(active.event.timestamp)}，${active.label}` : '当前筛选没有事件'} aria-disabled={!sorted.length}
          onPointerEnter={seek} onPointerMove={seek}
          onPointerLeave={() => { if (drag.current === null) stopHover(); }}
          onPointerDown={(event) => { if (event.button !== 0 || !sorted.length) return; drag.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus({ preventScroll: true }); seek(event); }}
          onPointerUp={(event) => {
            if (drag.current !== event.pointerId) return;
            sample.current = { x: event.clientX, y: event.clientY }; cancelFrame();
            const point = paintSample(); drag.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            choose(point);
          }}
          onPointerCancel={() => { drag.current = null; stopHover(); }}
          onKeyDown={(event) => {
            const offsets: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: 5, PageUp: -5 };
            if (event.key in offsets) { event.preventDefault(); step(sorted[Math.max(0, Math.min(sorted.length - 1, index + offsets[event.key]))]); }
            else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); step(event.key === 'Home' ? sorted[0] : sorted.at(-1)); }
            else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); step(active); }
          }}>
          <div className="md-timeline__grid" aria-hidden="true">{ticks.map((time) => <i key={time} style={{ left: `${time / end * 100}%` }} />)}</div>
          <DensityLanes points={sorted} duration={end} />
          <span ref={cursorRef} className="md-timeline__cursor" aria-hidden="true"><i /></span>
          {!sorted.length && <span className="md-timeline__empty">无匹配事件</span>}
        </div>
      </div>
      <div className="md-timeline__footer">
        <div className="md-timeline__preview" aria-live="off"><time>{active ? timelineTime(active.event.timestamp) : '—'}</time>{active ? (renderPreview?.(active) ?? <span title={active.label}>{active.label}</span>) : <span>无匹配事件</span>}</div>
        <div className="md-timeline__steps">
          <button type="button" aria-label="上一个事件" title="上一个事件" disabled={index <= 0} onClick={() => step(sorted[index - 1])}><ChevronLeft aria-hidden="true" /></button>
          <button type="button" aria-label="下一个事件" title="下一个事件" disabled={index < 0 || index >= sorted.length - 1} onClick={() => step(sorted[index + 1])}><ChevronRight aria-hidden="true" /></button>
        </div>
      </div>
    </div>
  );
}
