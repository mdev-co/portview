/* eslint-disable react-refresh/only-export-components */
import { type ReactNode, createContext, useContext, useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react';

type SidebarSectionContext = {
  readonly open: boolean;
  readonly disabled: boolean;
  readonly toggle: () => void;
};

const Ctx = createContext<SidebarSectionContext | null>(null);

function useSidebarSection(): SidebarSectionContext {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error('SidebarSection sub-components must be used within <SidebarSection>.');
  }
  return value;
}

const styles = {
  section: 'flex flex-col',
  sectionOpen: 'min-h-0 flex-1',
  sectionClosed: 'shrink-0',
  header:
    'group/section flex w-full items-center gap-2.5 border-b border-border px-4 py-3.5 text-left text-sm font-semibold uppercase tracking-wide transition-colors',
  headerEnabled: 'hover:bg-muted/60',
  headerDisabled: 'cursor-not-allowed opacity-60',
  headerIcon: 'text-primary size-4 shrink-0',
  headerTitle: 'flex-1 truncate',
  badge:
    'border-border bg-muted text-muted-foreground rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums normal-case tracking-normal',
  chevron: 'text-muted-foreground size-4 shrink-0',
  body: 'flex min-h-0 flex-1 flex-col overflow-hidden',
} as const;

type RootProps = {
  readonly disabled?: boolean;
  readonly defaultOpen?: boolean;
  /**
   * Optional controlled open state. When provided, the section uses
   * this value and `onOpenChange` to report user-initiated toggles.
   * Pass both for a fully controlled section (parent owns expansion
   * state, e.g. to auto-expand when a selection lands inside it).
   * Pass neither to keep the internal uncontrolled state seeded by
   * `defaultOpen`.
   */
  readonly open?: boolean;
  readonly onOpenChange?: (next: boolean) => void;
  readonly children: ReactNode;
};

function Root({
  disabled = false,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  children,
}: RootProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen && !disabled);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const ctx: SidebarSectionContext = {
    open,
    disabled,
    toggle: () => {
      if (disabled) return;
      const next = !open;
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
  };
  return (
    <Ctx.Provider value={ctx}>
      <section className={cn(styles.section, open ? styles.sectionOpen : styles.sectionClosed)}>
        {children}
      </section>
    </Ctx.Provider>
  );
}

type HeaderProps = {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly count?: number | string;
};

function Header({ icon: Icon, title, count }: HeaderProps) {
  const { open, disabled, toggle } = useSidebarSection();
  return (
    <button
      type="button"
      aria-expanded={open}
      disabled={disabled}
      onClick={toggle}
      className={cn(styles.header, disabled ? styles.headerDisabled : styles.headerEnabled)}
    >
      <Icon className={styles.headerIcon} aria-hidden />
      <span className={styles.headerTitle}>{title}</span>
      {count !== undefined ? <span className={styles.badge}>{count}</span> : null}
      {open ? (
        <ChevronDown className={styles.chevron} aria-hidden />
      ) : (
        <ChevronRight className={styles.chevron} aria-hidden />
      )}
    </button>
  );
}

function Body({ children }: { readonly children: ReactNode }) {
  const { open } = useSidebarSection();
  if (!open) return null;
  return <div className={styles.body}>{children}</div>;
}

Root.displayName = 'SidebarSection';
Header.displayName = 'SidebarSection.Header';
Body.displayName = 'SidebarSection.Body';

export const SidebarSection = Object.assign(Root, { Header, Body });
