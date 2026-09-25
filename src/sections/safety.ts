import { safety as cfg } from '../config';
import { gsap } from '../lib/scroll';
import { env } from '../lib/env';
import { html } from './dom';

export function initSafety(): void {
  const root = document.getElementById('safety');
  if (!root) return;

  const statText = (s: (typeof cfg.stats)[number], v: number) => `${s.prefix}${Math.round(v)}${s.suffix}`;

  root.innerHTML = html`
    <div class="safety__bg">
      <img class="safety__img" src="${cfg.image}" alt="${cfg.imageAlt}" width="1920" height="1080" loading="lazy" decoding="async" />
    </div>
    <div class="safety__scrim" aria-hidden="true"></div>
    <div class="safety__inner container">
      <header class="safety__head">
        <p class="eyebrow" data-reveal>${cfg.eyebrow}</p>
        <h2 id="safety-title" class="display safety__title" data-reveal>${cfg.heading}</h2>
        <p class="lead safety__intro" data-reveal data-reveal-delay="0.1">${cfg.intro}</p>
      </header>
      <ol class="safety__points">
        ${cfg.points.map(
          (p, i) => html`
            <li class="safety__point" data-fade data-fade-delay="${(i % 4) * 0.08}">
              <span class="safety__index mono" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
              <h3 class="safety__point-title">${p.title}</h3>
              <p class="safety__point-body">${p.body}</p>
            </li>`,
        )}
      </ol>
      <dl class="safety__stats">
        ${cfg.stats.map((s) => {
          const final = statText(s, s.value);
          return html`
            <div class="safety__stat" data-fade>
              <dt class="safety__stat-label">${s.label}</dt>
              <dd class="safety__stat-value">
                <span class="mono" aria-hidden="true" data-count style="min-width:${final.length}ch">${final}</span>
                <span class="sr-only">${final}</span>
              </dd>
            </div>`;
        })}
      </dl>
    </div>
  `.value;

  if (env.reducedMotion) return;

  // Slow Ken Burns, scrubbed to the section's pass through the viewport (transform only).
  gsap.fromTo(
    root.querySelector('.safety__img'),
    { scale: 1.04, xPercent: 0, yPercent: 0 },
    {
      scale: 1.18,
      xPercent: -2.5,
      yPercent: -2,
      ease: 'none',
      scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true },
    },
  );

  // Count-up stats, once, when the row enters.
  const nodes = root.querySelectorAll<HTMLElement>('[data-count]');
  nodes.forEach((el, i) => {
    const s = cfg.stats[i];
    const state = { v: 0 };
    el.textContent = statText(s, 0);
    gsap.to(state, {
      v: s.value,
      duration: 2.2,
      delay: i * 0.12,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = statText(s, state.v);
      },
      scrollTrigger: { trigger: root.querySelector('.safety__stats'), start: 'top 85%', once: true },
    });
  });
}
