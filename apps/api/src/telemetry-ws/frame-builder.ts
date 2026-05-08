import {
  type AisMessage,
  type SourceId,
  type VesselUpdateFrame,
} from '@sps/shared';

export type FrameBuilderInput = {
  readonly message: AisMessage;
  readonly sourceId: SourceId;
  readonly receivedAt: number;
};

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
  const lng =
    'position' in message && message.position !== null
      ? message.position[0]
      : null;
  const lat =
    'position' in message && message.position !== null
      ? message.position[1]
      : null;

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
      };
  }
}
