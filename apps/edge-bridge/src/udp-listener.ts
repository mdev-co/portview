import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { createLogger } from './logger.js';

const log = createLogger('udp');

export type UdpFrameEvent = {
  readonly frame: string;
  readonly remoteAddress: string;
  readonly remotePort: number;
};

/**
 * UDP listener bound to the local socket where `rtl_ais` writes NMEA
 * sentences. Each datagram may contain one or more newline-terminated
 * NMEA frames; the listener accumulates partial reads in a per-instance
 * buffer and emits one `frame` event per complete sentence so the WSS
 * client downstream sees clean line-delimited payloads.
 *
 * No parsing happens here: the bridge is a dumb pipe by design. NMEA
 * structural validation, multipart reassembly and AIS bit decoding live
 * in `packages/shared` and run on the backend so the Pi stays minimal.
 */
export class UdpListener extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private framesReceived = 0;
  private buffer = '';

  constructor(
    private readonly host: string,
    private readonly port: number,
  ) {
    super();
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.socket = socket;

      socket.on('message', (msg, rinfo) => {
        this.handleDatagram(msg, rinfo.address, rinfo.port);
      });

      socket.on('error', err => {
        log.error('socket error', { error: err.message });
        this.emit('error', err);
      });

      const onListening = (): void => {
        log.info('listening', { host: this.host, port: this.port });
        socket.removeListener('error', onErrorBeforeBind);
        resolve();
      };
      const onErrorBeforeBind = (err: Error): void => {
        socket.removeListener('listening', onListening);
        log.error('bind failed', { error: err.message, host: this.host, port: this.port });
        reject(err);
      };
      socket.once('listening', onListening);
      socket.once('error', onErrorBeforeBind);

      socket.bind(this.port, this.host);
    });
  }

  private handleDatagram(msg: Buffer, remoteAddress: string, remotePort: number): void {
    this.framesReceived += 1;
    this.buffer += msg.toString('utf8');

    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        const event: UdpFrameEvent = { frame: line, remoteAddress, remotePort };
        this.emit('frame', event);
      }
      newlineIndex = this.buffer.indexOf('\n');
    }
  }

  async stop(): Promise<void> {
    if (this.socket === null) return;
    const socket = this.socket;
    return new Promise(resolve => {
      socket.close(() => {
        log.info('stopped', { framesReceived: this.framesReceived });
        this.socket = null;
        resolve();
      });
    });
  }

  getStats(): { readonly framesReceived: number } {
    return { framesReceived: this.framesReceived };
  }
}
