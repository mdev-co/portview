import { Test } from '@nestjs/testing';
import { SourceId } from '@sps/shared';
import type { Mmsi } from '@sps/shared';

import type { VesselUpdateEvent } from '../ingest/ingest.events';
import { PrismaService } from '../prisma/prisma.service';
import { VesselPersistenceService } from './vessel-persistence.service';

type MockPrismaClient = {
  vessel: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
  };
  vesselPosition: {
    create: jest.Mock;
  };
  $transaction: jest.Mock;
};

type ServiceInternals = {
  persistPosition(event: VesselUpdateEvent): Promise<void>;
};

describe('VesselPersistenceService', () => {
  let service: VesselPersistenceService;
  let prisma: MockPrismaClient;

  beforeEach(async () => {
    prisma = {
      vessel: {
        findUnique: jest.fn().mockResolvedValue(null),
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
  });

  const buildPositionEvent = (mmsi: number): VesselUpdateEvent => ({
    message: {
      messageType: 1,
      repeatIndicator: 0,
      mmsi: mmsi as Mmsi,
      navigationStatus: 5,
      rateOfTurn: 0,
      speedOverGround: 0.2,
      positionAccuracy: true,
      position: [14.565, 53.4267],
      courseOverGround: 90,
      trueHeading: 91,
      timestamp: 30,
      maneuverIndicator: 0,
      raim: false,
      radioStatus: 0,
    },
    sourceId: SourceId.AisStream,
    receivedAt: 1_715_515_200_000,
  });

  describe('persistPosition $transaction order', () => {
    it('upserts the vessel BEFORE inserting the position so the FK is satisfied', async () => {
      const event = buildPositionEvent(261_000_001);
      await (service as unknown as ServiceInternals).persistPosition(event);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      const calls = prisma.$transaction.mock.calls[0] as unknown[];
      const txArray = calls[0] as Array<{ __op: string }>;
      expect(Array.isArray(txArray)).toBe(true);
      expect(txArray).toHaveLength(2);
      expect(txArray[0].__op).toBe('vessel.upsert');
      expect(txArray[1].__op).toBe('vesselPosition.create');
    });

    it('inserts the position row with the upstream MMSI as the foreign key', async () => {
      const event = buildPositionEvent(261_000_002);
      await (service as unknown as ServiceInternals).persistPosition(event);

      expect(prisma.vesselPosition.create).toHaveBeenCalledTimes(1);
      const createCall = prisma.vesselPosition.create.mock
        .calls[0] as unknown[];
      const createArg = createCall[0] as { data: { vesselMmsi: number } };
      expect(createArg.data.vesselMmsi).toBe(261_000_002);
    });

    it('upserts with the same MMSI that the position row references', async () => {
      const event = buildPositionEvent(261_000_003);
      await (service as unknown as ServiceInternals).persistPosition(event);

      expect(prisma.vessel.upsert).toHaveBeenCalledTimes(1);
      const upsertCall = prisma.vessel.upsert.mock.calls[0] as unknown[];
      const upsertArg = upsertCall[0] as {
        where: { mmsi: number };
        create: { mmsi: number };
      };
      expect(upsertArg.where.mmsi).toBe(261_000_003);
      expect(upsertArg.create.mmsi).toBe(261_000_003);
    });
  });

  describe('persistPosition early returns', () => {
    it('skips static-data message types (5 / 24)', async () => {
      const event = {
        message: {
          messageType: 5,
          mmsi: 1 as Mmsi,
        },
        sourceId: SourceId.LocalUdp,
        receivedAt: Date.now(),
      } as unknown as VesselUpdateEvent;

      await (service as unknown as ServiceInternals).persistPosition(event);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('skips frames whose position is null (no-fix sentinel)', async () => {
      const event = buildPositionEvent(261_000_004);
      const eventWithoutPosition = {
        ...event,
        message: { ...event.message, position: null },
      } as VesselUpdateEvent;

      await (service as unknown as ServiceInternals).persistPosition(
        eventWithoutPosition,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
