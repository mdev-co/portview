import { VESSEL_STATUS, type VesselStatus } from '@/modules/map/styles/vessel-palette';
import type { LiveVessel } from '@/modules/telemetry';
import {
  AIS_NAV_STATUS_AT_ANCHOR,
  AIS_NAV_STATUS_MOORED,
  AIS_NAV_STATUS_NOT_UNDER_COMMAND,
  VESSEL_FLAG_IS_MOVING,
} from '@sps/shared';

const ANCHOR_LIKE_NAV_STATUSES: ReadonlySet<number> = new Set([
  AIS_NAV_STATUS_AT_ANCHOR,
  AIS_NAV_STATUS_MOORED,
]);

/**
 * Status comes from the same IS_MOVING bit the map paint expression
 * reads. vessels.store applies a 0.3 / 0.5 kn hysteresis on top of
 * the raw SOG before stamping the bit; reading the bit here keeps
 * the sidebar status and the marker fill in sync when a vessel
 * drifts through the dead zone (previously the sidebar compared raw
 * SOG to a single 0.5 kn threshold and disagreed with the map).
 */
export function deriveVesselStatus(vessel: LiveVessel): VesselStatus {
  if (vessel.navStatus !== null && ANCHOR_LIKE_NAV_STATUSES.has(vessel.navStatus)) {
    return VESSEL_STATUS.anchored;
  }
  if (vessel.navStatus === AIS_NAV_STATUS_NOT_UNDER_COMMAND) {
    return VESSEL_STATUS.nuc;
  }
  const isMoving = (vessel.flags & VESSEL_FLAG_IS_MOVING) !== 0;
  if (isMoving) return VESSEL_STATUS.underway;
  if (vessel.sog === null) return VESSEL_STATUS.anchored;
  return VESSEL_STATUS.stopped;
}

export const STATUS_LABEL: Record<VesselStatus, string> = {
  underway: 'Underway',
  anchored: 'Anchored / Moored',
  stopped: 'Stopped',
  nuc: 'Not under command',
};
