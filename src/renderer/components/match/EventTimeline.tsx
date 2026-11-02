import { useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { ObjectiveIcon } from './RiftMap';
import { timelineTicks } from './eventTimelineModel';
import {
  buildingName,
  compactGold,
  goldAt,
  objectiveLabel,
  sideName,
  storyTime,
  type GoldPoint,
  type StoryMoment,
} from './matchStoryModel';

// 「局势」图，三条轨道从上到下：
// 经济差 —— 曲线在中线以上是蓝方领先、以下是红方领先；曲线上的圆点是一次交战，
//           颜色是赢的那一方，越大死的人越多，带金边的是当前视角的人参与了的；
// 资源   —— 小龙、男爵、先锋、巢虫，图标颜色是拿到的一方；
// 推塔   —— 每座被推掉的塔一个小竖条，颜色是推掉它的一方（菱形是召唤水晶）。
// 鼠标在曲线上扫过去能看到那一刻的经济差和发生了什么，点一下下面的故事就跳到那里。

interface Props {
  duration: number;
  gold: GoldPoint[];
  moments: StoryMoment[];
  selectedMomentId: string | null;
  pinnedTime: number | null;
  focusId: number;
  focusName: string;
  onSelect: (momentId: string, eventKey?: string) => void;
}

const VIEW_W = 1000;
const VIEW_H = 100;
const MID = VIEW_H / 2;
const AMP = 40;

const PHASES = [
  { label: '对线期', from: 0, to: 14 * 60_000 },
  { label: '中期', from: 14 * 60_000, to: 25 * 60_000 },
  { label: '后期', from: 25 * 60_000, to: Number.POSITIVE_INFINITY },
];

function smoothPath(points: Array<[number, number]>): string {
  if (points.length === 0) return '';
  let path = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    path += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return path;
}

function bubbleSize(kills: number): number {
  if (kills >= 7) return 18;
  if (kills >= 5) return 15;
  if (kills >= 3) return 12;
  return 8;
}

export function EventTimeline({ duration, gold, moments, selectedMomentId, pinnedTime, focusId, focusName, onSelect }: Props) {
  const gradientId = useId().replace(/:/g, '');
  const plotRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ ratio: number; moment: StoryMoment | null } | null>(null);
  const end = Math.max(1, duration);
  const pct = (time: number) => `${Math.max(0, Math.min(100, time / end * 100))}%`;

  const scale = useMemo(() => Math.max(1000, ...gold.map((point) => Math.abs(point.diff))), [gold]);
  const peaks = useMemo(() => ({
    blue: Math.max(0, ...gold.map((point) => point.diff)),
    red: Math.max(0, ...gold.map((point) => -point.diff)),
  }), [gold]);
  const yOf = (diff: number) => MID - diff / scale * AMP;
  const curve = useMemo(() => {
    if (gold.length < 2) return null;
    const points = gold.map((point): [number, number] => [point.t / end * VIEW_W, MID - point.diff / scale * AMP]);
    const line = smoothPath(points);
    const area = `${line} L ${points.at(-1)?.[0].toFixed(2)} ${MID} L ${points[0][0].toFixed(2)} ${MID} Z`;
    return { line, area };
  }, [end, gold, scale]);

  const ticks = useMemo(() => timelineTicks(end), [end]);
  const phases = PHASES.filter((phase) => phase.from < end).map((phase) => ({ ...phase, to: Math.min(phase.to, end) }));
  const fights = moments.filter((moment) => moment.type === 'teamfight' || moment.type === 'skirmish');
  const landmarks = moments.flatMap((moment) => moment.events.filter((item) => item.kind === 'objective').map((item) => ({ item, moment })));
  const buildings = moments.flatMap((moment) => moment.events.filter((item) => item.kind === 'building').map((item) => ({ item, moment })));
  const selected = moments.find((moment) => moment.id === selectedMomentId) ?? null;

  const nearest = (time: number): StoryMoment | null => {
    const tolerance = Math.max(20_000, end * 0.018);
    let best: StoryMoment | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    moments.forEach((moment) => {
      const distance = time < moment.start ? moment.start - time : time > moment.end ? time - moment.end : 0;
      if (distance < bestDistance) {
        best = moment;
        bestDistance = distance;
      }
    });
    return bestDistance <= tolerance ? best : null;
  };

  const locate = (event: MouseEvent<HTMLDivElement>) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    return { ratio, moment: nearest(ratio * end) };
  };

  const hoverDiff = hover ? goldAt(gold, hover.ratio * end) : null;
  const fightTop = (moment: StoryMoment) => {
    const diff = gold.length ? goldAt(gold, (moment.start + moment.end) / 2) ?? 0 : 0;
    return `${yOf(diff) / VIEW_H * 100}%`;
  };

  return (
    <div className="mo">
      <div className="mo-legend" aria-hidden="true">
        <span><i className="is-blue" />蓝方赢的交战</span>
        <span><i className="is-red" />红方赢的交战</span>
        <span title="圆越大，这一波死的人越多"><i className="is-small" /><i className="is-big" />越大死得越多</span>
        {focusName && <span><i className="is-focus" />{focusName} 参与</span>}
      </div>

      <div className="mo-grid">
        <span className="mo-gutter">经济差</span>
        <div
          ref={plotRef}
          className={`mo-plot${hover?.moment ? ' is-pointing' : ''}`}
          role="img"
          aria-label={gold.length ? '两队经济差曲线和每一波交战' : '每一波交战的时间分布'}
          onMouseMove={(event) => setHover(locate(event))}
          onMouseLeave={() => setHover(null)}
          onClick={(event) => {
            const found = locate(event)?.moment;
            if (found) onSelect(found.id);
          }}
        >
          <svg className="mo-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id={`${gradientId}-blue`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" className="mo-stop is-blue" stopOpacity="0.5" />
                <stop offset="50%" className="mo-stop is-blue" stopOpacity="0.04" />
              </linearGradient>
              <linearGradient id={`${gradientId}-red`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="50%" className="mo-stop is-red" stopOpacity="0.04" />
                <stop offset="100%" className="mo-stop is-red" stopOpacity="0.5" />
              </linearGradient>
              <clipPath id={`${gradientId}-up`}><rect x="0" y="0" width={VIEW_W} height={MID} /></clipPath>
              <clipPath id={`${gradientId}-down`}><rect x="0" y={MID} width={VIEW_W} height={MID} /></clipPath>
            </defs>
            {phases.slice(1).map((phase) => (
              <line key={phase.label} className="mo-phase-line" x1={phase.from / end * VIEW_W} x2={phase.from / end * VIEW_W} y1="0" y2={VIEW_H} />
            ))}
            <line className="mo-zero" x1="0" x2={VIEW_W} y1={MID} y2={MID} />
            {selected && (
              <rect className="mo-selected-band" x={selected.start / end * VIEW_W - 3} y="0" width={Math.max(6, (selected.end - selected.start) / end * VIEW_W + 6)} height={VIEW_H} />
            )}
            {curve && (
              <>
                <path d={curve.area} fill={`url(#${gradientId}-blue)`} clipPath={`url(#${gradientId}-up)`} />
                <path d={curve.area} fill={`url(#${gradientId}-red)`} clipPath={`url(#${gradientId}-down)`} />
                <path className="mo-line is-blue" d={curve.line} clipPath={`url(#${gradientId}-up)`} />
                <path className="mo-line is-red" d={curve.line} clipPath={`url(#${gradientId}-down)`} />
              </>
            )}
          </svg>

          {phases.map((phase) => (
            <span key={phase.label} className="mo-phase" style={{ left: pct(phase.from), width: `${(phase.to - phase.from) / end * 100}%` }}>
              {phase.label}
            </span>
          ))}

          {gold.length > 0 ? (
            <>
              <span className="mo-axis-label is-blue">蓝方领先{peaks.blue >= 500 && <b> 最多 {compactGold(peaks.blue)}</b>}</span>
              <span className="mo-axis-label is-red">红方领先{peaks.red >= 500 && <b> 最多 {compactGold(peaks.red)}</b>}</span>
            </>
          ) : <span className="mo-axis-label is-empty">无经济数据</span>}

          {pinnedTime !== null && (
            <span className="mo-pin" style={{ left: pct(pinnedTime) }}><b>{storyTime(pinnedTime)}</b></span>
          )}

          {fights.map((moment) => {
            const kills = moment.kills.blue + moment.kills.red;
            const size = bubbleSize(kills);
            const involved = moment.events.some((item) => item.involved.includes(focusId));
            return (
              <button
                key={moment.id}
                type="button"
                className={[
                  'mo-fight',
                  `is-${moment.winner}`,
                  involved ? 'is-focus' : '',
                  moment.ace ? 'is-ace' : '',
                  moment.id === selectedMomentId ? 'is-selected' : '',
                  moment.id === hover?.moment?.id ? 'is-hover' : '',
                ].filter(Boolean).join(' ')}
                style={{ left: pct((moment.start + moment.end) / 2), top: fightTop(moment), '--mo-size': `${size}px` } as CSSProperties}
                aria-label={`${storyTime(moment.start)} ${moment.title}，蓝方 ${moment.kills.blue} 杀，红方 ${moment.kills.red} 杀`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(moment.id);
                }}
              />
            );
          })}

          {hover && (
            <span className="mo-cursor" style={{ left: `${hover.ratio * 100}%` }}>
              <span className={`mo-tip${hover.ratio > 0.6 ? ' is-left' : ''}`}>
                <b>{storyTime(hover.ratio * end)}</b>
                {hoverDiff !== null && (
                  Math.abs(hoverDiff) < 300
                    ? <em>两边经济差不多</em>
                    : <em className={hoverDiff > 0 ? 'is-blue' : 'is-red'}>{hoverDiff > 0 ? '蓝方' : '红方'}领先 {compactGold(hoverDiff)} 经济</em>
                )}
                {hover.moment && (
                  <span>
                    {hover.moment.title}
                    {(hover.moment.kills.blue + hover.moment.kills.red) > 0 && <i>（{hover.moment.kills.blue} : {hover.moment.kills.red}）</i>}
                  </span>
                )}
              </span>
            </span>
          )}
        </div>

        <span className="mo-gutter">资源</span>
        <div className="mo-track is-objectives">
          {landmarks.length === 0 && <span className="mo-track__empty">没有人拿史诗野怪</span>}
          {landmarks.map(({ item, moment }) => (
            <button
              key={item.key}
              type="button"
              className={`mo-landmark is-${item.side}${moment.id === selectedMomentId ? ' is-selected' : ''}`}
              style={{ left: pct(item.event.timestamp) }}
              title={`${storyTime(item.event.timestamp)} ${sideName(item.side)}拿下${objectiveLabel(item)}`}
              aria-label={`${storyTime(item.event.timestamp)} ${sideName(item.side)}拿下${objectiveLabel(item)}`}
              onClick={() => onSelect(moment.id, item.key)}
            >
              <ObjectiveIcon event={item.event} side={item.side} />
            </button>
          ))}
        </div>

        <span className="mo-gutter">推塔</span>
        <div className="mo-track is-towers">
          {buildings.length === 0 && <span className="mo-track__empty">没有塔被推掉</span>}
          {buildings.map(({ item, moment }) => {
            const inhibitor = String(item.event.buildingType || '').toUpperCase().includes('INHIBITOR');
            return (
              <button
                key={item.key}
                type="button"
                className={`mo-tower is-${item.side}${inhibitor ? ' is-inhibitor' : ''}${moment.id === selectedMomentId ? ' is-selected' : ''}`}
                style={{ left: pct(item.event.timestamp) }}
                title={`${storyTime(item.event.timestamp)} ${sideName(item.side)}推掉${buildingName(item.event)}`}
                aria-label={`${storyTime(item.event.timestamp)} ${sideName(item.side)}推掉${buildingName(item.event)}`}
                onClick={() => onSelect(moment.id, item.key)}
              />
            );
          })}
        </div>

        <span />
        <div className="mo-axis" aria-hidden="true">
          {ticks.map((tick, index) => (
            <span key={tick} style={{ left: pct(tick) }} className={index === 0 ? 'is-first' : index === ticks.length - 1 ? 'is-last' : undefined}>
              {storyTime(tick)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
