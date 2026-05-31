/**
 * World-space positions of the bomb / fireball HUD buttons. Bound on
 * the view DI container by `BubbleShooterApp`; the App writes the
 * values from `_layoutPowerUpButtons` (converting button screen-pixel
 * offsets to world coords using the live ortho `pxPerWorld`), and
 * `PowerUpCollectionView` reads them as the destination of a
 * collection flight.
 *
 * The buttons themselves render in HUD pixel space (`OnScreenControlsView`)
 * — these world positions are projections of the button centres into
 * the world coordinate system the bubble grid renders in, so an icon
 * starting at a grid cell can fly to the right spot in the same scene.
 */
export class PowerUpButtonTargets {
  private _bombX = 0;
  private _bombY = 0;
  private _fireballX = 0;
  private _fireballY = 0;

  public setBombTarget(x: number, y: number): void {
    this._bombX = x;
    this._bombY = y;
  }

  public setFireballTarget(x: number, y: number): void {
    this._fireballX = x;
    this._fireballY = y;
  }

  public get bombX(): number {
    return this._bombX;
  }
  public get bombY(): number {
    return this._bombY;
  }
  public get fireballX(): number {
    return this._fireballX;
  }
  public get fireballY(): number {
    return this._fireballY;
  }
}
