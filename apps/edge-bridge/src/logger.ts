/**
 * Minimal structured stdout/stderr logger for the edge-bridge daemon.
 * One source of truth so `journalctl -u sps-edge-bridge` lines have
 * predictable shape: ISO timestamp, level, scope, message, optional
 * JSON context. No external dependency, no log rotation - systemd
 * journald owns persistence.
 *
 * Level threshold read once at boot from `EDGE_BRIDGE_LOG_LEVEL` env
 * var; defaults to `info`. Warn and error go to stderr so systemd
 * tags them with the appropriate priority; debug and info go to
 * stdout.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveMinLevel(): LogLevel {
  const raw = process.env['EDGE_BRIDGE_LOG_LEVEL']?.toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}

const MIN_LEVEL: LogLevel = resolveMinLevel();

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];
}

function write(
  level: LogLevel,
  scope: string,
  message: string,
  context?: Record<string, unknown>,
): void {
  if (!shouldLog(level)) return;
  const timestamp = new Date().toISOString();
  const ctxStr = context !== undefined ? ` ${JSON.stringify(context)}` : '';
  const line = `${timestamp} [${level}] [${scope}] ${message}${ctxStr}\n`;
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(line);
}

export type Logger = {
  readonly debug: (msg: string, ctx?: Record<string, unknown>) => void;
  readonly info: (msg: string, ctx?: Record<string, unknown>) => void;
  readonly warn: (msg: string, ctx?: Record<string, unknown>) => void;
  readonly error: (msg: string, ctx?: Record<string, unknown>) => void;
};

export function createLogger(scope: string): Logger {
  return {
    debug: (msg, ctx) => write('debug', scope, msg, ctx),
    info: (msg, ctx) => write('info', scope, msg, ctx),
    warn: (msg, ctx) => write('warn', scope, msg, ctx),
    error: (msg, ctx) => write('error', scope, msg, ctx),
  };
}
