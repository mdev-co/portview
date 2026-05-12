import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z, ZodError, type ZodSchema } from 'zod';

import {
  EXAMPLE_CALL_SIGN,
  EXAMPLE_COURSE_OVER_GROUND_DEG,
  EXAMPLE_DESTINATION,
  EXAMPLE_IMO,
  EXAMPLE_LAT,
  EXAMPLE_LNG,
  EXAMPLE_MMSI,
  EXAMPLE_NAV_STATUS,
  EXAMPLE_SHIP_TYPE,
  EXAMPLE_SPEED_OVER_GROUND_KN,
  EXAMPLE_TRUE_HEADING_DEG,
  EXAMPLE_VESSEL_NAME,
} from './vessels.constants';

export const VESSELS_DEFAULT_LIMIT = 100;
export const VESSELS_MAX_LIMIT = 500;

export const ListVesselsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(VESSELS_MAX_LIMIT)
    .optional()
    .default(VESSELS_DEFAULT_LIMIT),
});
export type ListVesselsQuery = z.infer<typeof ListVesselsQuerySchema>;

export const MmsiParamSchema = z.object({
  mmsi: z.coerce.number().int().positive(),
});
export type MmsiParam = z.infer<typeof MmsiParamSchema>;

/**
 * Parse an HTTP boundary value with Zod and translate ZodError into
 * a NestJS BadRequestException so clients get a typed HTTP 400 with
 * a field-level error map. Raw `schema.parse()` would let the
 * ZodError bubble up to the default exception filter, which masks
 * it as a generic 500 InternalServerError and hides the real cause.
 *
 * Transient: PR B replaces this helper with `typia.assert<T>` once
 * the validator stack consolidates around TypeScript types as the
 * single source of truth.
 */
export function safeParse<T>(schema: ZodSchema<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        details: err.flatten(),
      });
    }
    throw err;
  }
}

/**
 * Response DTOs are classes (not type aliases) so @nestjs/swagger
 * can introspect them and produce an OpenAPI schema. Field examples
 * import from ./vessels.constants to keep the documentation
 * coherent across @ApiProperty, OpenAPI generation and seed data.
 */
export class VesselPositionSummary {
  @ApiProperty({ type: 'number', example: EXAMPLE_LAT })
  lat!: number;

  @ApiProperty({ type: 'number', example: EXAMPLE_LNG })
  lng!: number;

  @ApiProperty({
    type: 'number',
    nullable: true,
    example: EXAMPLE_SPEED_OVER_GROUND_KN,
  })
  speedOverGround!: number | null;

  @ApiProperty({
    type: 'number',
    nullable: true,
    example: EXAMPLE_COURSE_OVER_GROUND_DEG,
  })
  courseOverGround!: number | null;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    example: EXAMPLE_TRUE_HEADING_DEG,
  })
  trueHeading!: number | null;

  @ApiProperty({ type: 'integer', nullable: true, example: EXAMPLE_NAV_STATUS })
  navStatus!: number | null;

  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: string;
}

export class VesselSummary {
  @ApiProperty({ type: 'integer', example: EXAMPLE_MMSI })
  mmsi!: number;

  @ApiProperty({ type: 'integer', nullable: true, example: EXAMPLE_IMO })
  imo!: number | null;

  @ApiProperty({ type: 'string', nullable: true, example: EXAMPLE_VESSEL_NAME })
  name!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: EXAMPLE_CALL_SIGN })
  callSign!: string | null;

  @ApiProperty({ type: 'integer', nullable: true, example: EXAMPLE_SHIP_TYPE })
  shipType!: number | null;

  @ApiProperty({ type: 'string', nullable: true, example: EXAMPLE_DESTINATION })
  destination!: string | null;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  eta!: string | null;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  lastSeenAt!: string | null;

  @ApiProperty({ type: () => VesselPositionSummary, nullable: true })
  position!: VesselPositionSummary | null;
}

export class VesselListResponse {
  @ApiProperty({ type: () => [VesselSummary] })
  vessels!: VesselSummary[];
}
