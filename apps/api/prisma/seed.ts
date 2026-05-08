import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Curated 10 vessels around Szczecin / Świnoujście / Pomeranian Bay.
// Names are fictional. MMSIs use the Polish maritime country code (261).
// Coordinates are real waterway / berth locations to make the demo map
// visually anchored to the actual port geography.

const POLAND_MID = 261_000_000;

const RECENT_BROADCAST_MS = 30_000;

type SeedVessel = {
  mmsi: number;
  imo: number | null;
  name: string;
  callSign: string;
  shipType: number;
  toBow: number;
  toStern: number;
  toPort: number;
  toStarboard: number;
  draught: number | null;
  destination: string | null;
  position: {
    lat: number;
    lng: number;
    speedOverGround: number | null;
    courseOverGround: number | null;
    trueHeading: number | null;
    navStatus: number;
  };
};

const seedVessels: ReadonlyArray<SeedVessel> = [
  {
    mmsi: POLAND_MID + 1,
    imo: 9512345,
    name: 'POMERANIA TRADER',
    callSign: 'SPPT1',
    shipType: 70,
    toBow: 70,
    toStern: 30,
    toPort: 8,
    toStarboard: 8,
    draught: 6.5,
    destination: 'GDYNIA',
    position: {
      lat: 53.4267,
      lng: 14.565,
      speedOverGround: 0.2,
      courseOverGround: 90,
      trueHeading: 91,
      navStatus: 5,
    },
  },
  {
    mmsi: POLAND_MID + 2,
    imo: 9612345,
    name: 'BALTIC LNG STAR',
    callSign: 'SPLN2',
    shipType: 80,
    toBow: 160,
    toStern: 40,
    toPort: 15,
    toStarboard: 15,
    draught: 11.5,
    destination: 'SWINOUJSCIE LNG',
    position: {
      lat: 53.932,
      lng: 14.244,
      speedOverGround: 0,
      courseOverGround: 0,
      trueHeading: 180,
      navStatus: 5,
    },
  },
  {
    mmsi: POLAND_MID + 3,
    imo: 9234567,
    name: 'ODRA UNITY',
    callSign: 'SPOU3',
    shipType: 60,
    toBow: 90,
    toStern: 40,
    toPort: 11,
    toStarboard: 11,
    draught: 5.8,
    destination: 'YSTAD',
    position: {
      lat: 53.908,
      lng: 14.253,
      speedOverGround: 12.5,
      courseOverGround: 350,
      trueHeading: 351,
      navStatus: 0,
    },
  },
  {
    mmsi: POLAND_MID + 4,
    imo: null,
    name: 'SZCZECIN PILOT 1',
    callSign: 'SPPI4',
    shipType: 52,
    toBow: 20,
    toStern: 10,
    toPort: 5,
    toStarboard: 5,
    draught: 3.2,
    destination: 'SZCZECIN PILOT',
    position: {
      lat: 53.422,
      lng: 14.602,
      speedOverGround: 1.5,
      courseOverGround: 270,
      trueHeading: 268,
      navStatus: 0,
    },
  },
  {
    mmsi: POLAND_MID + 5,
    imo: 9333444,
    name: 'NORDIC EXPRESS',
    callSign: 'SPNE5',
    shipType: 70,
    toBow: 100,
    toStern: 40,
    toPort: 10,
    toStarboard: 10,
    draught: 7.2,
    destination: 'KARLSHAMN',
    position: {
      lat: 53.58,
      lng: 14.57,
      speedOverGround: 9.8,
      courseOverGround: 15,
      trueHeading: 16,
      navStatus: 0,
    },
  },
  {
    mmsi: POLAND_MID + 6,
    imo: 9555666,
    name: 'AMBER OIL CARRIER',
    callSign: 'SPAO6',
    shipType: 80,
    toBow: 130,
    toStern: 30,
    toPort: 12,
    toStarboard: 12,
    draught: 9.5,
    destination: 'GDANSK',
    position: {
      lat: 53.75,
      lng: 14.35,
      speedOverGround: 11.0,
      courseOverGround: 45,
      trueHeading: 46,
      navStatus: 0,
    },
  },
  {
    mmsi: POLAND_MID + 7,
    imo: 9444555,
    name: 'GDYNIA AMBER',
    callSign: 'SPGA7',
    shipType: 70,
    toBow: 95,
    toStern: 25,
    toPort: 9,
    toStarboard: 9,
    draught: 6.8,
    destination: 'KIEL',
    position: {
      lat: 53.88,
      lng: 14.21,
      speedOverGround: 0.0,
      courseOverGround: 0,
      trueHeading: 90,
      navStatus: 1,
    },
  },
  {
    mmsi: POLAND_MID + 8,
    imo: null,
    name: 'KOLOBRZEG QUEEN',
    callSign: 'SPKQ8',
    shipType: 60,
    toBow: 35,
    toStern: 15,
    toPort: 5,
    toStarboard: 5,
    draught: 2.8,
    destination: 'SWINOUJSCIE',
    position: {
      lat: 53.94,
      lng: 14.22,
      speedOverGround: 8.2,
      courseOverGround: 200,
      trueHeading: 199,
      navStatus: 0,
    },
  },
  {
    mmsi: POLAND_MID + 9,
    imo: null,
    name: 'POMORZE FISHER',
    callSign: 'SPPF9',
    shipType: 30,
    toBow: 18,
    toStern: 7,
    toPort: 4,
    toStarboard: 4,
    draught: 3.0,
    destination: 'KOLOBRZEG',
    position: {
      lat: 54.02,
      lng: 14.05,
      speedOverGround: 4.5,
      courseOverGround: 120,
      trueHeading: 122,
      navStatus: 7,
    },
  },
  {
    mmsi: POLAND_MID + 10,
    imo: 9777888,
    name: 'ODRA RIVER STAR',
    callSign: 'SPOR0',
    shipType: 70,
    toBow: 80,
    toStern: 20,
    toPort: 7,
    toStarboard: 7,
    draught: 5.2,
    destination: 'POLICE',
    position: {
      lat: 53.468,
      lng: 14.575,
      speedOverGround: 6.0,
      courseOverGround: 180,
      trueHeading: 181,
      navStatus: 0,
    },
  },
];

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set; check apps/api/.env');
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main(): Promise<void> {
  const now = new Date();
  const broadcastAt = new Date(now.getTime() - RECENT_BROADCAST_MS);

  for (const v of seedVessels) {
    await prisma.vessel.upsert({
      where: { mmsi: v.mmsi },
      create: {
        mmsi: v.mmsi,
        imo: v.imo,
        name: v.name,
        callSign: v.callSign,
        shipType: v.shipType,
        toBow: v.toBow,
        toStern: v.toStern,
        toPort: v.toPort,
        toStarboard: v.toStarboard,
        draught: v.draught,
        destination: v.destination,
        lastSeenAt: now,
      },
      update: {
        name: v.name,
        callSign: v.callSign,
        shipType: v.shipType,
        toBow: v.toBow,
        toStern: v.toStern,
        toPort: v.toPort,
        toStarboard: v.toStarboard,
        draught: v.draught,
        destination: v.destination,
        lastSeenAt: now,
      },
    });

    await prisma.vesselPosition.create({
      data: {
        vesselMmsi: v.mmsi,
        lat: v.position.lat,
        lng: v.position.lng,
        speedOverGround: v.position.speedOverGround,
        courseOverGround: v.position.courseOverGround,
        trueHeading: v.position.trueHeading,
        navStatus: v.position.navStatus,
        broadcastTimestamp: broadcastAt,
      },
    });
  }

  console.warn(`Seeded ${seedVessels.length} vessels with 1 position each.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
