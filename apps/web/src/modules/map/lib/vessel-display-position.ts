import type { VesselKalmanState } from '@sps/shared';
import type { LiveVessel } from '../../telemetry/types';
import { smoothedDisplayPosition } from './dead-reckoning-tracker';

/**
 * Single source of truth for "where the marker is right now on the map".
 *
 * Marker position is the raw AIS broadcast. The dead-reckoning tracker
 * still provides a cubic-eased lerp between two consecutive raw fixes
 * for a clean visual transition, but no extrapolation or Kalman
 * projection drives the marker forward in time. The Kalman state is
 * still computed and persisted server-side as a corrective companion
 * (history-aware velocity estimate, future smoothing analytics), but
 * the rendered shape always reflects what the vessel itself reported.
 *
 * Used by both the GeoJSON builder (render) and the sidebar zoom
 * button (flyTo) so the camera lands on the same pixel the marker
 * occupies.
 */
export function getVesselDisplayPosition(
  vessel: LiveVessel,
  _kalmanState: VesselKalmanState | undefined,
  nowSeconds: number,
): { readonly lng: number; readonly lat: number } | null {
  return smoothedDisplayPosition(vessel, nowSeconds);
}
