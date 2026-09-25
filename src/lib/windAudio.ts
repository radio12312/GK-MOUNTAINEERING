import { audio as cfg } from '../config';
import { getWind, onWind } from './wind';

/**
 * Ambient wind: generated brown noise → band-pass → gain, no audio files.
 * Off by default; only starts after an explicit user toggle (autoplay-safe).
 * Gain, filter frequency and a slow gust LFO follow the shared wind value.
 */
type Listener = (enabled: boolean) => void;

let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let filter: BiquadFilterNode | null = null;
let enabled = false;
let suspendTimer = 0;
const listeners = new Set<Listener>();

function build(): void {
  ctx = new AudioContext();
  const seconds = 4;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02; // brown noise
    data[i] = last * 3.5;
  }
  // Crossfade the loop point so the buffer loops without a click.
  const fade = Math.floor(ctx.sampleRate * 0.25);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    data[i] = data[i] * t + data[data.length - fade + i] * (1 - t);
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;

  filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 0.7;

  // Gusts: a slow LFO modulating the filter frequency.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.09;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 180;
  lfo.connect(lfoDepth).connect(filter.frequency);

  gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start();
  lfo.start();

  onWind(apply);
}

function apply(w = getWind()): void {
  if (!ctx || !gain || !filter) return;
  const now = ctx.currentTime;
  const target = enabled ? cfg.baseGain + (cfg.maxGain - cfg.baseGain) * w : 0;
  gain.gain.setTargetAtTime(target, now, enabled ? 0.6 : 0.25);
  filter.frequency.setTargetAtTime(260 + 900 * w, now, 0.8);
}

export const windAudio = {
  get enabled() {
    return enabled;
  },
  async toggle(): Promise<boolean> {
    enabled = !enabled;
    if (enabled && !ctx) build();
    if (ctx?.state === 'suspended') await ctx.resume();
    apply();
    if (!enabled) {
      // Let the fade-out finish, then stop the audio thread entirely (battery).
      clearTimeout(suspendTimer);
      suspendTimer = window.setTimeout(() => !enabled && ctx?.suspend(), 1200);
    }
    listeners.forEach((l) => l(enabled));
    return enabled;
  },
  onChange(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

// Pause audio in background tabs.
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) void ctx.suspend();
  else if (enabled) void ctx.resume();
});
