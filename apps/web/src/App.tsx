import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { MapStatusPill } from '@/modules/map/components/map-status-pill';
import { IndexRoute } from '@/routes/index-route';
import { AppShell } from '@/shell/app-shell';
import { Anchor } from 'lucide-react';

const router = createBrowserRouter([
  {
    element: (
      <AppShell>
        <AppShell.Header className="border-slate-800 bg-slate-900 text-slate-50">
          <Anchor className="size-4 text-sky-400" />
          <h1 className="text-sm font-semibold tracking-tight">Smart Port Szczecin</h1>
          <div className="ml-auto flex items-center gap-2">
            <MapStatusPill />
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
