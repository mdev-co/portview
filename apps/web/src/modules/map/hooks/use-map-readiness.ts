import { useStore } from '@nanostores/react';
import { $mapState } from '../core/map-state';

export function useMapReadiness(): boolean {
  return useStore($mapState).status === 'ready';
}
