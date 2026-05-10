import {
  type AisMessage,
  MMSI_MID_DIVISOR,
  MMSI_MID_MAX,
  MMSI_MID_MIN,
  type SourceId,
  VESSEL_FLAG_HAS_FIX,
  VESSEL_FLAG_HAS_IDENTITY,
  VESSEL_FLAG_IS_MOVING,
  type VesselUpdateFrame,
} from '@sps/shared';

export type FrameBuilderInput = {
  readonly message: AisMessage;
  readonly sourceId: SourceId;
  readonly receivedAt: number;
};

const MOVING_SOG_KNOTS_THRESHOLD = 0.5;

function hasIdentity(mmsi: number): boolean {
  const mid = Math.floor(mmsi / MMSI_MID_DIVISOR);
  return mid >= MMSI_MID_MIN && mid <= MMSI_MID_MAX;
}

function computeFlags(
  mmsi: number,
  sog: number | null,
  position: readonly [number, number] | null,
): number {
  let flags = 0;
  if (sog !== null && sog > MOVING_SOG_KNOTS_THRESHOLD) {
    flags |= VESSEL_FLAG_IS_MOVING;
  }
  if (position !== null) flags |= VESSEL_FLAG_HAS_FIX;
  if (hasIdentity(mmsi)) flags |= VESSEL_FLAG_HAS_IDENTITY;
  return flags;
}

/**
 * Convert a validated AisMessage into the wire-level VesselUpdateFrame
 * that the binary WebSocket gateway broadcasts. Lossy by design: only
 * the fields the codec carries are surfaced, the rest is dropped.
 *
 * Type 5 (Class A static) and type 24 (Class B static) yield a frame
 * with null position fields; the FE uses the parallel JSON text-frame
 * channel for the readable static-data payload. Position messages
 * (1/2/3/18) yield the full spatial payload.
 */
export function buildVesselFrame(input: FrameBuilderInput): VesselUpdateFrame {
  const { message, sourceId, receivedAt } = input;
  const timestampUnix = Math.floor(receivedAt / 1000);
  const position =
    'position' in message && message.position !== null
      ? message.position
      : null;
  const lng = position !== null ? position[0] : null;
  const lat = position !== null ? position[1] : null;

  const base = {
    messageType: message.messageType,
    mmsi: message.mmsi,
    sourceId,
    timestampUnix,
    reserved: 0,
  };

  switch (message.messageType) {
    case 1:
    case 2:
    case 3:
      return {
        ...base,
        navStatus: message.navigationStatus,
        rateOfTurn: message.rateOfTurn,
        lng,
        lat,
        sog: message.speedOverGround,
        cog: message.courseOverGround,
        trueHeading: message.trueHeading,
        flags: computeFlags(message.mmsi, message.speedOverGround, position),
      };
    case 18:
      return {
        ...base,
        navStatus: null,
        rateOfTurn: null,
        lng,
        lat,
        sog: message.speedOverGround,
        cog: message.courseOverGround,
        trueHeading: message.trueHeading,
        flags: computeFlags(message.mmsi, message.speedOverGround, position),
      };
    case 5:
    case 24:
      return {
        ...base,
        navStatus: null,
        rateOfTurn: null,
        lng: null,
        lat: null,
        sog: null,
        cog: null,
        trueHeading: null,
        flags: computeFlags(message.mmsi, null, null),
      };
  }
}
