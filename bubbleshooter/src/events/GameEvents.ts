import type { Unsubscribe } from "@gamebyte/gamelabsjs";
import type { BubbleColor } from "../constants/BubbleColor";
import type { PowerUpKind } from "../constants/PowerUpKind";
import type { IAimTrajectory } from "../models/IAimTrajectory";

type BubblePlacedCb = (row: number, col: number, color: BubbleColor) => void;
type BubbleRemovedCb = (row: number, col: number) => void;
type ShooterColorCb = (color: BubbleColor | null) => void;
type ShooterAimCb = (angle: number) => void;
type AimTrajectoryCb = (trajectory: IAimTrajectory) => void;
type FlyingBubbleCb = (color: BubbleColor | null, x: number, y: number) => void;
type BubblePoppedCb = (x: number, y: number, color: BubbleColor, points: number) => void;
type FallingBubbleCb = (id: number, color: BubbleColor | null, x: number, y: number) => void;
type ScoreCb = (value: number) => void;
type BoolCb = (active: boolean) => void;
type FlyingBombCb = (active: boolean, x: number, y: number) => void;
type FireballCb = (active: boolean, x: number, y: number) => void;
type CountCb = (count: number) => void;
type GameWonCb = (won: boolean) => void;
type GameOverCb = (over: boolean) => void;
type ControlsLockedCb = (locked: boolean) => void;
type PowerUpAvailabilityCb = (bombEnabled: boolean, fireballEnabled: boolean) => void;
type ShooterSwapCb = (newHeld: BubbleColor, newNext: BubbleColor) => void;
type VoidCb = () => void;
type CellCb = (row: number, col: number) => void;
type RowsCb = (rows: number) => void;

type PowerUpCollectedCb = (kind: PowerUpKind, fromX: number, fromY: number) => void;

export class GameEvents {
  private readonly _bubblePlacedListeners = new Set<BubblePlacedCb>();
  private readonly _bubbleRemovedListeners = new Set<BubbleRemovedCb>();
  private readonly _shooterColorListeners = new Set<ShooterColorCb>();
  private readonly _shooterNextColorListeners = new Set<ShooterColorCb>();
  private readonly _shooterAimListeners = new Set<ShooterAimCb>();
  private readonly _aimTrajectoryListeners = new Set<AimTrajectoryCb>();
  private readonly _flyingBubbleListeners = new Set<FlyingBubbleCb>();
  private readonly _bubblePoppedListeners = new Set<BubblePoppedCb>();
  private readonly _fallingBubbleListeners = new Set<FallingBubbleCb>();
  private readonly _scoreListeners = new Set<ScoreCb>();
  private readonly _shooterBombListeners = new Set<BoolCb>();
  private readonly _flyingBombListeners = new Set<FlyingBombCb>();
  private readonly _bombCountListeners = new Set<CountCb>();
  private readonly _shooterFireballListeners = new Set<BoolCb>();
  private readonly _fireballListeners = new Set<FireballCb>();
  private readonly _fireballCountListeners = new Set<CountCb>();
  private readonly _gameWonListeners = new Set<GameWonCb>();
  private readonly _gameOverListeners = new Set<GameOverCb>();
  private readonly _controlsLockedListeners = new Set<ControlsLockedCb>();
  private readonly _powerUpAvailabilityListeners = new Set<PowerUpAvailabilityCb>();
  private readonly _aimPowerUpModeListeners = new Set<BoolCb>();
  private readonly _shooterSwapListeners = new Set<ShooterSwapCb>();
  private readonly _bubbleShotFiredListeners = new Set<VoidCb>();
  private readonly _bombExplodedListeners = new Set<VoidCb>();
  private readonly _fireballFiredListeners = new Set<VoidCb>();
  private readonly _bubbleSnappedListeners = new Set<CellCb>();
  private readonly _layoutChangedListeners = new Set<VoidCb>();
  private readonly _gridDescendedListeners = new Set<RowsCb>();
  private readonly _powerUpCollectedListeners = new Set<PowerUpCollectedCb>();
  private readonly _aimAidVisibleListeners = new Set<BoolCb>();

  public onBubblePlaced(cb: BubblePlacedCb): Unsubscribe {
    this._bubblePlacedListeners.add(cb);
    return () => this._bubblePlacedListeners.delete(cb);
  }

  public emitBubblePlaced(row: number, col: number, color: BubbleColor): void {
    for (const cb of this._bubblePlacedListeners) cb(row, col, color);
  }

  public onBubbleRemoved(cb: BubbleRemovedCb): Unsubscribe {
    this._bubbleRemovedListeners.add(cb);
    return () => this._bubbleRemovedListeners.delete(cb);
  }

  public emitBubbleRemoved(row: number, col: number): void {
    for (const cb of this._bubbleRemovedListeners) cb(row, col);
  }

  public onShooterColorChanged(cb: ShooterColorCb): Unsubscribe {
    this._shooterColorListeners.add(cb);
    return () => this._shooterColorListeners.delete(cb);
  }

  public emitShooterColorChanged(color: BubbleColor | null): void {
    for (const cb of this._shooterColorListeners) cb(color);
  }

  public onShooterNextColorChanged(cb: ShooterColorCb): Unsubscribe {
    this._shooterNextColorListeners.add(cb);
    return () => this._shooterNextColorListeners.delete(cb);
  }

  public emitShooterNextColorChanged(color: BubbleColor | null): void {
    for (const cb of this._shooterNextColorListeners) cb(color);
  }

  public onShooterAimChanged(cb: ShooterAimCb): Unsubscribe {
    this._shooterAimListeners.add(cb);
    return () => this._shooterAimListeners.delete(cb);
  }

  public emitShooterAimChanged(angle: number): void {
    for (const cb of this._shooterAimListeners) cb(angle);
  }

  public onAimTrajectoryChanged(cb: AimTrajectoryCb): Unsubscribe {
    this._aimTrajectoryListeners.add(cb);
    return () => this._aimTrajectoryListeners.delete(cb);
  }

  public emitAimTrajectoryChanged(trajectory: IAimTrajectory): void {
    for (const cb of this._aimTrajectoryListeners) cb(trajectory);
  }

  public onFlyingBubbleChanged(cb: FlyingBubbleCb): Unsubscribe {
    this._flyingBubbleListeners.add(cb);
    return () => this._flyingBubbleListeners.delete(cb);
  }

  public emitFlyingBubbleChanged(color: BubbleColor | null, x: number, y: number): void {
    for (const cb of this._flyingBubbleListeners) cb(color, x, y);
  }

  /**
   * A bubble popped — used by the view to drive the particle-burst
   * animation. Carries world coordinates so it works for both cluster
   * pops (`x`, `y` resolved from grid cell) and falling-bubble pops
   * (`x`, `y` taken from the bubble's mid-air position).
   *
   * For cluster pops, fires *in addition to* `onBubbleRemoved` so the
   * view can split visual concerns from the grid mutation.
   */
  public onBubblePopped(cb: BubblePoppedCb): Unsubscribe {
    this._bubblePoppedListeners.add(cb);
    return () => this._bubblePoppedListeners.delete(cb);
  }

  public emitBubblePopped(x: number, y: number, color: BubbleColor, points: number): void {
    for (const cb of this._bubblePoppedListeners) cb(x, y, color, points);
  }

  /**
   * Falling-bubble lifecycle. `color !== null` means spawn-or-update at
   * `(x, y)`; `color === null` means the falling bubble is gone (popped
   * at the threshold or otherwise) and the view should remove its mesh.
   */
  public onFallingBubbleChanged(cb: FallingBubbleCb): Unsubscribe {
    this._fallingBubbleListeners.add(cb);
    return () => this._fallingBubbleListeners.delete(cb);
  }

  public emitFallingBubbleChanged(id: number, color: BubbleColor | null, x: number, y: number): void {
    for (const cb of this._fallingBubbleListeners) cb(id, color, x, y);
  }

  public onScoreChanged(cb: ScoreCb): Unsubscribe {
    this._scoreListeners.add(cb);
    return () => this._scoreListeners.delete(cb);
  }

  public emitScoreChanged(value: number): void {
    for (const cb of this._scoreListeners) cb(value);
  }

  /** Bomb power-up loaded into the shooter's held slot. */
  public onShooterBombChanged(cb: BoolCb): Unsubscribe {
    this._shooterBombListeners.add(cb);
    return () => this._shooterBombListeners.delete(cb);
  }

  public emitShooterBombChanged(active: boolean): void {
    for (const cb of this._shooterBombListeners) cb(active);
  }

  /** Bomb mid-flight. Same lifecycle as `onFlyingBubbleChanged` but for bombs. */
  public onFlyingBombChanged(cb: FlyingBombCb): Unsubscribe {
    this._flyingBombListeners.add(cb);
    return () => this._flyingBombListeners.delete(cb);
  }

  public emitFlyingBombChanged(active: boolean, x: number, y: number): void {
    for (const cb of this._flyingBombListeners) cb(active, x, y);
  }

  /** Remaining bomb power-ups in the player's inventory. */
  public onBombCountChanged(cb: CountCb): Unsubscribe {
    this._bombCountListeners.add(cb);
    return () => this._bombCountListeners.delete(cb);
  }

  public emitBombCountChanged(count: number): void {
    for (const cb of this._bombCountListeners) cb(count);
  }

  /** Fireball power-up loaded into the shooter's held slot. */
  public onShooterFireballChanged(cb: BoolCb): Unsubscribe {
    this._shooterFireballListeners.add(cb);
    return () => this._shooterFireballListeners.delete(cb);
  }

  public emitShooterFireballChanged(active: boolean): void {
    for (const cb of this._shooterFireballListeners) cb(active);
  }

  /** Fireball mid-flight. Straight-line motion; `active=false` ends the visual. */
  public onFireballChanged(cb: FireballCb): Unsubscribe {
    this._fireballListeners.add(cb);
    return () => this._fireballListeners.delete(cb);
  }

  public emitFireballChanged(active: boolean, x: number, y: number): void {
    for (const cb of this._fireballListeners) cb(active, x, y);
  }

  /** Remaining fireball power-ups in the player's inventory. */
  public onFireballCountChanged(cb: CountCb): Unsubscribe {
    this._fireballCountListeners.add(cb);
    return () => this._fireballCountListeners.delete(cb);
  }

  public emitFireballCountChanged(count: number): void {
    for (const cb of this._fireballCountListeners) cb(count);
  }

  /** Game-won state. Fires `true` when the grid is fully cleared, `false` on level reset. */
  public onGameWonChanged(cb: GameWonCb): Unsubscribe {
    this._gameWonListeners.add(cb);
    return () => this._gameWonListeners.delete(cb);
  }

  public emitGameWonChanged(won: boolean): void {
    for (const cb of this._gameWonListeners) cb(won);
  }

  /**
   * Game-over state. Fires `true` when any bubble reaches shooter
   * level; mutually exclusive with the win flow. Fires `false` on
   * level reset.
   */
  public onGameOverChanged(cb: GameOverCb): Unsubscribe {
    this._gameOverListeners.add(cb);
    return () => this._gameOverListeners.delete(cb);
  }

  public emitGameOverChanged(over: boolean): void {
    for (const cb of this._gameOverListeners) cb(over);
  }

  /**
   * Power-up controls lock. Fires `true` the moment the grid empties
   * (well before the win message is allowed to show), so the UI can
   * disable bomb / fireball buttons during the fall-out wait. Fires
   * `false` on level reset.
   */
  public onShooterControlsLocked(cb: ControlsLockedCb): Unsubscribe {
    this._controlsLockedListeners.add(cb);
    return () => this._controlsLockedListeners.delete(cb);
  }

  public emitShooterControlsLocked(locked: boolean): void {
    for (const cb of this._controlsLockedListeners) cb(locked);
  }

  /**
   * Combined enable/disable signal for the bomb + fireball power-up
   * buttons. Drives the screen controller's `setControlEnabled` calls
   * directly, so the controller doesn't have to mirror inventory or
   * lock state. Emitted on every count change or lock transition.
   */
  public onPowerUpAvailabilityChanged(cb: PowerUpAvailabilityCb): Unsubscribe {
    this._powerUpAvailabilityListeners.add(cb);
    return () => this._powerUpAvailabilityListeners.delete(cb);
  }

  public emitPowerUpAvailabilityChanged(bombEnabled: boolean, fireballEnabled: boolean): void {
    for (const cb of this._powerUpAvailabilityListeners) cb(bombEnabled, fireballEnabled);
  }

  /**
   * Combined "any power-up loaded into the held slot" signal — the
   * OR of bomb-mode and fireball-mode. Drives the aim line's red /
   * white tint without having a controller mirror the two booleans.
   */
  public onAimPowerUpModeChanged(cb: BoolCb): Unsubscribe {
    this._aimPowerUpModeListeners.add(cb);
    return () => this._aimPowerUpModeListeners.delete(cb);
  }

  public emitAimPowerUpModeChanged(active: boolean): void {
    for (const cb of this._aimPowerUpModeListeners) cb(active);
  }

  /**
   * Held ↔ next swap. Driven by `swap()`; carries the new (post-swap)
   * colours so the view can run a position-swap animation and apply
   * the materials at the end. Standard `onShooterColorChanged` /
   * `onShooterNextColorChanged` events are NOT emitted during a swap —
   * the view handles material updates atomically as part of the
   * animation finalisation.
   */
  public onShooterSwap(cb: ShooterSwapCb): Unsubscribe {
    this._shooterSwapListeners.add(cb);
    return () => this._shooterSwapListeners.delete(cb);
  }

  public emitShooterSwap(newHeld: BubbleColor, newNext: BubbleColor): void {
    for (const cb of this._shooterSwapListeners) cb(newHeld, newNext);
  }

  /** A regular (non-power-up) bubble was just fired. Cue the shoot SFX. */
  public onBubbleShotFired(cb: VoidCb): Unsubscribe {
    this._bubbleShotFiredListeners.add(cb);
    return () => this._bubbleShotFiredListeners.delete(cb);
  }

  public emitBubbleShotFired(): void {
    for (const cb of this._bubbleShotFiredListeners) cb();
  }

  /** A bomb has just detonated at its landing cell. Cue the boom SFX. */
  public onBombExploded(cb: VoidCb): Unsubscribe {
    this._bombExplodedListeners.add(cb);
    return () => this._bombExplodedListeners.delete(cb);
  }

  public emitBombExploded(): void {
    for (const cb of this._bombExplodedListeners) cb();
  }

  /** A fireball has just been launched. Cue the hissy whoosh SFX. */
  public onFireballFired(cb: VoidCb): Unsubscribe {
    this._fireballFiredListeners.add(cb);
    return () => this._fireballFiredListeners.delete(cb);
  }

  public emitFireballFired(): void {
    for (const cb of this._fireballFiredListeners) cb();
  }

  /**
   * A fired bubble has just settled into its landing cell (non-bomb
   * snap). Cues the tink SFX and the neighbour-shake animation;
   * carries the snapped cell so listeners can find the neighbours.
   * Distinct from `onBubblePlaced` so initial level layout doesn't
   * fire a snap per cell.
   */
  public onBubbleSnapped(cb: CellCb): Unsubscribe {
    this._bubbleSnappedListeners.add(cb);
    return () => this._bubbleSnappedListeners.delete(cb);
  }

  public emitBubbleSnapped(row: number, col: number): void {
    for (const cb of this._bubbleSnappedListeners) cb(row, col);
  }

  /**
   * The play-area layout has changed (e.g. a new level applied a
   * different `wideRowColumns`). Listeners rebuild any geometry
   * whose vertex data depends on layout dimensions: the play-area
   * chrome, cell outlines, camera fit, HUD positioning anchored to
   * the play area's corners. The grid model + bubble meshes are
   * cleared via the standard `onBubbleRemoved` pipeline before this
   * event fires.
   */
  public onLayoutChanged(cb: VoidCb): Unsubscribe {
    this._layoutChangedListeners.add(cb);
    return () => this._layoutChangedListeners.delete(cb);
  }

  public emitLayoutChanged(): void {
    for (const cb of this._layoutChangedListeners) cb();
  }

  /**
   * The grid origin has shifted vertically (descending-ceiling
   * mechanic). Carries the row count of the descent so the view
   * can stack a multi-row auto-descent into one continuous
   * animation. The grid model's row indices and chrome dimensions
   * are unchanged; only the world Y of each cluster cell moves.
   * The bubble grid view repositions its meshes; trajectory and
   * loss-check pick up the new positions on their next read.
   */
  public onGridDescended(cb: RowsCb): Unsubscribe {
    this._gridDescendedListeners.add(cb);
    return () => this._gridDescendedListeners.delete(cb);
  }

  public emitGridDescended(rows: number): void {
    for (const cb of this._gridDescendedListeners) cb(rows);
  }

  /**
   * A power-up bubble has just left the grid and started its flight
   * to the matching HUD button. Carries the world-space cell origin
   * so the view can spawn an icon there and animate it toward the
   * button. The model defers its inventory bump (and the matching
   * `onBombCountChanged` / `onFireballCountChanged` event) until the
   * animation duration elapses, so the button's badge ticks up
   * exactly when the icon visually arrives.
   */
  public onPowerUpCollected(cb: PowerUpCollectedCb): Unsubscribe {
    this._powerUpCollectedListeners.add(cb);
    return () => this._powerUpCollectedListeners.delete(cb);
  }

  public emitPowerUpCollected(kind: PowerUpKind, fromX: number, fromY: number): void {
    for (const cb of this._powerUpCollectedListeners) cb(kind, fromX, fromY);
  }

  /**
   * Aim-aid toggle. `true` shows the marching dotted aim line +
   * landing-preview ring, `false` hides them. Default is hidden —
   * the player opts in via the bottom-left target button.
   */
  public onAimAidVisibleChanged(cb: BoolCb): Unsubscribe {
    this._aimAidVisibleListeners.add(cb);
    return () => this._aimAidVisibleListeners.delete(cb);
  }

  public emitAimAidVisibleChanged(visible: boolean): void {
    for (const cb of this._aimAidVisibleListeners) cb(visible);
  }
}
