import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { VesselSummary } from './vessels.dto';

const VESSEL_SELECT = {
  mmsi: true,
  imo: true,
  name: true,
  callSign: true,
  shipType: true,
  destination: true,
  eta: true,
  lastSeenAt: true,
  positions: {
    orderBy: { ingestTimestamp: 'desc' as const },
    take: 1,
    select: {
      lat: true,
      lng: true,
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
  destination: string | null;
  eta: Date | null;
  lastSeenAt: Date | null;
  positions: Array<{
    lat: number;
    lng: number;
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
  return {
    mmsi: row.mmsi,
    imo: row.imo,
    name: row.name,
    callSign: row.callSign,
    shipType: row.shipType,
    destination: row.destination,
    eta: row.eta?.toISOString() ?? null,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    position:
      latest === null
        ? null
        : {
            lat: latest.lat,
            lng: latest.lng,
            updatedAt: (
              latest.broadcastTimestamp ?? latest.ingestTimestamp
            ).toISOString(),
          },
  };
}
