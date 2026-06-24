import * as PIXI from "pixi.js";
import gsap from "gsap";
import { ScreenView, type IInstanceResolver, type Unsubscribe } from "@gamebyte/gamelabsjs";

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
const MULT_X = 54; // multiplier badge centre, px in from the game-screen's left edge
const BOOSTER_GAP_FRACTION = 0.7; // gap between boosters, as a fraction of their height
const BOOSTER_BOTTOM = 72; // booster row centre, fixed px up from the bottom edge

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

  // Scalable HUD chrome lives in two bars that are laid out once in design space
  // (px @ gameScreen.refWidth) and uniformly scaled to the game screen on resize:
  // _topBar anchors to the top, _bottomBar to the bottom. Banner + countdown are
  // separate overlays on the root.
  private readonly _topBar = new PIXI.Container();
  private readonly _bottomBar = new PIXI.Container();
  private readonly _timer = new PIXI.Container();
  private readonly _timerValue = this._makeText(22, 0xe8eef6, "800");
  private readonly _timerCaption = this._makeText(13, 0x9fb0c3, "700");
  private readonly _score = new PIXI.Container();
  private readonly _scoreValue = this._makeText(22, 0xe8eef6, "800");
  private readonly _scoreCaption = this._makeText(13, 0x9fb0c3, "700");
  private readonly _multiplier = new PIXI.Container();
  private readonly _multiplierValue = this._makeText(20, 0xe8eef6, "800");
  private readonly _comboRing = new PIXI.Graphics();
  private readonly _goals: PIXI.Container[] = [];
  private readonly _goalValues: PIXI.Text[] = [];
  private readonly _boosterFan = new PIXI.Sprite();
  private readonly _boosterSpring = new PIXI.Sprite();
  private readonly _fanListeners = new Set<() => void>();
  private readonly _springListeners = new Set<() => void>();

  private readonly _banner = new PIXI.Sprite();
  // Intro countdown: a number sprite (3/2/1) and a "Go" text, centred + popped.
  private readonly _countNode = new PIXI.Container();
  private readonly _countSprite = new PIXI.Sprite();
  private readonly _goNode = new PIXI.Container();
  private _goText: PIXI.Text | null = null;
  private _countdownTl: gsap.core.Timeline | null = null;
  private _w = 1;
  private _h = 1;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(FactoryMatchConfig);
  }

  public override postInitialize(): void {
    super.postInitialize();

    this.addChild(this._topBar, this._bottomBar);

    // Timer + score share the same pill bg, each captioned above.
    this._buildBadge(this._timer, this._timerValue, FactoryMatchAssetIds.TimerBg, PILL_H);
    this._buildBadge(this._score, this._scoreValue, FactoryMatchAssetIds.TimerBg, PILL_H);
    this._timerCaption.text = "TIME";
    this._scoreCaption.text = "SCORE";
    this._timerCaption.anchor.set(0.5);
    this._scoreCaption.anchor.set(0.5);
    this._topBar.addChild(this._timer, this._score, this._timerCaption, this._scoreCaption);

    this._buildBadge(this._multiplier, this._multiplierValue, FactoryMatchAssetIds.MultiplierBg, MULT_H);
    // Combo ring sits over the badge bg but under the value text.
    this._multiplier.addChild(this._comboRing);
    this._multiplier.setChildIndex(this._multiplierValue, this._multiplier.children.length - 1);
    this._topBar.addChild(this._multiplier);
    this.setCombo(1, 0);

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
        icon.scale.set(this._config!.hud.goalIconH / iconTex.height);
        icon.position.set(0, this._config!.hud.goalIconY);
        chip.addChild(icon);
      }
      value.text = String(goal.target);
      value.position.set(0, this._config!.hud.goalTextY);
      this._goals.push(chip);
      this._goalValues.push(value);
      this._topBar.addChild(chip);
    }

    // Boosters are built at design size (px @ refWidth); _bottomBar's scale makes
    // them responsive — height ends up gameWidth * hud.boosterScale on screen.
    const boosterH = this._config!.gameScreen.refWidth * this._config!.hud.boosterScale;
    this._initBooster(this._boosterFan, FactoryMatchAssetIds.BoosterFan, boosterH);
    this._initBooster(this._boosterSpring, FactoryMatchAssetIds.BoosterSpring, boosterH);
    this._bottomBar.addChild(this._boosterFan, this._boosterSpring);

    // The booster buttons are tappable; other UI stays pass-through.
    this._boosterFan.eventMode = "static";
    this._boosterFan.cursor = "pointer";
    this._boosterFan.on("pointertap", () => {
      for (const cb of this._fanListeners) cb();
    });
    this._boosterSpring.eventMode = "static";
    this._boosterSpring.cursor = "pointer";
    this._boosterSpring.on("pointertap", () => {
      for (const cb of this._springListeners) cb();
    });

    this._layoutDesign();

    this._banner.anchor.set(0.5);
    this._banner.visible = false;
    this.addChild(this._banner);

    // Countdown overlay sits on top of everything.
    this._countSprite.anchor.set(0.5);
    this._countNode.addChild(this._countSprite);
    this._countNode.visible = false;
    this._goText = this._makeText(this._config!.countdown.goH, 0xf5d35a, "800");
    this._goText.anchor.set(0.5);
    this._goText.text = this._config!.countdown.goText;
    this._goNode.addChild(this._goText);
    this._goNode.visible = false;
    this.addChild(this._countNode, this._goNode);

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

  /** Pop the goal chip (scale up, then settle back) to acknowledge a collection. */
  public pulseGoal(index: number): void {
    const chip = this._goals[index];
    if (!chip) return;
    const hud = this._config!.hud;
    gsap.killTweensOf(chip.scale);
    chip.scale.set(1);
    gsap.to(chip.scale, {
      x: hud.goalPulseScale,
      y: hud.goalPulseScale,
      duration: hud.goalPulseDuration,
      ease: "power2.out",
      yoyo: true,
      repeat: 1,
    });
  }

  /** Update the multiplier label + redraw the progress ring: a faint full-circle
   * track plus a fill arc that sweeps clockwise from 12 o'clock, coloured by the
   * level (palette cycles, so each lap shows in the next colour). */
  public setCombo(level: number, fill: number): void {
    this._multiplierValue.text = "x" + level;
    const c = this._config!.combo;
    const color = c.palette[(level - 1) % c.palette.length] ?? c.palette[0]!;
    const g = this._comboRing;
    g.clear();
    g.circle(0, 0, c.ringRadius).stroke({ width: c.ringWidth, color: c.trackColor, alpha: c.trackAlpha });
    if (fill > 0) {
      const start = (c.startAngle * Math.PI) / 180;
      const end = start + Math.min(fill, 1) * Math.PI * 2; // y-down → increasing angle sweeps clockwise
      // moveTo the arc's start first, or the path draws a spoke from the centre to it.
      g.moveTo(Math.cos(start) * c.ringRadius, Math.sin(start) * c.ringRadius);
      g.arc(0, 0, c.ringRadius, start, end);
      g.stroke({ width: c.ringWidth, color, alpha: 1, cap: "round" });
    }
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

  public onFanTap(cb: () => void): Unsubscribe {
    this._fanListeners.add(cb);
    return () => this._fanListeners.delete(cb);
  }

  public onSpringTap(cb: () => void): Unsubscribe {
    this._springListeners.add(cb);
    return () => this._springListeners.delete(cb);
  }

  public playCountdown(onDone: () => void): void {
    if (this._countdownTl) return; // already running (ignore the duplicate trigger)
    const cfg = this._config!.countdown;
    const tl = gsap.timeline({
      onComplete: () => {
        this._countdownTl = null;
        this._countNode.visible = false;
        this._goNode.visible = false;
        onDone();
      },
    });
    this._countdownTl = tl;

    const numbers = [
      FactoryMatchAssetIds.CountdownNum3,
      FactoryMatchAssetIds.CountdownNum2,
      FactoryMatchAssetIds.CountdownNum1,
    ];
    for (const id of numbers) {
      const tex = this.assetLoader.getAsset<PIXI.Texture>(id);
      tl.call(() => {
        if (tex) {
          this._countSprite.texture = tex;
          this._countSprite.scale.set(cfg.numberH / tex.height);
        }
        this._countNode.visible = true;
        this._countNode.alpha = 1;
        this._countNode.scale.set(0);
      });
      this._addPop(tl, this._countNode);
      tl.set(this._countNode, { visible: false });
    }

    tl.call(() => {
      this._goNode.visible = true;
      this._goNode.alpha = 1;
      this._goNode.scale.set(0);
    });
    this._addPop(tl, this._goNode);
  }

  /** Queue a beat onto `tl`: pop in (scale up), then vanish (scale up + fade). */
  private _addPop(tl: gsap.core.Timeline, node: PIXI.Container): void {
    const cfg = this._config!.countdown;
    tl.to(node.scale, { x: cfg.peakScale, y: cfg.peakScale, duration: cfg.stepSeconds * 0.4, ease: "back.out(2)" });
    tl.to(node.scale, { x: cfg.peakScale * 1.6, y: cfg.peakScale * 1.6, duration: cfg.stepSeconds * 0.5, ease: "power2.in" });
    tl.to(node, { alpha: 0, duration: cfg.stepSeconds * 0.5, ease: "power2.in" }, "<");
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this._w = Math.max(1, width);
    this._h = Math.max(1, height);

    // Game screen: a centred column capped to gameScreen.maxAspect. The HUD is laid
    // out once in design px (@ refWidth); here we just scale + anchor the two bars
    // so every element scales uniformly with the screen and sticks to its edge.
    const cx = this._w / 2;
    const gameW = this._gameWidth();
    const scale = gameW / this._config!.gameScreen.refWidth;

    this._topBar.scale.set(scale);
    this._topBar.position.set(cx, 0); // children's design y measures down from the top
    this._bottomBar.scale.set(scale);
    this._bottomBar.position.set(cx, this._h); // children's design y measures up from the bottom

    const centre = { x: cx, y: this._h * 0.42 };
    this._countNode.position.set(centre.x, centre.y);
    this._goNode.position.set(centre.x, centre.y);

    if (this._banner.visible) this._layoutBanner();
  }

  /** Position all chrome once in design space (px @ gameScreen.refWidth). x = 0 is
   * the game-screen centre; _topBar's y measures down from the top, _bottomBar's up
   * from the bottom. Edge-attached UI references ±refWidth/2. */
  private _layoutDesign(): void {
    const cfg = this._config!;
    const ref = cfg.gameScreen.refWidth;

    // Timer + score: a centred pair near the top, captioned above.
    const pillHalf = (this._timer.width + PILL_GAP) / 2;
    this._timer.position.set(-pillHalf, cfg.hud.topY);
    this._timerCaption.position.set(-pillHalf, cfg.hud.topY - CAPTION_DY);
    this._score.position.set(pillHalf, cfg.hud.topY);
    this._scoreCaption.position.set(pillHalf, cfg.hud.topY - CAPTION_DY);

    // Multiplier: pinned to the game screen's left edge.
    this._multiplier.position.set(-ref / 2 + MULT_X, MULT_Y);

    // Goal chips: centred row.
    const chipW = this._goals[0]?.width ?? 0;
    const step = chipW + GOAL_GAP;
    const startX = -(step * (this._goals.length - 1)) / 2;
    this._goals.forEach((chip, i) => chip.position.set(startX + i * step, cfg.hud.goalsY));

    // Boosters: centred pair just above the bottom edge.
    const boosterHalf = (this._boosterFan.width + this._boosterFan.height * BOOSTER_GAP_FRACTION) / 2;
    this._boosterFan.position.set(-boosterHalf, -BOOSTER_BOTTOM);
    this._boosterSpring.position.set(boosterHalf, -BOOSTER_BOTTOM);
  }

  /** Centred game-screen column width (capped to gameScreen.maxAspect). */
  private _gameWidth(): number {
    return Math.min(this._w, this._h * this._config!.gameScreen.maxAspect);
  }

  /** Scale the end banner to a fraction of the game-screen width (scales with the
   * screen, like the rest of the HUD) and centre it. */
  private _layoutBanner(): void {
    if (!this._banner.texture) return;
    const bannerWidth = this._gameWidth() * this._config!.hud.bannerScale;
    this._banner.scale.set(bannerWidth / this._banner.texture.width);
    this._banner.position.set(this._w / 2, this._h * 0.42);
  }

  /** Texture + centre-anchor + scale a booster sprite to its design height. */
  private _initBooster(sprite: PIXI.Sprite, id: FactoryMatchAssetIds, designH: number): void {
    const texture = this.assetLoader.getAsset<PIXI.Texture>(id);
    if (!texture) return;
    sprite.texture = texture;
    sprite.anchor.set(0.5);
    sprite.scale.set(designH / texture.height);
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
