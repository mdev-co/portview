import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SnapshotBuilder } from './snapshot-builder';
import { TelemetryWsGateway } from './telemetry-ws.gateway';

/**
 * Push-only binary WebSocket gateway for vessel telemetry. Subscribes
 * to vessel.update events from the IngestService and broadcasts the
 * 38-byte encoded frame to connected clients. No HTTP controllers, no
 * client→server protocol.
 *
 * Also serves a cold-start JSON snapshot frame on each new connection,
 * built by SnapshotBuilder over Prisma so the FE has names, history and
 * Kalman state before the first live AIS report arrives.
 */
@Module({
  imports: [PrismaModule],
  providers: [TelemetryWsGateway, SnapshotBuilder],
})
export class TelemetryWsModule {}
