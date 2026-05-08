import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { createTelemetryClient, vesselCount } from './modules/telemetry';

const telemetry = createTelemetryClient({
  onVessel: vessel => {
    console.warn('[telemetry]', {
      mmsi: vessel.mmsi,
      lng: vessel.lng,
      lat: vessel.lat,
      sog: vessel.sog,
      cog: vessel.cog,
      total: vesselCount(),
    });
  },
});
telemetry.start();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
