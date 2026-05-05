import { useEffect, useRef } from 'react';
import { MapController } from '../core/map-controller';
import type { LngLat, MapEngineConfig } from '../core/map-engine.types';
import '../core/register-engines';
import { osmRasterStyle } from '../styles/osm-raster-style';

const SZCZECIN_HARBOR_CENTER: LngLat = [14.5528, 53.4285];

const MAP_CONFIG: MapEngineConfig = {
  view: {
    center: SZCZECIN_HARBOR_CENTER,
    zoom: 12,
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
