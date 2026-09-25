/**
 * Shared wind state (0–1). The Ascent writes it from the per-chapter wind curve;
 * snow particles and the ambient audio read it.
 */
type Listener = (w: number) => void;
const listeners = new Set<Listener>();
let value = 0;

export function setWind(w: number): void {
  if (Math.abs(w - value) < 0.001) return;
  value = w;
  listeners.forEach((l) => l(w));
}
export function getWind(): number {
  return value;
}
export function onWind(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
