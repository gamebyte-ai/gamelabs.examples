import * as PIXI from "pixi.js";
import { ScreenView, type IInstanceResolver } from "@gamebyte/gamelabsjs";

import type { GameResult, IFactoryScreenView } from "./IFactoryScreenView.js";
import { FactoryMatchConfig } from "../FactoryMatchConfig.js";
import { FactoryMatchAssetIds } from "../FactoryMatchAssetIds.js";

// HUD layout (screen pixels). Tuned for portrait; row positions are fractions of
// the viewport so they hold across sizes. Tweak here to nudge the layout.
const TOP_Y = 62; // baseline y for the timer/score pills
const CAPTION_DY = 35; // caption sits this far above its pill centre
const ROW2_Y = 132; // baseline y for the multiplier + goals row
const PILL_H = 46; // on-screen height of the timer + score pills
const GOAL_H = 88; // on-screen height of each goal chip
const MULT_H = 62; // on-screen height of the multiplier circle
const GOAL_GAP = 10; // px between goal chips
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
      const value = this._makeText(18, 0xe8eef6, "800");
      this._buildBadge(chip, value, FactoryMatchAssetIds.GoalBg, GOAL_H);
      value.text = String(goal.target);
      // Count sits near the bottom of the chip (item art will fill the centre later).
      value.position.set(0, GOAL_H * 0.3);
      this._goals.push(chip);
      this._goalValues.push(value);
      this.addChild(chip);
    }

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

    this._timer.position.set(this._w * 0.29, TOP_Y);
    this._timerCaption.position.set(this._w * 0.29, TOP_Y - CAPTION_DY);
    this._score.position.set(this._w * 0.71, TOP_Y);
    this._scoreCaption.position.set(this._w * 0.71, TOP_Y - CAPTION_DY);

    this._multiplier.position.set(this._w * 0.13, ROW2_Y);
    this._layoutGoals();

    if (this._banner.visible) this._layoutBanner();
  }

  /** Centre the goal chips in the band to the right of the multiplier badge. */
  private _layoutGoals(): void {
    if (this._goals.length === 0) return;
    const chipW = this._goals[0]!.width;
    const step = chipW + GOAL_GAP;
    const centreX = this._w * 0.6;
    const startX = centreX - (step * (this._goals.length - 1)) / 2;
    this._goals.forEach((chip, i) => chip.position.set(startX + i * step, ROW2_Y));
  }

  /** Scale the end banner to a fraction of the viewport width and centre it. */
  private _layoutBanner(): void {
    if (!this._banner.texture) return;
    const scale = (this._w * BANNER_WIDTH_FRACTION) / this._banner.texture.width;
    this._banner.scale.set(scale);
    this._banner.position.set(this._w / 2, this._h * 0.42);
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
