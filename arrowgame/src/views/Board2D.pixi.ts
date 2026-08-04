import * as PIXI from "pixi.js";
import { gsap } from "gsap";

import { Direction, DIRECTION_DELTA } from "../constants/GameTypes";
import type { LevelDef } from "../constants/GameTypes";
import type { ArrowState } from "../utilities/GameState";
import type { ArrowGameConfig } from "../ArrowGameConfig";

/** Arrowhead sprite rotation (radians, pixi clockwise) per slide direction.
 * The texture points UP (-Y); rotating maps it to each direction. */
const ARROW_ROT: Record<Direction, number> = {
  [Direction.Up]: 0,
  [Direction.Right]: Math.PI / 2,
  [Direction.Down]: Math.PI,
  [Direction.Left]: -Math.PI / 2,
};

/** Flash color when an arrow nudges into an obstacle (blocked-with-gap feedback). */
const BLOCKED_COLOR = 0xff3b30;
/** Color a tapped arrow turns while it successfully slides out (has a clear lane
 * → "solvable"), so the outcome reads instantly: BLUE = clear, RED = blocked. */
const CLEAR_COLOR = 0x2f80ff;

/** Per-block visuals: a container holding the rope stroke + its arrowhead. */
interface ArrowView {
  container: PIXI.Container;
  rope: PIXI.Graphics;
  /** Arrowhead drawn as a solid triangle (same color as the rope body). */
  arrow: PIXI.Graphics;
  cells: { col: number; row: number }[];
  direction: Direction;
  color: number;
  sliding: boolean;
}

/**
 * 2D board renderer (pixi). Draws a dot grid and each block as a thick rounded
 * rope line following its cell path, with an arrowhead at the head. Handles taps
 * (screen → cell → block) and the snake slide-out / shake animations.
 *
 * Pure 2D — no three.js. Only asset needed is the arrowhead texture.
 */
export class Board2D extends PIXI.Container {
  private readonly _cfg: ArrowGameConfig;

  private readonly _grid = new PIXI.Graphics();
  private readonly _arrowLayer = new PIXI.Container();
  private readonly _arrows = new Map<number, ArrowView>();

  private _cols = 0;
  private _rows = 0;
  private _viewW = 0;
  private _viewH = 0;
  private _cellPx = 40;
  private _originX = 0; // top-left of the board in screen px
  private _originY = 0;
  // Reserved screen bands the board must NOT overlap (HUD label/buttons on top,
  // home-indicator on the bottom). The board fits & centers BETWEEN them.
  private _insetTop = 0;
  private _insetBottom = 0;
  // Top-left of the letterboxed play rect in screen px (0,0 when no letterbox).
  // The board sizes/centers WITHIN the play rect, not the raw viewport.
  private _playOriginX = 0;
  private _playOriginY = 0;

  private _tapCb: ((arrowId: number) => void) | null = null;

  public constructor(cfg: ArrowGameConfig) {
    super();
    this._cfg = cfg;

    this.addChild(this._grid);
    this.addChild(this._arrowLayer);

    // Board-level tap handling: screen point → cell → block.
    this.eventMode = "static";
    this.on("pointerdown", (e: PIXI.FederatedPointerEvent) => this.handlePointer(e));
  }

  public onArrowTapped(cb: (arrowId: number) => void): void {
    this._tapCb = cb;
  }

  public setViewSize(w: number, h: number): void {
    this._viewW = w;
    this._viewH = h;
    if (this._cols > 0) this.relayout();
  }

  /** Confine the board to a letterboxed play rect (its origin + size). Everything
   * is sized/centered inside this rect; the letterbox bars mask the rest. */
  public setPlayRect(x: number, y: number, w: number, h: number): void {
    this._playOriginX = x;
    this._playOriginY = y;
    this._viewW = w;
    this._viewH = h;
    if (this._cols > 0) this.relayout();
  }

  /** Reserve top/bottom screen bands (HUD, safe areas) that the board avoids. */
  public setInsets(top: number, bottom: number): void {
    this._insetTop = top;
    this._insetBottom = bottom;
    if (this._cols > 0) this.relayout();
  }

  // ── Level build ────────────────────────────────────────────────────────

  public buildLevel(level: LevelDef, arrows: readonly ArrowState[]): void {
    this.clearLevel();
    this._cols = level.cols;
    this._rows = level.rows;
    this.computeLayout();

    this.drawGrid();
    for (const b of arrows) this.addArrow(b);
  }

  public clearLevel(): void {
    for (const bv of this._arrows.values()) {
      gsap.killTweensOf(bv.container);
      bv.container.destroy({ children: true });
    }
    this._arrows.clear();
    this._arrowLayer.removeChildren();
    this._grid.clear();
  }

  private addArrow(block: ArrowState): void {
    const color = this._cfg.arrowColor; // all arrows white (see config)
    const container = new PIXI.Container();
    const rope = new PIXI.Graphics();
    container.addChild(rope);

    // Arrowhead is a solid Graphics triangle (drawn in drawRope), so it shares the
    // exact rope color instead of a tinted PNG that never quite matches.
    const arrow = new PIXI.Graphics();
    container.addChild(arrow);

    this._arrowLayer.addChild(container);

    const bv: ArrowView = {
      container,
      rope,
      arrow,
      cells: block.cells.map((c) => ({ col: c.col, row: c.row })),
      direction: block.direction,
      color,
      sliding: false,
    };
    this._arrows.set(block.id, bv);

    // Draw at rest through the cell centers.
    this.drawRope(bv, bv.cells.map((c) => this.cellCenter(c.col, c.row)));
  }

  /** Draw a rope as a thick round-capped polyline through the given screen points,
   * and place its arrowhead at the head (points[0]). `color` overrides the arrow's
   * own color (used to flash red when nudged into an obstacle). */
  private drawRope(bv: ArrowView, points: { x: number; y: number }[], color: number = bv.color): void {
    const g = bv.rope;
    g.clear();
    if (points.length === 0) return;
    const width = this._cellPx * this._cfg.arrowThicknessRatio;

    // Push the head AHEAD of the leading cell center, toward the travel direction,
    // so the arrow reads as pointing forward. EXCEPTION: if the head cell already
    // sits on the board edge it points toward, the offset would poke outside the
    // grid — keep it dead-center on the cell instead.
    const d = DIRECTION_DELTA[bv.direction];
    const head = bv.cells[0];
    const onEdge =
      head === undefined ||
      head.col + d.col < 0 ||
      head.col + d.col >= this._cols ||
      head.row + d.row < 0 ||
      head.row + d.row >= this._rows;
    const off = onEdge ? 0 : this._cellPx * this._cfg.arrowHeadOffsetRatio;
    const hx = points[0].x + d.col * off;
    const hy = points[0].y + d.row * off;

    if (points.length === 1) {
      g.circle(points[0].x, points[0].y, width / 2).fill({ color });
    } else {
      // Start the stroke at the pushed-out head so the body EXTENDS up to the
      // arrowhead — the last cell joins the forward head with no gap.
      g.moveTo(hx, hy);
      for (let i = 0; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
      g.stroke({ width, color, cap: "round", join: "round" });
    }

    // Redraw the head as a SOLID triangle in the exact body color (pointing up in
    // local space, then rotated to the travel direction) → head and body are one
    // uniform piece, no tinted-texture mismatch.
    const a = this._cellPx * this._cfg.arrowSizeRatio;
    bv.arrow.clear();
    bv.arrow
      .moveTo(0, -a * 0.55)
      .lineTo(a * 0.5, a * 0.35)
      .lineTo(-a * 0.5, a * 0.35)
      .closePath()
      .fill({ color });
    bv.arrow.position.set(hx, hy);
    bv.arrow.rotation = ARROW_ROT[bv.direction];
  }

  // ── Interaction ──────────────────────────────────────────────────────────

  private handlePointer(e: PIXI.FederatedPointerEvent): void {
    if (!this._tapCb) return;
    const p = e.getLocalPosition(this);
    const col = Math.floor((p.x - this._originX) / this._cellPx);
    const row = Math.floor((p.y - this._originY) / this._cellPx);
    if (col < 0 || col >= this._cols || row < 0 || row >= this._rows) return;
    for (const [id, bv] of this._arrows) {
      if (bv.sliding) continue;
      if (bv.cells.some((c) => c.col === col && c.row === row)) {
        this._tapCb(id);
        return;
      }
    }
  }

  // ── Animations ────────────────────────────────────────────────────────────

  public slideArrowOut(block: ArrowState, onDone: () => void): void {
    const bv = this._arrows.get(block.id);
    if (!bv) {
      onDone();
      return;
    }
    bv.sliding = true;

    const head = block.cells[0];
    const delta = DIRECTION_DELTA[block.direction];
    const n = block.cells.length;

    // Steps for the head to reach just off the board edge (arrow-direction exit).
    let k = 0;
    let cc = head.col;
    let rr = head.row;
    while (cc >= 0 && cc < this._cols && rr >= 0 && rr < this._rows) {
      cc += delta.col;
      rr += delta.row;
      k++;
    }
    // Exit ray long enough for the WHOLE rope (length = bodyLen) to slide fully
    // off the board: tail must travel past the edge → exitCells ≥ (n-1)+k, + margin.
    const exitCells = n + k + 1;

    // Screen-space polyline TAIL → HEAD → out (exit ray). The rope is a CONSTANT-
    // LENGTH window sliding along this path: as the TAIL cursor advances (rounding
    // the bend, then along the body), the HEAD cursor advances the SAME distance
    // out the arrow direction → total length is preserved. Bends collapse at the
    // tail while the head lengthens out — natural, no shrinking.
    const pathCells: { col: number; row: number }[] = [];
    for (let i = n - 1; i >= 0; i--) pathCells.push(block.cells[i]); // tail..head
    for (let j = 1; j <= exitCells; j++) pathCells.push({ col: head.col + delta.col * j, row: head.row + delta.row * j });
    const path = pathCells.map((c) => this.cellCenter(c.col, c.row));

    // Cumulative arc length along `path`.
    const arc: number[] = [0];
    for (let i = 1; i < path.length; i++) {
      arc.push(arc[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
    }
    const bodyLen = arc[n - 1]; // arc distance from tail(0) to head(index n-1)
    const total = arc[arc.length - 1];

    const travel = total - bodyLen; // distance the window slides (tail 0 → travel)
    const driver = { p: 0 };
    gsap.killTweensOf(driver);
    gsap.to(driver, {
      p: 1,
      duration: travel / this._cellPx / this._cfg.slideSpeed,
      ease: "power1.in",
      onUpdate: () => {
        const p = driver.p;
        // CONSTANT length: head is always exactly bodyLen ahead of the tail.
        const tailArc = p * travel;
        const headArc = tailArc + bodyLen;
        // Window head → tail (so arrow sits at points[0] = head end).
        const pts = this.subPathHeadToTail(path, arc, tailArc, headArc);
        // BLUE while sliding → signals the tap resolved (clear lane / solvable).
        this.drawRope(bv, pts, CLEAR_COLOR);
      },
      onComplete: () => {
        this._arrows.delete(block.id);
        bv.container.destroy({ children: true });
        onDone();
      },
    });
  }

  /** Point on a polyline at arc distance `a` (clamped). */
  private pointAtArc(path: { x: number; y: number }[], arc: number[], a: number): { x: number; y: number } {
    const clamped = Math.max(0, Math.min(arc[arc.length - 1], a));
    let i = 1;
    while (i < arc.length && arc[i] < clamped) i++;
    const a0 = arc[i - 1];
    const a1 = arc[i] ?? a0;
    const seg = a1 - a0 || 1;
    const f = (clamped - a0) / seg;
    const p0 = path[i - 1];
    const p1 = path[i] ?? p0;
    return { x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f };
  }

  /** Sub-polyline between arc distances, ordered from the HEAD end (aEnd) to the
   * TAIL end (aStart) — so drawRope places the arrow at the head. */
  private subPathHeadToTail(
    path: { x: number; y: number }[],
    arc: number[],
    aStart: number,
    aEnd: number,
  ): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [this.pointAtArc(path, arc, aEnd)];
    for (let i = path.length - 1; i >= 0; i--) {
      if (arc[i] < aEnd - 1e-3 && arc[i] > aStart + 1e-3) pts.push(path[i]);
    }
    pts.push(this.pointAtArc(path, arc, aStart));
    return pts;
  }

  public shakeArrow(arrowId: number): void {
    const bv = this._arrows.get(arrowId);
    if (bv) this.shakeView(bv);
  }

  /** Shake a single arrow view (intensity = config shakeAmplitudeRatio). Calls
   * `onDone` when the shake finishes. */
  private shakeView(bv: ArrowView, onDone?: () => void): void {
    const amp = this._cellPx * this._cfg.shakeAmplitudeRatio;
    gsap.killTweensOf(bv.container);
    bv.container.x = 0;
    gsap.fromTo(
      bv.container,
      { x: -amp },
      {
        x: amp,
        duration: this._cfg.shakeDuration / 4,
        ease: "power1.inOut",
        repeat: 3,
        yoyo: true,
        onComplete: () => {
          bv.container.x = 0;
          onDone?.();
        },
      },
    );
  }

  /** Impact reaction on the OBSTACLE arrow that got hit: stays RED for the whole
   * shake, then returns to its normal color. */
  private impactReact(obstacleId: number): void {
    const bv = this._arrows.get(obstacleId);
    if (!bv || bv.sliding) return;
    const rest = (): { x: number; y: number }[] => bv.cells.map((c) => this.cellCenter(c.col, c.row));
    this.drawRope(bv, rest(), BLOCKED_COLOR); // red while shaking
    this.shakeView(bv, () => {
      if (!bv.sliding) this.drawRope(bv, rest()); // restore color when the shake ends
    });
  }

  /**
   * BLOCKED-WITH-GAP feedback: the arrow slides forward `adv` empty cells until it
   * hits the obstacle (constant-length window, same as a real slide), flashes RED
   * at the contact point, then slides back to its original place. State unchanged.
   */
  public nudgeArrow(block: ArrowState, adv: number, obstacleId: number, onDone: () => void): void {
    const bv = this._arrows.get(block.id);
    if (!bv) {
      onDone();
      return;
    }
    bv.sliding = true;

    const head = block.cells[0];
    const delta = DIRECTION_DELTA[block.direction];
    const n = block.cells.length;

    // Path TAIL → HEAD → forward `adv` cells (up to just before the obstacle).
    const pathCells: { col: number; row: number }[] = [];
    for (let i = n - 1; i >= 0; i--) pathCells.push(block.cells[i]);
    for (let j = 1; j <= adv; j++) pathCells.push({ col: head.col + delta.col * j, row: head.row + delta.row * j });
    const path = pathCells.map((c) => this.cellCenter(c.col, c.row));

    // Adjacent obstacle (adv=0): there's no empty cell to cross, so append a
    // PARTIAL point a fraction of a cell toward the obstacle cell's center — the
    // arrow lunges into the wall and bounces back instead of just shaking.
    if (adv === 0) {
      const hc = this.cellCenter(head.col, head.row);
      const bump = this._cellPx * this._cfg.bumpDistanceRatio;
      path.push({ x: hc.x + delta.col * bump, y: hc.y + delta.row * bump });
    }

    const arc: number[] = [0];
    for (let i = 1; i < path.length; i++) {
      arc.push(arc[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
    }
    const bodyLen = arc[n - 1];
    const advDist = arc[arc.length - 1] - bodyLen; // adv*cellPx, or the bump distance
    if (advDist <= 0) {
      // Nothing to travel (bump disabled) → fall back to a plain shake.
      bv.sliding = false;
      this.shakeView(bv);
      this.impactReact(obstacleId);
      onDone();
      return;
    }

    let red = false;
    const render = (tailArc: number): void => {
      const pts = this.subPathHeadToTail(path, arc, tailArc, tailArc + bodyLen);
      this.drawRope(bv, pts, red ? BLOCKED_COLOR : bv.color);
    };

    const driver = { t: 0 };
    gsap.killTweensOf(driver);
    // Same per-cell rate AND easing as the normal slide (power1.in) → advance
    // speed matches a real move. The adjacent bump uses its own short duration.
    const dur =
      adv > 0 ? adv / this._cfg.slideSpeed : Math.max(0.09, this._cfg.bumpDistanceRatio / this._cfg.slideSpeed);
    gsap.to(driver, {
      t: advDist,
      duration: dur,
      ease: "power1.in",
      onUpdate: () => render(driver.t),
      onComplete: () => {
        red = true; // hit the wall → turn RED and stay red while returning
        render(advDist);
        this.impactReact(obstacleId); // the arrow it hit shakes + red-blinks
        gsap.to(driver, {
          t: 0,
          duration: dur,
          ease: "power1.out",
          delay: 0.08,
          onUpdate: () => render(driver.t),
          onComplete: () => {
            red = false;
            this.drawRope(bv, bv.cells.map((c) => this.cellCenter(c.col, c.row))); // rest, original color
            bv.sliding = false;
            onDone();
          },
        });
      },
    });
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  private computeLayout(): void {
    const fit = this._cfg.boardFitRatio;
    // CONTAIN-FIT to the actual viewport: size cells so the whole grid fits within
    // the available width AND the available height (viewport minus the reserved
    // top/bottom HUD + safe-area bands). Keeps the board fully on-screen in EVERY
    // orientation — in landscape (short height) it shrinks to fit instead of
    // overflowing past the bottom. Tune the margin via `boardFitRatio`.
    const availW = this._viewW;
    const availH = Math.max(1, this._viewH - this._insetTop - this._insetBottom);
    this._cellPx = Math.max(
      8,
      Math.floor(Math.min((availW * fit) / this._cols, (availH * fit) / this._rows)),
    );
    const boardW = this._cellPx * this._cols;
    const boardH = this._cellPx * this._rows;
    this._originX = this._playOriginX + (this._viewW - boardW) / 2;

    // Vertical placement: drop below the top HUD when there's spare space; if the
    // board nearly fills the height (tight landscape), keep it on-screen instead
    // of shrinking it. `freeV` = leftover vertical space. (Within the play rect.)
    const freeV = this._viewH - boardH;
    if (freeV <= 0) {
      this._originY = this._playOriginY + freeV / 2; // taller than rect → center
    } else {
      const maxTop = Math.max(0, freeV - this._insetBottom); // keep bottom safe area if we can
      // Base placement below the HUD, plus a tunable nudge, clamped on-screen.
      const base = Math.min(this._insetTop, maxTop) + this._cfg.boardYOffset;
      this._originY = this._playOriginY + Math.min(Math.max(base, 0), freeV);
    }
    // Tap hit area covers the whole board.
    this.hitArea = new PIXI.Rectangle(this._originX, this._originY, boardW, boardH);
  }

  /** Center of a grid cell in screen px. */
  private cellCenter(col: number, row: number): { x: number; y: number } {
    return {
      x: this._originX + col * this._cellPx + this._cellPx / 2,
      y: this._originY + row * this._cellPx + this._cellPx / 2,
    };
  }

  private drawGrid(): void {
    const g = this._grid;
    g.clear();
    const r = this._cellPx * this._cfg.dotRadiusRatio;
    for (let row = 0; row < this._rows; row++) {
      for (let col = 0; col < this._cols; col++) {
        const p = this.cellCenter(col, row);
        g.circle(p.x, p.y, r);
      }
    }
    g.fill({ color: this._cfg.dotColor });
  }

  /** Recompute pixel layout and redraw everything at rest (on resize). */
  private relayout(): void {
    this.computeLayout();
    this.drawGrid();
    for (const bv of this._arrows.values()) {
      if (bv.sliding) continue; // mid-animation arrows redraw themselves
      // drawRope fully redraws the rope + the head triangle at the current cell
      // size — no manual scaling (setting width/height on the Graphics head would
      // apply a compounding scale and shrink it away on repeated resizes).
      this.drawRope(bv, bv.cells.map((c) => this.cellCenter(c.col, c.row)));
    }
  }
}
