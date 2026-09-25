import { defineConfig, type Plugin } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Dev-only: POST /__route-capture { webp: dataURL, json } writes the Route section's
 * static fallback (public/route/route-static.webp + .json). Triggered by opening the dev
 * server with `?capture-route` — see src/sections/route/capture.ts.
 */
function routeCapture(): Plugin {
  const MAX_BYTES = 25 * 1024 * 1024;
  return {
    name: 'gk-route-capture',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__route-capture', (req, res, next) => {
        if (req.method !== 'POST') return next();
        // Only accept the capture page itself (blocks cross-site no-cors POSTs from other tabs).
        const origin = req.headers.origin ?? '';
        if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) || !String(req.headers['content-type'] ?? '').startsWith('application/json')) {
          res.statusCode = 403;
          return res.end();
        }
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) req.destroy();
          else chunks.push(c);
        });
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const match = /^data:image\/webp;base64,(.+)$/.exec(String(body?.webp ?? ''));
            if (!match) throw new Error('Expected body.webp as a data:image/webp;base64 URL');
            if (!body.json || !Array.isArray(body.json.route)) throw new Error('Expected body.json with a route array');
            const dir = resolve(server.config.publicDir, 'route');
            mkdirSync(dir, { recursive: true });
            const img = Buffer.from(match[1], 'base64');
            writeFileSync(resolve(dir, 'route-static.webp'), img);
            writeFileSync(resolve(dir, 'route-static.json'), JSON.stringify(body.json));
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, webpBytes: img.length, dir }));
          } catch (err) {
            res.statusCode = 400;
            res.end(err instanceof Error ? err.message : String(err));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [routeCapture()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 600, // three.js (~140 kB gzip) is a lazy chunk, loaded near the Route section
    rollupOptions: {
      output: {
        // Vite 8 (Rolldown) only accepts the function form. `three` is only reached through
        // dynamic imports (Route section), so its chunk stays out of the initial load.
        manualChunks(id: string) {
          if (/[\\/]node_modules[\\/]three[\\/]/.test(id)) return 'three';
          if (/[\\/]node_modules[\\/](gsap|lenis)[\\/]/.test(id)) return 'gsap';
          return undefined;
        },
      },
    },
  },
  server: { port: 5173 },
});
