import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Check, EyeOff, type LucideIcon, PanelBottom, PanelBottomDashed, Pin } from 'lucide-react';
import { useAppShell } from './app-shell-context';
import type { DockMode } from './app-shell.machine';

type ModeOption = {
  readonly value: DockMode;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly hint: string;
};

const OPTIONS: readonly ModeOption[] = [
  {
    value: 'auto',
    icon: PanelBottomDashed,
    label: 'Auto',
    hint: 'Compact peek; expands on hover',
  },
  {
    value: 'pinned',
    icon: Pin,
    label: 'Pinned',
    hint: 'Always shown full size',
  },
  {
    value: 'hidden',
    icon: EyeOff,
    label: 'Hidden',
    hint: 'Off-screen until reopened from here',
  },
];

const POPOVER_WIDTH = 224;
const POPOVER_GAP = 6;

/**
 * Header control that drives the bottom dock display mode.
 *
 * The popover renders through a portal anchored to document.body
 * so the map canvas's stacking context cannot push it under the
 * map. Position is computed from the trigger's bounding rect each
 * time the popover opens.
 */
export function DockVisibilityToggle(): React.JSX.Element {
  const { state, send } = useAppShell();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    if (!open || triggerRef.current === null) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setAnchor({
      top: rect.bottom + POPOVER_GAP,
      right: window.innerWidth - rect.right,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent): void {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      const popover = document.getElementById('dock-control-popover');
      if (popover?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = state.dockMode;
  const TriggerIcon = current === 'hidden' ? PanelBottomDashed : PanelBottom;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`Dock display: ${current}. Click to change.`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground hover:bg-accent/40 grid size-7 place-items-center rounded-md transition-colors"
      >
        <TriggerIcon
          className={cn('size-4', current === 'hidden' && 'opacity-60')}
          strokeWidth={1.6}
        />
      </button>
      {open &&
        anchor !== null &&
        createPortal(
          <div
            id="dock-control-popover"
            role="menu"
            style={{ top: anchor.top, right: anchor.right, width: POPOVER_WIDTH }}
            className="border-border bg-popover fixed z-[200] rounded-md border p-1 shadow-2xl backdrop-blur-xl"
          >
            <p className="text-muted-foreground px-2 pt-1 pb-1.5 text-[10px] font-semibold tracking-wider uppercase">
              Bottom dock
            </p>
            {OPTIONS.map(opt => {
              const Icon = opt.icon;
              const active = current === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    send({ type: 'dock.setMode', mode: opt.value });
                    setOpen(false);
                  }}
                  className={cn(
                    'hover:bg-accent/50 flex w-full items-start gap-2.5 rounded px-2 py-1.5 text-left transition-colors',
                    active && 'bg-accent/40',
                  )}
                >
                  <Icon className="text-muted-foreground mt-0.5 size-3.5" strokeWidth={1.6} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{opt.label}</span>
                    <span className="text-muted-foreground block text-[11px] leading-snug">
                      {opt.hint}
                    </span>
                  </span>
                  {active && (
                    <Check className="text-foreground mt-1 size-3.5 shrink-0" strokeWidth={2} />
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
