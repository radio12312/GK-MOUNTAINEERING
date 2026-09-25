import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { frames as cfg } from '../config';
import { env } from './env';

/* ==========================================================================
   Manifest
   ========================================================================== */
export interface ClipInfo {
  fps: number;
  count: number;
  width: number;
  height: number;
  mobile: { width: number; height: number };
  lqip: string;
}
export type Manifest = Record<string, ClipInfo>;

let manifestPromise: Promise<Manifest> | null = null;
export function loadManifest(): Promise<Manifest> {
  manifestPromise ??= fetch(cfg.manifestUrl, { credentials: 'same-origin' }).then((r) => {
    if (!r.ok) throw new Error(`manifest ${r.status}`);
    return r.json() as Promise<Manifest>;
  });
  return manifestPromise;
}

type Variant = 'desktop' | 'mobile';
const pickVariant = (): Variant => (env.portrait ? 'mobile' : 'desktop');

/* ==========================================================================
   Decoded-bitmap LRU shared by every sequence (byte budget, not count)
   ========================================================================== */
class BitmapCache {
  private map = new Map<string, { bmp: ImageBitmap; bytes: number }>();
  private bytes = 0;
  constructor(private budget: number) {}

  get(key: string): ImageBitmap | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    // refresh recency
    this.map.delete(key);
    this.map.set(key, e);
    return e.bmp;
  }
  has(key: string) {
    return this.map.has(key);
  }
  set(key: string, bmp: ImageBitmap, onEvict: (key: string) => void) {
    this.delete(key); // never double-count a key
    const bytes = bmp.width * bmp.height * 4;
    this.map.set(key, { bmp, bytes });
    this.bytes += bytes;
    // Evict least-recently-used until within budget (never the entry just added).
    for (const [k, e] of this.map) {
      if (this.bytes <= this.budget || k === key) break;
      e.bmp.close();
      this.map.delete(k);
      this.bytes -= e.bytes;
      onEvict(k);
    }
  }
  delete(key: string) {
    const e = this.map.get(key);
    if (!e) return;
    e.bmp.close();
    this.bytes -= e.bytes;
    this.map.delete(key);
  }
}

const cache = new BitmapCache(
  (env.mobile ? cfg.memoryBudgetMB.mobile : cfg.memoryBudgetMB.desktop) * 1024 * 1024,
);

/* ==========================================================================
   Global fetch scheduler: a small worker pool pulling from the highest-priority
   sequence first (lower number = more urgent).
   ========================================================================== */
const sequences = new Set<FrameSequence>();
let inFlight = 0;
let held = false;

/**
 * While held, only first frames (posters) are fetched, so the first screen's critical assets
 * (hero video, fonts, JS) aren't competing with sequence streaming. Released after the preloader.
 */
export function holdStreaming(hold: boolean): void {
  held = hold;
  if (!hold) pump();
}

function pump() {
  while (inFlight < cfg.maxConcurrentFetches) {
    let best: FrameSequence | null = null;
    for (const s of sequences) {
      if (!s.hasPendingFetch() || (held && !s.nextIsPoster())) continue;
      if (!best || s.priority < best.priority) best = s;
    }
    if (!best) return;
    const job = best.takeFetch();
    if (!job) return;
    inFlight++;
    job().finally(() => {
      inFlight--;
      pump();
    });
  }
}

/* ==========================================================================
   Canvas ownership: several sequences share one sticky canvas; only the owner draws.
   ========================================================================== */
const owners = new WeakMap<HTMLCanvasElement, FrameSequence>();

export interface FrameSequenceOptions {
  clip: string;
  canvas: HTMLCanvasElement;
  info: ClipInfo;
  /** ScrollTrigger vars for this clip's scrub range (trigger/start/end). */
  scroll?: Pick<ScrollTrigger.Vars, 'trigger' | 'start' | 'end'>;
  /** Crossfade from this sequence's last frame over the first `blendIn` of progress. */
  blendFrom?: FrameSequence;
  blendIn?: number;
}

type ProgressFn = (progress: number, sequence: FrameSequence) => void;

export class FrameSequence {
  readonly clip: string;
  readonly canvas: HTMLCanvasElement;
  readonly info: ClipInfo;
  readonly count: number;
  trigger: ScrollTrigger | null = null;
  /** Lower = loads first. Managed by visibility: 0 active, 1 near, 5 idle. */
  priority = 5;

  private ctx: CanvasRenderingContext2D;
  private variant: Variant = pickVariant();
  private blobs: (Blob | undefined)[];
  private fetchQueue: number[] = [];
  private queued = new Set<number>();
  private decoding = new Set<number>();
  private decoded = new Set<number>(); // indices currently in the shared cache
  private backlog = new Set<number>(); // fetched but decode deferred
  private fetching = new Set<number>(); // requests in flight
  private tries = new Map<number, number>(); // failed attempts per frame
  private firstFramePromise: Promise<void> | null = null;
  private resolveFirstFrame: (() => void) | null = null;
  private generation = 0; // bumps on release/variant change to drop stale work
  private progress = 0;
  private index = 0;
  private dir = 1;
  private drawnKey = '';
  private rafId = 0;
  private listeners = new Set<ProgressFn>();
  private lqip: HTMLImageElement | null = null;
  private loading = false;
  private blendFrom?: FrameSequence;
  private blendIn: number;
  private preloadTrigger: ScrollTrigger | null = null;

  constructor(opts: FrameSequenceOptions) {
    this.clip = opts.clip;
    this.canvas = opts.canvas;
    this.info = opts.info;
    this.count = opts.info.count;
    this.blobs = new Array(this.count);
    this.blendFrom = opts.blendFrom;
    this.blendIn = opts.blendIn ?? 0;
    this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: false })!;
    sequences.add(this);

    if (opts.scroll) {
      this.trigger = ScrollTrigger.create({
        ...opts.scroll,
        onUpdate: (self) => this.setProgress(self.progress),
        onToggle: (self) => {
          if (self.isActive) this.claim();
        },
        onRefresh: (self) => this.setProgress(self.progress),
      });
      this.watchDistance();
    }
  }

  /* ---------------------------------------------------------------- public */

  /** Subscribe to scrub progress (0–1). Returns an unsubscribe function. */
  onProgress(fn: ProgressFn): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get currentProgress() {
    return this.progress;
  }

  setProgress(p: number): void {
    const clamped = Math.min(1, Math.max(0, p));
    if (clamped !== this.progress) this.dir = clamped > this.progress ? 1 : -1;
    this.progress = clamped;
    this.index = Math.round(clamped * (this.count - 1));
    this.listeners.forEach((l) => l(clamped, this));
    this.prioritizeAround(this.index);
    this.requestDraw();
  }

  /** Make this sequence the one that paints the shared canvas. */
  claim(): void {
    const prev = owners.get(this.canvas);
    if (prev === this) return;
    if (prev && prev.priority < 1) prev.priority = 1;
    owners.set(this.canvas, this);
    this.priority = 0;
    this.load();
    this.drawnKey = '';
    this.requestDraw();
  }

  get isOwner() {
    return owners.get(this.canvas) === this;
  }

  /** Start progressive loading (idempotent). Resolves when the first frame is decoded. */
  load(): Promise<void> {
    if (!this.loading) {
      this.loading = true;
      this.planFetches();
      pump();
    }
    return this.firstFrame();
  }

  /** Resolves once frame 0 is decoded (used by the preloader). */
  firstFrame(): Promise<void> {
    if (this.decoded.has(0)) return Promise.resolve();
    this.firstFramePromise ??= new Promise((res) => (this.resolveFirstFrame = res));
    return this.firstFramePromise;
  }

  /** Resolves when every `step`-th frame has been fetched (coarse pass complete). */
  coarseReady(step = cfg.loadPasses[0]): Promise<void> {
    return new Promise((res) => {
      const check = () => {
        for (let i = 0; i < this.count; i += step) if (!this.blobs[i]) return void setTimeout(check, 60);
        res();
      };
      check();
    });
  }

  /** Free decoded frames + compressed blobs (keeps nothing but the LQIP). */
  release(): void {
    this.generation++;
    this.loading = false;
    this.fetchQueue = [];
    this.queued.clear();
    for (const i of this.decoded) cache.delete(this.key(i));
    this.decoded.clear();
    this.decoding.clear();
    this.backlog.clear();
    this.fetching.clear();
    this.tries.clear();
    this.blobs = new Array(this.count);
    if (this.priority < 5) this.priority = 5;
  }

  /** Draw the frame at a fraction of the clip immediately (reduced-motion stills, transitions). */
  frameUrl(i: number, variant: Variant = this.variant): string {
    return `${cfg.basePath}/${this.clip}/${variant}/${String(i + 1).padStart(4, '0')}.webp`;
  }

  /** Handle viewport changes: canvas backing size + variant switch. */
  resize(): void {
    const nextVariant = pickVariant();
    if (nextVariant !== this.variant) {
      const wasLoading = this.loading;
      this.release();
      this.variant = nextVariant;
      if (wasLoading) this.load();
    }
    this.drawnKey = '';
    if (this.isOwner) this.requestDraw();
  }

  destroy(): void {
    this.release();
    this.trigger?.kill();
    this.preloadTrigger?.kill();
    sequences.delete(this);
    cancelAnimationFrame(this.rafId);
  }

  /* -------------------------------------------------------------- loading */

  hasPendingFetch(): boolean {
    return this.loading && this.fetchQueue.length > 0;
  }

  nextIsPoster(): boolean {
    return this.fetchQueue[0] === 0;
  }

  takeFetch(): (() => Promise<void>) | null {
    const i = this.fetchQueue.shift();
    if (i === undefined) return null;
    this.queued.delete(i);
    this.fetching.add(i);
    const gen = this.generation;
    const url = this.frameUrl(i);
    return async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status}`);
        const blob = await res.blob();
        if (gen !== this.generation) return;
        this.blobs[i] = blob;
        // Decode right away if it's near the playhead or part of the coarse pass.
        if (Math.abs(i - this.index) <= 12 || i % cfg.loadPasses[0] === 0 || i === this.count - 1) {
          void this.decode(i);
        }
      } catch {
        // Bounded retries with backoff; give up offline or after 3 attempts
        // (the nearest-frame fallback covers a missing frame).
        const n = (this.tries.get(i) ?? 0) + 1;
        this.tries.set(i, n);
        if (gen === this.generation && n < 3 && navigator.onLine) {
          setTimeout(() => gen === this.generation && this.enqueue(i, false), 1500 * 2 ** n);
        }
      } finally {
        if (gen === this.generation) this.fetching.delete(i);
      }
    };
  }

  /** Coarse-to-fine plan: first frame, last frame, then every 8th, 4th, 2nd, all. */
  private planFetches() {
    this.enqueue(0, false);
    this.enqueue(this.count - 1, false);
    for (const step of cfg.loadPasses) {
      for (let i = 0; i < this.count; i += step) this.enqueue(i, false);
    }
  }

  private enqueue(i: number, front: boolean) {
    if (i < 0 || i >= this.count || this.blobs[i] || this.queued.has(i) || this.fetching.has(i)) return;
    this.queued.add(i);
    if (front) this.fetchQueue.unshift(i);
    else this.fetchQueue.push(i);
    pump();
  }

  /** Pull frames around the playhead to the front of the fetch queue, and decode ahead. */
  private prioritizeAround(center: number) {
    if (!this.loading) return;
    const ahead = 10;
    const behind = 4;
    const lo = this.dir > 0 ? center - behind : center - ahead;
    const hi = this.dir > 0 ? center + ahead : center + behind;
    // Fetch: nearest-first so the exact frame comes before the far ones.
    for (let d = ahead; d >= 0; d--) {
      for (let side = 0; side < (d === 0 ? 1 : 2); side++) {
        const i = side === 0 ? center + d * this.dir : center - d * this.dir;
        if (i < lo || i > hi || i < 0 || i >= this.count || this.blobs[i] || this.fetching.has(i)) continue;
        if (this.queued.has(i)) {
          this.fetchQueue.splice(this.fetchQueue.indexOf(i), 1);
          this.queued.delete(i);
        }
        this.enqueue(i, true);
      }
    }
    // Decode window.
    for (let i = Math.max(0, lo); i <= Math.min(this.count - 1, hi); i++) {
      if (this.blobs[i] && !this.decoded.has(i)) void this.decode(i);
    }
  }

  private key(i: number) {
    return `${this.clip}/${this.variant}/${i}`;
  }

  private async decode(i: number): Promise<void> {
    const blob = this.blobs[i];
    if (!blob || this.decoded.has(i) || this.decoding.has(i)) return;
    if (this.decoding.size >= 4 && Math.abs(i - this.index) > 2) {
      this.backlog.add(i); // keep decode slots for urgent frames; retry later
      return;
    }
    this.backlog.delete(i);
    this.decoding.add(i);
    const gen = this.generation;
    try {
      const bmp = await createImageBitmap(blob);
      if (gen !== this.generation || this.decoded.has(i)) {
        bmp.close();
        return;
      }
      this.decoded.add(i);
      cache.set(this.key(i), bmp, (evicted) => evictHook(evicted));
      if (i === 0 && this.resolveFirstFrame) {
        this.resolveFirstFrame();
        this.resolveFirstFrame = null;
        this.firstFramePromise = null;
      }
      // Repaint if this frame is closer to the target than what's on screen.
      if (this.isOwner || this.blendingOwner()) {
        this.drawnKey = '';
        this.requestDraw();
      }
    } catch {
      /* corrupt frame — nearest-frame fallback covers it */
    } finally {
      if (gen === this.generation) this.decoding.delete(i);
      this.drainBacklog();
    }
  }

  private drainBacklog() {
    if (!this.backlog.size || this.decoding.size >= 4) return;
    let best = -1;
    for (const i of this.backlog) {
      if (this.decoded.has(i) || !this.blobs[i]) {
        this.backlog.delete(i);
        continue;
      }
      if (best < 0 || Math.abs(i - this.index) < Math.abs(best - this.index)) best = i;
    }
    if (best >= 0) {
      this.backlog.delete(best);
      void this.decode(best);
    }
  }

  /** Called by the cache when it evicts one of our frames. */
  forget(i: number) {
    this.decoded.delete(i);
  }

  private blendingOwner(): boolean {
    for (const s of sequences) if (s.isOwner && s.blendFrom === this) return true;
    return false;
  }

  /** Nearest decoded frame to `target` (exact first, then outward). */
  bitmapNear(target: number): { bmp: ImageBitmap; index: number } | null {
    for (let d = 0; d < this.count; d++) {
      for (let side = 0; side < (d === 0 ? 1 : 2); side++) {
        const i = side === 0 ? target - d * this.dir : target + d * this.dir;
        if (i < 0 || i >= this.count || !this.decoded.has(i)) continue;
        const bmp = cache.get(this.key(i));
        if (bmp) return { bmp, index: i };
        this.decoded.delete(i);
      }
    }
    return null;
  }

  lastBitmap() {
    return this.bitmapNear(this.count - 1);
  }

  /** Load / release based on distance to this clip's scroll range (uses the resolved main trigger). */
  private watchDistance() {
    const vh = () => window.innerHeight;
    this.preloadTrigger = ScrollTrigger.create({
      start: () => (this.trigger?.start ?? 0) - cfg.preloadViewports * vh(),
      end: () => (this.trigger?.end ?? 0) + cfg.releaseViewportsBehind * vh(),
      onToggle: (self) => {
        if (self.isActive) {
          if (this.priority > 1) this.priority = 1;
          this.load();
        } else {
          this.priority = 5;
          // Release clips far behind (or far ahead of) the viewer — mobile only;
          // desktop relies on the LRU byte budget.
          if (env.mobile && !this.isOwner) this.release();
        }
      },
    });
  }

  /* -------------------------------------------------------------- drawing */

  private requestDraw() {
    if (this.rafId || !(this.isOwner || this.blendingOwner())) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      if (this.isOwner) this.draw();
      else for (const s of sequences) if (s.isOwner && s.blendFrom === this) s.requestRedraw();
    });
  }

  requestRedraw() {
    this.drawnKey = '';
    this.requestDraw();
  }

  private sizeCanvas(): { w: number; h: number } {
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    // DPR ≤ 2, and cap the backing store near 4.2 MP — the source frames are 1600 px wide,
    // so a larger canvas only costs fill-rate.
    let dpr = Math.min(window.devicePixelRatio || 1, cfg.maxDpr);
    const maxArea = 2560 * 1640;
    if (cw * ch * dpr * dpr > maxArea) dpr = Math.sqrt(maxArea / (cw * ch));
    const w = Math.max(1, Math.round(cw * dpr));
    const h = Math.max(1, Math.round(ch * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.ctx.imageSmoothingQuality = 'high';
    }
    return { w, h };
  }

  private cover(src: CanvasImageSource & { width: number; height: number }, w: number, h: number, alpha = 1) {
    const s = Math.max(w / src.width, h / src.height);
    const dw = src.width * s;
    const dh = src.height * s;
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
    this.ctx.globalAlpha = 1;
  }

  private draw() {
    const { w, h } = this.sizeCanvas();
    const hit = this.bitmapNear(this.index);
    const blending = this.blendFrom && this.blendIn > 0 && this.progress < this.blendIn;
    const blendAlpha = blending ? this.progress / this.blendIn : 1;
    const prev = blending ? this.blendFrom!.lastBitmap() : null;

    const key = `${w}x${h}|${hit?.index ?? 'lqip'}|${blending ? blendAlpha.toFixed(3) + '|' + (prev?.index ?? '-') : ''}`;
    if (key === this.drawnKey) return; // redraw only when something visible changed
    this.drawnKey = key;

    if (prev) this.cover(prev.bmp, w, h);
    if (hit) {
      this.cover(hit.bmp, w, h, prev ? easeInOut(blendAlpha) : 1);
    } else if (!prev) {
      this.drawLqip(w, h);
    }
  }

  private drawLqip(w: number, h: number) {
    if (!this.lqip) {
      this.lqip = new Image();
      this.lqip.onload = () => this.requestRedraw();
      this.lqip.src = this.info.lqip;
    }
    if (this.lqip.complete && this.lqip.naturalWidth) {
      this.ctx.filter = 'blur(12px)';
      this.cover(this.lqip, w, h);
      this.ctx.filter = 'none';
    } else {
      this.ctx.fillStyle = '#0b0f14';
      this.ctx.fillRect(0, 0, w, h);
    }
  }
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function evictHook(key: string) {
  const [clip, , idx] = key.split('/');
  for (const s of sequences) if (s.clip === clip) s.forget(Number(idx));
}

// One resize handler for all sequences.
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => sequences.forEach((s) => s.resize()), 120);
});
