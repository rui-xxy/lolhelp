import { useId, useMemo, useRef, useState, type MouseEvent } from 'react';
import { timelineTicks } from './eventTimelineModel';
import { buildTime, type LaneDuel as LaneDuelData, type LaneMetric, type LaneSample } from './matchBuildModel';

// 对线：和对位逐分钟比补刀、经济、经验。
// 先给一句结论（对线期结束时谁领先），再列 10 / 15 分钟的差距，最后是一条差值曲线：
// 中线以上是自己领先、以下是对位领先。

const METRICS: Array<{ key: LaneMetric; label: string }> = [
  { key: 'gold', label: '经济' },
  { key: 'cs', label: '补刀' },
  { key: 'xp', label: '经验' },
];

const ROWS: Array<{ key: keyof Omit<LaneSample, 't'>; label: string }> = [
  { key: 'cs', label: '补刀' },
  { key: 'gold', label: '经济' },
  { key: 'xp', label: '经验' },
  { key: 'level', label: '等级' },
];

const VIEW_W = 1000;
const VIEW_H = 100;
const MID = VIEW_H / 2;
const AMP = 42;

function compact(value: number): string {
  const abs = Math.abs(value);
  return abs >= 1000 ? `${(abs / 1000).toFixed(abs >= 10_000 ? 0 : 1)}k` : String(Math.round(abs));
}

function signed(value: number): string {
  if (Math.round(value) === 0) return '0';
  return `${value > 0 ? '+' : '−'}${compact(value)}`;
}

function smoothPath(points: Array<[number, number]>): string {
  if (!points.length) return '';
  let path = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    path += ` C ${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(2)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(2)}, ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(2)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return path;
}

export function LaneDuel({ duel, duration, rivalName }: { duel: LaneDuelData; duration: number; rivalName: string }) {
  const [metric, setMetric] = useState<LaneMetric>('gold');
  const [hover, setHover] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const clip = useId().replace(/:/g, '');
  const end = Math.max(60_000, duration, duel.diffs.at(-1)?.t ?? 0);

  const { line, area, scale } = useMemo(() => {
    const max = Math.max(metric === 'gold' ? 500 : metric === 'xp' ? 300 : 5, ...duel.diffs.map((sample) => Math.abs(sample[metric])));
    const points = duel.diffs.map((sample): [number, number] => [sample.t / end * VIEW_W, MID - sample[metric] / max * AMP]);
    const path = smoothPath(points);
    return {
      line: path,
      area: points.length ? `${path} L ${points.at(-1)?.[0].toFixed(2)} ${MID} L ${points[0][0].toFixed(2)} ${MID} Z` : '',
      scale: max,
    };
  }, [duel.diffs, end, metric]);

  const ticks = useMemo(() => timelineTicks(end), [end]);
  const nearest = hover === null ? null : duel.diffs.reduce((best, sample) => (Math.abs(sample.t - hover) < Math.abs(best.t - hover) ? sample : best), duel.diffs[0]);
  const verdict = duel.verdictAt;
  const goldDiff = verdict.mine.gold - verdict.theirs.gold;
  const csDiff = verdict.mine.cs - verdict.theirs.cs;
  const verdictTitle = duel.verdict === 'ahead' ? '对线赢了' : duel.verdict === 'behind' ? '对线吃亏了' : '对线打得差不多';
  const verdictText = duel.verdict === 'even'
    ? `${verdict.minute} 分钟时经济只差 ${compact(goldDiff)}`
    : `${verdict.minute} 分钟时经济${goldDiff > 0 ? '领先' : '落后'} ${compact(goldDiff)}`;
  const csText = csDiff === 0 ? '，补刀一样多' : `，补刀${csDiff > 0 ? '多' : '少'} ${Math.abs(csDiff)} 个`;

  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    setHover(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * end);
  };

  return (
    <div className="ld">
      <p className={`ld-verdict is-${duel.verdict}`}>
        <b>{verdictTitle}</b>
        <span>{verdictText}{csText}</span>
      </p>
      <div className="ld-body">
        {duel.checkpoints.length > 0 && (
          <table className="ld-table">
            <thead>
              <tr>
                <th scope="col"><span className="ld-sr">指标</span></th>
                {duel.checkpoints.map((point) => <th key={point.minute} scope="col">{point.minute} 分钟</th>)}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label}</th>
                  {duel.checkpoints.map((point) => {
                    const diff = point.mine[row.key] - point.theirs[row.key];
                    const tone = Math.round(diff) === 0 ? 'is-even' : diff > 0 ? 'is-ahead' : 'is-behind';
                    return (
                      <td key={point.minute} className={tone} title={`自己 ${Math.round(point.mine[row.key]).toLocaleString('zh-CN')} · ${rivalName} ${Math.round(point.theirs[row.key]).toLocaleString('zh-CN')}`}>
                        <b>{signed(diff)}</b>
                        <small>{compact(point.mine[row.key])} : {compact(point.theirs[row.key])}</small>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="ld-chart">
          <div className="ld-tabs" role="group" aria-label="曲线看哪一项">
            {METRICS.map((item) => (
              <button key={item.key} type="button" aria-pressed={metric === item.key} onClick={() => setMetric(item.key)}>{item.label}差</button>
            ))}
          </div>
          <div
            ref={plotRef}
            className="ld-plot"
            role="img"
            aria-label={`和 ${rivalName} 的${METRICS.find((item) => item.key === metric)?.label}差随时间的变化`}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          >
            <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <clipPath id={`${clip}-up`}><rect x="0" y="0" width={VIEW_W} height={MID} /></clipPath>
                <clipPath id={`${clip}-down`}><rect x="0" y={MID} width={VIEW_W} height={MID} /></clipPath>
              </defs>
              {duel.checkpoints.map((point) => (
                <line key={point.minute} className="ld-mark" x1={point.mine.t / end * VIEW_W} x2={point.mine.t / end * VIEW_W} y1="0" y2={VIEW_H} />
              ))}
              <line className="ld-zero" x1="0" x2={VIEW_W} y1={MID} y2={MID} />
              <path className="ld-area is-ahead" d={area} clipPath={`url(#${clip}-up)`} />
              <path className="ld-area is-behind" d={area} clipPath={`url(#${clip}-down)`} />
              <path className="ld-line is-ahead" d={line} clipPath={`url(#${clip}-up)`} />
              <path className="ld-line is-behind" d={line} clipPath={`url(#${clip}-down)`} />
            </svg>
            <span className="ld-label is-ahead">自己领先 <b>{compact(scale)}</b></span>
            <span className="ld-label is-behind">对位领先</span>
            {nearest && hover !== null && (
              <span className="ld-cursor" style={{ left: `${nearest.t / end * 100}%` }}>
                <span className={`ld-tip${nearest.t / end > 0.6 ? ' is-left' : ''}`}>
                  <b>{buildTime(nearest.t)}</b>
                  {METRICS.map((item) => (
                    <em key={item.key} className={nearest[item.key] > 0 ? 'is-ahead' : nearest[item.key] < 0 ? 'is-behind' : ''}>
                      {item.label} {signed(nearest[item.key])}
                    </em>
                  ))}
                </span>
              </span>
            )}
          </div>
          <div className="ld-axis" aria-hidden="true">
            {ticks.map((tick, index) => (
              <span key={tick} style={{ left: `${tick / end * 100}%` }} className={index === 0 ? 'is-first' : index === ticks.length - 1 ? 'is-last' : undefined}>
                {buildTime(tick)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
