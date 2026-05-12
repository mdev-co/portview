import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { EXAMPLE_MMSI } from './vessels.constants';
import {
  ListVesselsQuerySchema,
  MmsiParamSchema,
  safeParse,
  VESSELS_DEFAULT_LIMIT,
  VESSELS_MAX_LIMIT,
  VesselListResponse,
  VesselSummary,
} from './vessels.dto';
import { VesselsService } from './vessels.service';

@ApiTags('vessels')
@Controller('vessels')
export class VesselsController {
  constructor(private readonly vessels: VesselsService) {}

  @Get()
  @ApiOperation({
    operationId: 'listVessels',
    summary: 'List recently seen vessels',
    description:
      'Returns vessels ordered by lastSeenAt desc. Each row carries the static record plus the latest position via a Prisma nested select.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: 'integer',
    description: `Page size, 1-${VESSELS_MAX_LIMIT}. Defaults to ${VESSELS_DEFAULT_LIMIT}.`,
    example: VESSELS_DEFAULT_LIMIT,
  })
  @ApiOkResponse({ type: VesselListResponse })
  @ApiBadRequestResponse({
    description: 'Invalid query parameters (e.g. limit out of range).',
  })
  async list(@Query() query: unknown): Promise<VesselListResponse> {
    const { limit } = safeParse(ListVesselsQuerySchema, query);
    const vessels = await this.vessels.listVessels(limit);
    return { vessels };
  }

  @Get(':mmsi')
  @ApiOperation({
    operationId: 'getVesselByMmsi',
    summary: 'Get a single vessel by MMSI',
    description:
      'Returns the vessel and its latest position. Responds with 404 when the MMSI is not in the database.',
  })
  @ApiParam({
    name: 'mmsi',
    type: 'integer',
    description: '9-digit MMSI identifier.',
    example: EXAMPLE_MMSI,
  })
  @ApiOkResponse({ type: VesselSummary })
  @ApiNotFoundResponse({ description: 'No vessel found for this MMSI.' })
  @ApiBadRequestResponse({ description: 'MMSI not a positive integer.' })
  async byMmsi(@Param() params: unknown): Promise<VesselSummary> {
    const { mmsi } = safeParse(MmsiParamSchema, params);
    const vessel = await this.vessels.getVessel(mmsi);
    if (vessel === null) {
      throw new NotFoundException(`vessel mmsi=${String(mmsi)} not found`);
    }
    return vessel;
  }
}
