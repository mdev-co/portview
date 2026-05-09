import { type ReactNode, memo } from 'react';
import { cn } from '@/lib/utils';
import type { LiveVessel } from '@/modules/telemetry';
import {
  ChevronDown,
  ChevronRight,
  Compass,
  Gauge,
  Hash,
  type LucideIcon,
  MapPin,
  Navigation,
  Radio,
} from 'lucide-react';
import { sourceIdName } from '@sps/shared';
import { formatCog, formatHeading, formatLatLng, formatSog } from '../lib/format';
import { ANCHORED, MOVING_THRESHOLD_KN, NUC, STOPPED, UNDERWAY } from './status';

const ROW_BASE = 'group/row flex w-full items-stretch gap-3 px-4 py-3 text-left transition-colors';
const ROW_DEFAULT = 'hover:bg-muted/40';
const ROW_SELECTED = 'bg-primary/10';
const ROW_SELECTED_INDICATOR =
  'before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-r-full before:bg-primary';

const STATUS_DOT = 'mt-1.5 size-2 shrink-0 rounded-full ring-2 ring-offset-0';
const STATUS_DOT_MOVING = 'bg-emerald-400 ring-emerald-400/30';
const STATUS_DOT_ANCHORED = 'bg-slate-400 ring-slate-400/20';
const STATUS_DOT_NUC = 'bg-amber-400 ring-amber-400/30';

const TITLE_ROW = 'flex items-baseline gap-2';
const MMSI_TEXT = 'text-foreground font-mono text-sm font-medium tabular-nums truncate';
const TIME_TEXT = 'text-muted-foreground ml-auto shrink-0 text-[0.7rem] tabular-nums font-medium';
const STATUS_TEXT = 'text-muted-foreground mt-1 truncate text-xs font-medium';

type StatusKey = typeof ANCHORED | typeof UNDERWAY | typeof STOPPED | typeof NUC;

function deriveStatus(vessel: LiveVessel): StatusKey {
  if (vessel.navStatus === 1 || vessel.navStatus === 5) return ANCHORED;
  if (vessel.navStatus === 2) return NUC;
  if (vessel.sog === null) return ANCHORED;
  return vessel.sog > MOVING_THRESHOLD_KN ? UNDERWAY : STOPPED;
}

function statusDotClass(status: StatusKey): string {
  if (status === UNDERWAY) return STATUS_DOT_MOVING;
  if (status === NUC) return STATUS_DOT_NUC;
  return STATUS_DOT_ANCHORED;
}

function statusLabel(status: StatusKey, sog: number | null): string {
  if (status === UNDERWAY && sog !== null) return `Underway · ${formatSog(sog)}`;
  if (status === NUC) return 'Not under command';
  if (status === ANCHORED) return 'Anchored / Moored';
  return 'Stopped';
}

type VesselListItemProps = {
  readonly vessel: LiveVessel;
  readonly selected: boolean;
  readonly onSelect: (mmsi: number) => void;
  readonly relativeTime: string;
};

function VesselListItemImpl({ vessel, selected, onSelect, relativeTime }: VesselListItemProps) {
  const status = deriveStatus(vessel);

  return (
    <li className="relative">
      <button
        type="button"
        aria-selected={selected}
        aria-expanded={selected}
        onClick={() => onSelect(vessel.mmsi)}
        className={cn(
          ROW_BASE,
          selected ? ROW_SELECTED : ROW_DEFAULT,
          selected && 'relative',
          selected && ROW_SELECTED_INDICATOR,
        )}
      >
        <span className={cn(STATUS_DOT, statusDotClass(status))} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className={TITLE_ROW}>
            <span className={MMSI_TEXT}>{vessel.mmsi}</span>
            <span className={TIME_TEXT}>{relativeTime}</span>
          </span>
          <span className={STATUS_TEXT}>
            {statusLabel(status, vessel.sog)}
            {status === UNDERWAY && vessel.cog !== null ? ` · ${formatCog(vessel.cog)}` : null}
          </span>
        </span>
        <span className="text-muted-foreground self-center" aria-hidden>
          {selected ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5 opacity-60 group-hover/row:opacity-100" />
          )}
        </span>
      </button>
      {selected ? <VesselListItemDetails vessel={vessel} /> : null}
    </li>
  );
}

const DETAIL_GRID =
  'border-border/60 bg-muted/30 grid grid-cols-2 gap-x-4 gap-y-3 border-y px-4 py-4';
const DETAIL_FIELD = 'flex min-w-0 items-start gap-2';
const DETAIL_ICON = 'text-muted-foreground/80 mt-0.5 size-3.5 shrink-0';
const DETAIL_LABEL = 'text-muted-foreground text-[0.6rem] font-medium uppercase tracking-wider';
const DETAIL_VALUE = 'text-foreground mt-0.5 font-mono text-xs tabular-nums';

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
    <div className={DETAIL_FIELD}>
      <Icon className={DETAIL_ICON} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className={DETAIL_LABEL}>{label}</div>
        <div className={cn(DETAIL_VALUE, 'truncate')}>{value}</div>
      </div>
    </div>
  );
}

function VesselListItemDetails({ vessel }: { readonly vessel: LiveVessel }) {
  return (
    <div className={DETAIL_GRID}>
      <Field icon={MapPin} label="Latitude" value={formatLatLng(vessel.lat, 'lat')} />
      <Field icon={MapPin} label="Longitude" value={formatLatLng(vessel.lng, 'lng')} />
      <Field icon={Gauge} label="Speed" value={formatSog(vessel.sog)} />
      <Field icon={Compass} label="Course" value={formatCog(vessel.cog)} />
      <Field icon={Navigation} label="Heading" value={formatHeading(vessel.trueHeading)} />
      <Field icon={Hash} label="AIS type" value={vessel.messageType} />
      <Field icon={Radio} label="Source" value={sourceIdName(vessel.sourceId)} />
    </div>
  );
}

export const VesselListItem = memo(VesselListItemImpl);
