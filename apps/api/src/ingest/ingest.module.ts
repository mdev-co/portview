import { Module } from '@nestjs/common';
import { IngestService } from './ingest.service';

/**
 * IngestModule lifts the former apps/ingest worker into the API.
 *
 * Sources, the GIGO decoder, the DLQ writer and the priority FSM all
 * live behind a single Injectable service that NestJS starts via
 * `OnModuleInit` and stops via `OnModuleDestroy`. Validated AisMessage
 * events are published on the in-process EventEmitter2 bus
 * (`vessel.update`); transports such as the future TelemetryWsGateway
 * subscribe via `@OnEvent` and decide how to fan out.
 *
 * No HTTP controllers; this module is internal infrastructure.
 */
@Module({
  providers: [IngestService],
  exports: [IngestService],
})
export class IngestModule {}
