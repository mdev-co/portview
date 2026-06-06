import { cn } from '@/lib/utils';
import { useStore } from '@nanostores/react';
import { Box } from 'lucide-react';
import { $threeDMode, setThreeDMode } from '../3d/three-d-toggle.atom';

/**
 * Header toggle for the flagship 3D model layer. ON renders the
 * deck.gl ScenegraphLayer for the configured flagship vessels; OFF
 * tears the entire 3D engine down so operators on low-end machines
 * (Atom-class CPUs, integrated GPU) can recover the GPU budget.
 *
 * Choice persists to localStorage via the `$threeDMode` atom.
 */
export function ThreeDToggleButton(): React.JSX.Element {
  const on = useStore($threeDMode);
  return (
    <button
      type="button"
      onClick={() => setThreeDMode(!on)}
      aria-label={on ? 'Disable 3D vessel models' : 'Enable 3D vessel models'}
      aria-pressed={on}
      title={on ? '3D vessel models on' : '3D vessel models off'}
      className={cn(
        'grid size-7 place-items-center rounded-md transition-colors',
        on
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
      )}
    >
      <Box className="size-4" strokeWidth={1.6} />
    </button>
  );
}
