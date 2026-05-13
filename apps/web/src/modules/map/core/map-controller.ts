import { type Actor, type SnapshotFrom, createActor } from 'xstate';
import { AdapterNotInitializedError, ContainerNotAttachedError } from './errors';
import type {
  GeoJSONFeatureCollection,
  IMapEngineAdapter,
  LngLat,
  MapEngineConfig,
  MapEngineType,
} from './map-engine.types';
import { mapMachine } from './map-machine';
import { $mapState, type MapStatus } from './map-state';

type MapMachineSnapshot = SnapshotFrom<typeof mapMachine>;
type Unsubscribe = () => void;

export class MapController {
  private static instance: MapController | null = null;

  private readonly actor: Actor<typeof mapMachine>;
  private adapterErrorUnsub: Unsubscribe | null = null;
  private trackedAdapter: IMapEngineAdapter | null = null;

  private constructor() {
    this.actor = createActor(mapMachine);
    this.actor.subscribe(snapshot => {
      this.syncStateAtom(snapshot);
      this.syncAdapterErrorSubscription(snapshot);
    });
    this.actor.start();
  }

  static getInstance(): MapController {
    if (!MapController.instance) {
      MapController.instance = new MapController();
    }
    return MapController.instance;
  }

  attachContainer(elem: HTMLElement): void {
    const { container } = this.actor.getSnapshot().context;
    if (container === elem) return;
    this.actor.send({ type: 'CONTAINER_ATTACHED', container: elem });
  }

  detachContainer(): void {
    this.actor.send({ type: 'CONTAINER_DETACHED' });
  }

  useEngine(engineType: MapEngineType, config: MapEngineConfig): void {
    const snapshot = this.actor.getSnapshot();
    const { container, currentEngineType, currentAdapter } = snapshot.context;
    if (!container) {
      throw new ContainerNotAttachedError('useEngine');
    }
    if (currentEngineType === engineType && currentAdapter !== null && snapshot.value === 'ready') {
      return;
    }
    this.actor.send({ type: 'USE_ENGINE', engineType, config });
  }

  flyTo(center: LngLat, zoom?: number): void {
    const { currentAdapter, currentEngineType } = this.actor.getSnapshot().context;
    if (!currentAdapter) {
      throw new AdapterNotInitializedError(currentEngineType ?? 'maplibre', 'flyTo');
    }
    currentAdapter.flyTo(center, zoom);
  }

  setSourceData(sourceId: string, data: GeoJSONFeatureCollection): void {
    const { currentAdapter, currentEngineType } = this.actor.getSnapshot().context;
    if (!currentAdapter) {
      throw new AdapterNotInitializedError(currentEngineType ?? 'maplibre', 'setSourceData');
    }
    currentAdapter.setSourceData(sourceId, data);
  }

  setLayerVisibility(layerId: string, visible: boolean): void {
    const { currentAdapter } = this.actor.getSnapshot().context;
    // The map style switcher can fire before the engine finishes
    // initializing (e.g. during a fast page-load click). Treat the
    // call as a no-op until an adapter exists; the next style change
    // after the ready event will apply the desired visibility.
    if (!currentAdapter) return;
    currentAdapter.setLayerVisibility(layerId, visible);
  }

  getRawEngine(): unknown {
    return this.actor.getSnapshot().context.currentAdapter?.getRawEngine() ?? null;
  }

  dispose(): void {
    this.actor.send({ type: 'DISPOSE' });
  }

  private syncStateAtom(snapshot: MapMachineSnapshot): void {
    $mapState.set({
      status: snapshot.value as MapStatus,
      engineType: snapshot.context.currentEngineType,
      error: snapshot.context.error,
    });
  }

  private syncAdapterErrorSubscription(snapshot: MapMachineSnapshot): void {
    const adapter = snapshot.context.currentAdapter;
    if (adapter === this.trackedAdapter) return;

    this.adapterErrorUnsub?.();
    this.adapterErrorUnsub = null;
    this.trackedAdapter = adapter;

    if (adapter) {
      this.adapterErrorUnsub = adapter.onError(err => {
        this.actor.send({ type: 'ENGINE_ERROR', error: err });
      });
    }
  }
}
