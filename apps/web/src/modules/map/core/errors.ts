import type { MapEngineType } from './map-engine.types';

export class MapEngineError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class MapEngineNotRegisteredError extends MapEngineError {
  readonly requestedType: MapEngineType;
  readonly availableTypes: readonly MapEngineType[];

  constructor(requestedType: MapEngineType, availableTypes: readonly MapEngineType[]) {
    super(
      `Map engine "${requestedType}" is not registered. ` +
        `Available: [${availableTypes.join(', ') || '<none>'}].`,
    );
    this.requestedType = requestedType;
    this.availableTypes = availableTypes;
  }
}

export class AdapterNotInitializedError extends MapEngineError {
  readonly engineType: MapEngineType;
  readonly operation: string;

  constructor(engineType: MapEngineType, operation: string) {
    super(`Cannot perform "${operation}" on ${engineType} adapter: not initialized.`);
    this.engineType = engineType;
    this.operation = operation;
  }
}

export class AdapterDisposedError extends MapEngineError {
  readonly engineType: MapEngineType;
  readonly operation: string;

  constructor(engineType: MapEngineType, operation: string) {
    super(`Cannot perform "${operation}" on ${engineType} adapter: already disposed.`);
    this.engineType = engineType;
    this.operation = operation;
  }
}

export class EngineSwapInProgressError extends MapEngineError {
  readonly fromType: MapEngineType;
  readonly toType: MapEngineType;

  constructor(fromType: MapEngineType, toType: MapEngineType) {
    super(`Engine swap from "${fromType}" to "${toType}" is already in progress.`);
    this.fromType = fromType;
    this.toType = toType;
  }
}

export class ContainerNotAttachedError extends MapEngineError {
  readonly operation: string;

  constructor(operation: string) {
    super(`Cannot perform "${operation}": no DOM container attached.`);
    this.operation = operation;
  }
}
