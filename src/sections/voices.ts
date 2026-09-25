import { voices as cfg } from '../config';
import { html } from './dom';

export function initVoices(): void {
  const root = document.getElementById('voices');
  if (!root) return;
  root.classList.add('topo');

  root.innerHTML = html`
    <div class="voices__inner container">
      <header class="voices__head">
        <p class="eyebrow" data-reveal>${cfg.eyebrow}</p>
        <h2 id="voices-title" class="display voices__title" data-reveal>${cfg.heading}</h2>
      </header>
      <div class="voices__list">
        ${cfg.items.map(
          (v, i) => html`
            <figure class="voice${i === 0 ? ' voice--lead' : ''}">
              <span class="voice__rule" aria-hidden="true"></span>
              <blockquote class="voice__quote">
                <p data-reveal>“${v.quote}”</p>
              </blockquote>
              <figcaption class="voice__cite" data-fade>
                <span class="voice__name">${v.name}</span>
                <span class="voice__sep" aria-hidden="true">·</span>
                <span class="voice__summit">${v.summit}</span>
              </figcaption>
            </figure>`,
        )}
      </div>
    </div>
  `.value;
}
