import type { Map as MaplibreMap } from 'maplibre-gl';
import {
  VESSEL_ICON_CARGO_ID,
  VESSEL_ICON_PASSENGER_ID,
  VESSEL_ICON_SMALL_ID,
  VESSEL_LABEL_BG_ID,
  VESSEL_SELECTION_RING_ID,
  VESSEL_UNSELECTED_RING_ID,
} from '../styles/osm-raster-style';

const SELECTION_RING_HEX = '#fbbf24';
const LABEL_BG_FILL = 'rgba(15, 23, 42, 0.85)';

/**
 * Top-down ship silhouettes registered as SDF map images so the
 * style spec can tint each marker by category colour via the
 * icon-color paint expression. Three shapes cover the seven vessel
 * categories:
 *
 *  - cargo / tanker: long freighter silhouette with squared stern
 *    and tapered bow. Reads as "big ship" at any zoom.
 *  - passenger / sailing / other: medium hull with rounded stern.
 *    Slightly slimmer than the freighter shape.
 *  - fishing / service: compact craft with pointed bow and short
 *    hull. Reads as "small vessel" so the operator can scan port
 *    activity at a glance.
 *
 * Canvas dimensions are square so MapLibre rotation around the icon
 * centre stays predictable. The visible silhouette occupies the
 * upper third (bow) through to ~95% of the canvas (stern), leaving a
 * small margin for the icon-halo paint expression.
 */

type ShipParams = {
  size: number;
  bowApexY: number;
  shoulderY: number;
  sternY: number;
  hullHalfWidth: number;
  sternHalfWidth: number;
};

function drawShip(canvas: HTMLCanvasElement, params: ShipParams): ImageData {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for vessel icon');
  const { size, bowApexY, shoulderY, sternY, hullHalfWidth, sternHalfWidth } = params;
  const cx = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx, bowApexY);
  ctx.lineTo(cx + hullHalfWidth, shoulderY);
  ctx.lineTo(cx + sternHalfWidth, sternY);
  ctx.lineTo(cx - sternHalfWidth, sternY);
  ctx.lineTo(cx - hullHalfWidth, shoulderY);
  ctx.closePath();
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

function buildCargoIcon(): ImageData {
  const SIZE = 72;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  // Long freighter. Bow tapers high, hull occupies 70% of length,
  // stern is wider and flatter than the small craft shape.
  // Coords doubled vs the visual baseline so SDF samples the silhouette
  // at 2x density; icon-size in the style spec is halved to compensate,
  // visual footprint stays the same, edges read smoother at every zoom.
  return drawShip(canvas, {
    size: SIZE,
    bowApexY: 6,
    shoulderY: 22,
    sternY: 66,
    hullHalfWidth: 14,
    sternHalfWidth: 13,
  });
}

function buildPassengerIcon(): ImageData {
  const SIZE = 64;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  // Medium hull, sharper bow taper, slightly slimmer than freighter.
  return drawShip(canvas, {
    size: SIZE,
    bowApexY: 6,
    shoulderY: 22,
    sternY: 58,
    hullHalfWidth: 11,
    sternHalfWidth: 9,
  });
}

function buildSmallIcon(): ImageData {
  const SIZE = 56;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  // Compact craft. Sharper bow, shorter overall, narrower hull.
  return drawShip(canvas, {
    size: SIZE,
    bowApexY: 8,
    shoulderY: 22,
    sternY: 48,
    hullHalfWidth: 9,
    sternHalfWidth: 7,
  });
}

/**
 * Dashed amber ring drawn on a transparent canvas. Registered as a
 * non-SDF image so the amber hue is baked into the pixels and the
 * style spec only has to position / size it; no `icon-color` tint.
 * Canvas is 96 px so the ring reads at the same visual scale as the
 * 72 px cargo silhouette when both ride the same `icon-size` curve.
 */
function buildSelectionRingIcon(): ImageData {
  const SIZE = 96;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for selection ring');
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const radius = SIZE / 2 - 6;
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = SELECTION_RING_HEX;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.setLineDash([8, 5]);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

/**
 * Dotted ring drawn in white on a transparent canvas, registered as
 * SDF so the style spec can tint it per feature via `icon-color`.
 * Pairs with the vessel layer's fill expression: every unselected
 * vessel gets a ring in its own category colour (cargo blue, sailing
 * cyan, fishing indigo, etc.) so the ring reads as a delicate halo
 * of the same hue rather than a neutral grey accent. Tighter dashes
 * (3 / 3), thinner line (1.5 px) and smaller canvas (80 px vs the
 * selection ring's 96 px) keep it visually distinct from the amber
 * selection ring at any zoom.
 */
function buildUnselectedRingIcon(): ImageData {
  const SIZE = 80;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for unselected ring');
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const radius = SIZE / 2 - 7;
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  // Shorter dash + bigger gap reads as a dotted ring rather than a
  // near-continuous line. Earlier [6,4] left the dashes close enough
  // to merge into a blurry stroke at typical zoom levels.
  ctx.setLineDash([4, 7]);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

/**
 * Rounded-rectangle badge background for vessel labels. Registered
 * as a stretchable map image with corner-preserving stretch zones so
 * MapLibre's `icon-text-fit: 'both'` resizes the icon around the
 * label text without distorting the 4 px rounded corners. Filled
 * with slate-900 at 0.85 alpha so the white label text sits on a
 * subtle dark plate that reads well over any base map.
 */
function buildLabelBackgroundIcon(): ImageData {
  const SIZE = 16;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for label background');
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = LABEL_BG_FILL;
  const r = 4;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(SIZE - r, 0);
  ctx.arcTo(SIZE, 0, SIZE, r, r);
  ctx.lineTo(SIZE, SIZE - r);
  ctx.arcTo(SIZE, SIZE, SIZE - r, SIZE, r);
  ctx.lineTo(r, SIZE);
  ctx.arcTo(0, SIZE, 0, SIZE - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
  ctx.fill();
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

function addOnce(map: MaplibreMap, id: string, image: ImageData, options: { sdf: boolean }): void {
  if (map.hasImage(id)) return;
  map.addImage(id, { width: image.width, height: image.height, data: image.data }, options);
}

/**
 * Register the rounded-corner label badge as a stretchable image.
 * The corner-preserving stretchX/stretchY zones keep the 4 px
 * radius intact while MapLibre's `icon-text-fit` resizes the middle
 * of the icon around the label text. Safe to call repeatedly via
 * the hasImage guard.
 */
function addLabelBackgroundOnce(map: MaplibreMap, image: ImageData): void {
  if (map.hasImage(VESSEL_LABEL_BG_ID)) return;
  map.addImage(
    VESSEL_LABEL_BG_ID,
    { width: image.width, height: image.height, data: image.data },
    {
      sdf: false,
      pixelRatio: 1,
      stretchX: [[6, 10]],
      stretchY: [[6, 10]],
      content: [4, 4, 12, 12],
    },
  );
}

/**
 * Register every vessel-icon variant on the running map. Three SDF
 * silhouettes (cargo / passenger / small) get tinted by the style
 * spec's `icon-color` expression; the selection ring is non-SDF so
 * the amber dash pattern renders unchanged. Safe to call repeatedly
 * via the hasImage guard; called from VesselLayer on map ready.
 */
export function ensureVesselIcons(map: MaplibreMap): void {
  addOnce(map, VESSEL_ICON_CARGO_ID, buildCargoIcon(), { sdf: true });
  addOnce(map, VESSEL_ICON_PASSENGER_ID, buildPassengerIcon(), { sdf: true });
  addOnce(map, VESSEL_ICON_SMALL_ID, buildSmallIcon(), { sdf: true });
  addOnce(map, VESSEL_SELECTION_RING_ID, buildSelectionRingIcon(), { sdf: false });
  addOnce(map, VESSEL_UNSELECTED_RING_ID, buildUnselectedRingIcon(), { sdf: true });
  addLabelBackgroundOnce(map, buildLabelBackgroundIcon());
}
