import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Activity, Hexagon, type LucideIcon, Ship } from 'lucide-react';
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

const PEEK_SIZE_PX = 22;
const EXPAND_SIZE_PX = 48;

/**
 * Peek + expand dock for sidebar view switching.
 *
 * Default state is a small pill anchored to the bottom-centre of
 * the viewport carrying three icon dots. The pill is always
 * visible so the operator never has to hunt for the navigation.
 * Hovering the pill expands it into a full-size dock; moving the
 * cursor away returns it to the compact shape after 220 ms.
 *
 * No mouse-distance magnification: icons hold a fixed size in each
 * state and the only hover feedback is a subtle highlight. The
 * dock visibility (auto / pinned / hidden) is controlled from the
 * header by `DockControl`, not from inside the dock itself.
 */
export function BottomDock(): React.JSX.Element | null {
  const { state, send } = useAppShell();
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const collapseTimerRef = useRef<number | null>(null);

  if (state.dockMode === 'hidden') return null;

  const pinned = state.dockMode === 'pinned';
  const expanded = pinned || hoverExpanded;
  const iconSize = expanded ? EXPAND_SIZE_PX : PEEK_SIZE_PX;

  function handleEnter(): void {
    if (pinned) return;
    if (collapseTimerRef.current !== null) {
      window.clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    setHoverExpanded(true);
  }

  function handleLeave(): void {
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

  return (
    <motion.div
      aria-label="Application dock"
      role="navigation"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className="pointer-events-auto fixed bottom-3 left-1/2 z-40 -translate-x-1/2"
    >
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        className="border-border/40 bg-background/85 flex items-center gap-1.5 rounded-2xl border shadow-[0_24px_60px_-20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl"
        style={{
          paddingLeft: expanded ? 10 : 8,
          paddingRight: expanded ? 10 : 8,
          paddingTop: expanded ? 8 : 6,
          paddingBottom: expanded ? 8 : 6,
        }}
      >
        {ITEMS.map(item => {
          const Icon = item.icon;
          const active = state.sidebarView === item.view && !state.sidebarCollapsed;
          return (
            <motion.button
              key={item.view}
              type="button"
              onClick={() => handleClick(item.view)}
              aria-label={item.label}
              aria-pressed={active}
              layout
              animate={{ width: iconSize, height: iconSize }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
              className={cn(
                'group relative grid place-items-center rounded-xl transition-colors',
                active
                  ? 'bg-accent text-foreground'
                  : 'text-foreground/75 hover:bg-white/5 hover:text-foreground',
              )}
            >
              <Icon
                style={{ width: '58%', height: '58%' }}
                strokeWidth={1.7}
                className="relative"
              />
              {expanded && (
                <span className="border-border bg-popover text-popover-foreground pointer-events-none absolute -top-9 z-10 rounded border px-2 py-1 text-xs whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100">
                  {item.label}
                </span>
              )}
            </motion.button>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
