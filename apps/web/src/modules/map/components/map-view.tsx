import type { MapStatus } from '../core/map-state';
import { useMapState } from '../hooks/use-map-state';
import { MapCanvas } from './map-canvas';

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

  return (
    <div className="relative h-full w-full">
      <MapCanvas />
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
