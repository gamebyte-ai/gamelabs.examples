import * as PIXI from "pixi.js";
import { HudViewBase, ParticleBudget, type IInstanceResolver, type Unsubscribe } from "@gamebyte/gamelabsjs";
import type { Physics2DEntityView } from "@gamebyte/gamelabsjs/physics2d";
import type { IGameView } from "./IGameView.js";
import { MergeGameConfig } from "../MergeGameConfig.js";
import { MergeGameAssetIds } from "../MergeGameAssetIds.js";
import { BoardGeometry } from "../utilities/BoardGeometry.js";
import type { LineState } from "../utilities/MergeOperations.js";
import { StarburstEmitter } from "./StarburstEmitter.pixi.js";

/** The ball texture's drawn radius as a fraction of its size (see genassets: R 0.47). */
const BALL_TEX_FRAC = 0.47;

/** A launched-item graphic driven by the stage: the domain pushes game-space
 * poses via the adapter; `tick` projects them onto the perspective board. */
interface FlightRec {
  g: PIXI.Sprite;
  kindIdx: number;
  gx: number;
  gy: number;
  angle: number;
  popT: number; // pop-in progress, 1 = fully grown
  placed: boolean; // received its first transform (hidden until then — no origin flash)
}

/** One merging pair's two-phase animation (pure presentation): pull together at
 * full size, then shrink in place. `e` is elapsed seconds. */
interface MergeAnim {
  parts: { g: PIXI.Sprite; sx: number; sy: number; ss: number }[];
  mx: number;
  my: number;
  e: number;
}

/** An expanding, fading merge-burst effect. */
interface Effect {
  g: PIXI.Graphics;
  x: number;
  y: number;
  t: number;
  dur: number;
}

/**
 * The game-objects view on the HUD **Content** layer (below the UI screen). It
 * draws the trapezoid board, the launched items (via the stage-driven adapters
 * `createEntity` returns), the launcher + aim strip, and the merge slide/burst
 * effects, and reports the launch in game-space. The framework viewport
 * letterboxes the canvas to the design aspect, so `onResize` only does a uniform
 * design→canvas scale. No game rules or physics reads live here — the domain
 * (`MergeOperations`) owns those; this view only renders and tweens visuals.
 */
export class GameView extends HudViewBase implements IGameView {
  private _config: MergeGameConfig | null = null;
  private _geo: BoardGeometry | null = null;

  /** Design-space layer, uniformly scaled to the letterboxed canvas. */
  private readonly _root = new PIXI.Container();
  private readonly _bg = new PIXI.Graphics();
  private readonly _board = new PIXI.Graphics();
  private readonly _dash = new PIXI.Graphics();
  private readonly _guides = new PIXI.Graphics();
  private readonly _aim = new PIXI.Graphics();
  private readonly _shadows = new PIXI.Graphics(); // item drop shadows (below items)
  private readonly _flight = new PIXI.Container();
  private readonly _colliders = new PIXI.Graphics(); // DEBUG collider outlines, constant thickness
  private _launcher!: PIXI.Sprite; // ball sprite, created once textures are loaded
  private readonly _fx = new PIXI.Container();
  private _stars: StarburstEmitter | null = null;

  // Loaded textures + the scale that maps the ball texture to design `item.radius`.
  private _ballTex: PIXI.Texture = PIXI.Texture.WHITE;
  private _starTex: PIXI.Texture = PIXI.Texture.WHITE;
  private _itemBase = 1;

  private readonly _flightRecs = new Set<FlightRec>();
  private readonly _mergeAnims: MergeAnim[] = [];
  private readonly _effects: Effect[] = [];

  private readonly _launchSubs = new Set<(gx: number, gy: number) => void>();

  // Launcher visual state (X follows the pointer, smoothed; pops in on load).
  private _currentKind = 0;
  private _ready = false;
  private _launcherX = 0;
  private _targetX = 0;
  private _launcherSpawnT = 1;
  private _dragging = false;

  // Danger-line render state (driven by operations) + blink clock.
  private _lineState: LineState = "safe";
  private _lineProximity = 0; // 0 (far) → 1 (at line): scales the warn blink speed
  private _blinkPhase = 0; // accumulated blink cycles (so a changing rate stays smooth)

  // "FAIL" game-over banner.
  private _failText!: PIXI.Text;
  private _failShown = false;
  private _failT = 0; // scale-up + fade-in progress (0 → 1)

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(MergeGameConfig);
    this._geo = new BoardGeometry(this._config);
    this._launcherX = this._geo.centerX;
    this._targetX = this._geo.centerX;
  }

  public override postInitialize(): void {
    super.postInitialize();

    this._guides.eventMode = "none";
    this._fx.eventMode = "none";
    this._colliders.eventMode = "none";
    this._shadows.eventMode = "none";
    this._aim.eventMode = "none";

    // Loaded texture assets (fall back to a plain white texture if missing).
    this._ballTex = this.assetLoader.getAsset<PIXI.Texture>(MergeGameAssetIds.Ball) ?? PIXI.Texture.WHITE;
    this._starTex = this.assetLoader.getAsset<PIXI.Texture>(MergeGameAssetIds.Star) ?? PIXI.Texture.WHITE;
    this._itemBase = this._cfg().item.radius / Math.max(1, this._ballTex.width * BALL_TEX_FRAC);
    this._launcher = new PIXI.Sprite(this._ballTex);
    this._launcher.anchor.set(0.5);
    this._launcher.eventMode = "none";

    const f = this._cfg().fail;
    this._failText = new PIXI.Text({
      text: f.text,
      style: {
        fill: f.color,
        fontSize: f.fontSize,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        fontWeight: "800",
      },
    });
    this._failText.anchor.set(0.5);
    this._failText.eventMode = "none";
    this._failText.visible = false;
    this._failText.position.set(this._geo!.centerX, (this._geo!.topY + this._geo!.bottomY) / 2);

    // Background fills the whole CANVAS (behind the design-space root), so any
    // margin left inside the aspect band shows the game backdrop, not the page.
    this.addChild(this._bg);
    // Order (bottom → top): board, aim strip + shadows UNDER the items, then the
    // flight items, colliders, launcher, fx, and the FAIL banner on top.
    this._root.addChild(
      this._board,
      this._dash,
      this._guides,
      this._aim,
      this._shadows,
      this._flight,
      this._colliders,
      this._launcher,
      this._fx,
      this._failText,
    );
    this.addChild(this._root);

    // Star burst emitter (framework HudParticleEmitter) lives in the fx layer.
    this._stars = new StarburstEmitter(new ParticleBudget(this._cfg().effects.stars.max), this._cfg(), this._starTex);
    this._fx.addChild(this._stars);

    this._drawBoard();
    this._drawGuides();
    this._drawDashLine();

    this._launcher.y = this._cfg().launcher.y;
    this._aim.y = this._cfg().launcher.y;
    this._drawAim();

    this.eventMode = "static";
    this.on("pointerdown", this._onPointerDown, this);
    this.on("globalpointermove", this._onPointerMove, this);
    this.on("pointerup", this._onPointerUp, this);
    this.on("pointerupoutside", this._onPointerUp, this);
  }

  //  PRESENTER — stage-driven items + launcher + merge visuals

  public createEntity(kindIdx: number, pop: boolean): Physics2DEntityView {
    const g = this._makeBall(kindIdx);
    this._flight.addChild(g);
    if (pop) {
      // Merge product: spawns elsewhere → hide until its first synced transform.
      g.visible = false;
    } else {
      // Launched ball: show it AT the launcher this instant, so it flies up as a
      // continuation of the launcher instead of the launcher vanishing for a frame.
      g.position.set(this._launcherX, this._cfg().launcher.y);
      g.scale.set(this._itemBase * this._itemScale(kindIdx));
      g.visible = true;
    }
    const rec: FlightRec = { g, kindIdx, gx: 0, gy: 0, angle: 0, popT: pop ? 0 : 1, placed: false };
    this._flightRecs.add(rec);
    const recs = this._flightRecs;
    return {
      setTransform(x: number, y: number, angle: number): void {
        rec.gx = x;
        rec.gy = y;
        rec.angle = angle;
        rec.placed = true;
      },
      dispose(): void {
        recs.delete(rec);
        g.destroy();
      },
    };
  }

  public showLauncher(kindIdx: number): void {
    this._currentKind = kindIdx;
    this._ready = true;
    this._launcher.tint = (this._cfg().item.kinds[kindIdx] ?? this._cfg().item.kinds[0]).color;
    this._launcherX = this._geo!.centerX;
    this._targetX = this._geo!.centerX;
    this._launcher.x = this._launcherX;
    this._launcher.visible = true;
    this._launcherSpawnT = 0; // pop the new item in
  }

  public hideLauncher(): void {
    this._ready = false;
    this._launcher.visible = false;
    this._aim.visible = false;
  }

  public setLineState(state: LineState, proximity: number): void {
    this._lineState = state;
    this._lineProximity = proximity;
  }

  public setGameOver(over: boolean): void {
    if (over && !this._failShown) this._failT = 0; // restart the pop-in
    this._failShown = over;
  }

  public playMerge(kindIdx: number, ax: number, ay: number, bx: number, by: number): void {
    const pa = this._geo!.project(ax, ay);
    const pb = this._geo!.project(bx, by);
    const mx = (pa.x + pb.x) / 2;
    const my = (pa.y + pb.y) / 2;
    const mkPart = (p: { x: number; y: number; scale: number }): MergeAnim["parts"][number] => {
      const g = this._makeBall(kindIdx);
      const s = this._itemBase * this._itemScale(kindIdx) * p.scale;
      g.position.set(p.x, p.y);
      g.scale.set(s);
      this._flight.addChild(g);
      return { g, sx: p.x, sy: p.y, ss: s };
    };
    this._mergeAnims.push({ parts: [mkPart(pa), mkPart(pb)], mx, my, e: 0 });
  }

  public onLaunch(cb: (gx: number, gy: number) => void): Unsubscribe {
    this._launchSubs.add(cb);
    return () => this._launchSubs.delete(cb);
  }

  //  PER-FRAME (view-only tweening)

  public tick(dtSeconds: number): void {
    const cfg = this._cfg();
    const dt = Math.max(0, dtSeconds);

    // Launcher: ease X toward the pointer target; keep the aim anchored.
    const a = 1 - Math.exp(-cfg.launcher.moveSmoothing * dt);
    this._launcherX += (this._targetX - this._launcherX) * a;
    this._launcher.x = this._launcherX;
    this._aim.x = this._launcherX;
    this._aim.visible = this._ready;
    if (this._launcherSpawnT < 1) {
      this._launcherSpawnT = Math.min(1, this._launcherSpawnT + dt / Math.max(0.0001, cfg.launcher.spawnTime));
    }
    this._launcher.scale.set(this._itemBase * this._itemScale(this._currentKind) * GameView._popEase(this._launcherSpawnT));

    // Warn blink speeds up with proximity (max = dangerLine.blinkRate); accumulate
    // phase so a changing rate never jumps.
    const dl = cfg.dangerLine;
    const blinkRate = this._lineState === "warn" ? dl.blinkRate * Math.max(0.15, this._lineProximity) : 0;
    this._blinkPhase += blinkRate * dt;
    this._drawDashLine();
    this._tickFlight(dt);
    this._drawShadows();
    this._drawColliders();
    this._tickMerges(dt);
    this._tickEffects(dt);
    this._stars?.update(dt);
    this._tickFail(dt);
  }

  /** Scale-up + fade-in the FAIL banner while game over is shown. */
  private _tickFail(dt: number): void {
    if (!this._failShown) {
      this._failText.visible = false;
      return;
    }
    const f = this._cfg().fail;
    this._failText.visible = true;
    if (this._failT < 1) this._failT = Math.min(1, this._failT + dt / Math.max(0.0001, f.inTime));
    this._failText.alpha = this._failT;
    this._failText.scale.set(f.fromScale + (1 - f.fromScale) * GameView._popEase(this._failT));
  }

  /** Project each stage-driven item onto the board (+ its pop-in scale-up). */
  private _tickFlight(dt: number): void {
    const cfg = this._cfg();
    for (const rec of this._flightRecs) {
      if (!rec.placed) continue;
      const p = this._geo!.project(rec.gx, rec.gy);
      rec.g.visible = true;
      rec.g.position.set(p.x, p.y);
      rec.g.rotation = rec.angle;
      if (rec.popT < 1) rec.popT = Math.min(1, rec.popT + dt / Math.max(0.0001, cfg.launcher.spawnTime));
      rec.g.scale.set(this._itemBase * this._itemScale(rec.kindIdx) * p.scale * GameView._popEase(rec.popT));
    }
  }

  /** Soft drop shadow under each item, offset AWAY from the light (`shadow.angle`).
   * Redrawn each frame in one Graphics under the items, so it tracks them. */
  private _drawShadows(): void {
    const sh = this._cfg().shadow;
    this._shadows.clear();
    if (!sh.enabled) return;
    const rad = ((sh.angle + 180) * Math.PI) / 180; // shadow cast opposite the light
    const ox = Math.cos(rad);
    const oy = Math.sin(rad);
    const drop = (kindIdx: number, sx: number, sy: number, extraScale: number): void => {
      const r = this._cfg().item.radius * this._itemScale(kindIdx) * extraScale;
      const rx = r * sh.scale;
      const cx = sx + ox * sh.distance * extraScale;
      const cy = sy + oy * sh.distance * extraScale;
      this._shadows.ellipse(cx, cy, rx, rx * sh.squash).fill({ color: sh.color, alpha: sh.alpha });
    };
    for (const rec of this._flightRecs) {
      if (!rec.placed) continue;
      const p = this._geo!.project(rec.gx, rec.gy);
      drop(rec.kindIdx, p.x, p.y, p.scale);
    }
    if (this._launcher.visible) {
      drop(this._currentKind, this._launcherX, this._cfg().launcher.y, GameView._popEase(this._launcherSpawnT));
    }
  }

  /** On contact both start together: the pair rushes to the meeting point over the
   * (short) `pullTime` with a snappy ease-out — so the pull is visible while they
   * are still big — and scales down over `shrinkTime`. On finish, remove the
   * graphics and fire the burst. */
  private _tickMerges(dt: number): void {
    const cfg = this._cfg();
    const pull = Math.max(0.0001, cfg.merge.pullTime);
    const shrink = Math.max(0.0001, cfg.merge.shrinkTime);
    const total = Math.max(pull, shrink);
    for (let i = this._mergeAnims.length - 1; i >= 0; i--) {
      const anim = this._mergeAnims[i];
      anim.e += dt;
      const tp = Math.min(1, anim.e / pull);
      const te = 1 - (1 - tp) * (1 - tp); // ease-OUT: fast start → snappy visible pull
      const ts = Math.min(1, anim.e / shrink);
      for (const part of anim.parts) {
        part.g.position.set(part.sx + (anim.mx - part.sx) * te, part.sy + (anim.my - part.sy) * te);
        part.g.scale.set(part.ss * (1 - ts));
      }
      if (anim.e >= total) {
        for (const part of anim.parts) part.g.destroy();
        this._spawnBurst(anim.mx, anim.my);
        this._stars?.burst(anim.mx, anim.my, cfg.effects.stars.count); // star pop as the new item appears
        this._mergeAnims.splice(i, 1);
      }
    }
  }

  /** Expand + fade every burst, then destroy it. */
  private _tickEffects(dt: number): void {
    for (let i = this._effects.length - 1; i >= 0; i--) {
      const e = this._effects[i];
      e.t += dt / Math.max(0.0001, e.dur);
      if (e.t >= 1) {
        e.g.destroy();
        this._effects.splice(i, 1);
        continue;
      }
      e.g.position.set(e.x, e.y);
      const ease = 1 - (1 - e.t) * (1 - e.t);
      this._drawMergeFx(e.g, this._cfg().effects.merge.radius * ease, 1 - e.t);
    }
  }

  //  INPUT — aim anywhere on the board; release to launch

  private _onPointerDown(e: PIXI.FederatedPointerEvent): void {
    if (!this._ready) return;
    const local = this._root.toLocal(e.global);
    if (!this._inZone(local.x, local.y)) return;
    this._dragging = true;
    this._targetX = this._clampLauncherX(local.x);
  }

  private _onPointerMove(e: PIXI.FederatedPointerEvent): void {
    if (!this._dragging) return;
    const local = this._root.toLocal(e.global);
    this._targetX = this._clampLauncherX(local.x);
  }

  private _onPointerUp(): void {
    if (!this._dragging) return;
    this._dragging = false;
    this._aim.visible = false;
    if (!this._ready) return;
    const u = this._geo!.unproject(this._launcherX, this._cfg().launcher.y);
    for (const cb of this._launchSubs) cb(u.gx, u.gy);
  }

  private _inZone(x: number, y: number): boolean {
    const geo = this._geo!;
    if (y < geo.topY || y > geo.bottomY) return false;
    const { left, right } = geo.edgeXAt(y);
    return x >= left && x <= right;
  }

  private _clampLauncherX(x: number): number {
    const geo = this._geo!;
    const cfg = this._cfg();
    const { left, right } = geo.edgeXAt(cfg.launcher.y);
    const pad = cfg.item.radius * this._itemScale(this._currentKind) + cfg.launcher.edgePad;
    const minX = left + pad;
    const maxX = right - pad;
    return minX > maxX ? (left + right) / 2 : Math.max(minX, Math.min(maxX, x));
  }

  //  LAYOUT

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const geo = this._geo!;
    // The framework locks the canvas to the design aspect, so this is a uniform
    // design→canvas scale; centering only absorbs sub-pixel rounding.
    const scale = Math.min(w / geo.designW, h / geo.designH);
    this._root.scale.set(scale);
    this._root.position.set((w - geo.designW * scale) / 2, (h - geo.designH * scale) / 2);
    this.hitArea = new PIXI.Rectangle(0, 0, w, h);
    this._drawBackground(w, h);
  }

  //  DRAWING (design-fixed — drawn once)

  private _drawBackground(width: number, height: number): void {
    const bg = this._cfg().background;
    const grad = new PIXI.FillGradient({
      type: "linear",
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      textureSpace: "local",
      colorStops: [
        { offset: 0, color: bg.top },
        { offset: 1, color: bg.bottom },
      ],
    });
    this._bg.clear();
    this._bg.rect(0, 0, width, height).fill(grad);
  }

  private _drawBoard(): void {
    const b = this._cfg().board;
    const geo = this._geo!;
    // Vertical fade over the trapezoid (top = far/darker → bottom = near/lighter).
    const fill = new PIXI.FillGradient({
      type: "linear",
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      textureSpace: "local",
      colorStops: [
        { offset: 0, color: b.fillTop },
        { offset: 1, color: b.fillBottom },
      ],
    });
    this._board.clear();
    this._board
      .moveTo(geo.centerX - geo.halfBottom, geo.bottomY)
      .lineTo(geo.centerX + geo.halfBottom, geo.bottomY)
      .lineTo(geo.centerX + geo.halfTop, geo.topY)
      .lineTo(geo.centerX - geo.halfTop, geo.topY)
      .closePath()
      .fill(fill)
      .stroke({ width: b.strokeWidth, color: b.strokeColor, join: "round" });
  }

  /** The dashed danger line, colored by its state: normal, blinking red (warn),
   * or solid red (crossed). Redrawn each frame so the blink animates. */
  private _drawDashLine(): void {
    const d = this._cfg().dash;
    const dl = this._cfg().dangerLine;
    const geo = this._geo!;
    let color = d.color;
    let alpha = d.alpha;
    let width = d.thickness;
    if (this._lineState === "warn") {
      color = dl.color;
      alpha = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(this._blinkPhase * Math.PI * 2));
      width = d.thickness + 1;
    } else if (this._lineState === "crossed") {
      color = dl.color;
      alpha = 0.95;
      width = d.thickness + 2;
    }
    this._dash.clear();
    const { left, right } = geo.edgeXAt(d.y);
    const x1 = right - d.inset;
    const seg = Math.max(1, d.length);
    const gap = Math.max(0, d.gap);
    let x = left + d.inset;
    while (x < x1) {
      const xe = Math.min(x + seg, x1);
      this._dash.moveTo(x, d.y).lineTo(xe, d.y);
      x = xe + gap;
    }
    this._dash.stroke({ width, color, alpha, cap: "round" });
  }

  private _drawGuides(): void {
    const gc = this._cfg().guides;
    const geo = this._geo!;
    this._guides.clear();
    if (!gc.show) return;
    const vline = (gx: number): void => {
      const a = geo.project(gx, 0);
      const b = geo.project(gx, geo.gH);
      this._guides.moveTo(a.x, a.y).lineTo(b.x, b.y);
    };
    const hline = (gy: number): void => {
      const a = geo.project(0, gy);
      const b = geo.project(geo.gW, gy);
      this._guides.moveTo(a.x, a.y).lineTo(b.x, b.y);
    };
    vline(0);
    vline(geo.gW);
    hline(0);
    hline(geo.gH);
    const lanes = Math.max(1, Math.floor(gc.lanes));
    for (let k = 1; k < lanes; k++) vline((k / lanes) * geo.gW);
    this._guides.stroke({ width: gc.thickness, color: gc.color, alpha: gc.alpha });
  }

  private _drawAim(): void {
    const a = this._cfg().aim;
    const g = this._aim;
    g.clear();
    const baseHalf = a.baseWidth / 2;
    const N = 28;
    for (let i = 0; i < N; i++) {
      const t0 = i / N;
      const t1 = (i + 1) / N;
      const y0 = -a.length * t0;
      const y1 = -a.length * t1;
      const w0 = baseHalf * (1 - t0);
      const w1 = baseHalf * (1 - t1);
      const alpha = a.alpha * (1 - t0);
      g.moveTo(-w0, y0).lineTo(w0, y0).lineTo(w1, y1).lineTo(-w1, y1).closePath().fill({ color: a.color, alpha });
    }
  }

  /** A ball sprite (loaded texture) tinted by the kind's color, centered. Callers
   * set its scale (`_itemBase × itemScale × perspective × pop-in`). */
  private _makeBall(kindIdx: number): PIXI.Sprite {
    const kind = this._cfg().item.kinds[kindIdx] ?? this._cfg().item.kinds[0];
    const sp = new PIXI.Sprite(this._ballTex);
    sp.anchor.set(0.5);
    sp.tint = kind.color;
    sp.eventMode = "none";
    return sp;
  }

  /** DEBUG collider outlines for every live item, drawn in ROOT (design) space with
   * a CONSTANT stroke width — so a big item's outline is no thicker than a small
   * one. Appends each item's projected collider shape (rotation-aware for squares),
   * then strokes them all once. Toggled by `physics.showColliders`. */
  private _drawColliders(): void {
    const cfg = this._cfg();
    const p = cfg.physics;
    this._colliders.clear();
    if (!p.showColliders) return;
    for (const rec of this._flightRecs) {
      if (!rec.placed) continue;
      const pr = this._geo!.project(rec.gx, rec.gy);
      this._appendCollider(rec.kindIdx, pr.x, pr.y, pr.scale, rec.angle);
    }
    // The launcher preview (design space, no perspective, no rotation).
    if (this._launcher.visible) {
      this._appendCollider(this._currentKind, this._launcherX, this._cfg().launcher.y, GameView._popEase(this._launcherSpawnT), 0);
    }
    this._colliders.stroke({ width: p.colliderOutline.width, color: p.colliderOutline.color, alpha: p.colliderOutline.alpha });
  }

  /** Append one item's collider outline (design space) at a projected center/size. */
  private _appendCollider(kindIdx: number, sx: number, sy: number, extraScale: number, angle: number): void {
    const cfg = this._cfg();
    const kind = cfg.item.kinds[kindIdx] ?? cfg.item.kinds[0];
    const h = cfg.item.radius * this._itemScale(kindIdx) * cfg.physics.colliderScale * extraScale;
    const g = this._colliders;
    if (kind.shape === "square") {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const cornX = [-h, h, h, -h];
      const cornY = [-h, -h, h, h];
      for (let i = 0; i < 4; i++) {
        const x = sx + cornX[i] * c - cornY[i] * s;
        const y = sy + cornX[i] * s + cornY[i] * c;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
    } else {
      g.circle(sx, sy, h);
    }
  }

  private _spawnBurst(sx: number, sy: number): void {
    const g = new PIXI.Graphics();
    g.eventMode = "none";
    this._fx.addChild(g);
    this._effects.push({ g, x: sx, y: sy, t: 0, dur: this._cfg().effects.merge.time });
  }

  /** Nested arcs fading from transparent (center) to opaque (rim); flat diameter open. */
  private _drawMergeFx(g: PIXI.Graphics, radius: number, alpha: number): void {
    const fx = this._cfg().effects.merge;
    g.clear();
    const N = Math.max(2, fx.bands);
    const rIn = radius * fx.innerRatio;
    const step = (radius - rIn) / (N - 1);
    for (let i = 0; i < N; i++) {
      const f = i / (N - 1);
      g.arc(0, 0, rIn + step * i, Math.PI, Math.PI * 2);
      g.stroke({ width: step * 1.6 + 1, color: fx.color, alpha: fx.opacity * alpha * f });
    }
  }

  //  HELPERS

  private _cfg(): MergeGameConfig {
    return this._config ?? new MergeGameConfig();
  }

  private _itemScale(kindIdx: number): number {
    const cfg = this._cfg();
    const k = cfg.item.kinds[kindIdx];
    return cfg.item.scale * (k ? k.scale : 1);
  }

  /** easeOutBack — a small overshoot for a lively pop-in. */
  private static _popEase(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const u = t - 1;
    return 1 + c3 * u * u * u + c1 * u * u;
  }

  public override destroy(): void {
    this.off("pointerdown", this._onPointerDown, this);
    this.off("globalpointermove", this._onPointerMove, this);
    this.off("pointerup", this._onPointerUp, this);
    this.off("pointerupoutside", this._onPointerUp, this);
    this._launchSubs.clear();
    for (const rec of this._flightRecs) rec.g.destroy();
    this._flightRecs.clear();
    for (const anim of this._mergeAnims) for (const part of anim.parts) part.g.destroy();
    this._mergeAnims.length = 0;
    for (const e of this._effects) e.g.destroy();
    this._effects.length = 0;
    this._stars?.destroy();
    this._stars = null;
    super.destroy();
  }
}
