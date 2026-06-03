/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  // Project rule: single .env at repo root. Without this, Vite would
  // look for .env in apps/web/ and silently miss VITE_API_URL,
  // VITE_WS_URL, VITE_MAPTILER_KEY etc., shipping an empty-string
  // build (which is how the missing MapTiler key surfaced).
  envDir: path.resolve(__dirname, '..', '..'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  /**
   * Vite 6+ defaults to binding only the IPv6 loopback (`[::1]`) on
   * macOS. Chrome / Safari resolve `localhost` to the IPv4 loopback
   * first and refuse the connection before falling back to v6, so a
   * fresh `pnpm dev` looks like it "does not start in the browser"
   * even though the terminal shows "ready". `host: true` binds the
   * dev server on every interface (0.0.0.0 + ::), restoring the
   * previous behaviour and letting `localhost`, `127.0.0.1` and the
   * LAN IP all reach the same Vite.
   */
  server: {
    host: true,
  },
  /**
   * Production hardening. The shipped bundle is the only artefact a
   * curious observer can read from the browser DevTools, so we keep
   * it lean and free of source-level breadcrumbs to limit what a
   * passive reverse-engineer can pick up at a glance.
   *
   * - `sourcemap: false`: no .map files, no readable original file
   *   paths or symbol names. Stack traces in production logs are
   *   minified, which is the tradeoff we accept here.
   * - `esbuild.drop: ['console', 'debugger']`: removes every
   *   `console.*` call and every `debugger` statement from the
   *   build. Only applied when `command === 'build'` so `vite dev`
   *   keeps the full developer console for local debugging.
   * - `esbuild.legalComments: 'none'`: drops `@license` / `@preserve`
   *   banners. We attribute upstream libraries on the live page, not
   *   inside the bundle.
   */
  build: {
    sourcemap: false,
    minify: 'esbuild',
  },
  esbuild:
    command === 'build'
      ? {
          drop: ['console', 'debugger'],
          legalComments: 'none',
        }
      : undefined,
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
  },
}));
