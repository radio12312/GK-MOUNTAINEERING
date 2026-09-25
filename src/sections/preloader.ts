import { preloader as cfg } from '../config';
import { gsap } from '../lib/scroll';
import { onLoadProgress } from '../lib/loader';
import { env, clamp } from '../lib/env';
import { html } from './dom';

/** px between percentage ticks on the ruler (must match --pl-step in sections.css). */
const STEP = 8;

/**
 * Altimeter preloader. The readout eases toward the real load progress (never backwards).
 * `done` resolves when loading completes (after minShowMs) or at maxWaitMs, whichever
 * comes first, so the page is never blocked longer than maxWaitMs.
 */
export function initPreloader(): { done: Promise<void> } {
  const found = document.getElementById('preloader');
  if (!found) return { done: Promise.resolve() };
  const root: HTMLElement = found;

  const labels = Array.from({ length: 11 }, (_, i) => 100 - i * 10);
  root.innerHTML = html`
    <div class="pl" aria-hidden="true">
      <div class="pl__ruler">
        <div class="pl__strip" data-strip>
          ${labels.map((v) => html`<span class="pl__mark mono" style="top:${(100 - v) * STEP}px">${String(v).padStart(3, '0')}</span>`)}
        </div>
        <span class="pl__needle"></span>
      </div>
      <div class="pl__readout">
        <p class="eyebrow pl__label">${cfg.label}</p>
        <p class="pl__value mono"><span data-value>000</span><span class="pl__unit">%</span></p>
      </div>
    </div>
    <span class="sr-only" data-status>${cfg.loadingText}</span>
  `.value;

  const valueEl = root.querySelector<HTMLElement>('[data-value]')!;
  const strip = root.querySelector<HTMLElement>('[data-strip]')!;
  const status = root.querySelector<HTMLElement>('[data-status]')!;

  const t0 = performance.now();
  let target = 0; // real progress, monotonic
  let shown = 0; // displayed progress
  let lastText = '';
  let finishing = false;
  let raf = 0;

  const unsubscribe = onLoadProgress((p) => {
    target = Math.max(target, clamp(p));
  });

  let resolveDone!: () => void;
  const done = new Promise<void>((res) => (resolveDone = res));

  const render = () => {
    const pct = Math.round(shown * 100);
    const text = String(pct).padStart(3, '0');
    if (text !== lastText) {
      valueEl.textContent = text;
      lastText = text;
    }
    strip.style.transform = `translate3d(0, ${(-(100 - shown * 100) * STEP).toFixed(1)}px, 0)`;
  };

  let last = t0;
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const elapsed = now - t0;

    // Finish when loaded (but not before minShowMs), or early enough that the
    // closing count still lands inside maxWaitMs.
    if (!finishing && ((target >= 1 && elapsed >= cfg.minShowMs) || elapsed >= cfg.maxWaitMs - 400)) {
      finishing = true;
    }

    const goal = finishing ? 1 : target * 0.97; // hold back a touch until really done
    const rate = finishing ? 14 : 3.2;
    shown = Math.max(shown, shown + (goal - shown) * (1 - Math.exp(-rate * dt)));
    if (finishing && 1 - shown < 0.004) shown = 1;
    render();

    if (shown >= 1) {
      finish();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  // rAF doesn't run in background tabs: a plain timer guarantees the hard cap.
  const failSafe = window.setTimeout(() => {
    shown = 1;
    render();
    finish();
  }, cfg.maxWaitMs);

  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(failSafe);
    cancelAnimationFrame(raf);
    unsubscribe();
    status.textContent = cfg.loadedText;
    root.setAttribute('aria-busy', 'false');
    resolveDone();

    const remove = () => {
      root.hidden = true;
      root.remove();
    };
    if (env.reducedMotion) {
      gsap.to(root, { opacity: 0, duration: 0.5, ease: 'power2.out', onComplete: remove });
      return;
    }
    gsap
      .timeline({ onComplete: remove })
      .to(root.querySelector('.pl'), { yPercent: -18, opacity: 0, duration: 0.9, ease: 'expo.in' }, 0)
      .fromTo(
        root,
        { clipPath: 'inset(0% 0% 0% 0%)' },
        { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.1, ease: 'expo.inOut' },
        0.1,
      );
  }

  root.setAttribute('aria-busy', 'true');
  return { done };
}
