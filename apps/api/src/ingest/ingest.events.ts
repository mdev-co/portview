import type { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  AisMessage,
  ClassBStaticData,
  SourceId,
  StaticData,
} from '@sps/shared';

/**
 * Event names published on the in-process EventEmitter2 bus by
 * IngestService. Subscribers (e.g. TelemetryWsGateway) bind via
 * `@OnEvent(VESSEL_UPDATE_EVENT)`.
 *
 * Event names use dot notation per @nestjs/event-emitter convention.
 */
export const VESSEL_UPDATE_EVENT = 'vessel.update';
export const VESSEL_STATIC_EVENT = 'vessel.static.update';

/** Payload published whenever a frame clears the GIGO gate. */
export type VesselUpdateEvent = {
  readonly message: AisMessage;
  readonly sourceId: SourceId;
  readonly receivedAt: number;
};

/**
 * Payload for static-data updates - AIS type 5 (Class A) or type 24
 * (Class B PartA / PartB). Carried on a separate event because the
 * binary 40-byte frame codec cannot represent strings; the gateway
 * serialises this to a JSON text frame instead. The wire frame is the
 * same `VesselStaticDataFrame` shape for both types - Class B leaves
 * imo, eta, destination, draught as null/empty.
 */
export type VesselStaticEvent = {
  readonly message: StaticData | ClassBStaticData;
  readonly sourceId: SourceId;
  readonly receivedAt: number;
};

/**
 * Typed publisher. Use this from any producer instead of calling
 * `eventBus.emit(VESSEL_UPDATE_EVENT, ...)` directly so the payload
 * shape is checked by the compiler at the publish site.
 */
export function publishVesselUpdate(
  bus: EventEmitter2,
  payload: VesselUpdateEvent,
): boolean {
  return bus.emit(VESSEL_UPDATE_EVENT, payload);
}

export function publishVesselStatic(
  bus: EventEmitter2,
  payload: VesselStaticEvent,
): boolean {
  return bus.emit(VESSEL_STATIC_EVENT, payload);
}
