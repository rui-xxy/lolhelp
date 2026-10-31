import { useEffect, useRef } from 'react';
import type { ScoutPlayerEvent } from '../../../shared/api';

// 高手雷达的扫描盘。画的全是引擎推过来的真实候选（ScoutPlayerEvent），不造假点：
// 离圆心的远近 = 扩散层级，方位跟着上一级种子走，所以同一个人带出来的候选会聚成一簇。
// 颜色全部取自 tokens（随深浅色与配色方案切换），页面不可见时自动停帧。

export type ScoutRadarMode = 'idle' | 'running' | 'done';

// ScoutPage 把每一条进度事件推给 feed，雷达自己消费，不经过 React 渲染。
export interface ScoutRadarFeed {
  push: (events: ScoutPlayerEvent[]) => void;
  reset: () => void;
  subscribe: (listener: (events: ScoutPlayerEvent[] | null) => void) => () => void;
  history: () => ScoutPlayerEvent[];
}

const FEED_HISTORY_LIMIT = 1600;

export function createScoutRadarFeed(): ScoutRadarFeed {
  let history: ScoutPlayerEvent[] = [];
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
      listeners.forEach((listener) => listener(null));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    history: () => history,
  };
}

interface Blip {
  puuid: string;
  parent?: string;
  depth: number;
  seed: boolean;
  state: ScoutPlayerEvent['state'];
  angle: number;
  radius: number;
  born: number;
  changed: number;
  matchedAt: number;
}

type Rgb = [number, number, number];

interface Palette {
  text1: Rgb;
  text3: Rgb;
  glow: Rgb;
  gold: Rgb;
  enemy: Rgb;
  mono: string;
}

const TAU = Math.PI * 2;
const BLIP_LIMIT = 700;
// 每一层扩散落在哪一圈（占半径的比例）
const DEPTH_BANDS: Array<[number, number]> = [
  [0, 0],
  [0.2, 0.44],
  [0.5, 0.7],
  [0.74, 0.86],
  [0.88, 0.95],
];
const RING_STEPS = [0.25, 0.5, 0.75, 1];

function hash01(text: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100003) / 100003;
}

function parseColor(value: string, fallback: Rgb): Rgb {
  const text = value.trim();
  if (text.startsWith('#')) {
    const hex = text.slice(1);
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.slice(0, 6);
    const n = Number.parseInt(full, 16);
    if (Number.isFinite(n) && full.length === 6) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return fallback;
  }
  const nums = text.match(/[\d.]+/g);
  if (nums && nums.length >= 3) return [Number(nums[0]), Number(nums[1]), Number(nums[2])];
  return fallback;
}

// 把 token 颜色加上透明度，输出 8 位十六进制，canvas 直接可用。
function tone([r, g, b]: Rgb, alpha: number): string {
  const hex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + hex(r) + hex(g) + hex(b) + hex(Math.max(0, Math.min(1, alpha)) * 255);
}

function readPalette(): Palette {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string) => styles.getPropertyValue(name);
  return {
    text1: parseColor(read('--color-text-1'), [241, 241, 237]),
    text3: parseColor(read('--color-text-3'), [160, 162, 157]),
    glow: parseColor(read('--glow-rgb'), [255, 244, 224]),
    gold: parseColor(read('--color-gold'), [201, 177, 129]),
    enemy: parseColor(read('--color-enemy'), [215, 122, 124]),
    mono: read('--font-mono').trim() || 'monospace',
  };
}

function placeBlip(event: ScoutPlayerEvent, blips: Map<string, Blip>, now: number): Blip {
  const depth = Math.max(0, Math.min(DEPTH_BANDS.length - 1, event.depth));
  const h1 = hash01(event.puuid, 1);
  const h2 = hash01(event.puuid, 2);
  const parent = event.parentPuuid ? blips.get(event.parentPuuid) : undefined;
  const angle = parent && parent.depth > 0
    ? parent.angle + (h1 - 0.5) * ((Math.PI * 0.95) / depth)
    : h1 * TAU;
  const [inner, outer] = DEPTH_BANDS[depth];
  return {
    puuid: event.puuid,
    parent: event.parentPuuid,
    depth,
    seed: event.source === 'seed',
    state: event.state,
    angle,
    radius: depth === 0 ? 0 : inner + (outer - inner) * h2,
    born: now,
    changed: now,
    matchedAt: event.state === 'matched' ? now : 0,
  };
}

function applyEvents(events: ScoutPlayerEvent[], blips: Map<string, Blip>, now: number) {
  for (const event of events) {
    if (!event.puuid) continue;
    const existing = blips.get(event.puuid);
    if (!existing) {
      blips.set(event.puuid, placeBlip(event, blips, now));
      continue;
    }
    if (existing.state === 'matched' || existing.state === event.state) continue;
    existing.state = event.state;
    existing.changed = now;
    if (event.state === 'matched') existing.matchedAt = now;
  }
  if (blips.size > BLIP_LIMIT) {
    // 先丢最早的、已经查完的点；达标的和正在查的一直留着
    for (const [key, blip] of blips) {
      if (blips.size <= BLIP_LIMIT - 80) break;
      if (blip.state !== 'matched' && blip.state !== 'checking' && blip.depth > 0) blips.delete(key);
    }
  }
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

function drawRadar(
  ctx: CanvasRenderingContext2D,
  size: number,
  blips: Map<string, Blip>,
  palette: Palette,
  mode: ScoutRadarMode,
  now: number,
  animate: boolean,
) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 14;
  ctx.clearRect(0, 0, size, size);

  const sweeping = animate && mode !== 'done';
  const period = mode === 'running' ? 3600 : 13000;
  const sweep = sweeping ? ((now / period) * TAU) % TAU : -Math.PI / 2;

  // 盘面底光
  const base = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  base.addColorStop(0, tone(palette.glow, mode === 'running' ? 0.1 : 0.06));
  base.addColorStop(1, tone(palette.glow, 0));
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();

  // 同心圈 + 十字准线
  ctx.lineWidth = 1;
  for (const step of RING_STEPS) {
    ctx.strokeStyle = tone(palette.text1, step === 1 ? 0.2 : 0.075);
    ctx.setLineDash(step === 1 || step === 0.5 ? [] : [2, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, R * step, 0, TAU);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = tone(palette.text1, 0.06);
  ctx.beginPath();
  ctx.moveTo(cx - R, cy);
  ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R);
  ctx.lineTo(cx, cy + R);
  ctx.stroke();

  // 外圈刻度：每 3° 一格，30° 一长格
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * TAU;
    const major = i % 10 === 0;
    const r0 = R + 4;
    const r1 = R + (major ? 10 : 6);
    ctx.strokeStyle = tone(palette.text1, major ? 0.32 : 0.12);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
  }

  // 层级标注（扩散第 1/2/3 层）
  ctx.font = `600 10px ${palette.mono}`;
  ctx.fillStyle = tone(palette.text3, 0.75);
  ctx.textBaseline = 'bottom';
  for (let depth = 1; depth <= 3; depth++) {
    const [inner, outer] = DEPTH_BANDS[depth];
    ctx.fillText(`L${depth}`, cx + R * ((inner + outer) / 2) - 6, cy - 3);
  }

  // 扫描扇面
  if (sweeping) {
    const wedge = mode === 'running' ? 1.05 : 0.8;
    const fan = ctx.createConicGradient(sweep - wedge, cx, cy);
    const edge = wedge / TAU;
    fan.addColorStop(0, tone(palette.glow, 0));
    fan.addColorStop(edge * 0.985, tone(palette.glow, mode === 'running' ? 0.26 : 0.12));
    fan.addColorStop(edge, tone(palette.glow, 0));
    fan.addColorStop(1, tone(palette.glow, 0));
    ctx.fillStyle = fan;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = tone(palette.glow, mode === 'running' ? 0.75 : 0.35);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R);
    ctx.stroke();
  }

  const pos = (blip: Blip): [number, number] => [
    cx + Math.cos(blip.angle) * blip.radius * R,
    cy + Math.sin(blip.angle) * blip.radius * R,
  ];
  // 扫过之后的余辉：刚被扫到最亮，然后慢慢暗下去
  const lit = (blip: Blip) => {
    if (!sweeping) return mode === 'done' ? 0.35 : 0.5;
    const delta = (((sweep - blip.angle) % TAU) + TAU) % TAU;
    return Math.exp(-delta / 1.5);
  };

  // 连线：父 → 子。达标与正在查的线更亮
  ctx.lineWidth = 1;
  for (const blip of blips.values()) {
    if (!blip.parent) continue;
    const parent = blips.get(blip.parent);
    if (!parent) continue;
    const highlight = blip.state === 'matched' ? palette.gold : blip.state === 'checking' ? palette.glow : null;
    ctx.strokeStyle = highlight ? tone(highlight, blip.state === 'matched' ? 0.5 : 0.4) : tone(palette.text1, 0.045);
    const [x0, y0] = pos(parent);
    const [x1, y1] = pos(blip);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // 还没有种子时，圆心留一个小点
  if (blips.size === 0) {
    ctx.fillStyle = tone(palette.text1, 0.55);
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, TAU);
    ctx.fill();
  }

  let recentMatch = 0;
  for (const blip of blips.values()) {
    const [x, y] = pos(blip);
    const age = animate ? Math.min(1, (now - blip.born) / 520) : 1;
    const grow = easeOut(age);
    const glowness = lit(blip);

    if (blip.depth === 0) {
      // 种子：中心菱形
      ctx.fillStyle = tone(palette.text1, 0.9);
      ctx.beginPath();
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x + 4, y);
      ctx.lineTo(x, y + 4);
      ctx.lineTo(x - 4, y);
      ctx.closePath();
      ctx.fill();
      continue;
    }

    if (blip.state === 'matched') {
      const since = now - blip.matchedAt;
      if (animate && since < 1400) recentMatch = Math.max(recentMatch, 1 - since / 1400);
      // 锁定：实心金点 + 圈 + 四角括号；刚锁定时有一圈冲击波
      ctx.save();
      ctx.shadowColor = tone(palette.gold, 0.9);
      ctx.shadowBlur = 10;
      ctx.fillStyle = tone(palette.gold, 1);
      ctx.beginPath();
      ctx.arc(x, y, 3.2 * grow, 0, TAU);
      ctx.fill();
      ctx.restore();
      const breathe = animate ? 0.5 + 0.5 * Math.sin(now / 520 + blip.angle * 3) : 0.6;
      ctx.strokeStyle = tone(palette.gold, 0.35 + breathe * 0.3);
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, TAU);
      ctx.stroke();
      const b = 10;
      const l = 3.5;
      ctx.strokeStyle = tone(palette.gold, 0.8);
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        ctx.moveTo(x + sx * b, y + sy * (b - l));
        ctx.lineTo(x + sx * b, y + sy * b);
        ctx.lineTo(x + sx * (b - l), y + sy * b);
      }
      ctx.stroke();
      if (animate && since < 1200) {
        const t = easeOut(since / 1200);
        ctx.strokeStyle = tone(palette.gold, 0.8 * (1 - t));
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 4 + t * 30, 0, TAU);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
      continue;
    }

    if (blip.state === 'checking') {
      ctx.fillStyle = tone(palette.glow, 1);
      ctx.beginPath();
      ctx.arc(x, y, 2.4 * grow, 0, TAU);
      ctx.fill();
      if (animate) {
        const phase = ((now - blip.changed) % 900) / 900;
        ctx.strokeStyle = tone(palette.glow, 0.7 * (1 - phase));
        ctx.beginPath();
        ctx.arc(x, y, 3 + phase * 9, 0, TAU);
        ctx.stroke();
      }
      continue;
    }

    const color = blip.state === 'failed' ? palette.enemy : blip.state === 'checked' ? palette.text3 : palette.text1;
    const alpha = blip.state === 'queued'
      ? 0.22 + glowness * 0.6
      : blip.state === 'failed'
        ? 0.3 + glowness * 0.4
        : 0.18 + glowness * 0.45;
    const flash = animate && age < 1 ? (1 - age) * 0.6 : 0;
    ctx.fillStyle = tone(color, Math.min(1, alpha + flash));
    ctx.beginPath();
    ctx.arc(x, y, (blip.seed ? 1.9 : 1.4) * (0.4 + grow * 0.6) + flash * 2, 0, TAU);
    ctx.fill();
  }

  // 有人刚被锁定：外圈闪一下金色
  if (recentMatch > 0) {
    ctx.strokeStyle = tone(palette.gold, recentMatch * 0.7);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

interface ScoutRadarProps {
  feed: ScoutRadarFeed;
  mode: ScoutRadarMode;
  className?: string;
}

export function ScoutRadar({ feed, mode, className = '' }: ScoutRadarProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modeRef = useRef<ScoutRadarMode>(mode);
  const wakeRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    modeRef.current = mode;
    wakeRef.current();
  }, [mode]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!wrap || !canvas || !ctx) return;

    const blips = new Map<string, Blip>();
    let palette = readPalette();
    let size = 0;
    let frame = 0;
    let lastFrame = 0;
    let visible = true;
    const reducedQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let reduced = Boolean(reducedQuery?.matches);

    const paint = (now: number) => {
      if (size <= 0) return;
      drawRadar(ctx, size, blips, palette, modeRef.current, now, !reduced);
    };

    const loop = (now: number) => {
      frame = 0;
      if (!visible || document.visibilityState !== 'visible' || reduced) return;
      // 待机与完成时降到 30 帧
      const budget = modeRef.current === 'running' ? 0 : 32;
      if (now - lastFrame >= budget) {
        lastFrame = now;
        paint(now);
      }
      frame = requestAnimationFrame(loop);
    };

    const wake = () => {
      if (reduced) {
        paint(performance.now());
        return;
      }
      if (frame === 0 && visible && document.visibilityState === 'visible') {
        frame = requestAnimationFrame(loop);
      }
    };
    wakeRef.current = wake;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const next = Math.floor(Math.min(rect.width, rect.height));
      if (next <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      size = next;
      canvas.width = Math.round(next * dpr);
      canvas.height = Math.round(next * dpr);
      canvas.style.width = `${next}px`;
      canvas.style.height = `${next}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(performance.now());
    };

    applyEvents(feed.history(), blips, performance.now() - 2000);
    const unsubscribe = feed.subscribe((events) => {
      if (events === null) blips.clear();
      else applyEvents(events, blips, performance.now());
      if (reduced) paint(performance.now());
    });

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(wrap);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) wake();
    });
    intersection.observe(wrap);

    // 切换深浅色 / 配色时重新取色
    const themeObserver = new MutationObserver(() => {
      palette = readPalette();
      paint(performance.now());
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode', 'data-theme'] });

    const onVisibility = () => wake();
    document.addEventListener('visibilitychange', onVisibility);
    const onReducedChange = () => {
      reduced = Boolean(reducedQuery?.matches);
      wake();
    };
    reducedQuery?.addEventListener?.('change', onReducedChange);

    resize();
    wake();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      wakeRef.current = () => undefined;
      unsubscribe();
      resizeObserver.disconnect();
      intersection.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      reducedQuery?.removeEventListener?.('change', onReducedChange);
    };
  }, [feed]);

  return (
    <div ref={wrapRef} className={`scout-radar ${className}`} data-mode={mode} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
