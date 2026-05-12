/**
 * Custom fetcher injected into Orval-generated clients via the
 * `output.override.mutator` option. Every generated endpoint funnel
 * comes through this function; it adds:
 *
 *   - a configurable base URL read from VITE_API_URL (Vite inlines
 *     it at build time), so the same code points at the deployed api
 *     in production and at localhost during dev,
 *   - JSON response parsing,
 *   - typed error throwing so callers can `catch (err) { if (err
 *     instanceof OrvalApiError) ... }` without parsing strings.
 *
 * Orval (fetch client) generates two-argument calls:
 *   const res = await orvalFetcher<T>(url, { method, ... });
 *   // res.data is T, res.status is number, res.headers is Headers
 *
 * Keep this file tiny - it is the only piece the generated client
 * depends on outside its own module, so any complexity here ripples
 * into every call site.
 */

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class OrvalApiError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string, message: string) {
    super(message);
    this.name = 'OrvalApiError';
    this.status = status;
    this.url = url;
  }
}

/**
 * Orval expects the fetcher to return a `{ data, status, headers }`
 * envelope typed as the generic parameter `T`. The generated client
 * declares each endpoint response as a union of `{ data: Body200,
 * status: 200, headers: Headers } | { data: void, status: 400 }`
 * etc, and the fetcher fulfils it via a single cast.
 */
export const orvalFetcher = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const fullUrl = `${API_BASE_URL}${url}`;

  const response = await fetch(fullUrl, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body !== undefined && init.body !== null
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new OrvalApiError(
      response.status,
      fullUrl,
      `${init?.method ?? 'GET'} ${fullUrl} -> HTTP ${response.status}`,
    );
  }

  // 204 No Content carries no body; tolerate that for delete-like endpoints.
  const data: unknown = response.status === 204 ? undefined : await response.json();

  return {
    data,
    status: response.status,
    headers: response.headers,
  } as T;
};

export default orvalFetcher;
