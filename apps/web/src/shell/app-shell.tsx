import { Children, type ReactElement, type ReactNode, isValidElement } from 'react';
import { Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { AppShellProvider, useAppShell } from './app-shell-context';
import { resolvePreset } from './app-shell.machine';
import { SLOT_NAMES, type SlotName } from './layout-presets';

type SlotProps = {
  readonly name: SlotName;
  readonly children: ReactNode;
};

type SlotComponent = ((props: SlotProps) => null) & {
  readonly $$slotMarker: typeof SLOT_MARKER;
};

const SLOT_MARKER = Symbol('AppShell.Slot');

function AppShellSlot(props: SlotProps): never {
  void props;
  throw new Error(
    '<AppShell.Slot> must be rendered as a direct child of <AppShell>. ' +
      'It is a layout marker, not a visible element.',
  );
}
(AppShellSlot as unknown as { $$slotMarker: typeof SLOT_MARKER }).$$slotMarker = SLOT_MARKER;

const SLOT_GRID_AREA: Record<SlotName, string> = {
  header: 'header',
  'activity-bar': 'ab',
  sidebar: 'sidebar',
  main: 'main',
  detail: 'detail',
  drawer: 'drawer',
};

function isSlotElement(child: ReactNode): child is ReactElement<SlotProps> {
  if (!isValidElement(child)) return false;
  const t = child.type as Partial<SlotComponent>;
  return t.$$slotMarker === SLOT_MARKER;
}

function collectSlots(children: ReactNode): Partial<Record<SlotName, ReactNode>> {
  const slots: Partial<Record<SlotName, ReactNode>> = {};
  Children.forEach(children, child => {
    if (!isSlotElement(child)) return;
    slots[child.props.name] = child.props.children;
  });
  return slots;
}

const OPERATOR_UI_SIDEBAR_PX = 400;
const OPERATOR_UI_DETAIL_PX = 380;

function AppShellLayout({ children }: { children: ReactNode }) {
  const { state } = useAppShell();
  const preset = resolvePreset(state.presetId);
  const slots = collectSlots(children);

  const sidebarOpen = !state.sidebarCollapsed;
  const detailOpen = state.detailTarget !== null;

  const gridTemplateColumns =
    state.presetId === 'operator-ui'
      ? `${sidebarOpen ? `${OPERATOR_UI_SIDEBAR_PX}px` : '0px'} 1fr ${detailOpen ? `${OPERATOR_UI_DETAIL_PX}px` : '0px'}`
      : preset.gridTemplateColumns;

  const effectiveVisibility: Record<SlotName, boolean> = {
    header: preset.slots.header.visible,
    'activity-bar': preset.slots['activity-bar'].visible,
    sidebar: state.presetId === 'operator-ui' ? sidebarOpen : preset.slots.sidebar.visible,
    main: preset.slots.main.visible,
    detail: state.presetId === 'operator-ui' ? detailOpen : preset.slots.detail.visible,
    drawer: preset.slots.drawer.visible,
  };

  return (
    <div
      className="bg-background text-foreground grid h-dvh w-full overflow-hidden"
      style={{
        gridTemplateAreas: preset.gridTemplateAreas,
        gridTemplateColumns,
        gridTemplateRows: preset.gridTemplateRows,
      }}
    >
      <AnimatePresence initial={false}>
        {SLOT_NAMES.map(name => {
          if (!effectiveVisibility[name]) return null;
          const provided = slots[name];
          const content: ReactNode = provided ?? (name === 'main' ? <Outlet /> : null);
          if (content === null) return null;
          return (
            <motion.section
              key={name}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 26 }}
              className={cn('min-h-0 min-w-0 overflow-hidden', name === 'main' && 'relative')}
              style={{ gridArea: SLOT_GRID_AREA[name] }}
            >
              {content}
            </motion.section>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function AppShellRoot({ children }: { children: ReactNode }) {
  return <AppShellLayout>{children}</AppShellLayout>;
}

AppShellRoot.displayName = 'AppShell';

export const AppShell = Object.assign(AppShellRoot, {
  Slot: AppShellSlot,
  Provider: AppShellProvider,
});

export { useAppShell };
