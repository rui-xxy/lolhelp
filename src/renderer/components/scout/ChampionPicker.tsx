import { useMemo, useState } from 'react';
import { Star, Search, X } from 'lucide-react';
import { GameIcon } from '../match/GameIcon';
import type { ChampionSummary } from '../../../shared/api';

// 英雄选择网格（放在弹窗里）。
//
// 数据源 tags 是英文角色定位（Mage/Fighter/Tank/Assassin/Support/Marksman），
// 一个英雄常有多个 tag。这里按「主定位」(tags[0]) 映射到中文位置分类。
//
// 显示用 title（真名，如"安妮"）——datas.json 里 name 是称号、title 是真名，
// 此组件统一用真名显示和搜索，避免和全局 heroData 的字段冲突。

// tags[0] → 中文位置（首字母大写的英文 tag → 中文）
const POSITION_BY_TAG: Record<string, string> = {
  Mage: '法师',
  Fighter: '战士',
  Tank: '坦克',
  Assassin: '刺客',
  Support: '辅助',
  Marksman: '射手',
};

// 分类标签（顺序即 tab 顺序）
const CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: 'Marksman', label: '射手' },
  { key: 'Mage', label: '法师' },
  { key: 'Assassin', label: '刺客' },
  { key: 'Fighter', label: '战士' },
  { key: 'Tank', label: '坦克' },
  { key: 'Support', label: '辅助' },
];

interface ChampionPickerProps {
  champions: ChampionSummary[];
  selectedIds: number[];
  favoriteIds: number[];
  onChange: (ids: number[]) => void;
  onToggleFavorite?: (id: number) => void;
}

export function ChampionPicker({
  champions,
  selectedIds,
  favoriteIds,
  onChange,
  onToggleFavorite,
}: ChampionPickerProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  // 显示名：datas.json 的 title 是真名（安妮），name 是称号（黑暗之女）
  const displayName = (c: ChampionSummary) => c.title || c.name;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return champions.filter((c) => {
      // 分类过滤（按主定位 tags[0]）
      if (category !== 'all') {
        const primaryTag = c.tags?.[0];
        if (primaryTag !== category) return false;
      }
      // 搜索过滤（真名 / 称号 / 英文别名）
      if (!q) return true;
      const name = displayName(c).toLowerCase();
      return (
        name.includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.alias.toLowerCase().includes(q)
      );
    });
  }, [champions, query, category]);

  // 排序：收藏的排前
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const fa = favoriteSet.has(a.id) ? 0 : 1;
      const fb = favoriteSet.has(b.id) ? 0 : 1;
      return fa - fb;
    });
  }, [filtered, favoriteSet]);

  // 已选的英雄详情
  const selectedChampions = useMemo(() => {
    const map = new Map(champions.map((c) => [c.id, c]));
    return selectedIds.map((id) => map.get(id)).filter((c): c is ChampionSummary => Boolean(c));
  }, [selectedIds, champions]);

  const toggle = (id: number) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 已选栏 */}
      {selectedChampions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xs border border-app-border bg-app-surface-soft px-2 py-1.5">
          {selectedChampions.map((c) => (
            <span
              key={c.id}
              className="flex items-center gap-1 rounded-xs bg-app-surface px-1 py-0.5 text-[11px]"
            >
              <GameIcon src={c.avatar} alt={displayName(c)} size={16} rounded />
              <span>{displayName(c)}</span>
              <button
                onClick={() => toggle(c.id)}
                className="text-app-subtle transition-colors hover:text-app-danger"
                title="移除"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <button
            onClick={() => onChange([])}
            className="ml-auto text-[11px] text-app-subtle transition-colors hover:text-app-primary"
          >
            清空
          </button>
        </div>
      )}

      {/* 分类 Tab */}
      <div className="flex flex-wrap gap-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            className={`rounded-xs px-2.5 py-1 text-[11px] font-medium transition-colors ${
              category === cat.key
                ? 'bg-app-primary text-white'
                : 'bg-app-surface-soft text-app-muted hover:bg-app-nav-hover'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 搜索框 */}
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-app-subtle" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索英雄（中文名/称号/英文）"
          className="h-8 w-full rounded-sm border border-app-border bg-app-surface-soft pr-3 pl-8 text-xs text-app-text placeholder:text-app-subtle focus:border-app-primary focus:bg-app-surface focus:outline-none"
        />
      </div>

      {/* 英雄网格 */}
      <div className="scout-champion-grid">
        {sorted.map((c) => {
          const selected = selectedSet.has(c.id);
          const favorite = favoriteSet.has(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              title={`${displayName(c)} · ${POSITION_BY_TAG[c.tags?.[0] ?? ''] ?? ''}`}
              className={`scout-champion-cell group ${selected ? 'scout-champion-cell--selected' : ''}`}
            >
              {onToggleFavorite && (
                <Star
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(c.id);
                  }}
                  className={`absolute top-0.5 right-0.5 size-2.5 cursor-pointer ${
                    favorite
                      ? 'fill-app-primary text-app-primary'
                      : 'text-app-subtle opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-60'
                  }`}
                />
              )}
              <GameIcon src={c.avatar} alt={displayName(c)} size={40} rounded />
              <span className="mt-0.5 max-w-full truncate text-[10px] text-app-muted">
                {displayName(c)}
              </span>
            </button>
          );
        })}
        {sorted.length === 0 && (
          <div className="col-span-full py-4 text-center text-xs text-app-subtle">
            没有匹配的英雄
          </div>
        )}
      </div>
    </div>
  );
}
