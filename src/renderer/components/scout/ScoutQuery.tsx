import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Plus } from 'lucide-react';
import type { ChampionSummary, ScoutConfig } from '../../../shared/api';

// 雷达的参数不是一张表，而是一句话：
// 从 X 的对局里找起，在 大区 的 模式 里，寻 N 位最近 H 小时内用 英雄 打出 KDA K 以上的人。
// 每个值都是一个可以直接改的词：点开是小浮层，数字还能左右拖、滚轮拨。

export interface QueryOption {
  key: string;
  name: string;
}

interface ScoutQueryProps {
  config: ScoutConfig;
  regions: QueryOption[];
  queues: QueryOption[];
  hours: number[];
  champions: ChampionSummary[];
  locked: boolean;
  kdaRange: [number, number, number];
  targetMax: number;
  onChange: (patch: Partial<ScoutConfig>) => void;
  onPickChampions: () => void;
  onSubmit: () => void;
}

type MenuKind = 'region' | 'queue' | 'count' | 'hours' | 'kda';

const formatKda = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

// 小浮层：挂到 body 上，贴着词的下沿（放不下就翻到上面）
function TokenMenu({ anchor, onClose, children, label }: { anchor: HTMLElement; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const menu = ref.current;
      const w = menu?.offsetWidth ?? 220;
      const h = menu?.offsetHeight ?? 160;
      const up = rect.bottom + 8 + h > window.innerHeight - 8 && rect.top - 8 - h > 8;
      setPos({
        left: Math.max(8, Math.min(window.innerWidth - w - 8, rect.left + rect.width / 2 - w / 2)),
        top: up ? rect.top - 8 - h : rect.bottom + 8,
        up,
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor]);

  useEffect(() => {
    const onDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || anchor.contains(target)) return;
      onClose();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className="sx-menu"
      data-up={pos?.up ? 'true' : undefined}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
    >
      {children}
    </div>,
    document.body,
  );
}

// 数字词：按住左右拖动改值，滚轮也能拨；没拖动就当作点击，打开浮层
function useScrub(value: number, step: number, min: number, max: number, onValue: (next: number) => void, onClick: () => void, disabled: boolean) {
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);
  const clampStep = (next: number) => Math.min(max, Math.max(min, Math.round(next / step) * step));
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (disabled || event.button !== 0) return;
      drag.current = { x: event.clientX, start: value, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const state = drag.current;
      if (!state) return;
      const dx = event.clientX - state.x;
      if (!state.moved && Math.abs(dx) < 4) return;
      state.moved = true;
      const next = clampStep(state.start + Math.round(dx / 9) * step);
      if (next !== value) onValue(next);
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const state = drag.current;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (state && !state.moved) onClick();
    },
    onPointerCancel: () => {
      drag.current = null;
    },
    onWheel: (event: WheelEvent<HTMLElement>) => {
      if (disabled || event.deltaY === 0) return;
      onValue(clampStep(value + (event.deltaY < 0 ? step : -step)));
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (disabled) return;
      if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
        event.preventDefault();
        onValue(clampStep(value + step));
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
        event.preventDefault();
        onValue(clampStep(value - step));
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick();
      }
    },
  };
}

function Chips<T extends string | number>({ items, value, render, onPick }: { items: T[]; value: T; render: (item: T) => ReactNode; onPick: (item: T) => void }) {
  return (
    <div className="sx-menu__chips">
      {items.map((item) => (
        <button key={String(item)} type="button" data-on={item === value ? 'true' : undefined} onClick={() => onPick(item)}>
          {render(item)}
        </button>
      ))}
    </div>
  );
}

export function ScoutQuery({
  config,
  regions,
  queues,
  hours,
  champions,
  locked,
  kdaRange,
  targetMax,
  onChange,
  onPickChampions,
  onSubmit,
}: ScoutQueryProps) {
  const [menu, setMenu] = useState<{ kind: MenuKind; anchor: HTMLElement } | null>(null);
  const anchors = useRef<Partial<Record<MenuKind, HTMLElement | null>>>({});
  const [kdaMin, kdaMax, kdaStep] = kdaRange;

  useEffect(() => {
    if (locked) setMenu(null);
  }, [locked]);

  const open = (kind: MenuKind) => {
    const anchor = anchors.current[kind];
    if (locked || !anchor) return;
    setMenu((current) => (current?.kind === kind ? null : { kind, anchor }));
  };
  const close = () => setMenu(null);

  const regionName = regions.find((region) => region.key === (config.region ?? ''))?.name ?? regions[0]?.name ?? '';
  const queueName = queues.find((queue) => queue.key === config.tag)?.name ?? '全部模式';
  const countScrub = useScrub(config.targetCount, 1, 1, targetMax, (targetCount) => onChange({ targetCount }), () => open('count'), locked);
  const kdaScrub = useScrub(config.kdaThreshold, kdaStep, kdaMin, kdaMax, (kdaThreshold) => onChange({ kdaThreshold }), () => open('kda'), locked);
  const shown = champions.slice(0, 5);
  const more = champions.length - shown.length;

  const word = (kind: MenuKind, text: ReactNode) => (
    <button
      type="button"
      ref={(node) => {
        anchors.current[kind] = node;
      }}
      className="sx-word"
      data-open={menu?.kind === kind ? 'true' : undefined}
      disabled={locked}
      onClick={() => open(kind)}
    >
      {text}
    </button>
  );

  const numberWord = (kind: 'count' | 'kda', text: ReactNode, scrub: ReturnType<typeof useScrub>, label: string) => (
    <span
      ref={(node) => {
        anchors.current[kind] = node;
      }}
      role="spinbutton"
      tabIndex={locked ? -1 : 0}
      aria-label={label}
      aria-valuenow={kind === 'count' ? config.targetCount : config.kdaThreshold}
      aria-disabled={locked}
      className="sx-word sx-word--num"
      data-open={menu?.kind === kind ? 'true' : undefined}
      {...scrub}
    >
      {text}
    </span>
  );

  return (
    <div className="sx-query" data-locked={locked ? 'true' : undefined}>
      <p className="sx-query__line">
        从
        <input
          className="sx-word sx-word--seed"
          value={config.seedId}
          onChange={(event) => onChange({ seedId: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSubmit();
          }}
          placeholder="名字#编号"
          disabled={locked}
          spellCheck={false}
          aria-label="从谁的对局里找起"
        />
        的对局里找起，
      </p>
      <p className="sx-query__line">
        在{word('region', regionName)}的{word('queue', queueName)}里，
      </p>
      <p className="sx-query__line">
        寻{numberWord('count', config.targetCount, countScrub, '要找几位')}位最近{word('hours', `${config.hoursWindow} 小时`)}内
      </p>
      <p className="sx-query__line">
        用
        <button
          type="button"
          className="sx-word sx-word--champs"
          disabled={locked}
          onClick={onPickChampions}
          data-empty={champions.length === 0 ? 'true' : undefined}
          aria-label={champions.length > 0 ? `已选 ${champions.length} 个英雄` : '选英雄'}
        >
          {champions.length === 0 ? (
            '选英雄'
          ) : (
            <span className="sx-champs">
              {shown.map((champion) => (
                <img
                  key={champion.id}
                  src={champion.avatar}
                  alt={champion.title || champion.name}
                  title={champion.title || champion.name}
                  referrerPolicy="no-referrer"
                  draggable={false}
                  onError={(event) => {
                    event.currentTarget.style.visibility = 'hidden';
                  }}
                />
              ))}
              {more > 0 && <b>+{more}</b>}
            </span>
          )}
        </button>
        打出 KDA{numberWord('kda', formatKda(config.kdaThreshold), kdaScrub, 'KDA 至少多少')}以上的人。
      </p>

      {menu && (
        <TokenMenu anchor={menu.anchor} onClose={close} label={menu.kind}>
          {menu.kind === 'region' && (
            <div className="sx-menu__list">
              {regions.map((region) => (
                <button
                  key={region.key || 'current'}
                  type="button"
                  data-on={(config.region ?? '') === region.key ? 'true' : undefined}
                  onClick={() => {
                    onChange({ region: region.key });
                    close();
                  }}
                >
                  {region.name}
                  {region.key === '' && <small>当前</small>}
                </button>
              ))}
            </div>
          )}
          {menu.kind === 'queue' && (
            <div className="sx-menu__list sx-menu__list--grid">
              {queues.map((queue) => (
                <button
                  key={queue.key}
                  type="button"
                  data-on={config.tag === queue.key ? 'true' : undefined}
                  onClick={() => {
                    onChange({ tag: queue.key });
                    close();
                  }}
                >
                  {queue.name}
                </button>
              ))}
            </div>
          )}
          {menu.kind === 'hours' && (
            <Chips
              items={hours}
              value={config.hoursWindow}
              render={(item) => <>{item}<small>小时</small></>}
              onPick={(hoursWindow) => {
                onChange({ hoursWindow });
                close();
              }}
            />
          )}
          {menu.kind === 'count' && (
            <>
              <div className="sx-menu__stepper">
                <button type="button" aria-label="少一位" disabled={config.targetCount <= 1} onClick={() => onChange({ targetCount: Math.max(1, config.targetCount - 1) })}>
                  <Minus className="size-3.5" />
                </button>
                <b>{config.targetCount}<small>位</small></b>
                <button type="button" aria-label="多一位" disabled={config.targetCount >= targetMax} onClick={() => onChange({ targetCount: Math.min(targetMax, config.targetCount + 1) })}>
                  <Plus className="size-3.5" />
                </button>
              </div>
              <Chips items={[5, 10, 20, 30, targetMax]} value={config.targetCount} render={(item) => item} onPick={(targetCount) => onChange({ targetCount })} />
            </>
          )}
          {menu.kind === 'kda' && (
            <>
              <div className="sx-menu__ruler">
                <b>{formatKda(config.kdaThreshold)}</b>
                <input
                  type="range"
                  min={kdaMin}
                  max={kdaMax}
                  step={kdaStep}
                  value={config.kdaThreshold}
                  onChange={(event) => onChange({ kdaThreshold: Number(event.target.value) })}
                  aria-label="KDA 至少多少"
                  style={{ '--fill': `${((config.kdaThreshold - kdaMin) / (kdaMax - kdaMin)) * 100}%` } as CSSProperties}
                />
              </div>
              <Chips items={[10, 12, 15, 20, kdaMax]} value={config.kdaThreshold} render={(item) => item} onPick={(kdaThreshold) => onChange({ kdaThreshold })} />
            </>
          )}
        </TokenMenu>
      )}
    </div>
  );
}
