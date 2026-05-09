import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Activity, Filter, Ship } from 'lucide-react';
import { useEscapeKey } from '../hooks/use-escape-key';
import { useVesselList } from '../hooks/use-vessel-list';
import { formatRelativeTime } from '../lib/format';
import { $selectedMmsi, clearSelection, selectVessel } from '../store';
import { SidebarSection } from './sidebar-section';
import { VesselListItem } from './vessel-list-item';

const SIDEBAR =
  'bg-card text-card-foreground border-border flex h-full w-[380px] shrink-0 flex-col overflow-hidden border-r';
const LIST_SCROLL = 'flex-1 overflow-y-auto';
const LIST = 'divide-border/60 divide-y';
const EMPTY_WRAPPER =
  'text-muted-foreground flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center text-sm';
const EMPTY_ICON = 'text-muted-foreground/30 size-10';
const EMPTY_HINT = 'text-muted-foreground/80 max-w-[260px] text-xs leading-relaxed';
const FOOTER =
  'border-border text-muted-foreground border-t px-4 py-2 text-[0.7rem] font-medium tabular-nums tracking-wide';
const PLACEHOLDER_BODY = 'text-muted-foreground/80 px-4 py-4 text-xs leading-relaxed';

const NOW_TICK_INTERVAL_MS = 1_000;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1_000);
}

function useTickingNow(): number {
  const [value, setValue] = useState(() => nowSeconds());
  useEffect(() => {
    const id = setInterval(() => setValue(nowSeconds()), NOW_TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  return value;
}

/**
 * Left sidebar, in-layout (not an overlay). Hosts category sections;
 * the live vessel list is the first category. Future categories
 * (Filters, Source health) plug in as additional `SidebarSection`s.
 */
export function VesselSidebar() {
  const list = useVesselList();
  const selectedMmsi = useStore($selectedMmsi);
  const now = useTickingNow();
  const hasSelection = selectedMmsi !== null;

  useEscapeKey(hasSelection, clearSelection);

  return (
    <aside className={SIDEBAR} aria-label="Live vessels sidebar">
      <SidebarSection icon={Ship} title="Vessels" count={list.length} defaultOpen>
        <div className={LIST_SCROLL}>
          {list.length === 0 ? (
            <div className={EMPTY_WRAPPER}>
              <Ship className={EMPTY_ICON} aria-hidden />
              <span>Waiting for AIS feed.</span>
              <span className={EMPTY_HINT}>
                Anchored vessels broadcast every ~3 minutes; first results may take a moment to
                appear after start-up.
              </span>
            </div>
          ) : (
            <ul className={LIST}>
              {list.map(vessel => (
                <VesselListItem
                  key={vessel.mmsi}
                  vessel={vessel}
                  selected={selectedMmsi === vessel.mmsi}
                  onSelect={selectVessel}
                  relativeTime={formatRelativeTime(vessel.timestampUnix, now)}
                />
              ))}
            </ul>
          )}
        </div>
        {list.length > 0 ? <div className={FOOTER}>Sorted by last update</div> : null}
      </SidebarSection>

      <SidebarSection icon={Filter} title="Filters" disabled defaultOpen={false}>
        <div className={PLACEHOLDER_BODY}>
          Filter by ship type, speed range and region — landing in a follow-up ticket.
        </div>
      </SidebarSection>

      <SidebarSection icon={Activity} title="Source health" disabled defaultOpen={false}>
        <div className={PLACEHOLDER_BODY}>
          Active ingest source, frame rate and reject ratio — landing with the observability panel.
        </div>
      </SidebarSection>
    </aside>
  );
}
