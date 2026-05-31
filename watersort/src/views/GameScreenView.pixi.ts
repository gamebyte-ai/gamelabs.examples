import * as PIXI from "pixi.js";
import gsap from "gsap";
import {
  ScreenView,
  ButtonComponent,
  UIComponentsStyleIds,
  type ButtonComponentStyle,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "./IGameScreenView";
import type { Bottle } from "../models/Bottle.js";
import { WaterSortConfig } from "../WaterSortConfig.js";
import { WaterSortAssetIds } from "../WaterSortAssetIds.js";

type BottleVisual = {
  container: PIXI.Container;
  bottleSprite: PIXI.Sprite | null;
  shineSprite: PIXI.Sprite | null;
  segments: PIXI.Graphics;
  baseX: number;
  baseY: number;
  busy: boolean;
};

export class GameScreenView extends ScreenView implements IGameScreenView {
  private _config: WaterSortConfig | null = null;
  private _bgTile: PIXI.TilingSprite | null = null;
  private _bottlesContainer: PIXI.Container | null = null;
  private _bottleVisuals: BottleVisual[] = [];

  private _levelText: PIXI.Text | null = null;
  private _movesText: PIXI.Text | null = null;
  private _restartBtn: ButtonComponent | null = null;

  private readonly _bottleTapListeners = new Set<(index: number) => void>();
  private readonly _restartListeners = new Set<() => void>();

  private _screenWidth = 0;
  private _screenHeight = 0;

  public override inject(resolver: any): void {
    super.inject(resolver);
    this._config = resolver.getInstance(WaterSortConfig);
  }

  public override postInitialize(): void {
    super.postInitialize();

    const bgTexture = this.assetLoader.getAsset<PIXI.Texture>(WaterSortAssetIds.Background);
    if (bgTexture) {
      this._bgTile = new PIXI.TilingSprite({ texture: bgTexture, width: 1, height: 1 });
      this.addChild(this._bgTile);
    }

    this._levelText = new PIXI.Text({
      text: "Level 1",
      style: { fill: 0x4a5568, fontSize: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial", fontWeight: "800" }
    });
    this._levelText.position.set(20, 20);
    this.addChild(this._levelText);

    this._movesText = new PIXI.Text({
      text: "Moves: 0",
      style: { fill: 0x718096, fontSize: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial", fontWeight: "600" }
    });
    this._movesText.position.set(20, 50);
    this.addChild(this._movesText);

    const restartBtnStyle = this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button, {
      label: { fontSize: 14, color: 0xe8eef6 },
    });
    this._restartBtn = new ButtonComponent(this.assetLoader, restartBtnStyle, {
      width: 100, height: 36,
      label: "Restart",
    });
    this.addChild(this._restartBtn);
    this._restartBtn.onPress(() => {
      for (const cb of this._restartListeners) cb();
    });

    this._bottlesContainer = new PIXI.Container();
    this.addChild(this._bottlesContainer);
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this._screenWidth = Math.max(1, width);
    this._screenHeight = Math.max(1, height);

    if (this._bgTile) {
      this._bgTile.width = this._screenWidth;
      this._bgTile.height = this._screenHeight;
    }
    if (this._restartBtn) {
      this._restartBtn.position.set(this._screenWidth - 120, 20);
    }
    this._repositionBottles();
  }

  // ── Render ──

  public renderBottles(bottles: readonly Bottle[], colors: readonly number[]): void {
    for (const v of this._bottleVisuals) v.container.destroy({ children: true });
    this._bottleVisuals = [];

    const cfg = this._config!;
    const bottleTexture = this.assetLoader.getAsset<PIXI.Texture>(WaterSortAssetIds.Bottle);
    const shineTexture = this.assetLoader.getAsset<PIXI.Texture>(WaterSortAssetIds.BottleShine);

    for (let i = 0; i < bottles.length; i++) {
      const bottle = bottles[i]!;
      const container = new PIXI.Container();
      container.eventMode = "static";
      (container as any).cursor = "pointer";

      const segments = new PIXI.Graphics();
      this._drawSegments(segments, bottle, colors);
      container.addChild(segments);

      let bottleSprite: PIXI.Sprite | null = null;
      if (bottleTexture) {
        bottleSprite = new PIXI.Sprite(bottleTexture);
        bottleSprite.width = cfg.bottleWidth;
        bottleSprite.height = cfg.bottleHeight;
        container.addChild(bottleSprite);
      } else {
        const bg = new PIXI.Graphics();
        bg.roundRect(0, 0, cfg.bottleWidth, cfg.bottleHeight, cfg.bottleRadius);
        bg.fill({ color: cfg.bottleBgColor, alpha: cfg.bottleBgAlpha });
        bg.stroke({ color: cfg.bottleBorderColor, width: cfg.bottleBorderWidth });
        container.addChild(bg);
      }

      let shineSprite: PIXI.Sprite | null = null;
      if (shineTexture) {
        shineSprite = new PIXI.Sprite(shineTexture);
        shineSprite.width = 10;
        shineSprite.height = cfg.bottleHeight - 30;
        shineSprite.position.set(8, 15);
        shineSprite.alpha = 0.7;
        container.addChild(shineSprite);
      }

      container.on("pointertap", () => {
        const vis = this._bottleVisuals[i];
        if (vis?.busy) return;
        for (const cb of this._bottleTapListeners) cb(i);
      });

      this._bottlesContainer!.addChild(container);
      this._bottleVisuals.push({ container, bottleSprite, shineSprite, segments, baseX: 0, baseY: 0, busy: false });
    }

    this._repositionBottles();
  }

  // ── Animations ──

  public animateSelect(index: number): Promise<void> {
    const vis = this._bottleVisuals[index];
    if (!vis) return Promise.resolve();
    vis.busy = true;
    return new Promise(resolve => {
      gsap.to(vis.container, {
        y: vis.baseY - this._config!.selectedLiftY,
        duration: 0.15,
        ease: "back.out(2)",
        onComplete: () => { vis.busy = false; resolve(); }
      });
    });
  }

  public animateDeselect(index: number): Promise<void> {
    const vis = this._bottleVisuals[index];
    if (!vis) return Promise.resolve();
    vis.busy = true;
    return new Promise(resolve => {
      gsap.to(vis.container, {
        y: vis.baseY,
        duration: 0.12,
        ease: "power2.in",
        onComplete: () => { vis.busy = false; resolve(); }
      });
    });
  }

  public animatePour(fromIdx: number, toIdx: number, segmentCount: number, colorIdx: number): Promise<void> {
    const fromVis = this._bottleVisuals[fromIdx];
    const toVis = this._bottleVisuals[toIdx];
    if (!fromVis || !toVis) return Promise.resolve();

    const cfg = this._config!;
    const color = cfg.liquidColors[colorIdx % cfg.liquidColors.length]!;
    fromVis.busy = true;
    toVis.busy = true;

    const pad = 6;
    const segH = cfg.segmentHeight;
    const innerW = cfg.bottleWidth - pad * 2;
    const groupH = segmentCount * segH;

    // Read old positions from the pre-pour segment graphics (still on screen)
    const fromBounds = fromVis.segments.getLocalBounds();
    const oldFromTop = fromBounds.y;
    const pourGroupBottom = oldFromTop + groupH; // bottom of the poured group = top of remaining

    const toBounds = toVis.segments.getLocalBounds();
    const toOldStackTop = toBounds.height > 0 ? toBounds.y : (cfg.bottleHeight - pad);

    // Mask the source segments to only show the remaining (lower) part
    const fromMask = new PIXI.Graphics();
    fromMask.rect(0, pourGroupBottom, cfg.bottleWidth, cfg.bottleHeight);
    fromMask.fill({ color: 0xffffff });
    fromVis.container.addChild(fromMask);
    fromVis.segments.mask = fromMask;

    // Target segments stay visible as-is (they show the old state which is correct)

    // Animated: pour-out (source top group shrinks upward)
    const pourOutGfx = new PIXI.Graphics();
    for (let s = 0; s < segmentCount; s++) {
      pourOutGfx.rect(0, s * segH, innerW, segH);
      pourOutGfx.fill({ color, alpha: 0.9 });
    }
    pourOutGfx.pivot.set(0, groupH);
    pourOutGfx.position.set(pad, pourGroupBottom);
    fromVis.container.addChild(pourOutGfx);

    // Animated: pour-in (target new group grows upward)
    const pourInGfx = new PIXI.Graphics();
    for (let s = 0; s < segmentCount; s++) {
      pourInGfx.rect(0, s * segH, innerW, segH);
      pourInGfx.fill({ color, alpha: 0.9 });
    }
    pourInGfx.pivot.set(0, groupH);
    pourInGfx.position.set(pad, toOldStackTop);
    pourInGfx.scale.set(1, 0);
    toVis.container.addChildAt(pourInGfx, 0);

    // Determine pour side: source tilts toward target
    const fromLeft = fromVis.baseX < toVis.baseX;
    const tiltAngle = fromLeft ? 0.85 : -0.85; // ~49 degrees

    // Set pivot at the top-center of the bottle so it rotates from its mouth
    fromVis.container.pivot.set(cfg.bottleWidth / 2, 0);
    // Adjust position to compensate for the new pivot
    fromVis.container.x += cfg.bottleWidth / 2;

    // Target position: next to the target bottle, raised by half height
    const sideOffset = fromLeft ? -cfg.bottleWidth * 0.3 : cfg.bottleWidth * 1.3;
    const pourX = toVis.baseX + sideOffset + cfg.bottleWidth / 2;
    const pourY = toVis.baseY - cfg.bottleHeight * 0.5;

    return new Promise(resolve => {
      const tl = gsap.timeline({
        onComplete: () => {
          pourOutGfx.destroy();
          pourInGfx.destroy();
          fromVis.segments.mask = null;
          fromMask.destroy();
          // Reset pivot and rotation
          fromVis.container.pivot.set(0, 0);
          fromVis.container.rotation = 0;
          fromVis.busy = false;
          toVis.busy = false;
          resolve();
        }
      });

      // 1. Move source next to target and tilt
      tl.to(fromVis.container, {
        x: pourX,
        y: pourY,
        rotation: tiltAngle,
        duration: 0.3,
        ease: "power2.inOut"
      });

      // 2. Pour out (shrink upward)
      tl.fromTo(pourOutGfx.scale, { y: 1 }, {
        y: 0,
        duration: 0.25,
        ease: "power2.in"
      }, ">-0.05");

      // 3. Pour in (grow upward)
      tl.to(pourInGfx.scale, {
        y: 1,
        duration: 0.25,
        ease: "power2.out"
      }, ">-0.1");

      // 4. Move source back and un-tilt (pivot still at top-center)
      tl.to(fromVis.container, {
        x: fromVis.baseX + cfg.bottleWidth / 2,
        y: fromVis.baseY,
        rotation: 0,
        duration: 0.3,
        ease: "power2.inOut"
      }, ">-0.05");
    });
  }

  // ── HUD ──

  public setLevel(level: number): void {
    if (this._levelText) this._levelText.text = `Level ${level}`;
  }

  public setMoves(moves: number): void {
    if (this._movesText) this._movesText.text = `Moves: ${moves}`;
  }

  public onBottleTapped(cb: (index: number) => void): Unsubscribe {
    this._bottleTapListeners.add(cb);
    return () => this._bottleTapListeners.delete(cb);
  }

  public onRestartTapped(cb: () => void): Unsubscribe {
    this._restartListeners.add(cb);
    return () => this._restartListeners.delete(cb);
  }

  // ── Drawing ──

  private _drawSegments(gfx: PIXI.Graphics, bottle: Bottle, colors: readonly number[]): void {
    const cfg = this._config!;
    const segs = bottle.segments;
    const pad = 6;
    const innerW = cfg.bottleWidth - pad * 2;
    const segH = cfg.segmentHeight;

    for (let i = 0; i < segs.length; i++) {
      const colorIdx = segs[i]!;
      const color = colors[colorIdx % colors.length]!;
      const sy = cfg.bottleHeight - pad - (i + 1) * segH;

      if (i === 0) {
        const r = cfg.bottleRadius - 2;
        const x1 = pad, x2 = pad + innerW;
        const y1 = sy, y2 = sy + segH;
        gfx.moveTo(x1, y1);
        gfx.lineTo(x2, y1);
        gfx.lineTo(x2, y2 - r);
        gfx.arcTo(x2, y2, x2 - r, y2, r);
        gfx.lineTo(x1 + r, y2);
        gfx.arcTo(x1, y2, x1, y2 - r, r);
        gfx.closePath();
      } else {
        gfx.rect(pad, sy, innerW, segH);
      }
      gfx.fill({ color, alpha: 0.9 });
    }
  }

  // ── Positioning ──

  private _repositionBottles(): void {
    if (!this._bottlesContainer || this._bottleVisuals.length === 0) return;
    const cfg = this._config!;
    const count = this._bottleVisuals.length;

    const maxPerRow = Math.max(1, Math.floor((this._screenWidth - 40) / (cfg.bottleWidth + cfg.bottleGap)));
    const rows = Math.ceil(count / maxPerRow);
    const rowGap = 28;
    const totalH = rows * cfg.bottleHeight + (rows - 1) * rowGap;
    const startY = (this._screenHeight - totalH) / 2 + cfg.selectedLiftY;

    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / maxPerRow);
      const col = i % maxPerRow;
      const itemsInRow = row < rows - 1 ? maxPerRow : count - row * maxPerRow;
      const rowW = itemsInRow * cfg.bottleWidth + (itemsInRow - 1) * cfg.bottleGap;
      const startX = (this._screenWidth - rowW) / 2;

      const x = startX + col * (cfg.bottleWidth + cfg.bottleGap);
      const y = startY + row * (cfg.bottleHeight + rowGap);
      const vis = this._bottleVisuals[i]!;
      vis.baseX = x;
      vis.baseY = y;
      vis.container.position.set(x, y);
    }
  }

  public override preDestroy(): void {
    this._bottleTapListeners.clear();
    this._restartListeners.clear();
    for (const v of this._bottleVisuals) v.container.destroy({ children: true });
    this._bottleVisuals = [];
  }
}
