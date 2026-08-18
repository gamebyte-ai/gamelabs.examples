import * as PIXI from "pixi.js";
import { ScreenView, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import type { IHudView } from "./IHudView";
import { BrickBreakerConfig } from "../BrickBreakerConfig";
import { BrickBreakerAssetIds } from "../BrickBreakerAssetIds";

const FONT = "system-ui, -apple-system, Segoe UI, Roboto, Arial";

/**
 * Top HUD: the **Time** and **Score** readouts, side by side. Each is a rounded
 * pill (SP_UI_BG_01) with its label sprite (Time / Score) above it and a value
 * text centred inside. VISUAL ONLY — values are static placeholders from config
 * until the timer / score mechanics are wired.
 *
 * NON-INTERACTIVE (`eventMode = "passive"`) so pointer events fall through to the
 * grid/shooter beneath.
 */
export class HudView extends ScreenView implements IHudView {
  private _config: BrickBreakerConfig | null = null;
  private readonly _timePill = new PIXI.Sprite();
  private readonly _scorePill = new PIXI.Sprite();
  private readonly _timeLabel = new PIXI.Sprite();
  private readonly _scoreLabel = new PIXI.Sprite();
  private _timeValue: PIXI.Text | null = null;
  private _scoreValue: PIXI.Text | null = null;
  private _gameOverScrim: PIXI.Graphics | null = null;
  private _gameOverText: PIXI.Text | null = null;
  private _w = 0;
  private _h = 0;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(BrickBreakerConfig);
  }

  public override postInitialize(): void {
    this.eventMode = "passive"; // taps pass through to the world below

    const pillTex = this.assetLoader.getAsset<PIXI.Texture>(BrickBreakerAssetIds.HudPill);
    const timeTex = this.assetLoader.getAsset<PIXI.Texture>(BrickBreakerAssetIds.HudTimeLabel);
    const scoreTex = this.assetLoader.getAsset<PIXI.Texture>(BrickBreakerAssetIds.HudScoreLabel);
    for (const [sprite, tex] of [
      [this._timePill, pillTex],
      [this._scorePill, pillTex],
      [this._timeLabel, timeTex],
      [this._scoreLabel, scoreTex],
    ] as Array<[PIXI.Sprite, PIXI.Texture | undefined]>) {
      sprite.texture = tex ?? PIXI.Texture.EMPTY;
      sprite.anchor.set(0.5);
      sprite.eventMode = "none";
      this.addChild(sprite);
    }

    const c = this._config!.hud;
    const style = { fill: c.valueColor, fontSize: 32, fontWeight: "900", fontFamily: FONT, align: "center" } as const;
    this._timeValue = new PIXI.Text({ text: c.time, style });
    this._scoreValue = new PIXI.Text({ text: c.score, style });
    for (const t of [this._timeValue, this._scoreValue]) {
      t.anchor.set(0.5);
      t.eventMode = "none";
      this.addChild(t);
    }

    // Game-over overlay (hidden until the timer runs out): dark scrim + big text.
    this._gameOverScrim = new PIXI.Graphics();
    this._gameOverScrim.eventMode = "static"; // eat taps once the game is over
    this._gameOverScrim.visible = false;
    this.addChild(this._gameOverScrim);
    this._gameOverText = new PIXI.Text({
      text: "",
      style: { fill: 0xffffff, fontSize: 72, fontWeight: "900", fontFamily: FONT, align: "center" },
    });
    this._gameOverText.anchor.set(0.5);
    this._gameOverText.eventMode = "none";
    this._gameOverText.visible = false;
    this.addChild(this._gameOverText);

    // Build children first, THEN let the base fire its initial onResize → layout.
    super.postInitialize();
  }

  public setTime(text: string): void {
    if (this._timeValue) this._timeValue.text = text;
  }

  public setScore(text: string): void {
    if (this._scoreValue) this._scoreValue.text = text;
  }

  public showGameOver(text: string): void {
    if (this._gameOverText) {
      this._gameOverText.text = text;
      this._gameOverText.visible = true;
    }
    if (this._gameOverScrim) this._gameOverScrim.visible = true;
    this._relayout();
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this._w = width;
    this._h = height;
    this._relayout();
  }

  private _relayout(): void {
    if (!this._config || this._w === 0 || this._h === 0) return;
    const c = this._config.hud;
    // FIXED base: the HUD sizes itself against `referenceWidth`, NOT the live view,
    // so its scale never changes with the screen size. Only the horizontal centre
    // (below) tracks the actual viewport so it stays centred.
    const base = c.referenceWidth;

    // Pill size from the texture's aspect, width = a fraction of the fixed base.
    const pillW = base * c.pillWidthFraction;
    const pillTex = this._timePill.texture;
    const pillAspect = pillTex && pillTex.height > 0 ? pillTex.width / pillTex.height : 262 / 82;
    const pillH = pillW / pillAspect;

    // Two pills centred as a group, `gap` apart. Centre tracks the real viewport.
    const gap = base * c.gapFraction;
    const cx = this._w / 2;
    const timeCx = cx - (pillW + gap) / 2;
    const scoreCx = cx + (pillW + gap) / 2;

    // Both labels are scaled to the SAME height (by their own aspect) so their font
    // sizes match; the shared height also keeps the two pills vertically aligned.
    const labelH = pillH * c.labelHeightFraction;
    const scaleLabel = (label: PIXI.Sprite): void => {
      const t = label.texture;
      if (!t || t.height === 0) return;
      label.scale.set(labelH / t.height);
    };
    scaleLabel(this._timeLabel);
    scaleLabel(this._scoreLabel);
    // Vertical metrics off the same fixed base — the whole HUD is a constant size.
    const labelGap = base * c.labelGapFraction;
    const rowTop = base * c.topFraction;

    // Layout: label centred at rowTop + labelH/2, pill below it (same for both).
    const place = (labelSprite: PIXI.Sprite, pill: PIXI.Sprite, value: PIXI.Text | null, colCx: number): void => {
      labelSprite.position.set(colCx, rowTop + labelH / 2);
      const pillCy = rowTop + labelH + labelGap + pillH / 2;
      pill.width = pillW;
      pill.height = pillH;
      pill.position.set(colCx, pillCy);
      if (value) {
        value.style.fontSize = pillH * c.valueFontFraction;
        value.position.set(colCx, pillCy);
      }
    };
    place(this._timeLabel, this._timePill, this._timeValue, timeCx);
    place(this._scoreLabel, this._scorePill, this._scoreValue, scoreCx);

    // Game-over overlay: full-screen scrim + centred banner.
    if (this._gameOverScrim && this._gameOverScrim.visible) {
      this._gameOverScrim.clear();
      this._gameOverScrim.rect(0, 0, this._w, this._h).fill({ color: 0x000000, alpha: 0.6 });
    }
    if (this._gameOverText) {
      this._gameOverText.style.fontSize = this._h * 0.08;
      this._gameOverText.position.set(this._w / 2, this._h / 2);
    }
  }

  public override preDestroy(): void {
    super.preDestroy();
    this._timePill.destroy();
    this._scorePill.destroy();
    this._timeLabel.destroy();
    this._scoreLabel.destroy();
    this._timeValue?.destroy();
    this._timeValue = null;
    this._scoreValue?.destroy();
    this._scoreValue = null;
    this._gameOverScrim?.destroy();
    this._gameOverScrim = null;
    this._gameOverText?.destroy();
    this._gameOverText = null;
    this._config = null;
  }
}
