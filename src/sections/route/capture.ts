/**
 * DEV ONLY — renders the static fallback still. Open the dev server with `?capture-route`:
 * the scene is rendered once at 1920×1080 from the final wide pose (route line hidden; the
 * fallback draws it in SVG), and the WebP + projected route JSON are POSTed to the
 * `/__route-capture` endpoint (vite.config.ts), which writes them into public/route/.
 */
import { route } from '../../config';
import { loadHeightfield } from './loadHeightfield';
import { buildPaths, staticProjection } from './paths';
import { RouteScene } from './scene';

export async function runCapture(): Promise<void> {
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  status.style.cssText =
    'position:fixed;left:16px;bottom:16px;z-index:9999;padding:10px 14px;font:12px/1.4 monospace;' +
    'background:#0b0f14;color:#eef2f5;border:1px solid #ff6a2b;max-width:60ch';
  status.textContent = 'Route capture: rendering…';
  document.body.append(status);

  try {
    const { width, height } = route.staticImage;
    const canvas = document.createElement('canvas');
    const hf = await loadHeightfield();
    const paths = buildPaths(hf);
    const scene = new RouteScene(canvas, hf, paths, { preserveDrawingBuffer: true });
    scene.setSize(width, height, 1);
    scene.setRouteVisible(false);
    scene.setProgress(1);
    scene.snap();
    await scene.compile();
    scene.render();
    const webp = canvas.toDataURL('image/webp', 0.85);
    const json = staticProjection(paths, width, height);
    scene.dispose();

    const res = await fetch('/__route-capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ webp, json }),
    });
    const text = await res.text();
    status.textContent = res.ok ? `Route capture saved: ${text}` : `Route capture failed (${res.status}): ${text}`;
    status.dataset.state = res.ok ? 'done' : 'error';
  } catch (err) {
    status.textContent = `Route capture failed: ${err instanceof Error ? err.message : String(err)}`;
    status.dataset.state = 'error';
  }
}
