import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock3, Search, Sparkles, X } from 'lucide-react';
import type { ScoutPlayerEvent, ScoutPlayerState, ScoutProgress } from '../../../shared/api';
import { ProfileIcon } from '../ProfileIcon';
import { GameIcon } from '../match/GameIcon';

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
  event: ScoutPlayerEvent;
  order: number;
  cluster: number;
  x: number;
  y: number;
  baseTargetX: number;
  baseTargetY: number;
  targetX: number;
  targetY: number;
  alpha: number;
  scale: number;
  radius: number;
  createdAt: number;
  stateChangedAt: number;
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

const STATE_LABELS: Record<ScoutPlayerState, string> = {
  queued: '等待检查',
  checking: '正在检查',
  checked: '未达标',
  matched: '符合条件',
  failed: '暂时跳过',
};

const STATE_COLORS: Record<ScoutPlayerState, string> = {
  queued: '#a4adb4',
  checking: '#3b8ead',
  checked: '#7d8d96',
  matched: '#ff385c',
  failed: '#c2c6c9',
};

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
  if (player.state === 'matched') return 14;
  if (player.state === 'checking') return 11;
  if (player.source === 'seed') return 10.5;
  return 9;
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
  context.arc(x, y, Math.max(1, radius - 2), 0, Math.PI * 2);
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
  const horizon = height * 0.67;
  const floorHeight = height - horizon;
  const floorGlow = context.createLinearGradient(0, horizon - 16, 0, height);
  floorGlow.addColorStop(0, 'rgba(81, 151, 174, 0)');
  floorGlow.addColorStop(0.25, 'rgba(81, 151, 174, 0.035)');
  floorGlow.addColorStop(1, 'rgba(81, 151, 174, 0.075)');
  context.fillStyle = floorGlow;
  context.fillRect(0, horizon - 16, width, floorHeight + 16);

  context.save();
  context.lineWidth = 0.65;
  for (let row = 0; row <= 10; row += 1) {
    const progress = row / 10;
    const baseY = horizon + Math.pow(progress, 1.58) * floorHeight;
    context.strokeStyle = `rgba(55, 132, 158, ${0.055 + progress * 0.085})`;
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
    context.strokeStyle = `rgba(55, 132, 158, ${0.055 + Math.abs(column) * 0.004})`;
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

function drawScannerCore(
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
  const scanAngle = animatedTime * 0.58;
  const bob = reducedMotion ? 0 : Math.sin(animatedTime * 0.92) * 2.2;
  const sphereY = centerY + bob;
  const radius = 17.5 + activity * 1.25 + pulse * 0.65;

  if (running) {
    const coneBottom = Math.min(height + 8, sphereY + Math.max(118, height * 0.42));
    const coneWidth = Math.min(width * 0.125, 76);
    const cone = context.createLinearGradient(0, sphereY + radius * 0.6, 0, coneBottom);
    cone.addColorStop(0, 'rgba(82, 159, 183, 0.11)');
    cone.addColorStop(0.58, 'rgba(82, 159, 183, 0.045)');
    cone.addColorStop(1, 'rgba(82, 159, 183, 0)');
    context.fillStyle = cone;
    context.beginPath();
    context.moveTo(centerX - radius * 0.42, sphereY + radius * 0.58);
    context.lineTo(centerX + radius * 0.42, sphereY + radius * 0.58);
    context.lineTo(centerX + coneWidth, coneBottom);
    context.lineTo(centerX - coneWidth, coneBottom);
    context.closePath();
    context.fill();
  }

  context.save();
  context.translate(centerX, sphereY);

  if (running) {
    context.save();
    context.rotate(scanAngle);
    const scan = context.createRadialGradient(0, 0, radius, 0, 0, 112);
    scan.addColorStop(0, 'rgba(53, 137, 166, 0.1)');
    scan.addColorStop(0.55, 'rgba(53, 137, 166, 0.032)');
    scan.addColorStop(1, 'rgba(53, 137, 166, 0)');
    context.fillStyle = scan;
    context.beginPath();
    context.moveTo(0, 0);
    context.arc(0, 0, 112, -0.12, 0.12);
    context.closePath();
    context.fill();
    context.restore();
  }

  const halo = context.createRadialGradient(0, 0, radius * 0.55, 0, 0, radius + 17);
  halo.addColorStop(0, `rgba(67, 147, 174, ${0.15 + activity * 0.07})`);
  halo.addColorStop(0.5, 'rgba(131, 184, 199, 0.075)');
  halo.addColorStop(1, 'rgba(131, 184, 199, 0)');
  context.fillStyle = halo;
  context.beginPath();
  context.arc(0, 0, radius + 18, 0, Math.PI * 2);
  context.fill();

  const wave = running ? (animatedTime * 0.56) % 1 : 0.2;
  context.globalAlpha = (1 - wave) * 0.24;
  context.strokeStyle = '#4f9ab3';
  context.lineWidth = 0.9;
  context.beginPath();
  context.arc(0, 0, radius + 6 + wave * 24, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 1;

  context.save();
  context.shadowColor = 'rgba(45, 116, 142, 0.32)';
  context.shadowBlur = 17 + activity * 7;
  const sphere = context.createRadialGradient(-radius * 0.36, -radius * 0.4, 2, 0, 0, radius);
  sphere.addColorStop(0, '#fbffff');
  sphere.addColorStop(0.2, '#e0f1f5');
  sphere.addColorStop(0.5, '#a7ccd7');
  sphere.addColorStop(0.76, '#709dac');
  sphere.addColorStop(1, '#496e7d');
  context.fillStyle = sphere;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.save();
  context.beginPath();
  context.arc(0, 0, radius - 0.8, 0, Math.PI * 2);
  context.clip();
  const lowerShade = context.createLinearGradient(0, -radius, 0, radius);
  lowerShade.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
  lowerShade.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
  lowerShade.addColorStop(1, 'rgba(34, 78, 94, 0.18)');
  context.fillStyle = lowerShade;
  context.fillRect(-radius, -radius, radius * 2, radius * 2);

  context.rotate(scanAngle * 0.19);
  context.strokeStyle = 'rgba(236, 250, 252, 0.17)';
  context.lineWidth = 0.8;
  for (let latitude = -1; latitude <= 1; latitude += 1) {
    context.beginPath();
    context.ellipse(0, latitude * radius * 0.28, radius * 0.93, radius * 0.18, 0, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();

  context.strokeStyle = 'rgba(44, 105, 127, 0.42)';
  context.lineWidth = 1;
  context.beginPath();
  context.arc(0, 0, radius + 0.5, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = 'rgba(255, 255, 255, 0.88)';
  context.beginPath();
  context.ellipse(-radius * 0.3, -radius * 0.34, radius * 0.2, radius * 0.12, -0.55, 0, Math.PI * 2);
  context.fill();

  for (let index = 0; index < 5; index += 1) {
    const angle = animatedTime * (0.34 + index * 0.025) + index * 1.34;
    const orbitX = radius + 8 + (index % 2) * 4;
    const orbitY = radius * 0.58 + (index % 3) * 1.6;
    const x = Math.cos(angle) * orbitX;
    const y = Math.sin(angle) * orbitY;
    const depth = (Math.sin(angle) + 1) / 2;
    context.fillStyle = index === 0 ? 'rgba(255, 56, 92, 0.62)' : `rgba(72, 145, 168, ${0.25 + depth * 0.5})`;
    context.beginPath();
    context.arc(x, y, 1.2 + depth * 1.1, 0, Math.PI * 2);
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
    let clusters: ClusterLayout[] = [];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const layoutNodes = () => {
      const centerX = width * 0.48;
      const centerY = height * 0.5;
      const grouped: VisualNode[][] = Array.from({ length: CLUSTER_COUNT }, () => []);
      for (const node of nodesRef.current.values()) grouped[node.cluster].push(node);
      const horizontalRadius = Math.min(width * 0.31, 224);
      const verticalRadius = Math.min(height * 0.31, 104);
      const sceneRotation =
        Math.PI * 0.97 +
        (sceneSeedRef.current / 0x100000000 - 0.5) * 0.44;
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const previousClusters = clusters;
      clusters = grouped.map((group, clusterIndex) => {
        const groupHash = group.reduce(
          (value, node) => value ^ mixHash(hashString(node.id), 0x9e3779b9),
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
        const orbitRadius = 17 + Math.min(19, group.length * 3.2);
        cluster.radiusX = orbitRadius * 1.18 + 21;
        cluster.radiusY = orbitRadius * 0.75 + 16;
        for (let index = 0; index < group.length; index += 1) {
          const node = group[index];
          const hash = hashString(node.id);
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
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      layoutNodes();
      requestFrameRef.current();
    };

    const drawScene = (timestamp: number) => {
      animationFrameRef.current = null;
      if (disposed) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const time = timestamp / 1000;
      const centerX = width * 0.48;
      const centerY = height * 0.5;
      const nodes = nodesRef.current;
      const groupedNodes: VisualNode[][] = Array.from({ length: CLUSTER_COUNT }, () => []);
      for (const node of nodes.values()) groupedNodes[node.cluster].push(node);
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

      drawWarpedSpaceGrid(context, width, height, centerX, time, reducedMotion);

      context.save();
      context.setLineDash([2, 6]);
      context.lineDashOffset = reducedMotion ? 0 : -time * 4;
      for (let index = 0; index < clusters.length; index += 1) {
        const cluster = clusters[index];
        if (cluster.count === 0) continue;
        context.strokeStyle = `rgba(66, 128, 149, ${0.08 + Math.min(0.08, cluster.activity * 0.018)})`;
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
            context.strokeStyle = 'rgba(71, 129, 148, 0.07)';
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
        context.strokeStyle = `rgba(61, 126, 148, ${alpha})`;
        context.lineWidth = cluster.activity > 0 ? 1 : 0.65;
        context.beginPath();
        context.moveTo(centerX, centerY);
        const controlX = centerX + (cluster.x - centerX) * 0.52;
        const controlY = centerY + (cluster.y - centerY) * 0.32;
        context.quadraticCurveTo(controlX, controlY, cluster.x, cluster.y);
        context.stroke();
      }
      context.restore();

      let spawnActivity = 0;
      for (const node of nodes.values()) {
        const age = timestamp - node.createdAt;
        const hash = hashString(node.id);
        const cluster = clusters[node.cluster];
        const clusterOffsetX = cluster ? cluster.x - cluster.baseX : 0;
        const clusterOffsetY = cluster ? cluster.y - cluster.baseY : 0;
        const localDrift = reducedMotion ? 0 : Math.sin(time * 0.22 + hash * 0.00001) * 1.3;
        node.targetX = node.baseTargetX + clusterOffsetX + localDrift;
        node.targetY = node.baseTargetY + clusterOffsetY + localDrift * 0.55;
        const spawnDuration = 820 + (hash % 240);
        if (!reducedMotion && age < spawnDuration) {
          const linearProgress = Math.max(0, Math.min(1, age / spawnDuration));
          const progress = 1 - Math.pow(1 - linearProgress, 3);
          const vectorX = node.targetX - centerX;
          const vectorY = node.targetY - centerY;
          const vectorLength = Math.max(1, Math.sqrt(vectorX * vectorX + vectorY * vectorY));
          const curveOffset = (mixHash(hash, 0xc2b2ae35) / 0x100000000 - 0.5) * 74;
          const controlX = (centerX + node.targetX) / 2 - (vectorY / vectorLength) * curveOffset;
          const controlY = (centerY + node.targetY) / 2 + (vectorX / vectorLength) * curveOffset;
          const inverse = 1 - progress;
          node.x =
            inverse * inverse * centerX +
            2 * inverse * progress * controlX +
            progress * progress * node.targetX;
          node.y =
            inverse * inverse * centerY +
            2 * inverse * progress * controlY +
            progress * progress * node.targetY;
          node.alpha = Math.min(1, linearProgress * 1.7);
          node.scale = 0.34 + progress * 0.66;
          spawnActivity += 1 - linearProgress;
          moving = true;
        } else {
          const ease = reducedMotion ? 1 : node.event.state === 'matched' ? 0.12 : 0.085;
          const dx = node.targetX - node.x;
          const dy = node.targetY - node.y;
          node.x += dx * ease;
          node.y += dy * ease;
          node.alpha += (1 - node.alpha) * 0.1;
          node.scale += (1 - node.scale) * 0.11;
          if (Math.abs(dx) + Math.abs(dy) > 0.25 || node.alpha < 0.995) moving = true;
        }
        node.radius = getNodeRadius(node.event);
      }

      context.save();
      for (const node of nodes.values()) {
        const parent = node.event.parentPuuid ? nodes.get(node.event.parentPuuid) : undefined;
        if (!parent) continue;
        const recent = timestamp - node.stateChangedAt < 1800;
        if (!recent && node.event.state !== 'checking' && node.event.state !== 'matched') continue;
        context.strokeStyle =
          node.event.state === 'matched'
            ? 'rgba(255, 56, 92, 0.22)'
            : 'rgba(69, 130, 151, 0.13)';
        context.lineWidth = node.event.state === 'matched' ? 1.1 : 0.7;
        context.beginPath();
        context.moveTo(parent.x, parent.y);
        context.lineTo(node.x, node.y);
        context.stroke();
      }
      context.restore();

      drawScannerCore(
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

      const labelStart = Math.max(0, nodeSequenceRef.current - 7);
      const drawOrder: ScoutPlayerState[] = ['failed', 'checked', 'queued', 'checking', 'matched'];
      for (const state of drawOrder) {
        for (const node of nodes.values()) {
          if (node.event.state !== state) continue;
          const floatX = reducedMotion ? 0 : Math.sin(time * 0.72 + hashString(node.id)) * 1.6;
          const floatY = reducedMotion ? 0 : Math.cos(time * 0.61 + hashString(node.id)) * 1.4;
          const x = node.x + floatX;
          const y = node.y + floatY;
          const radius = node.radius * node.scale;
          const pulse = reducedMotion ? 0 : (Math.sin(time * 3.4 + hashString(node.id)) + 1) / 2;

          context.save();
          context.globalAlpha = node.alpha;
          if (state === 'checking' || state === 'matched') {
            context.strokeStyle =
              state === 'matched'
                ? `rgba(255, 56, 92, ${0.24 + pulse * 0.22})`
                : `rgba(57, 133, 168, ${0.2 + pulse * 0.18})`;
            context.lineWidth = state === 'matched' ? 1.4 : 1;
            context.beginPath();
            context.arc(x, y, radius + 4 + pulse * 3, 0, Math.PI * 2);
            context.stroke();
          }

          context.fillStyle = STATE_COLORS[state];
          context.beginPath();
          context.arc(x, y, radius + 1.4, 0, Math.PI * 2);
          context.fill();
          drawAvatar(context, node, x, y, radius);
          context.strokeStyle = state === 'matched' ? '#ff385c' : state === 'checking' ? '#3985a8' : '#ffffff';
          context.lineWidth = state === 'matched' ? 2 : 1.3;
          context.beginPath();
          context.arc(x, y, radius + 1, 0, Math.PI * 2);
          context.stroke();

          const showLabel = state === 'matched' || state === 'checking' || node.order >= labelStart;
          if (showLabel && timestamp - node.stateChangedAt > 90) {
            const label = getPlayerShortName(node.event);
            context.font = '620 8px system-ui, sans-serif';
            const labelY = y + radius + 6;
            context.textAlign = 'center';
            context.textBaseline = 'top';
            context.lineWidth = 3;
            context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            context.strokeText(label, x, labelY, 82);
            context.fillStyle = state === 'matched' ? '#c72e4b' : '#53636b';
            context.fillText(label, x, labelY, 82);
          }
          context.restore();
        }
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
    observer.observe(host);
    resize();
    return () => {
      disposed = true;
      observer.disconnect();
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

    for (const id of nodes.keys()) {
      if (!desiredIds.has(id)) nodes.delete(id);
    }

    for (const player of visiblePlayers) {
      let node = nodes.get(player.puuid);
      if (!node) {
        const hash = hashString(player.puuid);
        node = {
          id: player.puuid,
          event: player,
          order: ++nodeSequenceRef.current,
          cluster: mixHash(hash, 0x9e3779b9) % CLUSTER_COUNT,
          x: centerX,
          y: centerY,
          baseTargetX: centerX,
          baseTargetY: centerY,
          targetX: centerX,
          targetY: centerY,
          alpha: 0,
          scale: 0.28,
          radius: getNodeRadius(player),
          createdAt: now,
          stateChangedAt: now,
          image: null,
          imageUrl: '',
        };
        nodes.set(player.puuid, node);
      } else if (node.event.state !== player.state) {
        node.stateChangedAt = now;
        node.order = ++nodeSequenceRef.current;
        node.scale = Math.min(node.scale, 0.76);
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
