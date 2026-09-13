import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock3, Search, Sparkles, X } from 'lucide-react';
import type { ScoutPlayerEvent, ScoutPlayerState, ScoutProgress } from '../../../shared/api';
import { ProfileIcon } from '../ProfileIcon';
import { GameIcon } from '../match/GameIcon';
import { ScoutEnergyCore } from './ScoutEnergyCore';

interface ScoutSearchVisualizerProps {
  players: ScoutPlayerEvent[];
  totalPlayerCount: number;
  stateCounts: Record<ScoutPlayerState, number>;
  runId: number;
  running: boolean;
  phase: ScoutProgress['phase'] | null;
  checkedCount: number;
  hitCount: number;
  onPlayerClick?: (riotId: string) => void;
}

interface VisualNode {
  id: string;
  hash: number;
  event: ScoutPlayerEvent;
  shortName: string;
  labelWidth: number;
  moteSeeds: number[];
  order: number;
  cluster: number;
  x: number;
  y: number;
  baseTargetX: number;
  baseTargetY: number;
  targetX: number;
  targetY: number;
  velocityX: number;
  velocityY: number;
  alpha: number;
  scale: number;
  radius: number;
  createdAt: number;
  stateChangedAt: number;
  exitStartedAt: number | null;
  exitOriginX: number;
  exitOriginY: number;
  exitAlpha: number;
  exitScale: number;
  image: HTMLImageElement | null;
  imageUrl: string;
}

interface ClusterLayout {
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  count: number;
  activity: number;
  radiusX: number;
  radiusY: number;
}

interface HoveredPlayer {
  event: ScoutPlayerEvent;
  x: number;
  y: number;
}

const MAX_VISIBLE_NODES = 20;
const CLUSTER_COUNT = 5;
const ACTIVE_FRAME_INTERVAL = 1000 / 60;
const IDLE_FRAME_INTERVAL = 1000 / 24;
const NODE_SPRITE_SIZE = 128;
const NODE_EXIT_DURATION = 1800;

const STATE_LABELS: Record<ScoutPlayerState, string> = {
  queued: '等待检查',
  checking: '正在检查',
  checked: '未达标',
  matched: '符合条件',
  failed: '暂时跳过',
};

const STATE_COLORS: Record<ScoutPlayerState, string> = {
  queued: '#69aeb8',
  checking: '#3f97a8',
  checked: '#8999a3',
  matched: '#e95e83',
  failed: '#9aa0a5',
};

interface NodePalette {
  glow: string;
  haloInner: string;
  haloMid: string;
  haloOuter: string;
  spark: string;
  labelFill: string;
  labelBorder: string;
  labelText: string;
}

const NODE_PALETTES: Record<ScoutPlayerState, NodePalette> = {
  queued: {
    glow: 'rgba(102, 184, 195, 0.52)',
    haloInner: 'rgba(255, 255, 255, 0.7)',
    haloMid: 'rgba(112, 190, 200, 0.2)',
    haloOuter: 'rgba(82, 143, 151, 0)',
    spark: 'rgba(229, 252, 253, 0.98)',
    labelFill: 'rgba(251, 253, 253, 0.9)',
    labelBorder: 'rgba(80, 130, 138, 0.18)',
    labelText: '#3c4b50',
  },
  checking: {
    glow: 'rgba(72, 180, 198, 0.72)',
    haloInner: 'rgba(245, 255, 255, 0.78)',
    haloMid: 'rgba(73, 183, 201, 0.3)',
    haloOuter: 'rgba(39, 132, 149, 0)',
    spark: 'rgba(221, 252, 255, 1)',
    labelFill: 'rgba(247, 253, 253, 0.94)',
    labelBorder: 'rgba(50, 151, 168, 0.25)',
    labelText: '#24535d',
  },
  checked: {
    glow: 'rgba(139, 164, 178, 0.4)',
    haloInner: 'rgba(252, 254, 255, 0.58)',
    haloMid: 'rgba(132, 162, 178, 0.16)',
    haloOuter: 'rgba(78, 101, 116, 0)',
    spark: 'rgba(242, 249, 251, 0.94)',
    labelFill: 'rgba(251, 252, 252, 0.84)',
    labelBorder: 'rgba(93, 112, 123, 0.16)',
    labelText: '#56646b',
  },
  matched: {
    glow: 'rgba(241, 104, 145, 0.76)',
    haloInner: 'rgba(255, 249, 251, 0.82)',
    haloMid: 'rgba(242, 105, 148, 0.3)',
    haloOuter: 'rgba(191, 54, 103, 0)',
    spark: 'rgba(255, 236, 244, 1)',
    labelFill: 'rgba(255, 247, 250, 0.94)',
    labelBorder: 'rgba(217, 75, 119, 0.24)',
    labelText: '#8c294c',
  },
  failed: {
    glow: 'rgba(145, 153, 158, 0.24)',
    haloInner: 'rgba(244, 246, 247, 0.4)',
    haloMid: 'rgba(145, 154, 160, 0.1)',
    haloOuter: 'rgba(86, 93, 98, 0)',
    spark: 'rgba(231, 235, 237, 0.72)',
    labelFill: 'rgba(250, 251, 251, 0.76)',
    labelBorder: 'rgba(104, 111, 116, 0.13)',
    labelText: '#71777b',
  },
};

function createNodeGlowSprite(palette: NodePalette, avatarHighlight = false): HTMLCanvasElement {
  const sprite = document.createElement('canvas');
  sprite.width = NODE_SPRITE_SIZE;
  sprite.height = NODE_SPRITE_SIZE;
  const spriteContext = sprite.getContext('2d');
  if (!spriteContext) return sprite;

  const center = NODE_SPRITE_SIZE / 2;
  const gradient = avatarHighlight
    ? spriteContext.createRadialGradient(
        center * 0.72,
        center * 0.7,
        0,
        center * 0.88,
        center * 0.88,
        center * 1.15,
      )
    : spriteContext.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, palette.haloInner);
  gradient.addColorStop(avatarHighlight ? 0.42 : 0.28, avatarHighlight ? 'rgba(255, 255, 255, 0.045)' : palette.haloMid);
  gradient.addColorStop(1, avatarHighlight ? 'rgba(255, 255, 255, 0)' : palette.haloOuter);
  spriteContext.fillStyle = gradient;
  spriteContext.fillRect(0, 0, NODE_SPRITE_SIZE, NODE_SPRITE_SIZE);
  return sprite;
}

function createCoreMaskSprite(): HTMLCanvasElement {
  const sprite = document.createElement('canvas');
  sprite.width = NODE_SPRITE_SIZE;
  sprite.height = NODE_SPRITE_SIZE;
  const spriteContext = sprite.getContext('2d');
  if (!spriteContext) return sprite;

  const center = NODE_SPRITE_SIZE / 2;
  const gradient = spriteContext.createRadialGradient(center, center, center * 0.57, center, center, center);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(0.68, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  spriteContext.fillStyle = gradient;
  spriteContext.fillRect(0, 0, NODE_SPRITE_SIZE, NODE_SPRITE_SIZE);
  return sprite;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mixHash(value: number, salt: number): number {
  let mixed = (value ^ salt) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function getPlayerName(player: ScoutPlayerEvent): string {
  const riotId = player.profile?.riotId?.trim();
  if (riotId) return riotId;
  return `玩家 ${player.puuid.slice(-6)}`;
}

function getPlayerShortName(player: ScoutPlayerEvent): string {
  return getPlayerName(player).split('#')[0] || getPlayerName(player);
}

function getPlayerImage(player: ScoutPlayerEvent): string {
  return player.profile?.profileIconUrl || player.recentChampionAvatar || '';
}

function getPlayerKda(player: ScoutPlayerEvent): string {
  if (
    player.recentKills === undefined ||
    player.recentDeaths === undefined ||
    player.recentAssists === undefined
  ) {
    return '';
  }
  return `${player.recentKills}/${player.recentDeaths}/${player.recentAssists}`;
}

function getNodeRadius(player: ScoutPlayerEvent): number {
  if (player.state === 'matched') return 17;
  if (player.state === 'checking') return 15;
  if (player.source === 'seed') return 14;
  return 13;
}

function selectVisiblePlayers(players: ScoutPlayerEvent[]): ScoutPlayerEvent[] {
  const selected: ScoutPlayerEvent[] = [];
  const seen = new Set<string>();

  const appendRecent = (predicate: (player: ScoutPlayerEvent) => boolean, limit: number) => {
    let appended = 0;
    for (let index = players.length - 1; index >= 0 && selected.length < MAX_VISIBLE_NODES; index -= 1) {
      const player = players[index];
      if (seen.has(player.puuid) || !predicate(player)) continue;
      seen.add(player.puuid);
      selected.push(player);
      appended += 1;
      if (appended >= limit) break;
    }
  };

  appendRecent((player) => player.state === 'matched', 4);
  appendRecent((player) => player.state === 'checking', 6);
  appendRecent((player) => player.state !== 'queued', MAX_VISIBLE_NODES);
  appendRecent(() => true, MAX_VISIBLE_NODES);
  return selected.reverse();
}

function drawAvatar(
  context: CanvasRenderingContext2D,
  node: VisualNode,
  x: number,
  y: number,
  radius: number,
): void {
  context.save();
  context.beginPath();
  context.arc(x, y, Math.max(1, radius - 0.6), 0, Math.PI * 2);
  context.clip();
  if (node.image?.complete && node.image.naturalWidth > 0) {
    context.drawImage(node.image, x - radius, y - radius, radius * 2, radius * 2);
  } else {
    const fill = context.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
    fill.addColorStop(0, '#f9fbfa');
    fill.addColorStop(1, node.event.state === 'matched' ? '#f9d9df' : '#dce9ec');
    context.fillStyle = fill;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    context.fillStyle = STATE_COLORS[node.event.state];
    context.font = `700 ${Math.max(8, radius * 0.82)}px system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(getPlayerShortName(node.event).slice(0, 1), x, y + 0.5);
  }
  context.restore();
}

function drawWarpedSpaceGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  centerX: number,
  time: number,
  reducedMotion: boolean,
): void {
  const animatedTime = reducedMotion ? 1 : time;
  const horizon = height * 0.65;
  const floorHeight = height - horizon;
  const floorGlow = context.createLinearGradient(0, horizon - 16, 0, height);
  floorGlow.addColorStop(0, 'rgba(86, 136, 145, 0)');
  floorGlow.addColorStop(0.25, 'rgba(86, 136, 145, 0.018)');
  floorGlow.addColorStop(1, 'rgba(86, 136, 145, 0.045)');
  context.fillStyle = floorGlow;
  context.fillRect(0, horizon - 16, width, floorHeight + 16);

  context.save();
  context.lineWidth = 0.65;
  for (let row = 0; row <= 10; row += 1) {
    const progress = row / 10;
    const baseY = horizon + Math.pow(progress, 1.58) * floorHeight;
    context.strokeStyle = `rgba(65, 112, 121, ${0.032 + progress * 0.044})`;
    context.beginPath();
    for (let x = -12; x <= width + 12; x += 10) {
      const normalizedX = (x - centerX) / Math.max(1, width * 0.48);
      const centerDistance = normalizedX / 0.52;
      const centerLift = Math.exp(-centerDistance * centerDistance) * (1 - progress) * 24;
      const edgeRoll = Math.pow(Math.abs(normalizedX), 2.15) * (1 - progress) * 8;
      const wave =
        Math.sin(normalizedX * 7.2 + animatedTime * 0.24 + row * 0.38) *
        (2.2 + (1 - progress) * 2.8);
      const y = baseY - centerLift + edgeRoll + wave;
      if (x === -12) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }

  for (let column = -8; column <= 8; column += 1) {
    const bottomX = centerX + column * (width / 14);
    const startX = centerX + (bottomX - centerX) * 0.16;
    const bend = Math.sin(column * 0.72 + animatedTime * 0.14) * 12;
    context.strokeStyle = `rgba(65, 112, 121, ${0.028 + Math.abs(column) * 0.0025})`;
    context.beginPath();
    context.moveTo(startX, horizon - 2);
    context.bezierCurveTo(
      centerX + (bottomX - centerX) * 0.3 + bend,
      horizon + floorHeight * 0.2 - Math.cos(column * 0.45) * 8,
      centerX + (bottomX - centerX) * 0.7 - bend * 0.65,
      horizon + floorHeight * 0.68 + Math.sin(column * 0.52) * 7,
      bottomX,
      height + 4,
    );
    context.stroke();
  }
  context.restore();
}

// Kept as a lightweight fallback for WebGL-disabled environments.
function drawIridescentScannerField(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  time: number,
  running: boolean,
  reducedMotion: boolean,
  activity: number,
): void {
  const animatedTime = reducedMotion ? 1.2 : time;
  const pulse = running ? (Math.sin(animatedTime * 1.7) + 1) / 2 : 0.25;
  const bob = reducedMotion ? 0 : Math.sin(animatedTime * 0.92) * 2.2;
  const sphereY = centerY + bob;
  const radius = 19 + activity * 1.1 + pulse * 0.45;

  context.save();
  context.globalCompositeOperation = 'screen';
  const fieldRadius = Math.min(Math.max(126, width * 0.21), 190);
  const halo = context.createRadialGradient(
    centerX,
    sphereY,
    radius * 0.7,
    centerX,
    sphereY,
    fieldRadius,
  );
  halo.addColorStop(0, `rgba(255, 255, 255, ${0.52 + activity * 0.08})`);
  halo.addColorStop(0.13, 'rgba(125, 224, 231, 0.18)');
  halo.addColorStop(0.34, 'rgba(169, 150, 244, 0.105)');
  halo.addColorStop(0.57, 'rgba(255, 157, 205, 0.07)');
  halo.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = halo;
  context.beginPath();
  context.arc(centerX, sphereY, fieldRadius, 0, Math.PI * 2);
  context.fill();

  if (running) {
    for (let ribbonIndex = 0; ribbonIndex < 3; ribbonIndex += 1) {
      const phase = animatedTime * (0.17 + ribbonIndex * 0.025) + ribbonIndex * 2.1;
      const ribbon = context.createLinearGradient(
        centerX - fieldRadius,
        sphereY,
        centerX + fieldRadius,
        sphereY,
      );
      ribbon.addColorStop(0, 'rgba(121, 222, 231, 0)');
      ribbon.addColorStop(0.32, 'rgba(121, 222, 231, 0.09)');
      ribbon.addColorStop(0.52, 'rgba(188, 150, 245, 0.12)');
      ribbon.addColorStop(0.72, 'rgba(255, 157, 205, 0.08)');
      ribbon.addColorStop(1, 'rgba(255, 157, 205, 0)');
      context.strokeStyle = ribbon;
      context.lineWidth = 1.1 + ribbonIndex * 0.4;
      context.beginPath();
      context.moveTo(centerX - fieldRadius, sphereY + Math.sin(phase) * 18);
      context.bezierCurveTo(
        centerX - fieldRadius * 0.42,
        sphereY - 28 + Math.cos(phase * 0.8) * 12,
        centerX + fieldRadius * 0.38,
        sphereY + 30 + Math.sin(phase * 0.7) * 12,
        centerX + fieldRadius,
        sphereY + Math.cos(phase) * 18,
      );
      context.stroke();
    }
  }

  const causticBottom = Math.min(height + 8, sphereY + Math.max(116, height * 0.43));
  const causticWidth = Math.min(width * 0.15, 92);
  const caustic = context.createLinearGradient(0, sphereY + radius, 0, causticBottom);
  caustic.addColorStop(0, 'rgba(157, 226, 234, 0.11)');
  caustic.addColorStop(0.42, 'rgba(195, 172, 244, 0.055)');
  caustic.addColorStop(1, 'rgba(255, 174, 213, 0)');
  context.fillStyle = caustic;
  context.beginPath();
  context.moveTo(centerX - radius * 0.48, sphereY + radius * 0.62);
  context.lineTo(centerX + radius * 0.48, sphereY + radius * 0.62);
  context.lineTo(centerX + causticWidth, causticBottom);
  context.lineTo(centerX - causticWidth, causticBottom);
  context.closePath();
  context.fill();
  context.restore();
}

// Kept as a lightweight fallback for WebGL-disabled environments.
function drawDiscoScannerCore(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  time: number,
  running: boolean,
  reducedMotion: boolean,
  activity: number,
): void {
  const animatedTime = reducedMotion ? 1.2 : time;
  const pulse = running ? (Math.sin(animatedTime * 1.45) + 1) / 2 : 0.25;
  const bob = reducedMotion ? 0 : Math.sin(animatedTime * 0.78) * 1.35;
  const sphereY = centerY + bob;
  const radius = 19 + activity * 1.1 + pulse * 0.45;

  context.save();
  context.translate(centerX, sphereY);

  const wave = running ? (animatedTime * 0.34) % 1 : 0.24;
  context.globalAlpha = (1 - wave) * 0.2;
  const waveGradient = context.createLinearGradient(-radius - 28, 0, radius + 28, 0);
  waveGradient.addColorStop(0, '#79dce7');
  waveGradient.addColorStop(0.5, '#ae92ee');
  waveGradient.addColorStop(1, '#f49bc8');
  context.strokeStyle = waveGradient;
  context.lineWidth = 0.9;
  context.beginPath();
  context.arc(0, 0, radius + 7 + wave * 22, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 1;

  context.save();
  context.shadowColor = 'rgba(134, 146, 238, 0.38)';
  context.shadowBlur = 19 + activity * 8;
  const sphere = context.createRadialGradient(-radius * 0.36, -radius * 0.4, 2, 0, 0, radius);
  sphere.addColorStop(0, '#ffffff');
  sphere.addColorStop(0.18, '#e7ffff');
  sphere.addColorStop(0.4, '#a7e2e8');
  sphere.addColorStop(0.62, '#afa3e6');
  sphere.addColorStop(0.8, '#d889b8');
  sphere.addColorStop(1, '#526f91');
  context.fillStyle = sphere;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.save();
  context.beginPath();
  context.arc(0, 0, radius - 0.8, 0, Math.PI * 2);
  context.clip();

  const tileSize = Math.max(4.2, radius * 0.27);
  const rotationOffset = reducedMotion ? 0 : animatedTime * 0.7;
  for (let row = -4; row <= 4; row += 1) {
    const y = row * tileSize * 0.76;
    const halfWidth = Math.sqrt(Math.max(0, radius * radius - y * y));
    const columns = Math.max(1, Math.ceil((halfWidth * 2) / tileSize));
    for (let column = 0; column < columns; column += 1) {
      const x = -halfWidth + (column + 0.5) * ((halfWidth * 2) / columns);
      const shimmer = (Math.sin(rotationOffset + row * 1.13 + column * 0.87) + 1) / 2;
      const hue = (178 + row * 21 + column * 17 + animatedTime * 7) % 360;
      context.fillStyle = `hsla(${hue}, 72%, ${74 + shimmer * 15}%, ${0.12 + shimmer * 0.22})`;
      context.fillRect(x - tileSize * 0.42, y - tileSize * 0.32, tileSize * 0.84, tileSize * 0.64);
      context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      context.lineWidth = 0.42;
      context.strokeRect(x - tileSize * 0.42, y - tileSize * 0.32, tileSize * 0.84, tileSize * 0.64);
    }
  }

  const sheen = context.createLinearGradient(-radius, -radius, radius, radius);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0)');
  sheen.addColorStop(0.42, 'rgba(255, 255, 255, 0.08)');
  sheen.addColorStop(0.52, 'rgba(255, 255, 255, 0.72)');
  sheen.addColorStop(0.62, 'rgba(255, 255, 255, 0.06)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.save();
  context.rotate(reducedMotion ? -0.35 : Math.sin(animatedTime * 0.19) * 0.35 - 0.35);
  context.fillStyle = sheen;
  context.fillRect(-radius * 1.5, -radius * 1.5, radius * 3, radius * 3);
  context.restore();
  context.restore();

  const rim = context.createLinearGradient(-radius, -radius, radius, radius);
  rim.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
  rim.addColorStop(0.32, 'rgba(105, 214, 225, 0.78)');
  rim.addColorStop(0.68, 'rgba(184, 139, 232, 0.76)');
  rim.addColorStop(1, 'rgba(247, 137, 190, 0.78)');
  context.strokeStyle = rim;
  context.lineWidth = 1.15;
  context.beginPath();
  context.arc(0, 0, radius + 0.5, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = 'rgba(255, 255, 255, 0.88)';
  context.beginPath();
  context.ellipse(-radius * 0.3, -radius * 0.34, radius * 0.2, radius * 0.12, -0.55, 0, Math.PI * 2);
  context.fill();

  const glintPhase = reducedMotion ? 0.6 : (Math.sin(animatedTime * 0.86) + 1) / 2;
  const glintX = -radius * 0.46 + glintPhase * radius * 0.62;
  const glintY = -radius * 0.5 + Math.sin(animatedTime * 0.43) * 2;
  context.strokeStyle = `rgba(255, 255, 255, ${0.55 + glintPhase * 0.3})`;
  context.lineWidth = 0.85;
  context.beginPath();
  context.moveTo(glintX - 5, glintY);
  context.lineTo(glintX + 5, glintY);
  context.moveTo(glintX, glintY - 5);
  context.lineTo(glintX, glintY + 5);
  context.stroke();

  for (let index = 0; index < 4; index += 1) {
    const angle = animatedTime * (0.18 + index * 0.018) + index * 1.7;
    const orbitX = radius + 9 + (index % 2) * 4;
    const orbitY = radius * 0.62 + (index % 3) * 1.4;
    const x = Math.cos(angle) * orbitX;
    const y = Math.sin(angle) * orbitY;
    const depth = (Math.sin(angle) + 1) / 2;
    const colors = ['121, 220, 231', '183, 146, 238', '247, 143, 194', '255, 255, 255'];
    context.fillStyle = `rgba(${colors[index]}, ${0.3 + depth * 0.48})`;
    context.beginPath();
    context.arc(x, y, 1.1 + depth * 0.8, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function getPhaseLabel(phase: ScoutProgress['phase'] | null, running: boolean): string {
  if (running && phase === 'seeding') return '正在展开关系';
  if (running) return '正在实时筛选';
  if (phase === 'aborted') return '搜索已取消';
  if (phase === 'error') return '搜索遇到问题';
  return '本轮轨迹';
}

export function ScoutSearchVisualizer({
  players,
  totalPlayerCount,
  stateCounts,
  runId,
  running,
  phase,
  checkedCount,
  hitCount,
  onPlayerClick,
}: ScoutSearchVisualizerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef(new Map<string, VisualNode>());
  const runningRef = useRef(running);
  const animationFrameRef = useRef<number | null>(null);
  const layoutRef = useRef<() => void>(() => undefined);
  const requestFrameRef = useRef<() => void>(() => undefined);
  const imageCacheRef = useRef(new Map<string, HTMLImageElement | null>());
  const nodeSequenceRef = useRef(0);
  const sceneSeedRef = useRef(0);
  const [hovered, setHovered] = useState<HoveredPlayer | null>(null);

  const visiblePlayers = useMemo(() => selectVisiblePlayers(players), [players]);
  const feedPlayers = useMemo(() => {
    const feed: ScoutPlayerEvent[] = [];
    for (let index = players.length - 1; index >= 0 && feed.length < 7; index -= 1) {
      const player = players[index];
      if (player.state !== 'queued') feed.push(player);
    }
    return feed;
  }, [players]);

  runningRef.current = running;
  sceneSeedRef.current = mixHash(runId || 1, 0x27d4eb2d);

  const loadNodeImage = useCallback((node: VisualNode, url: string) => {
    if (!url || node.imageUrl === url) return;
    node.imageUrl = url;
    const cached = imageCacheRef.current.get(url);
    if (cached !== undefined) {
      node.image = cached;
      return;
    }

    imageCacheRef.current.set(url, null);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      imageCacheRef.current.set(url, image);
      for (const visualNode of nodesRef.current.values()) {
        if (visualNode.imageUrl === url) visualNode.image = image;
      }
      requestFrameRef.current();
    };
    image.onerror = () => imageCacheRef.current.set(url, null);
    image.src = url;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return undefined;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return undefined;

    let disposed = false;
    let width = 1;
    let height = 1;
    let dpr = 1;
    let previousTimestamp = 0;
    let clusters: ClusterLayout[] = [];
    let stageVisible = true;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const haloSprites = {} as Record<ScoutPlayerState, HTMLCanvasElement>;
    const avatarGlowSprites = {} as Record<ScoutPlayerState, HTMLCanvasElement>;
    for (const state of Object.keys(NODE_PALETTES) as ScoutPlayerState[]) {
      haloSprites[state] = createNodeGlowSprite(NODE_PALETTES[state]);
      avatarGlowSprites[state] = createNodeGlowSprite(NODE_PALETTES[state], true);
    }
    const coreMaskSprite = createCoreMaskSprite();

    const layoutNodes = () => {
      const centerX = width * 0.48;
      const centerY = height * 0.5;
      const grouped: VisualNode[][] = Array.from({ length: CLUSTER_COUNT }, () => []);
      for (const node of nodesRef.current.values()) {
        if (node.exitStartedAt === null) grouped[node.cluster].push(node);
      }
      const horizontalRadius = Math.min(width * 0.31, 224);
      const verticalRadius = Math.min(height * 0.31, 104);
      const sceneRotation =
        Math.PI * 0.97 +
        (sceneSeedRef.current / 0x100000000 - 0.5) * 0.44;
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const previousClusters = clusters;
      clusters = grouped.map((group, clusterIndex) => {
        const groupHash = group.reduce(
          (value, node) => value ^ mixHash(node.hash, 0x9e3779b9),
          clusterIndex * 2654435761,
        );
        const angleJitter = (mixHash(groupHash, 0x85ebca6b) / 0x100000000 - 0.5) * 0.22;
        const distanceJitter = 0.82 + (mixHash(groupHash, 0xc2b2ae35) / 0x100000000) * 0.24;
        const angle = sceneRotation + clusterIndex * goldenAngle + angleJitter;
        const targetX = Math.max(
          62,
          Math.min(width - 62, centerX + Math.cos(angle) * horizontalRadius * distanceJitter),
        );
        const targetY = Math.max(
          48,
          Math.min(
            height * 0.625,
            centerY + Math.sin(angle) * verticalRadius * distanceJitter,
          ),
        );
        const previous = previousClusters[clusterIndex];
        const baseX = previous ? previous.baseX * 0.86 + targetX * 0.14 : targetX;
        const baseY = previous ? previous.baseY * 0.86 + targetY * 0.14 : targetY;
        return {
          baseX,
          baseY,
          x: previous ? previous.x : baseX,
          y: previous ? previous.y : baseY,
          count: 0,
          activity: 0,
          radiusX: 0,
          radiusY: 0,
        };
      });

      for (let clusterIndex = 0; clusterIndex < grouped.length; clusterIndex += 1) {
        const group = grouped[clusterIndex].sort((left, right) => left.order - right.order);
        const cluster = clusters[clusterIndex];
        cluster.count = group.length;
        cluster.activity = group.filter(
          (node) => node.event.state === 'checking' || node.event.state === 'matched',
        ).length;
        const orbitRadius = 24 + Math.min(28, group.length * 4.4);
        cluster.radiusX = orbitRadius * 1.18 + 25;
        cluster.radiusY = orbitRadius * 0.75 + 20;
        for (let index = 0; index < group.length; index += 1) {
          const node = group[index];
          const hash = node.hash;
          const angleJitter = (mixHash(hash, 0x85ebca6b) / 0x100000000 - 0.5) * 0.32;
          const angle = -Math.PI / 2 + (index / Math.max(1, group.length)) * Math.PI * 2 + angleJitter;
          const radius = group.length === 1 ? 0 : orbitRadius + (index % 2) * 3;
          node.baseTargetX = cluster.baseX + Math.cos(angle) * radius * 1.18;
          node.baseTargetY = cluster.baseY + Math.sin(angle) * radius * 0.75;
          node.targetX = node.baseTargetX;
          node.targetY = node.baseTargetY;
        }
      }
    };
    layoutRef.current = layoutNodes;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const nextWidth = Math.max(1, rect.width);
      const nextHeight = Math.max(1, rect.height);
      const nextDpr = Math.min(window.devicePixelRatio || 1, 1.25);
      const nextPixelWidth = Math.round(nextWidth * nextDpr);
      const nextPixelHeight = Math.round(nextHeight * nextDpr);
      if (
        canvas.width === nextPixelWidth &&
        canvas.height === nextPixelHeight &&
        Math.abs(width - nextWidth) < 0.1 &&
        Math.abs(height - nextHeight) < 0.1 &&
        dpr === nextDpr
      ) {
        return;
      }
      width = nextWidth;
      height = nextHeight;
      dpr = nextDpr;
      canvas.width = nextPixelWidth;
      canvas.height = nextPixelHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      layoutNodes();
      requestFrameRef.current();
    };

    const drawScene = (timestamp: number) => {
      animationFrameRef.current = null;
      if (disposed || !stageVisible) return;
      const frameInterval = runningRef.current ? ACTIVE_FRAME_INTERVAL : IDLE_FRAME_INTERVAL;
      if (previousTimestamp && timestamp - previousTimestamp < frameInterval - 0.75) {
        animationFrameRef.current = window.requestAnimationFrame(drawScene);
        return;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const time = timestamp / 1000;
      const deltaSeconds = previousTimestamp
        ? Math.min(1 / 30, Math.max(1 / 120, (timestamp - previousTimestamp) / 1000))
        : 1 / 60;
      previousTimestamp = timestamp;
      const centerX = width * 0.48;
      const centerY = height * 0.5;
      const nodes = nodesRef.current;
      let removedExitedNode = false;
      for (const [id, node] of nodes) {
        if (
          node.exitStartedAt !== null &&
          timestamp - node.exitStartedAt >= NODE_EXIT_DURATION
        ) {
          nodes.delete(id);
          removedExitedNode = true;
        }
      }
      if (removedExitedNode) layoutNodes();
      const groupedNodes: VisualNode[][] = Array.from({ length: CLUSTER_COUNT }, () => []);
      for (const node of nodes.values()) {
        if (node.exitStartedAt === null) groupedNodes[node.cluster].push(node);
      }
      let moving = false;

      for (let index = 0; index < clusters.length; index += 1) {
        const cluster = clusters[index];
        const driftSeed = mixHash(sceneSeedRef.current, (index + 1) * 0x85ebca6b);
        const phase = (driftSeed / 0x100000000) * Math.PI * 2;
        const driftX = reducedMotion
          ? 0
          : Math.sin(time * (0.075 + index * 0.008) + phase) * (4.5 + (index % 2) * 1.5);
        const driftY = reducedMotion
          ? 0
          : Math.cos(time * (0.09 + index * 0.007) + phase * 1.17) * (3.5 + (index % 3));
        cluster.x = cluster.baseX + driftX;
        cluster.y = cluster.baseY + driftY;
      }

      if (host.dataset.energyCoreUnavailable === 'true') {
        drawWarpedSpaceGrid(context, width, height, centerX, time, reducedMotion);
      }
      context.save();
      context.setLineDash([2, 6]);
      context.lineDashOffset = reducedMotion ? 0 : -time * 1.4;
      for (let index = 0; index < clusters.length; index += 1) {
        const cluster = clusters[index];
        if (cluster.count === 0) continue;
        context.strokeStyle = `rgba(88, 135, 143, ${0.075 + Math.min(0.07, cluster.activity * 0.016)})`;
        context.lineWidth = 0.8;
        context.beginPath();
        context.ellipse(
          cluster.x,
          cluster.y,
          cluster.radiusX,
          cluster.radiusY,
          index % 2 === 0 ? -0.08 : 0.08,
          0,
          Math.PI * 2,
        );
        context.stroke();
      }
      context.restore();

      context.save();
      context.lineWidth = 0.55;
      for (const group of groupedNodes) {
        for (let left = 0; left < group.length; left += 1) {
          for (let right = left + 1; right < group.length; right += 1) {
            if ((left + right) % 3 === 0) continue;
            const from = group[left];
            const to = group[right];
            context.strokeStyle = 'rgba(91, 126, 134, 0.12)';
            context.beginPath();
            context.moveTo(from.x, from.y);
            context.quadraticCurveTo(
              (from.x + to.x) / 2 + (left - right) * 1.6,
              (from.y + to.y) / 2 - 3,
              to.x,
              to.y,
            );
            context.stroke();
          }
        }
      }
      context.restore();

      context.save();
      context.lineCap = 'round';
      for (let index = 0; index < clusters.length; index += 1) {
        const cluster = clusters[index];
        if (cluster.count === 0) continue;
        const alpha = runningRef.current ? 0.07 + Math.min(0.09, cluster.activity * 0.025) : 0.045;
        const connection = context.createLinearGradient(centerX, centerY, cluster.x, cluster.y);
        connection.addColorStop(0, `rgba(169, 215, 219, ${alpha + 0.075})`);
        connection.addColorStop(0.52, `rgba(112, 157, 166, ${alpha + 0.04})`);
        connection.addColorStop(1, `rgba(222, 155, 184, ${Math.max(0.05, alpha + 0.015)})`);
        context.strokeStyle = connection;
        context.lineWidth = cluster.activity > 0 ? 1 : 0.65;
        context.beginPath();
        const clusterVectorX = cluster.x - centerX;
        const clusterVectorY = cluster.y - centerY;
        const clusterDistance = Math.max(1, Math.sqrt(clusterVectorX ** 2 + clusterVectorY ** 2));
        context.moveTo(
          centerX + (clusterVectorX / clusterDistance) * 68,
          centerY + (clusterVectorY / clusterDistance) * 68,
        );
        const controlX = centerX + (cluster.x - centerX) * 0.52;
        const controlY = centerY + (cluster.y - centerY) * 0.32;
        context.quadraticCurveTo(controlX, controlY, cluster.x, cluster.y);
        context.stroke();
      }
      context.restore();

      let spawnActivity = 0;
      for (const node of nodes.values()) {
        if (node.exitStartedAt !== null) {
          const linearExit = Math.max(
            0,
            Math.min(1, (timestamp - node.exitStartedAt) / NODE_EXIT_DURATION),
          );
          const exitEase = linearExit * linearExit * (3 - 2 * linearExit);
          const travelEase = 1 - (1 - linearExit) ** 3;
          const directionX = node.exitOriginX - centerX;
          const directionY = node.exitOriginY - centerY;
          const directionLength = Math.max(1, Math.sqrt(directionX ** 2 + directionY ** 2));
          const normalizedX = directionX / directionLength;
          const normalizedY = directionY / directionLength;
          const curveDirection = node.hash % 2 === 0 ? 1 : -1;
          const curve = Math.sin(linearExit * Math.PI) * 9 * curveDirection;
          node.x = node.exitOriginX + normalizedX * travelEase * 34 - normalizedY * curve;
          node.y = node.exitOriginY + normalizedY * travelEase * 24 + normalizedX * curve;
          node.alpha = node.exitAlpha * (1 - exitEase);
          node.scale = node.exitScale * (1 - travelEase * 0.18);
          node.velocityX = 0;
          node.velocityY = 0;
          moving = true;
          continue;
        }
        const age = timestamp - node.createdAt;
        const hash = node.hash;
        const cluster = clusters[node.cluster];
        const clusterOffsetX = cluster ? cluster.x - cluster.baseX : 0;
        const clusterOffsetY = cluster ? cluster.y - cluster.baseY : 0;
        const localDrift = reducedMotion ? 0 : Math.sin(time * 0.14 + hash * 0.00001) * 0.85;
        node.targetX = node.baseTargetX + clusterOffsetX + localDrift;
        node.targetY = node.baseTargetY + clusterOffsetY + localDrift * 0.55;
        const spawnDuration = 2600 + (hash % 1100);
        if (!reducedMotion && age < spawnDuration) {
          const linearProgress = Math.max(0, Math.min(1, age / spawnDuration));
          const progress =
            linearProgress * linearProgress * linearProgress *
            (linearProgress * (linearProgress * 6 - 15) + 10);
          const vectorX = node.targetX - centerX;
          const vectorY = node.targetY - centerY;
          const vectorLength = Math.max(1, Math.sqrt(vectorX * vectorX + vectorY * vectorY));
          const releaseRadius = 86 + node.radius;
          const releaseX = centerX + (vectorX / vectorLength) * releaseRadius;
          const releaseY = centerY + (vectorY / vectorLength) * releaseRadius;
          const curveOffset = (mixHash(hash, 0xc2b2ae35) / 0x100000000 - 0.5) * 74;
          const controlX = (releaseX + node.targetX) / 2 - (vectorY / vectorLength) * curveOffset;
          const controlY = (releaseY + node.targetY) / 2 + (vectorX / vectorLength) * curveOffset;
          const inverse = 1 - progress;
          node.x =
            inverse * inverse * releaseX +
            2 * inverse * progress * controlX +
            progress * progress * node.targetX;
          node.y =
            inverse * inverse * releaseY +
            2 * inverse * progress * controlY +
            progress * progress * node.targetY;
          node.velocityX = 0;
          node.velocityY = 0;
          node.alpha = Math.min(1, linearProgress * 1.7);
          node.scale = 0.76 + progress * 0.24;
          spawnActivity += 1 - linearProgress;
          moving = true;
        } else {
          const dx = node.targetX - node.x;
          const dy = node.targetY - node.y;
          if (reducedMotion) {
            node.x = node.targetX;
            node.y = node.targetY;
            node.velocityX = 0;
            node.velocityY = 0;
          } else {
            const spring = node.event.state === 'matched' ? 20 : 16;
            const damping = node.event.state === 'matched' ? 8.6 : 7.6;
            node.velocityX += dx * spring * deltaSeconds;
            node.velocityY += dy * spring * deltaSeconds;
            const decay = Math.exp(-damping * deltaSeconds);
            node.velocityX *= decay;
            node.velocityY *= decay;
            node.x += node.velocityX * deltaSeconds;
            node.y += node.velocityY * deltaSeconds;
          }

          const alphaEase = 1 - Math.exp(-7.5 * deltaSeconds);
          const scaleEase = 1 - Math.exp(-8 * deltaSeconds);
          node.alpha += (1 - node.alpha) * alphaEase;
          node.scale += (1 - node.scale) * scaleEase;
          if (
            Math.abs(dx) + Math.abs(dy) > 0.2 ||
            Math.abs(node.velocityX) + Math.abs(node.velocityY) > 0.3 ||
            node.alpha < 0.995
          ) {
            moving = true;
          }
        }
        node.radius = getNodeRadius(node.event);

        const fromCenterX = node.x - centerX;
        const fromCenterY = node.y - centerY;
        const centerDistance = Math.sqrt(fromCenterX * fromCenterX + fromCenterY * fromCenterY);
        const safeRadius = 84 + node.radius;
        if (centerDistance < safeRadius) {
          const fallbackLength = Math.max(1, Math.sqrt((node.targetX - centerX) ** 2 + (node.targetY - centerY) ** 2));
          const directionX = centerDistance > 0.01
            ? fromCenterX / centerDistance
            : (node.targetX - centerX) / fallbackLength;
          const directionY = centerDistance > 0.01
            ? fromCenterY / centerDistance
            : (node.targetY - centerY) / fallbackLength;
          node.x = centerX + directionX * safeRadius;
          node.y = centerY + directionY * safeRadius;
          node.velocityX = Math.max(0, node.velocityX * directionX) * directionX;
          node.velocityY = Math.max(0, node.velocityY * directionY) * directionY;
        }
      }

      context.save();
      for (const node of nodes.values()) {
        const parent = node.event.parentPuuid ? nodes.get(node.event.parentPuuid) : undefined;
        if (!parent) continue;
        const recent = timestamp - node.stateChangedAt < 1800;
        if (!recent && node.event.state !== 'checking' && node.event.state !== 'matched') continue;
        context.strokeStyle =
          node.event.state === 'matched'
            ? 'rgba(229,197,140, 0.22)'
            : 'rgba(91, 126, 134, 0.13)';
        context.lineWidth = node.event.state === 'matched' ? 1.1 : 0.7;
        context.beginPath();
        context.moveTo(parent.x, parent.y);
        context.lineTo(node.x, node.y);
        context.stroke();
      }
      context.restore();

      // Keep the 2D relationship lines behind the WebGL energy core.
      context.save();
      context.globalCompositeOperation = 'destination-out';
      context.drawImage(coreMaskSprite, centerX - 94, centerY - 94, 188, 188);
      context.restore();

      const labelStart = Math.max(0, nodeSequenceRef.current - 7);
      const drawOrder: ScoutPlayerState[] = ['failed', 'checked', 'queued', 'checking', 'matched'];
      for (const state of drawOrder) {
        for (const node of nodes.values()) {
          if (node.event.state !== state) continue;
          const floatX = reducedMotion ? 0 : Math.sin(time * 0.24 + node.hash) * 1.05;
          const floatY = reducedMotion ? 0 : Math.cos(time * 0.2 + node.hash) * 0.9;
          const x = node.x + floatX;
          const y = node.y + floatY;
          const radius = node.radius * node.scale;
          const nodeHash = node.hash;
          const pulseRate = 0.22 + (nodeHash % 17) * 0.008;
          const pulse = reducedMotion ? 0.42 : (Math.sin(time * pulseRate + nodeHash * 0.0001) + 1) / 2;
          const palette = NODE_PALETTES[state];
          const active = state === 'checking' || state === 'matched';

          context.save();
          context.globalAlpha = node.alpha;

          const avatarRadius = radius * (active ? 0.98 : 0.94);
          const haloRadius = avatarRadius + (active ? 15 : 12) + pulse * (active ? 2.8 : 1.8);
          context.save();
          context.globalCompositeOperation = 'lighter';
          context.drawImage(
            haloSprites[state],
            x - haloRadius,
            y - haloRadius,
            haloRadius * 2,
            haloRadius * 2,
          );
          context.restore();

          const moteCount = active ? 4 : 3;
          context.save();
          context.globalCompositeOperation = 'lighter';
          for (let moteIndex = 0; moteIndex < moteCount; moteIndex += 1) {
            const moteSeed = node.moteSeeds[moteIndex];
            const moteSpeed = 0.1 + (moteSeed % 13) * 0.007;
            const motePhase = reducedMotion
              ? moteSeed * 0.00001
              : time * moteSpeed + moteSeed * 0.00001;
            const moteDistance = radius + 3.2 + (moteSeed % 7) * 0.72;
            const moteWander = reducedMotion ? 0 : Math.sin(time * 0.2 + moteSeed) * 1.15;
            const moteX = x + Math.cos(motePhase) * (moteDistance + moteWander);
            const moteY = y + Math.sin(motePhase * 1.31) * (moteDistance * 0.56) + moteWander * 0.38;
            const moteSize = 0.68 + ((moteSeed >>> 4) % 7) * 0.1 + pulse * 0.24;
            context.shadowColor = palette.glow;
            context.shadowBlur = active ? 6 : 3.5;
            context.fillStyle = palette.spark;
            context.beginPath();
            context.arc(moteX, moteY, moteSize, 0, Math.PI * 2);
            context.fill();
          }
          context.restore();

          context.shadowColor = palette.glow;
          context.shadowBlur = active ? 9 + pulse * 4 : 4;
          context.fillStyle = active ? 'rgba(255, 255, 255, 0.82)' : 'rgba(248, 251, 251, 0.7)';
          context.beginPath();
          context.arc(x, y, avatarRadius + 0.8, 0, Math.PI * 2);
          context.fill();
          context.shadowBlur = 0;
          drawAvatar(context, node, x, y, avatarRadius);

          context.strokeStyle = 'rgba(255, 255, 255, 0.88)';
          context.lineWidth = active ? 1.15 : 0.85;
          context.beginPath();
          context.arc(x, y, avatarRadius + 0.25, 0, Math.PI * 2);
          context.stroke();

          context.save();
          context.beginPath();
          context.arc(x, y, Math.max(1, avatarRadius - 0.6), 0, Math.PI * 2);
          context.clip();
          context.globalCompositeOperation = 'screen';
          context.drawImage(
            avatarGlowSprites[state],
            x - avatarRadius,
            y - avatarRadius,
            avatarRadius * 2,
            avatarRadius * 2,
          );
          context.restore();

          const ringAngle = reducedMotion ? nodeHash * 0.00001 : time * (active ? 0.14 : 0.09) + nodeHash * 0.00001;
          context.save();
          context.globalCompositeOperation = 'lighter';
          context.lineCap = 'round';
          context.lineWidth = active ? 1.25 : 0.8;
          context.strokeStyle = palette.spark;
          context.shadowColor = palette.glow;
          context.shadowBlur = active ? 8 : 4;
          context.globalAlpha *= active ? 0.62 + pulse * 0.22 : 0.44 + pulse * 0.12;
          context.beginPath();
          context.arc(x, y, avatarRadius + 2.1, ringAngle, ringAngle + Math.PI * 0.62);
          context.arc(x, y, avatarRadius + 2.1, ringAngle + Math.PI * 1.08, ringAngle + Math.PI * 1.5);
          context.stroke();
          context.restore();

          context.fillStyle = `rgba(255, 255, 255, ${active ? 0.38 + pulse * 0.14 : 0.25})`;
          context.shadowColor = palette.glow;
          context.shadowBlur = active ? 5 : 2;
          context.beginPath();
          context.arc(
            x - avatarRadius * 0.34,
            y - avatarRadius * 0.36,
            Math.max(0.65, avatarRadius * 0.09),
            0,
            Math.PI * 2,
          );
          context.fill();
          context.shadowBlur = 0;

          const showLabel = state === 'matched' || state === 'checking' || node.order >= labelStart;
          if (showLabel && timestamp - node.stateChangedAt > 180 && timestamp - node.createdAt > 700) {
            const label = node.shortName;
            context.font = '600 9.5px "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif';
            if (!node.labelWidth) {
              const measuredWidth = context.measureText(label).width;
              node.labelWidth = Math.min(96, Math.max(26, Math.ceil(measuredWidth) + 12));
            }
            const labelWidth = node.labelWidth;
            const labelHeight = 16;
            const labelX = x - labelWidth / 2;
            const labelY = y + radius + 5;
            const labelAlpha = Math.min(1, (timestamp - node.createdAt - 700) / 650);
            context.save();
            context.globalAlpha *= labelAlpha;
            context.shadowColor = 'rgba(34, 54, 60, 0.11)';
            context.shadowBlur = 8;
            context.shadowOffsetY = 2;
            context.fillStyle = palette.labelFill;
            context.beginPath();
            context.roundRect(labelX, labelY, labelWidth, labelHeight, 4);
            context.fill();
            context.shadowBlur = 0;
            context.shadowOffsetY = 0;
            context.strokeStyle = palette.labelBorder;
            context.lineWidth = 0.7;
            context.stroke();
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillStyle = palette.labelText;
            context.fillText(label, x, labelY + labelHeight / 2 + 0.25, labelWidth - 8);
            context.restore();
          }
          context.restore();
        }
      }

      if (host.dataset.energyCoreUnavailable === 'true') {
        drawIridescentScannerField(
          context,
          centerX,
          centerY,
          width,
          height,
          time,
          runningRef.current,
          reducedMotion,
          Math.min(1, spawnActivity / 3),
        );
        drawDiscoScannerCore(
          context,
          centerX,
          centerY,
          time,
          runningRef.current,
          reducedMotion,
          Math.min(1, spawnActivity / 3),
        );
      }

      if (runningRef.current || moving) {
        animationFrameRef.current = window.requestAnimationFrame(drawScene);
      }
    };

    const requestFrame = () => {
      if (disposed || animationFrameRef.current !== null) return;
      animationFrameRef.current = window.requestAnimationFrame(drawScene);
    };
    requestFrameRef.current = requestFrame;

    const observer = new ResizeObserver(resize);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      stageVisible = entry.isIntersecting;
      if (stageVisible) requestFrameRef.current();
    });
    observer.observe(host);
    visibilityObserver.observe(host);
    resize();
    return () => {
      disposed = true;
      observer.disconnect();
      visibilityObserver.disconnect();
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    nodesRef.current.clear();
    imageCacheRef.current.clear();
    nodeSequenceRef.current = 0;
    setHovered(null);
    requestFrameRef.current();
  }, [runId]);

  useEffect(() => {
    const nodes = nodesRef.current;
    const desiredIds = new Set(visiblePlayers.map((player) => player.puuid));
    const desiredImageUrls = new Set<string>();
    const now = performance.now();
    const rect = hostRef.current?.getBoundingClientRect();
    const centerX = (rect?.width ?? 600) * 0.48;
    const centerY = (rect?.height ?? 300) * 0.5;

    for (const node of nodes.values()) {
      if (!desiredIds.has(node.id) && node.exitStartedAt === null) {
        node.exitStartedAt = now;
        node.exitOriginX = node.x;
        node.exitOriginY = node.y;
        node.exitAlpha = node.alpha;
        node.exitScale = node.scale;
      }
    }

    for (const player of visiblePlayers) {
      let node = nodes.get(player.puuid);
      if (!node) {
        const hash = hashString(player.puuid);
        const shortName = getPlayerShortName(player);
        const order = ++nodeSequenceRef.current;
        const spawnDelay = ((order - 1) % 7) * 150 + (hash % 100);
        node = {
          id: player.puuid,
          hash,
          event: player,
          shortName,
          labelWidth: 0,
          moteSeeds: Array.from({ length: 4 }, (_, index) =>
            mixHash(hash, (index + 1) * 0x85ebca6b),
          ),
          order,
          cluster: mixHash(hash, 0x9e3779b9) % CLUSTER_COUNT,
          x: centerX,
          y: centerY,
          baseTargetX: centerX,
          baseTargetY: centerY,
          targetX: centerX,
          targetY: centerY,
          velocityX: 0,
          velocityY: 0,
          alpha: 0,
          scale: 0.72,
          radius: getNodeRadius(player),
          createdAt: now + spawnDelay,
          stateChangedAt: now,
          exitStartedAt: null,
          exitOriginX: centerX,
          exitOriginY: centerY,
          exitAlpha: 0,
          exitScale: 0.72,
          image: null,
          imageUrl: '',
        };
        nodes.set(player.puuid, node);
      } else if (node.event.state !== player.state) {
        node.stateChangedAt = now;
        node.order = ++nodeSequenceRef.current;
        node.scale = Math.min(node.scale, 0.76);
      }
      node.exitStartedAt = null;
      const shortName = getPlayerShortName(player);
      if (node.shortName !== shortName) {
        node.shortName = shortName;
        node.labelWidth = 0;
      }
      node.event = player;
      const imageUrl = getPlayerImage(player);
      if (imageUrl) {
        desiredImageUrls.add(imageUrl);
        loadNodeImage(node, imageUrl);
      }
    }

    if (imageCacheRef.current.size > 48) {
      for (const url of imageCacheRef.current.keys()) {
        if (!desiredImageUrls.has(url)) imageCacheRef.current.delete(url);
      }
    }
    layoutRef.current();
    requestFrameRef.current();
  }, [loadNodeImage, visiblePlayers]);

  useEffect(() => {
    requestFrameRef.current();
  }, [running]);

  const findNodeAt = useCallback((clientX: number, clientY: number): VisualNode | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let selected: VisualNode | null = null;
    let selectedDistance = Number.POSITIVE_INFINITY;
    for (const node of nodesRef.current.values()) {
      if (node.exitStartedAt !== null) continue;
      const dx = node.x - x;
      const dy = node.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= node.radius + 7 && distance < selectedDistance) {
        selected = node;
        selectedDistance = distance;
      }
    }
    return selected;
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const node = findNodeAt(event.clientX, event.clientY);
      if (!node) {
        setHovered(null);
        return;
      }
      setHovered({ event: node.event, x: node.x, y: node.y });
    },
    [findNodeAt],
  );

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const node = findNodeAt(event.clientX, event.clientY);
      const riotId = node?.event.profile?.riotId?.trim();
      if (riotId) onPlayerClick?.(riotId);
    },
    [findNodeAt, onPlayerClick],
  );

  return (
    <section className={`scout-network ${running ? 'scout-network--running' : ''}`}>
      <header className="scout-network-header">
        <div className="scout-network-heading">
          <span className="scout-network-live" aria-hidden="true" />
          <div>
            <strong>玩家搜索网络</strong>
            <small>{getPhaseLabel(phase, running)}</small>
          </div>
        </div>
        <div className="scout-network-summary" aria-live="polite">
          <span><i className="is-queued" />等待 <b>{stateCounts.queued}</b></span>
          <span><i className="is-checking" />检查 <b>{stateCounts.checking}</b></span>
          <span><i className="is-matched" />达标 <b>{hitCount}</b></span>
        </div>
      </header>

      <div className="scout-network-layout">
        <div ref={hostRef} className="scout-network-stage">
          <canvas
            ref={canvasRef}
            className="scout-network-canvas"
            aria-label={`实时展示 ${visiblePlayers.length} 位玩家，累计发现 ${totalPlayerCount} 位`}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHovered(null)}
            onClick={handleCanvasClick}
          />

          <ScoutEnergyCore
            key="plasma-ink-glass-v2"
            phase={phase}
            running={running}
            hitCount={hitCount}
          />

          <div className="scout-network-count">
            <b>{totalPlayerCount}</b>
            <span>已发现 · 屏显 {visiblePlayers.length}</span>
          </div>

          {hovered && (
            <div
              className="scout-network-tooltip"
              style={{
                left: `${Math.max(8, Math.min((hostRef.current?.clientWidth ?? 0) - 180, hovered.x + 12))}px`,
                top: `${Math.max(8, hovered.y - 24)}px`,
              }}
            >
              <strong>{getPlayerName(hovered.event)}</strong>
              <span>{STATE_LABELS[hovered.event.state]}</span>
              {hovered.event.recentChampionName && (
                <small>
                  {hovered.event.recentChampionName}
                  {getPlayerKda(hovered.event) ? ` · ${getPlayerKda(hovered.event)}` : ''}
                </small>
              )}
            </div>
          )}
        </div>

        <aside className="scout-network-feed">
          <div className="scout-network-feed__header">
            <span>检查动态</span>
            <b>{checkedCount}</b>
          </div>
          <div className="scout-network-feed__list">
            {feedPlayers.length === 0 ? (
              <div className="scout-network-feed__waiting">
                <Clock3 className="size-4" />
                <span>正在建立第一组关系</span>
              </div>
            ) : (
              feedPlayers.map((player) => {
                const riotId = player.profile?.riotId?.trim() || '';
                const kda = getPlayerKda(player);
                const StateIcon =
                  player.state === 'matched'
                    ? Sparkles
                    : player.state === 'checking'
                      ? Search
                      : player.state === 'failed'
                        ? X
                        : Check;
                return (
                  <button
                    key={`${player.puuid}-${player.state}`}
                    type="button"
                    disabled={!riotId || !onPlayerClick}
                    onClick={() => riotId && onPlayerClick?.(riotId)}
                    className={`scout-network-feed__item is-${player.state}`}
                  >
                    <span className="scout-network-feed__avatar">
                      {player.state === 'matched' && player.profile ? (
                        <ProfileIcon
                          iconId={player.profile.profileIconId}
                          src={player.profile.profileIconUrl || player.recentChampionAvatar}
                          alt={getPlayerShortName(player)}
                          size={28}
                        />
                      ) : player.recentChampionAvatar ? (
                        <GameIcon
                          src={player.recentChampionAvatar}
                          alt={player.recentChampionName || '最近英雄'}
                          size={28}
                          rounded
                        />
                      ) : (
                        <i aria-hidden="true" />
                      )}
                    </span>
                    <span className="scout-network-feed__main">
                      <strong>{getPlayerShortName(player)}</strong>
                      <small>
                        {player.recentChampionName || STATE_LABELS[player.state]}
                        {kda ? ` · ${kda}` : ''}
                      </small>
                    </span>
                    <span className="scout-network-feed__state">
                      <StateIcon className="size-3" />
                      {STATE_LABELS[player.state]}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
