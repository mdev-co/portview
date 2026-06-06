import { cn } from '@/lib/utils';
import { useStore } from '@nanostores/react';
import {
  Crosshair,
  Layers,
  type LucideIcon,
  Map as MapIcon,
  Moon,
  MountainSnow,
  Presentation,
  Satellite,
  TreePine,
} from 'lucide-react';
import {
  $activeMapStyle,
  MAP_STYLE_IDS,
  MAP_STYLE_REGISTRY,
  type MapStyleId,
  setMapStyle,
} from '../state/map-style';

/**
 * Seven-button segmented control mounted in the app header. Each
 * button is a single MapStyleId; clicking sets the active style atom,
 * the sync hook in MapView walks the layer visibility on the running
 * map.
 *
 * Icon-only by default so the row fits on a 1024 px viewport; the
 * descriptor label is exposed via aria-label and a CSS-only tooltip
 * underneath each button for discoverability.
 */

const STYLE_ICONS: Record<MapStyleId, LucideIcon> = {
  'osm-dark': Moon,
  'osm-light': MapIcon,
  'usgs-imagery-topo': TreePine,
  'usgs-topo': MountainSnow,
  tactical: Crosshair,
  backdrop: Layers,
  satellite: Satellite,
  presentation: Presentation,
};

export function MapStyleSwitcher() {
  const active = useStore($activeMapStyle);
  return (
    <div
      role="radiogroup"
      aria-label="Map style"
      className="border-border bg-background inline-flex h-8 items-center gap-1 rounded-md border py-0.5 pr-0.5 pl-2 text-xs"
    >
      <span
        aria-hidden
        className="text-muted-foreground font-mono text-[10px] font-semibold tracking-widest uppercase select-none"
      >
        Map
      </span>
      <span aria-hidden className="bg-border mx-0.5 h-4 w-px" />
      {MAP_STYLE_IDS.map(id => {
        const descriptor = MAP_STYLE_REGISTRY[id];
        const Icon = STYLE_ICONS[id];
        const isActive = active === id;
        return (
          <div key={id} className="group relative">
            <button
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={descriptor.label}
              onClick={() => setMapStyle(id)}
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground ring-primary/40 shadow-sm ring-2'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon className="size-3.5" aria-hidden />
            </button>
            <span
              role="tooltip"
              className="border-border bg-popover text-popover-foreground pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 -translate-x-1/2 rounded-md border px-2 py-1 text-[11px] whitespace-nowrap opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100"
            >
              {descriptor.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
