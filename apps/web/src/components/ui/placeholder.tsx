import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const styles = {
  root: 'text-muted-foreground/80 px-4 py-4 text-sm leading-relaxed',
} as const;

type PlaceholderProps = {
  readonly children: ReactNode;
  readonly className?: string;
};

export function Placeholder({ children, className }: PlaceholderProps) {
  return <div className={cn(styles.root, className)}>{children}</div>;
}
