import { useEffect, useRef, type CSSProperties } from 'react';

interface DamageEnergyBarProps {
  damageShare: number;
  win: boolean;
}

interface Point {
  x: number;
  y: number;
}

interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetVx: number;
  targetVy: number;
  changeIn: number;
  hesitateIn: number;
  hesitateFor: number;
  radius: number;
  phase: number;
  flickerRate: number;
  history: Point[];
}

const random = (min: number, max: number) => min + Math.random() * (max - min);

export function DamageEnergyBar({ damageShare, win }: DamageEnergyBarProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visualWidth = Math.max(0, Math.min(100, damageShare));

  useEffect(() => {
    const host = hostRef.current;
    const fill = fillRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!host || !fill || !canvas || !context) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const particles: Firefly[] = [];
    const spark = win ? { r: 226, g: 255, b: 247 } : { r: 255, g: 239, b: 244 };
    const sparkColor = `rgb(${spark.r} ${spark.g} ${spark.b})`;
    let width = 1;
    let height = 1;
    let animationFrame = 0;
    let lastTime = performance.now();
    let pageVisible = !document.hidden;
    let elementVisible = false;

    const reset = (particle: Firefly, initial = false) => {
      particle.x = initial ? random(0, width) : random(-14, -3);
      particle.y = random(5, Math.max(6, height - 5));
      particle.vx = random(12, 38);
      particle.vy = random(-4, 4);
      particle.targetVx = random(9, 52);
      particle.targetVy = random(-15, 15);
      particle.changeIn = random(0.14, 0.85);
      particle.hesitateIn = random(0.45, 2.6);
      particle.hesitateFor = 0;
      particle.radius = random(0.75, 1.45);
      particle.phase = random(0, Math.PI * 2);
      particle.flickerRate = random(2.2, 6.2);
      particle.history = [];
    };

    const createParticle = (initial = false): Firefly => {
      const particle = {} as Firefly;
      reset(particle, initial);
      return particle;
    };

    const resize = () => {
      const rect = fill.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      const desired = Math.max(5, Math.min(11, Math.round(width / 20)));
      while (particles.length < desired) particles.push(createParticle(true));
      if (particles.length > desired) particles.length = desired;
    };

    const update = (particle: Firefly, delta: number, time: number) => {
      particle.changeIn -= delta;
      particle.hesitateIn -= delta;

      if (particle.changeIn <= 0) {
        particle.targetVx = random(8, 58);
        particle.targetVy = random(-19, 19);
        particle.changeIn = random(0.12, 0.82);
      }

      if (particle.hesitateIn <= 0 && particle.hesitateFor <= 0) {
        particle.hesitateFor = random(0.07, 0.3);
        particle.hesitateIn = random(0.8, 3.1);
      }

      const targetX = particle.hesitateFor > 0 ? random(1.5, 6) : particle.targetVx;
      if (particle.hesitateFor > 0) particle.hesitateFor -= delta;

      const drift =
        Math.sin(time * 0.0021 + particle.phase) * 4.8 +
        Math.sin(time * 0.0053 + particle.phase * 1.7) * 2;
      particle.vx += (targetX - particle.vx) * Math.min(1, delta * 2.4);
      particle.vy += (particle.targetVy + drift - particle.vy) * Math.min(1, delta * 2.1);
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;

      const top = particle.radius + 3;
      const bottom = height - particle.radius - 3;
      if (particle.y <= top) {
        particle.y = top;
        particle.vy = Math.abs(particle.vy) * 0.5;
        particle.targetVy = random(4, 18);
      } else if (particle.y >= bottom) {
        particle.y = bottom;
        particle.vy = -Math.abs(particle.vy) * 0.5;
        particle.targetVy = random(-18, -4);
      }

      const nextHistoryLength = Math.min(6, particle.history.length + 1);
      while (particle.history.length < nextHistoryLength) {
        particle.history.push({ x: particle.x, y: particle.y });
      }
      for (let index = nextHistoryLength - 1; index > 0; index -= 1) {
        particle.history[index].x = particle.history[index - 1].x;
        particle.history[index].y = particle.history[index - 1].y;
      }
      particle.history[0].x = particle.x;
      particle.history[0].y = particle.y;
      if (particle.x > width + 12) reset(particle);
    };

    const drawParticle = (particle: Firefly, time: number) => {
      const pulse = 0.34 + 0.66 * Math.abs(Math.sin(time * 0.001 * particle.flickerRate + particle.phase));

      if (particle.history.length > 2) {
        context.beginPath();
        context.moveTo(particle.history[0].x, particle.history[0].y);
        for (let index = 1; index < particle.history.length; index++) {
          context.lineTo(particle.history[index].x, particle.history[index].y);
        }
        context.globalAlpha = 0.16 * pulse;
        context.strokeStyle = sparkColor;
        context.lineWidth = 0.65;
        context.stroke();
      }

      context.globalAlpha = 0.1 * pulse;
      context.fillStyle = sparkColor;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius * 4, 0, Math.PI * 2);
      context.fill();

      context.globalAlpha = 0.44 + 0.42 * pulse;
      context.shadowColor = sparkColor;
      context.shadowBlur = 5 + particle.radius * 2;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      context.globalAlpha = 1;
    };

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = 'lighter';
      particles.forEach((particle) => drawParticle(particle, time));
      context.globalCompositeOperation = 'source-over';
    };

    const frame = (time: number) => {
      animationFrame = 0;
      if (!pageVisible || !elementVisible) return;
      const delta = Math.min(0.034, Math.max(0.001, (time - lastTime) / 1000));
      lastTime = time;
      particles.forEach((particle) => update(particle, delta, time));
      draw(time);
      animationFrame = window.requestAnimationFrame(frame);
    };

    const startAnimation = () => {
      if (reducedMotion || animationFrame || !pageVisible || !elementVisible) return;
      lastTime = performance.now();
      animationFrame = window.requestAnimationFrame(frame);
    };

    const stopAnimation = () => {
      if (!animationFrame) return;
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    };

    const onVisibilityChange = () => {
      pageVisible = !document.hidden;
      if (pageVisible) startAnimation();
      else stopAnimation();
    };

    const resizeObserver = new ResizeObserver(resize);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      elementVisible = Boolean(entry?.isIntersecting && entry.intersectionRatio > 0);
      if (elementVisible) startAnimation();
      else stopAnimation();
    });
    resizeObserver.observe(fill);
    visibilityObserver.observe(host);
    document.addEventListener('visibilitychange', onVisibilityChange);
    resize();

    if (reducedMotion) {
      draw(0);
    }

    return () => {
      stopAnimation();
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [win]);

  return (
    <span
      ref={hostRef}
      className={`lol-rift-damage-energy lol-rift-damage-energy--${win ? 'win' : 'loss'}`}
      style={{ '--damage-energy-width': `${visualWidth.toFixed(2)}%` } as CSSProperties}
      aria-hidden="true"
    >
      <span ref={fillRef} className="lol-rift-damage-energy__fill">
        <span className="lol-rift-damage-energy__beam" />
        <canvas ref={canvasRef} />
      </span>
    </span>
  );
}
