export {
  computePresence,
  DEFAULT_DWELL_CONFIG,
  DEFAULT_DWELL_MS,
  DEFAULT_GHOST_TIMEOUT_MS,
  forceExitVessel,
  sweepGhosts,
  tickGeofence,
} from './dwell-machine';
export type {
  DwellConfig,
  MembershipState,
  TickResult,
  VesselPositionFrame,
} from './dwell-machine';
export { isInsideZone } from './point-in-polygon';
export {
  type GeofenceEvent,
  type GeofencePresence,
  type MembershipEntry,
  type MembershipKey,
  membershipKey,
  parseMembershipKey,
  type Zone,
  type ZoneCollection,
  zoneId,
  type ZoneId,
  type ZoneKind,
  type ZoneProperties,
} from './types';
export { SZCZECIN_ZONE_COLLECTION, SZCZECIN_ZONES } from './zones.szczecin';
