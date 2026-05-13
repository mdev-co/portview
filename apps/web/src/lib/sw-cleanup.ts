/**
 * Defensive cleanup of any service worker the browser may have left
 * over from a prior dev session.
 *
 * SPS does not register a service worker. The Vite dev server does
 * not either, but adjacent dev tools (browser extensions, Workbox
 * playground, an earlier project served on localhost) can leave a SW
 * registered against the host that survives the dev tab closing. A
 * stale SW then intercepts requests for the production build, serves
 * cached old assets, and the user sees a laggy version-mismatched UI
 * until they manually clear site data.
 *
 * Calling getRegistrations + unregister on every page load is
 * idempotent (no SW -> empty loop) and cheap (one microtask). It is
 * the smallest defensive measure that makes the production app
 * self-healing for users coming from a contaminated origin state.
 */
export function unregisterStaleServiceWorkers(): void {
  if (typeof navigator === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .getRegistrations()
    .then(registrations => {
      for (const registration of registrations) {
        void registration.unregister();
      }
    })
    .catch(() => {
      // Browsers in private mode or with SW disabled can reject the
      // promise. The cleanup is best-effort, swallow silently.
    });
}
