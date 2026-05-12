import { TypedParam, TypedQuery, TypedRoute } from '@nestia/core';
import { Controller, NotFoundException } from '@nestjs/common';

import type {
  ListVesselsQuery,
  VesselListResponse,
  VesselSummary,
} from './vessels.dto';
import { VESSELS_DEFAULT_LIMIT } from './vessels.dto';
import { VesselsService } from './vessels.service';

/**
 * Vessels REST surface. Decorators come from @nestia/core: the AOT
 * transformer reads the parameter and return types declared here and
 * generates both the runtime validator and the OpenAPI schema, so
 * the wire format and the source code share a single source of truth.
 */
@Controller('vessels')
export class VesselsController {
  constructor(private readonly vessels: VesselsService) {}

  @TypedRoute.Get()
  async list(
    @TypedQuery() query: ListVesselsQuery,
  ): Promise<VesselListResponse> {
    const vessels = await this.vessels.listVessels(
      query.limit ?? VESSELS_DEFAULT_LIMIT,
    );
    return { vessels };
  }

  @TypedRoute.Get(':mmsi')
  async byMmsi(@TypedParam('mmsi') mmsi: number): Promise<VesselSummary> {
    const vessel = await this.vessels.getVessel(mmsi);
    if (vessel === null) {
      throw new NotFoundException(`vessel mmsi=${String(mmsi)} not found`);
    }
    return vessel;
  }
}
