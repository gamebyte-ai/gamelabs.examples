import { BubbleShooterConfig } from "../BubbleShooterConfig";

export interface IBubbleGridCellPosition {
  readonly x: number;
  readonly y: number;
}

export interface IBubbleGridNeighborOffset {
  readonly dRow: number;
  readonly dCol: number;
}

/**
 * Pure layout math for a classic Bubble Shooter offset-row grid.
 *
 * Even-indexed rows ("wide") hold {@link BubbleShooterConfig.wideRowColumns}
 * cells flush to the left wall. Odd-indexed rows ("narrow") hold one cell
 * fewer and are shifted right by a bubble radius so neighbouring bubbles
 * touch. Vertical pitch is `r * sqrt(3)` for tight packing.
 *
 * Coordinates returned by {@link getCellLocalPosition} are relative to the
 * grid's top-left corner with `+x` right and `+y` down. Callers are free to
 * map this into whatever world frame they use (e.g. flip `y` for Three.js).
 */
export class BubbleGridLayout {
  private readonly _config: BubbleShooterConfig;
  /**
   * Mutable per-level width. Defaults to the config value, but
   * `loadLevel` may swap it for a level-specific override (see
   * {@link ILevel.wideRowColumns}). All width-dependent getters
   * read this through, so updating it is enough to retune the
   * play-area width, side walls, camera fit, and trajectory bounds.
   */
  private _wideRowColumns: number;
  /**
   * Signed row count by which the grid origin is shifted from its
   * base Y. Negative = grid lifted ABOVE the base (rows hidden
   * above the viewport at level start); positive = grid descended
   * BELOW the base (every {@link BubbleShooterConfig.shotsPerDescend}
   * shots increments by one). All cell world Ys derive from the
   * resulting `gridOriginY`, so updating this is enough to scroll
   * the grid through the viewport.
   */
  private _descendOffsetRows = 0;

  public constructor(config: BubbleShooterConfig) {
    this._config = config;
    this._wideRowColumns = config.wideRowColumns;
  }

  public get bubbleRadius(): number {
    return this._config.bubbleRadius;
  }

  public get rowCount(): number {
    return this._config.rowCount;
  }

  public get rowPitch(): number {
    return this._config.bubbleRadius * Math.sqrt(3);
  }

  public get wideRowColumns(): number {
    return this._wideRowColumns;
  }

  /**
   * Apply a new wide-row column count. Layout dimensions, side-wall
   * positions, and per-cell world coordinates all update on the
   * next read. Callers must rebuild any geometry whose vertex data
   * depends on layout (the cluster grid model, the play-area
   * chrome, the cell outlines) after calling this.
   */
  public setWideRowColumns(wideRowColumns: number): void {
    this._wideRowColumns = wideRowColumns;
  }

  public get descendOffsetRows(): number {
    return this._descendOffsetRows;
  }

  /**
   * Apply a signed descend offset (in row units). Negative shifts
   * the grid up (hides upper rows above the viewport); positive
   * shifts it down (descents the grid through the play area). The
   * grid model's row indices are unchanged — only the world Y of
   * each cell shifts. Callers must reposition any rendered meshes
   * whose world position was captured at an earlier descend offset.
   */
  public setDescendOffsetRows(rows: number): void {
    this._descendOffsetRows = rows;
  }

  public get gridWidth(): number {
    return this._wideRowColumns * this._config.bubbleRadius * 2;
  }

  public get gridHeight(): number {
    // Sized to the VISIBLE row count, not the total grid row count.
    // The extra rows (rowCount > visibleRowCount) sit below the play
    // area's bottom edge so bubbles can stack past the lose line and
    // trigger loss without running out of valid landing cells first.
    const r = this._config.bubbleRadius;
    return r * 2 + (this._config.visibleRowCount - 1) * this.rowPitch;
  }

  public isWideRow(row: number): boolean {
    return row % 2 === 0;
  }

  public getColumnCount(row: number): number {
    return this.isWideRow(row) ? this._wideRowColumns : this._wideRowColumns - 1;
  }

  public getCellLocalPosition(row: number, col: number): IBubbleGridCellPosition {
    const r = this._config.bubbleRadius;
    const xOffset = this.isWideRow(row) ? r : 2 * r;
    return { x: xOffset + col * 2 * r, y: r + row * this.rowPitch };
  }

  /**
   * Six neighbour offsets in offset coordinates. The set depends on whether
   * `row` is wide or narrow because the row above/below is shifted relative
   * to it. The order is: left, right, upper-left, upper-right, lower-left,
   * lower-right.
   */
  public getNeighborOffsets(row: number): readonly IBubbleGridNeighborOffset[] {
    if (this.isWideRow(row)) {
      return [
        { dRow: 0, dCol: -1 },
        { dRow: 0, dCol: +1 },
        { dRow: -1, dCol: -1 },
        { dRow: -1, dCol: 0 },
        { dRow: +1, dCol: -1 },
        { dRow: +1, dCol: 0 },
      ];
    }
    return [
      { dRow: 0, dCol: -1 },
      { dRow: 0, dCol: +1 },
      { dRow: -1, dCol: 0 },
      { dRow: -1, dCol: +1 },
      { dRow: +1, dCol: 0 },
      { dRow: +1, dCol: +1 },
    ];
  }

  public isInBounds(row: number, col: number): boolean {
    if (row < 0 || row >= this._config.rowCount) return false;
    if (col < 0 || col >= this.getColumnCount(row)) return false;
    return true;
  }

  // ── Play-area / shooter geometry (world frame, +y up, origin centred) ──

  public get areaWidth(): number {
    return this.gridWidth + 2 * this._config.playAreaPaddingX;
  }

  public get areaHeight(): number {
    return this.gridHeight + this._config.playAreaPaddingTop + this._config.playAreaPaddingBottom;
  }

  public get halfAreaWidth(): number {
    return this.areaWidth / 2;
  }

  public get halfAreaHeight(): number {
    return this.areaHeight / 2;
  }

  /** World x of the grid's left edge (= leftmost-bubble centre minus a radius). */
  public get gridOriginX(): number {
    return -this.halfAreaWidth + this._config.playAreaPaddingX;
  }

  /**
   * World y of the grid's top edge. Includes the descending-ceiling
   * offset: a positive {@link descendOffsetRows} shifts the origin
   * down (grid descended), a negative one shifts it up (initial
   * hidden rows above the viewport).
   */
  public get gridOriginY(): number {
    return this.halfAreaHeight - this._config.playAreaPaddingTop - this._descendOffsetRows * this.rowPitch;
  }

  /**
   * World y of the lose line (just above the shooter). A bubble
   * whose centre y is at or below this line ends the game.
   */
  public get loseLineY(): number {
    return this.shooterY + this._config.loseLineDistanceFromShooter;
  }

  /** Effective wall x where a flying bubble's centre bounces. */
  public get leftWallX(): number {
    return -this.halfAreaWidth + this._config.bubbleRadius;
  }

  public get rightWallX(): number {
    return this.halfAreaWidth - this._config.bubbleRadius;
  }

  /** Effective wall y where a flying bubble's centre stops at the top. */
  public get topWallY(): number {
    return this.halfAreaHeight - this._config.bubbleRadius;
  }

  /**
   * Effective upper limit for a flying bubble's centre — the
   * grid's ceiling, i.e. row 0's centre Y. The viewport top wall
   * is purely a visual reference (the bubble's centre can travel
   * above it; the play-area clipping planes hide the part outside
   * the viewport). Only the ceiling is a physical barrier:
   * trajectory terminations + landing snaps both work against
   * this. Otherwise, when the grid sits above the viewport (the
   * initial-hidden-rows state), `_findLanding` would look for
   * connected cells near the viewport top and the row-0 cells
   * would sit far above it — `maxDist²` would reject them and
   * fire would silently fail.
   */
  public get effectiveTopWallY(): number {
    return this.gridOriginY - this._config.bubbleRadius;
  }

  public get shooterX(): number {
    return 0;
  }

  public get shooterY(): number {
    return -this.halfAreaHeight + this._config.shooterMarginFromBottom;
  }

  public get nextSlotX(): number {
    return this.shooterX + this._config.nextSlotOffsetX;
  }

  public get nextSlotY(): number {
    return this.shooterY + this._config.nextSlotOffsetY;
  }

  public getCellWorldPosition(row: number, col: number): IBubbleGridCellPosition {
    const local = this.getCellLocalPosition(row, col);
    return { x: this.gridOriginX + local.x, y: this.gridOriginY - local.y };
  }
}
