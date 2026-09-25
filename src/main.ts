import './styles/tokens.css';
import './styles/base.css';
import './styles/sections.css';
import './styles/ascent.css';
import './styles/route.css';

import { initScroll, startScroll, stopScroll, ScrollTrigger } from './lib/scroll';
import { track } from './lib/loader';
import { holdStreaming } from './lib/FrameSequence';
import { fontsReady, initReveals } from './lib/reveal';
import { initPreloader } from './sections/preloader';
import { initNav } from './sections/nav';
import { initHero } from './sections/hero';
import { initAscent } from './sections/ascent';
import { initRoute } from './sections/route';
import { initExpeditions } from './sections/expeditions';
import { initSafety } from './sections/safety';
import { initGear } from './sections/gear';
import { initVoices } from './sections/voices';
import { initCta } from './sections/cta';
import { initFooter } from './sections/footer';

// Always start at the top: the preloader + intro assume it.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

async function boot() {
  const preloader = initPreloader();
  initScroll();
  stopScroll();
  // Only chapter posters load during the preloader; sequences stream after it.
  holdStreaming(true);

  track(fontsReady(), 2);

  // Render every section (markup comes from config.ts), in page order.
  initNav();
  const hero = initHero();
  initAscent();
  initRoute();
  initExpeditions();
  initSafety();
  initGear();
  initVoices();
  initCta();
  initFooter();

  await preloader.done;
  holdStreaming(false);

  document.documentElement.classList.remove('is-loading');
  startScroll();
  initReveals();
  hero.playIntro();
  ScrollTrigger.refresh();
}

boot().catch((err) => {
  console.error(err);
  document.documentElement.classList.remove('is-loading');
  startScroll();
});
