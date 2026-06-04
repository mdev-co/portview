import { useEffect } from 'react';
import { startGeofencePipeline, stopGeofencePipeline } from '../state/geofence-pipeline';

/**
 * Mount the geofence reactive pipeline at the call site (App Shell
 * or index route). The pipeline itself is module-scoped and
 * idempotent so React Strict Mode's double-mount in dev never
 * duplicates listeners; the effect cleanup tears it down on
 * unmount so unit tests and route swaps stay symmetrical.
 *
 * Returns nothing - the pipeline drives Nano Stores directly and
 * consumers subscribe to those stores, not to a hook return value.
 */
export function useGeofencePipeline(): void {
  useEffect(() => {
    startGeofencePipeline();
    return stopGeofencePipeline;
  }, []);
}
