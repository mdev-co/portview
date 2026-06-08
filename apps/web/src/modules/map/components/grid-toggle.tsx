import { ToggleButton } from '@/components/ui/toggle-button';
import { useStore } from '@nanostores/react';
import { Grid3x3 } from 'lucide-react';
import { $gridVisible, setGridVisible } from '../state/grid-visibility';

/**
 * Global toggle for the cyan coordinate-grid overlay. Used to live
 * inside the Presentation style descriptor (visible only when the
 * Presentation chart was active); now it is a global overlay reachable
 * from any map style. Header control built on the shared ToggleButton
 * primitive.
 */
export function GridToggle() {
  const on = useStore($gridVisible);
  return (
    <ToggleButton
      icon={Grid3x3}
      label="Grid"
      toggleNoun="coordinate grid"
      isOn={on}
      onToggle={setGridVisible}
      accent="sky"
    />
  );
}
