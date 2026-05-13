import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { unregisterStaleServiceWorkers } from './lib/sw-cleanup';
import { createTelemetryClient } from './modules/telemetry';

unregisterStaleServiceWorkers();

const telemetry = createTelemetryClient();
telemetry.start();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
