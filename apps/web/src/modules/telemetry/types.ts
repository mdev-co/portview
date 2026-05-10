import type { Mmsi, SourceId } from '@sps/shared';

/**
 * Live vessel as held in the Nano Stores hot-path map. Mirrors the
 * VesselUpdateFrame wire schema; FE consumers read this shape, not the
 * raw frame.
 */
export type LiveVessel = {
  readonly mmsi: Mmsi;
  readonly messageType: number;
  readonly navStatus: number | null;
  readonly sourceId: SourceId;
  readonly rateOfTurn: number | null;
  readonly lng: number | null;
  readonly lat: number | null;
  readonly sog: number | null;
  readonly cog: number | null;
  readonly trueHeading: number | null;
  readonly timestampUnix: number;
  readonly flags: number;
};
