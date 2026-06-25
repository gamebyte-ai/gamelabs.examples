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
const PILL_H = 46; // on-screen height of the cash pill
const GOAL_H = 88; // on-screen height of each goal chip
const MULT_H = 62; // on-screen height of the multiplier circle
const GOAL_GAP = 10; // px between goal chips
const MULT_X = 54; // multiplier badge centre, px in from the game-screen's left edge
const BOOSTER_GAP_FRACTION = 0.7; // gap between boosters, as a fraction of their height
const BOOSTER_BOTTOM = 72; // booster row centre, fixed px up from the bottom edge

const RESULT_ASSET: Record<GameResult, FactoryMatchAssetIds> = {
  allClear: FactoryMatchAssetIds.ResultAllClear,
  timeUp: FactoryMatchAssetIds.ResultTimeIsUp,
  gameOver: FactoryMatchAssetIds.ResultGameOver,
};

/**
 * HUD (2D) view — a centred CASH income pill, a multiplier badge, three goal
 * chips and the end-of-game banner. UI art loads through the AssetManager
 * (HudTexture); the 3D pile/rack lives in the World view.
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
  // Single centred income display: a pill with a gold coin + "$N", captioned CASH.
  private readonly _cash = new PIXI.Container();
  private readonly _cashValue = this._makeText(22, 0xf5d35a, "800");
  private readonly _cashCaption = this._makeText(13, 0x9fb0c3, "700");
  private _cashShown = 0; // last cash value drawn, to pulse only on an increase
  private readonly _multiplier = new PIXI.Container();
  private readonly _multiplierValue = this._makeText(20, 0xe8eef6, "800");
  private readonly _comboRing = new PIXI.Graphics();
  private readonly _goals: PIXI.Container[] = [];
  private readonly _goalValues: PIXI.Text[] = [];
  private readonly _goalBgs: (PIXI.Sprite | null)[] = [];
  private readonly _goalIcons: (PIXI.Sprite | null)[] = [];
  private readonly _boosterFan = new PIXI.Sprite();
  private readonly _boosterSpring = new PIXI.Sprite();
  private readonly _fanRing = new PIXI.Graphics();
  private readonly _springRing = new PIXI.Graphics();
  // Animated charge fill per booster: `shown` is the value currently drawn; a tween
  // eases it toward each new target so the ring fills smoothly instead of snapping.
  // `full` tracks whether it's charged (to pop once on the <1→full transition);
  // `pop` is the one-shot ready scale animation.
  private readonly _fanFill = { shown: 0, full: false, tween: null as gsap.core.Tween | null, pop: null as gsap.core.Timeline | null };
  private readonly _springFill = { shown: 0, full: false, tween: null as gsap.core.Tween | null, pop: null as gsap.core.Timeline | null };
  private readonly _fanListeners = new Set<() => void>();
  private readonly _springListeners = new Set<() => void>();

  private readonly _banner = new PIXI.Sprite();
  // Intro countdown: a number sprite (3/2/1) and a "Go" text, centred + popped.
  private readonly _countNode = new PIXI.Container();
  private readonly _countSprite = new PIXI.Sprite();
  private readonly _goNode = new PIXI.Container();
  private _goText: PIXI.Text | null = null;
  private _countdownTl: gsap.core.Timeline | null = null;
  private _springPulse: gsap.core.Tween | null = null; // looping "use the spring" prompt
  private _boosterDesignH = 1; // booster icon design height, for rescaling on texture swap
  private _w = 1;
  private _h = 1;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(FactoryMatchConfig);
  }

  public override postInitialize(): void {
    super.postInitialize();

    this.addChild(this._topBar, this._bottomBar);

    // Single centred CASH income pill: bg + "$N", with a CASH caption above.
    this._buildBadge(this._cash, this._cashValue, FactoryMatchAssetIds.TimerBg, PILL_H);
    this._cashValue.anchor.set(0.5); // centred on the pill bg
    this._cashValue.position.set(0, 0);
    this._cashValue.style.fill = this._config!.hud.cashColor;
    this._cashCaption.text = "CASH BALANCE";
    this._cashCaption.anchor.set(0.5);
    this._topBar.addChild(this._cash, this._cashCaption);

    this._buildBadge(this._multiplier, this._multiplierValue, FactoryMatchAssetIds.MultiplierBg, MULT_H);
    // Combo ring sits over the badge bg but under the value text.
    this._multiplier.addChild(this._comboRing);
    this._multiplier.setChildIndex(this._multiplierValue, this._multiplier.children.length - 1);
    this._topBar.addChild(this._multiplier);
    this.setCombo(1, 0);

    for (const goal of this._config!.goals) {
      const chip = new PIXI.Container();
      const value = this._makeText(this._config!.hud.goalFontSize, 0xe8eef6, "800");
      const bg = this._buildBadge(chip, value, FactoryMatchAssetIds.GoalBg, GOAL_H);
      this._goalBgs.push(bg);
      // Item icon fills the upper-centre; the count sits near the bottom.
      const iconId = GOAL_ICON_BY_KIND[goal.kind];
      const iconTex = iconId ? this.assetLoader.getAsset<PIXI.Texture>(iconId) : undefined;
      let icon: PIXI.Sprite | null = null;
      if (iconTex) {
        icon = new PIXI.Sprite(iconTex);
        icon.anchor.set(0.5);
        icon.scale.set(this._config!.hud.goalIconH / iconTex.height);
        icon.position.set(0, this._config!.hud.goalIconY);
        chip.addChild(icon);
      }
      this._goalIcons.push(icon);
      value.text = String(goal.target);
      value.position.set(0, this._config!.hud.goalTextY);
      this._goals.push(chip);
      this._goalValues.push(value);
      this._topBar.addChild(chip);
    }

    // Boosters are built at design size (px @ refWidth); _bottomBar's scale makes
    // them responsive — height ends up gameWidth * hud.boosterScale on screen.
    const boosterH = this._config!.gameScreen.refWidth * this._config!.hud.boosterScale;
    this._boosterDesignH = boosterH;
    this._initBooster(this._boosterFan, FactoryMatchAssetIds.BoosterFan, boosterH);
    this._initBooster(this._boosterSpring, FactoryMatchAssetIds.BoosterSpring, boosterH);
    this._bottomBar.addChild(this._fanRing, this._springRing, this._boosterFan, this._boosterSpring);

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
    this.setBoosterCharge(0, 0);

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

    this.setCash(0);
  }

  /** Cash income, shown as "$N" — at most 2 decimals (trailing zeros dropped, so
   * 5 → $5, 5.5 → $5.5, 5.256 → $5.26). Pops the pill on an increase. */
  public setCash(cash: number): void {
    this._cashValue.text = "$" + Math.round(cash * 100) / 100;
    if (cash > this._cashShown) {
      const hud = this._config!.hud;
      gsap.killTweensOf(this._cash.scale);
      this._cash.scale.set(1);
      gsap.to(this._cash.scale, {
        x: hud.cashPulseScale,
        y: hud.cashPulseScale,
        duration: hud.cashPulseDuration,
        ease: "power2.out",
        yoyo: true,
        repeat: 1,
      });
    }
    this._cashShown = cash;
  }

  // Timer + score are not shown; these stay as no-ops so the timer mechanic can
  // still run (lose-on-time) without a HUD element.
  public setScore(_score: number): void {}
  public setTime(_text: string): void {}
  public setTimeWarning(_active: boolean): void {}

  public setGoal(index: number, count: number): void {
    const value = this._goalValues[index];
    const hud = this._config!.hud;
    const done = count <= 0;
    if (value) {
      value.text = done ? hud.goalDoneTick : String(count); // green tick once complete
      value.style.fill = done ? hud.goalDoneTickColor : 0xe8eef6;
    }
    // Mute the whole goal section — bg + item icon — to the same colour when done
    // (the green tick stays as the only bright element).
    const tint = done ? hud.goalDoneBgTint : 0xffffff;
    const bg = this._goalBgs[index];
    if (bg) bg.tint = tint;
    const icon = this._goalIcons[index];
    if (icon) icon.tint = tint;
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
    this._drawRing(this._comboRing, c.ringRadius, c.ringWidth, fill, color, c.trackColor, c.trackAlpha, c.startAngle);
  }

  /** Animate both booster charge rings toward their new fill and swap each icon to
   * its active art once its ring finishes filling (passive while charging/draining). */
  public setBoosterCharge(fanFill: number, springFill: number): void {
    const b = this._config!.boosters;
    if (springFill < 1) this._stopSpringPulse(); // spring spent (or drained) — end the prompt loop
    const ids = FactoryMatchAssetIds;
    this._animateBoosterRing(this._fanFill, this._fanRing, this._boosterFan, fanFill, b.fanColor, ids.BoosterFan, ids.BoosterFanActive);
    this._animateBoosterRing(this._springFill, this._springRing, this._boosterSpring, springFill, b.springColor, ids.BoosterSpring, ids.BoosterSpringActive);
  }

  /** Tween a booster ring's drawn fill toward `target`, redrawing each frame. The
   * icon drops to passive immediately when not charged, and lights its active art
   * once the fill animation reaches full. */
  private _animateBoosterRing(
    slot: { shown: number; full: boolean; tween: gsap.core.Tween | null; pop: gsap.core.Timeline | null },
    g: PIXI.Graphics,
    icon: PIXI.Sprite,
    target: number,
    color: number,
    passiveId: FactoryMatchAssetIds,
    activeId: FactoryMatchAssetIds,
  ): void {
    const b = this._config!.boosters;
    const radius = this._boosterDesignH * b.ringRadiusScale; // independent of the padded texture
    const draw = (f: number): void =>
      this._drawRing(g, radius, b.ringWidth, f, color, b.trackColor, b.trackAlpha, b.startAngle);
    if (target < 1) {
      this._applyBoosterTexture(icon, passiveId); // not charged → passive now
      icon.y = -BOOSTER_BOTTOM;
    }
    const becameFull = target >= 1 && !slot.full; // crossing into charged → pop once
    slot.full = target >= 1;
    slot.tween?.kill();
    draw(slot.shown);
    slot.tween = gsap.to(slot, {
      shown: target,
      duration: b.fillDuration,
      ease: "power2.out",
      onUpdate: () => draw(slot.shown),
      onComplete: () => {
        if (target >= 1) {
          this._applyBoosterTexture(icon, activeId); // ring full → light the active art
          icon.y = -BOOSTER_BOTTOM + b.activeIconOffsetY;
        }
        if (becameFull) this._popBoosterReady(slot, icon, g); // one-shot "charged!" pop
      },
    });
  }

  /** One-shot "charged" pop: grow the icon + ring together (fast→slow), then shrink
   * back the same way. Driven off a single factor so both scale from their own rest. */
  private _popBoosterReady(
    slot: { pop: gsap.core.Timeline | null },
    icon: PIXI.Sprite,
    ring: PIXI.Graphics,
  ): void {
    const b = this._config!.boosters;
    const iconRest = this._boosterDesignH / icon.texture.height;
    slot.pop?.kill();
    gsap.killTweensOf(icon.scale);
    gsap.killTweensOf(ring.scale);
    const s = { v: 1 };
    const apply = (): void => {
      icon.scale.set(iconRest * s.v);
      ring.scale.set(s.v);
    };
    slot.pop = gsap
      .timeline({ onUpdate: apply, onComplete: apply })
      .to(s, { v: b.readyPopScale, duration: b.readyPopDuration, ease: "power2.out" }) // grow fast→slow
      .to(s, { v: 1, duration: b.readyPopDuration, ease: "power2.out" }); // shrink fast→slow
  }

  /** Swap a booster icon's texture (no-op if unchanged), rescaling to its design
   * height so passive/active art of any size stays the same on-screen size. */
  private _applyBoosterTexture(sprite: PIXI.Sprite, id: FactoryMatchAssetIds): void {
    const tex = this.assetLoader.getAsset<PIXI.Texture>(id);
    if (!tex || sprite.texture === tex) return;
    gsap.killTweensOf(sprite.scale); // drop any in-flight prompt pulse before rescaling
    sprite.texture = tex;
    sprite.scale.set(this._boosterDesignH / tex.height);
  }

  /** Loop the spring booster's scale pulse — the "use me" prompt while a full tray
   * is held open by a charged spring. Idempotent: a running loop is left alone, so
   * repeated prompts don't restart it. It stops when the spring is used (the icon
   * swaps back to passive art, killing the tween) or the game ends. */
  public pulseSpringBooster(): void {
    if (this._springPulse?.isActive()) return; // already looping
    const b = this._config!.boosters;
    const icon = this._boosterSpring;
    const ring = this._springRing;
    const iconRest = this._boosterDesignH / icon.texture.height; // resting icon scale (active art)
    // Drive both the icon and its ring off one factor so they pulse together (the
    // ring's geometry is its size, so its resting scale is 1).
    const driver = { s: 1 };
    this._springPulse = gsap.to(driver, {
      s: b.promptPulseScale,
      duration: b.promptPulseDuration,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1, // loop until the spring is used / the game ends
      onUpdate: () => {
        icon.scale.set(iconRest * driver.s);
        ring.scale.set(driver.s);
      },
    });
  }

  /** Stop the spring prompt loop and restore the icon + ring resting scales. */
  private _stopSpringPulse(): void {
    if (!this._springPulse) return;
    this._springPulse.kill();
    this._springPulse = null;
    this._boosterSpring.scale.set(this._boosterDesignH / this._boosterSpring.texture.height);
    this._springRing.scale.set(1);
  }

  /** A progress ring centred at the graphics' origin: a faint full-circle track
   * plus a fill arc that sweeps clockwise from `startAngleDeg`. */
  private _drawRing(
    g: PIXI.Graphics,
    radius: number,
    width: number,
    fill: number,
    color: number,
    trackColor: number,
    trackAlpha: number,
    startAngleDeg: number,
  ): void {
    g.clear();
    g.circle(0, 0, radius).stroke({ width, color: trackColor, alpha: trackAlpha });
    if (fill > 0) {
      const start = (startAngleDeg * Math.PI) / 180;
      const end = start + Math.min(fill, 1) * Math.PI * 2; // y-down → increasing angle sweeps clockwise
      // moveTo the arc's start first, or the path draws a spoke from the centre to it.
      g.moveTo(Math.cos(start) * radius, Math.sin(start) * radius);
      g.arc(0, 0, radius, start, end);
      g.stroke({ width, color, alpha: 1, cap: "round" });
    }
  }

  public showResult(result: GameResult): void {
    this._stopSpringPulse(); // game over — drop any prompt loop
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

    // Cash: a single pill centred on x near the top, captioned above.
    this._cash.position.set(0, cfg.hud.topY);
    this._cashCaption.position.set(0, cfg.hud.topY - CAPTION_DY);

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
    // Charge rings sit at each booster's centre, nudged up onto the visible circle
    // (the art's circle sits above its drop shadow, so the sprite centre is low).
    const offY = cfg.boosters.ringOffsetY;
    this._fanRing.position.set(this._boosterFan.position.x, this._boosterFan.position.y + offY);
    this._springRing.position.set(this._boosterSpring.position.x, this._boosterSpring.position.y + offY);
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

  /** Build a centred bg sprite (scaled to `targetH`) with a centred value label.
   * Returns the bg sprite (or null if its texture is missing). */
  private _buildBadge(root: PIXI.Container, value: PIXI.Text, id: FactoryMatchAssetIds, targetH: number): PIXI.Sprite | null {
    const texture = this.assetLoader.getAsset<PIXI.Texture>(id);
    let sprite: PIXI.Sprite | null = null;
    if (texture) {
      sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.scale.set(targetH / texture.height);
      root.addChild(sprite);
    }
    value.anchor.set(0.5);
    root.addChild(value);
    return sprite;
  }

  private _makeText(fontSize: number, fill: number, fontWeight: PIXI.TextStyleFontWeight): PIXI.Text {
    return new PIXI.Text({
      text: "",
      style: { fill, fontSize, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial", fontWeight },
    });
  }
}
