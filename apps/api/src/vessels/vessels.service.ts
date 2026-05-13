import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { VesselSummary } from './vessels.dto';

const VESSEL_SELECT = {
  mmsi: true,
  imo: true,
  name: true,
  callSign: true,
  shipType: true,
  toBow: true,
  toStern: true,
  toPort: true,
  toStarboard: true,
  draught: true,
  destination: true,
  eta: true,
  lastSeenAt: true,
  kalmanLng: true,
  kalmanLat: true,
  kalmanVlng: true,
  kalmanVlat: true,
  kalmanUpdatedAt: true,
  positions: {
    orderBy: { ingestTimestamp: 'desc' as const },
    take: 1,
    select: {
      lat: true,
      lng: true,
      speedOverGround: true,
      courseOverGround: true,
      trueHeading: true,
      navStatus: true,
      rateOfTurn: true,
      broadcastTimestamp: true,
      ingestTimestamp: true,
    },
  },
} as const;

type VesselRow = {
  mmsi: number;
  imo: number | null;
  name: string | null;
  callSign: string | null;
  shipType: number | null;
  toBow: number | null;
  toStern: number | null;
  toPort: number | null;
  toStarboard: number | null;
  draught: number | null;
  destination: string | null;
  eta: Date | null;
  lastSeenAt: Date | null;
  kalmanLng: number | null;
  kalmanLat: number | null;
  kalmanVlng: number | null;
  kalmanVlat: number | null;
  kalmanUpdatedAt: Date | null;
  positions: Array<{
    lat: number;
    lng: number;
    speedOverGround: number | null;
    courseOverGround: number | null;
    trueHeading: number | null;
    navStatus: number | null;
    rateOfTurn: number | null;
    broadcastTimestamp: Date | null;
    ingestTimestamp: Date;
  }>;
};

@Injectable()
export class VesselsService {
  constructor(private readonly prisma: PrismaService) {}

  async listVessels(limit: number): Promise<VesselSummary[]> {
    const rows = await this.prisma.vessel.findMany({
      orderBy: { lastSeenAt: 'desc' },
      take: limit,
      select: VESSEL_SELECT,
    });
    return rows.map(toSummary);
  }

  async getVessel(mmsi: number): Promise<VesselSummary | null> {
    const row = await this.prisma.vessel.findUnique({
      where: { mmsi },
      select: VESSEL_SELECT,
    });
    return row === null ? null : toSummary(row);
  }
}

function toSummary(row: VesselRow): VesselSummary {
  const latest = row.positions[0] ?? null;
  const dimensions =
    row.toBow !== null &&
    row.toStern !== null &&
    row.toPort !== null &&
    row.toStarboard !== null
      ? {
          toBow: row.toBow,
          toStern: row.toStern,
          toPort: row.toPort,
          toStarboard: row.toStarboard,
        }
      : null;
  const kalmanState =
    row.kalmanLng !== null &&
    row.kalmanLat !== null &&
    row.kalmanVlng !== null &&
    row.kalmanVlat !== null &&
    row.kalmanUpdatedAt !== null
      ? {
          lng: row.kalmanLng,
          lat: row.kalmanLat,
          vlng: row.kalmanVlng,
          vlat: row.kalmanVlat,
          updatedAt: row.kalmanUpdatedAt.toISOString(),
        }
      : null;
  return {
    mmsi: row.mmsi,
    imo: row.imo,
    name: row.name,
    callSign: row.callSign,
    shipType: row.shipType,
    dimensions,
    draught: row.draught,
    destination: row.destination,
    eta: row.eta?.toISOString() ?? null,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    position:
      latest === null
        ? null
        : {
            lat: latest.lat,
            lng: latest.lng,
            speedOverGround: latest.speedOverGround,
            courseOverGround: latest.courseOverGround,
            trueHeading: latest.trueHeading,
            navStatus: latest.navStatus,
            rateOfTurn: latest.rateOfTurn,
            broadcastTimestamp:
              latest.broadcastTimestamp?.toISOString() ?? null,
            updatedAt: (
              latest.broadcastTimestamp ?? latest.ingestTimestamp
            ).toISOString(),
          },
    kalmanState,
  };
}
