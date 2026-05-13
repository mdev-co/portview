import type { LngLat, LngLatBounds } from '@sps/shared';

export type { LngLat, LngLatBounds } from '@sps/shared';

export type MapEngineType = 'maplibre';

export interface MapViewConfig {
  readonly center: LngLat;
  readonly zoom: number;
  readonly bearing?: number;
  readonly pitch?: number;
  readonly maxBounds?: LngLatBounds;
}

export interface MapEngineConfig {
  readonly view: MapViewConfig;
  readonly style: unknown;
  readonly attributionMode?: 'compact' | 'full' | 'none';
}

export type ReadyListener = () => void;
export type ErrorListener = (error: Error) => void;
export type Unsubscribe = () => void;

export interface GeoJSONFeatureCollection {
  readonly type: 'FeatureCollection';
  readonly features: ReadonlyArray<unknown>;
}

export interface IMapEngineAdapter {
  readonly engineType: MapEngineType;

  initialize(container: HTMLElement, config: MapEngineConfig): Promise<void>;
  dispose(): Promise<void>;

  onReady(listener: ReadyListener): Unsubscribe;
  onError(listener: ErrorListener): Unsubscribe;

  flyTo(center: LngLat, zoom?: number): void;
  setSourceData(sourceId: string, data: GeoJSONFeatureCollection): void;
  /**
   * Toggle a single layer's visibility on the running map without
   * rebuilding the style. Used by the map style engine to switch
   * which base raster and which overlay rasters are active without
   * forcing MapLibre to reinitialise.
   */
  setLayerVisibility(layerId: string, visible: boolean): void;

  isInitialized(): boolean;
  isDisposed(): boolean;

  getRawEngine(): unknown;
}
