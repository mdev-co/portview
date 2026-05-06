import { assign, fromPromise, setup } from 'xstate';
import { MapEngineFactory } from './map-engine-factory';
import type { IMapEngineAdapter, MapEngineConfig, MapEngineType } from './map-engine.types';

export interface MapMachineContext {
  container: HTMLElement | null;
  currentAdapter: IMapEngineAdapter | null;
  currentEngineType: MapEngineType | null;
  pendingEngineType: MapEngineType | null;
  pendingConfig: MapEngineConfig | null;
  error: Error | null;
}

export type MapMachineEvent =
  | { type: 'CONTAINER_ATTACHED'; container: HTMLElement }
  | { type: 'CONTAINER_DETACHED' }
  | { type: 'USE_ENGINE'; engineType: MapEngineType; config: MapEngineConfig }
  | { type: 'ENGINE_ERROR'; error: Error }
  | { type: 'DISPOSE' };

interface InitializeInput {
  adapter: IMapEngineAdapter | null;
  container: HTMLElement | null;
  config: MapEngineConfig | null;
}

interface SwapInput {
  oldAdapter: IMapEngineAdapter | null;
  newType: MapEngineType | null;
  config: MapEngineConfig | null;
  container: HTMLElement | null;
}

interface DisposeInput {
  adapter: IMapEngineAdapter | null;
}

export const mapMachine = setup({
  types: {
    context: {} as MapMachineContext,
    events: {} as MapMachineEvent,
  },
  actions: {
    fireDisposeCurrentAdapter: ({ context }) => {
      if (context.currentAdapter) {
        void context.currentAdapter.dispose().catch((err: unknown) => {
          console.warn('mapMachine: dispose during detach failed', err);
        });
      }
    },
    clearLifecycleContext: assign({
      container: null,
      currentAdapter: null,
      currentEngineType: null,
      pendingEngineType: null,
      pendingConfig: null,
      error: null,
    }),
  },
  actors: {
    initializeEngine: fromPromise<void, InitializeInput>(async ({ input }) => {
      if (!input.adapter || !input.container || !input.config) {
        throw new Error('initializeEngine: missing adapter, container, or config');
      }
      await input.adapter.initialize(input.container, input.config);
    }),
    swapEngine: fromPromise<IMapEngineAdapter, SwapInput>(async ({ input }) => {
      if (!input.newType || !input.config || !input.container) {
        throw new Error('swapEngine: missing newType, config, or container');
      }
      if (input.oldAdapter) {
        await input.oldAdapter.dispose();
      }
      const newAdapter = MapEngineFactory.create(input.newType);
      await newAdapter.initialize(input.container, input.config);
      return newAdapter;
    }),
    disposeAdapter: fromPromise<void, DisposeInput>(async ({ input }) => {
      if (input.adapter) {
        await input.adapter.dispose();
      }
    }),
  },
}).createMachine({
  id: 'map',
  initial: 'idle',
  context: {
    container: null,
    currentAdapter: null,
    currentEngineType: null,
    pendingEngineType: null,
    pendingConfig: null,
    error: null,
  },
  on: {
    CONTAINER_DETACHED: {
      guard: ({ context }) => context.container !== null,
      target: '.idle',
      actions: ['fireDisposeCurrentAdapter', 'clearLifecycleContext'],
    },
  },
  states: {
    idle: {
      on: {
        CONTAINER_ATTACHED: {
          target: 'attached',
          actions: assign({ container: ({ event }) => event.container }),
        },
      },
    },
    attached: {
      on: {
        USE_ENGINE: {
          target: 'initializing',
          actions: assign({
            currentAdapter: ({ event }) => MapEngineFactory.create(event.engineType),
            pendingEngineType: ({ event }) => event.engineType,
            pendingConfig: ({ event }) => event.config,
            error: null,
          }),
        },
        DISPOSE: 'disposed',
      },
    },
    initializing: {
      invoke: {
        src: 'initializeEngine',
        input: ({ context }) => ({
          adapter: context.currentAdapter,
          container: context.container,
          config: context.pendingConfig,
        }),
        onDone: {
          target: 'ready',
          actions: assign({
            currentEngineType: ({ context }) => context.pendingEngineType,
            pendingEngineType: null,
            pendingConfig: null,
            error: null,
          }),
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => event.error as Error,
            pendingEngineType: null,
            pendingConfig: null,
          }),
        },
      },
    },
    ready: {
      on: {
        USE_ENGINE: {
          target: 'swapping',
          actions: assign({
            pendingEngineType: ({ event }) => event.engineType,
            pendingConfig: ({ event }) => event.config,
          }),
        },
        ENGINE_ERROR: {
          target: 'error',
          actions: assign({ error: ({ event }) => event.error }),
        },
        DISPOSE: 'disposing',
      },
    },
    swapping: {
      invoke: {
        src: 'swapEngine',
        input: ({ context }) => ({
          oldAdapter: context.currentAdapter,
          newType: context.pendingEngineType,
          config: context.pendingConfig,
          container: context.container,
        }),
        onDone: {
          target: 'ready',
          actions: assign({
            currentAdapter: ({ event }) => event.output,
            currentEngineType: ({ context }) => context.pendingEngineType,
            pendingEngineType: null,
            pendingConfig: null,
            error: null,
          }),
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => event.error as Error,
            pendingEngineType: null,
            pendingConfig: null,
          }),
        },
      },
    },
    error: {
      on: {
        USE_ENGINE: {
          target: 'initializing',
          actions: assign({
            currentAdapter: ({ event }) => MapEngineFactory.create(event.engineType),
            pendingEngineType: ({ event }) => event.engineType,
            pendingConfig: ({ event }) => event.config,
            error: null,
          }),
        },
        DISPOSE: 'disposing',
      },
    },
    disposing: {
      invoke: {
        src: 'disposeAdapter',
        input: ({ context }) => ({ adapter: context.currentAdapter }),
        onDone: {
          target: 'disposed',
          actions: assign({
            currentAdapter: null,
            currentEngineType: null,
            container: null,
          }),
        },
        onError: {
          target: 'disposed',
          actions: assign({
            currentAdapter: null,
            currentEngineType: null,
            container: null,
            error: ({ event }) => event.error as Error,
          }),
        },
      },
    },
    disposed: {
      type: 'final',
    },
  },
});
