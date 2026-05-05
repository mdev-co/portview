import { MapController } from '../core/map-controller';

export function useMapEngine(): MapController {
  return MapController.getInstance();
}
