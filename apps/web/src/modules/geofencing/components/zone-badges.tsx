import { useMemo } from 'react';
import { useStore } from '@nanostores/react';
import type { Zone, ZoneId } from '@sps/shared';
import { $geofencePresence } from '../state/geofence-membership.store';
import { $geofenceZones } from '../state/geofence-zones.atom';

/**
 * Render one badge per zone the given vessel is currently confirmed
 * inside. Designed for the sidebar row.
 *
 * Subscription cost: `useStore($geofencePresence, { keys: [...] })`
 * subscribes ONLY to the named keys, so this component re-renders
 * exclusively when the given vessel's zone-set flips - other
 * vessels crossing boundaries do not churn this row. That property
 * is the reason `$geofencePresence` is a nanostores `map` (not a
 * computed atom): per-key subscription is the L6 high-freq budget
 * we explicitly bought when refactoring after the code review.
 *
 * The component renders nothing when the vessel is currently in
 * zero zones - sidebar rows for transit traffic stay clean.
 */
export function ZoneBadges({ mmsi }: { readonly mmsi: number }): React.JSX.Element | null {
  const key = String(mmsi);
  const presence = useStore($geofencePresence, { keys: [key] });
  // Subscribe to the zone collection ONCE per parent badge row
  // instead of once per badge. Without this hoist a 100-vessel
  // fleet sitting in 2 zones each subscribes 200 times to the same
  // store, so a single zone rename triggers a 200-component re-
  // render cascade. The Map lookup also collapses the per-badge
  // O(N) `find` to O(1).
  const zonesCollection = useStore($geofenceZones);
  const zoneIndex = useMemo<ReadonlyMap<ZoneId, Zone>>(
    () => new Map(zonesCollection.features.map(z => [z.properties.id, z])),
    [zonesCollection],
  );
  const zones = presence[key];
  if (zones === undefined || zones.length === 0) return null;

  return (
    <span className="flex flex-wrap items-center gap-1">
      {zones.map(id => (
        <ZoneBadge key={id} zoneId={id} zoneIndex={zoneIndex} />
      ))}
    </span>
  );
}

function ZoneBadge({
  zoneId,
  zoneIndex,
}: {
  readonly zoneId: ZoneId;
  readonly zoneIndex: ReadonlyMap<ZoneId, Zone>;
}): React.JSX.Element {
  const zone = zoneIndex.get(zoneId);
  if (zone === undefined) {
    return (
      <span className="border-border text-muted-foreground rounded border px-1 py-px font-mono text-[10px] tracking-wide">
        {zoneId}
      </span>
    );
  }
  return (
    <span
      className={badgeClassByKind(zone.properties.kind)}
      title={zone.properties.description ?? zone.properties.label}
    >
      {zone.properties.label}
    </span>
  );
}

function badgeClassByKind(
  kind: 'anchorage' | 'channel' | 'restricted' | 'harbor' | 'general',
): string {
  const base = 'rounded px-1.5 py-px text-[10px] font-medium uppercase tracking-wider border';
  switch (kind) {
    case 'anchorage':
      return `${base} border-amber-600/40 bg-amber-500/15 text-amber-700 dark:text-amber-300`;
    case 'channel':
      return `${base} border-blue-600/40 bg-blue-500/15 text-blue-700 dark:text-blue-300`;
    case 'restricted':
      return `${base} border-red-700/50 bg-red-500/15 text-red-700 dark:text-red-300`;
    case 'harbor':
      return `${base} border-emerald-700/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300`;
    case 'general':
      return `${base} border-slate-500/40 bg-slate-500/15 text-slate-700 dark:text-slate-300`;
  }
}
