import type { AisMessage } from '../types/ais-message';
import { CLASS_B_STATIC_PART_A, CLASS_B_STATIC_PART_B } from '../types/class-b-static';
import { validateLatLng } from './coordinates';
import { parseImo } from './imo';
import { parseMmsi } from './mmsi';
import { type Result, err, ok } from './reject-reason';

/**
 * Validate a parsed AisMessage against the SPS GIGO invariants.
 *
 * Validation is short-circuit: the first failing check yields the single
 * RejectReason returned to the caller. The message itself is returned
 * unchanged on success; downstream consumers can rely on every numeric
 * mmsi/imo and every non-null position satisfying the relevant invariant.
 *
 * This is the single boundary function the ingest pipeline calls before
 * forwarding any message to storage or downstream subscribers.
 */
export function validateAisMessage(msg: AisMessage): Result<AisMessage> {
  const mmsiResult = parseMmsi(msg.mmsi);
  if (!mmsiResult.ok) return err(mmsiResult.error);

  switch (msg.messageType) {
    case 1:
    case 2:
    case 3:
    case 18: {
      if (msg.position !== null) {
        const latLng = validateLatLng(msg.position);
        if (!latLng.ok) return err(latLng.error);
      }
      return ok(msg);
    }
    case 5: {
      if (msg.imo !== null) {
        const imoResult = parseImo(msg.imo);
        if (!imoResult.ok) return err(imoResult.error);
      }
      return ok(msg);
    }
    case 24: {
      if (msg.partNumber !== CLASS_B_STATIC_PART_A && msg.partNumber !== CLASS_B_STATIC_PART_B) {
        return err({
          kind: 'unsupported-message-type',
          messageType: msg.messageType,
        });
      }
      return ok(msg);
    }
    default:
      return err({
        kind: 'unsupported-message-type',
        messageType: (msg as { messageType: number }).messageType,
      });
  }
}
