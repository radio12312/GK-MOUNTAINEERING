import { frames } from '../config';

const rmQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

function hasWebGL2(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

export const env = {
  reducedMotion: rmQuery.matches,
  touch: window.matchMedia('(hover: none) and (pointer: coarse)').matches,
  /** Low-end heuristic used by the 3D route fallback. */
  lowEnd: (navigator.hardwareConcurrency ?? 8) <= 4 || !hasWebGL2(),
  /** Portrait / narrow viewports use the 9:16 frame set. */
  get portrait(): boolean {
    return window.innerWidth / window.innerHeight < frames.mobileAspectBelow;
  },
  get mobile(): boolean {
    return window.innerWidth < 768 || this.touch;
  },
};

/** Reduced-motion changes at runtime are rare; reloading gives a clean, consistent state. */
rmQuery.addEventListener('change', () => window.location.reload());

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0→1 over [a, b] */
export const range = (v: number, a: number, b: number) => clamp((v - a) / (b - a));
