import {
  type AisMessage,
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

const MOVING_SOG_KNOTS = 0.5;
const MID_REGION_MIN = 200;
const MID_REGION_MAX = 799;

function hasIdentity(mmsi: number): boolean {
  const mid = Math.floor(mmsi / 1_000_000);
  return mid >= MID_REGION_MIN && mid <= MID_REGION_MAX;
}

function computeFlags(
  mmsi: number,
  sog: number | null,
  position: readonly [number, number] | null,
): number {
  let flags = 0;
  if (sog !== null && sog > MOVING_SOG_KNOTS) flags |= VESSEL_FLAG_IS_MOVING;
  if (position !== null) flags |= VESSEL_FLAG_HAS_FIX;
  if (hasIdentity(mmsi)) flags |= VESSEL_FLAG_HAS_IDENTITY;
  return flags;
}

/**
 * Convert a validated AisMessage into the wire-level VesselUpdateFrame
 * that the binary WebSocket gateway broadcasts. Lossy by design: only
 * the fields the codec carries are surfaced, the rest is dropped.
 *
 * Type 5 (StaticData) yields a frame with null position fields; the FE
 * may use it for vessel-name / IMO updates or skip rendering. Position
 * messages (1/2/3/18) yield the full spatial payload.
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

  switch (message.messageType) {
    case 1:
    case 2:
    case 3:
      return {
        messageType: message.messageType,
        mmsi: message.mmsi,
        navStatus: message.navigationStatus,
        sourceId,
        rateOfTurn: message.rateOfTurn,
        lng,
        lat,
        sog: message.speedOverGround,
        cog: message.courseOverGround,
        trueHeading: message.trueHeading,
        timestampUnix,
        flags: computeFlags(message.mmsi, message.speedOverGround, position),
        reserved: 0,
      };
    case 18:
      return {
        messageType: message.messageType,
        mmsi: message.mmsi,
        navStatus: null,
        sourceId,
        rateOfTurn: null,
        lng,
        lat,
        sog: message.speedOverGround,
        cog: message.courseOverGround,
        trueHeading: message.trueHeading,
        timestampUnix,
        flags: computeFlags(message.mmsi, message.speedOverGround, position),
        reserved: 0,
      };
    case 5:
      return {
        messageType: message.messageType,
        mmsi: message.mmsi,
        navStatus: null,
        sourceId,
        rateOfTurn: null,
        lng: null,
        lat: null,
        sog: null,
        cog: null,
        trueHeading: null,
        timestampUnix,
        flags: computeFlags(message.mmsi, null, null),
        reserved: 0,
      };
  }
}
