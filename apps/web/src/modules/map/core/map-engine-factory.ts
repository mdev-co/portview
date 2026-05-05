import { MapEngineNotRegisteredError } from './errors';
import type { IMapEngineAdapter, MapEngineType } from './map-engine.types';

type EngineConstructor = new () => IMapEngineAdapter;

export class MapEngineFactory {
  private static readonly registry = new Map<MapEngineType, EngineConstructor>();

  static register(type: MapEngineType, ctor: EngineConstructor): void {
    MapEngineFactory.registry.set(type, ctor);
  }

  static unregister(type: MapEngineType): boolean {
    return MapEngineFactory.registry.delete(type);
  }

  static isRegistered(type: MapEngineType): boolean {
    return MapEngineFactory.registry.has(type);
  }

  static getRegisteredTypes(): readonly MapEngineType[] {
    return Array.from(MapEngineFactory.registry.keys());
  }

  static create(type: MapEngineType): IMapEngineAdapter {
    const Ctor = MapEngineFactory.registry.get(type);
    if (!Ctor) {
      throw new MapEngineNotRegisteredError(type, MapEngineFactory.getRegisteredTypes());
    }
    return new Ctor();
  }

  static reset(): void {
    MapEngineFactory.registry.clear();
  }
}
