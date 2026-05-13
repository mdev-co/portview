import maplibregl, { type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AdapterDisposedError, AdapterNotInitializedError } from '../core/errors';
import type {
  ErrorListener,
  GeoJSONFeatureCollection,
  IMapEngineAdapter,
  LngLat,
  MapEngineConfig,
  MapEngineType,
  ReadyListener,
  Unsubscribe,
} from '../core/map-engine.types';

const ENGINE_TYPE: MapEngineType = 'maplibre';

interface MapLibreErrorEvent {
  error?: Error;
}

interface SetDataCapable {
  setData: (data: GeoJSONFeatureCollection) => void;
}

function hasSetData(source: unknown): source is SetDataCapable {
  return (
    typeof source === 'object' &&
    source !== null &&
    'setData' in source &&
    typeof (source as { setData: unknown }).setData === 'function'
  );
}

function toAttributionControl(
  mode: MapEngineConfig['attributionMode'],
): false | { compact: boolean } {
  if (mode === 'none') return false;
  if (mode === 'full') return { compact: false };
  return { compact: true };
}

export class MapLibreAdapter implements IMapEngineAdapter {
  readonly engineType: MapEngineType = ENGINE_TYPE;

  private map: MapLibreMap | null = null;
  private readonly readyListeners = new Set<ReadyListener>();
  private readonly errorListeners = new Set<ErrorListener>();
  private readyState = false;
  private disposed = false;

  async initialize(container: HTMLElement, config: MapEngineConfig): Promise<void> {
    if (this.disposed) {
      throw new AdapterDisposedError(ENGINE_TYPE, 'initialize');
    }

    const [longitude, latitude] = config.view.center;
    const mapOptions: maplibregl.MapOptions = {
      container,
      style: config.style as string | StyleSpecification,
      center: [longitude, latitude],
      zoom: config.view.zoom,
      attributionControl: toAttributionControl(config.attributionMode),
    };
    if (config.view.bearing !== undefined) {
      mapOptions.bearing = config.view.bearing;
    }
    if (config.view.pitch !== undefined) {
      mapOptions.pitch = config.view.pitch;
    }
    if (config.view.maxBounds) {
      const [sw, ne] = config.view.maxBounds;
      mapOptions.maxBounds = [
        [sw[0], sw[1]],
        [ne[0], ne[1]],
      ];
    }
    const map = new maplibregl.Map(mapOptions);

    this.map = map;

    map.on('error', (evt: MapLibreErrorEvent) => {
      const err = evt.error ?? new Error('MapLibre error');
      this.errorListeners.forEach(l => l(err));
    });

    await new Promise<void>((resolve, reject) => {
      const onLoad = (): void => {
        map.off('load', onLoad);
        map.off('error', onErrorBeforeLoad);
        this.readyState = true;
        this.readyListeners.forEach(l => l());
        resolve();
      };
      const onErrorBeforeLoad = (evt: MapLibreErrorEvent): void => {
        map.off('load', onLoad);
        map.off('error', onErrorBeforeLoad);
        reject(evt.error ?? new Error('MapLibre failed to load'));
      };
      map.on('load', onLoad);
      map.on('error', onErrorBeforeLoad);
    });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.readyState = false;
    this.readyListeners.clear();
    this.errorListeners.clear();
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  onReady(listener: ReadyListener): Unsubscribe {
    this.readyListeners.add(listener);
    if (this.readyState) listener();
    return () => {
      this.readyListeners.delete(listener);
    };
  }

  onError(listener: ErrorListener): Unsubscribe {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  flyTo(center: LngLat, zoom?: number): void {
    if (!this.map) {
      throw new AdapterNotInitializedError(ENGINE_TYPE, 'flyTo');
    }
    const [longitude, latitude] = center;
    this.map.flyTo({ center: [longitude, latitude], zoom });
  }

  setSourceData(sourceId: string, data: GeoJSONFeatureCollection): void {
    if (!this.map) {
      throw new AdapterNotInitializedError(ENGINE_TYPE, 'setSourceData');
    }
    const source = this.map.getSource(sourceId);
    if (!source) {
      throw new Error(`Map source "${sourceId}" not found.`);
    }
    if (!hasSetData(source)) {
      throw new Error(
        `Map source "${sourceId}" does not support setData (expected GeoJSON source).`,
      );
    }
    source.setData(data);
  }

  setLayerVisibility(layerId: string, visible: boolean): void {
    if (!this.map) {
      throw new AdapterNotInitializedError(ENGINE_TYPE, 'setLayerVisibility');
    }
    if (!this.map.getLayer(layerId)) {
      // Silent no-op rather than throw: a style descriptor referencing
      // a layer not in the current style spec is a mis-configuration
      // that should surface as a missing visual, not crash the runtime
      // sync loop the moment the style switcher is opened.
      return;
    }
    this.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
  }

  isInitialized(): boolean {
    return this.map !== null && this.readyState;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  getRawEngine(): unknown {
    return this.map;
  }
}
