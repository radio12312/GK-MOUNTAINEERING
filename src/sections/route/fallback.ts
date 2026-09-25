/**
 * The Route — low-end / no-WebGL2 fallback: a pre-rendered still of the massif with the
 * route as a dashed SVG line that draws itself on scroll (static under reduced motion).
 *
 * Assets come from the dev capture (public/route/route-static.{webp,json}). If the JSON is
 * missing, the projection is computed on the fly (lazy, includes Three.js math); if the
 * image is missing, the stage's gradient sky shows through behind the SVG route.
 */
import { route } from '../../config';
import type { StaticProjection } from './paths';
import type { RouteHud, RouteLabels } from './labels';

export interface FallbackOptions {
  stage: HTMLElement;
  layer: HTMLElement;
  labels: RouteLabels;
  hud: RouteHud | null;
  staticMode: boolean;
  progress: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const DRAW_END = 0.85;

function isProjection(d: unknown): d is StaticProjection {
  const p = d as StaticProjection;
  return (
    !!p && p.version === 1 && Array.isArray(p.route) && p.route.length > 1 && Array.isArray(p.camps) &&
    typeof p.width === 'number' && typeof p.height === 'number'
  );
}

async function loadProjection(): Promise<StaticProjection> {
  try {
    const res = await fetch(route.staticImage.data);
    if (res.ok) {
      const data: unknown = await res.json();
      if (isProjection(data)) return data;
    }
  } catch {
    /* fall through to computing it */
  }
  const [{ loadHeightfield }, { buildPaths, staticProjection }] = await Promise.all([
    import('./loadHeightfield'),
    import('./paths'),
  ]);
  const { width, height } = route.staticImage;
  return staticProjection(buildPaths(await loadHeightfield()), width, height);
}

export async function mountFallback(opts: FallbackOptions) {
  const { stage, layer, labels, hud, staticMode } = opts;
  const data = await loadProjection();

  const frame = document.createElement('div');
  frame.className = 'route-static';
  const img = document.createElement('img');
  img.className = 'route-static__img';
  img.alt = '';
  img.decoding = 'async';
  img.addEventListener('error', () => img.remove(), { once: true });
  img.addEventListener('load', () => frame.classList.add('has-image'), { once: true });
  img.src = route.staticImage.src;
  frame.append(img);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'route-static__svg');
  const maskId = 'route-static-mask';
  svg.innerHTML = `
    <defs><mask id="${maskId}" maskUnits="userSpaceOnUse"><path class="route-static__mask" /></mask></defs>
    <path class="route-static__ghost" />
    <path class="route-static__path" mask="url(#${maskId})" />
    <circle class="route-static__head" r="4.5" />`;
  layer.append(frame, svg);

  const mask = svg.querySelector<SVGMaskElement>('mask')!;
  const maskPath = svg.querySelector<SVGPathElement>('.route-static__mask')!;
  const ghost = svg.querySelector<SVGPathElement>('.route-static__ghost')!;
  const path = svg.querySelector<SVGPathElement>('.route-static__path')!;
  const head = svg.querySelector<SVGCircleElement>('.route-static__head')!;

  const n = data.route.length;
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const len = new Float32Array(n);
  const campPx = new Float32Array(data.camps.length * 4);
  let total = 1;
  let width = 1;
  let height = 1;
  let progress = staticMode ? 1 : opts.progress;
  const stopT = route.stops.map((s) => s.t);
  const campS = data.camps.map((c) => c.s);

  /** Fit: cover the stage, but never crop the route; centre on the route's bounds. */
  const layout = () => {
    width = stage.clientWidth;
    height = stage.clientHeight;
    const iw = data.width;
    const ih = data.height;
    let minX = 1;
    let maxX = 0;
    let minY = 1;
    let maxY = 0;
    for (const [x, y] of data.route) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const cover = Math.max(width / iw, height / ih);
    const routeFit = Math.min((width * 0.86) / ((maxX - minX) * iw), (height * 0.72) / ((maxY - minY) * ih));
    const scale = Math.min(cover, routeFit);
    const w = iw * scale;
    const h = ih * scale;
    const centre = (size: number, span: number, mid: number) => {
      const off = size / 2 - mid * span;
      return span >= size ? Math.min(0, Math.max(size - span, off)) : (size - span) / 2;
    };
    const ox = centre(width, w, (minX + maxX) / 2);
    const oy = centre(height, h, (minY + maxY) / 2);
    frame.style.transform = `translate3d(${ox}px, ${oy}px, 0)`;
    frame.style.width = `${w}px`;
    frame.style.height = `${h}px`;
    frame.classList.toggle('is-contained', w < width - 1 || h < height - 1);

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    mask.setAttribute('x', '0');
    mask.setAttribute('y', '0');
    mask.setAttribute('width', String(width));
    mask.setAttribute('height', String(height));

    let d = '';
    total = 0;
    for (let i = 0; i < n; i++) {
      px[i] = ox + data.route[i][0] * w;
      py[i] = oy + data.route[i][1] * h;
      if (i > 0) total += Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
      len[i] = total;
      d += `${i ? 'L' : 'M'}${px[i].toFixed(1)} ${py[i].toFixed(1)}`;
    }
    for (const p of [maskPath, ghost, path]) p.setAttribute('d', d);
    // Gap longer than the path so the dash never repeats (browser length ≠ our sum exactly).
    maskPath.style.strokeDasharray = `${total} ${total * 2 + 100}`;
    const last = data.camps.length - 1;
    data.camps.forEach((c, k) => {
      const x = ox + c.x * w;
      campPx[k * 4] = x;
      campPx[k * 4 + 1] = oy + c.y * h;
      campPx[k * 4 + 2] = 1;
      // Route direction near the camp (leaving it; arriving for the last one).
      const target = k === last ? c.s - 0.04 : c.s + 0.04;
      let j = 0;
      while (j < n - 1 && data.route[j][2] < target) j++;
      campPx[k * 4 + 3] = px[j] - x;
    });
    labels.measure();
    draw();
  };

  const sAt = (t: number) => {
    for (let k = 1; k < stopT.length; k++) {
      if (t <= stopT[k]) {
        const f = (t - stopT[k - 1]) / Math.max(1e-6, stopT[k] - stopT[k - 1]);
        return campS[k - 1] + (campS[k] - campS[k - 1]) * Math.max(0, f);
      }
    }
    return 1;
  };

  const draw = () => {
    const t = Math.min(1, progress / DRAW_END);
    const s = sAt(t);
    let i = 0;
    while (i < n - 2 && data.route[i + 1][2] < s) i++;
    const s0 = data.route[i][2];
    const s1 = data.route[i + 1][2];
    const f = Math.min(1, Math.max(0, (s - s0) / Math.max(1e-6, s1 - s0)));
    const l = len[i] + (len[i + 1] - len[i]) * f;
    maskPath.style.strokeDashoffset = String(total - l);
    head.setAttribute('cx', (px[i] + (px[i + 1] - px[i]) * f).toFixed(1));
    head.setAttribute('cy', (py[i] + (py[i + 1] - py[i]) * f).toFixed(1));
    labels.update(campPx, t, width, height);
    hud?.update(t);
  };

  new ResizeObserver(layout).observe(stage);
  layout();
  stage.classList.add('is-ready');

  return {
    setProgress(p: number) {
      if (staticMode) return;
      progress = p;
      draw();
    },
    setActive() {
      /* nothing runs continuously */
    },
  };
}
