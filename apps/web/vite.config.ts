/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
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
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
