/**
 * Tiny weighted load tracker. Anything critical to the first screen registers a promise;
 * the preloader shows the combined progress.
 */
type Listener = (progress: number) => void;

let total = 0;
let done = 0;
const listeners = new Set<Listener>();
const pending: Promise<unknown>[] = [];

function emit() {
  const p = total === 0 ? 1 : done / total;
  listeners.forEach((l) => l(p));
}

export function track<T>(promise: Promise<T>, weight = 1): Promise<T> {
  total += weight;
  emit();
  const settle = () => {
    done += weight;
    emit();
  };
  const tracked = promise.then(
    (v) => (settle(), v),
    (e) => {
      settle();
      throw e;
    },
  );
  pending.push(tracked.catch(() => undefined));
  return tracked;
}

/** Report partial progress (0–1) for a long task that registered with `weight`. */
export function trackPartial(weight: number): { update(p: number): void; done(): void } {
  total += weight;
  let reported = 0;
  emit();
  return {
    update(p: number) {
      const next = Math.min(1, Math.max(0, p)) * weight;
      done += next - reported;
      reported = next;
      emit();
    },
    done() {
      done += weight - reported;
      reported = weight;
      emit();
    },
  };
}

export function onLoadProgress(fn: Listener): () => void {
  listeners.add(fn);
  fn(total === 0 ? 0 : done / total);
  return () => listeners.delete(fn);
}

/** Resolves when everything tracked so far has settled. */
export function allTracked(): Promise<void> {
  return Promise.all(pending).then(() => undefined);
}
