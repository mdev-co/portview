import { Module } from '@nestjs/common';
import { TelemetryWsGateway } from './telemetry-ws.gateway';

/**
 * Push-only binary WebSocket gateway for vessel telemetry. Subscribes
 * to vessel.update events from the IngestService and broadcasts the
 * 38-byte encoded frame to connected clients. No HTTP controllers, no
 * client→server protocol.
 */
@Module({
  providers: [TelemetryWsGateway],
})
export class TelemetryWsModule {}
