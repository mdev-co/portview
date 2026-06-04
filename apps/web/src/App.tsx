import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { MapStatusPill } from '@/modules/map/components/map-status-pill';
import { MapStyleSwitcher } from '@/modules/map/components/map-style-switcher';
import { SeamarkToggle } from '@/modules/map/components/seamark-toggle';
import { TrailsToggle } from '@/modules/map/components/trails-toggle';
import { ThemeToggle } from '@/modules/theme';
import { IndexRoute } from '@/routes/index-route';
import { AppShell } from '@/shell/app-shell';
import { BottomDock } from '@/shell/bottom-dock';
import { DockVisibilityToggle } from '@/shell/dock-visibility-toggle';
import { SidebarRouter } from '@/shell/sidebar-router';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Anchor } from 'lucide-react';

const router = createBrowserRouter([
  {
    element: (
      <AppShell.Provider initialPreset="operator-ui">
        <AppShell>
          <AppShell.Slot name="header">
            <header className="border-border/40 bg-background/60 flex h-full items-center gap-3 border-b px-4 py-2.5 backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <Anchor className="text-primary size-4" />
                <h1 className="text-sm font-semibold tracking-tight">Smart Port Szczecin</h1>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <MapStatusPill />
                <span className="bg-border/60 h-5 w-px" aria-hidden />
                <MapStyleSwitcher />
                <span className="bg-border/60 h-5 w-px" aria-hidden />
                <div className="flex items-center gap-1.5">
                  <SeamarkToggle />
                  <TrailsToggle />
                </div>
                <span className="bg-border/60 h-5 w-px" aria-hidden />
                <div className="flex items-center gap-1">
                  <DockVisibilityToggle />
                  <ThemeToggle />
                </div>
              </div>
            </header>
          </AppShell.Slot>
          <AppShell.Slot name="sidebar">
            <SidebarRouter />
          </AppShell.Slot>
        </AppShell>
        <BottomDock />
      </AppShell.Provider>
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
