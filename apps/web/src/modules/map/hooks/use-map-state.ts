import { useStore } from '@nanostores/react';
import { $mapState, type MapStateView } from '../core/map-state';

export function useMapState(): MapStateView {
  return useStore($mapState);
}
