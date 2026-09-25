/**
 * The Route — route line + camera choreography, derived from the heightfield.
 * Everything here is precomputed once; the per-frame functions write into caller-owned
 * vectors and never allocate.
 */
import { CatmullRomCurve3, MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { route } from '../../config';
import type { Heightfield } from './heightfield';

const ROUTE_SAMPLES = 900;
const CAM_SAMPLES = 240;
const LINE_LIFT = 1.6; // world units above the surface

export interface RoutePaths {
  /** Route polyline on the surface, xyz per sample. */
  points: Float32Array;
  /** Normalised arc length per sample (0–1). */
  arc: Float32Array;
  count: number;
  /** Arc fraction of each stop's camp, in `route.stops` order. */
  campS: number[];
  campPos: Vector3[];
  summit: Vector3;
  /** Route progress t (config stop units) → arc fraction s. */
  sAt(t: number): number;
  /** Position on the route at arc fraction s. */
  pointAt(s: number, out: Vector3): Vector3;
  /** Number of whole polyline segments needed to reach arc fraction s. */
  segmentsTo(s: number): number;
  /** Smoothed flight camera at arc fraction s (unscaled offset). */
  flightAt(s: number, pos: Vector3, target: Vector3): void;
}

export function buildPaths(hf: Heightfield): RoutePaths {
  // --- Route line --------------------------------------------------------------------
  const controls = hf.waypoints.map((w) => new Vector3(w.x, hf.heightAt(w.x, w.z) + LINE_LIFT, w.z));
  const curve = new CatmullRomCurve3(controls, false, 'centripetal');
  const spaced = curve.getSpacedPoints(ROUTE_SAMPLES - 1);
  const count = spaced.length;
  const points = new Float32Array(count * 3);
  const arc = new Float32Array(count);
  let total = 0;
  // Hug the rendered surface between controls, low-passed so small ribs on the arête don't
  // turn the line into a saw blade; never dip below the surface.
  const ground = spaced.map((p) => hf.heightAt(p.x, p.z));
  const at = (i: number) => Math.min(count - 1, Math.max(0, i));
  const envelope = ground.map((_, i) => {
    let m = -Infinity;
    for (let k = -7; k <= 7; k++) m = Math.max(m, ground[at(i + k)]);
    return m;
  });
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let k = -7; k <= 7; k++) sum += envelope[at(i + k)];
    spaced[i].y = Math.max(sum / 15, ground[i]) + LINE_LIFT;
  }
  for (let i = 0; i < count; i++) {
    const p = spaced[i];
    points.set([p.x, p.y, p.z], i * 3);
    if (i > 0) total += p.distanceTo(spaced[i - 1]);
    arc[i] = total;
  }
  for (let i = 0; i < count; i++) arc[i] /= total;

  // Camps → arc fraction (search forward so order is preserved).
  const campS: number[] = [];
  const campPos: Vector3[] = [];
  let from = 0;
  for (const stop of route.stops) {
    const camp = hf.camps.find((c) => c.id === stop.campId);
    if (!camp) {
      campS.push(stop.t);
      campPos.push(new Vector3());
      continue;
    }
    let best = from;
    let bestD = Infinity;
    for (let i = from; i < count; i++) {
      const d = (points[i * 3] - camp.x) ** 2 + (points[i * 3 + 2] - camp.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    from = best;
    campS.push(arc[best]);
    campPos.push(new Vector3(points[best * 3], points[best * 3 + 1], points[best * 3 + 2]));
  }
  campS[0] = 0;
  campS[campS.length - 1] = 1;
  const summit = campPos[campPos.length - 1].clone();
  const stopT = route.stops.map((s) => s.t);

  const sAt = (t: number): number => {
    if (t <= stopT[0]) return campS[0];
    for (let k = 1; k < stopT.length; k++) {
      if (t <= stopT[k]) {
        const f = (t - stopT[k - 1]) / Math.max(1e-6, stopT[k] - stopT[k - 1]);
        return campS[k - 1] + (campS[k] - campS[k - 1]) * f;
      }
    }
    return 1;
  };

  /** Binary search: arc[lo] <= s <= arc[lo + 1]. */
  const search = (s: number): number => {
    let lo = 0;
    let hi = count - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (arc[mid] < s) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  const segmentsTo = (s: number): number => (s <= 0 ? 0 : s >= 1 ? count - 1 : search(s) + 1);

  const pointAt = (s: number, out: Vector3): Vector3 => {
    s = MathUtils.clamp(s, 0, 1);
    const lo = search(s);
    const hi = lo + 1;
    const f = (s - arc[lo]) / Math.max(1e-9, arc[hi] - arc[lo]);
    const a = lo * 3;
    const b = hi * 3;
    return out.set(
      points[a] + (points[b] - points[a]) * f,
      points[a + 1] + (points[b + 1] - points[a + 1]) * f,
      points[a + 2] + (points[b + 2] - points[a + 2]) * f,
    );
  };

  // --- Flight camera -------------------------------------------------------------------
  const { back, up, side } = route.camera.flight;
  const M = CAM_SAMPLES;
  const centre = new Float32Array(M * 3);
  const dir = new Float32Array(M * 2);
  const camPos = new Float32Array(M * 3);
  const camTgt = new Float32Array(M * 3);
  const a = new Vector3();
  const b = new Vector3();

  for (let j = 0; j < M; j++) {
    const s = j / (M - 1);
    pointAt(s, a);
    centre.set([a.x, a.y, a.z], j * 3);
    pointAt(s + 0.1, b);
    pointAt(s - 0.06, a);
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    // Near the top the look direction eases toward the summit.
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    dir[j * 2] = dx;
    dir[j * 2 + 1] = dz;
    // Look target: slightly ahead of the drawing tip, nudged toward the summit.
    // Early on, look up the valley at the massif; later, just ahead of the tip.
    pointAt(s + 0.035, b);
    b.y += 4;
    // Open on base camp itself (its label must be in frame), then ease the summit pull in.
    const ramp = Math.min(1, s / 0.12);
    b.lerp(summit, 0.03 + 0.18 * (1 - s) ** 3 * ramp * ramp * (3 - 2 * ramp));
    camTgt.set([b.x, b.y, b.z], j * 3);
  }
  gaussian(centre, 3, 12);
  gaussian(dir, 2, 22);
  for (let j = 0; j < M; j++) {
    let dx = dir[j * 2];
    let dz = dir[j * 2 + 1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // right-hand vector of the travel direction (x east, z south): (-dz, dx)
    // Higher up the mountain the camera drops closer to the climber's level.
    const s = j / (M - 1);
    const u = up * (1 - 0.55 * s);
    const bk = back * (1 + 0.15 * s);
    camPos[j * 3] = centre[j * 3] - dx * bk - dz * side;
    camPos[j * 3 + 1] = centre[j * 3 + 1] + u;
    camPos[j * 3 + 2] = centre[j * 3 + 2] - dz * bk + dx * side;
  }
  const clearance = () => {
    for (let j = 0; j < M; j++) {
      const o = j * 3;
      a.set(camPos[o], camPos[o + 1], camPos[o + 2]);
      b.set(camTgt[o], camTgt[o + 1], camTgt[o + 2]);
      let y = Math.max(a.y, maxAround(hf, a.x, a.z, 36) + 32);
      // Keep the line of sight above the ridges in between.
      for (let iter = 0; iter < 30; iter++) {
        a.y = y;
        let blocked = false;
        for (let k = 1; k < 8; k++) {
          const f = k / 8;
          const x = a.x + (b.x - a.x) * f;
          const z = a.z + (b.z - a.z) * f;
          if (a.y + (b.y - a.y) * f < hf.heightAt(x, z) + 10) {
            blocked = true;
            break;
          }
        }
        if (!blocked) break;
        y += 8;
      }
      camPos[o + 1] = y;
    }
  };
  gaussian(camTgt, 3, 10);
  clearance();
  gaussian(camPos, 3, 10);
  clearance();
  gaussian(camPos, 3, 4);

  const flightAt = (s: number, pos: Vector3, target: Vector3) => {
    const f = MathUtils.clamp(s, 0, 1) * (M - 1);
    const i = Math.min(M - 2, Math.floor(f));
    const t = f - i;
    const o = i * 3;
    pos.set(
      camPos[o] + (camPos[o + 3] - camPos[o]) * t,
      camPos[o + 1] + (camPos[o + 4] - camPos[o + 1]) * t,
      camPos[o + 2] + (camPos[o + 5] - camPos[o + 2]) * t,
    );
    target.set(
      camTgt[o] + (camTgt[o + 3] - camTgt[o]) * t,
      camTgt[o + 1] + (camTgt[o + 4] - camTgt[o + 1]) * t,
      camTgt[o + 2] + (camTgt[o + 5] - camTgt[o + 2]) * t,
    );
  };

  return { points, arc, count, campS, campPos, summit, sAt, pointAt, segmentsTo, flightAt };
}

/** Highest terrain point within radius r (coarse ring sampling). */
function maxAround(hf: Heightfield, x: number, z: number, r: number): number {
  let m = hf.heightAt(x, z);
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * Math.PI * 2;
    m = Math.max(m, hf.heightAt(x + Math.cos(ang) * r, z + Math.sin(ang) * r));
    m = Math.max(m, hf.heightAt(x + Math.cos(ang) * r * 0.5, z + Math.sin(ang) * r * 0.5));
  }
  return m;
}

/** In-place gaussian smoothing of an interleaved array (stride = components). */
function gaussian(arr: Float32Array, stride: number, radius: number): void {
  const n = arr.length / stride;
  const src = arr.slice();
  const sigma = radius / 2;
  const w: number[] = [];
  for (let k = -radius; k <= radius; k++) w.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < stride; c++) {
      let sum = 0;
      let ws = 0;
      for (let k = -radius; k <= radius; k++) {
        const j = Math.min(n - 1, Math.max(0, i + k)); // clamp: ends stay anchored
        sum += src[j * stride + c] * w[k + radius];
        ws += w[k + radius];
      }
      arr[i * stride + c] = sum / ws;
    }
  }
}

// --- Framing -----------------------------------------------------------------------------

/** Vertical FOV + pull-back factor for an aspect ratio (portrait widens, then backs off). */
export function framing(aspect: number): { fov: number; pullback: number } {
  const { fov, maxFov, minHorizontalFov } = route.camera;
  const needTan = Math.tan(MathUtils.degToRad(minHorizontalFov / 2)) / aspect;
  let vfov = Math.max(fov, MathUtils.radToDeg(2 * Math.atan(needTan)));
  vfov = Math.min(vfov, maxFov);
  const haveTan = Math.tan(MathUtils.degToRad(vfov / 2));
  return { fov: vfov, pullback: Math.min(1.9, Math.max(1, needTan / haveTan)) };
}

const _cam = new PerspectiveCamera();
const _v = new Vector3();
const _right = new Vector3();
const _up = new Vector3();

/**
 * Final wide "hero" pose: fixed bearing + gentle downward pitch (so there is sky above the
 * summit), with the position solved so the whole route fills the lower part of the frame
 * for this aspect ratio.
 */
export function heroPose(paths: RoutePaths, aspect: number, fov: number, pos: Vector3, target: Vector3): void {
  const { azimuthDeg, pitchDeg } = route.camera.hero;
  const az = MathUtils.degToRad(azimuthDeg);
  const pitch = MathUtils.degToRad(pitchDeg);
  // Forward = from the camera toward the scene (the camera sits on bearing `az`).
  const fx = -Math.sin(az) * Math.cos(pitch);
  const fy = -Math.sin(pitch);
  const fz = Math.cos(az) * Math.cos(pitch);

  const step = Math.max(1, Math.floor(paths.count / 60));
  const fitPts: Vector3[] = [];
  for (let i = 0; i < paths.count; i += step) {
    fitPts.push(new Vector3(paths.points[i * 3], paths.points[i * 3 + 1], paths.points[i * 3 + 2]));
  }
  fitPts.push(paths.summit.clone().setY(paths.summit.y + 30));
  const centroid = new Vector3();
  for (const p of fitPts) centroid.add(p);
  centroid.divideScalar(fitPts.length);

  _cam.fov = fov;
  _cam.aspect = aspect;
  _cam.near = 1;
  _cam.far = 8000;
  _cam.updateProjectionMatrix();

  const portrait = aspect < 1;
  const mx = portrait ? 0.84 : 0.7;
  // Keep the route's low end (base camp) above the stage's faded bottom 12%, where labels hide.
  const yLo = portrait ? -0.52 : -0.62;
  const yHi = portrait ? 0.22 : 0.36;
  const ext = [0, 0, 0, 0];
  const measure = (camPos: Vector3) => {
    _cam.position.copy(camPos);
    _cam.lookAt(camPos.x + fx, camPos.y + fy, camPos.z + fz);
    _cam.updateMatrixWorld();
    ext[0] = ext[2] = Infinity;
    ext[1] = ext[3] = -Infinity;
    for (const p of fitPts) {
      _v.copy(p).project(_cam);
      ext[0] = Math.min(ext[0], _v.x);
      ext[1] = Math.max(ext[1], _v.x);
      ext[2] = Math.min(ext[2], _v.y);
      ext[3] = Math.max(ext[3], _v.y);
    }
  };

  const tanV = Math.tan(MathUtils.degToRad(fov / 2));
  const cam = new Vector3();
  const offset = new Vector3(); // lateral offset of the camera from the centroid's view line
  let d = 1000;
  for (let pass = 0; pass < 6; pass++) {
    let lo = 100;
    let hi = 6000;
    for (let it = 0; it < 24; it++) {
      d = (lo + hi) / 2;
      cam.set(centroid.x - fx * d, centroid.y - fy * d, centroid.z - fz * d).add(offset);
      measure(cam);
      const fits = ext[1] - ext[0] <= 2 * mx && ext[3] - ext[2] <= yHi - yLo;
      if (fits) hi = d;
      else lo = d;
    }
    d = hi;
    cam.set(centroid.x - fx * d, centroid.y - fy * d, centroid.z - fz * d).add(offset);
    measure(cam);
    // Slide the camera so the projected bounds sit in the target box.
    const dx = (ext[0] + ext[1]) / 2;
    const dy = (ext[2] + ext[3]) / 2 - (yLo + yHi) / 2;
    _right.setFromMatrixColumn(_cam.matrixWorld, 0);
    _up.setFromMatrixColumn(_cam.matrixWorld, 1);
    offset.addScaledVector(_right, dx * tanV * aspect * d).addScaledVector(_up, dy * tanV * d);
  }
  pos.copy(cam);
  target.set(cam.x + fx * d, cam.y + fy * d, cam.z + fz * d);
}

export interface StaticProjection {
  version: 1;
  width: number;
  height: number;
  /** [x, y, s] — image fractions + arc fraction along the route. */
  route: [number, number, number][];
  camps: { id: string; x: number; y: number; s: number }[];
}

/** Projects the route + camps for the static fallback (hero pose at the capture aspect). */
export function staticProjection(paths: RoutePaths, width: number, height: number): StaticProjection {
  const aspect = width / height;
  const { fov } = framing(aspect);
  const pos = new Vector3();
  const target = new Vector3();
  heroPose(paths, aspect, fov, pos, target);
  const cam = new PerspectiveCamera(fov, aspect, 1, 8000);
  cam.position.copy(pos);
  cam.lookAt(target);
  cam.updateMatrixWorld();
  const round = (n: number) => Math.round(n * 10000) / 10000;
  const toFrac = (p: Vector3): [number, number] => {
    _v.copy(p).project(cam);
    return [round((_v.x + 1) / 2), round((1 - _v.y) / 2)];
  };
  const out: [number, number, number][] = [];
  const step = Math.max(1, Math.floor(paths.count / 220));
  for (let i = 0; i < paths.count; i += step) {
    _v.set(paths.points[i * 3], paths.points[i * 3 + 1], paths.points[i * 3 + 2]);
    const [x, y] = toFrac(_v);
    out.push([x, y, round(paths.arc[i])]);
  }
  const last = paths.count - 1;
  if ((last % step) !== 0) {
    _v.set(paths.points[last * 3], paths.points[last * 3 + 1], paths.points[last * 3 + 2]);
    const [x, y] = toFrac(_v);
    out.push([x, y, 1]);
  }
  const camps = route.stops.map((stop, k) => {
    const [x, y] = toFrac(paths.campPos[k]);
    return { id: stop.campId, x, y, s: round(paths.campS[k]) };
  });
  return { version: 1, width, height, route: out, camps };
}
