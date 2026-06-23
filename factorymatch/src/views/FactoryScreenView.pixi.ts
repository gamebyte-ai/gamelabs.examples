import * as PIXI from "pixi.js";
import { ScreenView, type IInstanceResolver } from "@gamebyte/gamelabsjs";

import type { GameResult, IFactoryScreenView } from "./IFactoryScreenView.js";
import { FactoryMatchConfig } from "../FactoryMatchConfig.js";
import { FactoryMatchAssetIds, GOAL_ICON_BY_KIND } from "../FactoryMatchAssetIds.js";

// HUD layout (screen pixels). Tuned for portrait; row positions are fractions of
// the viewport so they hold across sizes. Tweak here to nudge the layout.
const CAPTION_DY = 35; // caption sits this far above its pill centre (row y is config.hud.topY)
const MULT_Y = 132; // multiplier badge centre y (goal row y is config.hud.goalsY)
const PILL_H = 46; // on-screen height of the timer + score pills
const GOAL_H = 88; // on-screen height of each goal chip
const MULT_H = 62; // on-screen height of the multiplier circle
const GOAL_GAP = 10; // px between goal chips
const PILL_GAP = 14; // px between the timer + score pills (they stay centred as a pair)
const MULT_X = 54; // multiplier badge centre, fixed px from the left edge
const BOOSTER_H = 76; // on-screen height of each bottom booster button
const BOOSTER_GAP = 56; // px between the two booster buttons
const BOOSTER_BOTTOM = 72; // booster row centre, fixed px up from the bottom edge
const BANNER_WIDTH_FRACTION = 0.82; // end banner width relative to the viewport

const RESULT_ASSET: Record<GameResult, FactoryMatchAssetIds> = {
  allClear: FactoryMatchAssetIds.ResultAllClear,
  timeUp: FactoryMatchAssetIds.ResultTimeIsUp,
  gameOver: FactoryMatchAssetIds.ResultGameOver,
};

/**
 * HUD (2D) view — timer + score pills (each with a caption), a multiplier badge,
 * three goal chips and the end-of-game banner. UI art loads through the
 * AssetManager (HudTexture); the 3D pile/rack lives in the World view.
 * Non-interactive: pointer events fall through to the World view beneath.
 */
export class FactoryScreenView extends ScreenView implements IFactoryScreenView {
  private _config: FactoryMatchConfig | null = null;

  private readonly _timer = new PIXI.Container();
  private readonly _timerValue = this._makeText(22, 0xe8eef6, "800");
  private readonly _timerCaption = this._makeText(13, 0x9fb0c3, "700");
  private readonly _score = new PIXI.Container();
  private readonly _scoreValue = this._makeText(22, 0xe8eef6, "800");
  private readonly _scoreCaption = this._makeText(13, 0x9fb0c3, "700");
  private readonly _multiplier = new PIXI.Container();
  private readonly _multiplierValue = this._makeText(20, 0xe8eef6, "800");
  private readonly _goals: PIXI.Container[] = [];
  private readonly _goalValues: PIXI.Text[] = [];
  private readonly _boosterFan = new PIXI.Sprite();
  private readonly _boosterSpring = new PIXI.Sprite();

  private readonly _banner = new PIXI.Sprite();
  private _w = 1;
  private _h = 1;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(FactoryMatchConfig);
  }

  public override postInitialize(): void {
    super.postInitialize();

    // Timer + score share the same pill bg, each captioned above.
    this._buildBadge(this._timer, this._timerValue, FactoryMatchAssetIds.TimerBg, PILL_H);
    this._buildBadge(this._score, this._scoreValue, FactoryMatchAssetIds.TimerBg, PILL_H);
    this._timerCaption.text = "TIME";
    this._scoreCaption.text = "SCORE";
    this._timerCaption.anchor.set(0.5);
    this._scoreCaption.anchor.set(0.5);
    this.addChild(this._timer, this._score, this._timerCaption, this._scoreCaption);

    this._buildBadge(this._multiplier, this._multiplierValue, FactoryMatchAssetIds.MultiplierBg, MULT_H);
    this._multiplierValue.text = "x1";
    this.addChild(this._multiplier);

    for (const goal of this._config!.goals) {
      const chip = new PIXI.Container();
      const value = this._makeText(this._config!.hud.goalFontSize, 0xe8eef6, "800");
      this._buildBadge(chip, value, FactoryMatchAssetIds.GoalBg, GOAL_H);
      // Item icon fills the upper-centre; the count sits near the bottom.
      const iconId = GOAL_ICON_BY_KIND[goal.kind];
      const iconTex = iconId ? this.assetLoader.getAsset<PIXI.Texture>(iconId) : undefined;
      if (iconTex) {
        const icon = new PIXI.Sprite(iconTex);
        icon.anchor.set(0.5);
        icon.scale.set((GOAL_H * 0.52) / iconTex.height);
        icon.position.set(0, -GOAL_H * 0.08);
        chip.addChild(icon);
      }
      value.text = String(goal.target);
      value.position.set(0, this._config!.hud.goalTextY);
      this._goals.push(chip);
      this._goalValues.push(value);
      this.addChild(chip);
    }

    this._initBooster(this._boosterFan, FactoryMatchAssetIds.BoosterFan);
    this._initBooster(this._boosterSpring, FactoryMatchAssetIds.BoosterSpring);
    this.addChild(this._boosterFan, this._boosterSpring);

    this._banner.anchor.set(0.5);
    this._banner.visible = false;
    this.addChild(this._banner);

    this.setScore(0);
    this.setTime("--:--");
  }

  public setScore(score: number): void {
    this._scoreValue.text = String(score);
  }

  public setTime(text: string): void {
    this._timerValue.text = text;
  }

  public setGoal(index: number, count: number): void {
    const value = this._goalValues[index];
    if (value) value.text = String(count);
  }

  public showResult(result: GameResult): void {
    const texture = this.assetLoader.getAsset<PIXI.Texture>(RESULT_ASSET[result]);
    if (!texture) return;
    this._banner.texture = texture;
    this._banner.visible = true;
    this._layoutBanner();
  }

  public hideBanner(): void {
    this._banner.visible = false;
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this._w = Math.max(1, width);
    this._h = Math.max(1, height);

    // Timer + score stay centred as a pair near the top, a fixed gap apart —
    // tied to the top of the screen, not scaled by the viewport width.
    const cx = this._w / 2;
    const topY = this._config!.hud.topY;
    const pillHalf = (this._timer.width + PILL_GAP) / 2;
    const timerX = cx - pillHalf;
    const scoreX = cx + pillHalf;
    this._timer.position.set(timerX, topY);
    this._timerCaption.position.set(timerX, topY - CAPTION_DY);
    this._score.position.set(scoreX, topY);
    this._scoreCaption.position.set(scoreX, topY - CAPTION_DY);

    this._multiplier.position.set(MULT_X, MULT_Y);
    this._layoutGoals();

    // Two booster buttons centred as a pair near the bottom edge.
    const boosterY = this._h - BOOSTER_BOTTOM;
    const boosterHalf = (this._boosterFan.width + BOOSTER_GAP) / 2;
    this._boosterFan.position.set(cx - boosterHalf, boosterY);
    this._boosterSpring.position.set(cx + boosterHalf, boosterY);

    if (this._banner.visible) this._layoutBanner();
  }

  /** Centre the goal chips in the band to the right of the multiplier badge. */
  private _layoutGoals(): void {
    if (this._goals.length === 0) return;
    const chipW = this._goals[0]!.width;
    const step = chipW + GOAL_GAP;
    const centreX = this._w / 2; // goals centred on the screen's x axis
    const startX = centreX - (step * (this._goals.length - 1)) / 2;
    const y = this._config!.hud.goalsY;
    this._goals.forEach((chip, i) => chip.position.set(startX + i * step, y));
  }

  /** Scale the end banner to a fraction of the viewport width and centre it. */
  private _layoutBanner(): void {
    if (!this._banner.texture) return;
    const scale = (this._w * BANNER_WIDTH_FRACTION) / this._banner.texture.width;
    this._banner.scale.set(scale);
    this._banner.position.set(this._w / 2, this._h * 0.42);
  }

  /** Texture + centre-anchor + height-scale a booster sprite from its asset. */
  private _initBooster(sprite: PIXI.Sprite, id: FactoryMatchAssetIds): void {
    const texture = this.assetLoader.getAsset<PIXI.Texture>(id);
    if (!texture) return;
    sprite.texture = texture;
    sprite.anchor.set(0.5);
    sprite.scale.set(BOOSTER_H / texture.height);
  }

  /** Build a centred bg sprite (scaled to `targetH`) with a centred value label. */
  private _buildBadge(root: PIXI.Container, value: PIXI.Text, id: FactoryMatchAssetIds, targetH: number): void {
    const texture = this.assetLoader.getAsset<PIXI.Texture>(id);
    if (texture) {
      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.scale.set(targetH / texture.height);
      root.addChild(sprite);
    }
    value.anchor.set(0.5);
    root.addChild(value);
  }

  private _makeText(fontSize: number, fill: number, fontWeight: PIXI.TextStyleFontWeight): PIXI.Text {
    return new PIXI.Text({
      text: "",
      style: { fill, fontSize, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial", fontWeight },
    });
  }
}
