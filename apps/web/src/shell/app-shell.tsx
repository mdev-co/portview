import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';

function AppShellRoot({ children }: { children: ReactNode }) {
  return <div className="flex h-screen flex-col">{children}</div>;
}

function AppShellHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <header
      className={cn(
        'border-border bg-background flex items-center gap-2 border-b px-4 py-3',
        className,
      )}
    >
      {children}
    </header>
  );
}

function AppShellMain({ children }: { children?: ReactNode }) {
  return <main className="flex-1 overflow-hidden">{children ?? <Outlet />}</main>;
}

AppShellRoot.displayName = 'AppShell';
AppShellHeader.displayName = 'AppShell.Header';
AppShellMain.displayName = 'AppShell.Main';

export const AppShell = Object.assign(AppShellRoot, {
  Header: AppShellHeader,
  Main: AppShellMain,
});
