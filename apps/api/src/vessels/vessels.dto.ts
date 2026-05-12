import { BadRequestException } from '@nestjs/common';
import { z, ZodError, type ZodSchema } from 'zod';

export const ListVesselsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
});
export type ListVesselsQuery = z.infer<typeof ListVesselsQuerySchema>;

export const MmsiParamSchema = z.object({
  mmsi: z.coerce.number().int().positive(),
});
export type MmsiParam = z.infer<typeof MmsiParamSchema>;

/**
 * Parse an HTTP boundary value with Zod and translate ZodError into a
 * NestJS BadRequestException so clients get a typed HTTP 400 with a
 * field-level error map instead of a generic 500. Used by controllers
 * for @Query, @Param, @Body that arrive as `unknown`.
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

export type VesselPositionSummary = {
  lat: number;
  lng: number;
  speedOverGround: number | null;
  courseOverGround: number | null;
  trueHeading: number | null;
  navStatus: number | null;
  updatedAt: string;
};

export type VesselSummary = {
  mmsi: number;
  imo: number | null;
  name: string | null;
  callSign: string | null;
  shipType: number | null;
  destination: string | null;
  eta: string | null;
  lastSeenAt: string | null;
  position: VesselPositionSummary | null;
};

export type VesselListResponse = {
  vessels: VesselSummary[];
};
