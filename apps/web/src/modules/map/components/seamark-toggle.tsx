import { cn } from '@/lib/utils';
import { useStore } from '@nanostores/react';
import { Anchor } from 'lucide-react';
import { $seamarkVisible, setSeamarkVisible } from '../state/seamark-visibility';

/**
 * Global toggle for the OpenSeaMap seamark overlay. Modelled after
 * <TrailsToggle />: same compact button shape, same off-state
 * affordance, accent colour shifted to sky blue so it reads as a
 * "nautical context" control rather than a "trail" control.
 */
export function SeamarkToggle() {
  const on = useStore($seamarkVisible);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? 'Hide seamarks' : 'Show seamarks'}
      title={on ? 'Hide seamarks' : 'Show seamarks'}
      onClick={() => setSeamarkVisible(!on)}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors',
        on
          ? 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300'
          : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      <Anchor className="size-3.5" aria-hidden />
      <span>Seamarks</span>
    </button>
  );
}
