import { ZoneLayer } from '@/modules/geofencing/components/zone-layer';
import { Flagship2DHider } from '../3d/flagship-2d-hider';
import { Flagship3DLayer } from '../3d/flagship-3d-layer';
import type { MapStatus } from '../core/map-state';
import { useMapState } from '../hooks/use-map-state';
import { useMapStyleSync } from '../hooks/use-map-style-sync';
import { MapCanvas } from './map-canvas';
import { VesselLayer } from './vessel-layer';

const LOADING_LABEL: Record<MapStatus, (error: Error | null) => string | null> = {
  idle: () => 'Initializing...',
  attached: () => 'Initializing...',
  initializing: () => 'Loading map...',
  ready: () => null,
  swapping: () => 'Switching engine...',
  error: error => (error ? `Error: ${error.message}` : 'Map error'),
  disposing: () => 'Map stopped',
  disposed: () => 'Map stopped',
};

export function MapView() {
  const { status, error } = useMapState();
  const label = LOADING_LABEL[status](error);

  useMapStyleSync();

  return (
    <div className="relative h-full w-full">
      <MapCanvas />
      <ZoneLayer />
      <VesselLayer />
      <Flagship3DLayer />
      <Flagship2DHider />
      {label !== null && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            role="status"
            aria-live="polite"
            className="border-border bg-background text-muted-foreground rounded-md border px-3 py-1.5 text-sm shadow-sm"
          >
            {label}
          </div>
        </div>
      )}
    </div>
  );
}
