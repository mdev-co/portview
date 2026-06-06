import { useEffect, useRef } from 'react';
import { MapController } from '../core/map-controller';
import type { LngLat, MapEngineConfig } from '../core/map-engine.types';
import '../core/register-engines';
import { osmRasterStyle } from '../styles/osm-raster-style';

const SZCZECIN_HARBOR_CENTER: LngLat = [14.5528, 53.4285];

const MAP_CONFIG: MapEngineConfig = {
  view: {
    center: SZCZECIN_HARBOR_CENTER,
    zoom: 13,
    // Pitched view from first paint so the operator sees the harbour
    // on an oblique angle (Airspace Intelligence "looking across the
    // water" framing) instead of pure top-down. 60 deg keeps the
    // horizon below the header without losing depth perception.
    pitch: 60,
    bearing: -20,
  },
  style: osmRasterStyle,
  attributionMode: 'compact',
};

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const controller = MapController.getInstance();
    controller.attachContainer(container);
    controller.useEngine('maplibre', MAP_CONFIG);

    return () => {
      controller.detachContainer();
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}
