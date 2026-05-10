import type { Mmsi, ShipTypeCode } from './brands';
import type { StaticDimensions } from './static-data';

/**
 * ITU-R M.1371-5 §3.3.8.4.4 PartNumber discriminator. PartA carries
 * vesselName; PartB carries callSign + shipType + dimensions +
 * vendorId. Modelled as named constants so consumers do not branch on
 * raw 0/1 magic numbers.
 */
export const CLASS_B_STATIC_PART_A = 0;
export const CLASS_B_STATIC_PART_B = 1;

export type ClassBStaticPart = typeof CLASS_B_STATIC_PART_A | typeof CLASS_B_STATIC_PART_B;

/**
 * AIS ITU-R M.1371-5 §3.3.8.4.4 (type 24): Class B static data report.
 *
 * Class B AIS units (yachts, fishing boats, recreational craft <300 GT)
 * broadcast a simplified static record split across two parts:
 *   - PartA: vesselName only
 *   - PartB: callSign, shipType, dimensions, vendorId, mothershipMmsi
 *
 * Either part can arrive first. The pipeline emits a partial
 * `ClassBStaticData` for each received part with the absent-side fields
 * left as null / empty string. Reassembly happens at the FE store
 * layer (mirroring the merge pattern in `vessels.store#setVessel`).
 *
 * Fields not reported by Class B at all (vs. Class A type 5):
 *   - imo (Class B vessels do not have IMO numbers)
 *   - destination (no voyage planning broadcast)
 *   - draught (Class B does not report)
 *   - eta (no voyage planning)
 */
export type ClassBStaticData = {
  readonly messageType: 24;
  readonly repeatIndicator: number;
  readonly mmsi: Mmsi;
  readonly partNumber: ClassBStaticPart;
  readonly vesselName: string;
  readonly callSign: string;
  readonly shipType: ShipTypeCode;
  readonly dimensions: StaticDimensions | null;
  readonly vendorId: string;
  readonly mothershipMmsi: Mmsi | null;
};
