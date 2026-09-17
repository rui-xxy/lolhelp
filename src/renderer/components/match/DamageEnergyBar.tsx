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
    const spark = win ? { r: 226, g: 241, b: 235 } : { r: 245, g: 224, b: 230 };
    const sparkColor = `rgb(${spark.r} ${spark.g} ${spark.b})`;
    let width = 1;
    let height = 1;
    let animationFrame = 0;
    let lastTime = performance.now();
    let pageVisible = !document.hidden;
    let elementVisible = false;

    const reset = (particle: Firefly, initial = false) => {
      particle.x = initial ? random(0, width) : random(-10, -2);
      particle.y = random(6, Math.max(7, height - 6));
      particle.vx = random(8, 24);
      particle.vy = random(-2, 2);
      particle.targetVx = random(10, 30);
      particle.targetVy = random(-7, 7);
      particle.changeIn = random(0.45, 1.5);
      particle.hesitateIn = random(1.4, 4);
      particle.hesitateFor = 0;
      particle.radius = random(0.45, 1.05);
      particle.phase = random(0, Math.PI * 2);
      particle.flickerRate = random(1.2, 3.4);
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

      const desired = Math.max(3, Math.min(7, Math.round(width / 32)));
      while (particles.length < desired) particles.push(createParticle(true));
      if (particles.length > desired) particles.length = desired;
    };

    const update = (particle: Firefly, delta: number, time: number) => {
      particle.changeIn -= delta;
      particle.hesitateIn -= delta;

      if (particle.changeIn <= 0) {
        particle.targetVx = random(8, 34);
        particle.targetVy = random(-9, 9);
        particle.changeIn = random(0.4, 1.2);
      }

      if (particle.hesitateIn <= 0 && particle.hesitateFor <= 0) {
        particle.hesitateFor = random(0.1, 0.24);
        particle.hesitateIn = random(1.4, 4.2);
      }

      const targetX = particle.hesitateFor > 0 ? random(2, 5) : particle.targetVx;
      if (particle.hesitateFor > 0) particle.hesitateFor -= delta;

      const drift =
        Math.sin(time * 0.0017 + particle.phase) * 2.2 +
        Math.sin(time * 0.0039 + particle.phase * 1.7);
      particle.vx += (targetX - particle.vx) * Math.min(1, delta * 1.7);
      particle.vy += (particle.targetVy + drift - particle.vy) * Math.min(1, delta * 1.5);
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;

      const top = particle.radius + 3;
      const bottom = height - particle.radius - 3;
      if (particle.y <= top) {
        particle.y = top;
        particle.vy = Math.abs(particle.vy) * 0.5;
        particle.targetVy = random(3, 9);
      } else if (particle.y >= bottom) {
        particle.y = bottom;
        particle.vy = -Math.abs(particle.vy) * 0.5;
        particle.targetVy = random(-9, -3);
      }

      const nextHistoryLength = Math.min(4, particle.history.length + 1);
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
        context.globalAlpha = 0.09 * pulse;
        context.strokeStyle = sparkColor;
        context.lineWidth = 0.55;
        context.stroke();
      }

      context.globalAlpha = 0.055 * pulse;
      context.fillStyle = sparkColor;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius * 4, 0, Math.PI * 2);
      context.fill();

      context.globalAlpha = 0.28 + 0.3 * pulse;
      context.shadowColor = sparkColor;
      context.shadowBlur = 3 + particle.radius * 1.5;
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
