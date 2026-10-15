import { type VesselListResponse, type VesselSummary, fetchVessels } from '@/lib/api-client';
import {
  AIS_SHIP_TYPE_DEFAULT,
  type Imo,
  type Mmsi,
  type ShipTypeCode,
  SourceId,
  VESSEL_FLAG_HAS_FIX,
  VESSEL_FLAG_HAS_IDENTITY,
  VESSEL_FLAG_IS_MOVING,
  VESSEL_STATIC_FRAME_KIND,
} from '@sps/shared';
import { $archiveAnchorUnix } from './archive-clock';
import { setVesselStatic } from './vessel-static.store';
import { $vessels, STALE_THRESHOLD_SECONDS, setVessel, vesselCount } from './vessels.store';

/**
 * Last-known-positions fallback. When the live feed has delivered nothing
 * ARCHIVE_GRACE_MS after start-up and the newest stored fix is older than
 * the eviction window, the map shows the snapshot the REST API still holds,
 * with the display clock pinned to that newest fix. Ages, fading, eviction
 * and dead reckoning then behave exactly as they did at that moment. The
 * first live frame newer than the anchor unpins the clock and the regular
 * sweep evicts the snapshot.
 */
const ARCHIVE_GRACE_MS = 10_000;
const ARCHIVE_FETCH_LIMIT = 500;
const IS_MOVING_THRESHOLD_KN = 0.5;
const POSITION_REPORT_MESSAGE_TYPE = 1;

type Fetcher = (limit: number) => Promise<VesselListResponse>;

type ArchivedFix = {
  readonly summary: VesselSummary;
  readonly lng: number;
  readonly lat: number;
  readonly sog: number | null;
  readonly cog: number | null;
  readonly trueHeading: number | null;
  readonly navStatus: number | null;
  readonly timestampUnix: number;
};

function toUnixSeconds(iso: string): number {
  return Math.floor(Date.parse(iso) / 1_000);
}

/**
 * Position rows can be gone (pruned history) while the vessel row still
 * carries its persisted Kalman state, which holds the last filtered fix.
 */
function toArchivedFix(summary: VesselSummary): ArchivedFix | null {
  const { position, kalmanState } = summary;
  if (position !== null) {
    return {
      summary,
      lng: position.lng,
      lat: position.lat,
      sog: position.speedOverGround,
      cog: position.courseOverGround,
      trueHeading: position.trueHeading,
      navStatus: position.navStatus,
      timestampUnix: toUnixSeconds(position.updatedAt),
    };
  }
  if (kalmanState !== null) {
    return {
      summary,
      lng: kalmanState.lng,
      lat: kalmanState.lat,
      sog: null,
      cog: null,
      trueHeading: null,
      navStatus: null,
      timestampUnix: toUnixSeconds(kalmanState.updatedAt),
    };
  }
  return null;
}

function isUsableFix(fix: ArchivedFix | null): fix is ArchivedFix {
  return fix !== null && Number.isFinite(fix.timestampUnix);
}

function seedVessel(fix: ArchivedFix): void {
  const { summary, timestampUnix } = fix;
  const mmsi = summary.mmsi as Mmsi;
  const vesselName = summary.name ?? '';
  setVesselStatic({
    kind: VESSEL_STATIC_FRAME_KIND,
    mmsi,
    vesselName,
    imo: summary.imo as Imo | null,
    callSign: summary.callSign ?? '',
    shipType: (summary.shipType ?? AIS_SHIP_TYPE_DEFAULT) as ShipTypeCode,
    dimensions: null,
    draught: null,
    destination: summary.destination ?? '',
    eta: { month: null, day: null, hour: null, minute: null },
    receivedAt: timestampUnix,
  });
  const isMoving = (fix.sog ?? 0) > IS_MOVING_THRESHOLD_KN;
  setVessel({
    mmsi,
    messageType: POSITION_REPORT_MESSAGE_TYPE,
    navStatus: fix.navStatus,
    sourceId: SourceId.EdgeBridge,
    rateOfTurn: null,
    lng: fix.lng,
    lat: fix.lat,
    sog: fix.sog,
    cog: fix.cog,
    trueHeading: fix.trueHeading,
    timestampUnix,
    flags:
      VESSEL_FLAG_HAS_FIX |
      (isMoving ? VESSEL_FLAG_IS_MOVING : 0) |
      (vesselName.length > 0 ? VESSEL_FLAG_HAS_IDENTITY : 0),
  });
}

/**
 * Pins the display clock and seeds the stores from the REST snapshot when
 * the feed is idle and the snapshot is stale. Returns whether it did.
 */
export async function maybeSeedArchive(
  fetcher: Fetcher = fetchVessels,
  nowSeconds: number = Math.floor(Date.now() / 1_000),
): Promise<boolean> {
  if (vesselCount() > 0) return false;
  const { vessels } = await fetcher(ARCHIVE_FETCH_LIMIT);
  const fixes = vessels.map(toArchivedFix).filter(isUsableFix);
  if (fixes.length === 0) return false;
  const anchor = Math.max(...fixes.map(fix => fix.timestampUnix));
  // Fresh data means the live feed is only slow to connect: leave it be.
  if (nowSeconds - anchor <= STALE_THRESHOLD_SECONDS) return false;
  // A live frame may have landed while the request was in flight.
  if (vesselCount() > 0) return false;
  $archiveAnchorUnix.set(anchor);
  for (const fix of fixes) {
    if (anchor - fix.timestampUnix <= STALE_THRESHOLD_SECONDS) seedVessel(fix);
  }
  return true;
}

function unpinOnLiveFrame(): () => void {
  return $vessels.listen(vessels => {
    const anchor = $archiveAnchorUnix.get();
    if (anchor === null) return;
    for (const key in vessels) {
      const vessel = vessels[key];
      if (vessel !== undefined && vessel.timestampUnix > anchor) {
        $archiveAnchorUnix.set(null);
        return;
      }
    }
  });
}

export function installArchiveSnapshot(): () => void {
  const stopListening = unpinOnLiveFrame();
  const timer = setTimeout(() => {
    maybeSeedArchive().catch((err: unknown) => {
      // The map stays empty, exactly as it would without the fallback.
      console.warn('[archive-snapshot] last known positions unavailable', err);
    });
  }, ARCHIVE_GRACE_MS);
  return () => {
    clearTimeout(timer);
    stopListening();
  };
}

export const __test = { unpinOnLiveFrame, ARCHIVE_FETCH_LIMIT };
