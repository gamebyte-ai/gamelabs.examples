import type { MergeGameConfig } from "../MergeGameConfig.js";

/**
 * Pure trapezoid geometry + faux-3D perspective, shared by the domain layer and
 * the view. No PIXI / matter here — just math derived from the fixed design size
 * and `config.board`, so it is deterministic and unit-testable.
 *
 * Two coordinate systems:
 *  - **game space** — a straight-walled rectangle `[0, gW] × [0, gH]` where the
 *    physics runs (so bodies bounce off straight walls). `gy = 0` is the near
 *    (player) edge, `gy = gH` the far edge.
 *  - **design space** — the 390×844 canvas the view draws in. `project()` maps a
 *    game point onto the perspective trapezoid; `unproject()` is its inverse.
 *
 * The domain layer only needs `gW`/`gH` (walls, clamping) and stays in game
 * space; the view owns the projection for rendering and input.
 */
export class BoardGeometry {
  public readonly designW: number;
  public readonly designH: number;
  public readonly centerX: number;
  /** Far (top) edge design-y. */
  public readonly topY: number;
  /** Near (bottom) edge design-y. */
  public readonly bottomY: number;
  public readonly halfBottom: number;
  public readonly halfTop: number;
  /** Game-space width (near-edge width) and height (vertical span), design px. */
  public readonly gW: number;
  public readonly gH: number;
  /** Perspective taper `1 - topScale` (0 = no perspective). */
  private readonly _a: number;

  public constructor(config: MergeGameConfig) {
    const b = config.board;
    this.designW = config.design.width;
    this.designH = config.design.height;
    const boardW = this.designW * b.widthRatio;
    const boardH = this.designH * b.heightRatio;
    const cy = this.designH * b.centerY;
    this.centerX = this.designW / 2;
    this.bottomY = cy + boardH / 2;
    this.topY = cy - boardH / 2;
    this.halfBottom = boardW / 2;
    this.halfTop = (boardW * b.topScale) / 2;
    this.gW = this.halfBottom * 2;
    this._a = 1 - b.topScale; // horizontal taper per unit depth
    // ISOTROPIC perspective: pick gH so the vertical spacing compresses with the
    // SAME scale as the horizontal taper. Then a uniformly-scaled item matches its
    // game-space collider at every depth (no gap between touching items). Derived
    // from ∫₀¹ scale(t) dt = (1 + topScale) / 2.
    this.gH = (2 * (this.bottomY - this.topY)) / (1 + b.topScale);
  }

  /** Half the board width at a given design-y (perspective taper). */
  public halfWidthAt(designY: number): number {
    const span = this.bottomY - this.topY || 1;
    const t = Math.max(0, Math.min(1, (this.bottomY - designY) / span)); // 0 near → 1 far
    return this.halfBottom + (this.halfTop - this.halfBottom) * t;
  }

  /** Left/right board edge x at a given design-y. */
  public edgeXAt(designY: number): { left: number; right: number } {
    const half = this.halfWidthAt(designY);
    return { left: this.centerX - half, right: this.centerX + half };
  }

  /** Map a game-space point onto the perspective board (design px + uniform scale
   * factor). Both axes share the depth scale `s = 1 - a·t`, so the mapping is a
   * local similarity (uniform scale) and undistorted items match their colliders. */
  public project(gx: number, gy: number): { x: number; y: number; scale: number } {
    const t = Math.max(0, Math.min(1, gy / (this.gH || 1))); // 0 near → 1 far
    const s = 1 - this._a * t; // depth scale
    // y compresses with depth: screenY = bottomY − gH·∫₀ᵗ s du = bottomY − gH·(t − a·t²/2)
    const y = this.bottomY - this.gH * (t - (this._a * t * t) / 2);
    return {
      x: this.centerX + (gx - this.gW / 2) * s,
      y,
      scale: s,
    };
  }

  /** Inverse of `project()`: design-space point → game-space point. */
  public unproject(sx: number, sy: number): { gx: number; gy: number } {
    // Invert screenY: Y = (bottomY − sy)/gH = t − a·t²/2  →  solve for t ∈ [0,1].
    const yy = Math.max(0, (this.bottomY - sy) / (this.gH || 1));
    let t: number;
    if (this._a < 1e-6) {
      t = yy;
    } else {
      t = (1 - Math.sqrt(Math.max(0, 1 - 2 * this._a * yy))) / this._a;
    }
    t = Math.max(0, Math.min(1, t));
    const s = 1 - this._a * t;
    return {
      gx: (sx - this.centerX) / Math.max(1e-3, s) + this.gW / 2,
      gy: t * this.gH,
    };
  }
}
