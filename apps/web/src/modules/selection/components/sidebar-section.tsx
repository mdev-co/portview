import { type ReactNode, useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react';

const HEADER =
  'group/section flex w-full items-center gap-2 border-b border-border px-4 py-2.5 text-left text-[0.78rem] font-semibold uppercase tracking-wider transition-colors';
const HEADER_ENABLED = 'hover:bg-muted/40';
const HEADER_DISABLED = 'cursor-not-allowed opacity-60';
const HEADER_ICON = 'text-primary size-3.5 shrink-0';
const HEADER_TITLE = 'flex-1 truncate';
const COUNT_BADGE =
  'border-border bg-muted text-muted-foreground rounded-full border px-2 py-0.5 text-[0.65rem] tabular-nums normal-case font-medium tracking-normal';
const HEADER_CHEVRON = 'text-muted-foreground size-3.5 shrink-0';
const BODY = 'flex min-h-0 flex-1 flex-col overflow-hidden';

type SidebarSectionProps = {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly count?: number | string;
  readonly disabled?: boolean;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
};

/**
 * Collapsible category section in the sidebar. Click the header to
 * toggle. When disabled, the section is dimmed and not interactive
 * (used for placeholder categories that will land in later PRs).
 */
export function SidebarSection({
  icon: Icon,
  title,
  count,
  disabled = false,
  defaultOpen = true,
  children,
}: SidebarSectionProps) {
  const [open, setOpen] = useState(defaultOpen && !disabled);

  return (
    <section className={cn('flex flex-col', open ? 'flex-1 min-h-0' : 'shrink-0')}>
      <button
        type="button"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(prev => !prev)}
        className={cn(HEADER, disabled ? HEADER_DISABLED : HEADER_ENABLED)}
      >
        <Icon className={HEADER_ICON} aria-hidden />
        <span className={HEADER_TITLE}>{title}</span>
        {count !== undefined ? <span className={COUNT_BADGE}>{count}</span> : null}
        {open ? (
          <ChevronDown className={HEADER_CHEVRON} aria-hidden />
        ) : (
          <ChevronRight className={HEADER_CHEVRON} aria-hidden />
        )}
      </button>
      {open ? <div className={BODY}>{children}</div> : null}
    </section>
  );
}
