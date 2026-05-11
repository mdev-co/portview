import { z } from 'zod';

export const ListVesselsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
});
export type ListVesselsQuery = z.infer<typeof ListVesselsQuerySchema>;

export const MmsiParamSchema = z.object({
  mmsi: z.coerce.number().int().positive(),
});
export type MmsiParam = z.infer<typeof MmsiParamSchema>;

export type VesselPositionSummary = {
  lat: number;
  lng: number;
  updatedAt: string;
};

export type VesselSummary = {
  mmsi: number;
  imo: number | null;
  name: string | null;
  callSign: string | null;
  shipType: number | null;
  destination: string | null;
  eta: string | null;
  lastSeenAt: string | null;
  position: VesselPositionSummary | null;
};

export type VesselListResponse = {
  vessels: VesselSummary[];
};
