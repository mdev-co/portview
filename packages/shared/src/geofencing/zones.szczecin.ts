import { type Zone, type ZoneCollection, zoneId } from './types';

/**
 * Hard-coded zones for the Port of Szczecin demo. Coordinates were
 * traced over the OpenStreetMap port outline (precision ~50 m at
 * city zoom). Good enough for the public demo; operator drawing
 * (terra-draw) takes over once the system is in production and the
 * port authority hands us authoritative boundaries.
 *
 * Polygon winding: GeoJSON requires the outer ring to be a closed
 * linear ring (first and last point equal) and recommends
 * counter-clockwise order. Each polygon below closes itself.
 *
 * Coordinate order is [lng, lat] per GeoJSON spec. Szczecin sits
 * around 14.55 E / 53.43 N.
 */
function zone(
  id: string,
  label: string,
  kind: Zone['properties']['kind'],
  description: string,
  coordinates: readonly (readonly [number, number])[],
): Zone {
  return {
    type: 'Feature',
    properties: {
      id: zoneId(id),
      label,
      kind,
      description,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates.map(([lng, lat]) => [lng, lat])],
    },
  };
}

const SZCZECIN_ZONES: readonly Zone[] = [
  zone(
    'szczecin-entry-channel',
    'Entry Channel',
    'channel',
    'Main approach into Szczecin harbour from the Odra river mouth.',
    [
      [14.51, 53.5],
      [14.56, 53.5],
      [14.56, 53.45],
      [14.51, 53.45],
      [14.51, 53.5],
    ],
  ),
  zone(
    'szczecin-inner-harbor',
    'Inner Harbor',
    'harbor',
    'Quay-side berthing area along the eastern bank.',
    [
      [14.55, 53.44],
      [14.59, 53.44],
      [14.59, 53.41],
      [14.55, 53.41],
      [14.55, 53.44],
    ],
  ),
  zone(
    'szczecin-anchorage-a',
    'Anchorage A',
    'anchorage',
    'Primary anchorage north of the harbour entrance.',
    [
      [14.49, 53.49],
      [14.52, 53.49],
      [14.52, 53.46],
      [14.49, 53.46],
      [14.49, 53.49],
    ],
  ),
  zone(
    'szczecin-anchorage-b',
    'Anchorage B',
    'anchorage',
    'Secondary anchorage south of the harbour, used at high traffic.',
    [
      [14.55, 53.4],
      [14.58, 53.4],
      [14.58, 53.37],
      [14.55, 53.37],
      [14.55, 53.4],
    ],
  ),
  zone(
    'szczecin-restricted-military',
    'Restricted (Military)',
    'restricted',
    'No commercial traffic; routine patrol zone.',
    [
      [14.6, 53.46],
      [14.63, 53.46],
      [14.63, 53.43],
      [14.6, 53.43],
      [14.6, 53.46],
    ],
  ),
];

export const SZCZECIN_ZONE_COLLECTION: ZoneCollection = {
  type: 'FeatureCollection',
  features: SZCZECIN_ZONES as Zone[],
};

export { SZCZECIN_ZONES };
