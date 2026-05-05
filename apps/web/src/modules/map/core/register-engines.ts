import { MapLibreAdapter } from '../adapters/maplibre-adapter';
import { MapEngineFactory } from './map-engine-factory';

MapEngineFactory.register('maplibre', MapLibreAdapter);
