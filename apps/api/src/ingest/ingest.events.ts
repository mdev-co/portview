import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { AisMessage, SourceId } from '@sps/shared';

/**
 * Event names published on the in-process EventEmitter2 bus by
 * IngestService. Subscribers (e.g. TelemetryWsGateway) bind via
 * `@OnEvent(VESSEL_UPDATE_EVENT)`.
 *
 * Event names use dot notation per @nestjs/event-emitter convention.
 */
export const VESSEL_UPDATE_EVENT = 'vessel.update';

/** Payload published whenever a frame clears the GIGO gate. */
export type VesselUpdateEvent = {
  readonly message: AisMessage;
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
