import { generateHeightfield, wrapHeightfield, type Heightfield, type HeightfieldData } from './heightfield';

let pending: Promise<Heightfield> | null = null;

/** Heightfield from a Web Worker; falls back to the main thread if workers are unavailable. */
export function loadHeightfield(): Promise<Heightfield> {
  pending ??= new Promise<HeightfieldData>((resolve) => {
    const onMain = () => resolve(generateHeightfield());
    let worker: Worker;
    try {
      worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      onMain();
      return;
    }
    worker.onmessage = (e: MessageEvent<HeightfieldData>) => {
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = (e) => {
      e.preventDefault();
      worker.terminate();
      onMain();
    };
    worker.postMessage(0);
  }).then(wrapHeightfield);
  return pending;
}
