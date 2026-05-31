import { ColorBlockJamConfig } from "../ColorBlockJamConfig.js";
import type { LevelDescriptor } from "../constants/LevelSchema.js";

/**
 * Tracks which level is currently loaded. Purely state — no side effects,
 * no rendering. Controllers call {@link advance} / {@link reset} in
 * response to win-popup buttons and then orchestrate the rebuild through
 * {@link GameOperations.buildLevel} + {@link IBoardView.buildBoard}.
 *
 * Manager rather than a pure rules class because it owns mutable state
 * that outlives a single controller method.
 *
 * Construction takes the config directly rather than relying on
 * `IInjectionTarget.inject` — `DIContainer.bindInstance` doesn't fire
 * `inject()` (see ISSUES.md A1), so depending on field-injection here
 * would leave `_config` undefined at first use.
 */
export class LevelManager {
  private readonly _config: ColorBlockJamConfig;
  private _index = 0;

  public constructor(config: ColorBlockJamConfig) {
    this._config = config;
  }

  public get index(): number {
    return this._index;
  }

  /** 1-based display number for HUDs / popups. */
  public get displayNumber(): number {
    return this._index + 1;
  }

  public get total(): number {
    return this._config.levels.length;
  }

  public get current(): LevelDescriptor {
    const level = this._config.levels[this._index];
    if (!level) throw new Error(`LevelManager: no level at index ${this._index}`);
    return level;
  }

  public get isLast(): boolean {
    return this._index >= this._config.levels.length - 1;
  }

  public setIndex(index: number): void {
    if (index < 0 || index >= this._config.levels.length) {
      throw new Error(`LevelManager: index ${index} out of range`);
    }
    this._index = index;
  }

  /**
   * Advances to the next level. Wraps to the first level when called on
   * the last level — callers are expected to surface the "game complete"
   * state through the win popup before this wrap happens.
   */
  public advance(): void {
    this._index = (this._index + 1) % this._config.levels.length;
  }

  public reset(): void {
    this._index = 0;
  }
}
