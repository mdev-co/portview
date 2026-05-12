import type { tags } from 'typia';

/**
 * Boundary types for the vessels endpoint.
 *
 * Plain TypeScript declarations - no Zod, no @ApiProperty. The nestia
 * AOT transformer reads the types from the controller signature and
 * emits both the runtime validator and the OpenAPI schema, so the
 * shape on the wire and the shape in code cannot drift.
 *
 * Typia `tags.*` express constraints inline: integer range, format,
 * pattern. The transformer turns each tag into a check inside the
 * generated validator and into a JSON schema keyword in the spec.
 */

export const VESSELS_DEFAULT_LIMIT = 100;
export const VESSELS_MAX_LIMIT = 500;

export type ListVesselsQuery = {
  /**
   * Maximum number of vessels to return.
   * @default 100
   */
  limit?: number &
    tags.Type<'int32'> &
    tags.Minimum<1> &
    tags.Maximum<typeof VESSELS_MAX_LIMIT>;
};

export type MmsiParam = {
  /**
   * Maritime Mobile Service Identity. Nine-digit positive integer.
   */
  mmsi: number & tags.Type<'int32'> & tags.Minimum<1> & tags.Maximum<999999999>;
};

export type VesselPositionSummary = {
  lat: number & tags.Minimum<-90> & tags.Maximum<90>;
  lng: number & tags.Minimum<-180> & tags.Maximum<180>;
  speedOverGround: number | null;
  courseOverGround: number | null;
  trueHeading: (number & tags.Type<'int32'>) | null;
  navStatus: (number & tags.Type<'int32'>) | null;
  /**
   * ISO 8601 timestamp of the most recent position report.
   * @format date-time
   */
  updatedAt: string;
};

export type VesselSummary = {
  mmsi: number & tags.Type<'int32'>;
  imo: (number & tags.Type<'int32'>) | null;
  name: string | null;
  callSign: string | null;
  shipType: (number & tags.Type<'int32'>) | null;
  destination: string | null;
  /** @format date-time */
  eta: string | null;
  /** @format date-time */
  lastSeenAt: string | null;
  position: VesselPositionSummary | null;
};

export type VesselListResponse = {
  vessels: VesselSummary[];
};
