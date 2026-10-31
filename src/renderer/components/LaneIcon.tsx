// 召唤师峡谷位置图标（对局页中缝、助手页的位置设置共用）。
// 传入 top / jungle / middle / bottom / utility，也认 TOP、MID、BOT、SUPPORT 这些写法。

const LANE_ALIASES: Record<string, string> = {
  mid: 'middle',
  bot: 'bottom',
  adc: 'bottom',
  support: 'utility',
};

export function LaneIcon({ lane, className = 'live-lane-icon' }: { lane: string; className?: string }) {
  const dim = { opacity: 0.32 };
  const key = LANE_ALIASES[lane.toLowerCase()] ?? lane.toLowerCase();
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {key === 'top' && (
        <>
          <path d="M3 3h15.5L15 6.5H6.5V15L3 18.5z" />
          <path style={dim} d="M21 5.5V21H5.5L9 17.5h8.5V9z" />
          <rect style={dim} x="9.5" y="9.5" width="5" height="5" rx="0.6" />
        </>
      )}
      {key === 'bottom' && (
        <>
          <path style={dim} d="M3 3h15.5L15 6.5H6.5V15L3 18.5z" />
          <path d="M21 5.5V21H5.5L9 17.5h8.5V9z" />
          <rect style={dim} x="9.5" y="9.5" width="5" height="5" rx="0.6" />
        </>
      )}
      {key === 'middle' && (
        <>
          <path d="M16.5 3H21v4.5L7.5 21H3v-4.5z" />
          <path style={dim} d="M3 3h8L8 6H6v2L3 11z" />
          <path style={dim} d="M21 13v8h-8l3-3h2v-2z" />
        </>
      )}
      {key === 'jungle' && (
        <path d="M6.2 2.5c2.7 2.3 4.2 5.2 4.5 8.6-1.2-1.7-2.9-2.8-5.1-3.1 2.3 2.1 3.7 4.8 3.9 8.1L12 21.5l2.5-5.4c.2-3.3 1.6-6 3.9-8.1-2.2.3-3.9 1.4-5.1 3.1.3-3.4 1.8-6.3 4.5-8.6-2.7.6-4.7 2.1-5.8 4.2-1.1-2.1-3.1-3.6-5.8-4.2z" />
      )}
      {key === 'utility' && (
        <>
          <path d="M9.6 3.2h4.8l-1.1 2.3h-2.6z" />
          <path d="M12 6.6l3 3-1.4 9.1L12 21.2l-1.6-2.5L9 9.6z" />
          <path d="M1.6 6.8l7.6 1.9-1.5 4.1-4.1-1.3z" />
          <path d="M22.4 6.8l-7.6 1.9 1.5 4.1 4.1-1.3z" />
        </>
      )}
    </svg>
  );
}

