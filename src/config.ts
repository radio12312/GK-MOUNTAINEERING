/**
 * G&K — every editable value on the site lives here: copy, altitudes, section lengths,
 * clip settings, stats, prices. Frame extraction settings (fps, quality) live in
 * scripts/extract-frames.mjs; the fps here is only used as documentation / fallback.
 *
 * Values marked PLACEHOLDER must be replaced with real figures before launch.
 */

// ---------------------------------------------------------------------------
// Brand & navigation
// ---------------------------------------------------------------------------
export const site = {
  name: 'G&K',
  fullName: 'G&K Mountaineering',
  description:
    'Guided high-altitude expeditions to 6,000, 7,000 and 8,000 metres. Small teams, experienced guides, and turnaround times we keep.',
};

export const nav = {
  links: [
    { label: 'The Climb', href: '#ascent' },
    { label: 'Route', href: '#route' },
    { label: 'Expeditions', href: '#expeditions' },
    { label: 'Safety', href: '#safety' },
  ],
  cta: { label: 'Book', href: '#book' },
  logoLabel: 'G&K Mountaineering, back to top',
  ariaLabel: 'Primary',
  menuOpen: 'Open menu',
  menuClose: 'Close menu',
  menuLabel: 'Menu',
  soundLabel: 'Ambient wind sound',
};

// ---------------------------------------------------------------------------
// Preloader
// ---------------------------------------------------------------------------
export const preloader = {
  maxWaitMs: 2500, // never block longer than this; loading continues in the background
  minShowMs: 700,
  label: 'Calibrating altimeter',
  loadingText: 'Loading',
  loadedText: 'Loaded',
};

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------
export const hero = {
  eyebrow: 'Guided expeditions · 4,000 – 8,000 m',
  headline: 'Some summits change you.',
  sub: 'Small teams, patient acclimatisation, and guides who decide the turnaround time before the climb begins.',
  scrollCue: 'Scroll to climb',
  video: {
    mp4: '/video/hero.mp4',
    webm: '/video/hero.webm',
    poster: '/video/hero-poster.webp',
  },
  videoLabel: 'Prayer flags moving in the wind below a snow-covered Himalayan peak',
};

// ---------------------------------------------------------------------------
// Frame sequences (engine settings)
// ---------------------------------------------------------------------------
export const frames = {
  basePath: '/frames',
  manifestUrl: '/frames/manifest.json',
  /** Use the 9:16 mobile set when viewport width / height is below this. */
  mobileAspectBelow: 0.9,
  /** Decoded-bitmap budget. Compressed blobs are kept separately (small). */
  memoryBudgetMB: { desktop: 480, mobile: 140 },
  /** Start loading a chapter when it is this many viewports away. */
  preloadViewports: 2,
  /** On mobile, release a clip once the viewer is this many viewports past it. */
  releaseViewportsBehind: 3,
  /** Coarse-to-fine loading passes (frame step per pass). */
  loadPasses: [8, 4, 2, 1],
  maxConcurrentFetches: 6,
  maxDpr: 2,
};

// ---------------------------------------------------------------------------
// Camps (used by the HUD progress line and the Route section)
// ---------------------------------------------------------------------------
export const camps = [
  { id: 'base', name: 'Base Camp', alt: 5150, day: 1 },
  { id: 'c1', name: 'Camp 1', alt: 6050, day: 14 },
  { id: 'high', name: 'High Camp', alt: 7450, day: 37 },
  { id: 'summit', name: 'Summit', alt: 8120, day: 38 },
] as const;

// ---------------------------------------------------------------------------
// The Ascent — one pinned canvas section made of segments.
// Overlay / still ranges are fractions (0–1) of the segment's own progress.
// HUD keyframes: `time` is minutes since midnight; values above 1440 roll over (next day).
// ---------------------------------------------------------------------------
export interface HudFrame {
  alt: number; // metres
  tempC: number;
  o2: number; // % of sea-level oxygen
  time: number; // minutes since midnight (may exceed 1440)
}

export interface Overlay {
  range: [number, number];
  eyebrow: string;
  headline: string;
  body: string;
  align?: 'left' | 'right' | 'center';
}

export interface ClipSegment {
  type: 'clip';
  id: string;
  clip: string;
  fps: number;
  lengthVh: number;
  /** Crossfade from the previous clip's last frame over this fraction of the segment. */
  blendIn?: number;
  hud: { from: HudFrame; to: HudFrame };
  /** Wind strength 0–1 at segment start / middle / end (drives snow + audio). */
  wind: [number, number, number];
  overlays: Overlay[];
  /** prefers-reduced-motion: the chapter becomes these three stills (fractions of the clip). */
  stills: [number, number, number];
  stillAlt: string[];
  closing?: { range: [number, number]; text: string; sub?: string };
}

export interface TransitionSegment {
  type: 'transition';
  id: string;
  lengthVh: number;
  line: string;
  hud: { from: HudFrame; to: HudFrame };
  wind: [number, number, number];
}

export type Segment = ClipSegment | TransitionSegment;

const hm = (h: number, m: number, nextDay = false) => h * 60 + m + (nextDay ? 1440 : 0);

export const ascent = {
  label: 'The Climb',
  srHeading: 'The Climb: from base camp to the summit',
  scrollHint: 'Keep scrolling',
  segments: [
    {
      type: 'clip',
      id: 'basecamp',
      clip: '01-basecamp',
      fps: 15,
      lengthVh: 500,
      hud: {
        from: { alt: 5150, tempC: -6, o2: 51, time: hm(5, 40) },
        to: { alt: 5420, tempC: -9, o2: 49, time: hm(7, 5) },
      },
      wind: [0.04, 0.08, 0.14],
      overlays: [
        {
          range: [0.03, 0.3],
          eyebrow: 'Base Camp · 5,150 m',
          headline: 'Every climb starts here.',
          body: 'A camp of forty tents on the moraine. For the next five weeks, this is home.',
          align: 'left',
        },
        {
          range: [0.36, 0.64],
          eyebrow: '05:40 · −6 °C',
          headline: 'Slow is the plan.',
          body: 'We climb high and sleep low. Three rotations through the icefall before anyone goes near the top.',
          align: 'right',
        },
        {
          range: [0.7, 0.96],
          eyebrow: 'Icefall entrance · 5,420 m',
          headline: 'Move before the sun does.',
          body: 'We cross the icefall at first light, while the night’s cold still holds the seracs together.',
          align: 'left',
        },
      ],
      stills: [0.08, 0.5, 0.95],
      stillAlt: [
        'Orange expedition tents on a rocky moraine at dawn, a snow peak glowing behind them',
        'Base camp at the edge of a glacier, blue seracs rising beyond the tents',
        'The foot of the icefall: ridges of blue ice under a pale dawn sky',
      ],
    },
    {
      type: 'clip',
      id: 'icefall',
      clip: '02-icefall',
      fps: 15,
      lengthVh: 500,
      blendIn: 0.07,
      hud: {
        from: { alt: 5420, tempC: -9, o2: 49, time: hm(7, 5) },
        to: { alt: 7450, tempC: -22, o2: 38, time: hm(11, 40) },
      },
      wind: [0.14, 0.26, 0.38],
      overlays: [
        {
          range: [0.08, 0.33],
          eyebrow: 'Icefall · 5,700 m',
          headline: 'Ladders, ropes, patience.',
          body: 'Our climbing team fixes the route each season and tests every anchor before a client clips in.',
          align: 'left',
        },
        {
          range: [0.4, 0.64],
          eyebrow: 'Camp 1 · 6,050 m',
          headline: 'Above the seracs.',
          body: 'The ice opens into a quiet basin. You rest, drink four litres a day, and let your blood catch up.',
          align: 'right',
        },
        {
          range: [0.72, 0.97],
          eyebrow: 'High Camp · 7,450 m',
          headline: 'The last tent on the ridge.',
          body: 'Supplemental oxygen from here. Two guides for every three climbers. Boots sleep inside the tent.',
          align: 'left',
        },
      ],
      stills: [0.1, 0.5, 0.92],
      stillAlt: [
        'Towering blue seracs in a glacier icefall',
        'A snow basin opening beyond the icefall, peaks on the horizon',
        'Small yellow tents of the high camp on an exposed snow ridge',
      ],
    },
    {
      type: 'transition',
      id: 'night',
      lengthVh: 150,
      line: '23:00 — The summit push begins.',
      hud: {
        from: { alt: 7450, tempC: -24, o2: 38, time: hm(23, 0) },
        to: { alt: 7450, tempC: -27, o2: 38, time: hm(23, 0) },
      },
      wind: [0.6, 0.85, 0.7],
    },
    {
      type: 'clip',
      id: 'summit-push',
      clip: '03-summit-push',
      fps: 15,
      lengthVh: 500,
      hud: {
        from: { alt: 7450, tempC: -27, o2: 38, time: hm(23, 0) },
        to: { alt: 8040, tempC: -31, o2: 35, time: hm(5, 10, true) },
      },
      wind: [0.75, 1, 0.6],
      overlays: [
        {
          range: [0.05, 0.3],
          eyebrow: '7,600 m · −28 °C',
          headline: 'A line of lights.',
          body: 'We leave at eleven so we can turn around by eleven. The headlamps above you are your team.',
          align: 'left',
        },
        {
          range: [0.37, 0.62],
          eyebrow: '7,850 m · 03:20',
          headline: 'The coldest hour.',
          body: 'Before dawn the temperature bottoms out. Your guide checks your fingers, your flow rate and your pace, every hour.',
          align: 'right',
        },
        {
          range: [0.7, 0.96],
          eyebrow: '8,040 m · 05:10',
          headline: 'First light.',
          body: 'The horizon turns amber behind the ridge. Six hours of climbing behind you. Eighty metres to go.',
          align: 'left',
        },
      ],
      stills: [0.1, 0.5, 0.95],
      stillAlt: [
        'Climbers with headlamps on a snow ridge beneath the Milky Way',
        'A line of headlamps climbing a moonlit ridge toward a dark summit',
        'The same ridge as a thin band of orange dawn appears on the horizon',
      ],
    },
    {
      type: 'clip',
      id: 'summit',
      clip: '04-summit',
      fps: 15,
      lengthVh: 400,
      hud: {
        from: { alt: 8120, tempC: -30, o2: 34, time: hm(5, 32, true) },
        to: { alt: 8120, tempC: -27, o2: 34, time: hm(5, 58, true) },
      },
      wind: [0.35, 0.18, 0.06],
      overlays: [
        {
          range: [0.04, 0.3],
          eyebrow: 'Summit · 8,120 m',
          headline: 'Nothing above you.',
          body: 'Twenty minutes on top. A photograph, a long look at the curve of the earth, then down.',
          align: 'left',
        },
        {
          range: [0.36, 0.62],
          eyebrow: '05:48 · Sunrise',
          headline: 'A sea of clouds.',
          body: 'Every valley you walked through is somewhere under that layer. So is everything else.',
          align: 'right',
        },
      ],
      closing: {
        range: [0.72, 1],
        text: 'The summit is halfway.',
        sub: 'We plan every climb around bringing everyone home.',
      },
      stills: [0.05, 0.5, 1],
      stillAlt: [
        'A climber in an orange down suit standing on the summit at sunrise',
        'The climber small against a vast sea of clouds and distant peaks',
        'A wide view of a sea of clouds at sunrise, a lone climber on the summit',
      ],
    },
  ] as Segment[],
  hud: {
    labels: { alt: 'Altitude', temp: 'Outside', o2: 'Oxygen', time: 'Local time' },
    o2Suffix: '% of sea level',
    ariaLabel: 'Expedition altitude readout',
  },
};

// ---------------------------------------------------------------------------
// Snow / spindrift particles (driven by the wind curve above)
// ---------------------------------------------------------------------------
export const particles = {
  countMin: 70, // at wind 0
  countMax: 520, // at wind 1 (halved on mobile)
  speedMin: 0.25, // fall speed multiplier at wind 0
  speedMax: 2.6,
  driftMax: 9, // horizontal px/frame at wind 1
  opacity: 0.85,
};

// ---------------------------------------------------------------------------
// Ambient wind audio (approved extra) — off by default, toggled in the nav.
// ---------------------------------------------------------------------------
export const audio = {
  labelOn: 'Sound on',
  labelOff: 'Sound off',
  maxGain: 0.32,
  baseGain: 0.04, // gain outside the ascent
};

// ---------------------------------------------------------------------------
// The Route (3D)
// ---------------------------------------------------------------------------
export const route = {
  eyebrow: 'The Route',
  heading: 'Thirty-eight days, one line.',
  sub: 'From the moraine at 5,150 m to the summit at 8,120 m. Each camp is a place to stop, sleep and let the body catch up.',
  lengthVh: 420,
  dayLabel: 'Day',
  fallbackNote: 'Static route map',
  /** 3D placement is derived from altitude; `t` is the position along the route line (0–1). */
  stops: [
    { campId: 'base', t: 0, note: 'Acclimatise, puja, gear check' },
    { campId: 'c1', t: 0.33, note: 'Rotation 1 – 3 through the icefall' },
    { campId: 'high', t: 0.78, note: 'Oxygen on, rest, wait for the window' },
    { campId: 'summit', t: 1, note: 'Summit by 06:00, turnaround 11:00' },
  ],
  terrain: {
    seed: 7,
    size: 1000, // world units across
    segments: 170, // 170×170 grid → 57,800 triangles (< 60k)
    heightScale: 330,
    snowlineStart: 0.42, // fraction of max height where snow starts blending in
    snowlineEnd: 0.56,
    rockSlope: 0.62, // steeper than this (1 - normal.y scaled) shows bare rock
  },
  /** Low dawn sun. Azimuth: degrees clockwise from north (−z, "into" the screen at the start). */
  sun: { azimuthDeg: 70, elevationDeg: 10 },
  /** Camera choreography. Progress 0 → drawEnd draws the line; drawEnd → 1 orbits the summit. */
  camera: {
    fov: 40, // vertical, landscape; portrait widens it (up to maxFov) then pulls back
    maxFov: 64,
    minHorizontalFov: 56,
    drawEnd: 0.8,
    flight: { back: 250, up: 165, side: 110 }, // offset from the smoothed route (world units)
    hero: { azimuthDeg: 160, pitchDeg: 9 }, // final wide view: camera bearing (clockwise from north, camera → target is the opposite) + downward pitch
    damping: 3.2, // higher = snappier; the scroll is already smoothed by Lenis
  },
  /** Scroll length when the low-end / no-WebGL2 static map is shown instead of 3D. */
  fallbackLengthVh: 220,
  /** Dev-only capture of the static fallback (see src/sections/route/capture.ts). */
  staticImage: { src: '/route/route-static.webp', data: '/route/route-static.json', width: 1920, height: 1080 },
  palette: {
    skyTop: '#4d6b8a',
    skyHorizon: '#f2b58c',
    fog: '#b9c3cc',
    snow: '#eef2f5',
    rock: '#3a4450',
    rockDark: '#1c2229',
    route: '#ff6a2b',
  },
};

// ---------------------------------------------------------------------------
// Expeditions
// ---------------------------------------------------------------------------
export const expeditions = {
  eyebrow: 'Expeditions',
  heading: 'Four ways up.',
  sub: 'Each one prepares you for the next. Most of our 8,000 m climbers started on a 6,000 m peak with us.',
  fromLabel: 'from',
  currency: '€',
  pricesArePlaceholders: true, // PLACEHOLDER prices — replace before launch
  labels: { altitude: 'Altitude', duration: 'Duration', difficulty: 'Difficulty', season: 'Season' },
  cta: 'Enquire',
  ctaAria: 'Enquire about {name}',
  units: { altitude: 'm', days: 'days' },
  difficultyMax: 5,
  difficultyText: '{n} of {max}',
  cards: [
    {
      id: 'first-6000',
      name: 'First 6000',
      level: 'Beginner',
      altitude: 6120,
      durationDays: 19,
      difficulty: 2,
      season: 'Apr – May · Oct – Nov',
      price: 4900, // PLACEHOLDER
      image: '/stills/still-1.webp',
      imageAlt: 'Expedition tents on a moraine at dawn beneath a snow peak',
      summary: 'Your first time above 6,000 m, on a non-technical glaciated peak with a guide on your rope.',
    },
    {
      id: 'alpine-skills',
      name: 'Alpine Skills Course',
      level: 'Foundation',
      altitude: 4200,
      durationDays: 8,
      difficulty: 2,
      season: 'Jun – Sep',
      price: 2350, // PLACEHOLDER
      image: '/stills/still-2.webp',
      imageAlt: 'Blue seracs in a glacier icefall',
      summary: 'Crampon technique, rope work, crevasse rescue and self-arrest, taught on a real glacier.',
    },
    {
      id: 'himalayan-7000',
      name: 'Himalayan 7000',
      level: 'Advanced',
      altitude: 7126,
      durationDays: 32,
      difficulty: 4,
      season: 'Sep – Oct',
      price: 14800, // PLACEHOLDER
      image: '/stills/still-3.webp',
      imageAlt: 'Yellow tents of a high camp on a snow ridge',
      summary: 'Fixed lines, two high camps and a summit day that starts at midnight. Prior 6,000 m experience required.',
    },
    {
      id: '8000m',
      name: '8000m Expedition',
      level: 'Expert',
      altitude: 8120,
      durationDays: 42,
      difficulty: 5,
      season: 'Apr – May',
      price: 48000, // PLACEHOLDER
      image: '/stills/still-6.webp',
      imageAlt: 'A lone climber on a summit above a sea of clouds at sunrise',
      summary: 'Six weeks, supplemental oxygen, a 1:1 climbing Sherpa and a turnaround time agreed in writing.',
    },
  ],
};

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------
export const safety = {
  eyebrow: 'Safety',
  heading: 'When the mountain says no.',
  intro:
    'Most accidents above 8,000 m happen on the way down, after a summit that took too long. We plan the descent first.',
  image: '/stills/still-4.webp',
  imageAlt: 'Climbers with headlamps on a night ridge under the Milky Way',
  points: [
    {
      title: 'Turnaround times',
      body: 'Set in writing at base camp, for every climber, before summit day. If we are not on top by then, we go down. No negotiation at 8,000 m.',
    },
    {
      title: 'Guide-to-climber ratio',
      body: 'Two guides for every three climbers above High Camp, and one climbing Sherpa per client on 8,000 m peaks.',
    },
    {
      title: 'Weather forecasting',
      body: 'Two independent forecasting services, plus our own wind readings from base camp. We only commit to a summit window when both agree.',
    },
    {
      title: 'Oxygen',
      body: 'Three bottles per climber for summit day, a reserve cache at High Camp, and flow rates checked by your guide every hour.',
    },
  ],
  // PLACEHOLDER figures — replace with audited numbers before launch.
  stats: [
    { prefix: '1:', value: 1, suffix: '', label: 'Climbing Sherpa per client on 8,000 m peaks', placeholder: true },
    { prefix: '', value: 92, suffix: '%', label: 'Summit success rate, 2016 – 2025', placeholder: true },
    { prefix: '', value: 21, suffix: '', label: 'Years operating', placeholder: true },
  ],
};

// ---------------------------------------------------------------------------
// Gear
// ---------------------------------------------------------------------------
export type GearIcon =
  | 'crampons' | 'axe' | 'harness' | 'helmet' | 'ascender' | 'carabiner'
  | 'downsuit' | 'boots' | 'mitts' | 'layers' | 'goggles' | 'balaclava'
  | 'sleepingbag' | 'headlamp' | 'thermos' | 'mat' | 'stove' | 'battery';

export const gear = {
  eyebrow: 'What you’ll carry',
  heading: 'Everything has a job.',
  sub: 'We send the full list twelve weeks before departure and check every item with you at base camp.',
  columns: [
    {
      title: 'Technical',
      items: [
        { icon: 'crampons', name: '12-point crampons', note: 'Steel, fitted to your boots' },
        { icon: 'axe', name: 'Ice axe', note: '55 – 65 cm, with leash' },
        { icon: 'harness', name: 'Alpine harness', note: 'Adjustable over a down suit' },
        { icon: 'helmet', name: 'Helmet', note: 'UIAA certified' },
        { icon: 'ascender', name: 'Ascender', note: 'For fixed lines' },
        { icon: 'carabiner', name: 'Locking carabiners', note: 'Four, plus two snap-gates' },
      ],
    },
    {
      title: 'Clothing',
      items: [
        { icon: 'downsuit', name: '8,000 m down suit', note: 'One piece, 800+ fill' },
        { icon: 'boots', name: 'Triple boots', note: 'With integrated gaiter' },
        { icon: 'mitts', name: 'Expedition mitts', note: 'Plus two pairs of liners' },
        { icon: 'layers', name: 'Base and mid layers', note: 'Merino or synthetic' },
        { icon: 'goggles', name: 'Glacier goggles', note: 'Category 4 lenses' },
        { icon: 'balaclava', name: 'Balaclava', note: 'Windproof, fits under a mask' },
      ],
    },
    {
      title: 'Camp',
      items: [
        { icon: 'sleepingbag', name: 'Sleeping bag', note: 'Comfort rating −40 °C' },
        { icon: 'headlamp', name: 'Headlamp', note: '400 lm, lithium batteries' },
        { icon: 'thermos', name: 'Insulated flask', note: '1 litre, steel' },
        { icon: 'mat', name: 'Two sleeping mats', note: 'Foam and inflatable' },
        { icon: 'stove', name: 'Hanging stove', note: 'Supplied by G&K' },
        { icon: 'battery', name: 'Power bank', note: '20,000 mAh, kept warm' },
      ],
    },
  ] as { title: string; items: { icon: GearIcon; name: string; note: string }[] }[],
};

// ---------------------------------------------------------------------------
// Voices (PLACEHOLDER testimonials — replace with real, consented quotes)
// ---------------------------------------------------------------------------
export const voices = {
  eyebrow: 'Voices',
  heading: 'From the people who went.',
  items: [
    {
      quote:
        'I turned around at 8,000 metres. Two years later I went back with the same guide and stood on top. He made the right call both times.',
      name: 'Marta Kowalczyk',
      summit: '8000m Expedition · 8,120 m',
    },
    {
      quote:
        'Nobody talked about conquering anything. We talked about fluids, sleep and the forecast. That is why I trusted them.',
      name: 'Daniel Achterberg',
      summit: 'Himalayan 7000 · 7,126 m',
    },
    {
      quote:
        'The skills course was the first time I understood what my crampons were for. After that, the Himalaya felt like a plan instead of a dream.',
      name: 'Priya Raman',
      summit: 'First 6000 · 6,120 m',
    },
  ],
};

// ---------------------------------------------------------------------------
// Final CTA + booking form
// ---------------------------------------------------------------------------
export const cta = {
  image: '/frames/04-summit/end.webp',
  imageAlt: 'A sea of clouds at sunrise seen from a Himalayan summit',
  heading: 'Your summit is waiting.',
  sub: 'Tell us where you have climbed and where you want to go. A guide, not a salesperson, replies within two working days.',
  form: {
    name: { label: 'Name', placeholder: 'Your full name', error: 'Please enter your name.' },
    email: { label: 'Email', placeholder: 'you@example.com', error: 'Please enter a valid email address.' },
    expedition: {
      label: 'Expedition',
      placeholder: 'Choose an expedition',
      error: 'Please choose an expedition.',
      options: ['First 6000', 'Alpine Skills Course', 'Himalayan 7000', '8000m Expedition', 'Not sure yet'],
    },
    experience: {
      label: 'Experience',
      placeholder: 'Your highest altitude so far',
      error: 'Please tell us your experience level.',
      options: [
        'No altitude experience yet',
        'Trekking up to 5,500 m',
        'Climbed a 6,000 m peak',
        'Climbed a 7,000 m peak',
        'Climbed an 8,000 m peak',
      ],
    },
    message: {
      label: 'Message',
      placeholder: 'Past climbs, dates you have in mind, questions…',
      error: 'Please keep your message under 2,000 characters.',
      maxLength: 2000,
    },
    optional: 'optional',
    submit: 'Send enquiry',
    sending: 'Sending…',
    success: {
      heading: 'Received.',
      body: 'A guide will read this and reply within two working days. In the meantime, start walking uphill.',
      reset: 'Send another enquiry',
    },
  },
};

// ---------------------------------------------------------------------------
// Footer (PLACEHOLDER contact details)
// ---------------------------------------------------------------------------
export const footer = {
  contact: {
    email: 'expeditions@gk-mountaineering.com',
    phone: '+977 1 400 0000',
    offices: ['Thamel, Kathmandu', 'Chamonix-Mont-Blanc'],
  },
  socials: [
    { label: 'Instagram', href: 'https://instagram.com/' },
    { label: 'YouTube', href: 'https://youtube.com/' },
    { label: 'Strava', href: 'https://strava.com/' },
  ],
  certifications: ['IFMGA-certified lead guides', 'Nepal Mountaineering Association member', 'Fully insured, licensed operator'], // PLACEHOLDER
  aiNote: 'Cinematic sequences created with AI',
  headings: { contact: 'Contact', offices: 'Offices', social: 'Follow', certifications: 'Credentials' },
  newTab: 'opens in a new tab',
  legal: '© G&K Mountaineering',
};
