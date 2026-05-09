import type { Map as MaplibreMap } from 'maplibre-gl';
import { VESSEL_ARROW_ICON_ID } from '../styles/osm-raster-style';

const ICON_SIZE = 35;

function buildArrowImage(): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for vessel arrow icon');
  ctx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  // Sharp apex, slim wings, deep tail notch — reads as a vessel from a distance.
  ctx.moveTo(17.5, 2.5);
  ctx.lineTo(28, 30.5);
  ctx.lineTo(17.5, 23.5);
  ctx.lineTo(7, 30.5);
  ctx.closePath();
  ctx.fill();
  return ctx.getImageData(0, 0, ICON_SIZE, ICON_SIZE);
}

export function ensureVesselArrowIcon(map: MaplibreMap): void {
  if (map.hasImage(VESSEL_ARROW_ICON_ID)) return;
  const image = buildArrowImage();
  map.addImage(
    VESSEL_ARROW_ICON_ID,
    { width: image.width, height: image.height, data: image.data },
    { sdf: true },
  );
}
