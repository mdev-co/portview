/**
 * Discriminated union of every reason an AisMessage may be rejected at
 * the GIGO boundary. Each variant carries enough detail for a DLQ row
 * to be debuggable without retaining the original frame buffer.
 */
export type RejectReason =
  | { readonly kind: 'invalid-mmsi'; readonly value: number }
  | { readonly kind: 'invalid-imo'; readonly value: number }
  | { readonly kind: 'invalid-ship-type'; readonly value: number }
  | { readonly kind: 'out-of-range-lat'; readonly value: number }
  | { readonly kind: 'out-of-range-lng'; readonly value: number }
  | { readonly kind: 'unsupported-message-type'; readonly messageType: number };

/**
 * Minimal Result type for boundary validators. Avoids a runtime dependency
 * on a pattern-matching library; the discriminator is `ok`.
 */
export type Result<T, E = RejectReason> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
