import { type ReactNode, createContext, useContext, useMemo } from 'react';
import { useMachine } from '@xstate/react';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import { type AppShellContext, appShellMachine } from './app-shell.machine';

type AppShellActorRef = ActorRefFrom<typeof appShellMachine>;
type AppShellSnapshot = SnapshotFrom<typeof appShellMachine>;

type AppShellContextValue = {
  readonly state: AppShellContext;
  readonly send: AppShellActorRef['send'];
  readonly snapshot: AppShellSnapshot;
};

const Ctx = createContext<AppShellContextValue | null>(null);

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [snapshot, send] = useMachine(appShellMachine);
  const value = useMemo<AppShellContextValue>(
    () => ({ state: snapshot.context, send, snapshot }),
    [snapshot, send],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppShell(): AppShellContextValue {
  const value = useContext(Ctx);
  if (value === null) {
    throw new Error('useAppShell must be used inside <AppShellProvider>');
  }
  return value;
}
