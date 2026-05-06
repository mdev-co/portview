import type { LngLat } from './geo';

export type ClassBPositionReport = {
  readonly messageType: 18;
  readonly repeatIndicator: number;
  readonly mmsi: number;
  readonly speedOverGround: number | null;
  readonly positionAccuracy: boolean;
  readonly position: LngLat | null;
  readonly courseOverGround: number | null;
  readonly trueHeading: number | null;
  readonly timestamp: number | null;
  readonly csUnit: boolean;
  readonly displayFlag: boolean;
  readonly dscFlag: boolean;
  readonly bandFlag: boolean;
  readonly message22Flag: boolean;
  readonly assignedFlag: boolean;
  readonly raim: boolean;
  readonly radioStatus: number;
};
