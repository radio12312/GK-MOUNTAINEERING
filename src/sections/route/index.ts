/**
 * The Route — section shell. Renders static HTML only; the 3D scene (Three.js) or the
 * static fallback is imported lazily once the section is within ~2 viewports, so neither
 * lands in the initial bundle. The scroll track's height is set here, synchronously, so
 * lazy loading never shifts layout.
 */
import { route } from '../../config';
import { env } from '../../lib/env';
import { ScrollTrigger } from '../../lib/scroll';
import { createHud, createLabels, hudMarkup, labelsMarkup, srListMarkup } from './labels';

interface Handle {
  setProgress(p: number): void;
  setActive(active: boolean): void;
}

export function initRoute(): void {
  const section = document.getElementById('route');
  if (!section) return;

  const capture = import.meta.env.DEV && new URLSearchParams(location.search).has('capture-route');
  const staticMode = env.reducedMotion;
  const useFallback = env.lowEnd && !capture;
  const lengthVh = staticMode ? 100 : useFallback ? route.fallbackLengthVh : route.lengthVh;

  section.classList.add(useFallback ? 'route--fallback' : 'route--webgl');
  if (staticMode) section.classList.add('route--static');
  section.style.setProperty('--route-len', String(Math.max(100, lengthVh)));

  section.innerHTML = `
    <div class="route__intro container">
      <p class="eyebrow route__eyebrow">${route.eyebrow}</p>
      <h2 id="route-title" class="display route__title" data-reveal>${route.heading}</h2>
      <p class="lead route__sub" data-reveal data-reveal-delay="0.12">${route.sub}</p>
    </div>
    <div class="route__track">
      <div class="route__stage">
        <canvas class="route__canvas" aria-hidden="true"></canvas>
        <div class="route__static-layer" aria-hidden="true"></div>
        <div class="route__labels" aria-hidden="true">${labelsMarkup()}</div>
        ${hudMarkup()}
        <p class="route__note mono" aria-hidden="true">${route.fallbackNote}</p>
      </div>
    </div>
    ${srListMarkup()}`;

  const track = section.querySelector<HTMLElement>('.route__track')!;
  const stage = section.querySelector<HTMLElement>('.route__stage')!;
  const canvas = section.querySelector<HTMLCanvasElement>('.route__canvas')!;
  const labels = createLabels(section.querySelector<HTMLElement>('.route__labels')!);
  const hud = createHud(stage);

  let progress = staticMode ? 1 : 0;
  let active = false;
  let handle: Handle | null = null;

  if (!staticMode) {
    ScrollTrigger.create({
      trigger: track,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        progress = self.progress;
        handle?.setProgress(progress);
      },
      onRefresh: (self) => {
        progress = self.progress;
        handle?.setProgress(progress);
      },
    });
  }

  // Render only while the stage can be seen.
  new IntersectionObserver(
    ([entry]) => {
      active = entry.isIntersecting;
      handle?.setActive(active);
    },
    { rootMargin: '5% 0px' },
  ).observe(track);

  const mountFallback = () =>
    import('./fallback').then((m) =>
      m.mountFallback({ stage, layer: section.querySelector<HTMLElement>('.route__static-layer')!, labels, hud, staticMode, progress }),
    );

  let started = false;
  const load = () => {
    if (started) return;
    started = true;
    const pending: Promise<Handle> = useFallback
      ? mountFallback()
      : import('./controller')
          .then((m) => m.mountRoute3D({ stage, canvas, labels, hud, staticMode, progress, active }))
          .catch(() => {
            // No WebGL context (blocked GPU, driver issue): switch to the static map.
            section.classList.replace('route--webgl', 'route--fallback');
            return mountFallback();
          });
    pending
      .then((h) => {
        handle = h;
        h.setProgress(progress);
        h.setActive(active);
      })
      .catch(() => section.classList.add('route--failed'));
  };

  // Start loading ~2 viewports ahead.
  const near = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      near.disconnect();
      load();
    },
    { rootMargin: '200% 0px' },
  );
  near.observe(section);

  if (capture) void import('./capture').then((m) => m.runCapture());
}
