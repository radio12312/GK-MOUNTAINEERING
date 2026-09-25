/**
 * The Route — 3D controller (lazy chunk). Wires the scene to scroll progress, the render
 * loop (only while the section is on screen and something is moving), resize, labels + HUD.
 */
import { gsap } from '../../lib/scroll';
import type { RouteHud, RouteLabels } from './labels';
import { loadHeightfield } from './loadHeightfield';
import { buildPaths } from './paths';
import { RouteScene } from './scene';

export interface Route3DOptions {
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  labels: RouteLabels;
  hud: RouteHud | null;
  /** Reduced motion: final pose, full route, no scroll animation. */
  staticMode: boolean;
  progress: number;
  active: boolean;
}

export interface Route3DHandle {
  setProgress(p: number): void;
  setActive(active: boolean): void;
}

export async function mountRoute3D(opts: Route3DOptions): Promise<Route3DHandle> {
  const { stage, canvas, labels, hud, staticMode } = opts;
  const hf = await loadHeightfield();
  const paths = buildPaths(hf);
  const scene = new RouteScene(canvas, hf, paths);

  const campPos = new Float32Array(paths.campPos.length * 4);
  let width = stage.clientWidth;
  let height = stage.clientHeight;
  let active = opts.active;
  let running = false;
  let dirty = true;
  let lastActiveAt = 0;

  const dpr = () => Math.min(window.devicePixelRatio || 1, 1.75);
  const resize = () => {
    width = stage.clientWidth;
    height = stage.clientHeight;
    scene.setSize(width, height, dpr());
    labels.measure();
    if (staticMode) scene.snap();
    dirty = true;
    if (!running) frame();
  };

  const syncOverlays = () => {
    scene.projectCamps(campPos);
    labels.update(campPos, scene.t, width, height);
    hud?.update(scene.t);
  };

  /** One render + overlay sync (used when the loop isn't running). */
  const frame = () => {
    scene.render();
    syncOverlays();
    dirty = false;
  };

  const tick = (_time: number, deltaMs: number) => {
    const dt = Math.min(deltaMs / 1000, 0.1);
    const moving = scene.step(dt);
    if (moving || dirty) frame();
  };

  const start = () => {
    if (running || staticMode) return;
    running = true;
    // Coming back after a while: jump to where the scroll is instead of flying across.
    if (performance.now() - lastActiveAt > 400) scene.snap();
    gsap.ticker.add(tick);
  };
  const stop = () => {
    if (!running) return;
    running = false;
    lastActiveAt = performance.now();
    gsap.ticker.remove(tick);
  };

  scene.setProgress(staticMode ? 1 : opts.progress);
  scene.setSize(width, height, dpr());
  scene.snap();
  labels.measure();
  await scene.compile();
  frame();
  stage.classList.add('is-ready');

  new ResizeObserver(() => resize()).observe(stage);
  document.fonts?.ready.then(() => {
    labels.measure();
    dirty = true;
    if (!running) frame();
  });

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    stop();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    dirty = true;
    if (active) start();
    else frame();
  });

  if (active) start();

  return {
    setProgress(p: number) {
      if (staticMode) return;
      scene.setProgress(p);
    },
    setActive(on: boolean) {
      active = on;
      if (on) start();
      else stop();
    },
  };
}
