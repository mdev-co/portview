import { $geofenceEvents } from '@/modules/geofencing/state/geofence-events.store';
import { $geofenceZones } from '@/modules/geofencing/state/geofence-zones.atom';
import { MapController } from '@/modules/map/core/map-controller';
import { $vesselStaticData } from '@/modules/telemetry/vessel-static.store';
import { $vessels } from '@/modules/telemetry/vessels.store';
import { useStore } from '@nanostores/react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { GeofenceEvent } from '@sps/shared';
import { GlassPanel } from '../primitives/glass-panel';

export function EventsView(): React.JSX.Element {
  const events = useStore($geofenceEvents);
  const zones = useStore($geofenceZones);
  const staticData = useStore($vesselStaticData);

  return (
    <GlassPanel className="h-full rounded-none border-y-0 border-l-0">
      <GlassPanel.Header>
        <GlassPanel.Title>Events</GlassPanel.Title>
        <GlassPanel.Actions>
          <span className="text-muted-foreground font-mono text-[11px]">{events.length}</span>
        </GlassPanel.Actions>
      </GlassPanel.Header>
      <GlassPanel.Body className="p-1">
        {events.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">
            No geofence events yet. Vessels crossing a zone boundary appear here.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {[...events].reverse().map(event => (
              <EventRow
                key={`${event.kind}|${event.mmsi}|${event.zoneId}|${event.at}`}
                event={event}
                vesselName={resolveVesselName(event.mmsi, staticData)}
                zoneLabel={resolveZoneLabel(event.zoneId, zones)}
              />
            ))}
          </AnimatePresence>
        )}
      </GlassPanel.Body>
    </GlassPanel>
  );
}

type EventRowProps = {
  readonly event: GeofenceEvent;
  readonly vesselName: string;
  readonly zoneLabel: string;
};

function EventRow({ event, vesselName, zoneLabel }: EventRowProps): React.JSX.Element {
  const { accent, ringTone, Icon, verb } =
    event.kind === 'enter'
      ? {
          accent: 'bg-emerald-500/70',
          ringTone: 'text-emerald-300',
          Icon: ArrowDownRight,
          verb: 'entered',
        }
      : event.kind === 'exit'
        ? { accent: 'bg-zinc-500/50', ringTone: 'text-zinc-300', Icon: ArrowUpRight, verb: 'left' }
        : {
            accent: 'bg-amber-500/70',
            ringTone: 'text-amber-300',
            Icon: AlertTriangle,
            verb: 'silent in',
          };

  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      onClick={() => zoomToVessel(event.mmsi)}
      className="group hover:bg-accent/40 relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors"
    >
      <span
        aria-hidden
        className={`absolute inset-y-2 left-1 w-[2px] rounded-full ${accent} opacity-70 transition-opacity group-hover:opacity-100`}
      />
      <span
        className={`bg-background/60 grid size-6 shrink-0 place-items-center rounded-md ring-1 ring-white/5 ${ringTone}`}
      >
        <Icon className="size-3" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] leading-tight">
          <span className="font-medium">{vesselName}</span>
          <span className="text-muted-foreground/80"> {verb} </span>
          <span className="font-medium">{zoneLabel}</span>
        </p>
        <p className="text-muted-foreground/60 mt-0.5 font-mono text-[10px] tabular-nums">
          {formatRelative(event.at)}
        </p>
      </div>
    </motion.button>
  );
}

function resolveVesselName(
  mmsi: number,
  staticData: Record<number, { vesselName?: string }>,
): string {
  const entry = staticData[mmsi];
  const name = entry?.vesselName?.trim();
  if (name !== undefined && name.length > 0) return name;
  return `MMSI ${mmsi}`;
}

function resolveZoneLabel(
  id: string,
  zones: { features: readonly { properties: { id: string; label: string } }[] },
): string {
  const match = zones.features.find(z => z.properties.id === id);
  return match?.properties.label ?? id;
}

function zoomToVessel(mmsi: number): void {
  const vessel = $vessels.get()[mmsi];
  if (vessel === undefined) return;
  if (vessel.lng === null || vessel.lat === null) return;
  MapController.getInstance().flyTo([vessel.lng, vessel.lat], 14);
}

function formatRelative(timestampMs: number): string {
  const diff = Date.now() - timestampMs;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(timestampMs).toISOString().slice(0, 16).replace('T', ' ');
}
