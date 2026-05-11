import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VesselPersistenceService } from './vessel-persistence.service';

@Module({
  imports: [PrismaModule],
  providers: [VesselPersistenceService],
  exports: [VesselPersistenceService],
})
export class PersistenceModule {}
