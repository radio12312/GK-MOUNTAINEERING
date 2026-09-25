import { ascent, type ClipSegment } from '../../config';
import { loadManifest } from '../../lib/FrameSequence';
import { frames as fcfg } from '../../config';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmt = new Intl.NumberFormat('en-US');
const time = (m: number) => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

/**
 * prefers-reduced-motion: no scrubbing, no particles. Each chapter becomes three still
 * frames, each paired with its text (the third still of the summit carries the closing line).
 */
export function renderStills(section: HTMLElement): void {
  section.classList.add('ascent--stills');
  section.innerHTML = `<h2 id="ascent-title" class="sr-only">${esc(ascent.srHeading)}</h2><div class="stills"></div>`;
  const root = section.querySelector<HTMLElement>('.stills')!;

  void loadManifest().then((manifest) => {
    root.innerHTML = ascent.segments
      .map((seg) => {
        if (seg.type === 'transition') {
          return `<div class="stills__night"><p class="display">${esc(seg.line)}</p></div>`;
        }
        const info = manifest[seg.clip];
        if (!info) return '';
        const c = seg as ClipSegment;
        return c.stills
          .map((f, i) => {
            const idx = Math.round(f * (info.count - 1)) + 1;
            const file = `${String(idx).padStart(4, '0')}.webp`;
            const base = `${fcfg.basePath}/${c.clip}`;
            const ov = c.overlays[i];
            const hudT = f;
            const alt = c.hud.from.alt + (c.hud.to.alt - c.hud.from.alt) * hudT;
            const mins = c.hud.from.time + (c.hud.to.time - c.hud.from.time) * hudT;
            const text = ov
              ? `<p class="eyebrow">${esc(ov.eyebrow)}</p><h3 class="display ov__headline">${esc(ov.headline)}</h3><p class="ov__body">${esc(ov.body)}</p>`
              : c.closing
                ? `<p class="display ov__closing">${esc(c.closing.text)}</p>${c.closing.sub ? `<p class="ov__body">${esc(c.closing.sub)}</p>` : ''}`
                : '';
            return `
              <figure class="still">
                <picture>
                  <source media="(max-aspect-ratio: 9/10)" srcset="${base}/mobile/${file}" width="${info.mobile.width}" height="${info.mobile.height}" />
                  <img src="${base}/desktop/${file}" width="${info.width}" height="${info.height}" alt="${esc(c.stillAlt[i] ?? '')}" loading="lazy" decoding="async" />
                </picture>
                <figcaption class="still__text ov--${ov?.align ?? 'left'}">
                  <p class="still__hud mono">${fmt.format(Math.round(alt))} m · ${time(mins)}</p>
                  ${text}
                </figcaption>
              </figure>`;
          })
          .join('');
      })
      .join('');
  });
}
