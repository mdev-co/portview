import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { unregisterStaleServiceWorkers } from './lib/sw-cleanup';
import { createTelemetryClient } from './modules/telemetry';

// Dev-only quality overlays. Stripped from production builds by
// `import.meta.env.DEV` plus esbuild dead-code elimination.
//   - react-scan: live overlay of components that re-rendered this
//     frame, plus reasons. Catches the "useState updated 200 times
//     per second" class of perf regression at a glance.
//   - @axe-core/react: walks the rendered DOM every 1 s and logs
//     WCAG / aria-* violations to the browser console. Keeps the
//     Lighthouse a11y score on 100 without manual audits.
if (import.meta.env.DEV) {
  void import('react-scan').then(({ scan }) => {
    scan({ enabled: true });
  });
  void import('@axe-core/react').then(async ({ default: axe }) => {
    const React = await import('react');
    const ReactDOM = await import('react-dom');
    axe(React, ReactDOM, 1000);
  });
}

unregisterStaleServiceWorkers();

const telemetry = createTelemetryClient();
telemetry.start();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
