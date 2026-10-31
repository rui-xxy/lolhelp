import { useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { PlayerMatchDetail } from '../../../shared/api';

export function getHistoryDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getHistoryDayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const deltaDays = Math.round((todayStart.getTime() - targetStart.getTime()) / 86_400_000);

  if (deltaDays === 0) return '今天';
  if (deltaDays === 1) return '昨天';
  if (date.getFullYear() === today.getFullYear()) return `${month}月${day}日`;
  return `${year}/${month}/${day}`;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

interface MonthActivityNavigatorProps {
  matches: PlayerMatchDetail[];
  activeDayKey: string | null;
  hasMore: boolean;
  loading: boolean;
  scrollProgress: number;
  onDaySelect: (dayKey: string) => void;
  onDayPreview?: (dayKey: string) => void;
}

interface DayActivity {
  key: string;
  day: number;
  count: number;
  wins: number;
  losses: number;
  unknown: boolean;
  future: boolean;
}

function getMonthKey(dayKey: string): string {
  return dayKey.slice(0, 7);
}

function buildMonthDays(
  monthKey: string,
  matches: PlayerMatchDetail[],
  hasMore: boolean,
): DayActivity[] {
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayKey = getHistoryDayKey(Date.now());
  const oldestLoadedDayKey = matches.length > 0
    ? getHistoryDayKey(matches[matches.length - 1].gameCreation)
    : todayKey;

  const summaries = new Map<string, { count: number; wins: number; losses: number }>();
  for (const match of matches) {
    const key = getHistoryDayKey(match.gameCreation);
    const current = summaries.get(key) ?? { count: 0, wins: 0, losses: 0 };
    current.count += 1;
    if (match.win) current.wins += 1;
    else current.losses += 1;
    summaries.set(key, current);
  }

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const key = `${monthKey}-${String(day).padStart(2, '0')}`;
    const summary = summaries.get(key) ?? { count: 0, wins: 0, losses: 0 };
    return {
      key,
      day,
      ...summary,
      unknown: hasMore && key < oldestLoadedDayKey,
      future: key > todayKey,
    };
  });
}

// 月历波形的坐标：每天占 10 个单位宽，基线在 y=30，最高的一天顶到 y=6
const WAVE_DAY = 10;
const WAVE_BASE = 30;
const WAVE_PEAK = 24;

interface WavePoint {
  x: number;
  y: number;
}

// 单调三次插值（Fritsch–Carlson）：曲线平滑，但不会在两点之间冲过头、跑到基线下面
function buildSmoothPath(points: WavePoint[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  const n = points.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1].x - points[i].x;
    slope[i] = (points[i + 1].y - points[i].y) / dx[i];
  }
  const tangent: number[] = new Array(n);
  tangent[0] = slope[0];
  tangent[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tangent[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tangent[i] = t * a * slope[i];
      tangent[i + 1] = t * b * slope[i];
    }
  }
  let path = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const c1x = p0.x + dx[i] / 3;
    const c1y = p0.y + (tangent[i] * dx[i]) / 3;
    const c2x = p1.x - dx[i] / 3;
    const c2y = p1.y - (tangent[i + 1] * dx[i]) / 3;
    path += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p1.x.toFixed(2)},${p1.y.toFixed(2)}`;
  }
  return path;
}

export function MonthActivityNavigator({
  matches,
  activeDayKey,
  hasMore,
  loading,
  scrollProgress,
  onDaySelect,
  onDayPreview,
}: MonthActivityNavigatorProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragStartXRef = useRef<number | null>(null);
  const dragMovedRef = useRef(false);
  const lastPreviewKeyRef = useRef<string | null>(null);
  const [dragPreviewKey, setDragPreviewKey] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const waveId = useId().replace(/:/g, '');
  if (matches.length === 0) return null;

  const fallbackDayKey = getHistoryDayKey(matches[0].gameCreation);
  const resolvedDayKey = activeDayKey ?? fallbackDayKey;
  const monthKey = getMonthKey(resolvedDayKey);
  const monthDays = buildMonthDays(monthKey, matches, hasMore);
  const monthMatches = matches.filter((match) => getMonthKey(getHistoryDayKey(match.gameCreation)) === monthKey);
  const maxCount = Math.max(1, ...monthDays.map((day) => day.count));
  const [year, month] = monthKey.split('-').map(Number);
  const monthTotal = monthMatches.length;
  const progress = Math.max(0, Math.min(1, scrollProgress));
  const loadedIndexes = monthDays
    .map((day, index) => (day.count > 0 ? index : -1))
    .filter((index) => index >= 0);
  const visualDayKey =
    dragPreviewKey && getMonthKey(dragPreviewKey) === monthKey ? dragPreviewKey : resolvedDayKey;
  const activeIndex = Math.max(0, monthDays.findIndex((day) => day.key === visualDayKey));
  const dayCount = monthDays.length;
  const activeDay = monthDays[activeIndex]?.day ?? 1;
  const weekday = WEEKDAYS[new Date(year, month - 1, activeDay).getDay()];
  const tickDays = new Set([1, 8, 15, 22, dayCount]);
  const visualDay = monthDays[activeIndex];
  const monthWins = monthMatches.filter((match) => match.win).length;
  const monthWinRate = monthTotal > 0 ? Math.round((monthWins / monthTotal) * 100) : 0;

  // 波形只画「已知」的日子：从最早加载到的那天（或月初）到今天（或月末）
  const knownIndexes = monthDays
    .map((day, index) => (!day.unknown && !day.future ? index : -1))
    .filter((index) => index >= 0);
  const firstKnown = knownIndexes.length > 0 ? knownIndexes[0] : -1;
  const lastKnown = knownIndexes.length > 0 ? knownIndexes[knownIndexes.length - 1] : -1;
  const wavePoints: WavePoint[] = firstKnown < 0
    ? []
    : monthDays.slice(firstKnown, lastKnown + 1).map((day, offset) => ({
        x: (firstKnown + offset) * WAVE_DAY + WAVE_DAY / 2,
        y: WAVE_BASE - (day.count / maxCount) * WAVE_PEAK,
      }));
  const wavePath = buildSmoothPath(wavePoints);
  const waveArea = wavePoints.length > 1
    ? `${wavePath} L${wavePoints[wavePoints.length - 1].x},${WAVE_BASE} L${wavePoints[0].x},${WAVE_BASE} Z`
    : '';
  const waveWidth = dayCount * WAVE_DAY;
  // 颜色沿着日期走：那天赢得多偏蓝、输得多偏红；没打的日子回到中性的淡灰，曲线贴着基线时几乎看不见
  const colorStops = firstKnown < 0
    ? []
    : monthDays.slice(firstKnown, lastKnown + 1).map((day, offset) => ({
        offset: (((firstKnown + offset) * WAVE_DAY + WAVE_DAY / 2) / waveWidth) * 100,
        color: day.count > 0
          ? `color-mix(in srgb, var(--color-ally) ${Math.round((day.wins / day.count) * 100)}%, var(--color-enemy))`
          : 'color-mix(in srgb, var(--color-text-1) 18%, transparent)',
      }));
  const cursorX = activeIndex * WAVE_DAY + WAVE_DAY / 2;

  const resolveNearestLoadedDay = (clientX: number): DayActivity | null => {
    const stage = stageRef.current;
    if (!stage || loadedIndexes.length === 0) return null;

    const rect = stage.getBoundingClientRect();
    const left = rect.left + 4;
    const width = Math.max(1, rect.width - 8);
    const ratio = Math.max(0, Math.min(0.999999, (clientX - left) / width));
    const rawIndex = Math.max(0, Math.min(dayCount - 1, Math.floor(ratio * dayCount)));

    let nearestIndex = loadedIndexes[0];
    let nearestDistance = Math.abs(nearestIndex - rawIndex);
    for (const loadedIndex of loadedIndexes) {
      const distance = Math.abs(loadedIndex - rawIndex);
      if (distance < nearestDistance) {
        nearestIndex = loadedIndex;
        nearestDistance = distance;
      }
    }

    return monthDays[nearestIndex] ?? null;
  };

  const previewPointerDay = (clientX: number) => {
    const day = resolveNearestLoadedDay(clientX);
    if (!day) return null;
    setDragPreviewKey((current) => (current === day.key ? current : day.key));
    if (lastPreviewKeyRef.current !== day.key) {
      lastPreviewKeyRef.current = day.key;
      onDayPreview?.(day.key);
    }
    return day;
  };

  const handleStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragStartXRef.current = event.clientX;
    dragMovedRef.current = false;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    previewPointerDay(event.clientX);
  };

  const handleStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    if (dragStartXRef.current !== null && Math.abs(event.clientX - dragStartXRef.current) > 3) {
      dragMovedRef.current = true;
    }
    previewPointerDay(event.clientX);
  };

  const finishStageDrag = (event: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    if (!isDragging) return;
    const snappedDay = resolveNearestLoadedDay(event.clientX);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
    setDragPreviewKey(null);
    dragStartXRef.current = null;
    lastPreviewKeyRef.current = null;
    if (commit && snappedDay) {
      onDaySelect(snappedDay.key);
    }
  };

  return (
    <div className="match-calendar-scrubber" data-dragging={isDragging ? 'true' : undefined}>
      <div className="match-calendar-head">
        {/* 左：列表正在看的那一天（日期、星期、当天胜负）；右：这个月的总览 */}
        <span className="match-calendar-current" key={visualDayKey}>
          <strong>{activeDay}<small>日</small></strong>
          <em>{weekday}</em>
          {visualDay && visualDay.count > 0 && (
            <span className="match-calendar-current__record">
              <b data-result="win" data-zero={visualDay.wins === 0 ? 'true' : undefined}>{visualDay.wins}胜</b>
              <b data-result="loss" data-zero={visualDay.losses === 0 ? 'true' : undefined}>{visualDay.losses}负</b>
            </span>
          )}
        </span>

        <span className="match-calendar-meta" title={`已浏览已加载战绩的 ${Math.round(progress * 100)}%`}>
          <span className="match-calendar-month">
            {year !== new Date().getFullYear() && <em>{year}</em>}
            <strong>{month}<small>月</small></strong>
          </span>
          {loading ? (
            <i className="match-calendar-meta__sync">同步中</i>
          ) : (
            <>
              <i aria-hidden="true" />
              <strong>{monthTotal}</strong>
              <em>局</em>
              {monthTotal > 0 && (
                <>
                  <i aria-hidden="true" />
                  <strong>{monthWinRate}%</strong>
                  <em>胜</em>
                </>
              )}
            </>
          )}
        </span>
      </div>

      <div
        ref={stageRef}
        className={`match-calendar-stage ${isDragging ? 'match-calendar-stage--dragging' : ''}`}
        role="list"
        aria-label={`${year}年${month}月对局历史，可左右拖动定位日期`}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={(event) => finishStageDrag(event, true)}
        onPointerCancel={(event) => finishStageDrag(event, false)}
      >
        {/* 一条平滑的活动曲线：高低 = 当天局数，颜色 = 当天胜负；正在看的那天有一道竖向的光 */}
        <svg
          className="match-calendar-wave"
          viewBox={`0 0 ${waveWidth} ${WAVE_BASE + 2}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={`${waveId}-hue`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={waveWidth} y2="0">
              {colorStops.length === 0 ? (
                <stop offset="0%" style={{ stopColor: 'var(--color-text-3)' }} />
              ) : (
                colorStops.map((stop) => (
                  <stop key={stop.offset} offset={`${stop.offset}%`} style={{ stopColor: stop.color }} />
                ))
              )}
            </linearGradient>
            <linearGradient id={`${waveId}-fade`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="white" stopOpacity="0.55" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
            <mask id={`${waveId}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width={waveWidth} height={WAVE_BASE + 2}>
              <rect x="0" y="0" width={waveWidth} height={WAVE_BASE} fill={`url(#${waveId}-fade)`} />
            </mask>
            <linearGradient id={`${waveId}-beam`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={WAVE_BASE}>
              <stop offset="0%" style={{ stopColor: 'var(--color-glow)', stopOpacity: 0 }} />
              <stop offset="100%" style={{ stopColor: 'var(--color-glow)', stopOpacity: 0.9 }} />
            </linearGradient>
            <clipPath id={`${waveId}-focus`}>
              <rect x={cursorX - WAVE_DAY * 1.5} y="0" width={WAVE_DAY * 3} height={WAVE_BASE + 2} />
            </clipPath>
          </defs>

          <line className="match-calendar-wave__base" x1="0" y1={WAVE_BASE} x2={waveWidth} y2={WAVE_BASE} vectorEffect="non-scaling-stroke" />
          {lastKnown >= 0 && (
            <line
              className="match-calendar-wave__known"
              x1={firstKnown * WAVE_DAY}
              y1={WAVE_BASE}
              x2={(lastKnown + 1) * WAVE_DAY}
              y2={WAVE_BASE}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {waveArea && (
            <path d={waveArea} fill={`url(#${waveId}-hue)`} mask={`url(#${waveId}-mask)`} className="match-calendar-wave__area" />
          )}
          {wavePath && (
            <path d={wavePath} stroke={`url(#${waveId}-hue)`} className="match-calendar-wave__line" vectorEffect="non-scaling-stroke" />
          )}
          {wavePath && (
            <path
              d={wavePath}
              stroke={`url(#${waveId}-hue)`}
              clipPath={`url(#${waveId}-focus)`}
              className="match-calendar-wave__line match-calendar-wave__line--focus"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {/* 正在看的那天：一根从基线往上淡出的细光 */}
          <line
            className="match-calendar-wave__cursor"
            x1={cursorX}
            y1="0"
            x2={cursorX}
            y2={WAVE_BASE}
            stroke={`url(#${waveId}-beam)`}
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div className="match-calendar-days">
          {monthDays.map((day) => {
            const isActive = day.key === visualDayKey;
            const canJump = day.count > 0;
            const state = day.future ? 'future' : day.count > 0 ? 'played' : day.unknown ? 'unknown' : 'empty';

            return (
              <button
                key={day.key}
                type="button"
                role="listitem"
                data-state={state}
                aria-label={
                  day.unknown
                    ? `${month}月${day.day}日，尚未加载`
                    : `${month}月${day.day}日，${day.count}局，${day.wins}胜${day.losses}负`
                }
                aria-disabled={!canJump}
                onClick={() => {
                  if (dragMovedRef.current) {
                    dragMovedRef.current = false;
                    return;
                  }
                  if (canJump) onDaySelect(day.key);
                }}
                className={`match-calendar-day ${isActive ? 'match-calendar-day--active' : ''}`}
              >
                {(isActive || (tickDays.has(day.day) && Math.abs(day.day - activeDay) > 2)) && (
                  <span className="match-calendar-day__index">{String(day.day).padStart(2, '0')}</span>
                )}
                <span className="match-calendar-day__tooltip" aria-hidden="true">
                  <strong>{month}月{day.day}日 {WEEKDAYS[new Date(year, month - 1, day.day).getDay()]}</strong>
                  <em>
                    {day.unknown
                      ? '尚未加载'
                      : day.future
                        ? '还没到'
                        : day.count > 0
                          ? `${day.count} 局 · ${day.wins}胜 ${day.losses}负`
                          : '没有对局'}
                  </em>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
