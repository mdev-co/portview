import { spawn } from 'node:child_process';
import { createLogger } from './logger.js';

const log = createLogger('watchdog');

/**
 * sd_notify(3) protocol bridge to systemd.
 *
 * The notify socket exposed via $NOTIFY_SOCKET is an AF_UNIX SOCK_DGRAM
 * endpoint which Node's stdlib does not support directly (`dgram` only
 * covers UDP, `net` only covers SOCK_STREAM unix sockets). Rather than
 * pull in a native binding, the bridge shells out to `systemd-notify`,
 * the official helper that ships with systemd on every modern Linux.
 * The subprocess cost is one fork per ping (~once per 15 s when
 * WatchdogSec=30s); negligible on the Pi.
 *
 * Every method is a no-op when $NOTIFY_SOCKET is absent so the bridge
 * runs identically under `pnpm dev`, in a plain container, or under
 * systemd with Type=notify.
 */
export class SystemdNotify {
  private readonly enabled: boolean;
  private readonly watchdogIntervalMs: number | null;
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    const sock = process.env['NOTIFY_SOCKET'];
    this.enabled = sock !== undefined && sock.length > 0;
    const usec = process.env['WATCHDOG_USEC'];
    const parsed = usec ? Number(usec) : NaN;
    this.watchdogIntervalMs =
      Number.isFinite(parsed) && parsed > 0 ? Math.max(1000, Math.floor(parsed / 1000 / 2)) : null;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  ready(): void {
    this.send('READY=1');
  }

  status(text: string): void {
    this.send(`STATUS=${text.replace(/\n/g, ' ')}`);
  }

  stopping(): void {
    this.send('STOPPING=1');
  }

  startWatchdog(): void {
    if (!this.enabled || this.watchdogIntervalMs === null || this.timer) return;
    this.timer = setInterval(() => this.send('WATCHDOG=1'), this.watchdogIntervalMs);
    this.timer.unref();
    log.info('watchdog ping started', { intervalMs: this.watchdogIntervalMs });
  }

  stopWatchdog(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private send(payload: string): void {
    if (!this.enabled) return;
    const child = spawn('systemd-notify', [payload], {
      stdio: 'ignore',
      detached: false,
    });
    child.on('error', err => {
      log.warn('systemd-notify spawn failed', { error: err.message });
    });
  }
}
