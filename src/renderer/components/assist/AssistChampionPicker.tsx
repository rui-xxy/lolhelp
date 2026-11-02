import { useMemo, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { ArrowDown, ArrowUp, Search, Star, X } from 'lucide-react';
import type { ChampionSummary } from '../../../shared/api';

// 助手专用的英雄选择器。
// 多选时右边是「已选」清单，顺序就是优先级，可以上下调；单选（禁用英雄、背景英雄）点一下就选好关闭。

const ROLE_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'favorite', label: '收藏' },
  { value: 'Fighter', label: '战士' },
  { value: 'Mage', label: '法师' },
  { value: 'Assassin', label: '刺客' },
  { value: 'Tank', label: '坦克' },
  { value: 'Marksman', label: '射手' },
  { value: 'Support', label: '辅助' },
];

const collator = new Intl.Collator('zh-CN-u-co-pinyin');

export function championDisplayName(champion: ChampionSummary): string {
  return champion.title || champion.name;
}

function avatarSources(champion: ChampionSummary): string[] {
  const urls = [
    champion.avatar,
    champion.alias ? `https://game.gtimg.cn/images/lol/act/img/champion/${champion.alias}.png` : '',
    `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${champion.id}.png`,
  ];
  return Array.from(new Set(urls.filter(Boolean)));
}

// 英雄头像：一个图源挂了自动换下一个，全挂了显示名字首字。
export function ChampionAvatar({ champion, className }: { champion: ChampionSummary; className?: string }) {
  const sources = useMemo(() => avatarSources(champion), [champion]);
  const [index, setIndex] = useState(0);
  const src = sources[index];
  if (!src) {
    return <span className={`cp-avatar-fallback ${className ?? ''}`}>{championDisplayName(champion).slice(0, 1)}</span>;
  }
  return (
    <img
      className={className}
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setIndex((current) => current + 1)}
    />
  );
}

export interface ChampionPickerRequest {
  title: string;
  hint?: string;
  ids: number[];
  max: number;
  mode?: 'pick' | 'ban';
  apply: (ids: number[]) => void;
}

export function AssistChampionPicker({
  request,
  champions,
  favoriteIds,
  onClose,
}: {
  request: ChampionPickerRequest;
  champions: ChampionSummary[];
  favoriteIds: number[];
  onClose: () => void;
}) {
  // 每次打开都是一个新实例（父组件用 key 区分），所以初始值直接取这次传进来的已选英雄。
  const single = request.max === 1;
  const ban = request.mode === 'ban';
  const [selected, setSelected] = useState<number[]>(() => request.ids);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [notice, setNotice] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(champions.map((champion) => [champion.id, champion])), [champions]);
  const favorites = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const sorted = useMemo(
    () => [...champions].sort((a, b) => collator.compare(championDisplayName(a), championDisplayName(b))),
    [champions],
  );

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return sorted.filter((champion) => {
      if (role === 'favorite' && !favorites.has(champion.id)) return false;
      if (role !== 'all' && role !== 'favorite' && !champion.tags.includes(role)) return false;
      if (!keyword) return true;
      return [champion.title, champion.name, champion.alias]
        .some((text) => String(text ?? '').toLowerCase().includes(keyword));
    });
  }, [favorites, query, role, sorted]);

  const finish = (ids: number[]) => {
    request.apply(ids);
    onClose();
  };

  const toggle = (id: number) => {
    if (single) {
      finish(selected[0] === id ? [] : [id]);
      return;
    }
    setNotice('');
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= request.max) {
        setNotice(`最多选 ${request.max} 个`);
        return current;
      }
      return [...current, id];
    });
  };

  const move = (index: number, delta: number) => {
    setSelected((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  return (
    <Dialog.Root open onOpenChange={(next: boolean) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="cp-overlay" />
        <Dialog.Content
          className="cp-dialog"
          data-single={single ? 'true' : undefined}
          data-mode={ban ? 'ban' : undefined}
          onOpenAutoFocus={(event: Event) => {
            event.preventDefault();
            searchRef.current?.focus();
          }}
        >
          <header className="cp-head">
            <div>
              <Dialog.Title className="cp-title">{request.title}</Dialog.Title>
              <Dialog.Description className="sr-only">{request.title}</Dialog.Description>
            </div>
            <Dialog.Close className="cp-close" aria-label="关闭"><X /></Dialog.Close>
          </header>

          <div className="cp-toolbar">
            <div className="cp-search">
              <Search />
              <input
                ref={searchRef}
                value={query}
                placeholder="搜英雄：名字、称号或英文"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && visible.length === 1) toggle(visible[0].id);
                }}
              />
            </div>
            <div className="cp-roles" role="radiogroup" aria-label="按定位筛选">
              {ROLE_FILTERS
                .filter((filter) => filter.value !== 'favorite' || favorites.size > 0)
                .map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    role="radio"
                    aria-checked={role === filter.value}
                    className="cp-role"
                    onClick={() => setRole(filter.value)}
                  >
                    {filter.value === 'favorite' && <Star />}
                    {filter.label}
                  </button>
                ))}
            </div>
          </div>

          <div className="cp-body">
            <div className="cp-grid" role="listbox" aria-multiselectable={!single}>
              {visible.length === 0 ? (
                <div className="cp-empty">没有找到「{query}」，换个说法试试</div>
              ) : visible.map((champion) => {
                const order = selected.indexOf(champion.id);
                const chosen = order >= 0;
                return (
                  <button
                    key={champion.id}
                    type="button"
                    role="option"
                    aria-selected={chosen}
                    className="cp-champ"
                    title={champion.name && champion.name !== champion.title ? `${championDisplayName(champion)} · ${champion.name}` : undefined}
                    onClick={() => toggle(champion.id)}
                  >
                    <span className="cp-champ__face">
                      <ChampionAvatar champion={champion} />
                      {chosen && (
                        <span className="cp-champ__badge">{ban ? '禁' : single ? '✓' : order + 1}</span>
                      )}
                    </span>
                    <span className="cp-champ__name">{championDisplayName(champion)}</span>
                  </button>
                );
              })}
            </div>

            {!single && (
              <aside className="cp-side">
                <div className="cp-side__head">
                  <b>已选 {selected.length}</b>
                </div>
                {selected.length === 0 ? (
                  <div className="cp-side__empty">未选择</div>
                ) : (
                  <ol className="cp-side__list">
                    {selected.map((id, index) => {
                      const champion = byId.get(id);
                      if (!champion) return null;
                      return (
                        <li key={id}>
                          <i>{index + 1}</i>
                          <ChampionAvatar champion={champion} className="cp-side__face" />
                          <span>{championDisplayName(champion)}</span>
                          <button type="button" aria-label="往前" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></button>
                          <button type="button" aria-label="往后" disabled={index === selected.length - 1} onClick={() => move(index, 1)}><ArrowDown /></button>
                          <button type="button" aria-label="移除" onClick={() => toggle(id)}><X /></button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </aside>
            )}
          </div>

          <footer className="cp-foot">
            <p>{notice || (single ? '' : `已选 ${selected.length}/${request.max}`)}</p>
            {(single ? request.ids.length > 0 : selected.length > 0) && (
              <button type="button" className="as-btn as-btn--ghost" onClick={() => (single ? finish([]) : setSelected([]))}>
                {single ? (ban ? '不禁了' : '清除') : '全部清空'}
              </button>
            )}
            <Dialog.Close className="as-btn">取消</Dialog.Close>
            {!single && (
              <button type="button" className="as-btn as-btn--primary" onClick={() => finish(selected)}>
                确定
              </button>
            )}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
