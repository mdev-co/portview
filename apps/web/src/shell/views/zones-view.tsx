import { useState } from 'react';
import { ZoneDrawToolbar } from '@/modules/geofencing/components/zone-draw-toolbar';
import { $geofenceZones, setGeofenceZones } from '@/modules/geofencing/state/geofence-zones.atom';
import { useStore } from '@nanostores/react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Eye, EyeOff, Pencil, Trash2, X } from 'lucide-react';
import type { Zone, ZoneCollection, ZoneId, ZoneKind } from '@sps/shared';
import { GlassPanel } from '../primitives/glass-panel';

const KIND_STYLE = {
  channel: 'bg-blue-500/20 text-blue-300 ring-blue-500/40',
  harbor: 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/40',
  anchorage: 'bg-amber-500/20 text-amber-300 ring-amber-500/40',
  restricted: 'bg-red-500/20 text-red-300 ring-red-500/40',
  general: 'bg-slate-500/20 text-slate-300 ring-slate-500/40',
} satisfies Record<ZoneKind, string>;

const KIND_ORDER: readonly ZoneKind[] = ['channel', 'harbor', 'anchorage', 'restricted', 'general'];

const MAX_ZONES = 50;

export function ZonesView(): React.JSX.Element {
  const collection = useStore($geofenceZones);
  const [editingId, setEditingId] = useState<ZoneId | null>(null);

  function updateZone(zoneId: ZoneId, patch: Partial<Zone['properties']>): void {
    const next: ZoneCollection = {
      type: 'FeatureCollection',
      features: collection.features.map(f =>
        f.properties.id === zoneId ? { ...f, properties: { ...f.properties, ...patch } } : f,
      ),
    };
    setGeofenceZones(next);
  }

  function deleteZone(zoneId: ZoneId): void {
    if (editingId === zoneId) setEditingId(null);
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
            <ZoneRow
              key={zone.properties.id}
              zone={zone}
              editing={editingId === zone.properties.id}
              onEditOpen={() => setEditingId(zone.properties.id)}
              onEditClose={() => setEditingId(null)}
              onPatch={patch => updateZone(zone.properties.id, patch)}
              onDelete={() => deleteZone(zone.properties.id)}
            />
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

type ZoneRowProps = {
  readonly zone: Zone;
  readonly editing: boolean;
  readonly onEditOpen: () => void;
  readonly onEditClose: () => void;
  readonly onPatch: (patch: Partial<Zone['properties']>) => void;
  readonly onDelete: () => void;
};

function ZoneRow({
  zone,
  editing,
  onEditOpen,
  onEditClose,
  onPatch,
  onDelete,
}: ZoneRowProps): React.JSX.Element {
  const [draftLabel, setDraftLabel] = useState(zone.properties.label);

  function commit(): void {
    const trimmed = draftLabel.trim();
    if (trimmed.length > 0 && trimmed !== zone.properties.label) {
      onPatch({ label: trimmed });
    }
    onEditClose();
  }

  function cancel(): void {
    setDraftLabel(zone.properties.label);
    onEditClose();
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className="hover:bg-accent/30 group rounded-md px-2 py-2 transition-colors"
    >
      <div className="flex items-center gap-2">
        <KindSelector value={zone.properties.kind} onChange={kind => onPatch({ kind })} />
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={draftLabel}
              onChange={e => setDraftLabel(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') cancel();
              }}
              onBlur={commit}
              className="border-border bg-background w-full rounded border px-1.5 py-0.5 text-sm outline-none"
            />
          ) : (
            <p className="truncate text-sm font-medium">{zone.properties.label}</p>
          )}
          {!editing && zone.properties.description !== undefined && (
            <p className="text-muted-foreground truncate text-xs">{zone.properties.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {editing ? (
            <>
              <IconButton onClick={commit} label="Save">
                <Check className="size-3.5" strokeWidth={2} />
              </IconButton>
              <IconButton onClick={cancel} label="Cancel">
                <X className="size-3.5" strokeWidth={2} />
              </IconButton>
            </>
          ) : (
            <>
              <IconButton
                onClick={() => onPatch({ visible: zone.properties.visible === false })}
                label={
                  zone.properties.visible === false
                    ? `Show ${zone.properties.label} on map`
                    : `Hide ${zone.properties.label} from map`
                }
                className={
                  zone.properties.visible === false
                    ? 'text-foreground'
                    : 'opacity-0 group-hover:opacity-100'
                }
              >
                {zone.properties.visible === false ? (
                  <EyeOff className="size-3.5" strokeWidth={1.7} />
                ) : (
                  <Eye className="size-3.5" strokeWidth={1.7} />
                )}
              </IconButton>
              <IconButton
                onClick={onEditOpen}
                label={`Rename ${zone.properties.label}`}
                className="opacity-0 group-hover:opacity-100"
              >
                <Pencil className="size-3.5" strokeWidth={1.7} />
              </IconButton>
              <IconButton
                onClick={onDelete}
                label={`Delete ${zone.properties.label}`}
                className="hover:text-destructive opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" strokeWidth={1.7} />
              </IconButton>
            </>
          )}
        </div>
      </div>
    </motion.article>
  );
}

function KindSelector({
  value,
  onChange,
}: {
  readonly value: ZoneKind;
  readonly onChange: (next: ZoneKind) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`Zone kind: ${value}. Click to change.`}
        className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ring-1 transition-opacity hover:opacity-80 ${KIND_STYLE[value]}`}
      >
        {value}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="border-border bg-popover absolute top-full left-0 z-40 mt-1 flex flex-col gap-0.5 rounded-md border p-1 shadow-lg">
            {KIND_ORDER.map(k => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  onChange(k);
                  setOpen(false);
                }}
                className={`rounded px-2 py-1 text-left font-mono text-[10px] uppercase ring-1 ${KIND_STYLE[k]} ${k === value ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
              >
                {k}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function IconButton({
  children,
  onClick,
  label,
  className,
}: {
  readonly children: React.ReactNode;
  readonly onClick: () => void;
  readonly label: string;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`text-muted-foreground hover:text-foreground hover:bg-accent/50 grid size-6 place-items-center rounded transition-colors ${className ?? ''}`}
    >
      {children}
    </button>
  );
}
