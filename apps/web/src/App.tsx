import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { MapStatusPill } from '@/modules/map/components/map-status-pill';
import { MapStyleSwitcher } from '@/modules/map/components/map-style-switcher';
import { SeamarkToggle } from '@/modules/map/components/seamark-toggle';
import { TrailsToggle } from '@/modules/map/components/trails-toggle';
import { ThemeToggle } from '@/modules/theme';
import { IndexRoute } from '@/routes/index-route';
import { AppShell } from '@/shell/app-shell';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Anchor } from 'lucide-react';

const router = createBrowserRouter([
  {
    element: (
      <AppShell>
        <AppShell.Slot name="header">
          <header className="border-border bg-background flex h-full items-center gap-2 border-b px-4 py-3">
            <Anchor className="text-primary size-4" />
            <h1 className="text-sm font-semibold tracking-tight">Smart Port Szczecin</h1>
            <div className="ml-auto flex items-center gap-2">
              <MapStatusPill />
              <MapStyleSwitcher />
              <SeamarkToggle />
              <TrailsToggle />
              <ThemeToggle />
            </div>
          </header>
        </AppShell.Slot>
      </AppShell>
    ),
    children: [{ index: true, element: <IndexRoute /> }],
  },
]);

function App() {
  return (
    <>
      <RouterProvider router={router} />
      {/* Vercel-hosted first-party beacons (same-origin, no third-party script,
          no cookies, no GDPR banner). Both no-op in dev. */}
      <Analytics />
      <SpeedInsights />
    </>
  );
}

export default App;
