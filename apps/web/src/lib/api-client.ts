/**
 * Thin typed wrapper around fetch for the SPS REST api. Mirrors the
 * VesselSummary shape from apps/api/src/vessels/vessels.dto.ts; if
 * the api response shape changes both sides need to update.
 *
 * Base URL is read from VITE_API_URL at build time (Vite inlines the
 * value). Set it in the deploy environment (Vercel project settings
 * in prod, local .env for dev). Empty value falls back to same-origin
 * which works when the web is served behind a reverse proxy in front
 * of the api.
 */

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export type VesselPositionSummary = {
  readonly lat: number;
  readonly lng: number;
  readonly speedOverGround: number | null;
  readonly courseOverGround: number | null;
  readonly trueHeading: number | null;
  readonly navStatus: number | null;
  readonly updatedAt: string;
};

export type VesselSummary = {
  readonly mmsi: number;
  readonly imo: number | null;
  readonly name: string | null;
  readonly callSign: string | null;
  readonly shipType: number | null;
  readonly destination: string | null;
  readonly eta: string | null;
  readonly lastSeenAt: string | null;
  readonly position: VesselPositionSummary | null;
};

export type VesselListResponse = {
  readonly vessels: ReadonlyArray<VesselSummary>;
};

export class ApiError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
  }
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    throw new ApiError(response.status, path, `GET ${path} -> HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchVessels(limit?: number): Promise<VesselListResponse> {
  const query = limit === undefined ? '' : `?limit=${String(limit)}`;
  return getJson<VesselListResponse>(`/api/vessels${query}`);
}

export async function fetchVessel(mmsi: number): Promise<VesselSummary> {
  return getJson<VesselSummary>(`/api/vessels/${String(mmsi)}`);
}
