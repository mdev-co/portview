import * as path from 'node:path';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { IngestModule } from './ingest/ingest.module';
import { PersistenceModule } from './persistence/persistence.module';
import { PrismaModule } from './prisma/prisma.module';
import { TelemetryWsModule } from './telemetry-ws/telemetry-ws.module';
import { VesselsModule } from './vessels/vessels.module';

@Module({
  imports: [
    // ConfigModule loads the repo-root .env directly so `nest start
    // --watch` rebuilds keep env across child-process respawns (the
    // dotenv-cli wrapper in package.json runs once per pnpm script
    // invocation; nest's internal restart on file-change does not
    // re-run it, so values disappear from the child env). Loading
    // here makes start:dev, openapi:dump and tests all read the
    // same source regardless of how they were spawned.
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: path.resolve(__dirname, '..', '..', '..', '.env'),
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
      // Short window: catches burst floods (e.g. scripted scrape). A
      // browser hard-refresh fires ~4-6 parallel REST calls (Orval
      // hydrate of /api/vessels plus a few resources) in under 200 ms,
      // so the previous limit of 10 was hit by two consecutive reloads
      // sharing one NAT IP. 30/s tolerates that natural cadence while
      // still snapping shut on a real scrape loop.
      { name: 'short', ttl: 1_000, limit: 30 },
      // Long window: catches sustained abuse (rolling minute). 100/min
      // was undersized for an operator who hits the page, clicks a few
      // overlays, and triggers the tab-visibility refresh path; a real
      // session burns 200-400 requests easily. 600/min keeps a single
      // legitimate IP comfortable for ~ten minutes of active use.
      { name: 'long', ttl: 60_000, limit: 600 },
    ]),
    PrismaModule,
    IngestModule,
    PersistenceModule,
    TelemetryWsModule,
    VesselsModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
