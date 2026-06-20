import { GameIcon } from './GameIcon';
import type { MatchParticipantSummary } from '../../../shared/api';

// 玩家行：双队详情里的一名玩家。
// 布局：英雄头像 | 召唤师名+召唤师技能+主/副符文 | 装备栏 | KDA | 经济 | 伤害
// 高密度紧凑信息行，用 grid 对齐各列，保证横向可比。
interface PlayerRowProps {
  participant: MatchParticipantSummary;
  isTarget: boolean; // 是否为当前查询的玩家（高亮）
  onPlayerSearch?: (riotId: string) => void;
}

export function PlayerRow({ participant: p, isTarget, onPlayerSearch }: PlayerRowProps) {
  const kdaColor = p.kda >= 5 ? 'text-app-success' : p.kda >= 3 ? 'text-app-link' : 'text-app-text';
  const itemSlots = Array.from({ length: 7 }, (_, slot) => p.items.find((item) => item.slot === slot));
  const playerName = p.riotId || p.summonerName || '未知玩家';

  return (
    <div
      className={`player-detail-row ${isTarget ? 'player-detail-row--target' : ''}`}
    >
      {/* 英雄头像 */}
      <GameIcon
        src={p.championAvatar}
        alt={p.championName}
        title={`${p.championName} Lv.${p.champLevel}`}
        size={34}
        rounded
        className="player-detail-avatar"
      />

      {/* 召唤师名 + 召唤师技能 + 主/副符文 */}
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex flex-col gap-1.5">
          {/* 召唤师技能（2个，竖排小图标） */}
          {p.spells.map((sp) => (
            <GameIcon key={sp.id} src={sp.icon} alt={sp.name} title={sp.name} size={18} />
          ))}
        </div>
        <div className="player-detail-runes">
          {p.primaryRune ? (
            <GameIcon
              src={p.primaryRune.icon}
              alt={p.primaryRune.name}
              title={p.primaryRune.name}
              size={18}
              className="player-detail-rune-icon"
            />
          ) : (
            <span className="player-detail-rune-placeholder" title="无主符文" />
          )}
          {p.secondaryRune ? (
            <GameIcon
              src={p.secondaryRune.icon}
              alt={p.secondaryRune.name}
              title={p.secondaryRune.name}
              size={18}
              className="player-detail-rune-icon"
            />
          ) : (
            <span className="player-detail-rune-placeholder" title="无副符文" />
          )}
        </div>
        <div className="min-w-0">
          <button
            type="button"
            title={playerName}
            onClick={() => onPlayerSearch?.(playerName)}
            className={`player-detail-name ${
              isTarget ? 'font-semibold text-app-text' : 'text-app-text'
            }`}
          >
            {playerName}
          </button>
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
