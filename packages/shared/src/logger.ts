import { type ILogObj, Logger } from 'tslog';

export type AppLogger = Logger<ILogObj>;

export interface CreateLoggerOptions {
  /** Output format: pretty for dev, json for production log aggregators */
  format?: 'pretty' | 'json';
  /** Min log level (0=silly, 1=trace, 2=debug, 3=info, 4=warn, 5=error, 6=fatal) */
  minLevel?: number;
}

/**
 * Creates a tagged logger. Framework-agnostic: caller passes runtime-specific
 * options (format, level). No process.env access here, so this works in
 * Node, browser, RN, or any JS runtime.
 *
 * Use one per module/component:
 *   const log = createLogger('ingest:udp', { format: 'pretty', minLevel: 0 });
 *   log.info('listening', { port: 10110 });
 */
export function createLogger(name: string, options: CreateLoggerOptions = {}): AppLogger {
  return new Logger({
    name,
    type: options.format ?? 'pretty',
    minLevel: options.minLevel ?? 0,
    hideLogPositionForProduction: true,
    prettyLogTemplate: '{{hh}}:{{MM}}:{{ss}}.{{ms}} {{logLevelName}} {{name}} ',
    prettyInspectOptions: {
      breakLength: 200,
      compact: 3,
      depth: 4,
      colors: true,
    },
  });
}
