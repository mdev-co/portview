import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  CLASS_B_STATIC_PART_A,
  CLASS_B_STATIC_PART_B,
  SourceId,
} from '@sps/shared';
import type { Mmsi, ShipTypeCode } from '@sps/shared';

import type {
  VesselStaticEvent,
  VesselUpdateEvent,
} from '../ingest/ingest.events';
import { PrismaService } from '../prisma/prisma.service';
import { VesselPersistenceService } from './vessel-persistence.service';

type MockPrismaClient = {
  vessel: {
    findMany: jest.Mock;
    upsert: jest.Mock;
  };
  vesselPosition: {
    create: jest.Mock;
  };
  $transaction: jest.Mock;
};

type TransactionOp = { __op: string; arg: unknown };

const FLUSH_WINDOW_MS = 1000;
const BASE_RECEIVED_AT = 1_715_515_200_000;

describe('VesselPersistenceService', () => {
  let service: VesselPersistenceService;
  let prisma: MockPrismaClient;

  beforeEach(async () => {
    // The service reads SPS_PERSISTENCE_FLUSH_MS on init; a developer
    // shell exporting it would silently change FLUSH_WINDOW_MS here.
    delete process.env['SPS_PERSISTENCE_FLUSH_MS'];
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

    prisma = {
      vessel: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn((arg: unknown) => ({ __op: 'vessel.upsert', arg })),
      },
      vesselPosition: {
        create: jest.fn((arg: unknown) => ({
          __op: 'vesselPosition.create',
          arg,
        })),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        VesselPersistenceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(VesselPersistenceService);
    service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const buildPositionEvent = (
    mmsi: number,
    position: [number, number] = [14.565, 53.4267],
    receivedAt: number = BASE_RECEIVED_AT,
  ): VesselUpdateEvent => ({
    message: {
      messageType: 1,
      repeatIndicator: 0,
      mmsi: mmsi as Mmsi,
      navigationStatus: 5,
      rateOfTurn: 0,
      speedOverGround: 0.2,
      positionAccuracy: true,
      position,
      courseOverGround: 90,
      trueHeading: 91,
      timestamp: 30,
      maneuverIndicator: 0,
      raim: false,
      radioStatus: 0,
    },
    sourceId: SourceId.AisStream,
    receivedAt,
  });

  const buildStaticEvent = (
    mmsi: number,
    receivedAt: number = BASE_RECEIVED_AT,
  ): VesselStaticEvent => ({
    message: {
      messageType: 5,
      repeatIndicator: 0,
      mmsi: mmsi as Mmsi,
      aisVersion: 2,
      imo: null,
      callSign: 'SQ2XYZ',
      vesselName: 'TEST VESSEL',
      shipType: 70 as ShipTypeCode,
      dimensions: null,
      epfdType: 1,
      eta: { month: null, day: null, hour: null, minute: null },
      draught: 5.5,
      destination: 'SZCZECIN',
      dte: true,
    },
    sourceId: SourceId.LocalUdp,
    receivedAt,
  });

  const buildClassBPartAEvent = (
    mmsi: number,
    receivedAt: number = BASE_RECEIVED_AT,
  ): VesselStaticEvent => ({
    message: {
      messageType: 24,
      repeatIndicator: 0,
      mmsi: mmsi as Mmsi,
      partNumber: CLASS_B_STATIC_PART_A,
      vesselName: 'YACHT ALPHA',
      callSign: '',
      shipType: 0 as ShipTypeCode,
      dimensions: null,
      vendorId: '',
      mothershipMmsi: null,
    },
    sourceId: SourceId.LocalUdp,
    receivedAt,
  });

  const buildClassBPartBEvent = (
    mmsi: number,
    receivedAt: number = BASE_RECEIVED_AT,
  ): VesselStaticEvent => ({
    message: {
      messageType: 24,
      repeatIndicator: 0,
      mmsi: mmsi as Mmsi,
      partNumber: CLASS_B_STATIC_PART_B,
      vesselName: '',
      callSign: 'SQ9ABC',
      shipType: 37 as ShipTypeCode,
      dimensions: { toBow: 5, toStern: 5, toPort: 2, toStarboard: 2 },
      vendorId: 'VNDR',
      mothershipMmsi: null,
    },
    sourceId: SourceId.LocalUdp,
    receivedAt,
  });

  const lastTransactionOps = (): TransactionOp[] => {
    const calls = prisma.$transaction.mock.calls;
    const lastCall = calls[calls.length - 1] as unknown[];
    return lastCall[0] as TransactionOp[];
  };

  const firstArgOf = <T>(mock: jest.Mock): T => {
    const call = mock.mock.calls[0] as unknown[];
    return call[0] as T;
  };

  const lastArgOf = <T>(mock: jest.Mock): T => {
    const calls = mock.mock.calls;
    const lastCall = calls[calls.length - 1] as unknown[];
    return lastCall[0] as T;
  };

  describe('window flush', () => {
    it('does not write before the flush window elapses', async () => {
      service.onVesselUpdate(buildPositionEvent(261_000_001));
      expect(prisma.$transaction).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS - 1);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('writes buffered deltas once the window elapses', async () => {
      service.onVesselUpdate(buildPositionEvent(261_000_001));
      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('does nothing on a tick with an empty buffer', async () => {
      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS * 3);

      expect(prisma.vessel.findMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('per-MMSI coalescing', () => {
    it('coalesces N position frames for one MMSI into a single write with the latest position', async () => {
      const mmsi = 261_000_010;
      service.onVesselUpdate(buildPositionEvent(mmsi, [14.1, 53.1]));
      service.onVesselUpdate(
        buildPositionEvent(mmsi, [14.2, 53.2], BASE_RECEIVED_AT + 100),
      );
      service.onVesselUpdate(
        buildPositionEvent(mmsi, [14.3, 53.3], BASE_RECEIVED_AT + 200),
      );

      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.vesselPosition.create).toHaveBeenCalledTimes(1);
      const createArg = firstArgOf<{
        data: { lng: number; lat: number; vesselMmsi: number };
      }>(prisma.vesselPosition.create);
      expect(createArg.data.lng).toBe(14.3);
      expect(createArg.data.lat).toBe(53.3);
      expect(createArg.data.vesselMmsi).toBe(mmsi);
    });

    it('merges Class B PartA and PartB static fields arriving in the same window', async () => {
      const mmsi = 261_000_011;
      service.onVesselStatic(buildClassBPartAEvent(mmsi));
      service.onVesselStatic(
        buildClassBPartBEvent(mmsi, BASE_RECEIVED_AT + 100),
      );

      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS);

      expect(prisma.vessel.upsert).toHaveBeenCalledTimes(1);
      const upsertArg = firstArgOf<{
        update: { name?: string; callSign?: string; toBow?: number };
      }>(prisma.vessel.upsert);
      expect(upsertArg.update.name).toBe('YACHT ALPHA');
      expect(upsertArg.update.callSign).toBe('SQ9ABC');
      expect(upsertArg.update.toBow).toBe(5);
    });

    it('combines a position and a static frame for the same MMSI into one upsert plus one position insert', async () => {
      const mmsi = 261_000_012;
      service.onVesselUpdate(buildPositionEvent(mmsi));
      service.onVesselStatic(buildStaticEvent(mmsi, BASE_RECEIVED_AT + 100));

      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS);

      const ops = lastTransactionOps();
      expect(ops).toHaveLength(2);
      const upsertArg = firstArgOf<{
        update: { name?: string; kalmanLng?: number };
      }>(prisma.vessel.upsert);
      expect(upsertArg.update.name).toBe('TEST VESSEL');
      expect(upsertArg.update.kalmanLng).toBeDefined();
    });
  });

  describe('transaction shape', () => {
    it('upserts the vessel BEFORE inserting the position so the FK is satisfied', async () => {
      service.onVesselUpdate(buildPositionEvent(261_000_020));
      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS);

      const ops = lastTransactionOps();
      expect(ops).toHaveLength(2);
      expect(ops[0]?.__op).toBe('vessel.upsert');
      expect(ops[1]?.__op).toBe('vesselPosition.create');
    });

    it('upserts with the same MMSI that the position row references', async () => {
      service.onVesselUpdate(buildPositionEvent(261_000_021));
      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS);

      const upsertArg = firstArgOf<{
        where: { mmsi: number };
        create: { mmsi: number };
      }>(prisma.vessel.upsert);
      expect(upsertArg.where.mmsi).toBe(261_000_021);
      expect(upsertArg.create.mmsi).toBe(261_000_021);
      const createArg = firstArgOf<{
        data: { vesselMmsi: number };
      }>(prisma.vesselPosition.create);
      expect(createArg.data.vesselMmsi).toBe(261_000_021);
    });
  });

  describe('overlap protection', () => {
    it('skips the tick when a flush is still in flight and catches up afterwards', async () => {
      let resolveTx!: (value: unknown[]) => void;
      prisma.$transaction.mockImplementationOnce(
        () =>
          new Promise<unknown[]>((resolve) => {
            resolveTx = resolve;
          }),
      );

      service.onVesselUpdate(buildPositionEvent(261_000_030));
      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      service.onVesselUpdate(buildPositionEvent(261_000_031));
      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS);
      // Second tick fired while the first flush was pending: skipped.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      resolveTx([]);
      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS);
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });
  });

  describe('lifecycle', () => {
    it('flushes the remaining buffer on destroy', async () => {
      service.onVesselUpdate(buildPositionEvent(261_000_040));
      await service.onModuleDestroy();

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('stops the flush timer on destroy', async () => {
      await service.onModuleDestroy();
      service.onVesselUpdate(buildPositionEvent(261_000_041));
      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS * 3);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('bounded buffer', () => {
    it('drops frames for previously-unseen MMSIs beyond the hard cap and counts them', () => {
      const cap = 5000;
      for (let i = 0; i < cap + 2; i += 1) {
        service.onVesselUpdate(buildPositionEvent(100_000_000 + i));
      }

      expect(service.stats()).toEqual({ buffered: cap, dropped: 2 });
    });

    it('still merges updates for MMSIs already buffered when at the cap', () => {
      const cap = 5000;
      for (let i = 0; i < cap; i += 1) {
        service.onVesselUpdate(buildPositionEvent(100_000_000 + i));
      }
      service.onVesselUpdate(
        buildPositionEvent(100_000_000, [14.9, 53.9], BASE_RECEIVED_AT + 500),
      );

      expect(service.stats()).toEqual({ buffered: cap, dropped: 0 });
    });
  });

  describe('failure path', () => {
    it('retries a failed flush on the next tick without losing the buffered delta', async () => {
      prisma.$transaction.mockRejectedValueOnce(new Error('db down'));

      service.onVesselUpdate(buildPositionEvent(261_000_050, [14.1, 53.1]));
      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS);
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      const lastCreateArg = lastArgOf<{ data: { lng: number } }>(
        prisma.vesselPosition.create,
      );
      expect(lastCreateArg.data.lng).toBe(14.1);
    });

    it('keeps the NEWER delta when it arrives during a failing flush attempt', async () => {
      let rejectTx!: (err: Error) => void;
      prisma.$transaction.mockImplementationOnce(
        () =>
          new Promise<unknown[]>((_resolve, reject) => {
            rejectTx = reject;
          }),
      );

      const mmsi = 261_000_051;
      service.onVesselUpdate(buildPositionEvent(mmsi, [14.1, 53.1]));
      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      // Newer frame lands while the first attempt is still in flight.
      service.onVesselUpdate(
        buildPositionEvent(mmsi, [14.9, 53.9], BASE_RECEIVED_AT + 1500),
      );
      rejectTx(new Error('db down'));

      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS);
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      const lastCreateArg = lastArgOf<{ data: { lng: number } }>(
        prisma.vesselPosition.create,
      );
      expect(lastCreateArg.data.lng).toBe(14.9);
    });

    it('backs off after repeated flush failures and resumes after success', async () => {
      prisma.$transaction
        .mockRejectedValueOnce(new Error('db down'))
        .mockRejectedValueOnce(new Error('db down'));
      service.onVesselUpdate(buildPositionEvent(261_000_001, [14.1, 53.1]));

      // 1st failure -> retry on the very next tick.
      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS);
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);

      // 2nd consecutive failure -> one tick skipped, then retry succeeds.
      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS);
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS);
      expect(prisma.$transaction).toHaveBeenCalledTimes(3);

      // Backoff resets after success: a fresh delta flushes next tick.
      service.onVesselUpdate(buildPositionEvent(261_000_002, [14.2, 53.2]));
      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS);
      expect(prisma.$transaction).toHaveBeenCalledTimes(4);
      expect(service.stats().buffered).toBe(0);
    });
  });

  describe('early returns', () => {
    it('skips static-data message types on the position channel', async () => {
      const event = {
        message: {
          messageType: 5,
          mmsi: 1 as Mmsi,
        },
        sourceId: SourceId.LocalUdp,
        receivedAt: Date.now(),
      } as unknown as VesselUpdateEvent;

      service.onVesselUpdate(event);
      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('skips frames whose position is null (no-fix sentinel)', async () => {
      const event = buildPositionEvent(261_000_060);
      const eventWithoutPosition = {
        ...event,
        message: { ...event.message, position: null },
      } as VesselUpdateEvent;

      service.onVesselUpdate(eventWithoutPosition);
      await jest.advanceTimersByTimeAsync(FLUSH_WINDOW_MS);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
