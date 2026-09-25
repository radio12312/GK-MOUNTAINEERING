import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { env } from './env';

gsap.registerPlugin(ScrollTrigger, SplitText);

/** Line-by-line reveal: slight rise, blur → sharp, heavy expo ease. */
// Start at 0.001, not 0: Chrome skips rasterizing fully transparent layers, so at 0 every line
// rasterizes in the same frame it appears (a visible stall on large type). At 0.001 they
// rasterize ahead of time with the rest of the page and stay invisible.
const LINE_FROM: gsap.TweenVars = { yPercent: 55, opacity: 0.001, filter: 'blur(12px)' };
const LINE_TO: gsap.TweenVars = {
  yPercent: 0,
  opacity: 1,
  filter: 'blur(0px)',
  duration: 1.5,
  ease: 'expo.out',
  stagger: 0.11,
  clearProps: 'filter,willChange',
};

interface RevealOptions {
  /** Start immediately instead of on scroll. */
  immediate?: boolean;
  delay?: number;
  start?: string;
}

/**
 * Split an element into lines and reveal them. Re-splits on resize / font load
 * (autoSplit) before it has played; afterwards the text is left untouched.
 */
export function revealLines(el: HTMLElement, opts: RevealOptions = {}): void {
  if (env.reducedMotion) {
    gsap.set(el, { opacity: 1 });
    return;
  }
  let played = false;
  SplitText.create(el, {
    type: 'lines',
    linesClass: 'line',
    autoSplit: true,
    onSplit(self) {
      if (played) return;
      gsap.set(self.lines, { ...LINE_FROM, willChange: 'transform, filter, opacity' });
      return gsap.to(self.lines, {
        ...LINE_TO,
        delay: opts.delay ?? 0,
        paused: !opts.immediate,
        onStart: () => {
          played = true;
        },
        scrollTrigger: opts.immediate
          ? undefined
          : { trigger: el, start: opts.start ?? 'top 88%', once: true },
      });
    },
  });
}

/**
 * Block fade: rise + fade. No blur here: blurring large blocks (cards, columns, the form panel)
 * is an expensive raster that stalls the frame it starts in. Text lines keep blur → sharp.
 */
export function fadeIn(el: HTMLElement, opts: RevealOptions = {}): void {
  if (env.reducedMotion) return;
  gsap.fromTo(
    el,
    { y: 28, opacity: 0.001 },
    {
      y: 0,
      opacity: 1,
      duration: 1.3,
      ease: 'expo.out',
      delay: opts.delay ?? 0,
      scrollTrigger: opts.immediate ? undefined : { trigger: el, start: opts.start ?? 'top 90%', once: true },
    },
  );
}

/**
 * Wire every [data-reveal] (line split) and [data-fade] (block) inside root.
 * `data-reveal-delay` / `data-fade-delay` add a delay in seconds.
 * Elements inside [data-reveal-manual] are skipped (their section drives them).
 */
export function initReveals(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    if (el.closest('[data-reveal-manual]')) return;
    revealLines(el, { delay: parseFloat(el.dataset.revealDelay ?? '0') });
  });
  root.querySelectorAll<HTMLElement>('[data-fade]').forEach((el) => {
    if (el.closest('[data-reveal-manual]')) return;
    fadeIn(el, { delay: parseFloat(el.dataset.fadeDelay ?? '0') });
  });
}

/** Wait for the web fonts (capped) so line splits are measured with final metrics. */
export async function fontsReady(timeoutMs = 2200): Promise<void> {
  if (!('fonts' in document)) return;
  // The Google Fonts stylesheet loads non-blocking; its @font-face rules must exist first.
  const sheet = document.querySelector<HTMLLinkElement>('link[href*="fonts.googleapis.com/css"]');
  const sheetReady =
    !sheet || sheet.sheet
      ? Promise.resolve()
      : new Promise<void>((res) => {
          sheet.addEventListener('load', () => res(), { once: true });
          sheet.addEventListener('error', () => res(), { once: true });
        });
  const loads = sheetReady.then(() => Promise.all([
    document.fonts.load('700 1em "Barlow Condensed"'),
    document.fonts.load('600 1em "Barlow Condensed"'),
    document.fonts.load('400 1em "Inter"'),
    document.fonts.load('500 1em "JetBrains Mono"'),
  ])).then(() => document.fonts.ready);
  await Promise.race([loads, new Promise((r) => setTimeout(r, timeoutMs))]);
  document.documentElement.classList.add('fonts-ready');
}
