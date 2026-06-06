import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { GeofenceToasterPortal } from '@/modules/geofencing';
import { MapStatusPill } from '@/modules/map/components/map-status-pill';
import { MapStyleSwitcher } from '@/modules/map/components/map-style-switcher';
import { SeamarkToggle } from '@/modules/map/components/seamark-toggle';
import { ThreeDToggleButton } from '@/modules/map/components/three-d-toggle-button';
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
            <header
              className="relative flex h-full items-center gap-3 border-b px-4 py-2.5 backdrop-blur-xl"
              style={{
                background:
                  'linear-gradient(to bottom, color-mix(in oklch, var(--shell-surface) 92%, transparent), color-mix(in oklch, var(--shell-surface) 78%, transparent))',
                borderBottomColor:
                  'color-mix(in oklch, var(--shell-surface-edge) 80%, transparent)',
              }}
            >
              <div className="flex items-center gap-2">
                <Anchor className="text-primary size-[15px]" strokeWidth={2} />
                <h1 className="text-[13px] font-semibold tracking-tight">Smart Port Szczecin</h1>
                <span
                  aria-hidden
                  className="text-muted-foreground/60 ml-1 font-mono text-[10px] tracking-widest uppercase select-none"
                >
                  Operator
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <MapStatusPill />
                <MapStyleSwitcher />
                <div className="border-border bg-background inline-flex h-9 items-center gap-1 rounded-md border px-2 text-xs">
                  <span
                    aria-hidden
                    className="text-muted-foreground font-mono text-[10px] font-semibold tracking-widest uppercase select-none"
                  >
                    Overlays
                  </span>
                  <span aria-hidden className="bg-border mx-1 h-4 w-px" />
                  <SeamarkToggle />
                  <TrailsToggle />
                  <ThreeDToggleButton />
                </div>
                <div className="border-border bg-background inline-flex h-9 items-center gap-1 rounded-md border px-2 text-xs">
                  <span
                    aria-hidden
                    className="text-muted-foreground font-mono text-[10px] font-semibold tracking-widest uppercase select-none"
                  >
                    View
                  </span>
                  <span aria-hidden className="bg-border mx-1 h-4 w-px" />
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
        <GeofenceToasterPortal />
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
