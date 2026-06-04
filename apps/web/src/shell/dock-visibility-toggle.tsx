import { useEffect, useRef, useState } from 'react';
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

/**
 * Header control that drives the bottom dock display mode.
 *
 * Clicking the trigger opens a small popover listing the three
 * modes (Auto, Pinned, Hidden) with descriptive labels. Cycling
 * through ambiguous icon-only states was confusing UX; the named
 * popover makes the operator's choice explicit.
 *
 * Trigger icon flips to a "dashed" variant when the dock is
 * hidden so the header surface telegraphs the current state at a
 * glance without forcing the operator to open the popover.
 */
export function DockVisibilityToggle(): React.JSX.Element {
  const { state, send } = useAppShell();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent): void {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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
    <div ref={wrapperRef} className="relative">
      <button
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
      {open && (
        <div
          role="menu"
          className="border-border bg-popover absolute top-full right-0 z-50 mt-1.5 w-56 rounded-md border p-1 shadow-lg"
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
        </div>
      )}
    </div>
  );
}
