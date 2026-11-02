import type { MatchTimelineEvent } from '../../../shared/api';
import { LeagueArtImage, leagueArtUrl } from './LeagueArtImage';
import { eventArt, monsterKey, type Side } from './matchStoryModel';

// 小地图：用线条画的召唤师峡谷 / 嚎哭深渊，跟着深浅色主题走，不依赖外网图片。
// 上面的点就是事件发生的位置：蓝点 / 红点是哪一方拿到的击杀，金圈是正在看的人的击杀，红叉是他阵亡的地方。

export interface RiftMapPoint {
  key: string;
  x: number;
  y: number;
  tone: Side;
  mark: 'kill' | 'focus-kill' | 'focus-death' | 'objective';
  event?: MatchTimelineEvent;
  label: string;
  state: 'idle' | 'active' | 'dim';
}

/** 小龙、男爵、塔这些用官方风格图标；虚空巢虫、阿塔坎没有单独的图，用精灵图里对应的那一格。 */
export function ObjectiveIcon({ event, side }: { event: MatchTimelineEvent; side: Side }) {
  const art = eventArt(event, side);
  if (art) return <LeagueArtImage name={art} />;
  const key = monsterKey(event);
  const sprite = leagueArtUrl('right_icons_grub.png');
  return <i className={`obj-sprite ${key.includes('HORDE') ? 'is-grub' : 'is-other'}`} style={sprite ? { backgroundImage: `url(${sprite})` } : undefined} aria-hidden="true" />;
}

interface Props {
  mapId: number | null;
  points: RiftMapPoint[];
  onPick: (key: string) => void;
}

// 召唤师峡谷坐标约 0~14900，嚎哭深渊约 0~13000；y 轴朝上。
const EXTENT: Record<number, number> = { 11: 15000, 12: 13000 };

export function riftMapSupported(mapId: number | null): boolean {
  return mapId === 11 || mapId === 12;
}

export function RiftMap({ mapId, points, onPick }: Props) {
  if (!mapId || !riftMapSupported(mapId)) return null;
  const extent = EXTENT[mapId];
  const aram = mapId === 12;
  return (
    <div className={`rift${aram ? ' is-aram' : ''}`}>
      <svg className="rift-ground" viewBox="0 0 100 100" aria-hidden="true">
        <rect className="rift-bg" x="0" y="0" width="100" height="100" rx="4" />
        {aram ? (
          <>
            <path className="rift-lane is-wide" d="M 10 90 L 90 10" />
            <path className="rift-lane-core" d="M 10 90 L 90 10" />
          </>
        ) : (
          <>
            <path className="rift-jungle" d="M 22 30 C 30 22, 44 18, 52 24 C 46 34, 34 44, 24 50 C 18 44, 18 36, 22 30 Z" />
            <path className="rift-jungle" d="M 78 70 C 70 78, 56 82, 48 76 C 54 66, 66 56, 76 50 C 82 56, 82 64, 78 70 Z" />
            <path className="rift-jungle" d="M 30 66 C 36 58, 46 52, 52 56 C 50 64, 44 72, 36 78 C 30 76, 28 70, 30 66 Z" />
            <path className="rift-jungle" d="M 70 34 C 64 42, 54 48, 48 44 C 50 36, 56 28, 64 22 C 70 24, 72 30, 70 34 Z" />
            <path className="rift-river" d="M 6 16 C 20 22, 34 34, 50 50 C 66 66, 80 78, 94 84" />
            <circle className="rift-pit" cx="33" cy="30" r="4" />
            <circle className="rift-pit" cx="67" cy="70" r="4" />
            <path className="rift-lane" d="M 9 88 L 9 15 Q 9 9 15 9 L 88 9" />
            <path className="rift-lane" d="M 12 91 L 85 91 Q 91 91 91 85 L 91 12" />
            <path className="rift-lane" d="M 13 87 L 87 13" />
          </>
        )}
        <path className="rift-base is-blue" d="M 0 78 A 22 22 0 0 0 22 100 L 4 100 Q 0 100 0 96 Z" />
        <path className="rift-base is-red" d="M 78 0 A 22 22 0 0 1 100 22 L 100 4 Q 100 0 96 0 Z" />
      </svg>
      {points.map((point) => (
        <button
          key={point.key}
          type="button"
          className={`rift-point is-${point.tone} is-${point.mark} is-${point.state}`}
          style={{ left: `${Math.max(2, Math.min(98, point.x / extent * 100))}%`, top: `${Math.max(2, Math.min(98, 100 - point.y / extent * 100))}%` }}
          title={point.label}
          aria-label={point.label}
          onClick={() => onPick(point.key)}
        >
          {point.mark === 'objective' && point.event ? <ObjectiveIcon event={point.event} side={point.tone} /> : <i />}
        </button>
      ))}
    </div>
  );
}
