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

/** Small, clean level-label style: no outline. Size/color come from config. */
function levelLabelStyle(fontSize: number, color: number): PIXI.TextStyle {
  return new PIXI.TextStyle({
    fontFamily: FONT,
    fontSize,
    fontWeight: "600",
    fill: color,
  });
}

/**
 * HUD (2D) overlay: level label (top), restart button (top-right),
 * and a level-complete overlay with a NEXT button.
 */
export class GameScreenView extends ScreenView implements IGameScreenView {
  private readonly _levelLabel = new PIXI.Text({ text: "", style: levelLabelStyle(18, 0x3a3550) });
  private _restartBtn: PIXI.Container | null = null;

  // Level complete overlay.
  private readonly _completeOverlay = new PIXI.Container();
  private _completeBg: PIXI.Graphics | null = null;
  private _nextBtn: PIXI.Container | null = null;

  private _restartCb: (() => void) | null = null;
  private _nextCb: (() => void) | null = null;

  private _config: ArrowGameConfig | null = null;
  private _board: Board2D | null = null;
  private readonly _bg = new PIXI.Graphics();
  private readonly _letterbox = new PIXI.Graphics();
  // Current letterboxed play rect (screen px). Defaults to the full view.
  private _playX = 0;
  private _playY = 0;
  private _playW = 390;
  private _playH = 844;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(ArrowGameConfig);
  }

  public override postInitialize(): void {
    super.postInitialize();

    // Warm gradient backdrop — added FIRST so everything draws on top of it.
    this.addChild(this._bg);

    // 2D board (dot grid + rope arrows) — behind the HUD, above the background.
    this._board = new Board2D(this._config ?? new ArrowGameConfig());
    this.addChild(this._board);

    this._levelLabel.anchor.set(0.5, 0);
    if (this._config) {
      this._levelLabel.style = levelLabelStyle(this._config.levelLabelSize, this._config.levelLabelColor);
    }
    this.addChild(this._levelLabel);

    this._restartBtn = this.buildIconButton(ArrowGameAssetIds.BtnRestart, 64, () => this._restartCb?.());
    this.addChild(this._restartBtn);

    this.buildCompleteOverlay();
    this.addChild(this._completeOverlay);
    this._completeOverlay.visible = false;

    // Letterbox bars — added LAST so they mask any content (board or overlay) that
    // spills outside the aspect-clamped play rect. Non-interactive.
    this._letterbox.eventMode = "none";
    this.addChild(this._letterbox);
  }

  /** Aspect-clamped play rect: the largest centered rect within [minAspect,
   * maxAspect]. Screens taller than min or wider than max get letterbox bars. */
  private computePlayRect(width: number, height: number): void {
    const cfg = this._config ?? new ArrowGameConfig();
    const aspect = width / height;
    let pw = width;
    let ph = height;
    if (aspect < cfg.letterboxMinAspect) {
      ph = width / cfg.letterboxMinAspect; // too tall → shrink height (top/bottom bars)
    } else if (aspect > cfg.letterboxMaxAspect) {
      pw = height * cfg.letterboxMaxAspect; // too wide → shrink width (left/right bars)
    }
    this._playW = pw;
    this._playH = ph;
    this._playX = (width - pw) / 2;
    this._playY = (height - ph) / 2;
  }

  /** Draw the opaque bars filling the screen area outside the play rect. */
  private drawLetterbox(width: number, height: number): void {
    const cfg = this._config ?? new ArrowGameConfig();
    const g = this._letterbox;
    g.clear();
    const x = this._playX;
    const y = this._playY;
    const w = this._playW;
    const h = this._playH;
    const color = cfg.letterboxColor;
    if (y > 0.5) {
      g.rect(0, 0, width, y).fill({ color });
      g.rect(0, y + h, width, height - (y + h)).fill({ color });
    }
    if (x > 0.5) {
      g.rect(0, y, x, h).fill({ color });
      g.rect(x + w, y, width - (x + w), h).fill({ color });
    }
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
  // Board keep-out bands: top covers the safe area + level label + restart button
  // (restart sits at SAFE_TOP+40 with a 64px icon → ~131px); bottom leaves room
  // for the home indicator.
  private static readonly BOARD_TOP_RESERVE = 140;
  private static readonly BOARD_BOTTOM_RESERVE = 40;

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    const top = GameScreenView.SAFE_TOP;
    const side = GameScreenView.SAFE_SIDE;

    this.storeSize(width, height);
    this.computePlayRect(width, height);
    // Everything positions RELATIVE to the letterboxed play rect.
    const px = this._playX;
    const py = this._playY;

    this._levelLabel.x = px + this._playW / 2;
    this._levelLabel.y = py + top + (this._config?.levelLabelTop ?? 8);

    if (this._restartBtn) {
      this._restartBtn.x = px + this._playW - side - 40;
      this._restartBtn.y = py + top + 40;
    }

    this.drawBackground(width, height);
    // Keep the board clear of the top HUD (level label + restart button) and the
    // bottom safe area, so a tall board never slides under the level label.
    this._board?.setInsets(GameScreenView.BOARD_TOP_RESERVE, GameScreenView.BOARD_BOTTOM_RESERVE);
    this._board?.setPlayRect(px, py, this._playW, this._playH);
    this.drawLetterbox(width, height);
    if (this._completeOverlay.visible) this.layoutComplete();
  }

  // --- 2D board (delegated to Board2D) ---
  public buildLevel(level: LevelDef, arrows: readonly ArrowState[]): void {
    this._board?.setPlayRect(this._playX, this._playY, this._playW, this._playH);
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
  public nudgeArrow(block: ArrowState, adv: number, obstacleId: number, onDone: () => void): void {
    if (this._board) this._board.nudgeArrow(block, adv, obstacleId, onDone);
    else onDone();
  }

  private _w = 390;
  private _h = 844;
  private storeSize(width: number, height: number): void {
    this._w = width;
    this._h = height;
  }

  /** Full-screen vertical warm gradient behind everything. */
  private drawBackground(width: number, height: number): void {
    const cfg = this._config ?? new ArrowGameConfig();
    // Normalized LOCAL space (0..1 over the shape) so the vertical blend is
    // size-independent — pixel coords here map to texture space and collapse the
    // gradient to a single flat color.
    const grad = new PIXI.FillGradient({
      type: "linear",
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      textureSpace: "local",
      colorStops: [
        { offset: 0, color: cfg.bgGradientTop },
        { offset: 1, color: cfg.bgGradientBottom },
      ],
    });
    this._bg.clear();
    this._bg.rect(0, 0, width, height).fill(grad);
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
