/* eslint-disable react-refresh/only-export-components */
import { type ReactNode, createContext, memo, useContext, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useMapEngine } from '@/modules/map/hooks/use-map-engine';
import { getVesselDisplayPosition } from '@/modules/map/lib/vessel-display-position';
import { toggleTrailForVessel } from '@/modules/map/state/trail-visibility';
import { paletteFor as sourcePaletteFor } from '@/modules/map/styles/source-palette';
import { VESSEL_CATEGORY_PALETTE, VESSEL_PALETTE } from '@/modules/map/styles/vessel-palette';
import { $vesselKalmanState, type LiveVessel } from '@/modules/telemetry';
import {
  Anchor,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Compass,
  Crosshair,
  Gauge,
  Hash,
  IdCard,
  type LucideIcon,
  MapPin,
  Navigation,
  Radio,
  Ruler,
  Ship,
  Waypoints,
} from 'lucide-react';
import {
  type VesselStaticDataFrame,
  shipCategoryLabel,
  shipTypeCategory,
  sourceIdName,
} from '@sps/shared';
import { useTrailEnabledForMmsi } from '../hooks/use-trail-enabled-for-mmsi';
import { useVesselStatic } from '../hooks/use-vessel-static';
import { STATUS_LABEL, deriveVesselStatus } from '../lib/derive-status';
import {
  formatCallSign,
  formatCog,
  formatDestination,
  formatDimensions,
  formatDraught,
  formatEta,
  formatHeading,
  formatImo,
  formatLatLng,
  formatRelativeTime,
  formatShipType,
  formatSog,
  formatVesselName,
} from '../lib/format';
import { VesselIllustration } from './vessel-illustration';

const FLY_TO_ZOOM = 16;

const styles = {
  wrapper: 'relative',
  row: 'group/row flex w-full items-start gap-3.5 px-4 py-3.5 text-left transition-colors',
  rowDefault: 'hover:bg-muted/60',
  rowSelected:
    'bg-primary/10 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-primary',
  dotBase: 'mt-1.5 size-3 shrink-0 rounded-full ring-2 ring-offset-0',
  sourceDotBase: 'mt-2 size-1.5 shrink-0 rounded-full border border-solid',
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
  trailToggle:
    'flex items-center gap-2 border-t border-primary/15 bg-muted/40 px-4 py-3 text-sm text-foreground cursor-pointer',
  staleBadge:
    'inline-flex items-center rounded px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300',
  illustrationFrame:
    'border-primary/20 bg-muted/40 border-y-2 border-y-primary/15 px-4 py-3 flex items-center justify-center',
  illustrationSvg: 'text-foreground/80 h-24 w-full max-w-[420px]',
  categoryBadge:
    'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider',
  categoryDot: 'size-1.5 rounded-full',
} as const;

type DetailField = {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly read: (vessel: LiveVessel) => string;
};

type StaticField = {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly read: (frame: VesselStaticDataFrame) => string;
};

const LIVE_DETAIL_FIELDS: readonly DetailField[] = [
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

const STATIC_DETAIL_FIELDS: readonly StaticField[] = [
  { icon: Ship, label: 'Ship type', read: frame => formatShipType(frame.shipType) },
  { icon: IdCard, label: 'IMO', read: frame => formatImo(frame.imo) },
  { icon: Radio, label: 'Call sign', read: frame => formatCallSign(frame.callSign) },
  { icon: Ruler, label: 'Length × beam', read: frame => formatDimensions(frame.dimensions) },
  { icon: Anchor, label: 'Draught', read: frame => formatDraught(frame.draught) },
  { icon: Waypoints, label: 'Destination', read: frame => formatDestination(frame.destination) },
  { icon: CalendarClock, label: 'ETA', read: frame => formatEta(frame.eta) },
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
  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // When selection lands on a vessel via the map click handler, the
    // sidebar might have the row scrolled off-screen or inside a
    // collapsed parent. Scrolling it into view turns "click a marker"
    // into "see its detail panel without hunting".
    if (selected && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selected]);
  return (
    <div
      ref={rowRef}
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

/**
 * Tiny coloured dot next to the status dot encoding the ingest source.
 * Filled emerald for EdgeBridge (owned RTL-SDR antenna), hollow slate
 * for AisStream / WebSdr fallbacks, amber for LocalUdp dev feeds, and
 * a near-invisible slate-200 for legacy rows that predate sourceId
 * tracking. The dot is small (6 px) on purpose - it adds a second
 * signal next to the status dot without crowding the row.
 */
function SourceDot() {
  const { vessel } = useRow();
  const palette = sourcePaletteFor(vessel.sourceId);
  return (
    <span
      className={cn(styles.sourceDotBase, palette.dotFilled ? '' : 'bg-transparent')}
      style={{
        backgroundColor: palette.dotFilled ? palette.dotHex : 'transparent',
        borderColor: palette.dotHex,
      }}
      aria-label={`Source: ${palette.label}`}
      title={palette.description}
    />
  );
}

function CategoryBadge() {
  const { vessel } = useRow();
  const staticFrame = useVesselStatic(vessel.mmsi);
  if (staticFrame === null || staticFrame.shipType <= 0) return null;
  const category = shipTypeCategory(staticFrame.shipType);
  if (category === 'other') return null;
  const palette = VESSEL_CATEGORY_PALETTE[category];
  return (
    <span
      className={cn(styles.categoryBadge, palette.text, palette.border)}
      aria-label={`Category: ${shipCategoryLabel(category)}`}
    >
      <span className={cn(styles.categoryDot, palette.dot.split(' ')[0])} aria-hidden />
      {shipCategoryLabel(category)}
    </span>
  );
}

const TIME_TICK_INTERVAL_MS = 1_000;

/** Show the STALE badge once a vessel has been silent this many seconds. */
const STALE_BADGE_SECONDS = 180;

function Label() {
  const { vessel } = useRow();
  const staticFrame = useVesselStatic(vessel.mmsi);
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const staleRef = useRef<HTMLSpanElement | null>(null);
  const status = deriveVesselStatus(vessel);
  const speedSuffix =
    status === 'underway' && vessel.sog !== null ? ` · ${formatSog(vessel.sog)}` : '';
  const courseSuffix =
    status === 'underway' && vessel.cog !== null ? ` · ${formatCog(vessel.cog)}` : '';
  const hasName = staticFrame !== null && staticFrame.vesselName.length > 0;
  const title = hasName ? formatVesselName(staticFrame.vesselName) : String(vessel.mmsi);
  const subtitle = hasName ? String(vessel.mmsi) : null;

  useEffect(() => {
    const time = timeRef.current;
    const stale = staleRef.current;
    if (!time) return;
    const tick = (): void => {
      const nowSec = Math.floor(Date.now() / 1_000);
      time.textContent = formatRelativeTime(vessel.timestampUnix, nowSec);
      if (stale) {
        const isStale = nowSec - vessel.timestampUnix >= STALE_BADGE_SECONDS;
        stale.style.display = isStale ? '' : 'none';
      }
    };
    tick();
    const id = setInterval(tick, TIME_TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [vessel.timestampUnix]);

  return (
    <span className={styles.body}>
      <span className={styles.titleRow}>
        <span className={cn(styles.mmsi, hasName && 'font-sans tracking-normal')}>{title}</span>
        <CategoryBadge />
        <span
          ref={staleRef}
          className={styles.staleBadge}
          aria-label="No fresh AIS frame in over 3 minutes"
        >
          STALE
        </span>
        <span ref={timeRef} className={styles.time} />
      </span>
      <span className={styles.statusLine}>
        {subtitle !== null && (
          <span className="text-muted-foreground/70 mr-1.5 font-mono text-xs">{subtitle}</span>
        )}
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
          // Resolve the same display position the marker uses on the map
          // so the camera lands exactly on the visible shape, not on the
          // raw last fix that may be 60 s behind the Kalman projection.
          // Kalman state read lazily on click; subscribing per row would
          // pay a listener for every position frame when only the click
          // handler consumes the value.
          const now = Math.floor(Date.now() / 1_000);
          const kalmanState = $vesselKalmanState.get()[vessel.mmsi];
          const display = getVesselDisplayPosition(vessel, kalmanState, now);
          const target: [number, number] = display
            ? [display.lng, display.lat]
            : [vessel.lng!, vessel.lat!];
          controller.flyTo(target, FLY_TO_ZOOM);
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
  const staticFrame = useVesselStatic(vessel.mmsi);
  const trailShown = useTrailEnabledForMmsi(vessel.mmsi);
  if (!selected) return null;
  return (
    <>
      <div className={styles.illustrationFrame}>
        <VesselIllustration className={styles.illustrationSvg} />
      </div>
      <div className={styles.detailGrid}>
        {LIVE_DETAIL_FIELDS.map(field => (
          <Field
            key={field.label}
            icon={field.icon}
            label={field.label}
            value={field.read(vessel)}
          />
        ))}
        {staticFrame !== null &&
          STATIC_DETAIL_FIELDS.map(field => (
            <Field
              key={field.label}
              icon={field.icon}
              label={field.label}
              value={field.read(staticFrame)}
            />
          ))}
      </div>
      <label className={styles.trailToggle}>
        <input
          type="checkbox"
          checked={trailShown}
          onChange={() => toggleTrailForVessel(vessel.mmsi)}
          aria-label="Show trail for this vessel"
        />
        <span>Show trail for this vessel</span>
      </label>
    </>
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
SourceDot.displayName = 'VesselListItem.SourceDot';
CategoryBadge.displayName = 'VesselListItem.CategoryBadge';
Label.displayName = 'VesselListItem.Label';
Actions.displayName = 'VesselListItem.Actions';
Details.displayName = 'VesselListItem.Details';
Field.displayName = 'VesselListItem.Field';

export const VesselListItem = Object.assign(Root, {
  Row,
  StatusDot,
  SourceDot,
  CategoryBadge,
  Label,
  Actions,
  Details,
  Field,
});
