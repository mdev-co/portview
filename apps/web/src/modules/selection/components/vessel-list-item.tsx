/* eslint-disable react-refresh/only-export-components */
import { type ReactNode, createContext, memo, useContext, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useMapEngine } from '@/modules/map/hooks/use-map-engine';
import { VESSEL_PALETTE } from '@/modules/map/styles/vessel-palette';
import type { LiveVessel } from '@/modules/telemetry';
import {
  ChevronDown,
  ChevronRight,
  Compass,
  Crosshair,
  Gauge,
  Hash,
  type LucideIcon,
  MapPin,
  Navigation,
  Radio,
} from 'lucide-react';
import { sourceIdName } from '@sps/shared';
import { STATUS_LABEL, deriveVesselStatus } from '../lib/derive-status';
import {
  formatCog,
  formatHeading,
  formatLatLng,
  formatRelativeTime,
  formatSog,
} from '../lib/format';

const FLY_TO_ZOOM = 13.5;

const styles = {
  wrapper: 'relative',
  row: 'group/row flex w-full items-start gap-3.5 px-4 py-3.5 text-left transition-colors',
  rowDefault: 'hover:bg-muted/60',
  rowSelected:
    'bg-primary/10 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-primary',
  dotBase: 'mt-1.5 size-3 shrink-0 rounded-full ring-2 ring-offset-0',
  body: 'min-w-0 flex-1',
  titleRow: 'flex items-baseline gap-2',
  mmsi: 'text-foreground font-mono text-[0.95rem] font-semibold tabular-nums truncate tracking-tight',
  time: 'text-muted-foreground ml-auto shrink-0 text-xs font-medium tabular-nums',
  statusLine: 'text-muted-foreground mt-1 truncate text-sm',
  actions: 'flex shrink-0 items-center gap-1 self-center',
  iconButton:
    'text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted/80 inline-flex size-8 items-center justify-center rounded-md transition-colors',
  iconButtonHidden:
    'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition-opacity',
  chevron: 'size-4',
  detailGrid:
    'border-primary/20 bg-muted/60 grid grid-cols-2 gap-x-5 gap-y-3.5 border-y-2 border-y-primary/15 px-4 py-4 shadow-[inset_0_1px_0_0] shadow-primary/5',
  fieldWrapper: 'flex min-w-0 items-start gap-2.5',
  fieldIcon: 'text-muted-foreground/80 mt-0.5 size-4 shrink-0',
  fieldLabel: 'text-muted-foreground text-[0.7rem] font-semibold uppercase tracking-wider',
  fieldValue: 'text-foreground mt-0.5 font-mono text-sm font-medium tabular-nums',
} as const;

type DetailField = {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly read: (vessel: LiveVessel) => string;
};

const DETAIL_FIELDS: readonly DetailField[] = [
  { icon: MapPin, label: 'Latitude', read: vessel => formatLatLng(vessel.lat, 'lat') },
  { icon: MapPin, label: 'Longitude', read: vessel => formatLatLng(vessel.lng, 'lng') },
  { icon: Gauge, label: 'Speed', read: vessel => formatSog(vessel.sog) },
  { icon: Compass, label: 'Course', read: vessel => formatCog(vessel.cog) },
  {
    icon: Navigation,
    label: 'Heading',
    read: vessel => formatHeading(vessel.trueHeading),
  },
  { icon: Hash, label: 'AIS type', read: vessel => String(vessel.messageType) },
  { icon: Radio, label: 'Source', read: vessel => sourceIdName(vessel.sourceId) },
];

type RowContextValue = {
  readonly vessel: LiveVessel;
  readonly selected: boolean;
  readonly onSelect: (mmsi: number) => void;
};

const RowContext = createContext<RowContextValue | null>(null);

function useRow(): RowContextValue {
  const value = useContext(RowContext);
  if (!value) {
    throw new Error('VesselListItem sub-components must be used within <VesselListItem>.');
  }
  return value;
}

type RootProps = {
  readonly vessel: LiveVessel;
  readonly selected: boolean;
  readonly onSelect: (mmsi: number) => void;
  readonly children: ReactNode;
};

function RootImpl({ vessel, selected, onSelect, children }: RootProps) {
  const ctx = { vessel, selected, onSelect };
  return (
    <li className={styles.wrapper}>
      <RowContext.Provider value={ctx}>{children}</RowContext.Provider>
    </li>
  );
}

const Root = memo(RootImpl);

function Row({ children }: { readonly children: ReactNode }) {
  const { vessel, selected, onSelect } = useRow();
  const handleSelect = (): void => onSelect(vessel.mmsi);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-selected={selected}
      aria-expanded={selected}
      onClick={handleSelect}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleSelect();
        }
      }}
      className={cn(
        styles.row,
        selected ? styles.rowSelected : styles.rowDefault,
        'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
      )}
    >
      {children}
    </div>
  );
}

function StatusDot() {
  const { vessel } = useRow();
  const status = deriveVesselStatus(vessel);
  return (
    <span
      className={cn(styles.dotBase, VESSEL_PALETTE[status].dot)}
      aria-label={STATUS_LABEL[status]}
    />
  );
}

const TIME_TICK_INTERVAL_MS = 1_000;

function Label() {
  const { vessel } = useRow();
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const status = deriveVesselStatus(vessel);
  const speedSuffix =
    status === 'underway' && vessel.sog !== null ? ` · ${formatSog(vessel.sog)}` : '';
  const courseSuffix =
    status === 'underway' && vessel.cog !== null ? ` · ${formatCog(vessel.cog)}` : '';

  useEffect(() => {
    const node = timeRef.current;
    if (!node) return;
    const tick = (): void => {
      const nowSec = Math.floor(Date.now() / 1_000);
      node.textContent = formatRelativeTime(vessel.timestampUnix, nowSec);
    };
    tick();
    const id = setInterval(tick, TIME_TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [vessel.timestampUnix]);

  return (
    <span className={styles.body}>
      <span className={styles.titleRow}>
        <span className={styles.mmsi}>{vessel.mmsi}</span>
        <span ref={timeRef} className={styles.time} />
      </span>
      <span className={styles.statusLine}>
        {STATUS_LABEL[status]}
        {speedSuffix}
        {courseSuffix}
      </span>
    </span>
  );
}

function Actions() {
  const { vessel, selected } = useRow();
  const controller = useMapEngine();
  const canFly = vessel.lng !== null && vessel.lat !== null;
  return (
    <span className={styles.actions} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        disabled={!canFly}
        onClick={event => {
          event.preventDefault();
          event.stopPropagation();
          if (!canFly) return;
          controller.flyTo([vessel.lng!, vessel.lat!], FLY_TO_ZOOM);
        }}
        aria-label={`Zoom to vessel ${vessel.mmsi}`}
        className={cn(
          styles.iconButton,
          !selected && styles.iconButtonHidden,
          'disabled:cursor-not-allowed disabled:opacity-40',
        )}
      >
        <Crosshair className={styles.chevron} aria-hidden />
      </button>
      <span className="text-muted-foreground" aria-hidden>
        {selected ? (
          <ChevronDown className={styles.chevron} />
        ) : (
          <ChevronRight className={cn(styles.chevron, 'opacity-60 group-hover/row:opacity-100')} />
        )}
      </span>
    </span>
  );
}

function Details() {
  const { vessel, selected } = useRow();
  if (!selected) return null;
  return (
    <div className={styles.detailGrid}>
      {DETAIL_FIELDS.map(field => (
        <Field key={field.label} icon={field.icon} label={field.label} value={field.read(vessel)} />
      ))}
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly value: ReactNode;
}) {
  return (
    <div className={styles.fieldWrapper}>
      <Icon className={styles.fieldIcon} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className={styles.fieldLabel}>{label}</div>
        <div className={cn(styles.fieldValue, 'truncate')}>{value}</div>
      </div>
    </div>
  );
}

Root.displayName = 'VesselListItem';
Row.displayName = 'VesselListItem.Row';
StatusDot.displayName = 'VesselListItem.StatusDot';
Label.displayName = 'VesselListItem.Label';
Actions.displayName = 'VesselListItem.Actions';
Details.displayName = 'VesselListItem.Details';
Field.displayName = 'VesselListItem.Field';

export const VesselListItem = Object.assign(Root, {
  Row,
  StatusDot,
  Label,
  Actions,
  Details,
  Field,
});
