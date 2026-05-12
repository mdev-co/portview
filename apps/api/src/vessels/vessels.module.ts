import { Module } from '@nestjs/common';

import { VesselsController } from './vessels.controller';
import { VesselsService } from './vessels.service';

@Module({
  controllers: [VesselsController],
  providers: [VesselsService],
})
export class VesselsModule {}
