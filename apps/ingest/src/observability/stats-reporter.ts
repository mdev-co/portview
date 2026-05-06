import type { SourceStats } from '@sps/shared';

export interface PerSourceStats {
  readonly sourceId: string;
  readonly stats: SourceStats;
}

export interface IngestStatsSnapshot {
  readonly machineState: string;
  readonly currentSourceId: string | null;
  readonly framesAccepted: number;
  readonly framesRejected: number;
  readonly perSource: readonly PerSourceStats[];
}

export type StatsFetcher = () => IngestStatsSnapshot;
export type StatsEmitter = (snapshot: IngestStatsSnapshot) => void;

export interface StartStatsReporterOptions {
  readonly fetch: StatsFetcher;
  readonly emit: StatsEmitter;
  readonly intervalMs?: number;
}

const DEFAULT_INTERVAL_MS = 30_000;

export function startStatsReporter(options: StartStatsReporterOptions): () => void {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const handle = setInterval(() => {
    options.emit(options.fetch());
  }, intervalMs);
  return () => clearInterval(handle);
}
