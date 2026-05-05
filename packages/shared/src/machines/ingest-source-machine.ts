import { assign, setup } from 'xstate';
import {
  DEGRADED_GRACE_MS,
  EXHAUSTED_RETRY_MS,
  HEALTHY_WINDOW_MS,
  type IngestActorInput,
  type IngestContext,
  type IngestEvent,
  type SourceId,
} from './ingest-source.types';

function pickNextSource(
  prioritized: readonly SourceId[],
  tried: readonly SourceId[],
): SourceId | null {
  return prioritized.find(id => !tried.includes(id)) ?? null;
}

export const ingestSourceMachine = setup({
  types: {
    context: {} as IngestContext,
    events: {} as IngestEvent,
    input: {} as IngestActorInput,
  },
  actions: {
    markCurrentSourceTried: assign(({ context }) => ({
      triedSourceIds: context.currentSourceId
        ? [...context.triedSourceIds, context.currentSourceId]
        : context.triedSourceIds,
    })),
    setErrorFromFailure: assign(({ event }) => ({
      errorMessage: event.type === 'SOURCE_FAILED' ? event.reason : null,
    })),
    recordFrameAccepted: assign(({ context, event }) => ({
      framesAccepted: context.framesAccepted + 1,
      lastFrameAt: event.type === 'FRAME_RECEIVED' ? event.frameAt : null,
    })),
    recordFrameRejected: assign(({ context }) => ({
      framesRejected: context.framesRejected + 1,
    })),
    resetCycle: assign({
      triedSourceIds: () => [],
      currentSourceId: null,
      errorMessage: null,
    }),
    advanceToNextSource: assign(({ context }) => ({
      currentSourceId: pickNextSource(context.prioritizedSourceIds, context.triedSourceIds),
    })),
    resetForRetry: assign({
      triedSourceIds: () => [],
      errorMessage: null,
    }),
  },
  guards: {
    hasMoreSources: ({ context }) =>
      pickNextSource(context.prioritizedSourceIds, context.triedSourceIds) !== null,
    isCurrentSource: ({ context, event }) => {
      if (!('sourceId' in event)) return false;
      return event.sourceId === context.currentSourceId;
    },
  },
}).createMachine({
  id: 'ingestSource',
  initial: 'idle',
  context: ({ input }) => ({
    prioritizedSourceIds: input.prioritizedSourceIds,
    currentSourceId: null,
    triedSourceIds: [],
    lastFrameAt: null,
    framesAccepted: 0,
    framesRejected: 0,
    errorMessage: null,
  }),
  states: {
    idle: {
      on: {
        START: {
          target: 'switching',
          actions: 'resetCycle',
        },
      },
    },
    connecting: {
      on: {
        SOURCE_CONNECTED: {
          guard: 'isCurrentSource',
          target: 'active',
        },
        SOURCE_FAILED: {
          guard: 'isCurrentSource',
          target: 'switching',
          actions: ['markCurrentSourceTried', 'setErrorFromFailure'],
        },
        STOP: 'idle',
      },
    },
    active: {
      after: {
        [HEALTHY_WINDOW_MS]: 'degraded',
      },
      on: {
        FRAME_RECEIVED: {
          guard: 'isCurrentSource',
          target: 'active',
          reenter: true,
          actions: 'recordFrameAccepted',
        },
        FRAME_REJECTED: {
          actions: 'recordFrameRejected',
        },
        SOURCE_FAILED: {
          guard: 'isCurrentSource',
          target: 'switching',
          actions: ['markCurrentSourceTried', 'setErrorFromFailure'],
        },
        STOP: 'idle',
      },
    },
    degraded: {
      after: {
        [DEGRADED_GRACE_MS]: {
          target: 'switching',
          actions: 'markCurrentSourceTried',
        },
      },
      on: {
        FRAME_RECEIVED: {
          guard: 'isCurrentSource',
          target: 'active',
          actions: 'recordFrameAccepted',
        },
        FRAME_REJECTED: {
          actions: 'recordFrameRejected',
        },
        SOURCE_FAILED: {
          guard: 'isCurrentSource',
          target: 'switching',
          actions: ['markCurrentSourceTried', 'setErrorFromFailure'],
        },
        STOP: 'idle',
      },
    },
    switching: {
      always: [
        {
          guard: 'hasMoreSources',
          target: 'connecting',
          actions: 'advanceToNextSource',
        },
        { target: 'exhausted' },
      ],
    },
    exhausted: {
      after: {
        [EXHAUSTED_RETRY_MS]: {
          target: 'switching',
          actions: 'resetForRetry',
        },
      },
      on: {
        STOP: 'idle',
      },
    },
  },
});
