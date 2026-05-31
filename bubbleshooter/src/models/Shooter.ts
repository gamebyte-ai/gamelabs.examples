import type { BubbleColor } from "../constants/BubbleColor";
import type { IShooter } from "./IShooter";

/**
 * Mutable shooter state: held bubble colour, next bubble colour (preview
 * slot beside the shooter), and current aim angle.
 *
 * Aim is stored as the world-frame angle of the firing direction
 * (radians, measured from +x). `π/2` means straight up; values are
 * clamped by `GameOperations.aimAt` so the shot never points
 * horizontally or down.
 *
 * Concrete writers go through this class; reading callers should
 * resolve {@link IShooter} from DI to keep state read-only outside
 * `utilities/`.
 */
export class Shooter implements IShooter {
  private _heldColor: BubbleColor | null = null;
  private _nextColor: BubbleColor | null = null;
  private _aimAngle: number = Math.PI / 2;
  private _isBomb: boolean = false;
  private _isFireball: boolean = false;

  public get heldColor(): BubbleColor | null {
    return this._heldColor;
  }

  public get nextColor(): BubbleColor | null {
    return this._nextColor;
  }

  public get aimAngle(): number {
    return this._aimAngle;
  }

  public get isBomb(): boolean {
    return this._isBomb;
  }

  public get isFireball(): boolean {
    return this._isFireball;
  }

  public setHeldColor(color: BubbleColor | null): void {
    this._heldColor = color;
  }

  public setNextColor(color: BubbleColor | null): void {
    this._nextColor = color;
  }

  public setAimAngle(angle: number): void {
    this._aimAngle = angle;
  }

  public setIsBomb(isBomb: boolean): void {
    this._isBomb = isBomb;
  }

  public setIsFireball(isFireball: boolean): void {
    this._isFireball = isFireball;
  }
}
