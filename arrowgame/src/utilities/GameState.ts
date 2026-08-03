import { Direction, DIRECTION_DELTA, type ArrowDef, type Cell, type LevelDef } from "../constants/GameTypes";

/** Runtime state of a single block on the board. */
export interface ArrowState {
  readonly id: number;
  /** Ordered occupied cells [head, ..., tail]. head = cells[0] carries the arrow. */
  cells: Cell[];
  readonly direction: Direction;
  readonly colorIndex: number;
  removed: boolean;
}

/** Read-only view of the game state, exposed to the controller. */
export interface IGameState {
  readonly levelIndex: number;
  readonly cols: number;
  readonly rows: number;
  readonly arrows: readonly ArrowState[];
  readonly remaining: number;
  getArrow(id: number): ArrowState | undefined;
  /** True if every cell in the block's arrow direction to the edge is empty. */
  canSlide(id: number): boolean;
}

/**
 * Owns mutable puzzle state and the core slide-legality rule.
 * No THREE/PIXI dependency — pure logic (unit-testable).
 */
export class GameState implements IGameState {
  private _levelIndex = 0;
  private _cols = 0;
  private _rows = 0;
  private _arrows: ArrowState[] = [];
  private _nextId = 0;

  public get levelIndex(): number {
    return this._levelIndex;
  }
  public get cols(): number {
    return this._cols;
  }
  public get rows(): number {
    return this._rows;
  }
  public get arrows(): readonly ArrowState[] {
    return this._arrows;
  }
  public get remaining(): number {
    return this._arrows.filter((b) => !b.removed).length;
  }

  public loadLevel(level: LevelDef, levelIndex: number): void {
    this._levelIndex = levelIndex;
    this._cols = level.cols;
    this._rows = level.rows;
    this._nextId = 0;
    this._arrows = level.arrows.map((def: ArrowDef) => ({
      id: this._nextId++,
      cells: def.cells.map((c) => ({ col: c.col, row: c.row })),
      direction: def.direction,
      colorIndex: def.colorIndex,
      removed: false,
    }));
  }

  public getArrow(id: number): ArrowState | undefined {
    return this._arrows.find((b) => b.id === id);
  }

  /** Is a given cell occupied by ANY non-removed block other than exceptId? */
  private isOccupied(col: number, row: number, exceptId: number): boolean {
    return this._arrows.some(
      (b) => !b.removed && b.id !== exceptId && b.cells.some((c) => c.col === col && c.row === row),
    );
  }

  /**
   * A rope can slide out iff the straight ray from its HEAD, in the arrow
   * direction, is clear of OTHER arrows all the way to the board edge. The
   * rope's own body cells don't block — as the head advances, the body follows
   * through the head's path (snake), so own cells are ignored on the ray.
   */
  public canSlide(id: number): boolean {
    const block = this.getArrow(id);
    if (!block || block.removed) return false;

    const head = block.cells[0];
    const delta = DIRECTION_DELTA[block.direction];
    let col = head.col + delta.col;
    let row = head.row + delta.row;

    while (col >= 0 && col < this._cols && row >= 0 && row < this._rows) {
      if (this.isOccupied(col, row, id)) return false;
      col += delta.col;
      row += delta.row;
    }
    return true;
  }

  /**
   * How many EMPTY cells the head can advance before hitting an obstacle, when
   * the arrow is blocked (canSlide === false). 0 = obstacle is adjacent (no gap).
   * Used for the "nudge into the gap, flash red, return" feedback.
   */
  public blockedAdvance(id: number): number {
    const arrow = this.getArrow(id);
    if (!arrow || arrow.removed) return 0;

    const head = arrow.cells[0];
    const delta = DIRECTION_DELTA[arrow.direction];
    let col = head.col + delta.col;
    let row = head.row + delta.row;
    let free = 0;

    while (col >= 0 && col < this._cols && row >= 0 && row < this._rows) {
      if (this.isOccupied(col, row, id)) return free; // hit the obstacle
      free++;
      col += delta.col;
      row += delta.row;
    }
    return free; // reached the edge with no obstacle (would be a valid slide)
  }

  /**
   * Id of the FIRST arrow blocking this arrow's head ray (the obstacle it would
   * hit), or -1 if none. Used to make the obstacle react (shake + red blink).
   */
  public blockedObstacleId(id: number): number {
    const arrow = this.getArrow(id);
    if (!arrow || arrow.removed) return -1;

    const head = arrow.cells[0];
    const d = DIRECTION_DELTA[arrow.direction];
    let col = head.col + d.col;
    let row = head.row + d.row;

    while (col >= 0 && col < this._cols && row >= 0 && row < this._rows) {
      const hit = this._arrows.find(
        (b) => !b.removed && b.id !== id && b.cells.some((c) => c.col === col && c.row === row),
      );
      if (hit) return hit.id;
      col += d.col;
      row += d.row;
    }
    return -1;
  }

  /** Mark a block as removed (after its slide animation completes). Returns remaining count. */
  public removeArrow(id: number): number {
    const block = this.getArrow(id);
    if (block) block.removed = true;
    return this.remaining;
  }
}
