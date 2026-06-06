import { type Zone, type ZoneCollection, zoneId } from './types';

/**
 * Demo zones for the Port of Szczecin.
 *
 * The six operational zones use real port terminology (Tor Wodny,
 * Basen, Reda, Strefa Manewrowa) and follow the actual geography
 * so dwell-time events fire against believable AIS traffic.
 *
 * Two extra zones round out the chart: Chrobrys Bulwark covers
 * the heritage crane berths at Walz Chrobrego promenade, and
 * three navigation marks scattered across Lake Dabie - named as
 * standard IALA cardinal / safe-water marks - happen to line up
 * into a smiley when the chart is zoomed out far enough.
 *
 * Polygon winding: GeoJSON requires the outer ring to be a closed
 * linear ring (first and last point equal) and recommends
 * counter-clockwise order. Each polygon below closes itself.
 *
 * Coordinate order is [lng, lat] per GeoJSON spec.
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

function decorativeZone(
  id: string,
  label: string,
  coordinates: readonly (readonly [number, number])[],
): Zone {
  return {
    type: 'Feature',
    properties: {
      id: zoneId(id),
      label,
      kind: 'general',
      decorative: true,
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
    'Main fairway Szczecin to Swinoujscie. Bottom dredged to 12.5 m.',
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
    'szczecin-nabrzeze-polskie',
    'Nabrzeze Polskie',
    'harbor',
    'Main commercial quays along the eastern bank. General cargo and container traffic.',
    [
      [14.591, 53.45],
      [14.609, 53.45],
      [14.609, 53.428],
      [14.591, 53.428],
      [14.591, 53.45],
    ],
  ),
  zone(
    'szczecin-basen-gornoslaski',
    'Basen Gornoslaski',
    'harbor',
    'Bulk cargo basin. Coal, ore and aggregate handling.',
    [
      [14.615, 53.437],
      [14.634, 53.437],
      [14.634, 53.42],
      [14.615, 53.42],
      [14.615, 53.437],
    ],
  ),
  zone(
    'szczecin-reda-polnocna',
    'Reda Polnocna',
    'anchorage',
    'Northern roads on the approach from Police. Pilot boarding station.',
    [
      [14.645, 53.525],
      [14.685, 53.525],
      [14.685, 53.495],
      [14.645, 53.495],
      [14.645, 53.525],
    ],
  ),
  zone(
    'szczecin-reda-poludniowa',
    'Reda Poludniowa',
    'anchorage',
    'Southern roads downstream of the harbour mouth, used during high-traffic windows.',
    [
      [14.648, 53.383],
      [14.685, 53.383],
      [14.685, 53.355],
      [14.648, 53.355],
      [14.648, 53.383],
    ],
  ),
  zone(
    'szczecin-strefa-manewrowa-a',
    'Strefa Manewrowa A',
    'restricted',
    'Restricted maneuvering and pilot exchange area. Transit only with Harbour Master clearance.',
    [
      [14.578, 53.41],
      [14.591, 53.41],
      [14.591, 53.394],
      [14.578, 53.394],
      [14.578, 53.41],
    ],
  ),
  // ------------------------------------------------------------
  // Heritage berth on top of the historic harbour cranes at Walz
  // Chrobrego promenade - Szczecins iconic skyline.
  zone(
    'szczecin-chrobry-bulwark',
    "Chrobry's Bulwark",
    'general',
    'Heritage crane berth at the Walz Chrobrego promenade. Listed industrial monument.',
    [
      [14.5625, 53.43],
      [14.5705, 53.43],
      [14.5705, 53.426],
      [14.5625, 53.426],
      [14.5625, 53.43],
    ],
  ),
  // ------------------------------------------------------------
  // Decorative chart art on Lake Dabie. Three groups arranged so
  // the operator who zooms east of the city stumbles into a small
  // navigation poster: smiley face, anchor, compass rose. All
  // flagged `decorative: true` so the renderer hides their labels
  // and the shape reads cleanly.
  decorativeZone('dabie-smile-left-eye', 'Smile Left Eye', [
    [14.711, 53.466],
    [14.7135, 53.466],
    [14.7135, 53.4635],
    [14.711, 53.4635],
    [14.711, 53.466],
  ]),
  decorativeZone('dabie-smile-right-eye', 'Smile Right Eye', [
    [14.7195, 53.466],
    [14.722, 53.466],
    [14.722, 53.4635],
    [14.7195, 53.4635],
    [14.7195, 53.466],
  ]),
  decorativeZone('dabie-smile-mouth', 'Smile Mouth', [
    [14.7095, 53.4565],
    [14.7235, 53.4565],
    [14.725, 53.455],
    [14.7235, 53.453],
    [14.722, 53.4525],
    [14.711, 53.4525],
    [14.7095, 53.453],
    [14.708, 53.455],
    [14.7095, 53.4565],
  ]),
  decorativeZone('dabie-anchor-ring', 'Anchor Ring', [
    [14.7195, 53.518],
    [14.7205, 53.518],
    [14.7205, 53.516],
    [14.7195, 53.516],
    [14.7195, 53.518],
  ]),
  decorativeZone('dabie-anchor-stock', 'Anchor Stock', [
    [14.712, 53.5155],
    [14.728, 53.5155],
    [14.728, 53.5145],
    [14.712, 53.5145],
    [14.712, 53.5155],
  ]),
  decorativeZone('dabie-anchor-shank', 'Anchor Shank', [
    [14.7195, 53.5145],
    [14.7205, 53.5145],
    [14.7205, 53.487],
    [14.7195, 53.487],
    [14.7195, 53.5145],
  ]),
  decorativeZone('dabie-anchor-arm-port', 'Anchor Arm Port', [
    [14.7195, 53.49],
    [14.7195, 53.487],
    [14.715, 53.485],
    [14.71, 53.485],
    [14.708, 53.487],
    [14.711, 53.488],
    [14.715, 53.488],
    [14.7195, 53.49],
  ]),
  decorativeZone('dabie-anchor-arm-starboard', 'Anchor Arm Starboard', [
    [14.7205, 53.49],
    [14.724, 53.488],
    [14.728, 53.488],
    [14.731, 53.487],
    [14.73, 53.485],
    [14.725, 53.485],
    [14.7205, 53.487],
    [14.7205, 53.49],
  ]),
  decorativeZone('dabie-compass-centre', 'Compass Centre', [
    [14.745, 53.4615],
    [14.7465, 53.46],
    [14.745, 53.4585],
    [14.7435, 53.46],
    [14.745, 53.4615],
  ]),
  decorativeZone('dabie-compass-north', 'Compass North', [
    [14.745, 53.47],
    [14.7435, 53.463],
    [14.7465, 53.463],
    [14.745, 53.47],
  ]),
  decorativeZone('dabie-compass-east', 'Compass East', [
    [14.757, 53.46],
    [14.749, 53.4585],
    [14.749, 53.4615],
    [14.757, 53.46],
  ]),
  decorativeZone('dabie-compass-south', 'Compass South', [
    [14.745, 53.45],
    [14.7435, 53.457],
    [14.7465, 53.457],
    [14.745, 53.45],
  ]),
  decorativeZone('dabie-compass-west', 'Compass West', [
    [14.733, 53.46],
    [14.741, 53.4585],
    [14.741, 53.4615],
    [14.733, 53.46],
  ]),
];

export const SZCZECIN_ZONE_COLLECTION: ZoneCollection = {
  type: 'FeatureCollection',
  features: SZCZECIN_ZONES as Zone[],
};

export { SZCZECIN_ZONES };
