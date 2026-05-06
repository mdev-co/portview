export type StaticDimensions = {
  readonly toBow: number;
  readonly toStern: number;
  readonly toPort: number;
  readonly toStarboard: number;
};

export type StaticEta = {
  readonly month: number | null;
  readonly day: number | null;
  readonly hour: number | null;
  readonly minute: number | null;
};

export type StaticData = {
  readonly messageType: 5;
  readonly repeatIndicator: number;
  readonly mmsi: number;
  readonly aisVersion: number;
  readonly imo: number | null;
  readonly callSign: string;
  readonly vesselName: string;
  readonly shipType: number;
  readonly dimensions: StaticDimensions | null;
  readonly epfdType: number;
  readonly eta: StaticEta;
  readonly draught: number | null;
  readonly destination: string;
  readonly dte: boolean;
};
