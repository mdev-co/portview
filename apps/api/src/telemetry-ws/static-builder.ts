import {
  VESSEL_STATIC_FRAME_KIND,
  type VesselStaticDataFrame,
} from '@sps/shared';
import type { VesselStaticEvent } from '../ingest/ingest.events';

/**
 * Convert a validated `VesselStaticEvent` (AIS type 5) into the
 * JSON-text wire frame the FE consumes. Drops upstream-only fields
 * (`repeatIndicator`, `aisVersion`, `epfdType`, `dte`) the FE never
 * renders. `receivedAt` is ms since epoch to stay consistent with the
 * shared `LiveVessel` timestamp scale.
 */
export function buildVesselStaticFrame(
  event: VesselStaticEvent,
): VesselStaticDataFrame {
  const { message, receivedAt } = event;
  return {
    kind: VESSEL_STATIC_FRAME_KIND,
    mmsi: message.mmsi,
    vesselName: message.vesselName,
    imo: message.imo,
    callSign: message.callSign,
    shipType: message.shipType,
    dimensions: message.dimensions,
    draught: message.draught,
    destination: message.destination,
    eta: message.eta,
    receivedAt,
  };
}
