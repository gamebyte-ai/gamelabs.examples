import type { Unsubscribe } from "@gamebyte/gamelabsjs";
import { BoosterPanelState } from "../constants/BoosterPanelState";
import type { BoosterType } from "../constants/BoosterType";

/**
 * State + transition rules for the bottom-of-screen booster panel.
 *
 * Three-state machine ({@link BoosterPanelState}). `stagesFilled`
 * counts how far the charge bar has filled — caps at `stagesPerCharge`,
 * one per cleared row or column. `selectedBooster` is non-null only
 * while in Selecting (set by {@link selectBooster}, cleared by
 * {@link cancelSelection} and {@link consume}).
 *
 * Transitions:
 *
 * - {@link registerClear}: while Charging, advances `stagesFilled`
 *   by `lines` capped at `stagesPerCharge`. On reaching the cap,
 *   flips to Ready. No-op in Ready / Selecting.
 * - {@link selectBooster}: Ready → Selecting with `selectedBooster
 *   = type`. No-op otherwise. Caller (HUD controller) only calls
 *   this for target-selection boosters; instant boosters go
 *   straight through {@link consume}.
 * - {@link cancelSelection}: Selecting → Ready, clears
 *   `selectedBooster`. No-op otherwise.
 * - {@link consume}: Ready (instant booster) OR Selecting (target
 *   booster's mechanic completed) → Charging with stages reset and
 *   `selectedBooster` cleared. No-op otherwise.
 *
 * Emits a single `onChange` notification per state-changing call;
 * idempotent transitions don't fire.
 */
export class BoosterPanelModel {
  private readonly _stagesPerCharge: number;
  private _state: BoosterPanelState = BoosterPanelState.Charging;
  private _stagesFilled = 0;
  private _selectedBooster: BoosterType | null = null;
  private readonly _listeners = new Set<(model: BoosterPanelModel) => void>();

  public constructor(
    stagesPerCharge: number,
    initialState: BoosterPanelState = BoosterPanelState.Charging,
    initialSelectedBooster: BoosterType | null = null,
  ) {
    this._stagesPerCharge = stagesPerCharge;
    this._state = initialState;
    this._selectedBooster = initialState === BoosterPanelState.Selecting ? initialSelectedBooster : null;
    // Starting in Ready or Selecting means the panel is already
    // visually "charged" — keep the bar in sync.
    if (initialState === BoosterPanelState.Ready || initialState === BoosterPanelState.Selecting) {
      this._stagesFilled = stagesPerCharge;
    }
  }

  public get state(): BoosterPanelState {
    return this._state;
  }

  public get stagesFilled(): number {
    return this._stagesFilled;
  }

  public get stagesPerCharge(): number {
    return this._stagesPerCharge;
  }

  public get selectedBooster(): BoosterType | null {
    return this._selectedBooster;
  }

  public registerClear(lines: number): void {
    if (this._state !== BoosterPanelState.Charging) return;
    if (lines <= 0) return;
    const prevState = this._state;
    const prevStages = this._stagesFilled;
    this._stagesFilled = Math.min(this._stagesPerCharge, this._stagesFilled + lines);
    if (this._stagesFilled >= this._stagesPerCharge) {
      this._state = BoosterPanelState.Ready;
    }
    if (this._state !== prevState || this._stagesFilled !== prevStages) {
      this.notify();
    }
  }

  /** Ready → Selecting with the given target-selection booster
   *  pending. No-op outside Ready. */
  public selectBooster(type: BoosterType): void {
    if (this._state !== BoosterPanelState.Ready) return;
    this._state = BoosterPanelState.Selecting;
    this._selectedBooster = type;
    this.notify();
  }

  /** Selecting → Ready. No-op outside Selecting. */
  public cancelSelection(): void {
    if (this._state !== BoosterPanelState.Selecting) return;
    this._state = BoosterPanelState.Ready;
    this._selectedBooster = null;
    this.notify();
  }

  /**
   * Consume the activation and reset the bar. Valid from both
   * Ready (instant boosters like TrayRefresh — skip Selecting
   * entirely) and Selecting (target-selection boosters whose
   * mechanic just completed). No-op otherwise.
   */
  public consume(): void {
    if (this._state !== BoosterPanelState.Ready && this._state !== BoosterPanelState.Selecting) return;
    this._state = BoosterPanelState.Charging;
    this._stagesFilled = 0;
    this._selectedBooster = null;
    this.notify();
  }

  public reset(): void {
    if (this._state === BoosterPanelState.Charging && this._stagesFilled === 0 && this._selectedBooster === null) {
      return;
    }
    this._state = BoosterPanelState.Charging;
    this._stagesFilled = 0;
    this._selectedBooster = null;
    this.notify();
  }

  public onChange(callback: (model: BoosterPanelModel) => void): Unsubscribe {
    this._listeners.add(callback);
    return () => {
      this._listeners.delete(callback);
    };
  }

  private notify(): void {
    for (const cb of this._listeners) cb(this);
  }
}
