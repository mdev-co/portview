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

// Back/forward cache eligibility. Browsers refuse to put a page with
// an open WebSocket into bfcache, so the AIS connection itself
// blocks the snappy back/forward navigation experience. Closing the
// socket on `pagehide` makes the page bfcache-eligible; on
// `pageshow` with event.persisted === true (the page is being
// restored from bfcache, not loaded fresh) we re-establish the
// connection so the operator returns to a live feed without a
// manual refresh. The persisted check guards the duplicate-start
// case where pageshow also fires on the initial navigation; that
// path already ran telemetry.start() above and must not run twice.
//
// Lifecycle: in production these listeners attach once per page
// load, live for the entire window lifetime, and die with the
// window on hard navigation. Module init runs exactly once so no
// duplication risk. In dev under Vite HMR the module CAN reload
// while window persists, so we expose named handlers and dispose
// them via `import.meta.hot.dispose` to prevent stale telemetry
// instances accumulating across reloads.
const onPageHide = (): void => telemetry.stop();
const onPageShow = (event: PageTransitionEvent): void => {
  if (event.persisted) telemetry.start();
};
window.addEventListener('pagehide', onPageHide);
window.addEventListener('pageshow', onPageShow);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    telemetry.stop();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
