import { ascent, type ClipSegment, type HudFrame, type Segment, type TransitionSegment } from '../../config';
import { ScrollTrigger } from '../../lib/scroll';
import { SplitText } from 'gsap/SplitText';
import { FrameSequence, loadManifest } from '../../lib/FrameSequence';
import { track } from '../../lib/loader';
import { env, lerp, range } from '../../lib/env';
import { setWind } from '../../lib/wind';
import { createHud, lerpHud } from './hud';
import { createSnow } from './snow';
import { renderStills } from './stills';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Piecewise-linear wind across a segment: [start, middle, end]. */
const windAt = (w: [number, number, number], t: number) => (t < 0.5 ? lerp(w[0], w[1], t * 2) : lerp(w[1], w[2], (t - 0.5) * 2));

interface Placed<S extends Segment = Segment> {
  seg: S;
  index: number;
  offVh: number;
}

/** Visibility for one overlay "line" given local progress, with a stagger offset. */
function lineState(p: number, a: number, b: number, k: number) {
  const span = b - a;
  const inDur = Math.min(0.28 * span, 0.09);
  const outDur = Math.min(0.2 * span, 0.06);
  const stagger = Math.min(0.12 * span, 0.018);
  const inT = range(p, a + k * stagger, a + k * stagger + inDur);
  const outT = b >= 1 ? 0 : range(p, b - outDur, b);
  return { inT: easeOut(inT), outT: outT * outT };
}
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function initAscent(): void {
  const section = document.getElementById('ascent');
  if (!section) return;

  const segments = ascent.segments;
  const totalVh = segments.reduce((s, x) => s + x.lengthVh, 0);
  let acc = 0;
  const placed: Placed[] = segments.map((seg, index) => {
    const p = { seg, index, offVh: acc };
    acc += seg.lengthVh;
    return p;
  });

  if (env.reducedMotion) {
    renderStills(section);
    return;
  }

  section.style.setProperty('--ascent-vh', String(totalVh));
  section.innerHTML = `
    <h2 id="ascent-title" class="sr-only">${esc(ascent.srHeading)}</h2>
    <div class="ascent__stage">
      <canvas class="ascent__canvas" aria-hidden="true"></canvas>
      <div class="ascent__scrim ascent__scrim--left" aria-hidden="true"></div>
      <div class="ascent__scrim ascent__scrim--right" aria-hidden="true"></div>
      <div class="ascent__scrim ascent__scrim--bottom" aria-hidden="true"></div>
      <canvas class="ascent__snow" aria-hidden="true"></canvas>
      <div class="ascent__flash" aria-hidden="true"></div>
      <div class="ascent__night" aria-hidden="true"></div>
      <ol class="sr-only">
        ${placed
          .map(({ seg }) =>
            seg.type === 'transition'
              ? `<li>${esc(seg.line)}</li>`
              : seg.overlays
                  .map((o) => `<li><p>${esc(o.eyebrow)}</p><h3>${esc(o.headline)}</h3><p>${esc(o.body)}</p></li>`)
                  .join('') + (seg.closing ? `<li><p>${esc(seg.closing.text)}</p>${seg.closing.sub ? `<p>${esc(seg.closing.sub)}</p>` : ''}</li>` : ''),
          )
          .join('')}
      </ol>
      <div class="ascent__overlays" aria-hidden="true">
        ${placed
          .map(({ seg, index }) => {
            if (seg.type === 'transition') {
              return `<p class="ascent__nightline display" data-seg="${index}">${esc(seg.line)}</p>`;
            }
            const ovs = seg.overlays
              .map(
                (o, i) => `
              <article class="ov ov--${o.align ?? 'left'}" data-seg="${index}" data-ov="${i}">
                <p class="eyebrow ov__eyebrow">${esc(o.eyebrow)}</p>
                <h3 class="display ov__headline">${esc(o.headline)}</h3>
                <p class="ov__body">${esc(o.body)}</p>
              </article>`,
              )
              .join('');
            const closing = seg.closing
              ? `<div class="ov ov--closing" data-seg="${index}" data-closing>
                   <p class="display ov__closing">${esc(seg.closing.text)}</p>
                   ${seg.closing.sub ? `<p class="ov__body">${esc(seg.closing.sub)}</p>` : ''}
                 </div>`
              : '';
            return ovs + closing;
          })
          .join('')}
      </div>
    </div>`;

  const stage = section.querySelector<HTMLElement>('.ascent__stage')!;
  const canvas = section.querySelector<HTMLCanvasElement>('.ascent__canvas')!;
  const snowCanvas = section.querySelector<HTMLCanvasElement>('.ascent__snow')!;
  const flash = section.querySelector<HTMLElement>('.ascent__flash')!;
  const night = section.querySelector<HTMLElement>('.ascent__night')!;
  const scrimL = section.querySelector<HTMLElement>('.ascent__scrim--left')!;
  const scrimR = section.querySelector<HTMLElement>('.ascent__scrim--right')!;

  const hud = createHud();
  document.body.appendChild(hud.el);
  const snow = createSnow(snowCanvas);

  // Scroll distance in px per "vh unit" of config length — measured, so it matches CSS exactly.
  let master: ScrollTrigger | null = null;
  const unit = () => (section.offsetHeight - window.innerHeight) / totalVh;

  // ------------------------------------------------------------------ overlays
  interface OverlayRef {
    seg: number;
    range: [number, number];
    side: 'left' | 'right' | 'center';
    parts: HTMLElement[];
    el: HTMLElement;
    last: string;
  }
  const overlays: OverlayRef[] = [];
  // Parts animate in DOM order: eyebrow, each headline line, body. Headlines are split into
  // lines with SplitText (autoSplit re-splits on resize / font swap; parts are re-queried then).
  const PARTS = '.ov__eyebrow, .ov__headline .line, .ov__closing .line, .ov__body';
  const partsOf = (o: OverlayRef) => {
    if (!o.parts.length) o.parts = [...o.el.querySelectorAll<HTMLElement>(PARTS)];
    return o.parts;
  };
  section.querySelectorAll<HTMLElement>('.ov').forEach((el) => {
    const segIndex = Number(el.dataset.seg);
    const seg = segments[segIndex] as ClipSegment;
    const isClosing = el.hasAttribute('data-closing');
    const ov = isClosing ? null : seg.overlays[Number(el.dataset.ov)];
    overlays.push({
      seg: segIndex,
      range: isClosing ? seg.closing!.range : ov!.range,
      side: isClosing ? 'center' : (ov!.align ?? 'left'),
      parts: [],
      el,
      last: '',
    });
  });
  const nightline = section.querySelector<HTMLElement>('.ascent__nightline');

  // SplitText lines must be measured with final fonts, so split on first use (after the preloader).
  let splitDone = false;
  const ensureSplit = () => {
    if (splitDone) return;
    splitDone = true;
    for (const o of overlays) {
      o.el.querySelectorAll<HTMLElement>('.ov__headline, .ov__closing').forEach((h) =>
        SplitText.create(h, {
          type: 'lines',
          aria: 'none',
          linesClass: 'line',
          autoSplit: true,
          onSplit: () => {
            o.parts = [];
            o.last = '';
            // New .line nodes start hidden: re-apply the current state right away.
            if (master) requestAnimationFrame(() => update(master!.progress));
          },
        }),
      );
    }
  };

  const applyPart = (el: HTMLElement, inT: number, outT: number) => {
    const o = inT * (1 - outT);
    const y = (1 - inT) * 34 - outT * 26;
    const blur = (1 - inT) * 10 + outT * 8;
    el.style.opacity = o.toFixed(3);
    el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
    el.style.filter = blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : '';
  };

  // ------------------------------------------------------------------ sequences
  const sequences: (FrameSequence | null)[] = placed.map(() => null);
  const clipSegs = placed.filter((p): p is Placed<ClipSegment> => p.seg.type === 'clip');

  const boot = loadManifest().then((manifest) => {
    let prev: FrameSequence | undefined;
    for (const p of clipSegs) {
      const info = manifest[p.seg.clip];
      if (!info) {
        console.warn(`[ascent] ${p.seg.clip} missing from manifest — run npm run frames`);
        continue;
      }
      const seq = new FrameSequence({
        clip: p.seg.clip,
        canvas,
        info,
        scroll: {
          trigger: section,
          start: () => `top+=${Math.round(p.offVh * unit())} top`,
          end: () => `top+=${Math.round((p.offVh + p.seg.lengthVh) * unit())} top`,
        },
        blendFrom: p.seg.blendIn ? prev : undefined,
        blendIn: p.seg.blendIn,
      });
      sequences[p.index] = seq;
      prev = seq;
    }
    const live = sequences.filter((s): s is FrameSequence => !!s);
    if (!live.length) return;
    ScrollTrigger.refresh();
    // The manifest can arrive late (slow network, preloader already gone): paint the clip the
    // viewer is actually in, not blindly the first one.
    const current = live.find((s) => s.trigger?.isActive) ?? live[0];
    current.claim();
    if (master) update(master.progress);
    return current.load();
  });
  track(boot, 3);

  // ------------------------------------------------------------------ master timeline
  const hudFor = (i: number, t: number): HudFrame => {
    const seg = segments[i];
    if (seg.type === 'transition') {
      // Hold the previous chapter's readout until the screen is dark, then cut to night.
      const prevSeg = segments[i - 1];
      if (t < 0.4 && prevSeg) return prevSeg.hud.to;
      return lerpHud(seg.hud.from, seg.hud.to, range(t, 0.4, 1));
    }
    return lerpHud(seg.hud.from, seg.hud.to, t);
  };

  const renderTransition = (seg: TransitionSegment, i: number, t: number) => {
    // 0–.3 white spindrift flash · .3–.45 white → ink · .45–.8 line · .78–1 ink lifts off chapter 3
    const flashO = range(t, 0.02, 0.3) * (1 - range(t, 0.32, 0.48));
    const nightO = range(t, 0.3, 0.46) * (1 - range(t, 0.8, 1));
    flash.style.opacity = flashO.toFixed(3);
    night.style.opacity = nightO.toFixed(3);
    if (nightline) {
      const inT = easeOut(range(t, 0.44, 0.58));
      const outT = range(t, 0.72, 0.82);
      applyPart(nightline, inT, outT);
    }
    // Swap which clip paints the (hidden) canvas at full darkness.
    const before = sequences[i - 1];
    const after = sequences[i + 1];
    if (t < 0.4) {
      if (before) {
        before.claim();
        before.setProgress(1);
      }
    } else if (after) {
      after.claim();
      after.setProgress(0);
    }
    void seg;
  };

  let lastSeg = -1;
  const update = (progress: number) => {
    ensureSplit();
    const vhPos = progress * totalVh;
    let cur = placed[placed.length - 1];
    for (const p of placed) {
      if (vhPos < p.offVh + p.seg.lengthVh) {
        cur = p;
        break;
      }
    }
    const t = range(vhPos, cur.offVh, cur.offVh + cur.seg.lengthVh);
    const seg = cur.seg;

    hud.set(hudFor(cur.index, t));
    setWind(windAt(seg.wind, t));

    if (seg.type === 'transition') renderTransition(seg, cur.index, t);
    else if (lastSeg !== cur.index) {
      flash.style.opacity = '0';
      night.style.opacity = '0';
      if (nightline) applyPart(nightline, 0, 0);
    }
    lastSeg = cur.index;

    // Overlays: only the current segment's can be visible.
    let left = 0;
    let right = 0;
    for (const o of overlays) {
      const [a, b] = o.range;
      const visible = o.seg === cur.index && t >= a && t <= b;
      const key = visible ? t.toFixed(4) : 'off';
      if (key === o.last) continue;
      o.last = key;
      if (!visible) {
        o.el.style.visibility = 'hidden';
        o.el.classList.remove('is-live');
        continue;
      }
      o.el.style.visibility = 'visible';
      o.el.classList.add('is-live');
      let maxO = 0;
      partsOf(o).forEach((part, k) => {
        const { inT, outT } = lineState(t, a, b, k);
        applyPart(part, inT, outT);
        maxO = Math.max(maxO, inT * (1 - outT));
      });
      if (o.side === 'left' || o.side === 'center') left = Math.max(left, maxO);
      if (o.side === 'right' || o.side === 'center') right = Math.max(right, maxO);
    }
    scrimL.style.opacity = left.toFixed(3);
    scrimR.style.opacity = right.toFixed(3);
  };

  // Split overlay headlines during idle time once fonts are in, so the (layout-heavy) split
  // never lands on the first scroll frame inside the ascent.
  const idle = (fn: () => void) =>
    'requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 200);
  void document.fonts.ready.then(() => idle(ensureSplit));

  master = ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => update(self.progress),
    onRefresh: (self) => update(self.progress),
    onToggle: (self) => {
      hud.show(self.isActive);
      stage.classList.toggle('is-active', self.isActive);
      if (self.isActive) snow.start();
      else {
        snow.stop();
        setWind(0);
      }
    },
  });

  // Re-split overlay lines after resizes (line breaks change).
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      overlays.forEach((o) => (o.last = ''));
      if (master) update(master.progress);
    }, 150);
  });
}
