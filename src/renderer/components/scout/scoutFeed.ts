import type { ScoutPlayerEvent } from '../../../shared/api';

// ScoutPage 把引擎推来的每一条候选事件推给 feed，灯海自己消费，不经过 React 渲染。
// 找到的人在灯海里有一个固定的位置（pin）：画布和上面的金点都从这里取，保证两边对得上。
export interface ScoutPin {
  x: number; // 占舞台宽度的比例
  y: number; // 占舞台高度的比例
  at: number; // 第一次钉上去的时间，用来判断是不是「刚找到」
}

export interface ScoutFeed {
  push: (events: ScoutPlayerEvent[]) => void;
  reset: () => void;
  subscribe: (listener: (events: ScoutPlayerEvent[] | null) => void) => () => void;
  history: () => ScoutPlayerEvent[];
  pin: (puuid: string, fresh?: boolean) => ScoutPin;
  pins: () => Map<string, ScoutPin>;
}

const FEED_HISTORY_LIMIT = 1600;

// 金点只落在灯海中段：左边是那句话，右上是计数，右下是正在翻看的名字
const PIN_ZONE = { left: 0.45, right: 0.79, top: 0.24, bottom: 0.76 };
const PIN_ASPECT = 4.2;

export function hash01(text: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100003) / 100003;
}

function placePin(puuid: string, pins: Map<string, ScoutPin>): { x: number; y: number } {
  const taken = [...pins.values()];
  let best = { x: 0.6, y: 0.5 };
  let bestGap = -1;
  for (let k = 0; k < 14; k++) {
    const x = PIN_ZONE.left + (PIN_ZONE.right - PIN_ZONE.left) * hash01(puuid, 11 + k * 2);
    const y = PIN_ZONE.top + (PIN_ZONE.bottom - PIN_ZONE.top) * hash01(puuid, 12 + k * 2);
    const gap = taken.reduce((min, pin) => Math.min(min, Math.hypot((pin.x - x) * PIN_ASPECT, pin.y - y)), 9);
    if (gap > bestGap) {
      best = { x, y };
      bestGap = gap;
    }
    if (gap > 0.42) break;
  }
  return best;
}

export function createScoutFeed(): ScoutFeed {
  let history: ScoutPlayerEvent[] = [];
  const pins = new Map<string, ScoutPin>();
  const listeners = new Set<(events: ScoutPlayerEvent[] | null) => void>();
  return {
    push(events) {
      if (events.length === 0) return;
      history.push(...events);
      if (history.length > FEED_HISTORY_LIMIT) history = history.slice(-FEED_HISTORY_LIMIT);
      listeners.forEach((listener) => listener(events));
    },
    reset() {
      history = [];
      pins.clear();
      listeners.forEach((listener) => listener(null));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    history: () => history,
    pin(puuid, fresh = false) {
      const existing = pins.get(puuid);
      if (existing) return existing;
      const pin = { ...placePin(puuid, pins), at: fresh ? Date.now() : 0 };
      pins.set(puuid, pin);
      return pin;
    },
    pins: () => pins,
  };
}
