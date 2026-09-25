import { footer as cfg, site } from '../config';
import { html } from './dom';

export function initFooter(): void {
  const root = document.getElementById('footer');
  if (!root) return;
  root.classList.add('topo');

  const year = new Date().getFullYear();
  const legal = cfg.legal.replace('©', `© ${year}`);
  const tel = `tel:${cfg.contact.phone.replace(/[^\d+]/g, '')}`;
  const h = cfg.headings;

  root.innerHTML = html`
    <div class="footer__inner container">
      <div class="footer__grid">
        <div class="footer__brand">
          <p class="footer__name display">${site.fullName}</p>
          <p class="footer__desc">${site.description}</p>
        </div>

        <div class="footer__col footer__col--contact">
          <h2 class="eyebrow footer__heading">${h.contact}</h2>
          <address class="footer__address">
            <a class="footer__link" href="mailto:${cfg.contact.email}">${cfg.contact.email}</a>
            <a class="footer__link mono" href="${tel}">${cfg.contact.phone}</a>
          </address>
        </div>

        <div class="footer__col">
          <h2 class="eyebrow footer__heading">${h.offices}</h2>
          <ul class="footer__list">${cfg.contact.offices.map((o) => html`<li>${o}</li>`)}</ul>
        </div>

        <div class="footer__col">
          <h2 class="eyebrow footer__heading">${h.social}</h2>
          <ul class="footer__list">
            ${cfg.socials.map(
              (s) => html`<li>
                <a class="footer__link" href="${s.href}" target="_blank" rel="noopener noreferrer">
                  ${s.label}<span class="sr-only"> (${cfg.newTab})</span>
                  <svg class="footer__ext" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M3.5 2.5h6v6M9.5 2.5l-7 7" /></svg>
                </a>
              </li>`,
            )}
          </ul>
        </div>

        <div class="footer__col">
          <h2 class="eyebrow footer__heading">${h.certifications}</h2>
          <ul class="footer__list">${cfg.certifications.map((c) => html`<li>${c}</li>`)}</ul>
        </div>
      </div>

      <p class="footer__wordmark display" aria-hidden="true">${site.name}</p>

      <div class="footer__bottom">
        <p>${legal}</p>
        <p class="footer__ai">${cfg.aiNote}</p>
      </div>
    </div>
  `.value;
}
