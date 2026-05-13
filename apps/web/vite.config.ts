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
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
