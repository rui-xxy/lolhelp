import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
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
  const latestLoadedIndex = loadedIndexes.length > 0
    ? Math.max(...loadedIndexes)
    : activeIndex;
  const rangeStart = Math.min(activeIndex, latestLoadedIndex);
  const rangeEnd = Math.max(activeIndex, latestLoadedIndex);
  const dayCount = monthDays.length;
  const activeDay = monthDays[activeIndex]?.day ?? 1;
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][
    new Date(year, month - 1, activeDay).getDay()
  ];
  const tickDays = new Set([1, 8, 15, 22, dayCount]);

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
    <div className="match-calendar-scrubber">
      <div className="match-calendar-head">
        <span className="match-calendar-month">
          <strong>{String(month).padStart(2, '0')}</strong>
          <em>{year}</em>
        </span>

        <span className="match-calendar-current">
          <strong>{String(activeDay).padStart(2, '0')}</strong>
          <em>{weekday}</em>
        </span>

        <span className="match-calendar-meta">
          <strong>{monthTotal}</strong>
          <em>局</em>
          <i>{loading ? '同步' : `${Math.round(progress * 100)}%`}</i>
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
        <span
          className="match-calendar-depth"
          style={{ width: `${progress * 100}%` }}
          aria-hidden="true"
        />
        <span
          className="match-calendar-range"
          style={{
            left: `${(rangeStart / dayCount) * 100}%`,
            width: `${((rangeEnd - rangeStart + 1) / dayCount) * 100}%`,
          }}
          aria-hidden="true"
        />
        <span
          className="match-calendar-cursor"
          style={{
            left: `${(activeIndex / dayCount) * 100}%`,
            width: `${100 / dayCount}%`,
          }}
          aria-hidden="true"
        />

        <div className="match-calendar-days">
          {monthDays.map((day) => {
            const ratio = day.count / maxCount;
            const fillHeight = day.count > 0 ? 6 + Math.round(ratio * 19) : 2;
            const isActive = day.key === visualDayKey;
            const opacity = isActive
              ? 1
              : day.count > 0
                ? 0.32 + ratio * 0.68
                : day.unknown
                  ? 0.12
                  : 0.16;
            const canJump = day.count > 0;

            return (
              <button
                key={day.key}
                type="button"
                role="listitem"
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
                className={`match-calendar-day ${
                  isActive ? 'match-calendar-day--active' : ''
                } ${day.unknown ? 'match-calendar-day--unknown' : ''} ${
                  day.future ? 'match-calendar-day--future' : ''
                }`}
              >
                <span className="match-calendar-day__well">
                  <span
                    className="match-calendar-day__fill"
                    style={{
                      height: fillHeight,
                      opacity,
                    } as CSSProperties}
                  />
                </span>
                {tickDays.has(day.day) && (
                  <span className="match-calendar-day__index">{String(day.day).padStart(2, '0')}</span>
                )}
                <span className="match-calendar-day__tooltip" aria-hidden="true">
                  <strong>{month}月{day.day}日</strong>
                  <em>
                    {day.unknown
                      ? '尚未加载'
                      : day.count > 0
                        ? `${day.count} 局 · ${day.wins}胜 ${day.losses}负`
                        : '0 局'}
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
