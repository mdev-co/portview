import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const styles = {
  root: 'bg-background flex h-full',
  sidebar: 'flex h-full shrink-0',
  main: 'relative flex-1',
} as const;

function Root({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <div className={cn(styles.root, className)}>{children}</div>;
}

function Sidebar({ children }: { readonly children: ReactNode }) {
  return <div className={styles.sidebar}>{children}</div>;
}

function Main({ children }: { readonly children: ReactNode }) {
  return <div className={styles.main}>{children}</div>;
}

Root.displayName = 'MapLayout';
Sidebar.displayName = 'MapLayout.Sidebar';
Main.displayName = 'MapLayout.Main';

export const MapLayout = Object.assign(Root, { Sidebar, Main });
