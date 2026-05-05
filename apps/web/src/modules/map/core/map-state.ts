import { atom } from 'nanostores';
import type { MapEngineType } from './map-engine.types';

export type MapStatus =
  | 'idle'
  | 'attached'
  | 'initializing'
  | 'ready'
  | 'swapping'
  | 'error'
  | 'disposing'
  | 'disposed';

export interface MapStateView {
  readonly status: MapStatus;
  readonly engineType: MapEngineType | null;
  readonly error: Error | null;
}

const INITIAL_STATE: MapStateView = {
  status: 'idle',
  engineType: null,
  error: null,
};

export const $mapState = atom<MapStateView>(INITIAL_STATE);

export function resetMapState(): void {
  $mapState.set(INITIAL_STATE);
}
