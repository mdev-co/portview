import { useRef, useState } from 'react';
import { type MotionValue, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Activity, Hexagon, type LucideIcon, Pin, PinOff, Ship } from 'lucide-react';
import { useAppShell } from './app-shell-context';
import type { SidebarView } from './app-shell.machine';

type DockItem = {
  readonly view: SidebarView;
  readonly icon: LucideIcon;
  readonly label: string;
};

const ITEMS: readonly DockItem[] = [
  { view: 'vessels', icon: Ship, label: 'Vessels' },
  { view: 'zones', icon: Hexagon, label: 'Zones' },
  { view: 'events', icon: Activity, label: 'Events' },
];

const ICON_BASE_PX = 44;
const ICON_MAX_PX = 64;
const MAGNIFY_RADIUS_PX = 130;
const PEEK_ICON_PX = 18;

/**
 * Persistent peek + expand dock for sidebar view switching.
 *
 * The operator always sees a small pill at the bottom centre of
 * the screen carrying three iconographic dots - one per view. The
 * pill is the discoverability hint: it is small enough not to
 * obscure the map but visible enough that an operator never has
 * to hunt for the navigation.
 *
 * Hovering the pill expands it into a full macOS-style dock with
 * cursor-distance magnification. Moving the cursor away returns
 * the pill to its compact shape after a short grace period so a
 * brief excursion off the dock does not collapse it.
 *
 * The active view's icon carries a `layoutId` ring that smoothly
 * morphs between the peek and expanded states.
 */
export function BottomDock(): React.JSX.Element | null {
  const { state, send } = useAppShell();
  const mouseX = useMotionValue<number>(Number.POSITIVE_INFINITY);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const collapseTimerRef = useRef<number | null>(null);

  if (state.dockMode === 'hidden') return null;

  const pinned = state.dockMode === 'pinned';
  const expanded = pinned || hoverExpanded;

  function handleEnter(): void {
    if (pinned) return;
    if (collapseTimerRef.current !== null) {
      window.clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    setHoverExpanded(true);
  }

  function handleLeave(): void {
    mouseX.set(Number.POSITIVE_INFINITY);
    if (pinned) return;
    if (collapseTimerRef.current !== null) {
      window.clearTimeout(collapseTimerRef.current);
    }
    collapseTimerRef.current = window.setTimeout(() => {
      setHoverExpanded(false);
      collapseTimerRef.current = null;
    }, 220);
  }

  function handleClick(view: SidebarView): void {
    if (state.sidebarView === view && !state.sidebarCollapsed) {
      send({ type: 'sidebar.toggle' });
      return;
    }
    send({ type: 'sidebar.setView', view });
  }

  function togglePin(): void {
    send({ type: 'dock.setMode', mode: pinned ? 'auto' : 'pinned' });
  }

  return (
    <motion.div
      aria-label="Application dock"
      role="navigation"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onMouseMove={e => {
        mouseX.set(e.clientX);
        if (!hoverExpanded && !pinned) handleEnter();
      }}
      className="pointer-events-auto fixed bottom-3 left-1/2 z-40 -translate-x-1/2"
    >
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        className="border-border/40 bg-background/85 flex items-end gap-2 rounded-2xl border shadow-[0_24px_60px_-20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl"
        style={{
          paddingLeft: expanded ? 12 : 10,
          paddingRight: expanded ? 12 : 10,
          paddingTop: expanded ? 8 : 6,
          paddingBottom: expanded ? 8 : 6,
        }}
      >
        {ITEMS.map(item => (
          <DockButton
            key={item.view}
            item={item}
            mouseX={mouseX}
            expanded={expanded}
            active={state.sidebarView === item.view && !state.sidebarCollapsed}
            onSelect={() => handleClick(item.view)}
          />
        ))}
        {expanded && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={togglePin}
            aria-label={pinned ? 'Unpin dock (auto-collapse)' : 'Pin dock open'}
            aria-pressed={pinned}
            className="text-muted-foreground hover:text-foreground hover:bg-accent/40 ml-1 grid size-9 place-items-center self-center rounded-lg transition-colors"
          >
            {pinned ? (
              <PinOff className="size-3.5" strokeWidth={1.7} />
            ) : (
              <Pin className="size-3.5" strokeWidth={1.7} />
            )}
          </motion.button>
        )}
      </motion.div>
    </motion.div>
  );
}

type DockButtonProps = {
  readonly item: DockItem;
  readonly mouseX: MotionValue<number>;
  readonly active: boolean;
  readonly expanded: boolean;
  readonly onSelect: () => void;
};

function DockButton({
  item,
  mouseX,
  active,
  expanded,
  onSelect,
}: DockButtonProps): React.JSX.Element {
  const ref = useRef<HTMLButtonElement>(null);

  const distance = useTransform(mouseX, mx => {
    if (!Number.isFinite(mx)) return Number.POSITIVE_INFINITY;
    const bounds = ref.current?.getBoundingClientRect();
    if (bounds === undefined) return Number.POSITIVE_INFINITY;
    return Math.abs(mx - (bounds.left + bounds.width / 2));
  });

  const expandedWidth = useTransform(
    distance,
    [0, MAGNIFY_RADIUS_PX],
    [ICON_MAX_PX, ICON_BASE_PX],
    { clamp: true },
  );
  const width = useSpring(
    useTransform(() => (expanded ? expandedWidth.get() : PEEK_ICON_PX)),
    {
      stiffness: 320,
      damping: 26,
    },
  );

  const Icon = item.icon;

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-label={item.label}
      aria-pressed={active}
      style={{ width, height: width }}
      className="group relative grid place-items-center rounded-xl text-foreground/85 hover:text-foreground transition-colors"
    >
      {active && (
        <motion.span
          layoutId="dock-active"
          className="bg-accent/70 absolute inset-0 rounded-xl ring-1 ring-white/10"
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        />
      )}
      {!active && expanded && (
        <span className="bg-white/5 absolute inset-0 rounded-xl" aria-hidden />
      )}
      <Icon className="relative" strokeWidth={1.7} style={{ width: '60%', height: '60%' }} />
      {expanded && (
        <span className="border-border bg-popover text-popover-foreground pointer-events-none absolute -top-9 z-10 rounded border px-2 py-1 text-xs whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100">
          {item.label}
        </span>
      )}
      {active && expanded && (
        <span className="bg-foreground/70 absolute -bottom-2 size-1 rounded-full" aria-hidden />
      )}
    </motion.button>
  );
}
