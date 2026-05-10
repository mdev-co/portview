import type { Mmsi } from './brands';
import type { VesselStaticDataFrame } from './vessel-static';

/**
 * Discriminator literal for the cold-start snapshot frame the telemetry
 * gateway sends to a freshly connected WebSocket client. One JSON text
 * frame carries the catalog of every recently active vessel along with
 * its static metadata, last position, recent history (for trail
 * rendering and smoothed projection) and persisted Kalman state. After
 * the snapshot the client switches to the live binary + JSON channels.
 */
export const VESSEL_SNAPSHOT_FRAME_KIND = 'vessel.snapshot' as const;

/**
 * One position sample as persisted in VesselPosition and rehydrated
 * client-side for trail rendering and smoothed dead-reckoning. The
 * server reads the most recent N samples per mmsi (descending by
 * ingestTimestamp), reverses to chronological order, and ships them
 * inline on this frame.
 */
export type VesselHistoryPoint = {
  readonly lng: number;
  readonly lat: number;
  readonly sog: number | null;
  readonly cog: number | null;
  readonly trueHeading: number | null;
  readonly timestampUnix: number;
};

/**
 * Persisted Kalman filter state for a vessel. State vector is
 * [lng, lat, vlng, vlat] where vlng / vlat are degrees per second.
 * Covariance is a 4x4 symmetric positive-definite matrix flattened
 * row-major (16 floats) for JSON serialisation and Prisma storage.
 * `updatedAtUnix` is the server-side wall clock of the last update,
 * used to compute dt when the next measurement arrives.
 */
export type VesselKalmanState = {
  readonly lng: number;
  readonly lat: number;
  readonly vlng: number;
  readonly vlat: number;
  readonly covariance: readonly number[];
  readonly updatedAtUnix: number;
};

export type VesselSnapshotEntry = {
  readonly mmsi: Mmsi;
  readonly staticData: Omit<VesselStaticDataFrame, 'kind'> | null;
  readonly history: readonly VesselHistoryPoint[];
  readonly kalman: VesselKalmanState | null;
};

export type VesselSnapshotFrame = {
  readonly kind: typeof VESSEL_SNAPSHOT_FRAME_KIND;
  readonly serverTimeUnix: number;
  readonly vessels: readonly VesselSnapshotEntry[];
};

/** Maximum number of history points the snapshot carries per vessel. */
export const VESSEL_HISTORY_MAX_POINTS = 30;
