import { createActor } from 'xstate';
import { type ISource, SourceId, createLogger, ingestSourceMachine } from '@sps/shared';
import { Decoder } from './decoder';
import { DeadLetterWriter } from './dlq';
import {
  type IngestStatsSnapshot,
  type PerSourceStats,
  startStatsReporter,
} from './observability/stats-reporter';
import { AisStreamSource } from './sources/ais-stream-source';
import { LocalUdpSource } from './sources/local-udp-source';
import { WebSdrSource } from './sources/web-sdr-source';

const log = createLogger('ingest', {
  format: process.env.NODE_ENV === 'production' ? 'json' : 'pretty',
  minLevel: process.env.LOG_LEVEL ? Number(process.env.LOG_LEVEL) : 0,
});

const UDP_PORT = Number(process.env.INGEST_UDP_PORT ?? 10110);
const UDP_HOST = process.env.INGEST_UDP_HOST ?? '127.0.0.1';
const RATE_LIMIT = Number(process.env.INGEST_RATE_LIMIT ?? 200);

const sources = new Map<SourceId, ISource>();
const prioritizedBuilder: SourceId[] = [];

sources.set(
  SourceId.LocalUdp,
  new LocalUdpSource({ port: UDP_PORT, host: UDP_HOST, rateLimit: RATE_LIMIT }),
);
prioritizedBuilder.push(SourceId.LocalUdp);

sources.set(SourceId.WebSdr, new WebSdrSource());
prioritizedBuilder.push(SourceId.WebSdr);
log.info('web-sdr source registered (stub)');

try {
  sources.set(
    SourceId.AisStream,
    new AisStreamSource({
      logger: (level, message, data) => {
        if (data === undefined) {
          log[level](`[ais-stream] ${message}`);
        } else {
          log[level](data, `[ais-stream] ${message}`);
        }
      },
    }),
  );
  prioritizedBuilder.push(SourceId.AisStream);
  log.info('ais-stream source registered');
} catch (err) {
  log.warn({ err: String(err) }, 'ais-stream source skipped');
}

const PRIORITIZED_SOURCE_IDS: readonly SourceId[] = prioritizedBuilder;

const actor = createActor(ingestSourceMachine, {
  input: { prioritizedSourceIds: PRIORITIZED_SOURCE_IDS },
});

let activeSource: ISource | null = null;
let activeFrameUnsub: (() => void) | null = null;
let activeErrorUnsub: (() => void) | null = null;

function detachActiveSource(): void {
  activeFrameUnsub?.();
  activeErrorUnsub?.();
  activeFrameUnsub = null;
  activeErrorUnsub = null;
}

const decoder = new Decoder();
const dlq = new DeadLetterWriter();

function isNmeaFormat(raw: string): boolean {
  return raw.startsWith('$') || raw.startsWith('!');
}

function attachSource(source: ISource): void {
  activeFrameUnsub = source.onFrame(frame => {
    if (!isNmeaFormat(frame.raw)) {
      // External-feed JSON (AIS Stream WS) is forwarded as-is to FRAME_RECEIVED;
      // its decode path lands at the API boundary, not here.
      actor.send({ type: 'FRAME_RECEIVED', sourceId: source.id, frameAt: frame.receivedAt });
      return;
    }
    const outcome = decoder.decode(frame.raw);
    switch (outcome.kind) {
      case 'message':
        actor.send({ type: 'FRAME_RECEIVED', sourceId: source.id, frameAt: frame.receivedAt });
        log.debug(
          { sourceId: source.id, messageType: outcome.value.messageType },
          'frame accepted',
        );
        break;
      case 'pending':
        // Multipart fragment buffered; not counted as accept or reject.
        break;
      case 'rejected':
        dlq.write({
          raw: frame.raw,
          sourceId: source.id,
          receivedAt: frame.receivedAt,
          reason: outcome.reason,
        });
        actor.send({
          type: 'FRAME_REJECTED',
          sourceId: source.id,
          reason: outcome.reason.kind,
        });
        log.warn({ sourceId: source.id, reason: outcome.reason.kind }, 'frame rejected');
        break;
    }
  });
  activeErrorUnsub = source.onError(err => {
    log.error({ sourceId: source.id, err: err.message }, 'source error');
    actor.send({ type: 'SOURCE_FAILED', sourceId: source.id, reason: err.message });
  });
}

let previousState: string | null = null;

actor.subscribe(snapshot => {
  const desiredId = snapshot.context.currentSourceId;
  const desiredSource = desiredId !== null ? (sources.get(desiredId) ?? null) : null;

  if (activeSource && activeSource !== desiredSource) {
    const stopping = activeSource;
    detachActiveSource();
    activeSource = null;
    void stopping
      .stop()
      .catch((err: unknown) => log.error({ err: String(err) }, 'source stop failed'));
  }

  if (desiredSource && desiredSource !== activeSource) {
    activeSource = desiredSource;
    attachSource(desiredSource);
    desiredSource
      .start()
      .then(() => {
        log.info({ sourceId: desiredSource.id }, 'source connected');
        actor.send({ type: 'SOURCE_CONNECTED', sourceId: desiredSource.id });
      })
      .catch((err: Error) => {
        log.error({ sourceId: desiredSource.id, err: err.message }, 'source start failed');
        actor.send({ type: 'SOURCE_FAILED', sourceId: desiredSource.id, reason: err.message });
      });
  }

  const currentState = String(snapshot.value);
  if (currentState !== previousState) {
    log.info({ from: previousState, to: currentState, sourceId: desiredId }, 'machine transition');
    previousState = currentState;
  }
});

function collectStats(): IngestStatsSnapshot {
  const snapshot = actor.getSnapshot();
  const perSource: PerSourceStats[] = [];
  for (const [id, source] of sources) {
    if (typeof source.getStats === 'function') {
      perSource.push({ sourceId: id, stats: source.getStats() });
    }
  }
  return {
    machineState: String(snapshot.value),
    currentSourceId: snapshot.context.currentSourceId,
    framesAccepted: snapshot.context.framesAccepted,
    framesRejected: snapshot.context.framesRejected,
    perSource,
  };
}

const stopStatsReporter = startStatsReporter({
  fetch: collectStats,
  emit: stats => log.info(stats, 'ingest stats'),
});

actor.start();
actor.send({ type: 'START' });
log.info(
  { port: UDP_PORT, host: UDP_HOST, rateLimit: RATE_LIMIT, sources: PRIORITIZED_SOURCE_IDS },
  'ingest worker started',
);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, 'shutting down');
  stopStatsReporter();
  actor.send({ type: 'STOP' });
  if (activeSource) {
    try {
      await activeSource.stop();
    } catch (err) {
      log.error({ err: String(err) }, 'shutdown stop failed');
    }
  }
  dlq.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
