import { GameIcon } from './GameIcon';
import type { MatchParticipantSummary } from '../../../shared/api';

// 玩家行：双队详情里的一名玩家。
// 布局：英雄头像 | 召唤师名+召唤师技能+主符文 | 装备栏 | KDA | 经济 | 伤害
// 高密度紧凑信息行，用 grid 对齐各列，保证横向可比。
interface PlayerRowProps {
  participant: MatchParticipantSummary;
  isTarget: boolean; // 是否为当前查询的玩家（高亮）
}

export function PlayerRow({ participant: p, isTarget }: PlayerRowProps) {
  const kdaColor = p.kda >= 5 ? 'text-app-success' : p.kda >= 3 ? 'text-app-link' : 'text-app-text';
  const itemSlots = Array.from({ length: 7 }, (_, slot) => p.items.find((item) => item.slot === slot));

  return (
    <div
      className={`grid min-h-[58px] grid-cols-[38px_minmax(170px,1.35fr)_152px_64px_52px_52px_36px] items-center gap-2 border-t border-app-border px-3 py-2 text-[12px] transition-colors ${
        isTarget ? 'bg-app-surface-soft' : 'hover:bg-app-surface-soft'
      }`}
    >
      {/* 英雄头像 */}
      <GameIcon
        src={p.championAvatar}
        alt={p.championName}
        title={`${p.championName} Lv.${p.champLevel}`}
        size={34}
        rounded
        className="ring-1 ring-black/5"
      />

      {/* 召唤师名 + 召唤师技能 + 主符文 */}
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex flex-col gap-1.5">
          {/* 召唤师技能（2个，竖排小图标） */}
          {p.spells.map((sp) => (
            <GameIcon key={sp.id} src={sp.icon} alt={sp.name} title={sp.name} size={18} />
          ))}
        </div>
        {p.primaryRune && (
          <GameIcon src={p.primaryRune.icon} alt={p.primaryRune.name} title={p.primaryRune.name} size={18} />
        )}
        <div className="min-w-0">
          <div className={`break-all leading-4 ${isTarget ? 'font-semibold text-app-text' : 'text-app-text'}`}>
            {p.riotId || p.summonerName || '未知玩家'}
          </div>
          <div className="truncate text-[10px] text-app-subtle">{p.championName}</div>
        </div>
      </div>

      {/* 装备栏（最多 7 个小图标，含饰品） */}
      <div className="grid grid-cols-7 gap-0.5 justify-self-center">
        {itemSlots.map((it, slot) => (
          it ? (
            <GameIcon key={`${slot}-${it.id}`} src={it.icon} alt={it.name} title={it.name} size={20} />
          ) : (
            <span key={slot} className="size-5 rounded-xs border border-app-border bg-app-surface-soft" />
          )
        ))}
      </div>

      {/* KDA */}
      <div className={`text-center tabular-nums ${kdaColor}`}>
        <div className="font-semibold">{p.kills}/{p.deaths}/{p.assists}</div>
        <div className="text-[10px] font-normal text-app-subtle">{p.kda.toFixed(1)}</div>
      </div>

      {/* 经济 */}
      <span className="text-right tabular-nums text-app-muted">{(p.gold / 1000).toFixed(1)}k</span>

      {/* 伤害 */}
      <span className="text-right tabular-nums text-app-muted">{(p.damage / 1000).toFixed(1)}k</span>

      {/* 补刀 */}
      <span className="text-right tabular-nums text-app-muted">{p.cs}</span>
    </div>
  );
}
