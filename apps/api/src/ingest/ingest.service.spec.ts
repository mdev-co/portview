import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DEGRADED_GRACE_MS,
  HEALTHY_WINDOW_MS,
  type ISource,
  type NmeaFrame,
  SourceId,
  type Unsubscribe,
  ingestSourceMachine,
} from '@sps/shared';
import { type Actor, createActor } from 'xstate';
import { VESSEL_UPDATE_EVENT } from './ingest.events';
import { IngestService } from './ingest.service';

// Type 1 position report (MMSI 366053209, San Francisco Bay), checksum
// recomputed - decodes end-to-end through the Decoder + validators.
const VALID_TYPE1_FRAME = '!AIVDM,1,1,,A,15M67FC000G?ufbE`Mg45oRP06hAA,0*5F';
const GARBAGE_FRAME = '!AIVDM,garbage-that-fails-checksum';

class FakeSource implements ISource {
  startCalls = 0;
  stopCalls = 0;
  private readonly frameSubs = new Set<(frame: NmeaFrame) => void>();
  private readonly errorSubs = new Set<(error: Error) => void>();

  constructor(
    readonly id: SourceId,
    readonly priority: number,
  ) {}

  start(): Promise<void> {
    this.startCalls += 1;
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.stopCalls += 1;
    return Promise.resolve();
  }

  onFrame(callback: (frame: NmeaFrame) => void): Unsubscribe {
    this.frameSubs.add(callback);
    return () => this.frameSubs.delete(callback);
  }

  onError(callback: (error: Error) => void): Unsubscribe {
    this.errorSubs.add(callback);
    return () => this.errorSubs.delete(callback);
  }

  emitFrame(raw: string, receivedAt: number): void {
    for (const callback of this.frameSubs) {
      callback({ raw, receivedAt, sourceId: this.id });
    }
  }

  emitError(error: Error): void {
    for (const callback of this.errorSubs) {
      callback(error);
    }
  }

  get frameSubCount(): number {
    return this.frameSubs.size;
  }

  get errorSubCount(): number {
    return this.errorSubs.size;
  }
}

/**
 * Private surface the harness needs to wire fake transports in place
 * of the real UDP/WS sources that registerSources() would construct.
 */
type ServiceInternals = {
  actor: Actor<typeof ingestSourceMachine> | null;
  sources: Map<SourceId, ISource>;
  reconcileSources(
    currentId: SourceId | null,
    warmIds: readonly SourceId[],
  ): void;
};

type Harness = {
  service: IngestService;
  actor: Actor<typeof ingestSourceMachine>;
  local: FakeSource;
  web: FakeSource;
  eventBus: EventEmitter2;
};

function createHarness(): Harness {
  const eventBus = new EventEmitter2();
  const config = { get: () => undefined } as unknown as ConfigService;
  const service = new IngestService(config, eventBus);
  const internals = service as unknown as ServiceInternals;

  const local = new FakeSource(SourceId.LocalUdp, 0);
  const web = new FakeSource(SourceId.WebSdr, 1);
  internals.sources.set(SourceId.LocalUdp, local);
  internals.sources.set(SourceId.WebSdr, web);

  const actor = createActor(ingestSourceMachine, {
    input: { prioritizedSourceIds: [SourceId.LocalUdp, SourceId.WebSdr] },
  });
  actor.subscribe((snapshot) =>
    internals.reconcileSources(
      snapshot.context.currentSourceId,
      snapshot.context.warmSourceIds,
    ),
  );
  internals.actor = actor;
  actor.start();

  return { service, actor, local, web, eventBus };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

/**
 * Drive the harness to the canonical soft-demote layout: LocalUdp
 * parked warm (transport alive, warm listener attached), WebSdr
 * active.
 */
async function demoteLocalToWarm(harness: Harness): Promise<void> {
  harness.actor.send({ type: 'START' });
  await flushMicrotasks();
  expect(harness.actor.getSnapshot().value).toBe('active');
  jest.advanceTimersByTime(HEALTHY_WINDOW_MS + DEGRADED_GRACE_MS);
  await flushMicrotasks();
  const snapshot = harness.actor.getSnapshot();
  expect(snapshot.value).toBe('active');
  expect(snapshot.context.currentSourceId).toBe(SourceId.WebSdr);
  expect(snapshot.context.warmSourceIds).toContain(SourceId.LocalUdp);
}

describe('IngestService source reconciliation', () => {
  let harness: Harness;

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    jest.useFakeTimers();
    harness = createHarness();
  });

  afterEach(async () => {
    await harness.service.onModuleDestroy();
    jest.useRealTimers();
  });

  describe('warm reclaim requires a decodable frame', () => {
    it('does not reclaim on a garbage frame from a warm source', async () => {
      await demoteLocalToWarm(harness);

      harness.local.emitFrame(GARBAGE_FRAME, 100_000);
      const snapshot = harness.actor.getSnapshot();
      expect(snapshot.context.currentSourceId).toBe(SourceId.WebSdr);
      expect(snapshot.context.warmSourceIds).toContain(SourceId.LocalUdp);
    });

    it('reclaims on a frame that decodes to a validated message', async () => {
      await demoteLocalToWarm(harness);

      harness.local.emitFrame(VALID_TYPE1_FRAME, 100_000);
      const snapshot = harness.actor.getSnapshot();
      expect(snapshot.value).toBe('active');
      expect(snapshot.context.currentSourceId).toBe(SourceId.LocalUdp);
    });

    it('keeps the 30s throttle between reclaim requests per warm source', async () => {
      await demoteLocalToWarm(harness);
      // Promote LocalUdp back so WebSdr lands on the warm list; a
      // lower-priority warm source keeps its listener because the FSM
      // rejects its reclaim attempts (canReclaim), which exercises the
      // service-side throttle in isolation.
      harness.local.emitFrame(VALID_TYPE1_FRAME, 100_000);
      expect(harness.actor.getSnapshot().context.warmSourceIds).toContain(
        SourceId.WebSdr,
      );

      const sendSpy = jest.spyOn(harness.actor, 'send');
      const reclaimCount = (): number =>
        sendSpy.mock.calls.filter(
          ([event]) =>
            event.type === 'SOURCE_RECLAIMED' &&
            event.sourceId === SourceId.WebSdr,
        ).length;

      harness.web.emitFrame(VALID_TYPE1_FRAME, 200_000);
      expect(reclaimCount()).toBe(1);
      harness.web.emitFrame(VALID_TYPE1_FRAME, 210_000);
      expect(reclaimCount()).toBe(1);
      harness.web.emitFrame(VALID_TYPE1_FRAME, 240_000);
      expect(reclaimCount()).toBe(2);
    });
  });

  describe('warm-to-active promotion reuses the live transport', () => {
    it('promotes without re-dialling and attaches exactly one active pipeline', async () => {
      await demoteLocalToWarm(harness);
      expect(harness.local.startCalls).toBe(1);

      harness.local.emitFrame(VALID_TYPE1_FRAME, 100_000);
      const snapshot = harness.actor.getSnapshot();
      expect(snapshot.value).toBe('active');
      expect(snapshot.context.currentSourceId).toBe(SourceId.LocalUdp);

      // Transport reused: no second dial, never stopped.
      expect(harness.local.startCalls).toBe(1);
      expect(harness.local.stopCalls).toBe(0);
      // Warm listener swapped for the active pipeline - exactly one
      // frame and one error subscription each, no leaked duplicates.
      expect(harness.local.frameSubCount).toBe(1);
      expect(harness.local.errorSubCount).toBe(1);
      // Displaced WebSdr parked warm on its still-open transport.
      expect(snapshot.context.warmSourceIds).toContain(SourceId.WebSdr);
      expect(harness.web.stopCalls).toBe(0);
      expect(harness.web.frameSubCount).toBe(1);
      expect(harness.web.errorSubCount).toBe(1);
    });

    it('routes frames through the full active pipeline after promotion', async () => {
      await demoteLocalToWarm(harness);
      harness.local.emitFrame(VALID_TYPE1_FRAME, 100_000);
      expect(harness.actor.getSnapshot().context.currentSourceId).toBe(
        SourceId.LocalUdp,
      );

      // The reclaim frame itself is re-delivered to the just-attached
      // active pipeline (sources dispatch via Set.forEach, which visits
      // listeners added mid-iteration), so the frame that proved life
      // is already counted once here.
      expect(harness.actor.getSnapshot().context.framesAccepted).toBe(1);

      const published: unknown[] = [];
      harness.eventBus.on(VESSEL_UPDATE_EVENT, (payload) =>
        published.push(payload),
      );
      harness.local.emitFrame(VALID_TYPE1_FRAME, 140_000);

      expect(harness.actor.getSnapshot().context.framesAccepted).toBe(2);
      expect(published).toHaveLength(1);
    });
  });

  describe('warm transport hard failure', () => {
    it('closes and unsubscribes a warm source whose transport errors', async () => {
      await demoteLocalToWarm(harness);
      expect(harness.local.frameSubCount).toBe(1);

      harness.local.emitError(new Error('ws closed after idle'));

      const snapshot = harness.actor.getSnapshot();
      expect(snapshot.value).toBe('active');
      expect(snapshot.context.currentSourceId).toBe(SourceId.WebSdr);
      expect(snapshot.context.warmSourceIds).toEqual([]);
      expect(snapshot.context.triedSourceIds).toContain(SourceId.LocalUdp);
      // Service closed the dead transport and dropped every listener -
      // no zombie subscription left behind.
      expect(harness.local.stopCalls).toBe(1);
      expect(harness.local.frameSubCount).toBe(0);
      expect(harness.local.errorSubCount).toBe(0);
    });
  });
});
