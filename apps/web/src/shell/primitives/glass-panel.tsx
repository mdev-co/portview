import { type HTMLAttributes, type ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/utils';

type GlassPanelProps = HTMLAttributes<HTMLDivElement> & {
  readonly children: ReactNode;
  readonly tone?: 'default' | 'subtle' | 'strong';
};

const TONE_STYLES = {
  default: 'bg-background/60 border-border/60',
  subtle: 'bg-background/40 border-border/40',
  strong: 'bg-background/80 border-border',
} as const satisfies Record<NonNullable<GlassPanelProps['tone']>, string>;

const GlassPanelRoot = forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ children, className, tone = 'default', ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-xl border backdrop-blur-xl',
        'shadow-[0_8px_32px_-12px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.06)]',
        'dark:shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.04)]',
        TONE_STYLES[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  ),
);

function GlassPanelHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <header
      className={cn(
        'border-border/40 flex items-center justify-between gap-2 border-b px-4 py-3',
        className,
      )}
    >
      {children}
    </header>
  );
}

function GlassPanelTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        'text-foreground/90 truncate text-xs font-semibold tracking-wider uppercase',
        className,
      )}
    >
      {children}
    </h2>
  );
}

function GlassPanelActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex items-center gap-1', className)}>{children}</div>;
}

function GlassPanelBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex-1 overflow-y-auto', className)}>{children}</div>;
}

function GlassPanelFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <footer
      className={cn('border-border/40 flex items-center gap-2 border-t px-4 py-2.5', className)}
    >
      {children}
    </footer>
  );
}

GlassPanelRoot.displayName = 'GlassPanel';
GlassPanelHeader.displayName = 'GlassPanel.Header';
GlassPanelTitle.displayName = 'GlassPanel.Title';
GlassPanelActions.displayName = 'GlassPanel.Actions';
GlassPanelBody.displayName = 'GlassPanel.Body';
GlassPanelFooter.displayName = 'GlassPanel.Footer';

export const GlassPanel = Object.assign(GlassPanelRoot, {
  Header: GlassPanelHeader,
  Title: GlassPanelTitle,
  Actions: GlassPanelActions,
  Body: GlassPanelBody,
  Footer: GlassPanelFooter,
});
