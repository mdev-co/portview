import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { MapStatusPill } from '@/modules/map/components/map-status-pill';
import { TrailsToggle } from '@/modules/map/components/trails-toggle';
import { ThemeToggle } from '@/modules/theme';
import { IndexRoute } from '@/routes/index-route';
import { AppShell } from '@/shell/app-shell';
import { Anchor } from 'lucide-react';

const router = createBrowserRouter([
  {
    element: (
      <AppShell>
        <AppShell.Header>
          <Anchor className="text-primary size-4" />
          <h1 className="text-sm font-semibold tracking-tight">Smart Port Szczecin</h1>
          <div className="ml-auto flex items-center gap-2">
            <MapStatusPill />
            <TrailsToggle />
            <ThemeToggle />
          </div>
        </AppShell.Header>
        <AppShell.Main />
      </AppShell>
    ),
    children: [{ index: true, element: <IndexRoute /> }],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
