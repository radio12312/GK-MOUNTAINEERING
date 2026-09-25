import { nav as cfg, audio, site } from '../config';
import { gsap, ScrollTrigger, scrollToTarget, startScroll, stopScroll } from '../lib/scroll';
import { windAudio } from '../lib/windAudio';
import { env } from '../lib/env';
import { html, raw, focusTarget } from './dom';

const LOGO_GLYPH = raw(
  '<svg class="nav__glyph" viewBox="0 0 24 16" aria-hidden="true" focusable="false"><path d="M1 15 8.5 3l4 6.2L15 5.5 23 15" /><path d="M6.2 6.8 8.5 8.4l2-1.5" /></svg>',
);

const SOUND_ICON = raw(
  '<svg class="nav__sound-icon" viewBox="0 0 20 16" aria-hidden="true" focusable="false"><rect x="2" y="2" width="2" height="12" rx="1" /><rect x="7" y="2" width="2" height="12" rx="1" /><rect x="12" y="2" width="2" height="12" rx="1" /><rect x="17" y="2" width="1.6" height="12" rx="0.8" /></svg>',
);

const MOBILE = '(max-width: 767.98px)';

export function initNav(): void {
  const root = document.getElementById('nav');
  if (!root) return;

  const links = cfg.links.map((l) => html`<li><a class="nav__link" href="${l.href}">${l.label}</a></li>`);

  root.innerHTML = html`
    <div class="nav__bar">
      <div class="nav__inner container">
        <a class="nav__logo" href="#hero" aria-label="${cfg.logoLabel}">
          ${LOGO_GLYPH}<span class="nav__wordmark" aria-hidden="true">${site.name}</span>
        </a>
        <nav class="nav__primary" aria-label="${cfg.ariaLabel}">
          <ul class="nav__links">${links}</ul>
        </nav>
        <div class="nav__actions">
          <button class="nav__sound" type="button" aria-pressed="false" aria-label="${cfg.soundLabel}">
            ${SOUND_ICON}<span class="nav__sound-text mono" aria-hidden="true" data-sound-text>${audio.labelOff}</span>
          </button>
          <a class="btn btn--summit nav__book" href="${cfg.cta.href}">${cfg.cta.label}</a>
          <button class="nav__menu-btn" type="button" aria-expanded="false" aria-controls="nav-overlay" aria-label="${cfg.menuOpen}">
            <span class="nav__burger" aria-hidden="true"><span></span><span></span></span>
          </button>
        </div>
      </div>
    </div>
    <div class="nav__overlay topo" id="nav-overlay" hidden>
      <nav class="nav__overlay-inner container" aria-label="${cfg.menuLabel}">
        <ul class="nav__overlay-links">
          ${cfg.links.map(
            (l, i) => html`<li><a class="nav__overlay-link display" href="${l.href}"><span class="mono">${String(i + 1).padStart(2, '0')}</span>${l.label}</a></li>`,
          )}
        </ul>
        <a class="btn btn--summit nav__overlay-book" href="${cfg.cta.href}">${cfg.cta.label}</a>
      </nav>
    </div>
  `.value;

  const bar = root.querySelector<HTMLElement>('.nav__bar')!;
  const menuBtn = root.querySelector<HTMLButtonElement>('.nav__menu-btn')!;
  const overlay = root.querySelector<HTMLElement>('.nav__overlay')!;
  const soundBtn = root.querySelector<HTMLButtonElement>('.nav__sound')!;
  const soundText = root.querySelector<HTMLElement>('[data-sound-text]')!;
  const mq = window.matchMedia(MOBILE);

  let isOpen = false;

  // ---- in-page links ------------------------------------------------------
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a) return;
    const hash = a.getAttribute('href')!;
    const target = document.querySelector<HTMLElement>(hash);
    if (!target) return;
    e.preventDefault();
    if (isOpen) closeMenu(false);
    scrollToTarget(target);
    focusTarget(target);
    if (history.replaceState) history.replaceState(null, '', hash);
  });

  // ---- sound toggle -------------------------------------------------------
  const setSound = (on: boolean) => {
    soundBtn.setAttribute('aria-pressed', String(on));
    soundBtn.classList.toggle('is-on', on);
    soundText.textContent = on ? audio.labelOn : audio.labelOff;
  };
  soundBtn.addEventListener('click', () => {
    void windAudio.toggle();
  });
  windAudio.onChange(setSound);
  setSound(windAudio.enabled);

  // ---- mobile menu --------------------------------------------------------
  const outside = () => [document.getElementById('main'), document.getElementById('footer'), document.querySelector('.skip-link')];
  const setInert = (on: boolean) =>
    outside().forEach((el) => {
      if (el) (el as HTMLElement).inert = on;
    });
  const focusables = () => [menuBtn, ...overlay.querySelectorAll<HTMLElement>('a[href]')];

  function openMenu() {
    if (isOpen) return;
    isOpen = true;
    showBar();
    overlay.hidden = false;
    root!.classList.add('is-open');
    menuBtn.setAttribute('aria-expanded', 'true');
    menuBtn.setAttribute('aria-label', cfg.menuClose);
    stopScroll();
    setInert(true);
    document.addEventListener('keydown', onKey);

    const items = overlay.querySelectorAll('li, .nav__overlay-book');
    if (env.reducedMotion) {
      gsap.set(overlay, { opacity: 1, clipPath: 'none' });
    } else {
      gsap.killTweensOf([overlay, items]);
      gsap.fromTo(overlay, { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9, ease: 'expo.inOut' });
      gsap.fromTo(
        items,
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 1, ease: 'expo.out', stagger: 0.06, delay: 0.35 },
      );
    }
    overlay.querySelector<HTMLElement>('a')?.focus();
  }

  function closeMenu(returnFocus = true) {
    if (!isOpen) return;
    isOpen = false;
    root!.classList.remove('is-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', cfg.menuOpen);
    document.removeEventListener('keydown', onKey);
    setInert(false);
    startScroll();
    const hide = () => {
      if (!isOpen) overlay.hidden = true;
    };
    if (env.reducedMotion) hide();
    else {
      gsap.killTweensOf(overlay);
      gsap.to(overlay, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.7, ease: 'expo.inOut', onComplete: hide });
    }
    if (returnFocus) menuBtn.focus();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = focusables();
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (!active || !list.includes(active)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  menuBtn.addEventListener('click', () => (isOpen ? closeMenu() : openMenu()));
  mq.addEventListener('change', (e) => {
    if (!e.matches) closeMenu(false);
  });

  // ---- hide on scroll down / show on scroll up (after the hero) -----------
  let hidden = false;
  function showBar() {
    if (!hidden) return;
    hidden = false;
    bar.classList.remove('is-hidden');
  }
  function hideBar() {
    // Keep it visible while a keyboard user is inside it (mouse focus doesn't count).
    const active = document.activeElement;
    if (hidden || isOpen || (active && bar.contains(active) && active.matches(':focus-visible'))) return;
    hidden = true;
    bar.classList.add('is-hidden');
  }
  bar.addEventListener('focusin', showBar);

  const hero = document.getElementById('hero');
  let threshold = window.innerHeight;
  let isPast = false;
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onRefresh() {
      threshold = (hero?.offsetHeight ?? window.innerHeight) * 0.85; // cached: no layout reads while scrolling
    },
    onUpdate(self) {
      const past = self.scroll() >= threshold;
      if (past !== isPast) {
        isPast = past;
        bar.classList.toggle('is-past', past);
      }
      if (!past) showBar();
      else if (self.direction === 1) hideBar();
      else if (self.direction === -1) showBar();
    },
  });
}
