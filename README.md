# G&K Mountaineering — cinematic scroll site

A static, scroll-driven site where the visitor climbs the mountain by scrolling. Four AI-generated clips are
converted to WebP image sequences and scrubbed on a canvas, with an altitude HUD, wind-driven snow, a night
transition, and a Three.js route section.

**Stack:** Vite · vanilla TypeScript · GSAP + ScrollTrigger · Lenis · Three.js. No UI framework.

```
raw/                     source clips (01-basecamp.mp4 … 04-summit.mp4, optional hero-loop.mp4)
scripts/extract-frames.mjs   ffmpeg pipeline → public/frames, public/stills, public/video
public/frames/<clip>/{desktop,mobile}/0001.webp …   generated image sequences + poster/end + manifest.json
src/config.ts            ALL editable content: copy, altitudes, section lengths, HUD values, stats, prices
src/lib/FrameSequence.ts the scrub engine (progressive loading, LRU decode cache, cover drawing)
src/sections/*           one module per page section
```

## Run it

Requires Node 20+ and (only for re-extracting frames) ffmpeg.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build → dist/
npm run preview    # serve dist/
```

> The npm scripts call tools via `node node_modules/...` on purpose. The project folder name contains `&`,
> which breaks Windows `.cmd` shims such as `npx`.

## Replace the clips

1. Put the new files in `raw/` with the same names: `01-basecamp.mp4`, `02-icefall.mp4`, `03-summit-push.mp4`,
   `04-summit.mp4`. Any resolution works (16:9 recommended, 720p+). Optionally add `hero-loop.mp4` for the hero.
   Without it, the hero uses the first 4 s of `01-basecamp.mp4`, slowed and crossfaded into a loop.
2. Adjust extraction settings at the top of `scripts/extract-frames.mjs` if needed:
   - `fps` per clip (default 15), and `desktopQuality` / `mobileQuality` per-clip overrides
   - `trimStart` / `trimEnd` (default 0.15 s, which cuts the glitchy edges AI clips often have)
   - desktop width/quality (1600 px, q72), mobile 9:16 crop (720 px, q68), stills (6 × 1920 px, q82)
3. Re-run extraction:

   ```bash
   npm run frames                  # everything: sequences, posters, LQIPs, stills, hero video, manifest
   npm run frames -- 02-icefall    # one clip only (manifest is updated in place)
   npm run frames -- --no-hero     # skip the hero video encode
   ```

   The script prints the size per clip and warns when a desktop set exceeds 12 MB. Lower that clip's `fps` or
   `desktopQuality` if you see the warning.
4. If you changed a clip's content, update its chapter in `src/config.ts`: overlay copy and progress ranges,
   HUD keyframes, wind curve, the three reduced-motion `stills` positions and their `stillAlt` text.

Adding or removing a chapter means adding or removing a `segments` entry in `config.ts` and a clip entry in the
extraction script's `CONFIG.clips`.

## Editing content

Everything visitors read or see as a number lives in `src/config.ts`:

- `ascent.segments`: chapter lengths (`lengthVh`), text overlays (`range` is a 0–1 fraction of the chapter),
  HUD keyframes (altitude, temperature, O₂ %, local time in minutes; values above 1440 roll into the next
  day), wind strength per chapter (drives snow density and the ambient audio), and the night transition line.
- `camps`: camp names, altitudes and day numbers, shared by the HUD and the 3D route.
- `expeditions.cards`: altitude, duration, difficulty 1–5, season and **placeholder prices**.
- `safety.stats`: **placeholder figures** (guide ratio, success rate, years operating).
- `voices`, `footer`: **placeholder testimonials, contact details and certifications**. Replace them before launch.

## How the scrub engine works

- One sticky canvas is shared by four `FrameSequence`s. Each one maps its own ScrollTrigger range to a
  frame index.
- Loading goes coarse to fine: first and last frame, then every 8th, 4th, 2nd, then all. Scrubbing works
  almost immediately, and the nearest decoded frame is drawn until the exact one arrives.
- Compressed WebP blobs stay in memory (small). Decoded `ImageBitmap`s live in a shared LRU with a byte budget
  (`frames.memoryBudgetMB`), so memory stays bounded. On mobile, a clip is released entirely once the viewer is
  a few viewports past it.
- Frames are drawn with cover-fit maths, the devicePixelRatio is capped at 2, and the canvas redraws only when
  the visible frame changes. Portrait viewports get the 9:16 mobile set.

## Accessibility & reduced motion

With `prefers-reduced-motion: reduce`, nothing scrubs and there are no particles or smooth scrolling. Each
chapter becomes three still frames with its text, and the 3D route shows a static render with an SVG route.
Navigation and the booking form are fully keyboard-operable with visible focus states.

## Deploy

The build output is a static folder (`dist/`). The generated frames are committed, so hosts don't need ffmpeg.

- **Vercel:** import the repo. Framework preset **Vite**, build command `npm run build`, output directory `dist`.
- **Netlify:** new site from Git. Build command `npm run build`, publish directory `dist`.
- **Anywhere else:** `npm run build`, then upload `dist/` to any static host or CDN.

Frames and stills are content-addressed by clip name, so if you replace a clip, purge the CDN cache for
`/frames/<clip>/*` (or rename the clip) after redeploying.

---

Cinematic sequences created with AI.
