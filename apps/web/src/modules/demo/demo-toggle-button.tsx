import { cn } from '@/lib/utils';
import { useStore } from '@nanostores/react';
import { Sparkles } from 'lucide-react';
import { $demoMode, setDemoMode } from './demo-mode.atom';

/**
 * Header toggle for the demo-vessel injection. ON spawns two synthetic
 * vessels (SPS DEMO ALPHA / BRAVO) that orbit the port on parametric
 * ellipses so a reviewer can see the smoothing, 3D model behaviour and
 * trail rendering on a quiet AIS day. OFF removes them and lets live
 * traffic stand alone again.
 */
export function DemoToggleButton(): React.JSX.Element {
  const on = useStore($demoMode);
  return (
    <button
      type="button"
      onClick={() => setDemoMode(!on)}
      aria-label={on ? 'Stop demo vessels' : 'Spawn demo vessels'}
      aria-pressed={on}
      title={on ? 'Demo vessels running' : 'Spawn two demo vessels'}
      className={cn(
        'grid size-7 place-items-center rounded-md transition-colors',
        on
          ? 'bg-amber-500/20 text-amber-500'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
      )}
    >
      <Sparkles className="size-4" strokeWidth={1.6} />
    </button>
  );
}
