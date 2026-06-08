import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { VesselSummary } from './vessels.dto';

/**
 * Raw-SQL row shape from the LATERAL JOIN query below. Columns are the
 * snake_case names PostgreSQL returns; `toSummary` normalises them to
 * the camelCase `VesselSummary` shape the REST DTO contracts.
 *
 * The LATERAL JOIN replaces the previous Prisma `findMany` with
 * `include: { positions: { take: 1 } }` pattern. On PostgreSQL, Prisma
 * does NOT emit a per-parent LIMIT for the included relation - it
 * issues `SELECT * FROM vessel_positions WHERE vessel_mmsi IN (...) ORDER BY ...`
 * and trims to N positions per vessel in JavaScript after pulling the
 * entire matching set. With a `vessel_positions` table that grows
 * unbounded, that one query pulled tens of megabytes per request,
 * exhausted the connection pool and starved the event loop. The
 * LATERAL form below pushes the per-vessel LIMIT down into the SQL
 * planner, so each parent contributes at most one row from the child
 * table.
 */
type VesselRow = {
  mmsi: number;
  imo: number | null;
  name: string | null;
  call_sign: string | null;
  ship_type: number | null;
  to_bow: number | null;
  to_stern: number | null;
  to_port: number | null;
  to_starboard: number | null;
  draught: number | null;
  destination: string | null;
  eta: Date | null;
  last_seen_at: Date | null;
  kalman_lng: number | null;
  kalman_lat: number | null;
  kalman_vlng: number | null;
  kalman_vlat: number | null;
  kalman_updated_at: Date | null;
  // From the LATERAL subquery - all nullable because the LEFT JOIN
  // yields NULLs for a vessel that has no position rows yet (race
  // window between static-only frame and first position frame).
  pos_lat: number | null;
  pos_lng: number | null;
  pos_speed_over_ground: number | null;
  pos_course_over_ground: number | null;
  pos_true_heading: number | null;
  pos_nav_status: number | null;
  pos_rate_of_turn: number | null;
  pos_broadcast_timestamp: Date | null;
  pos_ingest_timestamp: Date | null;
};

@Injectable()
export class VesselsService {
  constructor(private readonly prisma: PrismaService) {}

  async listVessels(limit: number): Promise<VesselSummary[]> {
    const rows = await this.prisma.$queryRaw<VesselRow[]>`
      SELECT v.mmsi, v.imo, v.name, v.call_sign, v.ship_type,
             v.to_bow, v.to_stern, v.to_port, v.to_starboard,
             v.draught, v.destination, v.eta, v.last_seen_at,
             v.kalman_lng, v.kalman_lat, v.kalman_vlng, v.kalman_vlat,
             v.kalman_updated_at,
             p.lat AS pos_lat, p.lng AS pos_lng,
             p.speed_over_ground AS pos_speed_over_ground,
             p.course_over_ground AS pos_course_over_ground,
             p.true_heading AS pos_true_heading,
             p.nav_status AS pos_nav_status,
             p.rate_of_turn AS pos_rate_of_turn,
             p.broadcast_timestamp AS pos_broadcast_timestamp,
             p.ingest_timestamp AS pos_ingest_timestamp
      FROM vessels v
      LEFT JOIN LATERAL (
        SELECT lat, lng, speed_over_ground, course_over_ground,
               true_heading, nav_status, rate_of_turn,
               broadcast_timestamp, ingest_timestamp
        FROM vessel_positions
        WHERE vessel_mmsi = v.mmsi
        ORDER BY ingest_timestamp DESC
        LIMIT 1
      ) p ON true
      ORDER BY v.last_seen_at DESC NULLS LAST
      LIMIT ${Prisma.sql`${limit}`}
    `;
    return rows.map(toSummary);
  }

  async getVessel(mmsi: number): Promise<VesselSummary | null> {
    const rows = await this.prisma.$queryRaw<VesselRow[]>`
      SELECT v.mmsi, v.imo, v.name, v.call_sign, v.ship_type,
             v.to_bow, v.to_stern, v.to_port, v.to_starboard,
             v.draught, v.destination, v.eta, v.last_seen_at,
             v.kalman_lng, v.kalman_lat, v.kalman_vlng, v.kalman_vlat,
             v.kalman_updated_at,
             p.lat AS pos_lat, p.lng AS pos_lng,
             p.speed_over_ground AS pos_speed_over_ground,
             p.course_over_ground AS pos_course_over_ground,
             p.true_heading AS pos_true_heading,
             p.nav_status AS pos_nav_status,
             p.rate_of_turn AS pos_rate_of_turn,
             p.broadcast_timestamp AS pos_broadcast_timestamp,
             p.ingest_timestamp AS pos_ingest_timestamp
      FROM vessels v
      LEFT JOIN LATERAL (
        SELECT lat, lng, speed_over_ground, course_over_ground,
               true_heading, nav_status, rate_of_turn,
               broadcast_timestamp, ingest_timestamp
        FROM vessel_positions
        WHERE vessel_mmsi = v.mmsi
        ORDER BY ingest_timestamp DESC
        LIMIT 1
      ) p ON true
      WHERE v.mmsi = ${mmsi}
      LIMIT 1
    `;
    const row = rows[0];
    return row === undefined ? null : toSummary(row);
  }
}

function toSummary(row: VesselRow): VesselSummary {
  const dimensions =
    row.to_bow !== null &&
    row.to_stern !== null &&
    row.to_port !== null &&
    row.to_starboard !== null
      ? {
          toBow: row.to_bow,
          toStern: row.to_stern,
          toPort: row.to_port,
          toStarboard: row.to_starboard,
        }
      : null;
  const kalmanState =
    row.kalman_lng !== null &&
    row.kalman_lat !== null &&
    row.kalman_vlng !== null &&
    row.kalman_vlat !== null &&
    row.kalman_updated_at !== null
      ? {
          lng: row.kalman_lng,
          lat: row.kalman_lat,
          vlng: row.kalman_vlng,
          vlat: row.kalman_vlat,
          updatedAt: row.kalman_updated_at.toISOString(),
        }
      : null;
  const hasPosition = row.pos_lat !== null && row.pos_lng !== null;
  return {
    mmsi: row.mmsi,
    imo: row.imo,
    name: row.name,
    callSign: row.call_sign,
    shipType: row.ship_type,
    dimensions,
    draught: row.draught,
    destination: row.destination,
    eta: row.eta?.toISOString() ?? null,
    lastSeenAt: row.last_seen_at?.toISOString() ?? null,
    position: hasPosition
      ? {
          lat: row.pos_lat as number,
          lng: row.pos_lng as number,
          speedOverGround: row.pos_speed_over_ground,
          courseOverGround: row.pos_course_over_ground,
          trueHeading: row.pos_true_heading,
          navStatus: row.pos_nav_status,
          rateOfTurn: row.pos_rate_of_turn,
          broadcastTimestamp:
            row.pos_broadcast_timestamp?.toISOString() ?? null,
          updatedAt: (
            row.pos_broadcast_timestamp ??
            row.pos_ingest_timestamp ??
            new Date()
          ).toISOString(),
        }
      : null,
    kalmanState,
  };
}
