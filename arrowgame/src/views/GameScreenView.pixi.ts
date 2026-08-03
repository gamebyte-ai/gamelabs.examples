import * as PIXI from "pixi.js";
import { gsap } from "gsap";
import { ScreenView } from "@gamebyte/gamelabsjs";
import type { IInstanceResolver } from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "./IGameScreenView";
import { Board2D } from "./Board2D.pixi";
import { ArrowGameConfig } from "../ArrowGameConfig";
import { ArrowGameAssetIds } from "../ArrowGameAssetIds";
import type { LevelDef } from "../constants/GameTypes";
import type { ArrowState } from "../utilities/GameState";

const FONT = "Fredoka, system-ui, -apple-system, Segoe UI, Roboto, Arial";

/** Text style with mandatory stroke + shadow for readability on any background. */
function labelStyle(fontSize: number): PIXI.TextStyle {
  return new PIXI.TextStyle({
    fontFamily: FONT,
    fontSize,
    fontWeight: "700",
    fill: "#ffffff",
    stroke: { color: "#2a2540", width: 5 },
    dropShadow: { color: "#00000055", blur: 3, distance: 3, angle: Math.PI / 4 },
  });
}

/**
 * HUD (2D) overlay: level label (top), restart button (top-right),
 * and a level-complete overlay with a NEXT button.
 */
export class GameScreenView extends ScreenView implements IGameScreenView {
  private readonly _levelLabel = new PIXI.Text({ text: "", style: labelStyle(30) });
  private _restartBtn: PIXI.Container | null = null;

  // Level complete overlay.
  private readonly _completeOverlay = new PIXI.Container();
  private _completeBg: PIXI.Graphics | null = null;
  private _nextBtn: PIXI.Container | null = null;

  private _restartCb: (() => void) | null = null;
  private _nextCb: (() => void) | null = null;

  private _config: ArrowGameConfig | null = null;
  private _board: Board2D | null = null;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(ArrowGameConfig);
  }

  public override postInitialize(): void {
    super.postInitialize();

    // 2D board (dot grid + rope arrows) — added FIRST so it sits behind the HUD.
    const arrowTex = this.assetLoader.getAsset<PIXI.Texture>(ArrowGameAssetIds.ArrowUp) ?? null;
    this._board = new Board2D(this._config ?? new ArrowGameConfig(), arrowTex);
    this.addChild(this._board);

    this._levelLabel.anchor.set(0.5, 0);
    this.addChild(this._levelLabel);

    this._restartBtn = this.buildIconButton(ArrowGameAssetIds.BtnRestart, 64, () => this._restartCb?.());
    this.addChild(this._restartBtn);

    this.buildCompleteOverlay();
    this.addChild(this._completeOverlay);
    this._completeOverlay.visible = false;
  }

  private buildIconButton(assetId: string, size: number, onTap: () => void): PIXI.Container {
    const btn = new PIXI.Container();
    const tex = this.assetLoader.getAsset<PIXI.Texture>(assetId);
    const sprite = tex ? new PIXI.Sprite(tex) : new PIXI.Sprite();
    sprite.anchor.set(0.5);
    sprite.width = size;
    sprite.height = size;
    btn.addChild(sprite);

    btn.eventMode = "static";
    btn.cursor = "pointer";
    // Explicit hitArea (centered) so the HUD hit-test never throws on pointer move.
    btn.hitArea = new PIXI.Rectangle(-size / 2, -size / 2, size, size);
    btn.on("pointerdown", () => {
      btn.scale.set(0.92);
    });
    btn.on("pointerup", () => {
      btn.scale.set(1);
      onTap();
    });
    btn.on("pointerupoutside", () => btn.scale.set(1));
    return btn;
  }

  private buildCompleteOverlay(): void {
    this._completeBg = new PIXI.Graphics();
    this._completeBg.eventMode = "static";
    this._completeOverlay.addChild(this._completeBg);

    const title = new PIXI.Text({ text: "LEVEL COMPLETE", style: labelStyle(40) });
    title.anchor.set(0.5);
    title.name = "title";
    this._completeOverlay.addChild(title);

    this._nextBtn = this.buildImageButton(ArrowGameAssetIds.BtnNext, 200, 100, () => this._nextCb?.());
    this._completeOverlay.addChild(this._nextBtn);

    // Small celebratory confetti burst (lightweight procedural, no assets).
    this._confetti = new PIXI.Container();
    this._completeOverlay.addChild(this._confetti);
  }

  private _confetti: PIXI.Container | null = null;
  private static readonly CONFETTI_COLORS = [0xff5a5f, 0x4aa3ff, 0xffcf3f, 0x5bd670, 0xff934a];

  private spawnConfetti(width: number, height: number): void {
    if (!this._confetti) return;
    this._confetti.removeChildren();
    const cx = width / 2;
    const cy = height * 0.38;
    for (let i = 0; i < 18; i++) {
      const g = new PIXI.Graphics();
      const color = GameScreenView.CONFETTI_COLORS[i % GameScreenView.CONFETTI_COLORS.length];
      g.rect(-4, -4, 8, 8).fill({ color });
      g.x = cx;
      g.y = cy;
      this._confetti.addChild(g);

      const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 90 + Math.random() * 70;
      gsap.to(g, {
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist - 40,
        rotation: Math.random() * Math.PI * 2,
        alpha: 0,
        duration: 0.7 + Math.random() * 0.3,
        ease: "power2.out",
      });
    }
  }

  private buildImageButton(assetId: string, w: number, h: number, onTap: () => void): PIXI.Container {
    const btn = new PIXI.Container();
    const tex = this.assetLoader.getAsset<PIXI.Texture>(assetId);
    const sprite = tex ? new PIXI.Sprite(tex) : new PIXI.Sprite();
    sprite.anchor.set(0.5);
    sprite.width = w;
    sprite.height = h;
    btn.addChild(sprite);

    btn.eventMode = "static";
    btn.cursor = "pointer";
    btn.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h);
    btn.on("pointerdown", () => btn.scale.set(0.94));
    btn.on("pointerup", () => {
      btn.scale.set(1);
      onTap();
    });
    btn.on("pointerupoutside", () => btn.scale.set(1));
    return btn;
  }

  public setLevelLabel(level: number): void {
    this._levelLabel.text = `LEVEL ${level}`;
  }

  public onRestart(cb: () => void): void {
    this._restartCb = cb;
  }

  public showLevelComplete(onNext: () => void): void {
    this._nextCb = onNext;
    this._completeOverlay.visible = true;
    this._completeOverlay.alpha = 0;
    this._completeOverlay.scale.set(0.9);
    this.layoutComplete();
    this.spawnConfetti(this._w, this._h);

    gsap.killTweensOf(this._completeOverlay);
    gsap.to(this._completeOverlay, { alpha: 1, duration: 0.35, ease: "power1.out" });
    gsap.to(this._completeOverlay.scale, { x: 1, y: 1, duration: 0.4, ease: "back.out(1.6)" });
  }

  public hideLevelComplete(): void {
    this._completeOverlay.visible = false;
  }

  // Fixed safe-area padding (iPhone notch / Dynamic Island) — v4.0.0 has no
  // safeAreaInsets getter on HudViewBase, so use conservative constants.
  private static readonly SAFE_TOP = 59;
  private static readonly SAFE_SIDE = 12;

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    const top = GameScreenView.SAFE_TOP;
    const side = GameScreenView.SAFE_SIDE;

    this._levelLabel.x = width / 2;
    this._levelLabel.y = top + 8;

    if (this._restartBtn) {
      this._restartBtn.x = width - side - 40;
      this._restartBtn.y = top + 40;
    }

    this.storeSize(width, height);
    this._board?.setViewSize(width, height);
    if (this._completeOverlay.visible) this.layoutComplete();
  }

  // --- 2D board (delegated to Board2D) ---
  public buildLevel(level: LevelDef, arrows: readonly ArrowState[]): void {
    this._board?.setViewSize(this._w, this._h);
    this._board?.buildLevel(level, arrows);
  }
  public clearLevel(): void {
    this._board?.clearLevel();
  }
  public onArrowTapped(cb: (arrowId: number) => void): void {
    this._board?.onArrowTapped(cb);
  }
  public slideArrowOut(block: ArrowState, onDone: () => void): void {
    if (this._board) this._board.slideArrowOut(block, onDone);
    else onDone();
  }
  public shakeArrow(arrowId: number): void {
    this._board?.shakeArrow(arrowId);
  }

  private _w = 390;
  private _h = 844;
  private storeSize(width: number, height: number): void {
    this._w = width;
    this._h = height;
  }

  private layoutComplete(): void {
    const width = this._w;
    const height = this._h;
    if (this._completeBg) {
      this._completeBg.clear();
      this._completeBg.rect(0, 0, width, height).fill({ color: 0x1b1730, alpha: 0.72 });
      this._completeBg.hitArea = new PIXI.Rectangle(0, 0, width, height);
    }
    const title = this._completeOverlay.getChildByName("title") as PIXI.Text | null;
    if (title) {
      title.x = width / 2;
      title.y = height * 0.38;
    }
    if (this._nextBtn) {
      this._nextBtn.x = width / 2;
      this._nextBtn.y = height * 0.58;
    }
  }
}
