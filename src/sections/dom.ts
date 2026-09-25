/**
 * Tiny render helpers shared by the page sections.
 * `html` is a tagged template that escapes every interpolated value unless it is
 * already markup (another `html` result or `raw()`), so config copy can never inject HTML.
 */
export class Markup {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v: string | number): string => String(v).replace(/[&<>"']/g, (c) => ESC[c]);

/** Trusted markup (e.g. hand-written SVG). Never pass user/config text here. */
export const raw = (s: string): Markup => new Markup(s);

type Value = Markup | string | number | boolean | null | undefined | Value[];

function part(v: Value): string {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (Array.isArray(v)) return v.map(part).join('');
  if (v instanceof Markup) return v.value;
  return esc(v);
}

export function html(strings: TemplateStringsArray, ...values: Value[]): Markup {
  let out = '';
  strings.forEach((s, i) => {
    out += s + (i < values.length ? part(values[i]) : '');
  });
  return new Markup(out);
}

/** Render markup into a landmark container. Returns null if the container is missing. */
export function mount<T extends HTMLElement = HTMLElement>(selector: string, markup: Markup): T | null {
  const el = document.querySelector<T>(selector);
  if (!el) return null;
  el.innerHTML = markup.value;
  return el;
}

/** `{name}`-style placeholder fill for config strings. */
export const fill = (tpl: string, vars: Record<string, string | number>): string =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));

const num = new Intl.NumberFormat('en-US');
export const fmt = (n: number): string => num.format(n);

/** Non-breaking space: keeps "6,120 m" on one line. */
export const NBSP = ' ';

/** Move focus to a section (or any element) without the browser jumping the scroll position. */
export function focusTarget(el: HTMLElement | null): void {
  if (!el) return;
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}
