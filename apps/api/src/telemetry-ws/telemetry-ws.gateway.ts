import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { encodeVesselFrame } from '@sps/shared';
import { WebSocket, WebSocketServer as WsServer } from 'ws';
import {
  VESSEL_STATIC_EVENT,
  VESSEL_UPDATE_EVENT,
  type VesselStaticEvent,
  type VesselUpdateEvent,
} from '../ingest/ingest.events';
import { buildVesselFrame } from './frame-builder';
import { SnapshotBuilder } from './snapshot-builder';
import { buildVesselStaticFrame } from './static-builder';

/** 1 MB - drop the slowest clients before the kernel buffer grows unbounded. */
const BACKPRESSURE_LIMIT_BYTES = 1_000_000;
const PROTOCOL_VIOLATION = 1003;

/**
 * Push-only WebSocket gateway at /ws/telemetry.
 *
 * Two frame kinds reach connected clients:
 *   - binary VesselUpdateFrame (40 bytes) for position events, encoded
 *     via the shared codec on every `vessel.update` bus event;
 *   - JSON text VesselStaticDataFrame for static-data events (AIS
 *     type 5), serialised on every `vessel.static.update` bus event.
 *     Strings (vessel name, callSign, destination) cannot fit the
 *     binary codec, so static rides on a JSON envelope discriminated
 *     by `kind: "vessel.static"`.
 *
 * Backpressure: clients above BACKPRESSURE_LIMIT_BYTES are skipped for
 * the round; persistent slowness escalates to disconnect.
 *
 * Push-only contract: every client-to-server frame closes the
 * connection with status 1003. The gateway exposes no message handlers.
 */
@WebSocketGateway({ path: '/ws/telemetry' })
export class TelemetryWsGateway {
  private readonly log = new Logger(TelemetryWsGateway.name);

  @WebSocketServer() server!: WsServer;

  constructor(private readonly snapshotBuilder: SnapshotBuilder) {}

  handleConnection(client: WebSocket): void {
    client.binaryType = 'arraybuffer';
    client.on('message', () => {
      this.log.warn('client sent frame on push-only channel; closing');
      client.close(PROTOCOL_VIOLATION, 'push-only protocol');
    });
    client.on('error', (err: Error) => {
      this.log.warn(`client error: ${err.message}`);
    });
    this.log.log('client connected');
    // Send the cold-start snapshot before live events start flowing.
    // Failures are logged but never close the connection - the client
    // will simply receive only live frames and rebuild state over time.
    void this.sendSnapshot(client).catch((err) => {
      this.log.warn(`snapshot send failed: ${String(err)}`);
    });
  }

  private async sendSnapshot(client: WebSocket): Promise<void> {
    if (client.readyState !== WebSocket.OPEN) return;
    const frame = await this.snapshotBuilder.build();
    if (client.readyState !== WebSocket.OPEN) return;
    client.send(JSON.stringify(frame), { binary: false });
  }

  handleDisconnect(): void {
    this.log.log('client disconnected');
  }

  @OnEvent(VESSEL_UPDATE_EVENT)
  onVesselUpdate(event: VesselUpdateEvent): void {
    const frame = encodeVesselFrame(buildVesselFrame(event));
    this.broadcast(frame, { binary: true });
  }

  @OnEvent(VESSEL_STATIC_EVENT)
  onVesselStatic(event: VesselStaticEvent): void {
    const json = JSON.stringify(buildVesselStaticFrame(event));
    this.broadcast(json, { binary: false });
  }

  private broadcast(
    payload: Uint8Array | string,
    opts: { binary: boolean },
  ): void {
    let dropped = 0;
    for (const client of this.server.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      if (client.bufferedAmount > BACKPRESSURE_LIMIT_BYTES) {
        dropped += 1;
        continue;
      }
      client.send(payload, opts);
    }
    if (dropped > 0) {
      this.log.warn(`dropped ${dropped} client(s) due to backpressure`);
    }
  }
}
