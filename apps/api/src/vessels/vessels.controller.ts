import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';

import {
  ListVesselsQuerySchema,
  MmsiParamSchema,
  safeParse,
  type VesselListResponse,
  type VesselSummary,
} from './vessels.dto';
import { VesselsService } from './vessels.service';

@Controller('vessels')
export class VesselsController {
  constructor(private readonly vessels: VesselsService) {}

  @Get()
  async list(@Query() query: unknown): Promise<VesselListResponse> {
    const { limit } = safeParse(ListVesselsQuerySchema, query);
    const vessels = await this.vessels.listVessels(limit);
    return { vessels };
  }

  @Get(':mmsi')
  async byMmsi(@Param() params: unknown): Promise<VesselSummary> {
    const { mmsi } = safeParse(MmsiParamSchema, params);
    const vessel = await this.vessels.getVessel(mmsi);
    if (vessel === null) {
      throw new NotFoundException(`vessel mmsi=${String(mmsi)} not found`);
    }
    return vessel;
  }
}
