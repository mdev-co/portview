import type { ISource, NmeaFrame, Unsubscribe } from '@sps/shared';
import { SourceId } from '@sps/shared';

const SOURCE_ID = SourceId.WebSdr;
const SOURCE_PRIORITY = 2;

type FrameCallback = (frame: NmeaFrame) => void;
type ErrorCallback = (error: Error) => void;

export class WebSdrSource implements ISource {
  readonly id: SourceId = SOURCE_ID;
  readonly priority = SOURCE_PRIORITY;

  private readonly frameListeners = new Set<FrameCallback>();
  private readonly errorListeners = new Set<ErrorCallback>();

  async start(): Promise<void> {
    throw new Error('WebSdrSource is not yet implemented');
  }

  async stop(): Promise<void> {
    return;
  }

  onFrame(callback: FrameCallback): Unsubscribe {
    this.frameListeners.add(callback);
    return () => {
      this.frameListeners.delete(callback);
    };
  }

  onError(callback: ErrorCallback): Unsubscribe {
    this.errorListeners.add(callback);
    return () => {
      this.errorListeners.delete(callback);
    };
  }
}
