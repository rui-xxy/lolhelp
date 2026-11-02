import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { GameIcon } from '../match/GameIcon';
import type { ScoutHit, ScoutPlayerEvent, ScoutPlayerState } from '../../../shared/api';
import { hash01, type ScoutFeed } from './scoutFeed';

// 「众里寻他」的灯海。
// 每个被翻看的玩家是一盏失焦的灯：被看的时候亮起来，看完慢慢暗下去。
// 关系隔得越远，灯越小、越远、漂得越慢（视差），同一个人牵出来的人聚成一簇。
// 找到的人被「对焦」：光斑收紧、滑到自己的位置，成为一颗不会再漂走的金点。
// 跑的时候只画引擎推来的真实候选；只有待机 / 结束后有几颗很淡的装饰远灯。

export type LanternMode = 'idle' | 'running' | 'done';

type Rgb = [number, number, number];
type LightState = ScoutPlayerState | 'ambient';

interface Light {
  key: string;
  depth: number;
  u: number;
  v: number;
  state: LightState;
  born: number;
  changed: number;
  vary: number;
  from?: { u: number; v: number };
  to?: { u: number; v: number };
  leaving?: number;
}

interface Palette {
  light: Rgb;
  gold: Rgb;
  dark: boolean;
}

interface Sprites {
  disc: HTMLCanvasElement;
  warm: HTMLCanvasElement;
  point: HTMLCanvasElement;
  warmPoint: HTMLCanvasElement;
  gold: HTMLCanvasElement;
}

const TAU = Math.PI * 2;
const LIGHT_LIMIT = 1100;
// 关系层数 → 灯的大小（px，按舞台高度缩放）/ 亮度 / 横向漂移速度（px/s）/ 聚簇范围
const DEPTH_RADIUS = [30, 22, 15, 10, 6.4, 4.6];
const DEPTH_ALPHA = [0.5, 0.5, 0.56, 0.62, 0.8, 0.9];
const DEPTH_DRIFT = [16, 13, 9, 6, 4.4, 3.2];
const DEPTH_SPREAD = [0, 0.3, 0.2, 0.15, 0.12, 0.1];
const GLIDE_MS = 950;
const FOCUS_MS = 1100;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const depthOf = (depth: number) => clamp(Math.round(depth), 0, DEPTH_RADIUS.length - 1);

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

// 把 token 颜色加上透明度，输出 8 位十六进制，canvas 直接可用
function tone([r, g, b]: Rgb, alpha: number): string {
  const hex = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return '#' + hex(r) + hex(g) + hex(b) + hex(clamp(alpha, 0, 1) * 255);
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function readPalette(): Palette {
  const styles = getComputedStyle(document.documentElement);
  const dark = document.documentElement.dataset.mode !== 'light';
  return {
    // 深色：暖白的灯；浅色：宣纸上的墨
    light: dark
      ? parseColor(styles.getPropertyValue('--glow-rgb'), [255, 244, 224])
      : parseColor(styles.getPropertyValue('--color-text-2'), [70, 66, 60]),
    gold: parseColor(styles.getPropertyValue('--color-gold'), [201, 177, 129]),
    dark,
  };
}

function makeSprite(size: number, paint: (ctx: CanvasRenderingContext2D, c: number) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) paint(ctx, size / 2);
  return canvas;
}

// 失焦光斑：外面一圈很淡的晕，里面是边缘略亮的圆盘，像镜头里虚化的街灯
function discSprite(color: Rgb, dark: boolean): HTMLCanvasElement {
  if (!dark) {
    // 浅色：墨点在宣纸上晕开，中间浓、边缘洇散，没有亮边
    return makeSprite(160, (ctx, c) => {
      const g = ctx.createRadialGradient(c, c, 0, c, c, c * 0.7);
      g.addColorStop(0, tone(color, 0.5));
      g.addColorStop(0.45, tone(color, 0.42));
      g.addColorStop(0.78, tone(color, 0.16));
      g.addColorStop(1, tone(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c * 2, c * 2);
    });
  }
  return makeSprite(160, (ctx, c) => {
    const halo = ctx.createRadialGradient(c, c, c * 0.5, c, c, c);
    halo.addColorStop(0, tone(color, dark ? 0.16 : 0.08));
    halo.addColorStop(1, tone(color, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, c * 2, c * 2);
    const r = c * 0.62;
    const g = ctx.createRadialGradient(c, c, 0, c, c, r);
    g.addColorStop(0, tone(color, 0.62));
    g.addColorStop(0.7, tone(color, 0.68));
    g.addColorStop(0.9, tone(color, 0.86));
    g.addColorStop(0.97, tone(color, 0.4));
    g.addColorStop(1, tone(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, TAU);
    ctx.fill();
  });
}

// 远处的小灯：一颗带晕的亮点（浅色时是一滴淡墨）
function pointSprite(color: Rgb, dark: boolean): HTMLCanvasElement {
  return makeSprite(64, (ctx, c) => {
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, tone(color, dark ? 1 : 0.55));
    g.addColorStop(dark ? 0.16 : 0.3, tone(color, dark ? 0.8 : 0.36));
    g.addColorStop(dark ? 0.42 : 0.62, tone(color, dark ? 0.16 : 0.08));
    g.addColorStop(1, tone(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c * 2, c * 2);
  });
}

function makeSprites(palette: Palette): Sprites {
  const warmColor = mix(palette.light, palette.gold, palette.dark ? 0.55 : 0.35);
  const disc = discSprite(palette.light, palette.dark);
  const warm = discSprite(warmColor, palette.dark);
  const point = pointSprite(palette.light, palette.dark);
  const warmPoint = pointSprite(warmColor, palette.dark);
  const gold = makeSprite(96, (ctx, c) => {
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, tone(palette.gold, 0.95));
    g.addColorStop(0.25, tone(palette.gold, 0.5));
    g.addColorStop(0.6, tone(palette.gold, 0.12));
    g.addColorStop(1, tone(palette.gold, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c * 2, c * 2);
  });
  return { disc, warm, point, warmPoint, gold };
}

function gauss(seed: string, salt: number): number {
  const a = Math.max(1e-4, hash01(seed, salt));
  const b = hash01(seed, salt + 1);
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(TAU * b);
}

function bounce(v: number): number {
  if (v < 0.06) return 0.06 + (0.06 - v);
  if (v > 0.94) return 0.94 - (v - 0.94);
  return v;
}

interface Field {
  lights: Map<string, Light>;
  focusAt: number;
  clear: number; // 左边文字占到舞台宽度的多少，灯在这之前收淡
}

function placeLight(event: ScoutPlayerEvent, field: Field, aspect: number, now: number): Light {
  const depth = depthOf(event.depth);
  const parent = event.parentPuuid ? field.lights.get(event.parentPuuid) : undefined;
  let u: number;
  let v: number;
  if (depth === 0) {
    u = 0.64;
    v = 0.56;
  } else if (parent) {
    const spread = DEPTH_SPREAD[depth];
    u = parent.u + (gauss(event.puuid, 3) * spread * 1.7) / aspect;
    v = bounce(parent.v + gauss(event.puuid, 7) * spread * 0.8);
  } else {
    u = 0.34 + hash01(event.puuid, 5) * 0.7;
    v = 0.08 + hash01(event.puuid, 6) * 0.84;
  }
  return {
    key: event.puuid,
    depth,
    u: ((u % 1.08) + 1.08) % 1.08,
    v,
    state: event.state,
    born: now,
    changed: now,
    vary: hash01(event.puuid, 9),
  };
}

function applyEvents(events: ScoutPlayerEvent[], field: Field, feed: ScoutFeed, aspect: number, now: number) {
  for (const event of events) {
    if (!event.puuid) continue;
    let light = field.lights.get(event.puuid);
    if (!light) {
      light = placeLight(event, field, aspect, now);
      field.lights.set(event.puuid, light);
    } else if (light.state === 'matched' || light.state === event.state) {
      continue;
    } else {
      light.state = event.state;
      light.changed = now;
    }
    if (event.state === 'matched') {
      const pin = feed.pin(event.puuid, true);
      light.from = { u: light.u, v: light.v };
      light.to = { u: pin.x, v: pin.y };
      field.focusAt = now;
    }
  }
  if (field.lights.size > LIGHT_LIMIT) {
    for (const [key, light] of field.lights) {
      if (field.lights.size <= LIGHT_LIMIT - 120) break;
      if (light.state !== 'checking' && light.state !== 'matched' && light.depth > 0) field.lights.delete(key);
    }
  }
}

function syncAmbient(field: Field, mode: LanternMode, width: number, height: number, now: number) {
  const want = mode === 'running' ? 0 : Math.round((width * height) / (mode === 'idle' ? 6800 : 16000));
  let have = 0;
  for (const light of field.lights.values()) {
    if (light.state !== 'ambient' || light.leaving) continue;
    have += 1;
    if (have > want) light.leaving = now;
  }
  for (let i = have; i < want; i++) {
    const key = `ambient-${now}-${i}`;
    const depth = depthOf(1 + Math.floor(hash01(key, 1) ** 0.7 * 5));
    // 远处的小灯沿一条「地平线」聚着，近处的大光斑散在各处
    const horizon = 0.62 + gauss(key, 30) * 0.12;
    const v = depth >= 3 ? horizon : 0.08 + hash01(key, 3) * 0.84;
    field.lights.set(key, {
      key,
      depth,
      u: hash01(key, 2) * 1.08,
      v: clamp(v, 0.06, 0.94),
      state: 'ambient',
      born: now - hash01(key, 4) * 3000,
      changed: now,
      vary: hash01(key, 5),
    });
  }
}

// 返回 [亮度, 半径倍数]；返回 null 表示这盏灯可以移除了
function lightLevel(light: Light, now: number): [number, number] | null {
  const age = now - light.born;
  const since = now - light.changed;
  switch (light.state) {
    case 'ambient': {
      const fadeIn = smooth(0, 1800, age);
      const leave = light.leaving ? 1 - smooth(0, 1400, now - light.leaving) : 1;
      if (leave <= 0) return null;
      const twinkle = 0.7 + 0.3 * Math.sin(now / 2300 + light.vary * 40);
      return [(0.18 + 0.5 * light.vary * light.vary) * fadeIn * leave * twinkle, 1];
    }
    case 'queued': {
      if (age > 12000) return null;
      return [0.14 * smooth(0, 600, age) * (1 - smooth(9000, 12000, age)), 0.3];
    }
    case 'checking':
      return [0.25 + 0.75 * easeOut(clamp(since / 280, 0, 1)), 0.5 + 0.5 * easeOut(clamp(since / 280, 0, 1))];
    case 'checked': {
      if (since > 5200) return null;
      return [Math.exp(-since / 1500), 1 - 0.18 * clamp(since / 1500, 0, 1)];
    }
    case 'failed': {
      if (since > 1400) return null;
      return [0.6 * Math.exp(-since / 320), 0.8];
    }
    case 'matched':
      return since > GLIDE_MS ? null : [1, 1];
    default:
      return null;
  }
}

function drawField(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  field: Field,
  feed: ScoutFeed,
  palette: Palette,
  sprites: Sprites,
  now: number,
) {
  ctx.clearRect(0, 0, width, height);
  const scale = clamp(height / 212, 0.85, 1.7);
  const focusT = (now - field.focusAt) / FOCUS_MS;
  // 有人被对焦的那一下：其余的灯同时更虚、更暗
  const pull = focusT >= 0 && focusT < 1 ? Math.sin(Math.PI * focusT) : 0;
  ctx.globalCompositeOperation = palette.dark ? 'lighter' : 'source-over';
  const inkScale = palette.dark ? 1 : 0.78;
  // 自动曝光：同时亮着的灯太多时整体收一点，画面不会糊成一片白
  let bright = 0;
  for (const light of field.lights.values()) {
    if (light.state === 'checking' || (light.state === 'checked' && now - light.changed < 1500)) bright += light.depth <= 2 ? 1 : 0.4;
  }
  const exposure = Math.min(1, Math.sqrt(18 / Math.max(18, bright)));

  for (const [key, light] of field.lights) {
    const level = lightLevel(light, now);
    if (!level) {
      field.lights.delete(key);
      continue;
    }
    const [alpha, size] = level;
    if (light.state === 'matched' && light.from && light.to) {
      // 对焦：光斑一边收紧一边滑到自己的位置
      const t = easeInOut(clamp((now - light.changed) / GLIDE_MS, 0, 1));
      const x = (light.from.u + (light.to.u - light.from.u) * t) * width;
      const y = (light.from.v + (light.to.v - light.from.v) * t) * height;
      const r = DEPTH_RADIUS[light.depth] * scale * (1.5 - 1.25 * t) + 4;
      ctx.globalAlpha = 0.6 * (1 - t) * inkScale;
      ctx.drawImage(sprites.disc, x - r, y - r, r * 2, r * 2);
      const g = 14 + 30 * (1 - t);
      ctx.globalAlpha = 0.5 + 0.5 * t;
      ctx.drawImage(sprites.gold, x - g, y - g, g * 2, g * 2);
      continue;
    }
    const x = light.u * width;
    const y = light.v * height;
    // 左边压着那句话、右上压着计数，灯在那里收得很淡
    const meter = smooth(0.8, 0.9, light.u) * (1 - smooth(0.38, 0.56, light.v));
    const mask = (0.12 + 0.88 * smooth(field.clear * 0.5, field.clear + 0.05, light.u)) * (1 - 0.7 * meter) * (light.state === 'ambient' ? 1 : exposure);
    const r = DEPTH_RADIUS[light.depth] * scale * size * (1 + 0.4 * pull) * (0.85 + light.vary * 0.3);
    const a = alpha * DEPTH_ALPHA[light.depth] * mask * (1 - 0.55 * pull) * inkScale;
    if (a < 0.004) continue;
    ctx.globalAlpha = a;
    // 三成的灯偏暖，像灯笼；近处是虚化的圆盘，远处只剩一颗亮点
    const warm = light.vary > 0.68;
    const disc = light.depth <= 3 && light.state !== 'queued';
    const sprite = disc ? (warm ? sprites.warm : sprites.disc) : warm ? sprites.warmPoint : sprites.point;
    const rr = disc ? r / 0.62 : r * 1.7;
    ctx.drawImage(sprite, x - rr, y - rr, rr * 2, rr * 2);
  }

  // 已经找到的人：钉在原地，金色的晕慢慢呼吸
  for (const [key, pin] of feed.pins()) {
    const settling = field.lights.get(key);
    if (settling?.state === 'matched' && now - settling.changed < GLIDE_MS) continue;
    const breathe = 0.75 + 0.25 * Math.sin(now / 1300 + hash01(key, 21) * 9);
    const g = 16 * scale;
    ctx.globalAlpha = 0.55 * breathe;
    ctx.drawImage(sprites.gold, pin.x * width - g, pin.y * height - g, g * 2, g * 2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function bestMatch(hit: ScoutHit) {
  return [...hit.qualifyingMatches].sort((a, b) => b.kda - a.kda)[0];
}

interface ScoutLanternsProps {
  feed: ScoutFeed;
  mode: LanternMode;
  hits: ScoutHit[];
  activeKey?: string | null;
  glowKey?: string | null;
  showPins: boolean;
  clearRef?: RefObject<HTMLElement | null>;
  onPick?: (hit: ScoutHit) => void;
  onHover?: (key: string | null) => void;
  className?: string;
}

const hitKey = (hit: ScoutHit) => hit.profile.puuid || hit.profile.riotId;

export function ScoutLanterns({
  feed,
  mode,
  hits,
  activeKey,
  glowKey,
  showPins,
  clearRef,
  onPick,
  onHover,
  className = '',
}: ScoutLanternsProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modeRef = useRef<LanternMode>(mode);
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

    const field: Field = { lights: new Map(), focusAt: -1e9, clear: 0.45 };
    let lastMeasure = 0;
    const measure = (now: number) => {
      lastMeasure = now;
      const block = clearRef?.current;
      if (!block || width <= 0) return;
      const box = wrap.getBoundingClientRect();
      field.clear = clamp((block.getBoundingClientRect().right - box.left) / width, 0.2, 0.7);
    };
    let palette = readPalette();
    let sprites = makeSprites(palette);
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = 0;
    let lastAmbient = 0;
    let visible = true;
    const reducedQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let reduced = Boolean(reducedQuery?.matches);

    const step = (now: number) => {
      const dt = Math.min(64, now - (last || now)) / 1000;
      last = now;
      const mode = modeRef.current;
      if (now - lastMeasure > 200) measure(now);
      if (now - lastAmbient > 400) {
        lastAmbient = now;
        syncAmbient(field, mode, width, height, now);
      }
      const pace = mode === 'running' ? 1 : mode === 'idle' ? 0.55 : 0.35;
      for (const light of field.lights.values()) {
        if (light.state === 'matched') continue;
        light.u -= (DEPTH_DRIFT[light.depth] * pace * dt) / Math.max(1, width);
        if (light.u < -0.06) light.u += 1.12;
      }
    };

    const paint = (now: number) => {
      if (width <= 0 || height <= 0) return;
      drawField(ctx, width, height, field, feed, palette, sprites, now);
    };

    const loop = (now: number) => {
      frame = 0;
      if (!visible || document.visibilityState !== 'visible') return;
      const budget = modeRef.current === 'running' ? 0 : 30;
      if (now - last >= budget) {
        step(now);
        paint(now);
      }
      if (!reduced) frame = requestAnimationFrame(loop);
    };

    const wake = () => {
      if (reduced) {
        const now = performance.now();
        syncAmbient(field, modeRef.current, width, height, now);
        paint(now + 4000);
        return;
      }
      if (frame === 0 && visible && document.visibilityState === 'visible') frame = requestAnimationFrame(loop);
    };
    wakeRef.current = wake;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(performance.now());
    };

    const aspect = () => Math.max(1, width / Math.max(1, height));
    applyEvents(feed.history(), field, feed, aspect(), performance.now() - 6000);
    const unsubscribe = feed.subscribe((events) => {
      if (events === null) {
        for (const [key, light] of field.lights) if (light.state !== 'ambient') field.lights.delete(key);
      } else {
        applyEvents(events, field, feed, aspect(), performance.now());
      }
      wake();
    });

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(wrap);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) wake();
    });
    intersection.observe(wrap);
    const themeObserver = new MutationObserver(() => {
      palette = readPalette();
      sprites = makeSprites(palette);
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
  }, [clearRef, feed]);

  const now = Date.now();
  // 只有最新找到的那位会自己浮出名字，其余的悬停才显示，避免名字叠在一起
  let newestKey = '';
  let newestAt = 0;
  if (showPins) {
    for (const hit of hits) {
      const pin = feed.pin(hitKey(hit));
      if (pin.at > newestAt) {
        newestAt = pin.at;
        newestKey = hitKey(hit);
      }
    }
  }
  return (
    <div ref={wrapRef} className={`sx-lanterns ${className}`} data-mode={mode}>
      <canvas ref={canvasRef} aria-hidden="true" />
      {showPins && hits.map((hit) => {
        const key = hitKey(hit);
        const pin = feed.pin(key);
        const match = bestMatch(hit);
        const name = (hit.profile.riotId || '未知玩家').split('#')[0];
        const fresh = key === newestKey && now - pin.at < 5200;
        return (
          <button
            key={key}
            type="button"
            className="sx-pin"
            data-fresh={fresh ? 'true' : undefined}
            data-active={activeKey === key ? 'true' : undefined}
            data-glow={glowKey === key ? 'true' : undefined}
            data-side={pin.x > 0.66 ? 'left' : 'right'}
            style={{ '--x': `${pin.x * 100}%`, '--y': `${pin.y * 100}%` } as CSSProperties}
            onClick={() => onPick?.(hit)}
            onMouseEnter={() => onHover?.(key)}
            onMouseLeave={() => onHover?.(null)}
            onFocus={() => onHover?.(key)}
            onBlur={() => onHover?.(null)}
            aria-label={`速览 ${hit.profile.riotId}`}
          >
            <i className="sx-pin__dot" aria-hidden="true" />
            <i className="sx-pin__af" aria-hidden="true" />
            <span className="sx-pin__tag">
              {match && <GameIcon src={match.championAvatar} alt={match.championName} size={18} rounded />}
              <b>{name}</b>
              {match && <em>{match.kills}/{match.deaths}/{match.assists}</em>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
