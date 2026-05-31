import type { IInjectionTarget, IInstanceResolver } from "@gamebyte/gamelabsjs";
import { BubbleShooterConfig } from "../BubbleShooterConfig";
import { IBubbleGrid } from "../models/IBubbleGrid";
import type { AimTrajectoryEnd } from "../constants/AimTrajectoryEnd";
import type { IAimLanding, IAimTrajectory, IAimTrajectorySegment } from "../models/IAimTrajectory";
import { BubbleGridLayout } from "./BubbleGridLayout";

interface ICellPos {
  readonly x: number;
  readonly y: number;
}

/**
 * Per-call options for {@link AimTrajectoryCalculator.compute}.
 *
 * The descending-ceiling mechanic places some grid rows above the
 * visible play area (off-screen). Regular bubbles must treat the
 * whole grid as collision space — otherwise a fired bubble would
 * snap to an empty cell below the cluster and end up floating
 * once the grid descends. Power-ups (bomb projectile, fireball)
 * only affect the visible play area, so they pass `onlyVisible`
 * to skip hidden cells in collision + landing.
 */
export interface IComputeTrajectoryOptions {
  readonly onlyVisible?: boolean;
  /**
   * When true, the landing snap is restricted to empty cells that
   * are in physical contact with the cluster — at least one
   * occupied hex neighbour, OR in row 0 (touching the grid's
   * ceiling). Used for regular bubbles so they can't snap to an
   * empty cell floating in the middle of nowhere; bombs / other
   * power-ups don't need adjacency and pass `false`.
   */
  readonly requireConnection?: boolean;
}

const EMPTY_TRAJECTORY: IAimTrajectory = { segments: [], end: "none", landing: null };

/**
 * Pure ray-cast solver for the aim line. Marches from the shooter tip in
 * the aim direction, reflecting off the side walls, terminating at the
 * top wall or the first cluster bubble it would touch (centre-to-centre
 * distance ≤ 2r).
 *
 * Bubble-cluster intersection is a standard ray vs. circle test against
 * each occupied cell, treating the obstacle as a circle of radius `2r`
 * centred on the cell (so the entry point coincides with where the
 * flying bubble would actually settle against its target).
 */
export class AimTrajectoryCalculator implements IInjectionTarget {
  private _config: BubbleShooterConfig | null = null;
  private _layout: BubbleGridLayout | null = null;
  private _grid: IBubbleGrid | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._config = resolver.getInstance(BubbleShooterConfig);
    this._layout = resolver.getInstance(BubbleGridLayout);
    this._grid = resolver.getInstance(IBubbleGrid);
  }

  /**
   * Straight-line aim preview for power-ups whose actual flight
   * doesn't bounce — currently the fireball, which plows through
   * the play area in a single straight line. Single segment from
   * the shooter tip to the first play-area edge the ray crosses;
   * no reflections, no landing snap (the projectile doesn't
   * settle into a cell). Uses the viewport `topWallY` rather
   * than the grid ceiling because fireballs travel through the
   * ceiling region and exit at the play-area top edge.
   */
  public computeStraightLine(angle: number): IAimTrajectory {
    const config = this._config;
    const layout = this._layout;
    if (!config || !layout) return EMPTY_TRAJECTORY;

    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    if (dirY <= 0) return EMPTY_TRAJECTORY;

    const posX = layout.shooterX + dirX * config.shooterRadius;
    const posY = layout.shooterY + dirY * config.shooterRadius;

    const wallHit = this._nearestWallHit(posX, posY, dirX, dirY, layout.leftWallX, layout.rightWallX, layout.topWallY);
    if (!wallHit) return EMPTY_TRAJECTORY;

    const segment: IAimTrajectorySegment = {
      fromX: posX,
      fromY: posY,
      toX: posX + dirX * wallHit.t,
      toY: posY + dirY * wallHit.t,
    };
    return {
      segments: [segment],
      end: wallHit.kind === "top" ? "top" : "max-bounces",
      landing: null,
    };
  }

  public compute(angle: number, options: IComputeTrajectoryOptions = {}): IAimTrajectory {
    const config = this._config;
    const layout = this._layout;
    const grid = this._grid;
    if (!config || !layout || !grid) return EMPTY_TRAJECTORY;
    const onlyVisible = options.onlyVisible ?? false;
    const requireConnection = options.requireConnection ?? false;

    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    if (dirY <= 0) return EMPTY_TRAJECTORY;

    let posX = layout.shooterX + dirX * config.shooterRadius;
    let posY = layout.shooterY + dirY * config.shooterRadius;

    let curDirX = dirX;
    let curDirY = dirY;

    const leftWall = layout.leftWallX;
    const rightWall = layout.rightWallX;
    // Once the grid's ceiling descends into the viewport it
    // becomes the effective upper limit instead of the viewport
    // top wall — the bubble can't go above the ceiling.
    const topWall = layout.effectiveTopWallY;
    // Shrink the centre-to-centre collision threshold by the configured
    // tolerance so the flying bubble can squeeze through gaps slightly
    // tighter than `2 · bubbleRadius`. Clamp at 0 so an over-large
    // tolerance can't turn collisions inside-out.
    const collisionRadius = Math.max(0, 2 * config.bubbleRadius - config.bubbleCollisionTolerance);
    const collisionR2 = collisionRadius * collisionRadius;

    const cells = this._snapshotOccupiedCells(grid, layout, onlyVisible);
    const segments: IAimTrajectorySegment[] = [];
    let end: AimTrajectoryEnd = "max-bounces";

    for (let bounce = 0; bounce <= config.aimMaxBounces; bounce++) {
      const wallHit = this._nearestWallHit(posX, posY, curDirX, curDirY, leftWall, rightWall, topWall);
      const bubbleHit = this._nearestBubbleHit(posX, posY, curDirX, curDirY, cells, collisionR2);

      let tHit = Infinity;
      let hitKind: "left" | "right" | "top" | "bubble" | "none" = "none";
      if (wallHit && wallHit.t < tHit) {
        tHit = wallHit.t;
        hitKind = wallHit.kind;
      }
      if (bubbleHit && bubbleHit.t < tHit) {
        tHit = bubbleHit.t;
        hitKind = "bubble";
      }
      if (hitKind === "none") {
        end = "max-bounces";
        break;
      }

      const endX = posX + curDirX * tHit;
      const endY = posY + curDirY * tHit;
      segments.push({ fromX: posX, fromY: posY, toX: endX, toY: endY });

      if (hitKind === "bubble") {
        end = "bubble";
        break;
      }
      if (hitKind === "top") {
        end = "top";
        break;
      }

      posX = endX;
      posY = endY;
      curDirX = -curDirX;
    }

    const landing = this._findLanding(segments, end, grid, layout, config.bubbleRadius, onlyVisible, requireConnection);
    return { segments, end, landing };
  }

  /**
   * Snap the trajectory's end point to the closest empty grid cell. Only
   * meaningful when the trajectory ended on a real obstacle ("top" or
   * "bubble"); otherwise the bubble wouldn't actually land anywhere.
   *
   * The closest *connected* empty cell wins, regardless of distance.
   * In typical hits the closest cell is well within one bubble
   * diameter, but narrow-grid wall-grazing contacts can wedge the
   * bubble against a column whose hex neighbours are all occupied or
   * off the grid (e.g. odd rows have one fewer column than even
   * rows, so col 7 in Level 2 has no `(odd, 7)` slot). In those
   * cases the closest connected empty slot can sit just past `2r` —
   * snapping there is still the right choice; otherwise `fire`
   * silently drops a shot the player aimed at a real obstacle.
   * Connectivity + empty-cell already gates pathological snaps.
   */
  private _findLanding(
    segments: readonly IAimTrajectorySegment[],
    endKind: AimTrajectoryEnd,
    grid: IBubbleGrid,
    layout: BubbleGridLayout,
    _bubbleRadius: number,
    onlyVisible: boolean,
    requireConnection: boolean,
  ): IAimLanding | null {
    if (segments.length === 0) return null;
    if (endKind !== "top" && endKind !== "bubble") return null;

    const last = segments[segments.length - 1]!;
    const endX = last.toX;
    const endY = last.toY;

    let bestDist2 = Infinity;
    let bestRow = -1;
    let bestCol = -1;
    let bestX = 0;
    let bestY = 0;

    // For regular bubbles (`onlyVisible = false`), the full grid is
    // valid landing space — the bubble travels up through empty
    // cells until it touches the cluster (visible or hidden). For
    // power-up projectiles (`onlyVisible = true`), hidden cells are
    // filtered so the bomb / fireball stays within the viewport.
    const visibleCutoff = layout.topWallY + layout.bubbleRadius;

    for (let row = 0; row < grid.rowCount; row++) {
      const colCount = grid.getColumnCount(row);
      for (let col = 0; col < colCount; col++) {
        if (grid.isOccupied(row, col)) continue;
        const pos = layout.getCellWorldPosition(row, col);
        if (onlyVisible && pos.y > visibleCutoff) continue;
        if (requireConnection && !this._isConnectedCell(row, col, grid, layout)) continue;
        const dx = pos.x - endX;
        const dy = pos.y - endY;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist2) {
          bestDist2 = d2;
          bestRow = row;
          bestCol = col;
          bestX = pos.x;
          bestY = pos.y;
        }
      }
    }

    if (bestRow === -1) return null;
    return { row: bestRow, col: bestCol, worldX: bestX, worldY: bestY };
  }

  /**
   * An empty cell is a valid landing for a regular bubble only if
   * it physically touches the cluster — at least one occupied
   * hex neighbour, OR sits in row 0 (the top of the grid, where a
   * bubble snaps against the ceiling). Without this rule, a fired
   * bubble could land in an empty pocket below the cluster and end
   * up floating once the grid descends.
   */
  private _isConnectedCell(row: number, col: number, grid: IBubbleGrid, layout: BubbleGridLayout): boolean {
    if (row === 0) return true;
    for (const off of layout.getNeighborOffsets(row)) {
      const nr = row + off.dRow;
      const nc = col + off.dCol;
      if (!layout.isInBounds(nr, nc)) continue;
      if (grid.isOccupied(nr, nc)) return true;
    }
    return false;
  }

  private _snapshotOccupiedCells(grid: IBubbleGrid, layout: BubbleGridLayout, onlyVisible: boolean): ICellPos[] {
    // Regular bubbles (`onlyVisible = false`) treat the full grid as
    // collision space — they should travel up through empty cells
    // until touching the cluster, even if part of it sits above the
    // viewport. Power-up projectiles (`onlyVisible = true`) only
    // see visible bubbles so their effects stay confined to the
    // play area.
    const cells: ICellPos[] = [];
    const visibleCutoff = layout.topWallY + layout.bubbleRadius;
    for (let row = 0; row < grid.rowCount; row++) {
      const colCount = grid.getColumnCount(row);
      for (let col = 0; col < colCount; col++) {
        if (!grid.isOccupied(row, col)) continue;
        const pos = layout.getCellWorldPosition(row, col);
        if (onlyVisible && pos.y > visibleCutoff) continue;
        cells.push(pos);
      }
    }
    return cells;
  }

  private _nearestWallHit(
    posX: number,
    posY: number,
    dirX: number,
    dirY: number,
    leftWall: number,
    rightWall: number,
    topWall: number,
  ): { t: number; kind: "left" | "right" | "top" } | null {
    let bestT = Infinity;
    let bestKind: "left" | "right" | "top" | null = null;
    if (dirX < 0) {
      const t = (leftWall - posX) / dirX;
      if (t > 0 && t < bestT) {
        bestT = t;
        bestKind = "left";
      }
    } else if (dirX > 0) {
      const t = (rightWall - posX) / dirX;
      if (t > 0 && t < bestT) {
        bestT = t;
        bestKind = "right";
      }
    }
    if (dirY > 0) {
      const t = (topWall - posY) / dirY;
      if (t > 0 && t < bestT) {
        bestT = t;
        bestKind = "top";
      }
    }
    return bestKind === null ? null : { t: bestT, kind: bestKind };
  }

  private _nearestBubbleHit(
    posX: number,
    posY: number,
    dirX: number,
    dirY: number,
    cells: readonly ICellPos[],
    collisionR2: number,
  ): { t: number } | null {
    let bestT = Infinity;
    for (const c of cells) {
      const dx = c.x - posX;
      const dy = c.y - posY;
      const tCenter = dx * dirX + dy * dirY;
      if (tCenter <= 0) continue;
      const closestX = posX + dirX * tCenter;
      const closestY = posY + dirY * tCenter;
      const cdx = closestX - c.x;
      const cdy = closestY - c.y;
      const closestD2 = cdx * cdx + cdy * cdy;
      if (closestD2 > collisionR2) continue;
      const back = Math.sqrt(collisionR2 - closestD2);
      const tEnter = tCenter - back;
      if (tEnter > 0 && tEnter < bestT) bestT = tEnter;
    }
    return bestT === Infinity ? null : { t: bestT };
  }
}
