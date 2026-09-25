import { expeditions as cfg } from '../config';
import { gsap, ScrollTrigger, scrollToTarget, lenis } from '../lib/scroll';
import { html, fill, fmt, NBSP, focusTarget } from './dom';

export const SELECT_EXPEDITION = 'gk:select-expedition';
export interface SelectExpeditionDetail {
  name: string;
}

/** Horizontal pin only where there is room for it and motion is welcome. */
const PIN_QUERY = '(min-width: 768px) and (min-height: 700px) and (prefers-reduced-motion: no-preference)';

type Card = (typeof cfg.cards)[number];

function pips(level: number) {
  const max = cfg.difficultyMax;
  return html`
    <span class="xp__pips" aria-hidden="true">
      ${Array.from({ length: max }, (_, i) => html`<span class="xp__pip${i < level ? ' is-on' : ''}"></span>`)}
    </span>
    <span class="sr-only">${fill(cfg.difficultyText, { n: level, max })}</span>
  `;
}

function card(c: Card) {
  const nameId = `xp-${c.id}-name`;
  return html`
    <li class="xp__card">
      <article class="xp__inner" aria-labelledby="${nameId}">
        <div class="xp__media">
          <img src="${c.image}" alt="${c.imageAlt}" width="1920" height="1080" loading="lazy" decoding="async" />
        </div>
        <div class="xp__body">
          <p class="eyebrow xp__level">${c.level}</p>
          <h3 id="${nameId}" class="display xp__name">${c.name}</h3>
          <p class="xp__summary">${c.summary}</p>
          <dl class="xp__specs">
            <div class="xp__spec">
              <dt>${cfg.labels.altitude}</dt>
              <dd class="mono">${fmt(c.altitude)}${NBSP}${cfg.units.altitude}</dd>
            </div>
            <div class="xp__spec">
              <dt>${cfg.labels.duration}</dt>
              <dd><span class="mono">${c.durationDays}</span>${NBSP}${cfg.units.days}</dd>
            </div>
            <div class="xp__spec">
              <dt>${cfg.labels.difficulty}</dt>
              <dd>${pips(c.difficulty)}</dd>
            </div>
            <div class="xp__spec">
              <dt>${cfg.labels.season}</dt>
              <dd>${c.season}</dd>
            </div>
          </dl>
          <div class="xp__foot">
            <p class="xp__price">
              <span class="xp__from">${cfg.fromLabel}</span>
              <span class="mono">${cfg.currency}${fmt(c.price)}</span>
            </p>
            <a class="xp__link" href="#book" data-expedition="${c.name}" aria-label="${fill(cfg.ctaAria, { name: c.name })}">
              <span>${cfg.cta}</span>
              <svg viewBox="0 0 20 12" aria-hidden="true" focusable="false"><path d="M1 6h17M13 1l5 5-5 5" /></svg>
            </a>
          </div>
        </div>
      </article>
    </li>
  `;
}

export function initExpeditions(): void {
  const root = document.getElementById('expeditions');
  if (!root) return;
  root.classList.add('topo', 'xp');

  root.innerHTML = html`
    <div class="xp__track">
      <header class="xp__intro">
        <p class="eyebrow" data-reveal>${cfg.eyebrow}</p>
        <h2 id="expeditions-title" class="display xp__title" data-reveal>${cfg.heading}</h2>
        <p class="lead xp__sub" data-reveal data-reveal-delay="0.1">${cfg.sub}</p>
      </header>
      <ul class="xp__list" role="list">${cfg.cards.map(card)}</ul>
    </div>
  `.value;

  const track = root.querySelector<HTMLElement>('.xp__track')!;
  const list = root.querySelector<HTMLElement>('.xp__list')!;

  // Enquire → preselect in the booking form, then glide down to it.
  root.addEventListener('click', (e) => {
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-expedition]');
    if (!link) return;
    e.preventDefault();
    window.dispatchEvent(
      new CustomEvent<SelectExpeditionDetail>(SELECT_EXPEDITION, { detail: { name: link.dataset.expedition ?? '' } }),
    );
    const book = document.getElementById('book');
    scrollToTarget('#book');
    focusTarget(book);
  });

  // Pinned horizontal scroll (desktop / tablet, motion allowed).
  let pinST: ScrollTrigger | null = null;
  const mm = gsap.matchMedia();
  mm.add(PIN_QUERY, () => {
    root.classList.add('is-pinned');
    const distance = () => Math.max(0, track.scrollWidth - root.clientWidth);
    const tween = gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        trigger: root,
        start: 'top top',
        end: () => `+=${distance()}`,
        pin: true,
        scrub: 0.8,
        invalidateOnRefresh: true,
        anticipatePin: 1,
      },
    });
    pinST = tween.scrollTrigger ?? null;
    return () => {
      pinST = null;
      root.classList.remove('is-pinned');
    };
  });

  // Keyboard users tabbing through pinned cards: scroll the page so the focused card
  // is in view instead of letting the browser scroll the clipped track sideways.
  list.addEventListener('focusin', (e) => {
    const st = pinST;
    if (!st) return;
    const li = (e.target as HTMLElement).closest<HTMLElement>('.xp__card');
    if (!li) return;
    const dist = st.end - st.start;
    if (dist <= 0) return;
    const want = li.offsetLeft - (root.clientWidth - li.offsetWidth) / 2;
    const p = Math.min(1, Math.max(0, want / dist));
    const y = st.start + p * dist;
    if (lenis) lenis.scrollTo(y, { duration: 0.9 });
    else window.scrollTo(0, y);
  });
}
