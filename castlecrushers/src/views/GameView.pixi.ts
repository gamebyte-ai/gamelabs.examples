import * as PIXI from "pixi.js";
import { HudViewBase, type IInstanceResolver, type Unsubscribe } from "@gamebyte/gamelabsjs";
import type { Physics2DEntityView } from "@gamebyte/gamelabsjs/physics2d";
import type { IGameView } from "./IGameView.js";
import { CastleCrushersConfig } from "../CastleCrushersConfig.js";
import type { PieceKind, PieceShape } from "../models/IGameModel.js";

const COLORS: Record<PieceKind, { fill: number; stroke: number }> = {
  ground: { fill: 0x3b4250, stroke: 0x2a2f3a },
  pedestal: { fill: 0x6b7280, stroke: 0x4b5563 },
  block: { fill: 0x9a6b3f, stroke: 0x6f4d2c },
  crown: { fill: 0xf2c14e, stroke: 0xb8860b },
  ball: { fill: 0xb23b3b, stroke: 0x7d2727 },
};

/**
 * The game-objects view, rendered with Pixi on the HUD **Content** layer (the
 * bottom layer, below the UI Screen layer). This is a pure-2D game that needs
 * no World-only tools, so it stays in Pixi/screen-pixel space — physics design
 * coordinates map 1:1 to what we draw (no 2D↔3D conversion). It never reads the
 * physics world: `createEntity` returns the `Physics2DEntityView` the stage drives.
 *
 * Aspect/letterboxing is handled by the framework (`viewport: { fit: "contain" }`
 * in the app config), which sizes the canvas to a 1280x720 play-rect and paints
 * the inert bars. This view only does a uniform design→canvas scale of `_root`.
 */
export class GameView extends HudViewBase implements IGameView {
  private _config: CastleCrushersConfig | null = null;
  private _designW = 1280;
  private _designH = 720;

  /** Design-space layer; scaled to map the 1280x720 design onto the play-rect canvas. */
  private readonly _root = new PIXI.Container();
  private readonly _sky = new PIXI.Graphics();
  private readonly _launchMarker = new PIXI.Graphics();
  private readonly _pieces = new PIXI.Container();
  private readonly _aim = new PIXI.Graphics();

  private readonly _aimMove = new Set<(x: number, y: number) => void>();
  private readonly _aimRelease = new Set<(x: number, y: number) => void>();
  private _dragging = false;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(CastleCrushersConfig);
    this._designW = this._config.design.width;
    this._designH = this._config.design.height;
  }

  public override postInitialize(): void {
    super.postInitialize();
    this._drawSky();
    this._drawLaunchMarker();
    this._root.addChild(this._sky, this._launchMarker, this._pieces, this._aim);

    this.addChild(this._root);

    this.eventMode = "static";
    this.on("pointerdown", this._onPointerDown, this);
    this.on("globalpointermove", this._onPointerMove, this);
    this.on("pointerup", this._onPointerUp, this);
    this.on("pointerupoutside", this._onPointerUp, this);
  }

  //  ENTITY VIEW — stage drives the returned adapter (design-space transforms in)

  public createEntity(kind: PieceKind, shape: PieceShape): Physics2DEntityView {
    const g = new PIXI.Graphics();
    const c = COLORS[kind];
    if (shape.kind === "circle") {
      g.circle(0, 0, shape.radius).fill(c.fill).stroke({ width: 3, color: c.stroke });
      g.circle(shape.radius * 0.35, -shape.radius * 0.35, shape.radius * 0.25).fill(0xffffff); // rotation highlight
    } else {
      const { width, height } = shape;
      g.roundRect(-width / 2, -height / 2, width, height, 6).fill(c.fill).stroke({ width: 3, color: c.stroke });
      if (kind === "crown") this._decorateCrown(g, width, height);
    }
    this._pieces.addChild(g);
    return {
      setTransform(x: number, y: number, angle: number): void {
        g.position.set(x, y);
        g.rotation = angle;
      },
      dispose(): void {
        g.destroy();
      },
    };
  }

  //  AIM (design-space coords; drawn directly since design == Pixi space)

  public setAim(originX: number, originY: number, targetX: number, targetY: number): void {
    const dx = targetX - originX;
    const dy = targetY - originY;
    this._aim.clear();
    this._aim.moveTo(originX, originY).lineTo(targetX, targetY).stroke({ width: 4, color: 0xffffff, alpha: 0.85 });
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const s = 14;
    this._aim
      .moveTo(targetX, targetY)
      .lineTo(targetX - ux * s - uy * s * 0.6, targetY - uy * s + ux * s * 0.6)
      .lineTo(targetX - ux * s + uy * s * 0.6, targetY - uy * s - ux * s * 0.6)
      .fill(0xffffff);
  }

  public clearAim(): void {
    this._aim.clear();
  }

  //  INPUT

  public onAimMove(cb: (x: number, y: number) => void): Unsubscribe {
    this._aimMove.add(cb);
    return () => this._aimMove.delete(cb);
  }
  public onAimRelease(cb: (x: number, y: number) => void): Unsubscribe {
    this._aimRelease.add(cb);
    return () => this._aimRelease.delete(cb);
  }

  private _onPointerDown(e: PIXI.FederatedPointerEvent): void {
    this._dragging = true;
    const p = this._root.toLocal(e.global);
    for (const cb of this._aimMove) cb(p.x, p.y);
  }

  private _onPointerMove(e: PIXI.FederatedPointerEvent): void {
    if (!this._dragging) return;
    const p = this._root.toLocal(e.global);
    for (const cb of this._aimMove) cb(p.x, p.y);
  }

  private _onPointerUp(e: PIXI.FederatedPointerEvent): void {
    if (!this._dragging) return;
    this._dragging = false;
    const p = this._root.toLocal(e.global);
    for (const cb of this._aimRelease) cb(p.x, p.y);
  }

  //  LAYOUT

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    // The framework locks the canvas to the design aspect, so this is a uniform
    // design→canvas scale; `min` + centering only absorbs sub-pixel rounding.
    const scale = Math.min(w / this._designW, h / this._designH);
    this._root.scale.set(scale);
    this._root.position.set((w - this._designW * scale) / 2, (h - this._designH * scale) / 2);
    this.hitArea = new PIXI.Rectangle(0, 0, w, h);
  }

  //  VISUALS

  private _drawSky(): void {
    this._sky.clear();
    this._sky.rect(0, 0, this._designW, this._designH).fill(0x10202e);
    this._sky.rect(0, 560, this._designW, this._designH - 560).fill(0x142a1c);
  }

  /** A marker at the launch pad so the player can see where cannonballs fire from. */
  private _drawLaunchMarker(): void {
    const { originX, originY, radius } = this._config!.ammo;
    this._launchMarker.clear();
    // base platform under the pad
    this._launchMarker.roundRect(originX - radius - 6, originY + radius - 2, (radius + 6) * 2, 14, 4).fill(0x2a2f3a);
    // ghost of the next cannonball + dashed-looking ring
    this._launchMarker.circle(originX, originY, radius).fill({ color: COLORS.ball.fill, alpha: 0.28 });
    this._launchMarker.circle(originX, originY, radius + 4).stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
    // crosshair tick
    this._launchMarker
      .moveTo(originX - radius - 10, originY)
      .lineTo(originX - radius - 2, originY)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.4 });
  }

  private _decorateCrown(g: PIXI.Graphics, width: number, height: number): void {
    const spikes = 3;
    const step = width / spikes;
    for (let i = 0; i < spikes; i++) {
      const cx = -width / 2 + step * (i + 0.5);
      g.moveTo(cx - step * 0.4, -height / 2)
        .lineTo(cx, -height / 2 - 14)
        .lineTo(cx + step * 0.4, -height / 2)
        .fill(0xf2c14e);
    }
  }

  public override destroy(): void {
    this.off("pointerdown", this._onPointerDown, this);
    this.off("globalpointermove", this._onPointerMove, this);
    this.off("pointerup", this._onPointerUp, this);
    this.off("pointerupoutside", this._onPointerUp, this);
    this._aimMove.clear();
    this._aimRelease.clear();
    super.destroy();
  }
}
