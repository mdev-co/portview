import { Test } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';
import { VesselsService } from '../vessels.service';

type MockVesselClient = {
  findMany: jest.Mock;
  findUnique: jest.Mock;
};

describe('VesselsService', () => {
  let service: VesselsService;
  let vessel: MockVesselClient;

  beforeEach(async () => {
    vessel = {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        VesselsService,
        { provide: PrismaService, useValue: { vessel } },
      ],
    }).compile();

    service = moduleRef.get(VesselsService);
  });

  describe('listVessels', () => {
    it('maps Prisma rows with nested latest position to VesselSummary', async () => {
      vessel.findMany.mockResolvedValue([
        {
          mmsi: 261000001,
          imo: 9876543,
          name: 'POMERANIA TRADER',
          callSign: 'SPPT1',
          shipType: 70,
          destination: 'GDYNIA',
          eta: null,
          lastSeenAt: new Date('2026-05-11T18:00:00Z'),
          positions: [
            {
              lat: 53.4267,
              lng: 14.565,
              speedOverGround: 0.2,
              courseOverGround: 90,
              trueHeading: 91,
              navStatus: 5,
              broadcastTimestamp: new Date('2026-05-11T18:00:00Z'),
              ingestTimestamp: new Date('2026-05-11T18:00:01Z'),
            },
          ],
        },
      ]);

      const result = await service.listVessels(10);

      expect(result).toEqual([
        {
          mmsi: 261000001,
          imo: 9876543,
          name: 'POMERANIA TRADER',
          callSign: 'SPPT1',
          shipType: 70,
          destination: 'GDYNIA',
          eta: null,
          lastSeenAt: '2026-05-11T18:00:00.000Z',
          position: {
            lat: 53.4267,
            lng: 14.565,
            speedOverGround: 0.2,
            courseOverGround: 90,
            trueHeading: 91,
            navStatus: 5,
            updatedAt: '2026-05-11T18:00:00.000Z',
          },
        },
      ]);
    });

    it('falls back to ingestTimestamp when broadcastTimestamp absent', async () => {
      vessel.findMany.mockResolvedValue([
        {
          mmsi: 1,
          imo: null,
          name: null,
          callSign: null,
          shipType: null,
          destination: null,
          eta: null,
          lastSeenAt: null,
          positions: [
            {
              lat: 53,
              lng: 14,
              speedOverGround: null,
              courseOverGround: null,
              trueHeading: null,
              navStatus: null,
              broadcastTimestamp: null,
              ingestTimestamp: new Date('2026-05-11T18:00:00Z'),
            },
          ],
        },
      ]);

      const [row] = await service.listVessels(1);
      expect(row.position?.updatedAt).toBe('2026-05-11T18:00:00.000Z');
    });

    it('emits null position when no positions exist for vessel', async () => {
      vessel.findMany.mockResolvedValue([
        {
          mmsi: 2,
          imo: null,
          name: null,
          callSign: null,
          shipType: null,
          destination: null,
          eta: null,
          lastSeenAt: null,
          positions: [],
        },
      ]);

      const [row] = await service.listVessels(1);
      expect(row.position).toBeNull();
    });

    it('propagates null kinematics through the response shape', async () => {
      vessel.findMany.mockResolvedValue([
        {
          mmsi: 3,
          imo: null,
          name: null,
          callSign: null,
          shipType: null,
          destination: null,
          eta: null,
          lastSeenAt: null,
          positions: [
            {
              lat: 54,
              lng: 14.5,
              speedOverGround: null,
              courseOverGround: null,
              trueHeading: null,
              navStatus: null,
              broadcastTimestamp: new Date('2026-05-11T18:00:00Z'),
              ingestTimestamp: new Date('2026-05-11T18:00:01Z'),
            },
          ],
        },
      ]);

      const [row] = await service.listVessels(1);
      expect(row.position).toEqual({
        lat: 54,
        lng: 14.5,
        speedOverGround: null,
        courseOverGround: null,
        trueHeading: null,
        navStatus: null,
        updatedAt: '2026-05-11T18:00:00.000Z',
      });
    });

    it('passes limit through to Prisma orderBy and take', async () => {
      vessel.findMany.mockResolvedValue([]);
      await service.listVessels(50);
      expect(vessel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { lastSeenAt: 'desc' },
          take: 50,
        }),
      );
    });

    it('returns empty array when no vessels match', async () => {
      vessel.findMany.mockResolvedValue([]);
      await expect(service.listVessels(10)).resolves.toEqual([]);
    });
  });

  describe('getVessel', () => {
    it('returns mapped vessel when found', async () => {
      vessel.findUnique.mockResolvedValue({
        mmsi: 261000000,
        imo: null,
        name: 'X',
        callSign: null,
        shipType: null,
        destination: null,
        eta: null,
        lastSeenAt: null,
        positions: [],
      });

      const result = await service.getVessel(261000000);
      expect(result?.mmsi).toBe(261000000);
      expect(result?.name).toBe('X');
      expect(result?.position).toBeNull();
    });

    it('returns null when not found', async () => {
      vessel.findUnique.mockResolvedValue(null);
      await expect(service.getVessel(999)).resolves.toBeNull();
    });
  });
});
