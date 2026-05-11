-- Enable PostGIS for spatial types and indexes (geography, GiST).
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateTable
CREATE TABLE "vessels" (
    "mmsi" INTEGER NOT NULL,
    "imo" INTEGER,
    "name" VARCHAR(20),
    "call_sign" VARCHAR(7),
    "ship_type" INTEGER,
    "to_bow" INTEGER,
    "to_stern" INTEGER,
    "to_port" INTEGER,
    "to_starboard" INTEGER,
    "draught" DOUBLE PRECISION,
    "destination" VARCHAR(20),
    "eta" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "kalman_lng" DOUBLE PRECISION,
    "kalman_lat" DOUBLE PRECISION,
    "kalman_vlng" DOUBLE PRECISION,
    "kalman_vlat" DOUBLE PRECISION,
    "kalman_covariance" JSONB,
    "kalman_updated_at" TIMESTAMP(3),

    CONSTRAINT "vessels_pkey" PRIMARY KEY ("mmsi")
);

-- CreateTable
CREATE TABLE "vessel_positions" (
    "id" BIGSERIAL NOT NULL,
    "vessel_mmsi" INTEGER NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "speed_over_ground" DOUBLE PRECISION,
    "course_over_ground" DOUBLE PRECISION,
    "true_heading" INTEGER,
    "rate_of_turn" DOUBLE PRECISION,
    "nav_status" INTEGER,
    "broadcast_timestamp" TIMESTAMP(3),
    "ingest_timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Spatial column derived from (lng, lat) at write time. STORED so
    -- GiST can index it; geography uses true great-circle math and
    -- ST_DWithin treats radius as meters.
    "position" geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography) STORED,

    CONSTRAINT "vessel_positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vessels_imo_key" ON "vessels"("imo");

-- CreateIndex
CREATE INDEX "vessel_positions_vessel_mmsi_ingest_timestamp_idx" ON "vessel_positions"("vessel_mmsi", "ingest_timestamp" DESC);

-- CreateIndex
CREATE INDEX "vessel_positions_position_gist_idx" ON "vessel_positions" USING GIST ("position");

-- AddForeignKey
ALTER TABLE "vessel_positions" ADD CONSTRAINT "vessel_positions_vessel_mmsi_fkey" FOREIGN KEY ("vessel_mmsi") REFERENCES "vessels"("mmsi") ON DELETE CASCADE ON UPDATE CASCADE;
