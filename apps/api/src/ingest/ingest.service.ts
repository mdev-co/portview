import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  type AisMessage,
  type FrameRejectionReason,
  type ISource,
  SourceId,
  ingestSourceMachine,
  sourceIdName,
  validateAisMessage,
} from '@sps/shared';
import { type Actor, createActor } from 'xstate';
import { getEdgeIngestConfig } from '../env';
import { adaptAisStreamMessage } from './adapters/ais-stream.adapter';
import { Decoder } from './decoder';
import { DeadLetterWriter, type SecurityRejection } from './dlq';
import { publishVesselStatic, publishVesselUpdate } from './ingest.events';
import { NewMmsiBouncer } from './limiters/new-mmsi-bouncer';
import { PerMmsiRateLimiter } from './limiters/per-mmsi-rate-limiter';
import { AisStreamSource } from './sources/ais-stream.source';
import { EdgeBridgeSource } from './sources/edge-bridge.source';
import { LocalUdpSource } from './sources/local-udp.source';
import { WebSdrSource } from './sources/web-sdr.source';
import {
  classifyMmsiRejection,
  isValidMmsi,
} from './validators/mmsi-validator';
import { validatePosition } from './validators/position-validator';

function securityKindToFsmReason(
  kind: SecurityRejection['kind'],
): FrameRejectionReason {
  switch (kind) {
    case 'mmsi-not-integer':
    case 'mmsi-out-of-range':
    case 'mmsi-unknown-mid':
      return 'invalid-mmsi';
    case 'lat-out-of-range':
      return 'out-of-range-lat';
    case 'lng-out-of-range':
      return 'out-of-range-lng';
    case 'sog-out-of-range':
    case 'cog-out-of-range':
    case 'heading-out-of-range':
      return 'invalid-payload';
    case 'mmsi-flooding':
    case 'new-mmsi-cap':
      return 'rate-limit';
  }
}

const STATS_INTERVAL_MS = 30_000;

/**
 * Orchestrates the AIS ingest pipeline inside the NestJS container.
 *
 * Replaces the standalone apps/ingest worker that used to live in its
 * own Node process. By co-locating ingest with the API we eliminate the
 * IPC boundary, share Prisma + ConfigModule, and allow the
 * TelemetryWsGateway to consume validated messages over a typed
 * in-process event bus instead of HTTP or sockets.
 *
 * Responsibilities:
 *   - Construct the configured sources (local UDP, WebSDR stub, AIS
 *     Stream WS) and register them with the priority FSM
 *     (`ingestSourceMachine` in @sps/shared).
 *   - On every frame: run the GIGO Decoder. Validated messages are
 *     emitted on the in-process bus as `vessel.update`. Rejected
 *     frames are appended to the DLQ JSONL and counted on the FSM.
 *   - Expose periodic stats via NestJS Logger so the FSM state and
 *     counters are observable in production logs.
 */
@Injectable()
export class IngestService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(IngestService.name);
  private readonly decoder = new Decoder();
  private readonly dlq = new DeadLetterWriter();
  private readonly sources = new Map<SourceId, ISource>();
  private readonly mmsiLimiter = new PerMmsiRateLimiter();
  private readonly newMmsiBouncer = new NewMmsiBouncer();

  private actor: Actor<typeof ingestSourceMachine> | null = null;
  private activeSource: ISource | null = null;
  private activeFrameUnsub: (() => void) | null = null;
  private activeErrorUnsub: (() => void) | null = null;
  private statsTimer: NodeJS.Timeout | null = null;
  private stateUnsub: (() => void) | null = null;
  private previousState: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly eventBus: EventEmitter2,
  ) {}

  onModuleInit(): void {
    const prioritized = this.registerSources();
    this.actor = createActor(ingestSourceMachine, {
      input: { prioritizedSourceIds: prioritized },
    });
    const subscription = this.actor.subscribe((snapshot) => {
      this.reconcileActiveSource(snapshot.context.currentSourceId);
      this.logStateTransition(
        String(snapshot.value),
        snapshot.context.currentSourceId,
      );
    });
    this.stateUnsub = (): void => subscription.unsubscribe();
    this.actor.start();
    this.actor.send({ type: 'START' });
    this.statsTimer = setInterval(() => this.reportStats(), STATS_INTERVAL_MS);
    this.log.log(
      `ingest started: sources=[${prioritized.map(sourceIdName).join(', ')}]`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.statsTimer !== null) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    this.detachActiveSource();
    if (this.actor !== null) {
      this.actor.send({ type: 'STOP' });
      this.actor.stop();
      this.actor = null;
    }
    this.stateUnsub?.();
    this.stateUnsub = null;
    if (this.activeSource !== null) {
      try {
        await this.activeSource.stop();
      } catch (err) {
        this.log.error(`active source stop failed: ${String(err)}`);
      }
      this.activeSource = null;
    }
    this.dlq.close();
  }

  private registerSources(): readonly SourceId[] {
    const order: SourceId[] = [];

    const edgeConfig = getEdgeIngestConfig();
    if (edgeConfig !== null) {
      try {
        this.sources.set(SourceId.EdgeBridge, new EdgeBridgeSource(edgeConfig));
        order.push(SourceId.EdgeBridge);
      } catch (err) {
        this.log.warn(`edge-bridge source skipped: ${String(err)}`);
      }
    }

    const port = Number(this.config.get<string>('INGEST_UDP_PORT') ?? 10110);
    const host = this.config.get<string>('INGEST_UDP_HOST') ?? '127.0.0.1';
    const rateLimit = Number(
      this.config.get<string>('INGEST_RATE_LIMIT') ?? 200,
    );

    this.sources.set(
      SourceId.LocalUdp,
      new LocalUdpSource({ port, host, rateLimit }),
    );
    order.push(SourceId.LocalUdp);

    this.sources.set(SourceId.WebSdr, new WebSdrSource());
    order.push(SourceId.WebSdr);

    try {
      this.sources.set(
        SourceId.AisStream,
        new AisStreamSource({
          token: this.config.get<string>('EXTERNAL_FEED_TOKEN'),
          endpoint: this.config.get<string>('EXTERNAL_FEED_ENDPOINT'),
          logger: (level, message, data) => {
            const detail = data === undefined ? '' : ` ${JSON.stringify(data)}`;
            const line = `[ais-stream] ${message}${detail}`;
            switch (level) {
              case 'debug':
                this.log.debug(line);
                break;
              case 'info':
                this.log.log(line);
                break;
              case 'warn':
                this.log.warn(line);
                break;
              case 'error':
                this.log.error(line);
                break;
            }
          },
        }),
      );
      order.push(SourceId.AisStream);
    } catch (err) {
      this.log.warn(`ais-stream source skipped: ${String(err)}`);
    }

    return order;
  }

  private reconcileActiveSource(desiredId: SourceId | null): void {
    const desiredSource =
      desiredId !== null ? (this.sources.get(desiredId) ?? null) : null;

    if (this.activeSource && this.activeSource !== desiredSource) {
      const stopping = this.activeSource;
      this.detachActiveSource();
      this.activeSource = null;
      void stopping
        .stop()
        .catch((err) => this.log.error(`source stop failed: ${String(err)}`));
    }

    if (desiredSource && desiredSource !== this.activeSource) {
      this.activeSource = desiredSource;
      this.attachSource(desiredSource);
      desiredSource
        .start()
        .then(() => {
          this.log.log(`source connected: ${sourceIdName(desiredSource.id)}`);
          this.actor?.send({
            type: 'SOURCE_CONNECTED',
            sourceId: desiredSource.id,
          });
        })
        .catch((err: Error) => {
          this.log.error(
            `source start failed: ${sourceIdName(desiredSource.id)} ${err.message}`,
          );
          this.actor?.send({
            type: 'SOURCE_FAILED',
            sourceId: desiredSource.id,
            reason: err.message,
          });
        });
    }
  }

  private attachSource(source: ISource): void {
    this.activeFrameUnsub = source.onFrame((frame) => {
      if (this.isJsonFormat(frame.raw)) {
        this.handleJsonFrame(source, frame.raw, frame.receivedAt);
        return;
      }
      if (!this.isNmeaFormat(frame.raw)) {
        this.dlq.write({
          raw: frame.raw,
          sourceId: source.id,
          receivedAt: frame.receivedAt,
          reason: { kind: 'parse-error', detail: 'unrecognized frame format' },
        });
        this.actor?.send({
          type: 'FRAME_REJECTED',
          sourceId: source.id,
          reason: 'parse-error',
        });
        return;
      }
      const outcome = this.decoder.decode(frame.raw);
      switch (outcome.kind) {
        case 'message':
          this.publishValidatedMessage(
            outcome.value,
            frame.raw,
            source.id,
            frame.receivedAt,
          );
          break;
        case 'pending':
          break;
        case 'rejected':
          this.dlq.write({
            raw: frame.raw,
            sourceId: source.id,
            receivedAt: frame.receivedAt,
            reason: outcome.reason,
          });
          this.actor?.send({
            type: 'FRAME_REJECTED',
            sourceId: source.id,
            reason: outcome.reason.kind,
          });
          break;
      }
    });
    this.activeErrorUnsub = source.onError((err) => {
      this.log.error(`source error ${sourceIdName(source.id)}: ${err.message}`);
      this.actor?.send({
        type: 'SOURCE_FAILED',
        sourceId: source.id,
        reason: err.message,
      });
    });
  }

  private detachActiveSource(): void {
    this.activeFrameUnsub?.();
    this.activeErrorUnsub?.();
    this.activeFrameUnsub = null;
    this.activeErrorUnsub = null;
  }

  private isNmeaFormat(raw: string): boolean {
    return raw.startsWith('$') || raw.startsWith('!');
  }

  private isJsonFormat(raw: string): boolean {
    return raw.startsWith('{');
  }

  private handleJsonFrame(
    source: ISource,
    raw: string,
    receivedAt: number,
  ): void {
    const adapted = adaptAisStreamMessage(raw);
    if (adapted.kind === 'rejected') {
      this.dlq.write({
        raw,
        sourceId: source.id,
        receivedAt,
        reason: adapted.reason,
      });
      this.actor?.send({
        type: 'FRAME_REJECTED',
        sourceId: source.id,
        reason: adapted.reason.kind,
      });
      return;
    }
    const validation = validateAisMessage(adapted.value);
    if (!validation.ok) {
      this.dlq.write({
        raw,
        sourceId: source.id,
        receivedAt,
        reason: validation.error,
      });
      this.actor?.send({
        type: 'FRAME_REJECTED',
        sourceId: source.id,
        reason: validation.error.kind,
      });
      return;
    }
    this.publishValidatedMessage(validation.value, raw, source.id, receivedAt);
  }

  /**
   * Boundary checkpoint between decoded-AIS and the in-process event
   * bus. Decoded messages can still be malicious or malformed in ways
   * the parser does not catch (spoofed MMSIs, garbage positions, flood
   * traffic). This method funnels every position-bearing and static
   * message through four guards before fan-out:
   *
   *   1. MMSI sanity (ITU-R M.585 range and known MID prefix).
   *   2. Position range (lat / lng / SOG / COG / heading bounds).
   *   3. New-MMSI bouncer (caps unique-MMSI introduction rate).
   *   4. Per-MMSI token bucket (caps per-vessel broadcast rate).
   *
   * Anything that fails a guard goes to the DLQ with a typed reason
   * and a FRAME_REJECTED event on the FSM. Anything that passes is
   * counted as FRAME_RECEIVED and emitted on the typed event bus.
   */
  private publishValidatedMessage(
    message: AisMessage,
    raw: string,
    sourceId: SourceId,
    receivedAt: number,
  ): void {
    const mmsi = Number(message.mmsi);

    if (!isValidMmsi(mmsi)) {
      const kind = classifyMmsiRejection(mmsi);
      this.dlq.write({
        raw,
        sourceId,
        receivedAt,
        reason: { kind, detail: `mmsi=${String(mmsi)}` },
      });
      this.actor?.send({
        type: 'FRAME_REJECTED',
        sourceId,
        reason: securityKindToFsmReason(kind),
      });
      return;
    }

    if (
      message.messageType === 1 ||
      message.messageType === 2 ||
      message.messageType === 3 ||
      message.messageType === 18
    ) {
      const position = message.position;
      if (position !== null) {
        const [lng, lat] = position;
        const positionCheck = validatePosition({
          lat,
          lng,
          speedOverGround: message.speedOverGround,
          courseOverGround: message.courseOverGround,
          trueHeading: 'trueHeading' in message ? message.trueHeading : null,
        });
        if (!positionCheck.ok) {
          this.dlq.write({
            raw,
            sourceId,
            receivedAt,
            reason: {
              kind: positionCheck.reason,
              detail: `lat=${String(lat)} lng=${String(lng)}`,
            },
          });
          this.actor?.send({
            type: 'FRAME_REJECTED',
            sourceId,
            reason: securityKindToFsmReason(positionCheck.reason),
          });
          return;
        }
      }
    }

    const admit = this.newMmsiBouncer.admit(mmsi);
    if (admit === 'rejected-new-cap') {
      this.dlq.write({
        raw,
        sourceId,
        receivedAt,
        reason: {
          kind: 'new-mmsi-cap',
          detail: `mmsi=${String(mmsi)} introductions-per-min cap reached`,
        },
      });
      this.actor?.send({
        type: 'FRAME_REJECTED',
        sourceId,
        reason: securityKindToFsmReason('new-mmsi-cap'),
      });
      return;
    }

    if (!this.mmsiLimiter.tryConsume(mmsi)) {
      this.dlq.write({
        raw,
        sourceId,
        receivedAt,
        reason: {
          kind: 'mmsi-flooding',
          detail: `mmsi=${String(mmsi)} per-mmsi rate exceeded`,
        },
      });
      this.actor?.send({
        type: 'FRAME_REJECTED',
        sourceId,
        reason: securityKindToFsmReason('mmsi-flooding'),
      });
      return;
    }

    this.actor?.send({
      type: 'FRAME_RECEIVED',
      sourceId,
      frameAt: receivedAt,
    });

    if (message.messageType === 5 || message.messageType === 24) {
      publishVesselStatic(this.eventBus, { message, sourceId, receivedAt });
    } else {
      publishVesselUpdate(this.eventBus, { message, sourceId, receivedAt });
    }
  }

  private logStateTransition(state: string, sourceId: SourceId | null): void {
    if (state === this.previousState) return;
    this.log.log(
      `transition: ${this.previousState ?? 'initial'} -> ${state}` +
        (sourceId !== null ? ` (source=${sourceIdName(sourceId)})` : ''),
    );
    this.previousState = state;
  }

  private reportStats(): void {
    const snapshot = this.actor?.getSnapshot();
    if (!snapshot) return;
    this.log.log(
      `stats: state=${String(snapshot.value)} ` +
        `accepted=${snapshot.context.framesAccepted} ` +
        `rejected=${snapshot.context.framesRejected} ` +
        `currentSource=${
          snapshot.context.currentSourceId !== null
            ? sourceIdName(snapshot.context.currentSourceId)
            : 'none'
        }`,
    );
  }
}
