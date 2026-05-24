import { cn } from '@/lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';

/**
 * Compact toggle pill used in the app header for "show this overlay
 * globally" controls. Two callers today (seamark, trails) share the
 * shape; new overlay toggles slot in by picking an accent palette
 * and passing the bound atom getter / setter.
 *
 * Accent palettes are the only visual difference between callers,
 * encoded as cva compound variants so the off-state stays neutral
 * across all toggles and only the on-state lights up in the caller's
 * colour. Adding a new accent (e.g. "amber" for an alerts toggle)
 * is one compound-variant entry; no caller has to ship its own
 * accent classes.
 */
const toggleButtonVariants = cva(
  'inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors',
  {
    variants: {
      accent: {
        sky: '',
        emerald: '',
      },
      state: {
        on: '',
        off: 'border-border text-muted-foreground hover:bg-muted',
      },
    },
    compoundVariants: [
      {
        accent: 'sky',
        state: 'on',
        className: 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300',
      },
      {
        accent: 'emerald',
        state: 'on',
        className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
      },
    ],
    defaultVariants: {
      accent: 'sky',
      state: 'off',
    },
  },
);

type ToggleButtonAccent = NonNullable<VariantProps<typeof toggleButtonVariants>['accent']>;

type ToggleButtonProps = {
  /** Lucide icon component rendered inside the button. */
  readonly icon: LucideIcon;
  /** Capitalised label rendered next to the icon (e.g. "Seamarks"). */
  readonly label: string;
  /**
   * Lowercase noun phrase used to build the aria-label and title
   * attributes ("Show <noun>" when off, "Hide <noun>" when on). Kept
   * separate from `label` because the visible label is capitalised
   * but the accessible verb-noun phrase reads better lowercase.
   */
  readonly toggleNoun: string;
  /** Current toggle state read from the bound atom. */
  readonly isOn: boolean;
  /** Setter that flips the bound atom; primitive calls with `!isOn`. */
  readonly onToggle: (next: boolean) => void;
  /** Accent palette applied to the on-state classes. */
  readonly accent: ToggleButtonAccent;
};

export function ToggleButton({
  icon: Icon,
  label,
  toggleNoun,
  isOn,
  onToggle,
  accent,
}: ToggleButtonProps) {
  const title = isOn ? `Hide ${toggleNoun}` : `Show ${toggleNoun}`;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-label={title}
      title={title}
      onClick={() => onToggle(!isOn)}
      className={cn(toggleButtonVariants({ accent, state: isOn ? 'on' : 'off' }))}
    >
      <Icon className="size-3.5" aria-hidden />
      <span>{label}</span>
    </button>
  );
}

ToggleButton.displayName = 'ToggleButton';

export { toggleButtonVariants };
export type { ToggleButtonAccent, ToggleButtonProps };
