import type { StaticDimensions, StaticEta } from './static-data';

/**
 * Discriminator literal used as the `kind` field on every JSON-text
 * frame the telemetry gateway sends. Position updates remain binary;
 * static data uses JSON because the payload carries strings (vessel
 * name, callSign, destination) which the 40-byte VesselUpdateFrame
 * codec cannot represent. A discriminator on the JSON envelope keeps
 * the FE dispatch trivial and leaves room for additional non-binary
 * frame kinds without renegotiating the protocol.
 */
export const VESSEL_STATIC_FRAME_KIND = 'vessel.static' as const;

/**
 * Subset of ITU-R M.1371-5 §3.3.8.3.5 ShipStaticData (type 5) the FE
 * actually renders. Sent as a JSON text frame on /ws/telemetry next to
 * the existing binary VesselUpdateFrame stream.
 */
export type VesselStaticDataFrame = {
  readonly kind: typeof VESSEL_STATIC_FRAME_KIND;
  readonly mmsi: number;
  readonly vesselName: string;
  readonly imo: number | null;
  readonly callSign: string;
  readonly shipType: number;
  readonly dimensions: StaticDimensions | null;
  readonly draught: number | null;
  readonly destination: string;
  readonly eta: StaticEta;
  readonly receivedAt: number;
};
