import { EmptyState } from '@/components/ui/empty-state';
import { Placeholder } from '@/components/ui/placeholder';
import type { VesselStatus } from '@/modules/map/styles/vessel-palette';
import { useStore } from '@nanostores/react';
import {
  Activity,
  Anchor,
  Filter,
  type LucideIcon,
  Pause,
  ShieldAlert,
  Ship,
  ShipWheel,
} from 'lucide-react';
import { useEscapeKey } from '../hooks/use-escape-key';
import { useGroupedVesselList } from '../hooks/use-grouped-vessel-list';
import { useSidebarGroupExpansion } from '../hooks/use-sidebar-group-expansion';
import { useVesselList } from '../hooks/use-vessel-list';
import { STATUS_LABEL } from '../lib/derive-status';
import { $selectedMmsi, clearSelection, selectVessel } from '../store';
import { SidebarSection } from './sidebar-section';
import { VesselListItem } from './vessel-list-item';

const SIDEBAR_TEXT = {
  ariaLabel: 'Live vessels sidebar',
  vesselsTitle: 'Vessels',
  emptyTitle: 'Waiting for AIS feed.',
  emptyHint:
    'Anchored vessels broadcast every ~3 minutes; first results may take a moment after start-up.',
  filtersTitle: 'Filters',
  filtersBody: 'Filter by ship type, speed range and region. Lands in a follow-up ticket.',
  sourceHealthTitle: 'Source health',
  sourceHealthBody:
    'Active ingest source, frame rate and reject ratio. Lands with the observability panel.',
} as const;

const styles = {
  sidebar:
    'bg-card text-card-foreground border-border flex h-full w-full min-w-0 shrink-0 flex-col overflow-hidden border-r [scrollbar-gutter:stable]',
  outerScroll:
    'flex-1 overflow-y-auto [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/60 [&::-webkit-scrollbar-track]:bg-transparent',
  list: 'divide-border/50 divide-y',
} as const;

const GROUP_ICON: Record<VesselStatus, LucideIcon> = {
  underway: ShipWheel,
  anchored: Anchor,
  stopped: Pause,
  nuc: ShieldAlert,
};

export function VesselSidebar() {
  const fullList = useVesselList();
  const groups = useGroupedVesselList();
  const selectedMmsi = useStore($selectedMmsi);
  const hasSelection = selectedMmsi !== null;
  const { isOpen, toggleGroup } = useSidebarGroupExpansion(groups, selectedMmsi);

  useEscapeKey(hasSelection, clearSelection);

  return (
    <aside className={styles.sidebar} aria-label={SIDEBAR_TEXT.ariaLabel}>
      <SidebarSection defaultOpen>
        <SidebarSection.Header
          icon={Ship}
          title={SIDEBAR_TEXT.vesselsTitle}
          count={fullList.length}
        />
        <SidebarSection.Body>
          {fullList.length === 0 ? (
            <EmptyState icon={Ship} title={SIDEBAR_TEXT.emptyTitle} hint={SIDEBAR_TEXT.emptyHint} />
          ) : (
            <div className={styles.outerScroll}>
              {groups.map(group => (
                <SidebarSection
                  key={group.status}
                  open={isOpen(group.status)}
                  onOpenChange={() => toggleGroup(group.status)}
                >
                  <SidebarSection.Header
                    icon={GROUP_ICON[group.status]}
                    title={STATUS_LABEL[group.status]}
                    count={group.items.length}
                  />
                  <SidebarSection.Body>
                    <ul className={styles.list}>
                      {group.items.map(vessel => (
                        <VesselListItem
                          key={vessel.mmsi}
                          vessel={vessel}
                          selected={selectedMmsi === vessel.mmsi}
                          onSelect={selectVessel}
                        >
                          <VesselListItem.Row>
                            <VesselListItem.StatusDot />
                            <VesselListItem.SourceDot />
                            <VesselListItem.Label />
                            <VesselListItem.Actions />
                          </VesselListItem.Row>
                          <VesselListItem.Details />
                        </VesselListItem>
                      ))}
                    </ul>
                  </SidebarSection.Body>
                </SidebarSection>
              ))}
            </div>
          )}
        </SidebarSection.Body>
      </SidebarSection>

      <SidebarSection disabled defaultOpen={false}>
        <SidebarSection.Header icon={Filter} title={SIDEBAR_TEXT.filtersTitle} />
        <SidebarSection.Body>
          <Placeholder>{SIDEBAR_TEXT.filtersBody}</Placeholder>
        </SidebarSection.Body>
      </SidebarSection>

      <SidebarSection disabled defaultOpen={false}>
        <SidebarSection.Header icon={Activity} title={SIDEBAR_TEXT.sourceHealthTitle} />
        <SidebarSection.Body>
          <Placeholder>{SIDEBAR_TEXT.sourceHealthBody}</Placeholder>
        </SidebarSection.Body>
      </SidebarSection>
    </aside>
  );
}
