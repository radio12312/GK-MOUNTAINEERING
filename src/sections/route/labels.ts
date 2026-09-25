/**
 * The Route — HTML camp labels + HUD (no Three.js; shared by the 3D view and the fallback).
 * Positioning is transform-only; sizes are measured on resize, never per frame.
 */
import { camps, route } from '../../config';

export interface StopInfo {
  id: string;
  name: string;
  alt: number;
  day: number;
  note: string;
  t: number;
}

export const stops: StopInfo[] = route.stops.map((s) => {
  const camp = camps.find((c) => c.id === s.campId);
  return {
    id: s.campId,
    name: camp?.name ?? s.campId,
    alt: camp?.alt ?? 0,
    day: camp?.day ?? 1,
    note: s.note,
    t: s.t,
  };
});

export const fmtAlt = (m: number) => `${Math.round(m).toLocaleString('en-US')} m`;

/** Leader-line lengths (px) per stop — staggered so neighbouring cards don't collide. */
const LEADS = [58, 84, 66, 96];

export function labelsMarkup(): string {
  return stops
    .map(
      (s, k) => `
      <div class="route-label" data-stop="${k}">
        <span class="route-label__dot"></span>
        <div class="route-label__card">
          <div class="route-label__body">
            <span class="route-label__name">${s.name}</span>
            <span class="route-label__meta"><span class="mono">${fmtAlt(s.alt)}</span><span class="route-label__sep" aria-hidden="true">·</span>${route.dayLabel}&nbsp;<span class="mono">${s.day}</span></span>
            <span class="route-label__note">${s.note}</span>
          </div>
        </div>
      </div>`,
    )
    .join('');
}

export function srListMarkup(): string {
  return `<ol class="sr-only">${stops
    .map((s) => `<li>${s.name}, ${fmtAlt(s.alt)}, ${route.dayLabel} ${s.day}: ${s.note}.</li>`)
    .join('')}</ol>`;
}

export function hudMarkup(): string {
  const last = stops[stops.length - 1];
  return `
    <div class="route__hud" aria-hidden="true">
      <div class="route__hud-cell">
        <span class="route__hud-label">${route.dayLabel}</span>
        <span class="route__hud-value mono"><span data-hud-day>1</span><span class="route__hud-of"> / ${last.day}</span></span>
      </div>
      <div class="route__hud-cell">
        <span class="route__hud-label">Altitude</span>
        <span class="route__hud-value mono" data-hud-alt>${fmtAlt(stops[0].alt)}</span>
      </div>
      <div class="route__hud-bar"><span data-hud-bar></span></div>
    </div>`;
}

export interface RouteLabels {
  /** Re-measure card sizes (call after resize / font load). */
  measure(): void;
  /**
   * pos: [x, y, inFront, routeDx] per stop in CSS px relative to the stage (routeDx: the
   * route's screen x direction away from the camp; cards sit on the opposite side).
   * t: route progress.
   */
  update(pos: Float32Array, t: number, width: number, height: number): void;
}

interface LabelState {
  el: HTMLElement;
  dot: HTMLElement;
  card: HTMLElement;
  w: number;
  h: number;
  on: boolean;
  below: boolean;
  left: boolean;
  dx: number;
  dy: number;
  cx: number;
  cy: number;
}

export function createLabels(root: HTMLElement): RouteLabels {
  const items: LabelState[] = Array.from(root.querySelectorAll<HTMLElement>('.route-label')).map((el) => ({
    el,
    dot: el.querySelector<HTMLElement>('.route-label__dot')!,
    card: el.querySelector<HTMLElement>('.route-label__card')!,
    w: 160,
    h: 60,
    on: false,
    below: false,
    left: false,
    dx: -1e6, // sentinel: forces the first write
    dy: -1e6,
    cx: -1e6,
    cy: -1e6,
  }));
  let leadScale = 1;

  const measure = () => {
    leadScale = window.innerWidth < 600 ? 0.62 : 1;
    items.forEach((it, k) => {
      it.w = it.card.offsetWidth;
      it.h = it.card.offsetHeight;
      it.el.style.setProperty('--lead', `${Math.round(LEADS[k % LEADS.length] * leadScale)}px`);
    });
  };

  const update = (pos: Float32Array, t: number, width: number, height: number) => {
    const margin = width < 600 ? 12 : 24;
    const top = 76; // clear of the fixed nav
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      const x = pos[k * 4];
      const y = pos[k * 4 + 1];
      // The bottom 12% is faded into the page (and holds the HUD): treat it as off-screen.
      const onScreen = pos[k * 4 + 2] > 0 && x > -40 && x < width + 40 && y > -40 && y < height * 0.88;
      const dx = pos[k * 4 + 3];
      if (Math.abs(dx) > 14) {
        const left = dx > 0; // adjacent route lies to the right → card goes left
        if (left !== it.left) {
          it.left = left;
          it.el.classList.toggle('is-left', left);
        }
      }
      const on = onScreen && t >= stops[k].t - 1e-4;
      if (on !== it.on) {
        it.on = on;
        it.el.classList.toggle('is-on', on);
      }
      if (!onScreen) continue;

      const lead = LEADS[k % LEADS.length] * leadScale;
      const below = y - lead - it.h < top;
      if (below !== it.below) {
        it.below = below;
        it.el.classList.toggle('is-below', below);
      }
      const cx = Math.min(Math.max(it.left ? x - it.w + 10 : x - 10, margin), width - it.w - margin);
      const cy = below ? y + lead : y - lead - it.h;
      if (Math.abs(x - it.dx) > 0.2 || Math.abs(y - it.dy) > 0.2) {
        it.dx = x;
        it.dy = y;
        it.dot.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      }
      if (Math.abs(cx - it.cx) > 0.2 || Math.abs(cy - it.cy) > 0.2) {
        it.cx = cx;
        it.cy = cy;
        it.card.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
      }
    }
  };

  return { measure, update };
}

export interface RouteHud {
  update(t: number): void;
}

/** Day + altitude interpolated between stops (monotonic, consistent with the labels). */
export function createHud(root: HTMLElement): RouteHud | null {
  const dayEl = root.querySelector<HTMLElement>('[data-hud-day]');
  const altEl = root.querySelector<HTMLElement>('[data-hud-alt]');
  const bar = root.querySelector<HTMLElement>('[data-hud-bar]');
  if (!dayEl || !altEl || !bar) return null;
  let lastDay = -1;
  let lastAlt = -1;
  let lastBar = -1;
  return {
    update(t: number) {
      let k = 1;
      while (k < stops.length - 1 && t > stops[k].t) k++;
      const a = stops[k - 1];
      const b = stops[k];
      const f = Math.min(1, Math.max(0, (t - a.t) / Math.max(1e-6, b.t - a.t)));
      const day = Math.max(1, Math.round(a.day + (b.day - a.day) * f));
      const alt = Math.round((a.alt + (b.alt - a.alt) * f) / 10) * 10;
      if (day !== lastDay) {
        lastDay = day;
        dayEl.textContent = String(day);
      }
      if (alt !== lastAlt) {
        lastAlt = alt;
        altEl.textContent = fmtAlt(alt);
      }
      const bt = Math.round(t * 1000) / 1000;
      if (bt !== lastBar) {
        lastBar = bt;
        bar.style.transform = `scaleX(${bt})`;
      }
    },
  };
}
