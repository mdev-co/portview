import { VESSEL_STATUS, type VesselStatus } from '@/modules/map/styles/vessel-palette';
import type { LiveVessel } from '@/modules/telemetry';
import {
  AIS_NAV_STATUS_AT_ANCHOR,
  AIS_NAV_STATUS_MOORED,
  AIS_NAV_STATUS_NOT_UNDER_COMMAND,
} from '@sps/shared';

export const MOVING_THRESHOLD_KN = 0.5;

const ANCHOR_LIKE_NAV_STATUSES: ReadonlySet<number> = new Set([
  AIS_NAV_STATUS_AT_ANCHOR,
  AIS_NAV_STATUS_MOORED,
]);

export function deriveVesselStatus(vessel: LiveVessel): VesselStatus {
  if (vessel.navStatus !== null && ANCHOR_LIKE_NAV_STATUSES.has(vessel.navStatus)) {
    return VESSEL_STATUS.anchored;
  }
  if (vessel.navStatus === AIS_NAV_STATUS_NOT_UNDER_COMMAND) {
    return VESSEL_STATUS.nuc;
  }
  if (vessel.sog === null) return VESSEL_STATUS.anchored;
  return vessel.sog > MOVING_THRESHOLD_KN ? VESSEL_STATUS.underway : VESSEL_STATUS.stopped;
}

export const STATUS_LABEL: Record<VesselStatus, string> = {
  underway: 'Underway',
  anchored: 'Anchored / Moored',
  stopped: 'Stopped',
  nuc: 'Not under command',
};
