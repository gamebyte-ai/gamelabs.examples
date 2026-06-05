import type { IInstanceResolver } from "@gamebyte/gamelabsjs";
import {
  Physics2DManager,
  Physics2DStage,
  type Body2DDef,
  type BodyId,
  type Physics2DEntity,
  type Physics2DEntityView,
  type Transform2D,
  type Vec2,
} from "@gamebyte/gamelabsjs/physics2d";

import { CastleCrushersConfig } from "../CastleCrushersConfig.js";
import { GameModel } from "../models/GameModel.js";
import type { PieceKind, PieceShape } from "../models/IGameModel.js";

/** Creates the view object for a spawned entity. Injected by the controller; the engine never sees a renderer. */
export type EntityViewFactory = (kind: PieceKind, shape: PieceShape) => Physics2DEntityView;

/**
 * All domain logic for the level. Builds the castle by spawning physics-backed
 * entities through a `Physics2DStage` (one call = body + view + sync), launches
 * projectiles, and decides win/lose by reading body transforms. Owns no
 * concrete renderer — the view side is an injected `EntityViewFactory`, so this
 * stays unit-testable with `FakePhysics2D` + a stub factory.
 */
export class CastleOperations {
  private _physics: Physics2DManager | null = null;
  private _config: CastleCrushersConfig | null = null;
  private _model: GameModel | null = null;
  private _stage: Physics2DStage | null = null;
  private _makeView: EntityViewFactory | null = null;

  /** Bodies that can move/settle — used for lose detection. */
  private readonly _dynamicIds = new Set<BodyId>();
  /** Balls currently in play, for off-screen culling. */
  private readonly _ballEntities = new Set<Physics2DEntity>();
  private _crown: Physics2DEntity | null = null;

  private readonly _t: Transform2D = { x: 0, y: 0, angle: 0 };
  private readonly _v: Vec2 = { x: 0, y: 0 };

  public inject(resolver: IInstanceResolver): void {
    this._physics = resolver.getInstance(Physics2DManager);
    this._config = resolver.getInstance(CastleCrushersConfig);
    this._model = resolver.getInstance(GameModel);
    this._stage = new Physics2DStage(this._physics);
  }

  /** The controller wires the view's entity factory in before the level is built. */
  public bindView(factory: EntityViewFactory): void {
    this._makeView = factory;
  }

  //  LEVEL BUILD

  public buildLevel(): void {
    const cfg = this._config!;
    this._stage!.clear();
    this._dynamicIds.clear();
    this._ballEntities.clear();
    this._crown = null;
    this._model!.reset();

    this._spawn("ground", { kind: "rect", width: cfg.design.width, height: 60 }, {
      shape: { kind: "rect", width: cfg.design.width, height: 60 },
      x: cfg.design.width / 2,
      y: cfg.groundTopY + 30,
      type: "static",
      friction: 0.6,
    });

    this._spawn("pedestal", { kind: "rect", width: cfg.pedestal.width, height: cfg.pedestal.height }, {
      shape: { kind: "rect", width: cfg.pedestal.width, height: cfg.pedestal.height },
      x: cfg.pedestal.centerX,
      y: cfg.pedestal.topY + cfg.pedestal.height / 2,
      type: "static",
      friction: 0.6,
    });

    this._buildCastle();
    this._buildCrown();

    this._model!.setAmmoLeft(cfg.ammo.count);
    this._model!.setStatus("playing");
  }

  private _buildCastle(): void {
    const cfg = this._config!;
    const { blockWidth: bw, blockHeight: bh, columns, rows, gap } = cfg.castle;
    const stride = { x: bw + gap, y: bh + gap };
    const totalWidth = columns * bw + (columns - 1) * gap;
    const firstColX = cfg.pedestal.centerX - totalWidth / 2 + bw / 2;
    const bottomRowY = cfg.pedestal.topY - bh / 2;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        this._spawn("block", { kind: "rect", width: bw, height: bh }, {
          shape: { kind: "rect", width: bw, height: bh },
          x: firstColX + col * stride.x,
          y: bottomRowY - row * stride.y,
          type: "dynamic",
          density: cfg.castle.blockDensity,
          friction: cfg.castle.blockFriction,
          restitution: cfg.castle.blockRestitution,
          tag: "block",
        });
      }
    }
  }

  private _buildCrown(): void {
    const cfg = this._config!;
    const { size } = cfg.crown;
    const topRowCenterY =
      cfg.pedestal.topY - cfg.castle.blockHeight / 2 - (cfg.castle.rows - 1) * (cfg.castle.blockHeight + cfg.castle.gap);
    const crownY = topRowCenterY - cfg.castle.blockHeight / 2 - size / 2;
    this._crown = this._spawn("crown", { kind: "rect", width: size, height: size }, {
      shape: { kind: "rect", width: size, height: size },
      x: cfg.pedestal.centerX,
      y: crownY,
      type: "dynamic",
      density: cfg.crown.density,
      friction: 0.5,
      tag: "crown",
    });
  }

  //  LAUNCH

  /** Launch a projectile from the pad toward `(targetX, targetY)` in design space. */
  public launch(targetX: number, targetY: number): void {
    const cfg = this._config!;
    const model = this._model!;
    if (model.status !== "playing" || model.ammoLeft <= 0) return;

    let vx = (targetX - cfg.ammo.originX) * cfg.ammo.speedScale;
    let vy = (targetY - cfg.ammo.originY) * cfg.ammo.speedScale;
    const speed = Math.hypot(vx, vy);
    if (speed < 0.001) return;
    if (speed > cfg.ammo.maxSpeed) {
      const k = cfg.ammo.maxSpeed / speed;
      vx *= k;
      vy *= k;
    }

    const ball = this._spawn("ball", { kind: "circle", radius: cfg.ammo.radius }, {
      shape: { kind: "circle", radius: cfg.ammo.radius },
      x: cfg.ammo.originX,
      y: cfg.ammo.originY,
      type: "dynamic",
      density: cfg.ammo.density,
      restitution: cfg.ammo.restitution,
      friction: 0.4,
      tag: "ball",
    });
    this._ballEntities.add(ball);
    this._physics!.setVelocity(ball.id, vx, vy);

    model.setAmmoLeft(model.ammoLeft - 1);
  }

  //  PER-FRAME

  public update(_dt: number): void {
    if (this._model!.status === "playing") {
      this._cullOffscreenBalls();
      this._checkWin();
      this._checkLose();
    }
    // Push every body's transform onto its view, regardless of status.
    this._stage!.sync();
  }

  private _cullOffscreenBalls(): void {
    const cfg = this._config!;
    const margin = 200;
    for (const ball of this._ballEntities) {
      const t = this._physics!.getTransform(ball.id, this._t);
      if (t.y > cfg.design.height + margin || t.x < -margin || t.x > cfg.design.width + margin) {
        this._ballEntities.delete(ball);
        this._dynamicIds.delete(ball.id);
        ball.despawn();
      }
    }
  }

  private _checkWin(): void {
    if (!this._crown) return;
    const t = this._physics!.getTransform(this._crown.id, this._t);
    if (t.y > this._config!.winLineY) this._model!.setStatus("won");
  }

  private _checkLose(): void {
    const model = this._model!;
    // Don't overwrite a win decided earlier this frame.
    if (model.status !== "playing") return;
    // Lose once ammo is gone and the world has come to rest. We check
    // _allSettled (which covers every dynamic body, balls included) rather than
    // requiring balls to be gone — a ball resting on-screen is "done", and
    // gating on _ballEntities.size would make the lose state unreachable.
    if (model.ammoLeft > 0 || !this._allSettled()) return;
    model.setStatus("lost");
  }

  private _allSettled(): boolean {
    const limit = this._config!.settleSpeed;
    for (const id of this._dynamicIds) {
      const v = this._physics!.getVelocity(id, this._v);
      if (Math.hypot(v.x, v.y) > limit) return false;
    }
    return true;
  }

  //  RESET / CLEANUP

  public reset(): void {
    this.buildLevel();
  }

  public destroy(): void {
    this._stage?.clear();
    this._dynamicIds.clear();
    this._ballEntities.clear();
    this._crown = null;
    this._physics = null;
    this._config = null;
    this._model = null;
    this._stage = null;
    this._makeView = null;
  }

  //  HELPERS

  /** One call: create the body, create its view, pair them, track for rules. */
  private _spawn(kind: PieceKind, shape: PieceShape, def: Body2DDef): Physics2DEntity {
    const entity = this._stage!.spawn(def, this._makeView!(kind, shape));
    if (def.type === "dynamic") this._dynamicIds.add(entity.id);
    return entity;
  }
}
