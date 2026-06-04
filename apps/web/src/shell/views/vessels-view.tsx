import { VesselSidebar } from '@/modules/selection';
import { GlassPanel } from '../primitives/glass-panel';

export function VesselsView(): React.JSX.Element {
  return (
    <GlassPanel className="h-full rounded-none border-y-0 border-l-0">
      <GlassPanel.Body className="p-0">
        <VesselSidebar />
      </GlassPanel.Body>
    </GlassPanel>
  );
}
