/** Generates the heightfield off the main thread (≈150–250 ms of math on mid-range CPUs). */
import { generateHeightfield } from './heightfield';

self.onmessage = () => {
  const data = generateHeightfield();
  self.postMessage(data, { transfer: [data.heights.buffer, data.normals.buffer, data.bake.buffer] });
};
