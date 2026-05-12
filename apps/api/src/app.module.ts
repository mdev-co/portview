import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IngestModule } from './ingest/ingest.module';
import { PersistenceModule } from './persistence/persistence.module';
import { PrismaModule } from './prisma/prisma.module';
import { TelemetryWsModule } from './telemetry-ws/telemetry-ws.module';
import { VesselsModule } from './vessels/vessels.module';

@Module({
  imports: [
    // env is preloaded via dotenv-cli in package.json scripts (start*,
    // db:*); ConfigModule reads the already-populated process.env.
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 10,
      verboseMemoryLeak: true,
    }),
    // HTTP throttling at the controller layer. The global guard
    // registered below applies these limits to every public REST
    // route unless individually overridden. The WebSocket gateway
    // is unaffected; it has its own connection cap and backpressure
    // in TelemetryWsGateway.
    ThrottlerModule.forRoot([
      // Short window: catches burst floods (e.g. scripted scrape).
      { name: 'short', ttl: 1_000, limit: 10 },
      // Long window: catches sustained abuse (rolling minute).
      { name: 'long', ttl: 60_000, limit: 100 },
    ]),
    PrismaModule,
    IngestModule,
    PersistenceModule,
    TelemetryWsModule,
    VesselsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
