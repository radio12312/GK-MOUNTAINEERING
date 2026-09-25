/**
 * Generates public/topo.svg — a seamlessly tiling topographic contour texture.
 *
 *   node scripts/gen-topo.mjs
 *
 * Height field: a sum of cosine waves with integer wave numbers over the tile, so the
 * field (and therefore every contour) wraps perfectly at the tile edges. Contours are
 * traced with marching squares, joined into polylines, simplified (Douglas–Peucker)
 * and written as relative path commands. Every fifth level is an "index contour"
 * drawn slightly heavier, like a survey map.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SIZE = 1400; // tile size in px (matches background-size in base.css)
const N = 200; // grid cells per side
const LEVELS = 20;
const SEED = 11;
const TOLERANCE = 1.1; // simplification tolerance in px

// --- deterministic PRNG ---------------------------------------------------
let s = SEED >>> 0;
const rand = () => {
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// --- tileable smooth field ------------------------------------------------
const waves = [];
for (let kx = -7; kx <= 7; kx++) {
  for (let ky = 0; ky <= 7; ky++) {
    if (ky === 0 && kx <= 0) continue; // skip DC + mirrored duplicates
    const k = Math.hypot(kx, ky);
    if (k > 7.3) continue;
    waves.push({ kx, ky, a: (rand() * 0.6 + 0.7) / Math.pow(k, 2.05), p: rand() * Math.PI * 2 });
  }
}
const field = (x, y) => {
  let v = 0;
  for (const w of waves) v += w.a * Math.cos((2 * Math.PI * (w.kx * x + w.ky * y)) / SIZE + w.p);
  return v;
};

const step = SIZE / N;
const g = new Float64Array((N + 1) * (N + 1));
let min = Infinity;
let max = -Infinity;
for (let j = 0; j <= N; j++) {
  for (let i = 0; i <= N; i++) {
    // exact wrap: last row/col equals first
    const v = field((i % N) * step, (j % N) * step);
    g[j * (N + 1) + i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
}
const at = (i, j) => g[j * (N + 1) + i];

// --- marching squares with edge-keyed joins -------------------------------
// Edge ids: horizontal edge (i,j)->(i+1,j) = 'h:i:j', vertical (i,j)->(i,j+1) = 'v:i:j'
function trace(level) {
  const pts = new Map(); // edgeKey -> [x, y]
  const adj = new Map(); // edgeKey -> edgeKey[]
  const point = (key, x0, y0, v0, x1, y1, v1) => {
    if (!pts.has(key)) {
      const t = (level - v0) / (v1 - v0);
      pts.set(key, [(x0 + (x1 - x0) * t) * step, (y0 + (y1 - y0) * t) * step]);
    }
    return key;
  };
  const link = (a, b) => {
    (adj.get(a) ?? adj.set(a, []).get(a)).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)).push(a);
  };
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      const code = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const top = () => point(`h:${i}:${j}`, i, j, a, i + 1, j, b);
      const right = () => point(`v:${i + 1}:${j}`, i + 1, j, b, i + 1, j + 1, c);
      const bottom = () => point(`h:${i}:${j + 1}`, i, j + 1, d, i + 1, j + 1, c);
      const left = () => point(`v:${i}:${j}`, i, j, a, i, j + 1, d);
      const center = (a + b + c + d) / 4;
      switch (code) {
        case 1: case 14: link(left(), bottom()); break;
        case 2: case 13: link(bottom(), right()); break;
        case 3: case 12: link(left(), right()); break;
        case 4: case 11: link(top(), right()); break;
        case 6: case 9: link(top(), bottom()); break;
        case 7: case 8: link(left(), top()); break;
        case 5:
          if (center > level) { link(left(), top()); link(bottom(), right()); }
          else { link(left(), bottom()); link(top(), right()); }
          break;
        case 10:
          if (center > level) { link(top(), right()); link(left(), bottom()); }
          else { link(left(), top()); link(bottom(), right()); }
          break;
      }
    }
  }
  // Walk chains: start from open ends first, then remaining loops.
  const seen = new Set();
  const lines = [];
  const walk = (start) => {
    const line = [start];
    seen.add(start);
    let cur = start;
    for (;;) {
      const next = (adj.get(cur) ?? []).find((n) => !seen.has(n));
      if (!next) break;
      seen.add(next);
      line.push(next);
      cur = next;
    }
    // closed loop?
    const closed = line.length > 2 && (adj.get(cur) ?? []).includes(start);
    return { pts: line.map((k) => pts.get(k)), closed };
  };
  for (const [k, n] of adj) if (n.length === 1 && !seen.has(k)) lines.push(walk(k));
  for (const k of adj.keys()) if (!seen.has(k)) lines.push(walk(k));
  return lines;
}

// --- simplification -------------------------------------------------------
function dp(points, tol) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s0, e0] = stack.pop();
    const [x1, y1] = points[s0];
    const [x2, y2] = points[e0];
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    let maxD = 0, idx = -1;
    for (let k = s0 + 1; k < e0; k++) {
      const [x, y] = points[k];
      const d = Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / len;
      if (d > maxD) { maxD = d; idx = k; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([s0, idx], [idx, e0]); }
  }
  return points.filter((_, k) => keep[k]);
}

const r = (v) => Math.round(v * 10) / 10;
function toPath({ pts, closed }) {
  let len = 0;
  for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  const onEdge = pts.some(([x, y]) => x < 0.5 || y < 0.5 || x > SIZE - 0.5 || y > SIZE - 0.5);
  if (len < 40 && !onEdge) return ''; // drop specks (edge pieces must stay for the wrap)
  let p;
  if (closed) {
    // A loop's start == end gives D-P a zero-length baseline: split at the farthest point.
    let m = 0, far = -1;
    pts.forEach(([x, y], k) => {
      const d = Math.hypot(x - pts[0][0], y - pts[0][1]);
      if (d > far) { far = d; m = k; }
    });
    p = [...dp(pts.slice(0, m + 1), TOLERANCE).slice(0, -1), ...dp([...pts.slice(m), pts[0]], TOLERANCE)];
  } else {
    p = dp(pts, TOLERANCE);
  }
  if (p.length < 3) return '';
  let d = `M${r(p[0][0])} ${r(p[0][1])}`;
  let px = r(p[0][0]), py = r(p[0][1]);
  let prevCmd = '';
  for (let k = 1; k < p.length; k++) {
    const x = r(p[k][0]), y = r(p[k][1]);
    const dx = r(x - px), dy = r(y - py);
    const seg = `${dx}${dy < 0 ? '' : ' '}${dy}`;
    d += prevCmd === 'l' ? (dx < 0 ? seg : ` ${seg}`) : `l${seg}`;
    prevCmd = 'l';
    px = x; py = y;
  }
  return closed ? d + 'z' : d;
}

const regular = [];
const index = [];
for (let l = 1; l <= LEVELS; l++) {
  const level = min + ((max - min) * l) / (LEVELS + 1);
  const d = trace(level).map(toPath).filter(Boolean).join('');
  (l % 5 === 0 ? index : regular).push(d);
}

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" fill="none" stroke="#EEF2F5" stroke-linejoin="round" stroke-linecap="round">` +
  `<path stroke-width="1" d="${regular.join('')}"/>` +
  `<path stroke-width="1.6" d="${index.join('')}"/>` +
  `</svg>\n`;

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/topo.svg');
writeFileSync(out, svg);
console.log(`topo.svg: ${(svg.length / 1024).toFixed(1)} KB, ${waves.length} waves, ${LEVELS} levels`);
