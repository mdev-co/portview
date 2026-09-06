import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import {
  AIS_HEADING_UNKNOWN_SENTINEL,
  AIS_RATE_OF_TURN_OUT_OF_RANGE_BOUND,
  AIS_SHIP_TYPE_DEFAULT,
  CLASS_B_STATIC_PART_A,
  CLASS_B_STATIC_PART_B,
  type ClassBStaticData,
  initKalmanState2D,
  type KalmanState2D,
  type SourceId,
  type StaticData,
  stepKalman2D,
} from '@sps/shared';
import { getPersistenceFlushMs } from '../env';
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
 * Writes are BATCHED, not per-frame. Each incoming event is folded
 * into an in-memory per-MMSI buffer and a timer flushes the buffer
 * once per window (default 1 s, see `getPersistenceFlushMs`). One
 * Prisma upsert per frame starved the connection pool on the shared
 * 1-vCPU deployment; coalescing per MMSI and writing in chunked
 * transactions cuts pool pressure by an order of magnitude at the
 * cost of up to one window of write latency.
 *
 * Coalescing rules, mirrored on the two ingest event channels:
 * - Position frames (type 1/2/3/18): the LATEST frame in the window
 *   supersedes earlier ones for the same MMSI. At flush time the
 *   Kalman filter state is read from the parent vessel row, advanced
 *   with the coalesced measurement, and written back together with a
 *   vessel_positions row in the same transaction.
 * - Static frames (type 5 / 24): field-wise merge - a newer frame
 *   overrides only the fields it actually carries, so Class B PartA
 *   (name) and PartB (callSign + dimensions + shipType) arriving in
 *   the same window combine instead of clobbering each other.
 *
 * Failure handling: a failed flush chunk is re-merged into the live
 * buffer with live-wins semantics (deltas that arrived during the
 * attempt stay newest) and retried on the next tick. Overlapping
 * flushes are impossible - a tick that fires while a flush is in
 * flight is skipped and the buffer simply keeps accumulating.
 */
@Injectable()
export class VesselPersistenceService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(VesselPersistenceService.name);

  private buffer = new Map<number, BufferedDelta>();
  private droppedTotal = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  /** Consecutive flush ticks that ended with a failed chunk; drives backoff. */
  private consecutiveFailures = 0;
  /** Ticks to skip before the next flush attempt (exponential backoff). */
  private skipTicks = 0;
  private flushInFlight: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.flushTimer = setInterval(
      () => this.flushTick(),
      getPersistenceFlushMs(),
    );
    // Never keep the process alive for the sake of the flush loop.
    this.flushTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // Drain: wait out any in-flight flush, then write what remains.
    // enableShutdownHooks() in main.ts guarantees this runs on SIGTERM,
    // so the final window of deltas survives a deploy.
    if (this.flushInFlight !== null) {
      await this.flushInFlight;
    }
    await this.flush();
  }

  /** Observability hook: buffer occupancy and cumulative cap drops. */
  stats(): VesselPersistenceStats {
    return { buffered: this.buffer.size, dropped: this.droppedTotal };
  }

  @OnEvent(VESSEL_UPDATE_EVENT)
  onVesselUpdate(event: VesselUpdateEvent): void {
    const { message, sourceId, receivedAt } = event;
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
    this.bufferDelta(Number(message.mmsi), {
      position: {
        lng,
        lat,
        speedOverGround: message.speedOverGround,
        courseOverGround: message.courseOverGround,
        trueHeading: normaliseHeading(message.trueHeading),
        rateOfTurn:
          'rateOfTurn' in message
            ? normaliseRateOfTurn(message.rateOfTurn)
            : null,
        navStatus:
          'navigationStatus' in message ? message.navigationStatus : null,
        sourceId,
        receivedAt,
      },
      staticData: null,
    });
  }

  @OnEvent(VESSEL_STATIC_EVENT)
  onVesselStatic(event: VesselStaticEvent): void {
    const { message, sourceId, receivedAt } = event;
    const fields = staticFieldsOf(message);
    if (fields === null) return;
    this.bufferDelta(Number(message.mmsi), {
      position: null,
      staticData: { fields, sourceId, receivedAt },
    });
  }

  private bufferDelta(mmsi: number, incoming: BufferedDelta): void {
    const existing = this.buffer.get(mmsi);
    if (existing !== undefined) {
      this.buffer.set(mmsi, mergeDeltas(existing, incoming));
      return;
    }
    if (this.buffer.size >= BUFFER_HARD_CAP) {
      this.droppedTotal += 1;
      return;
    }
    this.buffer.set(mmsi, incoming);
  }

  private flushTick(): void {
    if (this.flushInFlight !== null) return;
    if (this.skipTicks > 0) {
      this.skipTicks -= 1;
      return;
    }
    this.flushInFlight = this.flush().finally(() => {
      this.flushInFlight = null;
    });
  }

  private async flush(): Promise<void> {
    if (this.buffer.size === 0) return;
    const batch = this.buffer;
    this.buffer = new Map();

    const positionMmsis = [...batch.entries()]
      .filter(([, delta]) => delta.position !== null)
      .map(([mmsi]) => mmsi);

    let kalmanByMmsi: ReadonlyMap<number, StoredKalman>;
    try {
      kalmanByMmsi = await this.readKalmanStates(positionMmsis);
    } catch (err) {
      this.remergeBatch(batch);
      this.log.error(
        `flush read failed, ${String(batch.size)} deltas requeued: ${String(err)}`,
      );
      return;
    }

    const entries = [...batch.entries()];
    let written = 0;
    let failed = 0;
    for (let i = 0; i < entries.length; i += FLUSH_CHUNK_SIZE) {
      const chunk = entries.slice(i, i + FLUSH_CHUNK_SIZE);
      const ops = chunk.flatMap(([mmsi, delta]) =>
        this.buildOps(mmsi, delta, kalmanByMmsi.get(mmsi) ?? null),
      );
      try {
        await this.prisma.$transaction(ops);
        written += chunk.length;
      } catch (err) {
        // One failed chunk almost always means the database is down or
        // saturated; hammering the remaining chunks in the same tick
        // only deepens the hole. Requeue this chunk AND everything not
        // yet attempted. The first failure retries on the very next
        // tick (transient blips are common); from the second consecutive
        // failure on, skip 1, 3, 7 ... ticks, capped at
        // FLUSH_BACKOFF_MAX_TICKS. Live-wins merge semantics are
        // preserved by remergeFailed.
        const rest = entries.slice(i);
        failed += rest.length;
        for (const [mmsi, delta] of rest) {
          this.remergeFailed(mmsi, delta);
        }
        this.consecutiveFailures += 1;
        this.skipTicks = Math.min(
          2 ** (this.consecutiveFailures - 1) - 1,
          FLUSH_BACKOFF_MAX_TICKS,
        );
        this.log.error(
          `flush chunk failed, ${String(rest.length)} deltas requeued, ` +
            `backing off ${String(this.skipTicks)} tick(s): ${String(err)}`,
        );
        break;
      }
    }
    if (failed === 0) this.consecutiveFailures = 0;
    this.log.debug(
      `flush: written=${String(written)} failed=${String(failed)} ` +
        `droppedTotal=${String(this.droppedTotal)} pending=${String(this.buffer.size)}`,
    );
  }

  private async readKalmanStates(
    mmsis: readonly number[],
  ): Promise<ReadonlyMap<number, StoredKalman>> {
    if (mmsis.length === 0) return new Map();
    const rows = await this.prisma.vessel.findMany({
      where: { mmsi: { in: [...mmsis] } },
      select: {
        mmsi: true,
        kalmanLng: true,
        kalmanLat: true,
        kalmanVlng: true,
        kalmanVlat: true,
        kalmanCovariance: true,
        kalmanUpdatedAt: true,
      },
    });
    return new Map(rows.map((row) => [row.mmsi, row]));
  }

  /**
   * One vessel upsert per buffered MMSI, followed by a
   * vessel_positions insert when the window carried a position frame.
   * Order matters: vesselPosition.vessel_mmsi is a foreign key to
   * vessels.mmsi, so for a previously-unseen MMSI the parent upsert
   * must run first or the transaction rolls back on FK violation.
   */
  private buildOps(
    mmsi: number,
    delta: BufferedDelta,
    stored: StoredKalman | null,
  ): Prisma.PrismaPromise<unknown>[] {
    const { position, staticData } = delta;
    const newest =
      position !== null &&
      (staticData === null || position.receivedAt >= staticData.receivedAt)
        ? position
        : staticData;
    if (newest === null) return [];

    const data: VesselWriteData = {
      ...(staticData?.fields ?? {}),
      lastSeenAt: new Date(newest.receivedAt),
      lastSourceId: newest.sourceId,
    };

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (position !== null) {
      const broadcastTimestamp = new Date(position.receivedAt);
      const nextKalman = advanceKalman(
        stored,
        position.lng,
        position.lat,
        Math.floor(position.receivedAt / 1000),
      );
      data.kalmanLng = nextKalman.lng;
      data.kalmanLat = nextKalman.lat;
      data.kalmanVlng = nextKalman.vlng;
      data.kalmanVlat = nextKalman.vlat;
      data.kalmanCovariance = nextKalman.covariance;
      data.kalmanUpdatedAt = broadcastTimestamp;
      ops.push(
        this.prisma.vessel.upsert({
          where: { mmsi },
          update: data,
          create: { mmsi, ...data },
        }),
        this.prisma.vesselPosition.create({
          data: {
            vesselMmsi: mmsi,
            lng: position.lng,
            lat: position.lat,
            speedOverGround: position.speedOverGround,
            courseOverGround: position.courseOverGround,
            trueHeading: position.trueHeading,
            rateOfTurn: position.rateOfTurn,
            navStatus: position.navStatus,
            sourceId: position.sourceId,
            broadcastTimestamp,
          },
        }),
      );
      return ops;
    }
    ops.push(
      this.prisma.vessel.upsert({
        where: { mmsi },
        update: data,
        create: { mmsi, ...data },
      }),
    );
    return ops;
  }

  private remergeBatch(batch: ReadonlyMap<number, BufferedDelta>): void {
    for (const [mmsi, delta] of batch) {
      this.remergeFailed(mmsi, delta);
    }
  }

  /**
   * Requeue a delta whose write failed. Deltas that arrived in the
   * live buffer during the attempt are NEWER, so they win the merge:
   * the failed position is kept only when no fresher one exists, and
   * failed static fields sit underneath the live ones.
   */
  private remergeFailed(mmsi: number, failedDelta: BufferedDelta): void {
    const live = this.buffer.get(mmsi);
    if (live === undefined) {
      // Requeue must respect the same memory bound as fresh ingest;
      // otherwise a long outage grows the buffer past BUFFER_HARD_CAP.
      if (this.buffer.size >= BUFFER_HARD_CAP) {
        this.droppedTotal += 1;
        return;
      }
      this.buffer.set(mmsi, failedDelta);
      return;
    }
    this.buffer.set(mmsi, mergeDeltas(failedDelta, live));
  }
}

export type VesselPersistenceStats = {
  readonly buffered: number;
  readonly dropped: number;
};

/**
 * Flush interval and chunking constants. FLUSH_CHUNK_SIZE bounds a
 * single transaction at 2 * chunk operations (upsert + position
 * insert per MMSI) so one flush never holds a pool connection for an
 * unbounded statement list. BUFFER_HARD_CAP bounds worst-case memory
 * the same way the ingest limiters bound their LRU maps: real traffic
 * (~200-500 vessels) never reaches it; hitting it means a flood, and
 * frames for previously-unseen MMSIs are dropped and counted rather
 * than growing the heap.
 */
const FLUSH_CHUNK_SIZE = 100;
const BUFFER_HARD_CAP = 5000;
/** Upper bound for exponential backoff after failed flushes (in ticks). */
const FLUSH_BACKOFF_MAX_TICKS = 30;

type PositionDelta = {
  readonly lng: number;
  readonly lat: number;
  readonly speedOverGround: number | null;
  readonly courseOverGround: number | null;
  readonly trueHeading: number | null;
  readonly rateOfTurn: number | null;
  readonly navStatus: number | null;
  readonly sourceId: SourceId;
  readonly receivedAt: number;
};

/**
 * Static vessel fields carried by a type 5 / 24 frame. Absent fields
 * stay absent (not null) so a field-wise object spread implements the
 * merge policy and Prisma's `undefined = leave unchanged` semantics
 * apply on update.
 */
type StaticFields = {
  name?: string;
  callSign?: string;
  imo?: number;
  shipType?: number;
  toBow?: number;
  toStern?: number;
  toPort?: number;
  toStarboard?: number;
  draught?: number;
  destination?: string;
  eta?: Date;
};

type StaticDelta = {
  readonly fields: StaticFields;
  readonly sourceId: SourceId;
  readonly receivedAt: number;
};

type BufferedDelta = {
  readonly position: PositionDelta | null;
  readonly staticData: StaticDelta | null;
};

type VesselWriteData = StaticFields & {
  lastSeenAt: Date;
  lastSourceId: number;
  kalmanLng?: number;
  kalmanLat?: number;
  kalmanVlng?: number;
  kalmanVlat?: number;
  kalmanCovariance?: KalmanState2D['covariance'];
  kalmanUpdatedAt?: Date;
};

function mergeDeltas(
  older: BufferedDelta,
  newer: BufferedDelta,
): BufferedDelta {
  return {
    position: newer.position ?? older.position,
    staticData: mergeStatic(older.staticData, newer.staticData),
  };
}

function mergeStatic(
  older: StaticDelta | null,
  newer: StaticDelta | null,
): StaticDelta | null {
  if (older === null) return newer;
  if (newer === null) return older;
  return {
    fields: { ...older.fields, ...newer.fields },
    sourceId: newer.sourceId,
    receivedAt: Math.max(older.receivedAt, newer.receivedAt),
  };
}

/**
 * Normalise an incoming static frame to the fields it actually
 * carries. Type 5 (Class A) carries the full record; Class B type 24
 * arrives in two parts (PartA = name, PartB = callSign + dimensions +
 * shipType). Blank strings and AIS sentinel values are treated as
 * absent so they never overwrite previously-known values.
 */
function staticFieldsOf(
  message: StaticData | ClassBStaticData,
): StaticFields | null {
  if (message.messageType === 5) {
    const fields: StaticFields = {};
    assignIfPresent(fields, 'name', message.vesselName.trim() || undefined);
    assignIfPresent(fields, 'callSign', message.callSign.trim() || undefined);
    assignIfPresent(
      fields,
      'imo',
      message.imo !== null ? Number(message.imo) : undefined,
    );
    assignIfPresent(fields, 'shipType', normaliseShipType(message.shipType));
    assignDimensions(fields, message.dimensions);
    assignIfPresent(fields, 'draught', message.draught ?? undefined);
    assignIfPresent(
      fields,
      'destination',
      message.destination.trim() || undefined,
    );
    assignIfPresent(fields, 'eta', etaToDate(message.eta) ?? undefined);
    return fields;
  }
  if (message.partNumber === CLASS_B_STATIC_PART_A) {
    const fields: StaticFields = {};
    assignIfPresent(fields, 'name', message.vesselName.trim() || undefined);
    return fields;
  }
  if (message.partNumber === CLASS_B_STATIC_PART_B) {
    const fields: StaticFields = {};
    assignIfPresent(fields, 'callSign', message.callSign.trim() || undefined);
    assignIfPresent(fields, 'shipType', normaliseShipType(message.shipType));
    assignDimensions(fields, message.dimensions);
    return fields;
  }
  return null;
}

function assignIfPresent<K extends keyof StaticFields>(
  fields: StaticFields,
  key: K,
  value: StaticFields[K] | undefined,
): void {
  if (value !== undefined) fields[key] = value;
}

function assignDimensions(
  fields: StaticFields,
  dimensions: {
    toBow: number;
    toStern: number;
    toPort: number;
    toStarboard: number;
  } | null,
): void {
  if (dimensions === null) return;
  fields.toBow = dimensions.toBow;
  fields.toStern = dimensions.toStern;
  fields.toPort = dimensions.toPort;
  fields.toStarboard = dimensions.toStarboard;
}

function normaliseShipType(shipType: number): number | undefined {
  return shipType !== AIS_SHIP_TYPE_DEFAULT ? Number(shipType) : undefined;
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
