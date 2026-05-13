import { Test } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';
import { VesselsService } from '../vessels.service';

type MockVesselClient = {
  findMany: jest.Mock;
  findUnique: jest.Mock;
};

const NULL_DIMENSIONS = {
  toBow: null,
  toStern: null,
  toPort: null,
  toStarboard: null,
};

const NULL_KALMAN = {
  kalmanLng: null,
  kalmanLat: null,
  kalmanVlng: null,
  kalmanVlat: null,
  kalmanUpdatedAt: null,
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
          ...NULL_DIMENSIONS,
          draught: null,
          destination: 'GDYNIA',
          eta: null,
          lastSeenAt: new Date('2026-05-11T18:00:00Z'),
          ...NULL_KALMAN,
          positions: [
            {
              lat: 53.4267,
              lng: 14.565,
              speedOverGround: null,
              courseOverGround: null,
              trueHeading: null,
              navStatus: null,
              rateOfTurn: null,
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
          dimensions: null,
          draught: null,
          destination: 'GDYNIA',
          eta: null,
          lastSeenAt: '2026-05-11T18:00:00.000Z',
          position: {
            lat: 53.4267,
            lng: 14.565,
            speedOverGround: null,
            courseOverGround: null,
            trueHeading: null,
            navStatus: null,
            rateOfTurn: null,
            broadcastTimestamp: '2026-05-11T18:00:00.000Z',
            updatedAt: '2026-05-11T18:00:00.000Z',
          },
          kalmanState: null,
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
          ...NULL_DIMENSIONS,
          draught: null,
          destination: null,
          eta: null,
          lastSeenAt: null,
          ...NULL_KALMAN,
          positions: [
            {
              lat: 53,
              lng: 14,
              speedOverGround: null,
              courseOverGround: null,
              trueHeading: null,
              navStatus: null,
              rateOfTurn: null,
              broadcastTimestamp: null,
              ingestTimestamp: new Date('2026-05-11T18:00:00Z'),
            },
          ],
        },
      ]);

      const [row] = await service.listVessels(1);
      expect(row.position?.updatedAt).toBe('2026-05-11T18:00:00.000Z');
      expect(row.position?.broadcastTimestamp).toBeNull();
    });

    it('emits null position when no positions exist for vessel', async () => {
      vessel.findMany.mockResolvedValue([
        {
          mmsi: 2,
          imo: null,
          name: null,
          callSign: null,
          shipType: null,
          ...NULL_DIMENSIONS,
          draught: null,
          destination: null,
          eta: null,
          lastSeenAt: null,
          ...NULL_KALMAN,
          positions: [],
        },
      ]);

      const [row] = await service.listVessels(1);
      expect(row.position).toBeNull();
    });

    it('emits dimensions object when all four hull offsets present', async () => {
      vessel.findMany.mockResolvedValue([
        {
          mmsi: 3,
          imo: null,
          name: null,
          callSign: null,
          shipType: null,
          toBow: 100,
          toStern: 20,
          toPort: 10,
          toStarboard: 12,
          draught: 8.5,
          destination: null,
          eta: null,
          lastSeenAt: null,
          ...NULL_KALMAN,
          positions: [],
        },
      ]);

      const [row] = await service.listVessels(1);
      expect(row.dimensions).toEqual({
        toBow: 100,
        toStern: 20,
        toPort: 10,
        toStarboard: 12,
      });
      expect(row.draught).toBe(8.5);
    });

    it('emits dimensions null when any hull offset missing', async () => {
      vessel.findMany.mockResolvedValue([
        {
          mmsi: 4,
          imo: null,
          name: null,
          callSign: null,
          shipType: null,
          toBow: 100,
          toStern: 20,
          toPort: null,
          toStarboard: 12,
          draught: null,
          destination: null,
          eta: null,
          lastSeenAt: null,
          ...NULL_KALMAN,
          positions: [],
        },
      ]);

      const [row] = await service.listVessels(1);
      expect(row.dimensions).toBeNull();
    });

    it('emits kalmanState when all five Kalman fields present', async () => {
      vessel.findMany.mockResolvedValue([
        {
          mmsi: 5,
          imo: null,
          name: null,
          callSign: null,
          shipType: null,
          ...NULL_DIMENSIONS,
          draught: null,
          destination: null,
          eta: null,
          lastSeenAt: null,
          kalmanLng: 14.5,
          kalmanLat: 53.4,
          kalmanVlng: 0.001,
          kalmanVlat: -0.0002,
          kalmanUpdatedAt: new Date('2026-05-11T18:00:00Z'),
          positions: [],
        },
      ]);

      const [row] = await service.listVessels(1);
      expect(row.kalmanState).toEqual({
        lng: 14.5,
        lat: 53.4,
        vlng: 0.001,
        vlat: -0.0002,
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
        ...NULL_DIMENSIONS,
        draught: null,
        destination: null,
        eta: null,
        lastSeenAt: null,
        ...NULL_KALMAN,
        positions: [],
      });

      const result = await service.getVessel(261000000);
      expect(result?.mmsi).toBe(261000000);
      expect(result?.name).toBe('X');
      expect(result?.position).toBeNull();
      expect(result?.dimensions).toBeNull();
      expect(result?.kalmanState).toBeNull();
    });

    it('returns null when not found', async () => {
      vessel.findUnique.mockResolvedValue(null);
      await expect(service.getVessel(999)).resolves.toBeNull();
    });
  });
});
