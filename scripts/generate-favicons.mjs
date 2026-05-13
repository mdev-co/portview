/**
 * Render favicon.svg and og-image.svg into the PNG variants browsers
 * and social crawlers actually consume. Resvg-js is a pure-WASM
 * SVG rasteriser so this script runs on any platform without native
 * dependencies. Re-run whenever either SVG source changes; the
 * generated PNGs ship committed alongside the SVG so the production
 * bundle is self-contained and the Vite dev server can serve them
 * without a build step.
 */
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pubDir = join(here, '..', 'apps', 'web', 'public');
mkdirSync(pubDir, { recursive: true });

function rasterise(srcRel, outRel, width) {
  const src = join(pubDir, srcRel);
  const out = join(pubDir, outRel);
  const svg = readFileSync(src, 'utf-8');
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } });
  const png = resvg.render().asPng();
  writeFileSync(out, png);
  // ESLint here restricts the global `console` to warn / error; a build-time
  // CLI emits status to stderr the same way pnpm and tsc do.
  console.warn('rendered', outRel, 'at', `${width}px`);
}

rasterise('favicon.svg', 'favicon-16x16.png', 16);
rasterise('favicon.svg', 'favicon-32x32.png', 32);
rasterise('favicon.svg', 'favicon-48x48.png', 48);
rasterise('favicon.svg', 'apple-touch-icon.png', 180);
rasterise('favicon.svg', 'android-chrome-192x192.png', 192);
rasterise('favicon.svg', 'android-chrome-512x512.png', 512);
rasterise('og-image.svg', 'og-image.png', 1200);
