export type MapEngineType = 'maplibre';

export type LngLat = readonly [longitude: number, latitude: number];

export interface MapViewConfig {
  readonly center: LngLat;
  readonly zoom: number;
  readonly bearing?: number;
  readonly pitch?: number;
  readonly maxBounds?: readonly [southWest: LngLat, northEast: LngLat];
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

  isInitialized(): boolean;
  isDisposed(): boolean;

  getRawEngine(): unknown;
}
