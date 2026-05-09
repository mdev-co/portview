/**
 * Vessel motion status discriminator. Pure constants and a primitive
 * threshold; UI components branch on these to choose colors and labels.
 */

export const ANCHORED = 'anchored' as const;
export const UNDERWAY = 'underway' as const;
export const STOPPED = 'stopped' as const;
export const NUC = 'nuc' as const;

/** Speed-over-ground above which a vessel counts as actively moving (knots). */
export const MOVING_THRESHOLD_KN = 0.5;
