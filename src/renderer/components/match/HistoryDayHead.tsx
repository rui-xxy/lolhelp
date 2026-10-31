import { getHistoryDayKey } from './MatchActivityNavigator';

// 战绩列表里每一天开头的日期标题。position: sticky 吸在列表顶部，
// 往下滚时下一天的标题会把上一天的顶上去，所以顶部永远写着「现在看的是哪一天」。

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export interface HistoryDayRecord {
  count: number;
  wins: number;
  losses: number;
}

export function buildHistoryDayRecords(matches: Array<{ gameCreation: number; win: boolean }>): Map<string, HistoryDayRecord> {
  const records = new Map<string, HistoryDayRecord>();
  for (const match of matches) {
    const key = getHistoryDayKey(match.gameCreation);
    const record = records.get(key) ?? { count: 0, wins: 0, losses: 0 };
    record.count += 1;
    if (match.win) record.wins += 1;
    else record.losses += 1;
    records.set(key, record);
  }
  return records;
}

function describeDay(dayKey: string): { day: number; primary: string; secondary: string } {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const deltaDays = Math.round((todayStart.getTime() - date.getTime()) / 86_400_000);
  const weekday = WEEKDAYS[date.getDay()];
  const primary = deltaDays === 0 ? '今天' : deltaDays === 1 ? '昨天' : weekday;
  const secondary = date.getFullYear() === today.getFullYear()
    ? `${month}月${day}日${deltaDays <= 1 ? ` ${weekday}` : ''}`
    : `${year}年${month}月${day}日`;
  return { day, primary, secondary };
}

interface HistoryDayHeadProps {
  dayKey: string;
  record?: HistoryDayRecord;
  active?: boolean;
}

export function HistoryDayHead({ dayKey, record, active = false }: HistoryDayHeadProps) {
  const { day, primary, secondary } = describeDay(dayKey);
  return (
    <div
      className="match-history-dayhead"
      data-history-day={dayKey}
      data-active={active ? 'true' : undefined}
    >
      <span className="match-history-dayhead__num">{day}</span>
      <span className="match-history-dayhead__label">
        <b>{primary}</b>
        <em>{secondary}</em>
      </span>
      {record && (
        <span className="match-history-dayhead__record" aria-label={`${record.count}局，${record.wins}胜${record.losses}负`}>
          <em>{record.count} 局</em>
          <b data-result="win" data-zero={record.wins === 0 ? 'true' : undefined}>{record.wins}胜</b>
          <b data-result="loss" data-zero={record.losses === 0 ? 'true' : undefined}>{record.losses}负</b>
        </span>
      )}
    </div>
  );
}
