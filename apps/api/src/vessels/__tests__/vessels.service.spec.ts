import { Test } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';
import { VesselsService } from '../vessels.service';

/**
 * VesselsService talks to Postgres through `prisma.$queryRaw` LATERAL
 * JOIN queries, so the mock only needs to capture that one method.
 * Rows come back from the SQL planner in snake_case; the spec uses
 * that shape verbatim to keep the contract honest.
 */
type MockPrisma = {
  $queryRaw: jest.Mock;
};

type PositionFields = {
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

const NULL_DIMENSIONS = {
  to_bow: null,
  to_stern: null,
  to_port: null,
  to_starboard: null,
} as const;

const NULL_KALMAN = {
  kalman_lng: null,
  kalman_lat: null,
  kalman_vlng: null,
  kalman_vlat: null,
  kalman_updated_at: null,
} as const;

const NO_POSITION: PositionFields = {
  pos_lat: null,
  pos_lng: null,
  pos_speed_over_ground: null,
  pos_course_over_ground: null,
  pos_true_heading: null,
  pos_nav_status: null,
  pos_rate_of_turn: null,
  pos_broadcast_timestamp: null,
  pos_ingest_timestamp: null,
};

describe('VesselsService', () => {
  let service: VesselsService;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [VesselsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(VesselsService);
  });

  describe('listVessels', () => {
    it('maps a row with nested latest position to VesselSummary', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          mmsi: 261000001,
          imo: 9876543,
          name: 'POMERANIA TRADER',
          call_sign: 'SPPT1',
          ship_type: 70,
          ...NULL_DIMENSIONS,
          draught: null,
          destination: 'GDYNIA',
          eta: null,
          last_seen_at: new Date('2026-05-11T18:00:00Z'),
          ...NULL_KALMAN,
          pos_lat: 53.4267,
          pos_lng: 14.565,
          pos_speed_over_ground: null,
          pos_course_over_ground: null,
          pos_true_heading: null,
          pos_nav_status: null,
          pos_rate_of_turn: null,
          pos_broadcast_timestamp: new Date('2026-05-11T18:00:00Z'),
          pos_ingest_timestamp: new Date('2026-05-11T18:00:01Z'),
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

    it('falls back to ingest_timestamp when broadcast_timestamp absent', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          mmsi: 1,
          imo: null,
          name: null,
          call_sign: null,
          ship_type: null,
          ...NULL_DIMENSIONS,
          draught: null,
          destination: null,
          eta: null,
          last_seen_at: null,
          ...NULL_KALMAN,
          pos_lat: 53,
          pos_lng: 14,
          pos_speed_over_ground: null,
          pos_course_over_ground: null,
          pos_true_heading: null,
          pos_nav_status: null,
          pos_rate_of_turn: null,
          pos_broadcast_timestamp: null,
          pos_ingest_timestamp: new Date('2026-05-11T18:00:00Z'),
        },
      ]);

      const [row] = await service.listVessels(1);
      expect(row?.position?.updatedAt).toBe('2026-05-11T18:00:00.000Z');
      expect(row?.position?.broadcastTimestamp).toBeNull();
    });

    it('emits null position when LATERAL yields no row', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          mmsi: 2,
          imo: null,
          name: null,
          call_sign: null,
          ship_type: null,
          ...NULL_DIMENSIONS,
          draught: null,
          destination: null,
          eta: null,
          last_seen_at: null,
          ...NULL_KALMAN,
          ...NO_POSITION,
        },
      ]);

      const [row] = await service.listVessels(1);
      expect(row?.position).toBeNull();
    });

    it('emits dimensions object when all four hull offsets present', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          mmsi: 3,
          imo: null,
          name: null,
          call_sign: null,
          ship_type: null,
          to_bow: 100,
          to_stern: 20,
          to_port: 10,
          to_starboard: 12,
          draught: 8.5,
          destination: null,
          eta: null,
          last_seen_at: null,
          ...NULL_KALMAN,
          ...NO_POSITION,
        },
      ]);

      const [row] = await service.listVessels(1);
      expect(row?.dimensions).toEqual({
        toBow: 100,
        toStern: 20,
        toPort: 10,
        toStarboard: 12,
      });
      expect(row?.draught).toBe(8.5);
    });

    it('emits dimensions null when any hull offset missing', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          mmsi: 4,
          imo: null,
          name: null,
          call_sign: null,
          ship_type: null,
          to_bow: 100,
          to_stern: 20,
          to_port: null,
          to_starboard: 12,
          draught: null,
          destination: null,
          eta: null,
          last_seen_at: null,
          ...NULL_KALMAN,
          ...NO_POSITION,
        },
      ]);

      const [row] = await service.listVessels(1);
      expect(row?.dimensions).toBeNull();
    });

    it('emits kalmanState when all five Kalman fields present', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          mmsi: 5,
          imo: null,
          name: null,
          call_sign: null,
          ship_type: null,
          ...NULL_DIMENSIONS,
          draught: null,
          destination: null,
          eta: null,
          last_seen_at: null,
          kalman_lng: 14.5,
          kalman_lat: 53.4,
          kalman_vlng: 0.001,
          kalman_vlat: -0.0002,
          kalman_updated_at: new Date('2026-05-11T18:00:00Z'),
          ...NO_POSITION,
        },
      ]);

      const [row] = await service.listVessels(1);
      expect(row?.kalmanState).toEqual({
        lng: 14.5,
        lat: 53.4,
        vlng: 0.001,
        vlat: -0.0002,
        updatedAt: '2026-05-11T18:00:00.000Z',
      });
    });

    it('returns empty array when no vessels match', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await expect(service.listVessels(10)).resolves.toEqual([]);
    });
  });

  describe('getVessel', () => {
    it('returns mapped vessel when found', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          mmsi: 261000000,
          imo: null,
          name: 'X',
          call_sign: null,
          ship_type: null,
          ...NULL_DIMENSIONS,
          draught: null,
          destination: null,
          eta: null,
          last_seen_at: null,
          ...NULL_KALMAN,
          ...NO_POSITION,
        },
      ]);

      const result = await service.getVessel(261000000);
      expect(result?.mmsi).toBe(261000000);
      expect(result?.name).toBe('X');
      expect(result?.position).toBeNull();
      expect(result?.dimensions).toBeNull();
      expect(result?.kalmanState).toBeNull();
    });

    it('returns null when no row found', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await expect(service.getVessel(999)).resolves.toBeNull();
    });
  });
});
