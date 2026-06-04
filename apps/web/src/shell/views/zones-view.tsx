import { ZoneDrawToolbar } from '@/modules/geofencing/components/zone-draw-toolbar';
import { $geofenceZones } from '@/modules/geofencing/state/geofence-zones.atom';
import { setGeofenceZones } from '@/modules/geofencing/state/geofence-zones.atom';
import { useStore } from '@nanostores/react';
import { AnimatePresence, motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import type { Zone, ZoneCollection } from '@sps/shared';
import { GlassPanel } from '../primitives/glass-panel';

const KIND_COLOR = {
  channel: 'bg-blue-500/20 text-blue-300 ring-blue-500/30',
  harbor: 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/30',
  anchorage: 'bg-amber-500/20 text-amber-300 ring-amber-500/30',
  restricted: 'bg-red-500/20 text-red-300 ring-red-500/30',
  general: 'bg-slate-500/20 text-slate-300 ring-slate-500/30',
} satisfies Record<Zone['properties']['kind'], string>;

const MAX_ZONES = 50;

export function ZonesView(): React.JSX.Element {
  const collection = useStore($geofenceZones);

  function deleteZone(zoneId: string): void {
    const next: ZoneCollection = {
      type: 'FeatureCollection',
      features: collection.features.filter(f => f.properties.id !== zoneId),
    };
    setGeofenceZones(next);
  }

  return (
    <GlassPanel className="h-full rounded-none border-y-0 border-l-0">
      <GlassPanel.Header>
        <GlassPanel.Title>Zones</GlassPanel.Title>
        <GlassPanel.Actions>
          <ZoneDrawToolbar />
        </GlassPanel.Actions>
      </GlassPanel.Header>
      <GlassPanel.Body className="p-2">
        <AnimatePresence initial={false}>
          {collection.features.map(zone => (
            <motion.article
              key={zone.properties.id}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className="group hover:bg-accent/30 flex items-center gap-2 rounded-md px-2 py-2 transition-colors"
            >
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ring-1 ${KIND_COLOR[zone.properties.kind]}`}
              >
                {zone.properties.kind}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{zone.properties.label}</p>
                {zone.properties.description !== undefined && (
                  <p className="text-muted-foreground truncate text-xs">
                    {zone.properties.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => deleteZone(zone.properties.id)}
                aria-label={`Delete ${zone.properties.label}`}
                className="text-muted-foreground hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Trash2 className="size-4" strokeWidth={1.6} />
              </button>
            </motion.article>
          ))}
        </AnimatePresence>
      </GlassPanel.Body>
      <GlassPanel.Footer>
        <span className="text-muted-foreground font-mono text-[11px]">
          {collection.features.length} / {MAX_ZONES} zones
        </span>
      </GlassPanel.Footer>
    </GlassPanel>
  );
}
