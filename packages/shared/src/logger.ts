import { type ILogObj, Logger } from 'tslog';

export type AppLogger = Logger<ILogObj>;

/**
 * Creates a tagged logger. Use one per module/component:
 *   const log = createLogger('ingest:udp');
 *   log.info('listening', { port: 10110 });
 *
 * Output format: pretty (dev) / JSON (production via NODE_ENV).
 * Min level via LOG_LEVEL env var (0=silly, 6=fatal). Default: 0 (all).
 */
export function createLogger(name: string): AppLogger {
  return new Logger({
    name,
    type: process.env.NODE_ENV === 'production' ? 'json' : 'pretty',
    minLevel: process.env.LOG_LEVEL ? Number(process.env.LOG_LEVEL) : 0,
    hideLogPositionForProduction: true,
  });
}
