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
  warm: readonly SourceId[],
): SourceId | null {
  return prioritized.find(id => !tried.includes(id) && !warm.includes(id)) ?? null;
}

function priorityRank(prioritized: readonly SourceId[], id: SourceId | null): number {
  if (id === null) return Number.POSITIVE_INFINITY;
  const idx = prioritized.indexOf(id);
  return idx < 0 ? Number.POSITIVE_INFINITY : idx;
}

export const ingestSourceMachine = setup({
  types: {
    context: {} as IngestContext,
    events: {} as IngestEvent,
    input: {} as IngestActorInput,
  },
  actions: {
    markCurrentSourceTried: assign(({ context }) => ({
      triedSourceIds:
        context.currentSourceId !== null
          ? [...context.triedSourceIds, context.currentSourceId]
          : context.triedSourceIds,
    })),
    /**
     * Soft-demote: move the current source to the warm list so the
     * IngestService keeps its transport alive and can fire
     * SOURCE_RECLAIMED later. Used when a source times out of its
     * healthy window without an error, NOT when it hard-fails.
     */
    markCurrentSourceWarm: assign(({ context }) => ({
      warmSourceIds:
        context.currentSourceId !== null && !context.warmSourceIds.includes(context.currentSourceId)
          ? [...context.warmSourceIds, context.currentSourceId]
          : context.warmSourceIds,
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
      warmSourceIds: () => [],
      currentSourceId: null,
      errorMessage: null,
    }),
    advanceToNextSource: assign(({ context }) => ({
      currentSourceId: pickNextSource(
        context.prioritizedSourceIds,
        context.triedSourceIds,
        context.warmSourceIds,
      ),
    })),
    resetForRetry: assign({
      triedSourceIds: () => [],
      warmSourceIds: () => [],
      errorMessage: null,
    }),
    /**
     * Swap the reclaimed (warm) source in for the current one. The
     * previously-current source moves back to the warm pool so the
     * IngestService can keep its transport alive; if the reclaimed
     * source happened to be on the tried list (e.g. after a soft
     * demote followed by a stale tried record from a previous cycle)
     * it is removed so future logic does not block it.
     */
    reclaimSource: assign(({ context, event }) => {
      if (event.type !== 'SOURCE_RECLAIMED') return {};
      const reclaimedId = event.sourceId;
      const warmWithoutReclaimed = context.warmSourceIds.filter(id => id !== reclaimedId);
      const previousCurrent = context.currentSourceId;
      const warmWithPrevious =
        previousCurrent !== null && !warmWithoutReclaimed.includes(previousCurrent)
          ? [...warmWithoutReclaimed, previousCurrent]
          : warmWithoutReclaimed;
      return {
        currentSourceId: reclaimedId,
        warmSourceIds: warmWithPrevious,
        triedSourceIds: context.triedSourceIds.filter(id => id !== reclaimedId),
        errorMessage: null,
      };
    }),
  },
  guards: {
    hasMoreSources: ({ context }) =>
      pickNextSource(
        context.prioritizedSourceIds,
        context.triedSourceIds,
        context.warmSourceIds,
      ) !== null,
    isCurrentSource: ({ context, event }) => {
      if (!('sourceId' in event)) return false;
      return event.sourceId === context.currentSourceId;
    },
    /**
     * Allow reclaim only when the reclaiming source ranks strictly
     * higher (lower index in the prioritized list) than the current
     * source AND is currently parked on the warm list. A lower-
     * priority warm source cannot pre-empt a higher-priority active
     * source - that would invert the operator's intent and cause
     * thrashing between fallbacks.
     */
    canReclaim: ({ context, event }) => {
      if (event.type !== 'SOURCE_RECLAIMED') return false;
      if (!context.warmSourceIds.includes(event.sourceId)) return false;
      const reclaimedRank = priorityRank(context.prioritizedSourceIds, event.sourceId);
      const currentRank = priorityRank(context.prioritizedSourceIds, context.currentSourceId);
      return reclaimedRank < currentRank;
    },
  },
}).createMachine({
  id: 'ingestSource',
  initial: 'idle',
  context: ({ input }) => ({
    prioritizedSourceIds: input.prioritizedSourceIds,
    currentSourceId: null,
    triedSourceIds: [],
    warmSourceIds: [],
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
        SOURCE_RECLAIMED: {
          guard: 'canReclaim',
          target: 'connecting',
          reenter: true,
          actions: 'reclaimSource',
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
        SOURCE_RECLAIMED: {
          guard: 'canReclaim',
          target: 'connecting',
          actions: 'reclaimSource',
        },
        STOP: 'idle',
      },
    },
    degraded: {
      after: {
        [DEGRADED_GRACE_MS]: {
          target: 'switching',
          actions: 'markCurrentSourceWarm',
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
        SOURCE_RECLAIMED: {
          guard: 'canReclaim',
          target: 'connecting',
          actions: 'reclaimSource',
        },
        STOP: 'idle',
      },
    },
    switching: {
      on: {
        SOURCE_RECLAIMED: {
          guard: 'canReclaim',
          target: 'connecting',
          actions: 'reclaimSource',
        },
      },
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
        SOURCE_RECLAIMED: {
          guard: 'canReclaim',
          target: 'connecting',
          actions: 'reclaimSource',
        },
        STOP: 'idle',
      },
    },
  },
});
