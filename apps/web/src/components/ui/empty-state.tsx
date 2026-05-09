import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

const styles = {
  root: 'text-muted-foreground flex flex-col items-center justify-center gap-3 px-6 py-14 text-center',
  icon: 'text-muted-foreground/30 size-12',
  title: 'text-foreground text-base font-medium',
  hint: 'text-muted-foreground/80 max-w-[280px] text-sm leading-relaxed',
} as const;

type EmptyStateProps = {
  readonly icon: LucideIcon;
  readonly title: ReactNode;
  readonly hint?: ReactNode;
  readonly className?: string;
};

export function EmptyState({ icon: Icon, title, hint, className }: EmptyStateProps) {
  return (
    <div className={cn(styles.root, className)}>
      <Icon className={styles.icon} aria-hidden />
      <span className={styles.title}>{title}</span>
      {hint !== undefined ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
}
