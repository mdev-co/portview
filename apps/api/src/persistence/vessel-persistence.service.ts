import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AIS_HEADING_UNKNOWN_SENTINEL,
  AIS_RATE_OF_TURN_OUT_OF_RANGE_BOUND,
  AIS_SHIP_TYPE_DEFAULT,
  CLASS_B_STATIC_PART_A,
  CLASS_B_STATIC_PART_B,
  initKalmanState2D,
  type KalmanState2D,
  stepKalman2D,
} from '@sps/shared';
import {
  VESSEL_STATIC_EVENT,
  VESSEL_UPDATE_EVENT,
  type VesselStaticEvent,
  type VesselUpdateEvent,
} from '../ingest/ingest.events';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Subscribes to validated ingest events and persists the relevant
 * slices to Postgres. The ingest hot path stays event-driven and
 * synchronous; Prisma writes happen here, asynchronously, with errors
 * logged but never propagated back to the publisher (one bad row
 * cannot stall the live feed).
 *
 * Two responsibilities, mirrored on the two ingest event channels:
 * - Position frames (type 1/2/3/18) -> append a row to vessel_positions,
 *   advance the Kalman filter state and stamp lastSeenAt on the parent
 *   vessel row.
 * - Static frames (type 5 / 24) -> upsert the vessel row with name,
 *   callSign, shipType, dimensions, etc. Class B type 24 arrives in
 *   two parts; we keep whichever side carried a value (PartA = name,
 *   PartB = callSign + dimensions + shipType).
 */
@Injectable()
export class VesselPersistenceService {
  private readonly log = new Logger(VesselPersistenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(VESSEL_UPDATE_EVENT)
  onVesselUpdate(event: VesselUpdateEvent): void {
    // Fire and forget: the ingest pipeline should not block on Postgres
    // and a single failed write should not derail the live feed.
    void this.persistPosition(event).catch((err) => {
      this.log.warn(
        `persistPosition failed for mmsi=${String(event.message.mmsi)}: ${String(err)}`,
      );
    });
  }

  @OnEvent(VESSEL_STATIC_EVENT)
  onVesselStatic(event: VesselStaticEvent): void {
    void this.persistStatic(event).catch((err) => {
      this.log.warn(
        `persistStatic failed for mmsi=${String(event.message.mmsi)}: ${String(err)}`,
      );
    });
  }

  private async persistPosition(event: VesselUpdateEvent): Promise<void> {
    const { message, receivedAt } = event;
    if (
      message.messageType !== 1 &&
      message.messageType !== 2 &&
      message.messageType !== 3 &&
      message.messageType !== 18
    ) {
      return;
    }
    const position = message.position;
    if (position === null) return;
    const [lng, lat] = position;
    const sog = message.speedOverGround;
    const cog = message.courseOverGround;
    const heading = normaliseHeading(message.trueHeading);
    const rot =
      'rateOfTurn' in message ? normaliseRateOfTurn(message.rateOfTurn) : null;
    const navStatus =
      'navigationStatus' in message ? message.navigationStatus : null;

    const broadcastTimestamp = new Date(receivedAt);
    const mmsi = Number(message.mmsi);

    // Advance Kalman state. Read previous state from the parent vessel
    // row (if any), predict-and-update with the new measurement, write
    // both the new position row and the updated state in a single
    // transaction so the snapshot consumer never sees a mismatch.
    const existing = await this.prisma.vessel.findUnique({
      where: { mmsi },
      select: {
        kalmanLng: true,
        kalmanLat: true,
        kalmanVlng: true,
        kalmanVlat: true,
        kalmanCovariance: true,
        kalmanUpdatedAt: true,
      },
    });

    const nowSeconds = Math.floor(receivedAt / 1000);
    const nextKalman = advanceKalman(existing, lng, lat, nowSeconds);

    await this.prisma.$transaction([
      this.prisma.vesselPosition.create({
        data: {
          vesselMmsi: mmsi,
          lng,
          lat,
          speedOverGround: sog,
          courseOverGround: cog,
          trueHeading: heading,
          rateOfTurn: rot,
          navStatus,
          broadcastTimestamp,
        },
      }),
      this.prisma.vessel.upsert({
        where: { mmsi },
        update: {
          lastSeenAt: broadcastTimestamp,
          kalmanLng: nextKalman.lng,
          kalmanLat: nextKalman.lat,
          kalmanVlng: nextKalman.vlng,
          kalmanVlat: nextKalman.vlat,
          kalmanCovariance: nextKalman.covariance,
          kalmanUpdatedAt: broadcastTimestamp,
        },
        create: {
          mmsi,
          lastSeenAt: broadcastTimestamp,
          kalmanLng: nextKalman.lng,
          kalmanLat: nextKalman.lat,
          kalmanVlng: nextKalman.vlng,
          kalmanVlat: nextKalman.vlat,
          kalmanCovariance: nextKalman.covariance,
          kalmanUpdatedAt: broadcastTimestamp,
        },
      }),
    ]);
  }

  private async persistStatic(event: VesselStaticEvent): Promise<void> {
    const { message, receivedAt } = event;
    const mmsi = Number(message.mmsi);
    const broadcastTimestamp = new Date(receivedAt);

    if (message.messageType === 5) {
      await this.prisma.vessel.upsert({
        where: { mmsi },
        update: {
          name: message.vesselName.trim() || undefined,
          callSign: message.callSign.trim() || undefined,
          imo: message.imo !== null ? Number(message.imo) : undefined,
          shipType:
            message.shipType !== AIS_SHIP_TYPE_DEFAULT
              ? Number(message.shipType)
              : undefined,
          toBow: message.dimensions?.toBow ?? undefined,
          toStern: message.dimensions?.toStern ?? undefined,
          toPort: message.dimensions?.toPort ?? undefined,
          toStarboard: message.dimensions?.toStarboard ?? undefined,
          draught: message.draught ?? undefined,
          destination: message.destination.trim() || undefined,
          eta: etaToDate(message.eta) ?? undefined,
          lastSeenAt: broadcastTimestamp,
        },
        create: {
          mmsi,
          name: message.vesselName.trim() || null,
          callSign: message.callSign.trim() || null,
          imo: message.imo !== null ? Number(message.imo) : null,
          shipType:
            message.shipType !== AIS_SHIP_TYPE_DEFAULT
              ? Number(message.shipType)
              : null,
          toBow: message.dimensions?.toBow ?? null,
          toStern: message.dimensions?.toStern ?? null,
          toPort: message.dimensions?.toPort ?? null,
          toStarboard: message.dimensions?.toStarboard ?? null,
          draught: message.draught ?? null,
          destination: message.destination.trim() || null,
          eta: etaToDate(message.eta),
          lastSeenAt: broadcastTimestamp,
        },
      });
      return;
    }

    // Class B static (type 24) arrives in two halves. Each part is
    // upserted with only the fields it actually carries; the merge
    // policy (keep previous when incoming is blank) lives in the FE
    // store. Here we use `undefined` for absent fields so Prisma leaves
    // them at their previous value.
    if (message.partNumber === CLASS_B_STATIC_PART_A) {
      await this.prisma.vessel.upsert({
        where: { mmsi },
        update: {
          name: message.vesselName.trim() || undefined,
          lastSeenAt: broadcastTimestamp,
        },
        create: {
          mmsi,
          name: message.vesselName.trim() || null,
          lastSeenAt: broadcastTimestamp,
        },
      });
      return;
    }
    if (message.partNumber === CLASS_B_STATIC_PART_B) {
      await this.prisma.vessel.upsert({
        where: { mmsi },
        update: {
          callSign: message.callSign.trim() || undefined,
          shipType:
            message.shipType !== AIS_SHIP_TYPE_DEFAULT
              ? Number(message.shipType)
              : undefined,
          toBow: message.dimensions?.toBow ?? undefined,
          toStern: message.dimensions?.toStern ?? undefined,
          toPort: message.dimensions?.toPort ?? undefined,
          toStarboard: message.dimensions?.toStarboard ?? undefined,
          lastSeenAt: broadcastTimestamp,
        },
        create: {
          mmsi,
          callSign: message.callSign.trim() || null,
          shipType:
            message.shipType !== AIS_SHIP_TYPE_DEFAULT
              ? Number(message.shipType)
              : null,
          toBow: message.dimensions?.toBow ?? null,
          toStern: message.dimensions?.toStern ?? null,
          toPort: message.dimensions?.toPort ?? null,
          toStarboard: message.dimensions?.toStarboard ?? null,
          lastSeenAt: broadcastTimestamp,
        },
      });
    }
  }
}

function normaliseHeading(value: number | null): number | null {
  if (value === null) return null;
  if (value === AIS_HEADING_UNKNOWN_SENTINEL) return null;
  return value;
}

function normaliseRateOfTurn(value: number | null): number | null {
  if (value === null) return null;
  if (Math.abs(value) >= AIS_RATE_OF_TURN_OUT_OF_RANGE_BOUND) return null;
  return value;
}

function etaToDate(eta: {
  month: number | null;
  day: number | null;
  hour: number | null;
  minute: number | null;
}): Date | null {
  // AIS ETA is month / day / hour / minute, no year. We pin a placeholder
  // year (current UTC) - the operator interprets it as "next occurrence".
  if (eta.month === null || eta.day === null) return null;
  const year = new Date().getUTCFullYear();
  return new Date(
    Date.UTC(year, eta.month - 1, eta.day, eta.hour ?? 0, eta.minute ?? 0),
  );
}

type StoredKalman = {
  kalmanLng: number | null;
  kalmanLat: number | null;
  kalmanVlng: number | null;
  kalmanVlat: number | null;
  kalmanCovariance: unknown;
  kalmanUpdatedAt: Date | null;
};

function rehydrateKalman(stored: StoredKalman | null): KalmanState2D | null {
  if (stored === null) return null;
  const cov = stored.kalmanCovariance;
  if (
    stored.kalmanLng === null ||
    stored.kalmanLat === null ||
    stored.kalmanVlng === null ||
    stored.kalmanVlat === null ||
    !Array.isArray(cov) ||
    cov.length !== 16
  ) {
    return null;
  }
  return {
    lng: stored.kalmanLng,
    lat: stored.kalmanLat,
    vlng: stored.kalmanVlng,
    vlat: stored.kalmanVlat,
    covariance: cov as number[],
  };
}

/**
 * Hard ceiling on any element of the covariance matrix. The filter is
 * supposed to settle to small values during normal operation; runaway
 * growth signals adversarial inputs (poisoned positions) or a stuck
 * sensor. When detected the state is reset to a fresh initialisation
 * around the latest measurement, dropping accumulated bad history.
 */
const KALMAN_COVARIANCE_HARD_CAP = 1_000;

function advanceKalman(
  stored: StoredKalman | null,
  measurementLng: number,
  measurementLat: number,
  nowSeconds: number,
): KalmanState2D {
  const prev = rehydrateKalman(stored);
  if (prev === null || stored === null || stored.kalmanUpdatedAt === null) {
    return initKalmanState2D(measurementLng, measurementLat);
  }
  const prevSeconds = Math.floor(stored.kalmanUpdatedAt.getTime() / 1000);
  const dt = Math.max(0, nowSeconds - prevSeconds);
  const next = stepKalman2D(prev, dt, measurementLng, measurementLat);
  for (const c of next.covariance) {
    if (!Number.isFinite(c) || Math.abs(c) > KALMAN_COVARIANCE_HARD_CAP) {
      return initKalmanState2D(measurementLng, measurementLat);
    }
  }
  return next;
}
