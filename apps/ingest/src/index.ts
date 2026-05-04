import { createLogger } from '@sps/shared';

// SPS Ingest Worker
// Listens on UDP for AIS NMEA frames, parses, forwards to API.
// Implementation deferred to sprint Day 2 (sources bringup).

const log = createLogger('ingest', {
  format: process.env.NODE_ENV === 'production' ? 'json' : 'pretty',
  minLevel: process.env.LOG_LEVEL ? Number(process.env.LOG_LEVEL) : 0,
});
const PORT = Number(process.env.INGEST_PORT ?? 10110);

log.info(`SPS ingest worker - placeholder. UDP target port: ${PORT}`);
log.info('Implementation: see issue D2 - Sources bringup.');
