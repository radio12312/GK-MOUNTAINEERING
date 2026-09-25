import { hero as cfg } from '../config';
import { gsap, ScrollTrigger, scrollToTarget } from '../lib/scroll';
import { track } from '../lib/loader';
import { revealLines } from '../lib/reveal';
import { env } from '../lib/env';
import { html, focusTarget } from './dom';

export function initHero(): { playIntro(): void } {
  const root = document.getElementById('hero');
  if (!root) return { playIntro() {} };

  const rm = env.reducedMotion;
  root.setAttribute('data-reveal-manual', '');

  // Reduced motion: no autoplay attribute at all; the poster is the hero image.
  root.innerHTML = html`
    <div class="hero__media" aria-hidden="true">
      <video class="hero__video" ${rm ? '' : 'autoplay'} muted loop playsinline
        preload="${rm ? 'none' : 'auto'}" poster="${cfg.video.poster}" width="1600" height="900">
        <source src="${cfg.video.webm}" type="video/webm" />
        <source src="${cfg.video.mp4}" type="video/mp4" />
      </video>
    </div>
    <div class="hero__scrim" aria-hidden="true"></div>
    <div class="hero__content container">
      <p class="eyebrow hero__eyebrow" data-intro>${cfg.eyebrow}</p>
      <h1 id="hero-title" class="display hero__title" data-reveal>${cfg.headline}</h1>
      <p class="lead hero__sub" data-intro>${cfg.sub}</p>
    </div>
    <a class="hero__cue" href="#ascent">
      <span class="hero__cue-inner" data-intro>
        <span class="eyebrow hero__cue-label">${cfg.scrollCue}</span>
        <span class="hero__cue-line" aria-hidden="true"></span>
      </span>
    </a>
  `.value;

  const video = root.querySelector<HTMLVideoElement>('.hero__video')!;
  const media = root.querySelector<HTMLElement>('.hero__media')!;
  const content = root.querySelector<HTMLElement>('.hero__content')!;
  const title = root.querySelector<HTMLElement>('.hero__title')!;
  const cue = root.querySelector<HTMLElement>('.hero__cue')!;
  const intro = root.querySelectorAll<HTMLElement>('[data-intro]');

  // `muted` must be a property too, or some browsers refuse inline autoplay.
  video.muted = true;
  video.defaultMuted = true;

  if (!rm) {
    // First decoded frame is part of the first screen; never let it block (2 s cap).
    track(
      new Promise<void>((resolve) => {
        if (video.readyState >= 2) return resolve();
        const done = () => resolve();
        video.addEventListener('loadeddata', done, { once: true });
        video.addEventListener('canplay', done, { once: true });
        video.addEventListener('error', done, { once: true });
        setTimeout(done, 2000);
      }),
      2,
    );
  }

  cue.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.getElementById('ascent');
    scrollToTarget('#ascent');
    focusTarget(target);
  });

  if (rm) {
    return { playIntro() {} };
  }

  // Hidden until the intro plays (the preloader covers this moment).
  gsap.set(intro, { opacity: 0, y: 24 });
  gsap.set(video, { scale: 1.08, transformOrigin: '50% 60%' });

  // Pause the video when the hero is off screen.
  ScrollTrigger.create({
    trigger: root,
    start: 'top bottom',
    end: 'bottom top',
    onToggle(self) {
      if (self.isActive) void video.play().catch(() => undefined);
      else video.pause();
    },
  });

  // Scroll-out: content drifts up and fades, media parallaxes a little. Scrubbed, transform/opacity only.
  gsap
    .timeline({ scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: true } })
    .to(content, { yPercent: -18, opacity: 0, ease: 'none' }, 0)
    .to(cue, { opacity: 0, ease: 'none', duration: 0.4 }, 0)
    .to(media, { yPercent: 14, ease: 'none' }, 0);

  return {
    playIntro() {
      const [eyebrow, sub, cueEl] = Array.from(intro);
      const fadeUp = { opacity: 1, y: 0, duration: 1.6, ease: 'expo.out' };
      gsap.to(video, { scale: 1, duration: 3.2, ease: 'power2.out' });
      gsap.to(eyebrow, { ...fadeUp, delay: 0.25 });
      revealLines(title, { immediate: true, delay: 0.45 });
      gsap.to(sub, { ...fadeUp, delay: 1.15 });
      gsap.to(cueEl, { ...fadeUp, delay: 1.6, clearProps: 'transform' });
    },
  };
}
