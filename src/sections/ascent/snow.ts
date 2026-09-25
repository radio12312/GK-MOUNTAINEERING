import { gsap } from '../../lib/scroll';
import { particles as cfg } from '../../config';
import { env, lerp } from '../../lib/env';
import { getWind } from '../../lib/wind';

/**
 * Canvas-2D snow / spindrift. Wind (0–1) controls count, fall speed, horizontal drift
 * and streak length: near-still flakes at base camp, driven streaks on the night ridge.
 * Flakes are batched into three depth layers → three stroke() calls per frame.
 */
interface Flake {
  x: number;
  y: number;
  z: number; // depth 0.25 (far) – 1 (near)
  phase: number;
  freq: number;
}

export function createSnow(canvas: HTMLCanvasElement): { start(): void; stop(): void } {
  const ctx = canvas.getContext('2d')!;
  const max = env.mobile ? Math.round(cfg.countMax * 0.5) : cfg.countMax;
  const flakes: Flake[] = [];
  let w = 0;
  let h = 0;
  let dpr = 1;
  let running = false;
  let t = 0;
  let wind = 0;

  const spawn = (f: Flake, anywhere: boolean) => {
    f.z = 0.25 + Math.random() * 0.75;
    f.x = Math.random() * (w + 200) - 100;
    f.y = anywhere ? Math.random() * h : -10 - Math.random() * 40;
    f.phase = Math.random() * Math.PI * 2;
    f.freq = 0.4 + Math.random() * 0.9;
    return f;
  };

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  for (let i = 0; i < max; i++) flakes.push(spawn({ x: 0, y: 0, z: 0, phase: 0, freq: 0 }, true));

  const layers = [
    { min: 0.25, max: 0.5, alpha: 0.35, width: 1.1 },
    { min: 0.5, max: 0.78, alpha: 0.55, width: 1.7 },
    { min: 0.78, max: 1.01, alpha: 0.8, width: 2.6 },
  ];

  const frame = (_time: number, dtMs: number) => {
    const dt = Math.min(dtMs, 50) / 16.667; // in 60fps frames
    t += dt / 60;
    wind = lerp(wind, getWind(), 1 - Math.exp(-dt * 0.04)); // wind changes slowly
    const active = Math.round(cfg.countMin + (max - cfg.countMin) * Math.min(1, wind * 1.15));
    const fall = lerp(cfg.speedMin, cfg.speedMax, wind);
    const drift = cfg.driftMax * wind * wind;
    const gust = 1 + Math.sin(t * 0.7) * 0.35 * wind;
    const streak = 0.6 + wind * 5;

    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';

    for (const L of layers) {
      ctx.beginPath();
      ctx.lineWidth = L.width;
      ctx.strokeStyle = `rgba(238,242,245,${(L.alpha * cfg.opacity).toFixed(3)})`;
      for (let i = 0; i < active; i++) {
        const f = flakes[i];
        if (f.z < L.min || f.z >= L.max) continue;
        const vx = (drift * gust * f.z + Math.sin(t * f.freq + f.phase) * 0.35) * dt;
        const vy = (0.35 + f.z) * fall * dt;
        f.x += vx;
        f.y += vy;
        if (f.y > h + 20 || f.x > w + 120 || f.x < -120) {
          spawn(f, false);
          if (drift > 1.5) {
            // strong wind: re-enter from the upwind side too
            if (Math.random() < 0.6) {
              f.x = -20 - Math.random() * 60;
              f.y = Math.random() * h;
            }
          }
          continue;
        }
        const len = streak * f.z;
        const n = Math.hypot(vx, vy) || 1;
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.x - (vx / n) * len, f.y - (vy / n) * len + 0.01);
      }
      ctx.stroke();
    }
  };

  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 100);
  };

  return {
    start() {
      if (running || env.reducedMotion) return;
      running = true;
      resize();
      window.addEventListener('resize', onResize);
      gsap.ticker.add(frame);
      canvas.style.opacity = '1';
    },
    stop() {
      if (!running) return;
      running = false;
      window.removeEventListener('resize', onResize);
      gsap.ticker.remove(frame);
      ctx.clearRect(0, 0, w, h);
    },
  };
}
