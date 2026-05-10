import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { encodeVesselFrame } from '@sps/shared';
import { type RawData, WebSocket, WebSocketServer as WsServer } from 'ws';
import {
  VESSEL_UPDATE_EVENT,
  type VesselUpdateEvent,
} from '../ingest/ingest.events';
import { buildVesselFrame } from './frame-builder';

/** 1 MB — drop the slowest clients before the kernel buffer grows unbounded. */
const BACKPRESSURE_LIMIT_BYTES = 1_000_000;
const BINARY_PROTOCOL_VIOLATION = 1003;

/**
 * Push-only binary WebSocket gateway at /ws/telemetry.
 *
 * Subscribes to `vessel.update` events on the in-process EventEmitter2
 * bus. For each event, encodes a 38-byte VesselUpdateFrame via the
 * shared codec and broadcasts to every connected client. Clients that
 * fall behind (bufferedAmount above BACKPRESSURE_LIMIT_BYTES) are
 * skipped for the round; persistent slowness escalates to disconnect.
 *
 * Binary-only: a text frame received from a client closes the
 * connection with status 1003 (unsupported data). The gateway exposes
 * no message handlers; client-to-server traffic is not part of the D5
 * protocol.
 */
@WebSocketGateway({ path: '/ws/telemetry' })
export class TelemetryWsGateway {
  private readonly log = new Logger(TelemetryWsGateway.name);

  @WebSocketServer() server!: WsServer;

  handleConnection(client: WebSocket): void {
    client.binaryType = 'arraybuffer';
    client.on('message', (_data: RawData, isBinary: boolean) => {
      if (!isBinary) {
        this.log.warn(
          'client sent text frame on a binary-only protocol; closing',
        );
        client.close(BINARY_PROTOCOL_VIOLATION, 'binary-only protocol');
      }
    });
    client.on('error', (err: Error) => {
      this.log.warn(`client error: ${err.message}`);
    });
    this.log.log('client connected');
  }

  handleDisconnect(): void {
    this.log.log('client disconnected');
  }

  @OnEvent(VESSEL_UPDATE_EVENT)
  onVesselUpdate(event: VesselUpdateEvent): void {
    const frame = encodeVesselFrame(buildVesselFrame(event));
    let dropped = 0;
    for (const client of this.server.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      if (client.bufferedAmount > BACKPRESSURE_LIMIT_BYTES) {
        dropped += 1;
        continue;
      }
      client.send(frame, { binary: true });
    }
    if (dropped > 0) {
      this.log.warn(`dropped ${dropped} client(s) due to backpressure`);
    }
  }
}
