# G&K — Build Plan

**Type:** landing-page (single static page, front-end-only form). **Stack:** Vite + vanilla TS, GSAP/ScrollTrigger, Lenis, Three.js.

## Source footage (probed)
All five clips: 1280×720, 24 fps, **8.0 s** (not 10 s). Trimmed to 7.7 s at 15 fps → **~115 frames per clip**.
`hero-loop.mp4` exists (prayer flags + peak), so it becomes the hero video. The first-4 s-of-01 fallback stays in the script.

## Phase 1: `scripts/extract-frames.mjs`
- Checks ffmpeg/ffprobe and prints install hints if missing. Per-clip config: fps, trim, sizes.
- Per clip: `public/frames/{clip}/desktop/0001.webp…` (1600w q72), `mobile/` (9:16 centre crop, 720w q68), `poster.webp`, `end.webp`, 32 px blurred LQIP as base64.
- `public/stills/still-1..6.webp`: 1920w q82, evenly spaced across the 4 clips' combined timeline.
- `public/frames/manifest.json` `{ clip: { fps, count, width, height, mobile:{width,height}, lqip } }`, a size report, and a warning above 12 MB.
- Hero: 0.8 s crossfade **baked into the file** (end blends into start) so native `loop` is seamless. Muted H.264 MP4 + VP9 WebM, each under 3 MB, in `public/video/`.

## Engine: `src/lib/FrameSequence.ts`
- One shared sticky canvas. Each chapter has a `FrameSequence` driven by its own ScrollTrigger range inside one tall CSS-sticky section (no pin-spacer, no layout shift).
- Fetching goes coarse to fine (poster → every 8th → 4th → 2nd → all) and keeps the compressed blobs (~80 KB each).
- Decoding uses `createImageBitmap` into a **byte-budgeted LRU** (desktop ~450 MB, mobile ~120 MB). Every-8th keyframes stay pinned, and the frames around the playhead are decoded ahead in the scroll direction. Reason: 460 decoded 1600×900 bitmaps would be about 2.6 GB.
- Missing frame → nearest decoded frame. Cover-fit math, DPR ≤ 2, rAF redraw only on index change, resize-aware, `onProgress()`.
- Loading starts ~2 viewports before a chapter. Clips far behind the viewer are released (all decoded memory on mobile; the LRU handles desktop).
- 01→02 seam: short canvas crossfade over the first ~3 % of chapter 2.

## Ascent (one sticky stage)
Segments (in config, vh): ch1 500 · ch2 500 · night transition 140 · ch3 500 · ch4 400.
Layers: canvas → scrim → text overlays → snow canvas → grain/vignette. The HUD is fixed left and shown only inside the ascent.
The HUD interpolates altitude, temperature, O₂ % and time per chapter. Time jumps to 23:00 at the transition and runs toward sunrise through chapter 3.
Snow is Canvas 2D, with wind, count and drift driven by a per-chapter wind curve.

## Other sections
- **Preloader:** altimeter 0→100 %, capped at 2.5 s. It also waits for `document.fonts.ready` so type never pops in.
- **Hero** + nav. **Route:** Three.js ridged-multifractal terrain (~57k tris), slope/height shading, fog, dawn sky, self-drawing dashed CatmullRom route, camera on an offset path with a summit sweep, projected HTML camp labels. SVG fallback for low-end devices or no WebGL2.
- **Expeditions:** pinned horizontal row. **Safety:** Ken Burns still plus count-up stats. **Gear:** 3 columns with line icons. **Voices** · **CTA form** (validation, success state) · **Footer**.

## Approved extra
**Ambient wind audio:** off by default, toggled from the nav. It is Web Audio filtered noise with no files, and its gain and filter follow the same wind curve as the snow.

## Type and "Apple-smooth" font loading
Google Fonts (`display=swap`), preconnect, plus metric-matched fallback `@font-face` (size-adjust / ascent-override) so the swap causes no reflow.
Grayscale antialiasing and `text-rendering: optimizeLegibility`.
Display text reveals line by line (blur 12px→0, y 40%→0, expo.out) only after fonts are ready.

## Repo
Push straight to `main` of radio12312/GK-MOUNTAINEERING. No Actions and no orchestration files. Generated frames are committed so Vercel/Netlify need no ffmpeg.
