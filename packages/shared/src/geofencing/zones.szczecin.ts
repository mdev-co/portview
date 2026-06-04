import { type Zone, type ZoneCollection, zoneId } from './types';

/**
 * Predefined zones for the Port of Szczecin demo. Coordinates were
 * traced over the OpenStreetMap port outline and cross-checked
 * against the published Tor Wodny Szczecin-Świnoujście channel
 * axis (precision ~80 m at city zoom). The shapes are not the
 * authoritative Port Authority boundaries; they are demo overlays
 * sized to cover the operationally relevant areas where AIS traffic
 * actually congregates.
 *
 * Polygon winding: GeoJSON requires the outer ring to be a closed
 * linear ring (first and last point equal) and recommends
 * counter-clockwise order. Each polygon below closes itself.
 *
 * Coordinate order is [lng, lat] per GeoJSON spec. The port is
 * along the Odra river, axis roughly N-S, centred near 14.62 E.
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
    'szczecin-tor-wodny',
    'Tor Wodny',
    'channel',
    'Main shipping channel Szczecin-Świnoujście. Follows the Odra navigation axis through the port.',
    [
      [14.6035, 53.565],
      [14.6175, 53.565],
      [14.6285, 53.52],
      [14.6395, 53.48],
      [14.651, 53.44],
      [14.6605, 53.405],
      [14.668, 53.37],
      [14.6515, 53.366],
      [14.642, 53.4],
      [14.631, 53.44],
      [14.6195, 53.48],
      [14.6085, 53.52],
      [14.5965, 53.56],
      [14.6035, 53.565],
    ],
  ),
  zone(
    'szczecin-port-glowny',
    'Port Główny',
    'harbor',
    'Main commercial quays along the eastern bank - general cargo, ferry, container terminals.',
    [
      [14.591, 53.45],
      [14.609, 53.45],
      [14.609, 53.428],
      [14.591, 53.428],
      [14.591, 53.45],
    ],
  ),
  zone(
    'szczecin-basen-gorniczy',
    'Basen Górniczy',
    'harbor',
    'Bulk cargo basin - coal, ore, aggregates handled at the inland berths.',
    [
      [14.615, 53.437],
      [14.634, 53.437],
      [14.634, 53.42],
      [14.615, 53.42],
      [14.615, 53.437],
    ],
  ),
  zone(
    'szczecin-kotwicowisko-polnocne',
    'Kotwicowisko Północne',
    'anchorage',
    'Northern anchorage on the approach from Police and the Świnoujście fairway.',
    [
      [14.645, 53.525],
      [14.685, 53.525],
      [14.685, 53.495],
      [14.645, 53.495],
      [14.645, 53.525],
    ],
  ),
  zone(
    'szczecin-kotwicowisko-poludniowe',
    'Kotwicowisko Południowe',
    'anchorage',
    'Southern anchorage downstream of the harbour mouth, used at high traffic.',
    [
      [14.648, 53.383],
      [14.685, 53.383],
      [14.685, 53.355],
      [14.648, 53.355],
      [14.648, 53.383],
    ],
  ),
  zone(
    'szczecin-strefa-przeladunkowa',
    'Strefa Przeładunkowa',
    'restricted',
    'Restricted transfer zone - no transit traffic; berth operations only with port authority clearance.',
    [
      [14.578, 53.41],
      [14.591, 53.41],
      [14.591, 53.394],
      [14.578, 53.394],
      [14.578, 53.41],
    ],
  ),
];

export const SZCZECIN_ZONE_COLLECTION: ZoneCollection = {
  type: 'FeatureCollection',
  features: SZCZECIN_ZONES as Zone[],
};

export { SZCZECIN_ZONES };
