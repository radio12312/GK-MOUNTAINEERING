/**
 * The Route — heightfield generation (pure math, no Three.js; runs in a Web Worker).
 *
 * A designed massif: one dominant summit, an arête descending to a shoulder (High Camp),
 * a steep face below it, a hanging basin (Camp 1), an icefall step and a valley glacier
 * whose moraine holds Base Camp. Ridged multifractal noise supplies the rock detail; the
 * large forms come from radial peak masks so the composition stays readable.
 *
 * Coordinates: x → east (right), z → south (toward the viewer at the start), y → up.
 * Design points are in normalised units u, v ∈ [-1, 1] (world = u · size / 2).
 */
import { camps, route } from '../../config';
import { createSimplex2D, fbm, ridged } from './noise';

export interface CampPoint {
  id: string;
  x: number;
  y: number;
  z: number;
}

/** Transferable result of the generator. */
export interface HeightfieldData {
  n: number; // segments per side
  size: number;
  /** World-space heights, row-major: index = iz * (n + 1) + ix. */
  heights: Float32Array;
  normals: Float32Array;
  /** Per-vertex baked data: [sun visibility, cavity (gully) 0–1, glacier mask 0–1]. */
  bake: Float32Array;
  maxHeight: number;
  baseHeight: number;
  /** Route control points (world x/z) from base camp to the summit. */
  waypoints: { x: number; z: number; campId?: string }[];
  camps: CampPoint[];
  sunDir: [number, number, number];
}

export interface Heightfield extends HeightfieldData {
  half: number;
  cell: number;
  /** Exact height of the rendered (triangulated) surface. */
  heightAt(x: number, z: number): number;
  /** Altitude in metres for a world height, mapped linearly base camp → summit. */
  altitudeAt(y: number): number;
}

type P2 = { u: number; v: number; campId?: string };

// --- Composition (summit-relative heights) ---------------------------------------------
const SUMMIT = { u: 0.06, v: -0.3 };
const HIGH = { u: -0.27, v: -0.15 };
const C1 = { u: -0.17, v: 0.25 };
const BASE = { u: -0.34, v: 0.64 };
const FACE_FOOT = { u: -0.08, v: 0.1 };

/** Secondary peaks: position, amplitude (raw units), radius, sharpness. */
const PEAKS = [
  { u: 0.55, v: -0.12, a: 0.7, r: 0.55, k: 1.5 },
  { u: -0.64, v: -0.4, a: 0.68, r: 0.5, k: 1.5 },
  { u: 0.42, v: 0.44, a: 0.42, r: 0.42, k: 1.4 },
  { u: -0.8, v: 0.22, a: 0.4, r: 0.42, k: 1.4 },
  { u: 0.02, v: -0.86, a: 0.62, r: 0.5, k: 1.5 },
  { u: 0.82, v: -0.62, a: 0.56, r: 0.45, k: 1.5 },
  { u: 0.86, v: 0.3, a: 0.34, r: 0.4, k: 1.4 },
];

/** Valley glacier centre line with floor height (fraction of summit) and half-width. */
const GLACIER: { u: number; v: number; h: number; w: number }[] = [
  { u: -0.36, v: 1.02, h: 0.0, w: 0.17 },
  { u: -0.34, v: 0.64, h: 0.035, w: 0.14 },
  { u: -0.27, v: 0.5, h: 0.09, w: 0.12 },
  { u: -0.19, v: 0.3, h: 0.3, w: 0.11 },
  { u: -0.14, v: 0.17, h: 0.345, w: 0.12 },
  { u: -0.08, v: 0.08, h: 0.37, w: 0.1 },
];

/** Route plan: moraine → icefall zig-zags → basin → face switchbacks → shoulder → arête. */
const ROUTE_PLAN: P2[] = [
  { ...BASE, campId: 'base' },
  { u: -0.31, v: 0.58 },
  { u: -0.27, v: 0.51 },
  { u: -0.22, v: 0.45 },
  { u: -0.26, v: 0.4 },
  { u: -0.2, v: 0.35 },
  { u: -0.23, v: 0.3 },
  { ...C1, campId: 'c1' },
  { u: -0.13, v: 0.17 },
  { ...FACE_FOOT },
  { u: -0.08, v: 0.041 },
  { u: -0.165, v: 0.046 },
  { u: -0.137, v: -0.034 },
  { u: -0.222, v: -0.029 },
  { u: -0.194, v: -0.109 },
  { u: -0.279, v: -0.104 },
  { ...HIGH, campId: 'high' },
  { u: -0.19, v: -0.19 },
  { u: -0.105, v: -0.225 },
  { u: -0.025, v: -0.262 },
  { ...SUMMIT, campId: 'summit' },
];

/** Summit pyramid face normals (u, v); the bisector of the first two points at High Camp. */
const FACE_NORMALS = [105, 205, 300, 25].flatMap((deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)]);

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Polynomial smooth max. */
const smax = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
};

let segT = 0;
/** Distance from p to segment ab; the segment parameter is left in `segT`. */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  segT = t;
  const ex = ax + dx * t - px;
  const ez = az + dz * t - pz;
  return Math.sqrt(ex * ex + ez * ez);
}

export function sunDirection(): [number, number, number] {
  const az = (route.sun.azimuthDeg * Math.PI) / 180;
  const el = (route.sun.elevationDeg * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}

/** Target height (fraction of summit) for a camp, from its altitude. */
function campHeight(id: string, baseH: number): number {
  const camp = camps.find((c) => c.id === id);
  const first = camps[0].alt;
  const span = camps[camps.length - 1].alt - first;
  return camp ? baseH + ((camp.alt - first) / span) * (1 - baseH) : baseH;
}

const BASE_H = 0.035;

export function generateHeightfield(): HeightfieldData {
  const { seed, size, segments: n, heightScale } = route.terrain;
  const half = size / 2;
  const cell = size / n;
  const row = n + 1;
  const count = row * row;

  const noiseA = createSimplex2D(seed);
  const noiseB = createSimplex2D(seed * 31 + 5);
  const noiseC = createSimplex2D(seed * 131 + 17);

  const hHigh = campHeight('high', BASE_H);
  const faceDx = HIGH.u - FACE_FOOT.u;
  const faceDz = HIGH.v - FACE_FOOT.v;

  // Pass 1 — raw mountain forms.
  const h = new Float32Array(count);
  const rFineArr = new Float32Array(count);
  const rArr = new Float32Array(count);
  let sMax = -1;
  for (let iz = 0; iz < row; iz++) {
    const v = (iz * cell - half) / half;
    for (let ix = 0; ix < row; ix++) {
      const u = (ix * cell - half) / half;
      // Domain warp keeps ridges from looking grid-aligned.
      const wu = u + 0.09 * fbm(noiseB, u * 1.6 + 3.1, v * 1.6 - 1.7, 3);
      const wv = v + 0.09 * fbm(noiseB, u * 1.6 - 5.3, v * 1.6 + 2.9, 3);
      const r = ridged(noiseA, wu * 1.8, wv * 1.8, 6);
      const rFine = ridged(noiseC, wu * 4.8, wv * 4.8, 3);
      rFineArr[iz * row + ix] = rFine;
      rArr[iz * row + ix] = r;

      // Foothills everywhere, easing down towards the tile edges.
      const edge = Math.max(Math.abs(u), Math.abs(v));
      let height = (0.03 + 0.16 * r) * (1 - smoothstep(0.7, 1.0, edge) * 0.65);

      for (const p of PEAKS) {
        const d = Math.hypot(u - p.u, v - p.v);
        if (d >= p.r) continue;
        const cone = Math.pow(1 - d / p.r, p.k);
        height = smax(height, p.a * cone * (0.42 + 0.58 * r) + 0.03 * rFine * cone, 0.06);
      }

      // Main massif: a pyramidal summit (polygonal distance → faces + arêtes, one of
      // which runs down to High Camp) on a broad ridged base.
      const ds = Math.hypot(u - SUMMIT.u, v - SUMMIT.v);
      // Log-sum-exp soft max of the face planes: arêtes stay crisp but are rounded to ~1.5 cells.
      let lse = 0;
      for (let f = 0; f < FACE_NORMALS.length; f += 2) {
        lse += Math.exp(55 * ((wu - SUMMIT.u) * FACE_NORMALS[f] + (wv - SUMMIT.v) * FACE_NORMALS[f + 1]));
      }
      const dPoly = Math.log(lse) / 55;
      const dp = 0.3 * ds + 0.7 * dPoly;
      const pyramid = Math.pow(Math.max(0, 1 - dp / 0.75), 1.25) * (0.82 + 0.18 * r) + 0.03 * rFine;
      const broad = Math.pow(Math.max(0, 1 - ds / 1.05), 1.6) * (0.35 + 0.65 * r) * 0.55;
      height = smax(height, smax(pyramid, broad, 0.1), 0.08);
      height *= 1 - 0.92 * smoothstep(0.7, 0.97, edge);
      h[iz * row + ix] = height;
      if (height > sMax) sMax = height;
    }
  }

  // Pass 2 — normalise to the summit, then add the designed features (summit-relative).
  const glacier = new Float32Array(count);
  let sIdx = 0;
  let sBest = -1;
  for (let iz = 0; iz < row; iz++) {
    const v = (iz * cell - half) / half;
    for (let ix = 0; ix < row; ix++) {
      const u = (ix * cell - half) / half;
      const i = iz * row + ix;
      const rFine = rFineArr[i];
      let height = h[i] / sMax;

      // The arête the route follows: High Camp shoulder → summit.
      const dA0 = segDist(u, v, HIGH.u, HIGH.v, SUMMIT.u, SUMMIT.v);
      const dA = Math.sqrt(dA0 * dA0 + 0.00025) - 0.0158; // rounded crest (~1.5 cells)
      if (dA < 0.3) {
        const crest = hHigh + 0.02 + (0.985 - hHigh - 0.02) * Math.pow(segT, 1.3);
        const profile = Math.pow(1 - dA / 0.3, 1.9);
        height = smax(height, crest * profile * (0.95 + 0.05 * rFine), 0.04);
      }

      // The face: a broad, steep ramp from the basin head up to the shoulder.
      const fLen2 = faceDx * faceDx + faceDz * faceDz;
      const ft = ((u - FACE_FOOT.u) * faceDx + (v - FACE_FOOT.v) * faceDz) / fLen2;
      if (ft > -0.3 && ft < 1.15) {
        const dF = segDist(u, v, FACE_FOOT.u, FACE_FOOT.v, HIGH.u, HIGH.v);
        const lateral = smoothstep(0.2, 0.06, dF);
        if (lateral > 0) {
          const ramp = 0.35 + (hHigh - 0.01 - 0.35) * Math.pow(Math.min(1, Math.max(0, ft)), 0.95);
          // Rock ribs and runnels so the face doesn't read as one smooth sheet.
          const ribs = 0.07 * (rArr[i] - 0.5) + 0.035 * (rFine - 0.5);
          height = smax(height, (ramp + ribs) * lateral, 0.05);
        }
      }

      // Valley glacier: a flattened channel that rises in steps to the basin.
      let best = 1e9;
      let floor = 0;
      let width = 0.1;
      for (let k = 0; k < GLACIER.length - 1; k++) {
        const a = GLACIER[k];
        const b = GLACIER[k + 1];
        const d = segDist(u, v, a.u, a.v, b.u, b.v);
        if (d < best) {
          best = d;
          floor = a.h + (b.h - a.h) * segT;
          width = a.w + (b.w - a.w) * segT;
        }
      }
      const g = smoothstep(width, width * 0.3, best);
      // U-shaped walls first (so the valley never floats above its surroundings)…
      const wallFade = smoothstep(width * 2.6, width * 1.2, best);
      if (wallFade > 0) {
        const wallH = floor + 0.22 * smoothstep(width * 0.5, width * 2.2, best);
        height += (Math.max(height, wallH) - height) * wallFade;
      }
      // …then the glacier floor itself.
      if (g > 0) {
        const bumpy = floor + 0.01 * fbm(noiseC, u * 9, v * 9, 3) + 0.008 * (1 - rFine);
        height += (bumpy - height) * g;
        // Lateral moraine ridges on the glacier margins.
        height += 0.012 * smoothstep(0.2, 0.55, g) * smoothstep(1, 0.6, g);
      }
      glacier[i] = g;
      h[i] = height;
      if (height > sBest) {
        sBest = height;
        sIdx = i;
      }
    }
  }
  const summitU = ((sIdx % row) * cell - half) / half;
  const summitV = (Math.floor(sIdx / row) * cell - half) / half;

  // Camp platforms at altitude-consistent heights.
  const plan: P2[] = ROUTE_PLAN.map((p) =>
    p.campId === 'summit' ? { u: summitU, v: summitV, campId: 'summit' } : p,
  );
  for (const p of plan) {
    if (!p.campId || p.campId === 'summit') continue;
    const target = campHeight(p.campId, BASE_H) * sBest;
    const radius = 0.04;
    for (let iz = 0; iz < row; iz++) {
      const v = (iz * cell - half) / half;
      if (Math.abs(v - p.v) > radius) continue;
      for (let ix = 0; ix < row; ix++) {
        const u = (ix * cell - half) / half;
        const w = smoothstep(radius, radius * 0.25, Math.hypot(u - p.u, v - p.v));
        if (w > 0) h[iz * row + ix] += (target - h[iz * row + ix]) * w;
      }
    }
  }

  // World units (summit = heightScale).
  const heights = new Float32Array(count);
  const k = heightScale / sBest;
  for (let i = 0; i < count; i++) heights[i] = h[i] * k;

  // Normals (central differences).
  const normals = new Float32Array(count * 3);
  const at = (ix: number, iz: number) =>
    heights[Math.min(n, Math.max(0, iz)) * row + Math.min(n, Math.max(0, ix))];
  for (let iz = 0; iz < row; iz++) {
    for (let ix = 0; ix < row; ix++) {
      const dx = (at(ix + 1, iz) - at(ix - 1, iz)) / (2 * cell);
      const dz = (at(ix, iz + 1) - at(ix, iz - 1)) / (2 * cell);
      const len = Math.sqrt(dx * dx + 1 + dz * dz);
      const o = (iz * row + ix) * 3;
      normals[o] = -dx / len;
      normals[o + 1] = 1 / len;
      normals[o + 2] = -dz / len;
    }
  }

  const heightAt = surfaceSampler(heights, n, size);

  // Bake: soft sun visibility (heightfield ray march), cavity, glacier mask.
  const sunDir = sunDirection();
  const bake = new Float32Array(count * 3);
  const blur = boxBlur(heights, row, 3);
  for (let iz = 0; iz < row; iz++) {
    for (let ix = 0; ix < row; ix++) {
      const i = iz * row + ix;
      const x = ix * cell - half;
      const z = iz * cell - half;
      const y = heights[i] + 0.5;
      let vis = 1;
      let t = cell * 0.6;
      while (t < 900) {
        const px = x + sunDir[0] * t;
        const pz = z + sunDir[2] * t;
        if (px < -half || px > half || pz < -half || pz > half) break;
        vis = Math.min(vis, (10 * (y + sunDir[1] * t - heightAt(px, pz))) / t);
        if (vis <= 0) break;
        t += Math.max(cell * 0.6, t * 0.06);
      }
      vis = Math.max(0, Math.min(1, vis));
      bake[i * 3] = vis * vis * (3 - 2 * vis);
      bake[i * 3 + 1] = Math.max(0, Math.min(1, (blur[i] - heights[i]) / 7));
      bake[i * 3 + 2] = glacier[i];
    }
  }

  const waypoints = plan.map((p) => ({ x: p.u * half, z: p.v * half, campId: p.campId }));
  const campPoints: CampPoint[] = waypoints
    .filter((p) => p.campId)
    .map((p) => ({ id: p.campId as string, x: p.x, y: heightAt(p.x, p.z), z: p.z }));

  return {
    n,
    size,
    heights,
    normals,
    bake,
    maxHeight: heightScale,
    baseHeight: BASE_H * heightScale,
    waypoints,
    camps: campPoints,
    sunDir,
  };
}

/** Height of the triangulated surface, using THREE.PlaneGeometry's diagonal split. */
function surfaceSampler(heights: Float32Array, n: number, size: number) {
  const half = size / 2;
  const cell = size / n;
  const row = n + 1;
  return (x: number, z: number): number => {
    const fx = Math.min(n - 1e-6, Math.max(0, (x + half) / cell));
    const fz = Math.min(n - 1e-6, Math.max(0, (z + half) / cell));
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const a = heights[iz * row + ix];
    const d = heights[iz * row + ix + 1];
    const b = heights[(iz + 1) * row + ix];
    const c = heights[(iz + 1) * row + ix + 1];
    if (tx + tz <= 1) return a + (d - a) * tx + (b - a) * tz;
    return c + (b - c) * (1 - tx) + (d - c) * (1 - tz);
  };
}

/** Adds the sampling helpers to generator output (after a worker round-trip). */
export function wrapHeightfield(data: HeightfieldData): Heightfield {
  const first = camps[0].alt;
  const span = camps[camps.length - 1].alt - first;
  return {
    ...data,
    half: data.size / 2,
    cell: data.size / data.n,
    heightAt: surfaceSampler(data.heights, data.n, data.size),
    altitudeAt: (y: number) => first + ((y - data.baseHeight) / (data.maxHeight - data.baseHeight)) * span,
  };
}

/** Separable box blur (radius in cells) — used for the cavity term. */
function boxBlur(src: Float32Array, row: number, radius: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const span = radius * 2 + 1;
  for (let z = 0; z < row; z++) {
    for (let x = 0; x < row; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += src[z * row + Math.min(row - 1, Math.max(0, x + k))];
      tmp[z * row + x] = s / span;
    }
  }
  for (let z = 0; z < row; z++) {
    for (let x = 0; x < row; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += tmp[Math.min(row - 1, Math.max(0, z + k)) * row + x];
      out[z * row + x] = s / span;
    }
  }
  return out;
}
