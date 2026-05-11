import { cn } from '@/lib/utils';
import { useStore } from '@nanostores/react';
import { Route } from 'lucide-react';
import { $showAllTrails, setShowAllTrails } from '../state/trail-visibility';

/**
 * Global show-all-trails switch. Lives in the app header next to the
 * theme toggle and the map status pill. Selection always paints its
 * own trail; this switch extends that to every active vessel. The
 * per-vessel checkbox in the sidebar details suppresses an
 * individual one regardless of this switch.
 */
export function TrailsToggle() {
  const on = useStore($showAllTrails);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? 'Hide trails for all vessels' : 'Show trails for all vessels'}
      title={on ? 'Hide trails for all vessels' : 'Show trails for all vessels'}
      onClick={() => setShowAllTrails(!on)}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors',
        on
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
          : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      <Route className="size-3.5" aria-hidden />
      <span>Trails</span>
    </button>
  );
}
