import type { Unsubscribe } from "@gamebyte/gamelabsjs";

export class GameEvents {
  private readonly _changeCubeColorListeners = new Set<(hex: number) => void>();
  private readonly _toggleCubeRotationListeners = new Set<() => void>();

  public onChangeCubeColor(cb: (hex: number) => void): Unsubscribe {
    this._changeCubeColorListeners.add(cb);
    return () => this._changeCubeColorListeners.delete(cb);
  }

  public emitChangeCubeColor(hex: number): void {
    for (const cb of this._changeCubeColorListeners) cb(hex);
  }

  public onToggleCubeRotation(cb: () => void): Unsubscribe {
    this._toggleCubeRotationListeners.add(cb);
    return () => this._toggleCubeRotationListeners.delete(cb);
  }

  public emitToggleCubeRotation(): void {
    for (const cb of this._toggleCubeRotationListeners) cb();
  }
}
