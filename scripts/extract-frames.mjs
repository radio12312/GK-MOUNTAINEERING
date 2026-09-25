#!/usr/bin/env node
/**
 * Frame pipeline: raw/*.mp4 → WebP image sequences, stills, LQIPs, manifest and hero video.
 *
 *   npm run frames                 # everything
 *   npm run frames -- 02-icefall   # only the named clip(s) (+ manifest refresh)
 *   npm run frames -- --no-hero    # skip hero video encoding
 *
 * Requires ffmpeg + ffprobe on PATH.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'raw');
const PUBLIC = path.join(ROOT, 'public');

// ---------------------------------------------------------------------------
// Config — edit here, then rerun.
// ---------------------------------------------------------------------------
const CONFIG = {
  trimStart: 0.15, // seconds cut from the start of each clip (AI clips glitch at the edges)
  trimEnd: 0.15,
  clips: [
    { name: '01-basecamp', fps: 15, desktopQuality: 68 }, // busiest clip (tents, people) — keeps it under the 12 MB budget
    { name: '02-icefall', fps: 15 },
    { name: '03-summit-push', fps: 15 },
    { name: '04-summit', fps: 15 },
  ],
  desktop: { width: 1600, quality: 72 },
  mobile: { width: 720, quality: 68 }, // 9:16 centre crop
  lqip: { width: 32, blur: 1.2, quality: 40 },
  stills: { count: 6, width: 1920, quality: 82 },
  warnDesktopMB: 12,
  hero: {
    source: 'hero-loop.mp4', // optional; falls back to the first 4 s of the first clip
    fallbackSeconds: 4,
    fallbackSlowdown: 1.6, // >1 = slower
    crossfade: 0.8, // seconds, baked into the file so native <video loop> is seamless
    maxBytes: 3 * 1024 * 1024,
    width: 1280,
  },
};

// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const onlyClips = args.filter((a) => !a.startsWith('--'));
const skipHero = args.includes('--no-hero');

function which(bin) {
  const r = spawnSync(bin, ['-version'], { encoding: 'utf8' });
  return r.status === 0;
}

if (!which('ffmpeg') || !which('ffprobe')) {
  console.error(`
  ffmpeg / ffprobe not found on PATH.

  Install it, then rerun \`npm run frames\`:
    Windows:  winget install Gyan.FFmpeg      (or: choco install ffmpeg)
    macOS:    brew install ffmpeg
    Linux:    sudo apt install ffmpeg         (or your distro's package)
`);
  process.exit(1);
}

function run(bin, argv, { quiet = true } = {}) {
  const r = spawnSync(bin, ['-hide_banner', ...(quiet ? ['-loglevel', 'error'] : []), ...argv], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.error(r.stderr);
    throw new Error(`${bin} failed: ${argv.join(' ')}`);
  }
  return r.stdout;
}

function probe(file) {
  const out = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file],
    { encoding: 'utf8' },
  );
  const j = JSON.parse(out.stdout);
  return { duration: parseFloat(j.format.duration), width: j.streams[0].width, height: j.streams[0].height };
}

const rmrf = (p) => fs.rmSync(p, { recursive: true, force: true });
const mkdirp = (p) => fs.mkdirSync(p, { recursive: true });
const dirBytes = (p) =>
  fs.existsSync(p) ? fs.readdirSync(p).reduce((s, f) => s + fs.statSync(path.join(p, f)).size, 0) : 0;
const mb = (b) => (b / 1024 / 1024).toFixed(2) + ' MB';
const webp = (q) => ['-c:v', 'libwebp', '-quality', String(q), '-compression_level', '5', '-preset', 'photo'];

// ---------------------------------------------------------------------------
// Clips
// ---------------------------------------------------------------------------
const manifestPath = path.join(PUBLIC, 'frames', 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
const probes = {};

for (const clip of CONFIG.clips) {
  const src = path.join(RAW, `${clip.name}.mp4`);
  if (!fs.existsSync(src)) {
    console.error(`Missing ${path.relative(ROOT, src)}`);
    process.exit(1);
  }
  probes[clip.name] = probe(src);
  if (onlyClips.length && !onlyClips.includes(clip.name)) continue;

  const { duration } = probes[clip.name];
  const len = Math.max(0.1, duration - CONFIG.trimStart - CONFIG.trimEnd);
  const out = path.join(PUBLIC, 'frames', clip.name);
  const dDir = path.join(out, 'desktop');
  const mDir = path.join(out, 'mobile');
  rmrf(out);
  mkdirp(dDir);
  mkdirp(mDir);

  process.stdout.write(`▸ ${clip.name}  ${len.toFixed(2)}s @ ${clip.fps}fps … `);
  const trim = ['-ss', String(CONFIG.trimStart), '-i', src, '-t', len.toFixed(3), '-an'];

  run('ffmpeg', [
    ...trim,
    '-vf', `fps=${clip.fps},scale=${CONFIG.desktop.width}:-2:flags=lanczos`,
    ...webp(clip.desktopQuality ?? CONFIG.desktop.quality),
    path.join(dDir, '%04d.webp'),
  ]);
  run('ffmpeg', [
    ...trim,
    '-vf', `fps=${clip.fps},crop=trunc(ih*9/16/2)*2:ih,scale=${CONFIG.mobile.width}:-2:flags=lanczos`,
    ...webp(clip.mobileQuality ?? CONFIG.mobile.quality),
    path.join(mDir, '%04d.webp'),
  ]);

  const frames = fs.readdirSync(dDir).filter((f) => f.endsWith('.webp')).sort();
  const mFrames = fs.readdirSync(mDir).filter((f) => f.endsWith('.webp')).sort();
  // Keep both sets the same length so indices line up.
  const count = Math.min(frames.length, mFrames.length);
  for (const f of frames.slice(count)) fs.rmSync(path.join(dDir, f));
  for (const f of mFrames.slice(count)) fs.rmSync(path.join(mDir, f));

  fs.copyFileSync(path.join(dDir, frames[0]), path.join(out, 'poster.webp'));
  fs.copyFileSync(path.join(dDir, frames[count - 1]), path.join(out, 'end.webp'));

  // LQIP: tiny blurred WebP, inlined as base64.
  const tmp = path.join(os.tmpdir(), `lqip-${clip.name}-${process.pid}.webp`);
  run('ffmpeg', [
    '-y', '-i', path.join(dDir, frames[0]),
    '-vf', `scale=${CONFIG.lqip.width}:-2,gblur=sigma=${CONFIG.lqip.blur}`,
    ...webp(CONFIG.lqip.quality),
    tmp,
  ]);
  const lqip = `data:image/webp;base64,${fs.readFileSync(tmp).toString('base64')}`;
  fs.rmSync(tmp, { force: true });

  const dProbe = probe(path.join(dDir, frames[0]));
  const mProbe = probe(path.join(mDir, frames[0]));
  manifest[clip.name] = {
    fps: clip.fps,
    count,
    width: dProbe.width,
    height: dProbe.height,
    mobile: { width: mProbe.width, height: mProbe.height },
    lqip,
  };

  const dBytes = dirBytes(dDir);
  const mBytes = dirBytes(mDir);
  console.log(`${count} frames · desktop ${mb(dBytes)} · mobile ${mb(mBytes)}`);
  if (dBytes > CONFIG.warnDesktopMB * 1024 * 1024) {
    console.warn(`  ⚠ desktop set exceeds ${CONFIG.warnDesktopMB} MB — lower fps or quality for ${clip.name}`);
  }
}

// Drop manifest entries for clips no longer in config.
for (const k of Object.keys(manifest)) if (!CONFIG.clips.some((c) => c.name === k)) delete manifest[k];
mkdirp(path.dirname(manifestPath));
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`✔ ${path.relative(ROOT, manifestPath)}`);

// ---------------------------------------------------------------------------
// Stills: evenly spaced across the combined (trimmed) timeline of all clips.
// ---------------------------------------------------------------------------
if (!onlyClips.length) {
  const stillsDir = path.join(PUBLIC, 'stills');
  rmrf(stillsDir);
  mkdirp(stillsDir);
  const spans = CONFIG.clips.map((c) => ({
    name: c.name,
    len: probes[c.name].duration - CONFIG.trimStart - CONFIG.trimEnd,
  }));
  const total = spans.reduce((s, c) => s + c.len, 0);
  const stills = [];
  for (let i = 0; i < CONFIG.stills.count; i++) {
    let t = ((i + 0.5) / CONFIG.stills.count) * total;
    let span = spans[0];
    for (const s of spans) {
      span = s;
      if (t < s.len - 0.05) break;
      t -= s.len;
    }
    t = Math.min(Math.max(t, 0), span.len - 0.05);
    const file = `still-${i + 1}.webp`;
    run('ffmpeg', [
      '-ss', (CONFIG.trimStart + t).toFixed(3),
      '-i', path.join(RAW, `${span.name}.mp4`),
      '-frames:v', '1',
      '-vf', `scale=${CONFIG.stills.width}:-2:flags=lanczos`,
      ...webp(CONFIG.stills.quality),
      path.join(stillsDir, file),
    ]);
    stills.push({ file, clip: span.name, time: +t.toFixed(2) });
  }
  fs.writeFileSync(path.join(stillsDir, 'stills.json'), JSON.stringify(stills, null, 2));
  console.log(`✔ ${stills.length} stills → public/stills  (${mb(dirBytes(stillsDir))})`);
  for (const s of stills) console.log(`   ${s.file}  ${s.clip} @ ${s.time}s`);
}

// ---------------------------------------------------------------------------
// Hero video: muted, seamless loop (crossfade baked in), MP4 + WebM under maxBytes.
// ---------------------------------------------------------------------------
if (!skipHero && !onlyClips.length) {
  const videoDir = path.join(PUBLIC, 'video');
  mkdirp(videoDir);
  const H = CONFIG.hero;
  const heroSrc = path.join(RAW, H.source);
  let input;
  let D;
  let pre = '';
  if (fs.existsSync(heroSrc)) {
    input = ['-i', heroSrc];
    D = probe(heroSrc).duration;
    console.log(`▸ hero from ${H.source} (${D.toFixed(1)}s)`);
  } else {
    const first = path.join(RAW, `${CONFIG.clips[0].name}.mp4`);
    input = ['-ss', String(CONFIG.trimStart), '-t', String(H.fallbackSeconds), '-i', first];
    D = H.fallbackSeconds * H.fallbackSlowdown;
    pre = `setpts=${H.fallbackSlowdown}*PTS,`;
    console.log(`▸ hero fallback: first ${H.fallbackSeconds}s of ${CONFIG.clips[0].name}, slowed ×${H.fallbackSlowdown}`);
  }
  const X = H.crossfade;
  // main = [X, D], head = [0, X]; fading main's tail into head makes the output end on
  // source frame X, which is exactly where it starts.
  const graph =
    `[0:v]${pre}fps=24,scale=${H.width}:-2:flags=lanczos,format=yuv420p,split[a][b];` +
    `[a]trim=start=${X}:end=${D},setpts=PTS-STARTPTS[main];` +
    `[b]trim=start=0:end=${X},setpts=PTS-STARTPTS[head];` +
    `[main][head]xfade=transition=fade:duration=${X}:offset=${(D - 2 * X).toFixed(3)}[v]`;

  const encode = (file, codecArgs) => {
    run('ffmpeg', ['-y', ...input, '-filter_complex', graph, '-map', '[v]', '-an', ...codecArgs, file]);
    return fs.statSync(file).size;
  };

  const mp4 = path.join(videoDir, 'hero.mp4');
  for (let crf = 24; crf <= 36; crf += 2) {
    const size = encode(mp4, [
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-maxrate', '3M', '-bufsize', '6M',
      '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    ]);
    console.log(`  hero.mp4  crf ${crf} → ${mb(size)}`);
    if (size <= H.maxBytes) break;
  }
  const webm = path.join(videoDir, 'hero.webm');
  for (let crf = 34; crf <= 50; crf += 4) {
    const size = encode(webm, [
      '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(crf), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
      '-pix_fmt', 'yuv420p',
    ]);
    console.log(`  hero.webm crf ${crf} → ${mb(size)}`);
    if (size <= H.maxBytes) break;
  }
  run('ffmpeg', ['-y', '-i', mp4, '-frames:v', '1', '-vf', 'scale=1600:-2:flags=lanczos', ...webp(70), path.join(videoDir, 'hero-poster.webp')]);
  console.log(`✔ hero → public/video (${mb(dirBytes(videoDir))})`);
}

// ---------------------------------------------------------------------------
console.log('\nSize report');
let grand = 0;
for (const clip of CONFIG.clips) {
  const out = path.join(PUBLIC, 'frames', clip.name);
  const d = dirBytes(path.join(out, 'desktop'));
  const m = dirBytes(path.join(out, 'mobile'));
  grand += d + m + dirBytes(out);
  console.log(`  ${clip.name.padEnd(16)} desktop ${mb(d).padStart(9)}   mobile ${mb(m).padStart(9)}`);
}
console.log(`  total frames on disk: ${mb(grand)}`);
