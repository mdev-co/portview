import { Injectable, Logger } from '@nestjs/common';
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

    const vessels = await this.prisma.vessel.findMany({
      where: { lastSeenAt: { gte: cutoff } },
      orderBy: { lastSeenAt: 'desc' },
      take: SNAPSHOT_MAX_VESSELS,
      include: {
        positions: {
          take: VESSEL_HISTORY_MAX_POINTS,
          orderBy: { ingestTimestamp: 'desc' },
        },
      },
    });

    const entries: VesselSnapshotEntry[] = vessels.map((v) => {
      const mmsi = v.mmsi as Mmsi;
      const history = v.positions
        // Re-sort to chronological so the FE can draw the trail in
        // time order without flipping it client-side.
        .slice()
        .reverse()
        .map<VesselHistoryPoint>((p) => ({
          lng: p.lng,
          lat: p.lat,
          sog: p.speedOverGround,
          cog: p.courseOverGround,
          trueHeading: p.trueHeading,
          timestampUnix: Math.floor(
            (p.broadcastTimestamp ?? p.ingestTimestamp).getTime() / 1000,
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
