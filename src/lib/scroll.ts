import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { env } from './env';

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });

export let lenis: Lenis | null = null;

/** Lenis drives the scroll; GSAP's ticker drives Lenis; Lenis tells ScrollTrigger. */
export function initScroll(): void {
  if (env.reducedMotion) return; // native scrolling only

  lenis = new Lenis({
    lerp: 0.085, // heavy, deliberate glide
    wheelMultiplier: 0.9,
    touchMultiplier: 1.2,
    smoothWheel: true,
    anchors: false,
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  if (import.meta.env.DEV) (window as unknown as { __lenis: Lenis }).__lenis = lenis;
}

/** Smooth-scroll to an element or selector; falls back to native for reduced motion. */
export function scrollToTarget(target: string | HTMLElement, offset = 0): void {
  const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (!el) return;
  if (lenis) {
    lenis.scrollTo(el, { offset, duration: 1.8, easing: (t) => 1 - Math.pow(1 - t, 4) });
  } else {
    el.scrollIntoView({ behavior: 'auto', block: 'start' });
  }
}

export function stopScroll(): void {
  lenis?.stop();
  if (!lenis) document.documentElement.style.overflow = 'hidden';
}
export function startScroll(): void {
  lenis?.start();
  document.documentElement.style.overflow = '';
}

export { gsap, ScrollTrigger };
