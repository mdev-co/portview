import { useEffect, useRef, useState } from 'react';
import { type MotionValue, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
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

const TRIGGER_HEIGHT_PX = 110;
const TRIGGER_HIDE_HYSTERESIS_PX = 40;
const ICON_BASE_PX = 44;
const ICON_MAX_PX = 64;
const MAGNIFY_RADIUS_PX = 130;

/**
 * macOS-style auto-hiding dock for sidebar view switching.
 *
 * Visibility:
 *   - Hidden by default. Slides in when the cursor enters the
 *     bottom trigger band (TRIGGER_HEIGHT_PX from the viewport
 *     bottom). Hysteresis (TRIGGER_HIDE_HYSTERESIS_PX) prevents
 *     flicker when the cursor sits on the edge.
 *   - Force-visible during the first 1.5 s after mount so the
 *     operator sees the dock exists on a fresh load.
 *
 * Magnification: each icon's distance from the live mouse X is
 * mapped through a spring-smoothed transform to a width between
 * ICON_BASE_PX and ICON_MAX_PX.
 */
export function BottomDock(): React.JSX.Element {
  const { state, send } = useAppShell();
  const mouseX = useMotionValue<number>(Number.POSITIVE_INFINITY);
  const [cursorNearBottom, setCursorNearBottom] = useState(false);
  const [introVisible, setIntroVisible] = useState(true);

  useEffect(() => {
    const introTimer = window.setTimeout(() => setIntroVisible(false), 1_500);
    return () => window.clearTimeout(introTimer);
  }, []);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const fromBottom = window.innerHeight - e.clientY;
      if (fromBottom < TRIGGER_HEIGHT_PX) {
        setCursorNearBottom(true);
      } else if (fromBottom > TRIGGER_HEIGHT_PX + TRIGGER_HIDE_HYSTERESIS_PX) {
        setCursorNearBottom(false);
      }
    }
    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, []);

  const visible = cursorNearBottom || introVisible;

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
      onMouseMove={e => mouseX.set(e.clientX)}
      onMouseLeave={() => mouseX.set(Number.POSITIVE_INFINITY)}
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: visible ? 0 : 120, opacity: visible ? 1 : 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="pointer-events-auto fixed bottom-4 left-1/2 z-40 -translate-x-1/2"
    >
      <div className="border-border/40 bg-background/80 flex items-end gap-2 rounded-2xl border px-3 py-2 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
        {ITEMS.map(item => (
          <DockButton
            key={item.view}
            item={item}
            mouseX={mouseX}
            active={state.sidebarView === item.view && !state.sidebarCollapsed}
            onSelect={() => handleClick(item.view)}
          />
        ))}
      </div>
    </motion.div>
  );
}

type DockButtonProps = {
  readonly item: DockItem;
  readonly mouseX: MotionValue<number>;
  readonly active: boolean;
  readonly onSelect: () => void;
};

function DockButton({ item, mouseX, active, onSelect }: DockButtonProps): React.JSX.Element {
  const ref = useRef<HTMLButtonElement>(null);

  const distance = useTransform(mouseX, mx => {
    if (!Number.isFinite(mx)) return Number.POSITIVE_INFINITY;
    const bounds = ref.current?.getBoundingClientRect();
    if (bounds === undefined) return Number.POSITIVE_INFINITY;
    return Math.abs(mx - (bounds.left + bounds.width / 2));
  });

  const widthRaw = useTransform(distance, [0, MAGNIFY_RADIUS_PX], [ICON_MAX_PX, ICON_BASE_PX], {
    clamp: true,
  });
  const width = useSpring(widthRaw, { stiffness: 320, damping: 24 });

  const Icon = item.icon;

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-label={item.label}
      aria-pressed={active}
      style={{ width, height: width }}
      className="group relative grid place-items-center rounded-xl bg-white/[0.04] text-foreground/80 transition-colors hover:text-foreground"
    >
      {active && (
        <motion.span
          layoutId="dock-active"
          className="bg-accent/60 absolute inset-0 rounded-xl ring-1 ring-white/10"
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        />
      )}
      <Icon className="relative size-1/2" strokeWidth={1.7} />
      <span className="border-border bg-popover text-popover-foreground pointer-events-none absolute -top-9 z-10 rounded border px-2 py-1 text-xs whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100">
        {item.label}
      </span>
      {active && (
        <span className="bg-foreground/70 absolute -bottom-2 size-1 rounded-full" aria-hidden />
      )}
    </motion.button>
  );
}
