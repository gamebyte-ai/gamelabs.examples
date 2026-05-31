import type { Unsubscribe } from "@gamebyte/gamelabsjs";

export class GameEvents {
  private readonly _gameOverListeners = new Set<(wave: number) => void>();
  private readonly _waveStartedListeners = new Set<(wave: number) => void>();
  private readonly _restartListeners = new Set<() => void>();
  private readonly _waveAnnounceEndedListeners = new Set<() => void>();
  private readonly _directionInputListeners = new Set<(dx: number, dy: number) => void>();

  public onGameOver(cb: (wave: number) => void): Unsubscribe {
    this._gameOverListeners.add(cb);
    return () => this._gameOverListeners.delete(cb);
  }

  public emitGameOver(wave: number): void {
    for (const cb of this._gameOverListeners) cb(wave);
  }

  public onWaveStarted(cb: (wave: number) => void): Unsubscribe {
    this._waveStartedListeners.add(cb);
    return () => this._waveStartedListeners.delete(cb);
  }

  public emitWaveStarted(wave: number): void {
    for (const cb of this._waveStartedListeners) cb(wave);
  }

  public onRestart(cb: () => void): Unsubscribe {
    this._restartListeners.add(cb);
    return () => this._restartListeners.delete(cb);
  }

  public emitRestart(): void {
    for (const cb of this._restartListeners) cb();
  }

  public onWaveAnnounceEnded(cb: () => void): Unsubscribe {
    this._waveAnnounceEndedListeners.add(cb);
    return () => this._waveAnnounceEndedListeners.delete(cb);
  }

  public emitWaveAnnounceEnded(): void {
    for (const cb of this._waveAnnounceEndedListeners) cb();
  }

  public onDirectionInput(cb: (dx: number, dy: number) => void): Unsubscribe {
    this._directionInputListeners.add(cb);
    return () => this._directionInputListeners.delete(cb);
  }

  public emitDirectionInput(dx: number, dy: number): void {
    for (const cb of this._directionInputListeners) cb(dx, dy);
  }

  private readonly _slowAbilityChangedListeners = new Set<(enabled: boolean) => void>();

  /** Fires when the slow ability becomes ready (true) or unavailable (false — active or cooling down). */
  public onSlowAbilityChanged(cb: (enabled: boolean) => void): Unsubscribe {
    this._slowAbilityChangedListeners.add(cb);
    return () => this._slowAbilityChangedListeners.delete(cb);
  }

  public emitSlowAbilityChanged(enabled: boolean): void {
    for (const cb of this._slowAbilityChangedListeners) cb(enabled);
  }

  private readonly _slowAbilityProgressListeners = new Set<(t: number) => void>();

  /**
   * Fires while the slow ability is recharging (active + cooldown).
   * `t` ramps 0 → 1 across the disabled period — 0 right after
   * activation, 1 the moment the ability returns to ready.
   */
  public onSlowAbilityProgressChanged(cb: (t: number) => void): Unsubscribe {
    this._slowAbilityProgressListeners.add(cb);
    return () => this._slowAbilityProgressListeners.delete(cb);
  }

  public emitSlowAbilityProgressChanged(t: number): void {
    for (const cb of this._slowAbilityProgressListeners) cb(t);
  }

  private readonly _collisionListeners = new Set<(x: number, y: number) => void>();

  /** Fires once when the player hits an enemy, before `onGameOver`. Position is the player's location at impact. */
  public onCollision(cb: (x: number, y: number) => void): Unsubscribe {
    this._collisionListeners.add(cb);
    return () => this._collisionListeners.delete(cb);
  }

  public emitCollision(x: number, y: number): void {
    for (const cb of this._collisionListeners) cb(x, y);
  }
}
