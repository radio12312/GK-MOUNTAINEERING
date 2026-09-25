import { gsap } from '../../lib/scroll';
import { ascent, camps, type HudFrame } from '../../config';
import { clamp, lerp } from '../../lib/env';

const minAlt = camps[0].alt;
const maxAlt = camps[camps.length - 1].alt;
const altFrac = (alt: number) => clamp((alt - minAlt) / (maxAlt - minAlt));

const fmtInt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const fmtTime = (mins: number) => {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const fmtTemp = (t: number) => {
  const r = Math.round(t);
  return r < 0 ? `−${Math.abs(r)}` : String(r);
};

export function lerpHud(a: HudFrame, b: HudFrame, t: number): HudFrame {
  return {
    alt: lerp(a.alt, b.alt, t),
    tempC: lerp(a.tempC, b.tempC, t),
    o2: lerp(a.o2, b.o2, t),
    time: lerp(a.time, b.time, t),
  };
}

/**
 * Fixed altitude HUD. `set()` gives the target; a ticker eases the displayed values toward it
 * so fast scrolls count smoothly instead of jumping. Time snaps when it jumps by hours
 * (the 23:00 night cut).
 */
export function createHud(): { el: HTMLElement; set(v: HudFrame): void; show(on: boolean): void } {
  const L = ascent.hud.labels;
  const el = document.createElement('aside');
  el.className = 'hud';
  el.setAttribute('aria-label', ascent.hud.ariaLabel);
  el.innerHTML = `
    <div class="hud__track" aria-hidden="true">
      <div class="hud__rail"><div class="hud__fill"></div></div>
      <ol class="hud__camps">
        ${camps
          .map(
            (c) => `<li class="hud__camp" style="--pos:${altFrac(c.alt).toFixed(4)}" data-alt="${c.alt}">
              <span class="hud__tick"></span><span class="hud__camp-name">${c.name}</span></li>`,
          )
          .join('')}
      </ol>
      <span class="hud__marker"></span>
    </div>
    <dl class="hud__readouts">
      <div class="hud__row hud__row--alt">
        <dt>${L.alt}</dt>
        <dd><span class="hud__num" data-k="alt">${fmtInt.format(minAlt)}</span><span class="hud__unit">m</span></dd>
      </div>
      <div class="hud__row">
        <dt>${L.temp}</dt>
        <dd><span class="hud__num" data-k="temp">−6</span><span class="hud__unit">°C</span></dd>
      </div>
      <div class="hud__row">
        <dt>${L.o2}</dt>
        <dd><span class="hud__num" data-k="o2">51</span><span class="hud__unit">%</span><span class="sr-only"> ${ascent.hud.o2Suffix}</span></dd>
      </div>
      <div class="hud__row">
        <dt>${L.time}</dt>
        <dd><span class="hud__num" data-k="time">05:40</span></dd>
      </div>
    </dl>`;

  const q = (k: string) => el.querySelector<HTMLElement>(`[data-k="${k}"]`)!;
  const nAlt = q('alt');
  const nTemp = q('temp');
  const nO2 = q('o2');
  const nTime = q('time');
  const timeRow = nTime.closest('.hud__row') as HTMLElement;
  const campEls = [...el.querySelectorAll<HTMLElement>('.hud__camp')];

  let target: HudFrame | null = null;
  const shown: HudFrame = { alt: minAlt, tempC: -6, o2: 51, time: 340 };
  const last = { alt: '', temp: '', o2: '', time: '', frac: -1 };
  let running = false;

  const tick = (_t: number, dt: number) => {
    if (!target) return;
    const k = 1 - Math.exp(-(dt / 1000) * 5); // heavy easing
    shown.alt = lerp(shown.alt, target.alt, k);
    shown.tempC = lerp(shown.tempC, target.tempC, k);
    shown.o2 = lerp(shown.o2, target.o2, k);
    if (Math.abs(target.time - shown.time) > 90) {
      shown.time = target.time; // the night cut: jump, and flag it
      timeRow.classList.remove('is-jump');
      void timeRow.offsetWidth;
      timeRow.classList.add('is-jump');
    } else shown.time = lerp(shown.time, target.time, k);

    const alt = fmtInt.format(Math.round(shown.alt));
    const temp = fmtTemp(shown.tempC);
    const o2 = String(Math.round(shown.o2));
    const time = fmtTime(shown.time);
    if (alt !== last.alt) nAlt.textContent = last.alt = alt;
    if (temp !== last.temp) nTemp.textContent = last.temp = temp;
    if (o2 !== last.o2) nO2.textContent = last.o2 = o2;
    if (time !== last.time) nTime.textContent = last.time = time;

    const frac = altFrac(shown.alt);
    if (Math.abs(frac - last.frac) > 0.0005) {
      last.frac = frac;
      el.style.setProperty('--alt', frac.toFixed(4));
      for (const c of campEls) c.classList.toggle('is-reached', shown.alt >= Number(c.dataset.alt) - 5);
    }
  };

  return {
    el,
    set(v) {
      target = v;
    },
    show(on) {
      el.classList.toggle('is-visible', on);
      if (on && !running) {
        gsap.ticker.add(tick);
        running = true;
      } else if (!on && running) {
        gsap.ticker.remove(tick);
        running = false;
      }
    },
  };
}
