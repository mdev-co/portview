import { ToggleButton } from '@/components/ui/toggle-button';
import { useStore } from '@nanostores/react';
import { Anchor } from 'lucide-react';
import { $seamarkVisible, setSeamarkVisible } from '../state/seamark-visibility';

/**
 * Global toggle for the OpenSeaMap seamark overlay. Header control
 * built on the shared ToggleButton primitive with the sky accent
 * reserved for nautical-context controls.
 */
export function SeamarkToggle() {
  const on = useStore($seamarkVisible);
  return (
    <ToggleButton
      icon={Anchor}
      label="Seamarks"
      toggleNoun="seamarks"
      isOn={on}
      onToggle={setSeamarkVisible}
      accent="sky"
    />
  );
}
