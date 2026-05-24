import { ToggleButton } from '@/components/ui/toggle-button';
import { useStore } from '@nanostores/react';
import { Route } from 'lucide-react';
import { $showAllTrails, setShowAllTrails } from '../state/trail-visibility';

/**
 * Global show-all-trails switch. Built on the shared ToggleButton
 * primitive with the emerald accent reserved for movement-related
 * controls. Selection always paints its own trail; this switch
 * extends that to every active vessel. The per-vessel checkbox in
 * the sidebar details suppresses an individual one regardless of
 * this switch.
 */
export function TrailsToggle() {
  const on = useStore($showAllTrails);
  return (
    <ToggleButton
      icon={Route}
      label="Trails"
      toggleNoun="trails for all vessels"
      isOn={on}
      onToggle={setShowAllTrails}
      accent="emerald"
    />
  );
}
