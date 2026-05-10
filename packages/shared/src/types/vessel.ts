import type { Mmsi } from './brands';
import type { LngLat } from './geo';

export type PositionReport = {
  readonly messageType: 1 | 2 | 3;
  readonly repeatIndicator: number;
  readonly mmsi: Mmsi;
  readonly navigationStatus: number;
  readonly rateOfTurn: number | null;
  readonly speedOverGround: number | null;
  readonly positionAccuracy: boolean;
  readonly position: LngLat | null;
  readonly courseOverGround: number | null;
  readonly trueHeading: number | null;
  readonly timestamp: number | null;
  readonly maneuverIndicator: number;
  readonly raim: boolean;
  readonly radioStatus: number;
};
