import { cta as cfg } from '../config';
import { gsap } from '../lib/scroll';
import { env } from '../lib/env';
import { html, type Markup } from './dom';
import { SELECT_EXPEDITION, type SelectExpeditionDetail } from './expeditions';

type FieldName = 'name' | 'email' | 'expedition' | 'experience' | 'message';
type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const f = cfg.form;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const validators: Record<FieldName, (v: string) => boolean> = {
  name: (v) => v.trim().length >= 2,
  email: (v) => EMAIL.test(v.trim()),
  expedition: (v) => v !== '',
  experience: (v) => v !== '',
  message: (v) => v.length <= f.message.maxLength,
};

function field(name: FieldName, label: string, control: Markup, opts: { wide?: boolean; optional?: boolean } = {}) {
  return html`
    <div class="field${opts.wide ? ' field--wide' : ''}" data-field="${name}">
      <label class="field__label" for="bk-${name}">
        ${label}${opts.optional ? html` <span class="field__optional">(${f.optional})</span>` : ''}
      </label>
      ${control}
      <p class="field__error" id="bk-${name}-error"></p>
    </div>
  `;
}

function select(name: FieldName, placeholder: string, options: string[], autocomplete = 'off') {
  return html`
    <select class="field__control field__select" id="bk-${name}" name="${name}" required
      aria-describedby="bk-${name}-error" aria-invalid="false" autocomplete="${autocomplete}">
      <option value="" disabled selected>${placeholder}</option>
      ${options.map((o) => html`<option value="${o}">${o}</option>`)}
    </select>
  `;
}

export function initCta(): void {
  const root = document.getElementById('book');
  if (!root) return;

  root.innerHTML = html`
    <div class="book__bg">
      <img class="book__img" src="${cfg.image}" alt="${cfg.imageAlt}" width="1600" height="900" loading="lazy" decoding="async" />
    </div>
    <div class="book__scrim" aria-hidden="true"></div>
    <div class="book__inner container">
      <header class="book__head">
        <h2 id="book-title" class="display book__title" data-reveal>${cfg.heading}</h2>
        <p class="lead book__sub" data-reveal data-reveal-delay="0.15">${cfg.sub}</p>
      </header>

      <div class="book__panel" data-fade>
        <form class="book__form" novalidate aria-labelledby="book-title">
          <div class="book__grid">
            ${field(
              'name',
              f.name.label,
              html`<input class="field__control" id="bk-name" name="name" type="text" autocomplete="name"
                placeholder="${f.name.placeholder}" required aria-describedby="bk-name-error" aria-invalid="false" />`,
            )}
            ${field(
              'email',
              f.email.label,
              html`<input class="field__control" id="bk-email" name="email" type="email" autocomplete="email"
                inputmode="email" spellcheck="false" placeholder="${f.email.placeholder}" required
                aria-describedby="bk-email-error" aria-invalid="false" />`,
            )}
            ${field('expedition', f.expedition.label, select('expedition', f.expedition.placeholder, f.expedition.options))}
            ${field('experience', f.experience.label, select('experience', f.experience.placeholder, f.experience.options))}
            ${field(
              'message',
              f.message.label,
              html`<textarea class="field__control field__textarea" id="bk-message" name="message" rows="5"
                maxlength="${f.message.maxLength}" placeholder="${f.message.placeholder}"
                aria-describedby="bk-message-error" aria-invalid="false"></textarea>
                <span class="field__count mono" aria-hidden="true"><span data-count>0</span> / ${f.message.maxLength}</span>`,
              { wide: true, optional: true },
            )}
          </div>
          <button class="btn btn--summit book__submit" type="submit">
            <span data-submit-label>${f.submit}</span>
          </button>
        </form>

        <div class="book__success" hidden>
          <h3 class="display book__success-title" tabindex="-1">${f.success.heading}</h3>
          <p class="book__success-body">${f.success.body}</p>
          <button class="btn book__reset" type="button">${f.success.reset}</button>
        </div>

        <p class="sr-only" aria-live="polite" data-live></p>
      </div>
    </div>
  `.value;

  const form = root.querySelector<HTMLFormElement>('.book__form')!;
  const success = root.querySelector<HTMLElement>('.book__success')!;
  const successTitle = root.querySelector<HTMLElement>('.book__success-title')!;
  const submitBtn = root.querySelector<HTMLButtonElement>('.book__submit')!;
  const submitLabel = root.querySelector<HTMLElement>('[data-submit-label]')!;
  const live = root.querySelector<HTMLElement>('[data-live]')!;
  const count = root.querySelector<HTMLElement>('[data-count]')!;
  const names: FieldName[] = ['name', 'email', 'expedition', 'experience', 'message'];
  const controls = Object.fromEntries(names.map((n) => [n, form.elements.namedItem(n) as Control])) as Record<
    FieldName,
    Control
  >;
  const errors: Record<FieldName, string> = {
    name: f.name.error,
    email: f.email.error,
    expedition: f.expedition.error,
    experience: f.experience.error,
    message: f.message.error,
  };

  let submitted = false;
  let sending = false;

  const validate = (n: FieldName): boolean => {
    const el = controls[n];
    const ok = validators[n](el.value);
    const errEl = root.querySelector<HTMLElement>(`#bk-${n}-error`)!;
    el.setAttribute('aria-invalid', String(!ok));
    el.closest('.field')?.classList.toggle('is-invalid', !ok);
    errEl.textContent = ok ? '' : errors[n];
    return ok;
  };

  names.forEach((n) => {
    const el = controls[n];
    el.addEventListener('blur', () => {
      if (submitted) validate(n);
    });
    // Once a field has been flagged, clear the error as soon as it's fixed.
    const recheck = () => {
      if (el.getAttribute('aria-invalid') === 'true') validate(n);
    };
    el.addEventListener('input', recheck);
    el.addEventListener('change', recheck);
  });

  // Auto-grow the message box (CSS field-sizing where supported, JS otherwise); it only
  // becomes a scroller once it reaches its max-height.
  const autoSize = !CSS.supports('field-sizing', 'content');
  const fitMessage = () => {
    const ta = controls.message;
    if (autoSize) {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight + 2}px`;
    }
    ta.classList.toggle('is-scrolling', ta.scrollHeight > ta.clientHeight + 1);
  };
  controls.message.addEventListener('input', () => {
    count.textContent = String(controls.message.value.length);
    fitMessage();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (sending) return;
    submitted = true;
    const invalid = names.filter((n) => !validate(n));
    if (invalid.length) {
      controls[invalid[0]].focus();
      return;
    }

    // Front-end only: simulate the request.
    sending = true;
    submitBtn.disabled = true;
    submitBtn.setAttribute('aria-busy', 'true');
    submitLabel.textContent = f.sending;
    window.setTimeout(showSuccess, 900);
  });

  function showSuccess() {
    sending = false;
    submitBtn.disabled = false;
    submitBtn.removeAttribute('aria-busy');
    submitLabel.textContent = f.submit;
    form.hidden = true;
    success.hidden = false;
    live.textContent = `${f.success.heading} ${f.success.body}`;
    successTitle.focus();
    if (!env.reducedMotion) {
      gsap.fromTo(
        success.children,
        { y: 24, opacity: 0 },
        { y: 0, opacity: 1, duration: 1.2, ease: 'expo.out', stagger: 0.08 },
      );
    }
  }

  root.querySelector<HTMLButtonElement>('.book__reset')!.addEventListener('click', () => {
    form.reset();
    submitted = false;
    names.forEach((n) => {
      controls[n].setAttribute('aria-invalid', 'false');
      controls[n].closest('.field')?.classList.remove('is-invalid');
      root.querySelector<HTMLElement>(`#bk-${n}-error`)!.textContent = '';
    });
    count.textContent = '0';
    live.textContent = '';
    success.hidden = true;
    form.hidden = false;
    controls.name.focus();
  });

  // Preselect from an expedition card's "Enquire" link.
  window.addEventListener(SELECT_EXPEDITION, (e) => {
    const { name } = (e as CustomEvent<SelectExpeditionDetail>).detail;
    const sel = controls.expedition as HTMLSelectElement;
    if (!Array.from(sel.options).some((o) => o.value === name)) return;
    sel.value = name;
    if (sel.getAttribute('aria-invalid') === 'true') validate('expedition');
  });
}
