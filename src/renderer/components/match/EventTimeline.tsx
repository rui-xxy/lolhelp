import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { nearestTimelinePoint, timelineBins, timelineTicks, timelineTime, type TimelineLane, type TimelinePoint } from './eventTimelineModel';

interface EventTimelineProps {
  points: TimelinePoint[];
  duration: number;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}
const LANES: Array<{ key: TimelineLane; label: string }> = [
  { key: 'blue', label: '蓝方' }, { key: 'red', label: '红方' }, { key: 'objective', label: '资源' },
];

export function EventTimeline({ points, duration, selectedKey, onSelect }: EventTimelineProps) {
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [hovering, setHovering] = useState(false);
  const drag = useRef<number | null>(null);
  const sorted = useMemo(() => [...points].sort((a, b) => a.event.timestamp - b.event.timestamp), [points]);
  const bins = useMemo(() => timelineBins(sorted, duration), [sorted, duration]);
  const ticks = useMemo(() => timelineTicks(duration), [duration]);
  const maximum = Math.max(1, ...bins.flatMap((bin) => [bin.blue, bin.red, bin.objective]));
  const selected = sorted.find((point) => point.key === selectedKey);
  const preview = sorted.find((point) => point.key === previewKey);
  const active = (hovering ? preview : selected) ?? preview ?? selected ?? sorted[0];
  const index = active ? sorted.findIndex((point) => point.key === active.key) : -1;
  const end = Math.max(1, duration);
  const percent = active ? Math.max(0, Math.min(100, active.event.timestamp / end * 100)) : 0;

  useEffect(() => { setPreviewKey(null); setHovering(false); }, [points]);
  const choose = (point?: TimelinePoint) => {
    if (!point) return;
    setPreviewKey(point.key);
    onSelect(point.key);
  };
  const seek = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const time = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))) * end;
    const lane = LANES[Math.max(0, Math.min(2, Math.floor((event.clientY - rect.top) / (rect.height / 3))))].key;
    const point = nearestTimelinePoint(sorted, time, lane);
    setPreviewKey(point?.key ?? null);
    setHovering(true);
    return point;
  };

  return (
    <div className="md-timeline" aria-label="对局事件时间导航">
      <div className="md-timeline__axis" aria-hidden="true">
        {ticks.map((time, i) => <span key={time} className={i === 0 ? 'is-first' : i === ticks.length - 1 ? 'is-last' : ''} style={{ left: `${time / end * 100}%` }}>{timelineTime(time)}</span>)}
      </div>
      <div className="md-timeline__body">
        <div className="md-timeline__labels" aria-hidden="true">{LANES.map((lane) => <span className={`is-${lane.key}`} key={lane.key}>{lane.label}</span>)}</div>
        <div className="md-timeline__plot" role="slider" tabIndex={0}
          aria-label="定位对局事件" aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={Math.ceil(end / 1000)}
          aria-valuenow={Math.floor((active?.event.timestamp ?? 0) / 1000)}
          aria-valuetext={active ? `${timelineTime(active.event.timestamp)}，${active.label}` : '当前筛选没有事件'} aria-disabled={!sorted.length}
          onPointerMove={seek}
          onPointerLeave={() => { if (drag.current === null) setHovering(false); }}
          onPointerDown={(event) => { if (event.button !== 0 || !sorted.length) return; drag.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus({ preventScroll: true }); seek(event); }}
          onPointerUp={(event) => { if (drag.current !== event.pointerId) return; const point = seek(event); drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); choose(point); }}
          onPointerCancel={() => { drag.current = null; setHovering(false); }}
          onKeyDown={(event) => {
            const offsets: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: 5, PageUp: -5 };
            if (event.key in offsets) { event.preventDefault(); setHovering(false); choose(sorted[Math.max(0, Math.min(sorted.length - 1, index + offsets[event.key]))]); }
            else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); choose(event.key === 'Home' ? sorted[0] : sorted.at(-1)); }
            else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active); }
          }}>
          <div className="md-timeline__grid" aria-hidden="true">{ticks.map((time) => <i key={time} style={{ left: `${time / end * 100}%` }} />)}</div>
          {LANES.map((lane) => <div className={`md-timeline__lane is-${lane.key}`} key={lane.key} aria-hidden="true">
            {bins.map((bin, i) => <span className="md-timeline__bin" key={i}><i style={{ height: bin[lane.key] ? `${Math.max(18, bin[lane.key] / maximum * 100)}%` : '0' }} /></span>)}
          </div>)}
          {(selected || hovering || preview) && active && <span className={`md-timeline__cursor is-${active.lane}`} aria-hidden="true" style={{ left: `${percent}%` }}><i /></span>}
          {!sorted.length && <span className="md-timeline__empty">无匹配事件</span>}
        </div>
      </div>
      <div className="md-timeline__footer">
        <div className="md-timeline__preview" aria-live="off"><time>{active ? timelineTime(active.event.timestamp) : '—'}</time><span title={active?.label}>{active?.label ?? '无匹配事件'}</span></div>
        <div className="md-timeline__steps">
          <button type="button" aria-label="上一个事件" title="上一个事件" disabled={index <= 0} onClick={() => { setHovering(false); choose(sorted[index - 1]); }}><ChevronLeft aria-hidden="true" /></button>
          <button type="button" aria-label="下一个事件" title="下一个事件" disabled={index < 0 || index >= sorted.length - 1} onClick={() => { setHovering(false); choose(sorted[index + 1]); }}><ChevronRight aria-hidden="true" /></button>
        </div>
      </div>
    </div>
  );
}
