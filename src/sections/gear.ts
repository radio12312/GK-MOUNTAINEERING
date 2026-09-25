import { gear as cfg } from '../config';
import { html, raw } from './dom';
import { gearIcons } from './gearIcons';

export function initGear(): void {
  const root = document.getElementById('gear');
  if (!root) return;
  root.classList.add('topo');

  root.innerHTML = html`
    <div class="gear__inner container">
      <header class="gear__head">
        <p class="eyebrow" data-reveal>${cfg.eyebrow}</p>
        <h2 id="gear-title" class="display gear__title" data-reveal>${cfg.heading}</h2>
        <p class="lead gear__sub" data-reveal data-reveal-delay="0.1">${cfg.sub}</p>
      </header>
      <div class="gear__cols">
        ${cfg.columns.map((col, c) => {
          const titleId = `gear-col-${c}`;
          return html`
            <section class="gear__col" aria-labelledby="${titleId}" data-fade data-fade-delay="${c * 0.1}">
              <h3 class="gear__col-title" id="${titleId}">
                <span>${col.title}</span>
                <span class="mono gear__count" aria-hidden="true">${String(col.items.length).padStart(2, '0')}</span>
              </h3>
              <ul class="gear__list">
                ${col.items.map(
                  (item) => html`
                    <li class="gear__item">
                      <svg class="gear__icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
                        stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${raw(gearIcons[item.icon])}</svg>
                      <span class="gear__text">
                        <span class="gear__name">${item.name}</span>
                        <span class="gear__note">${item.note}</span>
                      </span>
                    </li>`,
                )}
              </ul>
            </section>`;
        })}
      </div>
    </div>
  `.value;
}
