/**
 * Nominal (branded) types for the SPS domain.
 *
 * Brands prevent silent value-swap bugs at call sites where two same-shape
 * primitives carry different meaning (MMSI vs IMO are both 9-digit integers;
 * a function that takes an MMSI and is handed an IMO compiles silently
 * without a brand). The brand is a phantom symbol erased at runtime.
 *
 * The only legal way to construct a branded value is via a smart constructor
 * in `packages/shared/src/validators/`. Direct casts (`x as Mmsi`) outside
 * that module are forbidden by convention.
 */

declare const brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [brand]: B };

export type Mmsi = Brand<number, 'Mmsi'>;
export type Imo = Brand<number, 'Imo'>;

/**
 * AIS ITU-R M.1371-5 §3.3.8.3.5 ship type code. The wire field is 8
 * bits, so any integer in 0..255 is valid at the protocol level even
 * if the spec only assigns meaning to 0..99. Values 100..255 are
 * upstream-reserved; we accept them at the parser boundary and let
 * `shipTypeCategory` map them to `other`. The brand stops a raw
 * `number` from flowing into APIs that expect a validated ship type.
 */
export type ShipTypeCode = Brand<number, 'ShipTypeCode'>;

/**
 * Numeric identifier for the upstream source of an AIS frame. Numeric
 * values fit a single byte in binary WS frames, sort naturally as priority,
 * and provide stable column values for ML feature stores. Member order
 * encodes default priority (lower index = higher priority).
 *
 * Implemented as a frozen object (instead of a TypeScript `enum`) so the
 * runtime artefact is plain JavaScript and the file remains compatible
 * with `erasableSyntaxOnly` consumers.
 */
export const SourceId = {
  LocalUdp: 0,
  WebSdr: 1,
  AisStream: 2,
  EdgeBridge: 3,
} as const;

export type SourceId = (typeof SourceId)[keyof typeof SourceId];

const SOURCE_ID_NAMES: Readonly<Record<SourceId, string>> = {
  [SourceId.LocalUdp]: 'LocalUdp',
  [SourceId.WebSdr]: 'WebSdr',
  [SourceId.AisStream]: 'AisStream',
  [SourceId.EdgeBridge]: 'EdgeBridge',
};

/** Reverse-lookup helper for logs and DLQ rows. */
export const sourceIdName = (id: SourceId): string => SOURCE_ID_NAMES[id];
