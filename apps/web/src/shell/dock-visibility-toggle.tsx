import { EyeOff, LayoutDashboard } from 'lucide-react';
import { useAppShell } from './app-shell-context';

/**
 * Header-mounted toggle that hides or reveals the bottom dock.
 * Operator preference: some workflows want the dock permanently
 * off-screen (e.g. presentation mode, screen recordings); the
 * machine carries the `dockMode` flag so the choice persists
 * across view swaps without leaking the state into the dock
 * component itself.
 */
export function DockVisibilityToggle(): React.JSX.Element {
  const { state, send } = useAppShell();
  const hidden = state.dockMode === 'hidden';

  function toggle(): void {
    send({ type: 'dock.setMode', mode: hidden ? 'auto' : 'hidden' });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={hidden ? 'Show bottom dock' : 'Hide bottom dock'}
      aria-pressed={!hidden}
      className="text-muted-foreground hover:text-foreground hover:bg-accent/40 grid size-7 place-items-center rounded-md transition-colors"
    >
      {hidden ? (
        <LayoutDashboard className="size-3.5" strokeWidth={1.7} />
      ) : (
        <EyeOff className="size-3.5" strokeWidth={1.7} />
      )}
    </button>
  );
}
