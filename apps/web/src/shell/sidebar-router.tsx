import { AnimatePresence, motion } from 'framer-motion';
import { useAppShell } from './app-shell-context';
import type { SidebarView } from './app-shell.machine';
import { EventsView } from './views/events-view';
import { VesselsView } from './views/vessels-view';
import { ZonesView } from './views/zones-view';

const VIEW_MAP: Record<SidebarView, () => React.JSX.Element> = {
  vessels: VesselsView,
  zones: ZonesView,
  events: EventsView,
};

export function SidebarRouter(): React.JSX.Element {
  const { state } = useAppShell();
  const View = VIEW_MAP[state.sidebarView];

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={state.sidebarView}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 8 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        className="h-full"
      >
        <View />
      </motion.div>
    </AnimatePresence>
  );
}
