import { join } from 'node:path';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IngestModule } from './ingest/ingest.module';
import { PrismaModule } from './prisma/prisma.module';
import { TelemetryWsModule } from './telemetry-ws/telemetry-ws.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: join(__dirname, '../../..', '.env'),
    }),
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 10,
      verboseMemoryLeak: true,
    }),
    PrismaModule,
    IngestModule,
    TelemetryWsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
