import dgram from 'node:dgram';
import { LocalUdpSource } from './local-udp.source';

const TEST_HOST = '127.0.0.1';
const TEST_PORT = 19_110;
const TIMEOUT_MS = 250;
const SAMPLE_NMEA = '!AIVDM,1,1,,B,15Mq4J0P00G?qhFE`R8;d?wH06,0*5C\n';

function pickPort(): number {
  return TEST_PORT + Math.floor(Math.random() * 1_000);
}

describe('LocalUdpSource start with first-frame timeout', () => {
  it('rejects when no datagram arrives within firstFrameTimeoutMs', async () => {
    const source = new LocalUdpSource({
      host: TEST_HOST,
      port: pickPort(),
      firstFrameTimeoutMs: TIMEOUT_MS,
    });
    await expect(source.start()).rejects.toThrow(
      /no datagram arrived within 250ms/,
    );
  });

  it('resolves when a datagram arrives before the timeout', async () => {
    const port = pickPort();
    const source = new LocalUdpSource({
      host: TEST_HOST,
      port,
      firstFrameTimeoutMs: 5_000,
    });
    const sender = dgram.createSocket('udp4');

    const startPromise = source.start();
    await new Promise<void>((resolve, reject) => {
      // Give the bind a tick to land before the first datagram so the
      // listener is wired by the time the message arrives.
      setTimeout(() => {
        sender.send(SAMPLE_NMEA, port, TEST_HOST, (err) => {
          sender.close();
          if (err) reject(err);
          else resolve();
        });
      }, 50);
    });
    await startPromise;
    await source.stop();
  });

  it('forwards first datagram into onFrame after start resolves', async () => {
    const port = pickPort();
    const source = new LocalUdpSource({
      host: TEST_HOST,
      port,
      firstFrameTimeoutMs: 5_000,
    });
    const frames: string[] = [];
    source.onFrame((frame) => frames.push(frame.raw));

    const sender = dgram.createSocket('udp4');
    const startPromise = source.start();
    await new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        sender.send(SAMPLE_NMEA, port, TEST_HOST, (err) => {
          sender.close();
          if (err) reject(err);
          else resolve();
        });
      }, 50);
    });
    await startPromise;
    expect(frames.length).toBeGreaterThan(0);
    expect(frames[0]).toContain('!AIVDM');
    await source.stop();
  });
});
