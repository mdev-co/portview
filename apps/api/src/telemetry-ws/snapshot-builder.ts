import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type Mmsi,
  type SourceId,
  VESSEL_HISTORY_MAX_POINTS,
  VESSEL_SNAPSHOT_FRAME_KIND,
  type VesselHistoryPoint,
  type VesselKalmanState,
  type VesselSnapshotEntry,
  type VesselSnapshotFrame,
  type VesselStaticDataFrame,
} from '@sps/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Vessels with no live AIS report in this window are excluded from the snapshot. */
const SNAPSHOT_FRESHNESS_WINDOW_MS = 10 * 60 * 1_000;

/**
 * Hard cap on vessels returned in a single snapshot. Bounds the JSON
 * payload size and the per-snapshot memory footprint so a flood of
 * unique MMSIs that slips past the ingest guards still cannot blow
 * the api machine RAM or push a multi-megabyte frame to every
 * connected WebSocket client. Ordered by lastSeenAt desc, so when
 * the cap is reached the freshest vessels are kept.
 */
const SNAPSHOT_MAX_VESSELS = 500;

/**
 * Builds the catalog JSON frame that the telemetry gateway sends to a
 * freshly connected client. One DB round trip per snapshot: a single
 * findMany on `vessel` with a `_count`-like include for the recent
 * positions, ordered by `lastSeenAt` desc to keep busy ports first.
 *
 * The snapshot is intentionally JSON (discriminated by `kind`) so the
 * FE can route it the same way it routes static-data text frames; no
 * second protocol envelope to maintain.
 */
@Injectable()
export class SnapshotBuilder {
  private readonly log = new Logger(SnapshotBuilder.name);

  constructor(private readonly prisma: PrismaService) {}

  async build(nowMs: number = Date.now()): Promise<VesselSnapshotFrame> {
    const cutoff = new Date(nowMs - SNAPSHOT_FRESHNESS_WINDOW_MS);

    // Step 1: vessels with a live recent fix. Cheap query, indexed on
    // last_seen_at. No relation include - we used to pull positions
    // here via Prisma's `include + take` which on PostgreSQL emits an
    // un-bounded IN-clause select on vessel_positions and trims to N
    // per parent in JavaScript. With a vessel_positions table that
    // grows unbounded that one query starved the connection pool. The
    // LATERAL join below replaces it with a per-mmsi LIMIT pushed into
    // the SQL planner.
    const vessels = await this.prisma.vessel.findMany({
      where: { lastSeenAt: { gte: cutoff } },
      orderBy: { lastSeenAt: 'desc' },
      take: SNAPSHOT_MAX_VESSELS,
    });

    if (vessels.length === 0) {
      this.log.log(
        `snapshot built: vessels=0 (within ${SNAPSHOT_FRESHNESS_WINDOW_MS / 60_000} min)`,
      );
      return {
        kind: VESSEL_SNAPSHOT_FRAME_KIND,
        serverTimeUnix: Math.floor(nowMs / 1000),
        vessels: [],
      };
    }

    // Step 2: top N positions per vessel via LATERAL JOIN over the
    // mmsi array. unnest(int[]) produces one row per mmsi; the LATERAL
    // subquery yields at most VESSEL_HISTORY_MAX_POINTS rows for each.
    // Total result is bounded at vessels.length * N regardless of how
    // many historical positions the table holds.
    const mmsis = vessels.map((v) => v.mmsi);
    const positionRows = await this.prisma.$queryRaw<PositionRow[]>`
      SELECT m.mmsi AS vessel_mmsi,
             p.lat, p.lng,
             p.speed_over_ground, p.course_over_ground,
             p.true_heading,
             p.broadcast_timestamp, p.ingest_timestamp
      FROM unnest(${Prisma.sql`ARRAY[${Prisma.join(mmsis)}]::integer[]`}) AS m(mmsi)
      CROSS JOIN LATERAL (
        SELECT lat, lng, speed_over_ground, course_over_ground,
               true_heading, broadcast_timestamp, ingest_timestamp
        FROM vessel_positions
        WHERE vessel_mmsi = m.mmsi
        ORDER BY ingest_timestamp DESC
        LIMIT ${VESSEL_HISTORY_MAX_POINTS}
      ) p
    `;

    // Group positions by mmsi for O(1) lookup during entry assembly.
    // Map preserves insertion order; we reverse each list at emit so
    // the FE receives chronological points without an extra sort.
    const positionsByMmsi = new Map<number, PositionRow[]>();
    for (const row of positionRows) {
      const existing = positionsByMmsi.get(row.vessel_mmsi);
      if (existing === undefined) {
        positionsByMmsi.set(row.vessel_mmsi, [row]);
      } else {
        existing.push(row);
      }
    }

    const entries: VesselSnapshotEntry[] = vessels.map((v) => {
      const mmsi = v.mmsi as Mmsi;
      const rows = positionsByMmsi.get(v.mmsi) ?? [];
      // Reverse from DESC (DB order) to chronological for the FE.
      const history = rows
        .slice()
        .reverse()
        .map<VesselHistoryPoint>((p) => ({
          lng: p.lng,
          lat: p.lat,
          sog: p.speed_over_ground,
          cog: p.course_over_ground,
          trueHeading: p.true_heading,
          timestampUnix: Math.floor(
            (p.broadcast_timestamp ?? p.ingest_timestamp).getTime() / 1000,
          ),
        }));
      return {
        mmsi,
        staticData: buildStaticDataPayload(v, mmsi),
        history,
        kalman: buildKalmanState(v),
        sourceId: (v.lastSourceId as SourceId | null) ?? null,
      };
    });

    this.log.log(
      `snapshot built: vessels=${entries.length} (within ${SNAPSHOT_FRESHNESS_WINDOW_MS / 60_000} min)`,
    );

    return {
      kind: VESSEL_SNAPSHOT_FRAME_KIND,
      serverTimeUnix: Math.floor(nowMs / 1000),
      vessels: entries,
    };
  }
}

type PositionRow = {
  vessel_mmsi: number;
  lat: number;
  lng: number;
  speed_over_ground: number | null;
  course_over_ground: number | null;
  true_heading: number | null;
  broadcast_timestamp: Date | null;
  ingest_timestamp: Date;
};

type VesselRow = {
  mmsi: number;
  name: string | null;
  callSign: string | null;
  imo: number | null;
  shipType: number | null;
  toBow: number | null;
  toStern: number | null;
  toPort: number | null;
  toStarboard: number | null;
  draught: number | null;
  destination: string | null;
  eta: Date | null;
  lastSeenAt: Date | null;
  lastSourceId: number | null;
  kalmanLng: number | null;
  kalmanLat: number | null;
  kalmanVlng: number | null;
  kalmanVlat: number | null;
  kalmanCovariance: unknown;
  kalmanUpdatedAt: Date | null;
};

function buildStaticDataPayload(
  v: VesselRow,
  mmsi: Mmsi,
): Omit<VesselStaticDataFrame, 'kind'> | null {
  // Skip entries with no useful static data at all (mmsi-only rows).
  if (
    v.name === null &&
    v.callSign === null &&
    v.imo === null &&
    v.shipType === null &&
    v.destination === null &&
    v.eta === null &&
    v.draught === null &&
    v.toBow === null
  ) {
    return null;
  }
  const dimensions =
    v.toBow !== null ||
    v.toStern !== null ||
    v.toPort !== null ||
    v.toStarboard !== null
      ? {
          toBow: v.toBow ?? 0,
          toStern: v.toStern ?? 0,
          toPort: v.toPort ?? 0,
          toStarboard: v.toStarboard ?? 0,
        }
      : null;
  return {
    mmsi,
    vesselName: v.name ?? '',
    imo: v.imo as VesselStaticDataFrame['imo'],
    callSign: v.callSign ?? '',
    shipType: (v.shipType ?? 0) as VesselStaticDataFrame['shipType'],
    dimensions,
    draught: v.draught,
    destination: v.destination ?? '',
    eta: etaFromDate(v.eta),
    receivedAt: (v.lastSeenAt ?? new Date()).getTime(),
  };
}

function buildKalmanState(v: VesselRow): VesselKalmanState | null {
  if (
    v.kalmanLng === null ||
    v.kalmanLat === null ||
    v.kalmanVlng === null ||
    v.kalmanVlat === null ||
    !Array.isArray(v.kalmanCovariance) ||
    (v.kalmanCovariance as unknown[]).length !== 16 ||
    v.kalmanUpdatedAt === null
  ) {
    return null;
  }
  return {
    lng: v.kalmanLng,
    lat: v.kalmanLat,
    vlng: v.kalmanVlng,
    vlat: v.kalmanVlat,
    covariance: v.kalmanCovariance as number[],
    updatedAtUnix: Math.floor(v.kalmanUpdatedAt.getTime() / 1000),
  };
}

function etaFromDate(date: Date | null): VesselStaticDataFrame['eta'] {
  if (date === null) {
    return { month: null, day: null, hour: null, minute: null };
  }
  return {
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  };
}
