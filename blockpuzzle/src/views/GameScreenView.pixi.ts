import { Container, Graphics, Sprite, Texture } from "pixi.js";
import {
  LabelComponent,
  ScreenView,
  UIComponentsStyleIds,
  type IInstanceResolver,
  type LabelComponentStyle,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import { BlockPuzzleAssetIds } from "../BlockPuzzleAssetIds";
import { BlockPuzzleConfig } from "../BlockPuzzleConfig";
import { BoosterPanelState } from "../constants/BoosterPanelState";
import { BOOSTER_DISPLAY_ORDER, BoosterType } from "../constants/BoosterType";
import { BoardLayoutCalculator } from "../utilities/BoardLayoutCalculator";
import type { BoosterPanelHudState, ComboHudState, IGameScreenView } from "./IGameScreenView";

const BOOSTER_ICON_ASSET_IDS: Readonly<Record<BoosterType, BlockPuzzleAssetIds>> = {
  [BoosterType.Hammer]: BlockPuzzleAssetIds.HammerIcon,
  [BoosterType.UnitBlock]: BlockPuzzleAssetIds.UnitBlockIcon,
  [BoosterType.TrayRefresh]: BlockPuzzleAssetIds.TrayRefreshIcon,
};

const TITLE_LABEL_SIZE = 22;
const HUD_LABEL_SIZE = 22;
const HUD_LABEL_MARGIN = 16;
// Centered end-state overlay, larger than corner HUD labels so a
// terminal state reads clearly across the board layout.
const END_STATE_LABEL_SIZE = 56;

interface BoosterButton {
  readonly type: BoosterType;
  readonly container: Container;
  readonly background: Graphics;
  readonly icon: Sprite;
}

/**
 * HUD overlay for the game screen.
 *
 * Corner-pinned: score (top-left), time (top-right). Top-centre:
 * combo widget (N circles + state-driven label). Bottom-pinned:
 * booster panel — filled background rectangle behind a row of
 * circular booster buttons (sprite icons from
 * {@link BlockPuzzleAssetIds}, tinted to `booster.buttonLabelColor`)
 * with a progress bar / ready label above them and a floating X
 * cancel button that appears over the selected booster during
 * Selecting. Centered overlay: end-state label, hidden while
 * playing.
 *
 * Absolute-positioned children resolve against the screen's own
 * layout box, which is set every resize so the corner pins
 * actually pin. The combo widget, booster panel and end-state
 * label are positioned with raw `x` / `y` so centering doesn't
 * depend on a flex container.
 */
export class GameScreenView extends ScreenView implements IGameScreenView {
  private _config: BlockPuzzleConfig | null = null;
  private _scoreLabel: LabelComponent | null = null;
  private _timeLabel: LabelComponent | null = null;
  private _endStateLabel: LabelComponent | null = null;
  private _comboContainer: Container | null = null;
  /** Inner wrapper around the 3 combo circles, so the loss-shake
   *  can jitter the circles independently of the combo label and
   *  the booster-selecting prompt that share the outer widget. */
  private _comboCirclesContainer: Container | null = null;
  private _comboCircles: Graphics[] = [];
  private _comboLabel: LabelComponent | null = null;
  private _boosterPromptLabel: LabelComponent | null = null;
  /** Latest combo state pushed by the controller. The view keeps it
   *  so it can restore the combo visuals correctly when the booster
   *  prompt clears (without the controller having to re-push). */
  private _lastComboState: ComboHudState = { level: 0, movesRemaining: 0 };
  /** True while a booster-selection prompt is showing in the combo
   *  widget's position; gates `_applyComboVisibility`. */
  private _boosterPromptActive = false;
  private _boosterContainer: Container | null = null;
  private _boosterBackground: Graphics | null = null;
  private _boosterButtons: BoosterButton[] = [];
  private _progressTrack: Graphics | null = null;
  private _progressFill: Graphics | null = null;
  private _readyLabel: LabelComponent | null = null;
  private _cancelButton: Container | null = null;
  private readonly _boosterListeners = new Set<(type: BoosterType) => void>();
  private readonly _cancelListeners = new Set<() => void>();

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(BlockPuzzleConfig);
  }

  public override postInitialize(): void {
    super.postInitialize();

    this._scoreLabel = this.buildHudLabel("Score: 0", TITLE_LABEL_SIZE);
    this._scoreLabel.layout = { position: "absolute", left: HUD_LABEL_MARGIN, top: HUD_LABEL_MARGIN };
    this.addChild(this._scoreLabel);

    this._timeLabel = this.buildHudLabel("00:00", HUD_LABEL_SIZE);
    this._timeLabel.layout = { position: "absolute", right: HUD_LABEL_MARGIN, top: HUD_LABEL_MARGIN };
    this.addChild(this._timeLabel);

    this._comboContainer = this.buildComboWidget();
    this.addChild(this._comboContainer);

    this._boosterContainer = this.buildBoosterPanel();
    this.addChild(this._boosterContainer);

    this._endStateLabel = this.buildEndStateLabel();
    this._endStateLabel.visible = false;
    this.addChild(this._endStateLabel);

    // Initial paint — combo idle, booster panel charging at 0.
    this.setComboState({ level: 0, movesRemaining: 0 });
    this.setBoosterPanelState({
      state: BoosterPanelState.Charging,
      stagesFilled: 0,
      readyLabel: null,
      selectedBooster: null,
      disabled: false,
    });
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this.layout = { width: Math.max(1, width), height: Math.max(1, height) };

    const w = Math.max(1, width);
    const h = Math.max(1, height);

    if (this._comboContainer && this._config) {
      // Each combo component (label + circles + booster prompt) is
      // independently bound to the screen-top → grid-top gap so the
      // widget's vertical layout scales with the gap rather than
      // having fixed pixel offsets.
      //
      // Plus: the whole widget scales by `currentPxPerWorld /
      // referencePxPerWorld` so the pixel-defined sizes (font, circle
      // radius, spacing) track the grid's on-screen size. Child Y
      // positions are divided by `scale` so the render-time position
      // (which Pixi multiplies by the container scale) still lands
      // at `bias × gridTopPx` in screen pixels.
      const combo = this._config.combo;
      const layout = BoardLayoutCalculator.compute(this._config, w, h);
      const pxPerWorld = h / layout.orthoSize;
      const gridTopPx = this._config.gridTopMargin * pxPerWorld;
      const scale = Math.max(0.1, pxPerWorld / combo.referencePxPerWorld);
      this._comboContainer.x = w / 2;
      this._comboContainer.y = 0;
      this._comboContainer.scale.set(scale);
      if (this._comboLabel) this._comboLabel.y = (gridTopPx * combo.labelBiasRatio) / scale;
      if (this._comboCirclesContainer) {
        this._comboCirclesContainer.y = (gridTopPx * combo.circlesBiasRatio) / scale;
      }
      if (this._boosterPromptLabel) {
        this._boosterPromptLabel.y =
          (gridTopPx * (combo.labelBiasRatio + combo.circlesBiasRatio) * 0.5) / scale;
      }
    }
    if (this._boosterContainer && this._config) {
      this._boosterContainer.x = w / 2;
      this._boosterContainer.y = h - this._config.booster.bottomMargin - this._config.booster.buttonSize / 2;
    }
    if (this._endStateLabel) {
      this._endStateLabel.x = w / 2;
      this._endStateLabel.y = h / 2;
    }
  }

  public setScoreText(text: string): void {
    this._scoreLabel?.setText(text);
  }

  public setTimeText(text: string): void {
    this._timeLabel?.setText(text);
  }

  public setComboState(state: ComboHudState): void {
    if (!this._config || this._comboContainer === null || this._comboLabel === null) return;
    this._lastComboState = state;
    const combo = this._config.combo;
    for (let i = 0; i < this._comboCircles.length; i++) {
      const active = i < state.movesRemaining;
      this._paintCircle(this._comboCircles[i]!, combo.circleRadius, active ? combo.circleColorActive : combo.circleColorInactive);
    }
    if (state.level > 0) {
      this._comboLabel.setText(state.level === 1 ? "COMBO READY" : `COMBO X${state.level}`);
    }
    this._applyComboVisibility();
  }

  public setBoosterPrompt(text: string | null): void {
    this._boosterPromptActive = text !== null;
    if (text !== null && this._boosterPromptLabel !== null) {
      this._boosterPromptLabel.setText(text);
    }
    this._applyComboVisibility();
  }

  /**
   * Reconcile combo + booster-prompt visibility from the two latched
   * signals. Booster prompt wins — when it's active the combo label
   * + circles hide; when it clears, the combo restores per the last
   * state pushed via {@link setComboState}.
   */
  private _applyComboVisibility(): void {
    const promptOn = this._boosterPromptActive;
    if (this._boosterPromptLabel !== null) {
      this._boosterPromptLabel.visible = promptOn;
    }
    if (this._comboLabel !== null) {
      this._comboLabel.visible = !promptOn && this._lastComboState.level > 0;
    }
    for (const circle of this._comboCircles) {
      circle.visible = !promptOn;
    }
  }

  public setBoosterPanelState(state: BoosterPanelHudState): void {
    if (!this._config) return;
    const cfg = this._config.booster;
    const isReady = state.state === BoosterPanelState.Ready;
    const isSelecting = state.state === BoosterPanelState.Selecting;

    // Buttons:
    // - Ready: all active + tappable.
    // - Selecting: selected booster active + scaled up, *not* tappable
    //   (the X handles cancel); other boosters dim + not tappable.
    // - Charging: all dim + not tappable.
    // - Disabled (game ended): every button dim + not tappable
    //   regardless of underlying state.
    for (const button of this._boosterButtons) {
      const isSelected = isSelecting && state.selectedBooster === button.type;
      const active = (isReady || isSelected) && !state.disabled;
      button.container.alpha = active ? cfg.buttonActiveAlpha : cfg.buttonInactiveAlpha;
      button.container.scale.set(isSelected && !state.disabled ? cfg.selectedScale : 1);
      // Ready boosters take pointer events as normal activation.
      // Selected booster *also* stays tappable so a re-tap cancels
      // (equivalent to the X) — the controller routes
      // `onBoosterActivated(currentlySelectedType)` to cancel.
      // Non-selected boosters during Selecting / Charging stay off.
      // After game end every booster is off.
      const tappable = (isReady || isSelected) && !state.disabled;
      button.container.eventMode = tappable ? "static" : "none";
      button.container.cursor = tappable ? "pointer" : "default";
    }

    // Progress bar: visible only while Charging.
    if (this._progressTrack !== null && this._progressFill !== null) {
      const visible = state.state === BoosterPanelState.Charging;
      this._progressTrack.visible = visible;
      this._progressFill.visible = visible;
      if (visible) {
        const ratio = Math.max(0, Math.min(1, state.stagesFilled / cfg.stagesPerCharge));
        this._paintProgressFill(this._progressFill, cfg.progressWidth * ratio, cfg.progressHeight, cfg.progressFillColor);
      }
    }

    // Ready-state label: shown only when Ready (controller passes
    // null in Charging / Selecting), suppressed entirely when the
    // panel is disabled.
    if (this._readyLabel !== null) {
      if (isReady && state.readyLabel !== null && !state.disabled) {
        this._readyLabel.setText(state.readyLabel);
        this._readyLabel.visible = true;
      } else {
        this._readyLabel.visible = false;
      }
    }

    // Floating X cancel: shown over the selected booster while
    // Selecting (never when disabled — the panel auto-exits
    // Selecting on game end). Position it relative to the selected
    // button's centre using config offsets (scaled by `selectedScale`
    // so the X tracks the enlarged button visually).
    if (this._cancelButton !== null) {
      const selected = isSelecting && !state.disabled
        ? this._boosterButtons.find((b) => b.type === state.selectedBooster) ?? null
        : null;
      if (selected !== null) {
        this._cancelButton.x = selected.container.x + cfg.cancel.offsetX;
        this._cancelButton.y = selected.container.y + cfg.cancel.offsetY;
        this._cancelButton.visible = true;
        this._cancelButton.eventMode = "static";
        this._cancelButton.cursor = "pointer";
      } else {
        this._cancelButton.visible = false;
        this._cancelButton.eventMode = "none";
        this._cancelButton.cursor = "default";
      }
    }
  }

  public onBoosterActivated(callback: (type: BoosterType) => void): Unsubscribe {
    this._boosterListeners.add(callback);
    return () => {
      this._boosterListeners.delete(callback);
    };
  }

  public onBoosterCancelled(callback: () => void): Unsubscribe {
    this._cancelListeners.add(callback);
    return () => {
      this._cancelListeners.delete(callback);
    };
  }

  public setComboShakeOffset(offsetX: number): void {
    if (this._comboCirclesContainer !== null) {
      this._comboCirclesContainer.x = offsetX;
    }
  }

  public setEndStateLabel(appearance: { readonly text: string; readonly color: number } | null): void {
    if (!this._endStateLabel) return;
    if (appearance === null) {
      this._endStateLabel.visible = false;
      return;
    }
    this._endStateLabel.setText(appearance.text);
    this._endStateLabel.tint = appearance.color;
    this._endStateLabel.visible = true;
  }

  public override preDestroy(): void {
    this._boosterListeners.clear();
    this._cancelListeners.clear();
    super.preDestroy();
  }

  private buildComboWidget(): Container {
    if (!this._config) throw new Error("GameScreenView: config not injected before postInitialize");
    const combo = this._config.combo;
    const container = new Container();

    const labelStyle = this.styleManager.resolve<LabelComponentStyle>(UIComponentsStyleIds.Label, {
      text: { fontSize: combo.labelFontSize, fontWeight: "700", color: combo.labelColor },
    });
    // All three child anchors are centred so `onResize` can place
    // each component directly at its own grid-bound bias Y without
    // having to compensate for the component's height.
    this._comboLabel = new LabelComponent(this.assetLoader, labelStyle, {
      text: "",
      anchorX: 0.5,
      anchorY: 0.5,
    });
    this._comboLabel.x = 0;
    this._comboLabel.visible = false;
    container.addChild(this._comboLabel);

    const step = combo.circleRadius * 2 + combo.circleSpacing;
    const circles = new Container();
    for (let i = 0; i < combo.maxMoves; i++) {
      const circle = new Graphics();
      circle.x = (i - (combo.maxMoves - 1) / 2) * step;
      // Circle drawn around its own (0, 0) — its centre is the
      // circles-container's origin, which onResize parks at the
      // circles bias Y.
      circle.y = 0;
      this._paintCircle(circle, combo.circleRadius, combo.circleColorInactive);
      circles.addChild(circle);
      this._comboCircles.push(circle);
    }
    container.addChild(circles);
    this._comboCirclesContainer = circles;

    // Booster-selecting prompt — same container as the combo so
    // both ride the same X centring. Y is set to the midpoint of
    // the two bias ratios in `onResize`.
    const promptStyle = this.styleManager.resolve<LabelComponentStyle>(UIComponentsStyleIds.Label, {
      text: { fontSize: combo.labelFontSize, fontWeight: "700", color: combo.labelColor },
    });
    this._boosterPromptLabel = new LabelComponent(this.assetLoader, promptStyle, {
      text: "",
      anchorX: 0.5,
      anchorY: 0.5,
    });
    this._boosterPromptLabel.x = 0;
    this._boosterPromptLabel.visible = false;
    container.addChild(this._boosterPromptLabel);

    return container;
  }

  private buildBoosterPanel(): Container {
    if (!this._config) throw new Error("GameScreenView: config not injected before postInitialize");
    const cfg = this._config.booster;
    const container = new Container();

    // Background first so everything else renders on top of it.
    // Sized to wrap the whole content (progress bar / label above
    // the button row, plus the row itself, plus padding).
    const buttonsHalfHeight = cfg.buttonSize / 2;
    const topReach = cfg.buttonSize / 2 + cfg.progressGapAbove + cfg.progressHeight;
    const bgWidth = BOOSTER_DISPLAY_ORDER.length * cfg.buttonSize + (BOOSTER_DISPLAY_ORDER.length - 1) * cfg.buttonSpacing + 2 * cfg.panelPadding;
    const bgHeight = buttonsHalfHeight + topReach + 2 * cfg.panelPadding;
    const bgTop = -topReach - cfg.panelPadding;
    this._boosterBackground = new Graphics();
    this._boosterBackground.roundRect(-bgWidth / 2, bgTop, bgWidth, bgHeight, cfg.panelCornerRadius).fill(cfg.panelBackgroundColor);
    container.addChild(this._boosterBackground);

    // Circular buttons with procedural icons. `pointertap` only
    // fires while `eventMode === "static"` — flipped per state in
    // `setBoosterPanelState`.
    const step = cfg.buttonSize + cfg.buttonSpacing;
    const radius = cfg.buttonSize / 2;
    BOOSTER_DISPLAY_ORDER.forEach((type, i) => {
      const buttonCfg = cfg.buttons[type];
      const buttonContainer = new Container();
      buttonContainer.x = (i - (BOOSTER_DISPLAY_ORDER.length - 1) / 2) * step;
      buttonContainer.y = 0;

      const background = new Graphics();
      this._paintBoosterCircle(background, radius, buttonCfg.color);
      buttonContainer.addChild(background);

      const icon = this._buildBoosterIcon(type, cfg.buttonSize * 0.55, cfg.buttonLabelColor);
      buttonContainer.addChild(icon);

      buttonContainer.on("pointertap", () => this._fireBoosterActivated(type));

      container.addChild(buttonContainer);
      this._boosterButtons.push({ type, container: buttonContainer, background, icon });
    });

    // Progress bar above the button row.
    const progressY = -(cfg.buttonSize / 2) - cfg.progressGapAbove - cfg.progressHeight / 2;
    this._progressTrack = new Graphics();
    this._progressFill = new Graphics();
    this._paintProgressTrack(this._progressTrack, cfg.progressWidth, cfg.progressHeight, cfg.progressTrackColor);
    this._paintProgressFill(this._progressFill, 0, cfg.progressHeight, cfg.progressFillColor);
    this._progressTrack.x = -cfg.progressWidth / 2;
    this._progressFill.x = -cfg.progressWidth / 2;
    this._progressTrack.y = progressY - cfg.progressHeight / 2;
    this._progressFill.y = progressY - cfg.progressHeight / 2;
    container.addChild(this._progressTrack);
    container.addChild(this._progressFill);

    // Ready-state label at the same Y as the progress bar.
    const readyLabelStyle = this.styleManager.resolve<LabelComponentStyle>(UIComponentsStyleIds.Label, {
      text: { fontSize: cfg.readyLabelFontSize, fontWeight: "700", color: cfg.readyLabelColor },
    });
    this._readyLabel = new LabelComponent(this.assetLoader, readyLabelStyle, {
      text: "",
      anchorX: 0.5,
      anchorY: 0.5,
    });
    this._readyLabel.x = 0;
    this._readyLabel.y = progressY;
    this._readyLabel.visible = false;
    container.addChild(this._readyLabel);

    // Floating X cancel button — positioned per-frame in
    // `setBoosterPanelState`. Built once and reused across all
    // Selecting transitions.
    this._cancelButton = this.buildCancelButton();
    this._cancelButton.visible = false;
    container.addChild(this._cancelButton);

    return container;
  }

  private buildCancelButton(): Container {
    if (!this._config) throw new Error("GameScreenView: config not injected");
    const cancelCfg = this._config.booster.cancel;
    const container = new Container();

    const radius = cancelCfg.size / 2;
    const bg = new Graphics();
    bg.circle(0, 0, radius).fill(cancelCfg.backgroundColor);
    container.addChild(bg);

    // Two diagonal lines forming an X. Length = ~half the button
    // size; line width proportional to the size.
    const tipReach = radius * 0.5;
    const lineWidth = Math.max(1.5, cancelCfg.size * 0.1);
    const x = new Graphics();
    x.moveTo(-tipReach, -tipReach).lineTo(tipReach, tipReach);
    x.moveTo(tipReach, -tipReach).lineTo(-tipReach, tipReach);
    x.stroke({ width: lineWidth, color: cancelCfg.iconColor, cap: "round" });
    container.addChild(x);

    container.on("pointertap", () => this._fireBoosterCancelled());

    return container;
  }

  private _fireBoosterActivated(type: BoosterType): void {
    for (const cb of this._boosterListeners) cb(type);
  }

  private _fireBoosterCancelled(): void {
    for (const cb of this._cancelListeners) cb();
  }

  private _paintCircle(g: Graphics, radius: number, color: number): void {
    g.clear();
    g.circle(0, 0, radius).fill(color);
  }

  private _paintBoosterCircle(g: Graphics, radius: number, color: number): void {
    g.clear();
    g.circle(0, 0, radius).fill(color);
  }

  /**
   * Build the booster button icon as a `Sprite` from the texture
   * loaded by `BlockPuzzleApp.loadAssets`. The source SVGs are
   * white-fill so tinting to the configured label colour just
   * recolours them; sized as a square (`size × size`), anchored at
   * the centre so it sits on the button's origin.
   */
  private _buildBoosterIcon(type: BoosterType, size: number, color: number): Sprite {
    const texture = this.assetLoader.getAsset<Texture>(BOOSTER_ICON_ASSET_IDS[type]);
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.width = size;
    sprite.height = size;
    sprite.tint = color;
    return sprite;
  }

  private _paintProgressTrack(g: Graphics, width: number, height: number, color: number): void {
    g.clear();
    g.roundRect(0, 0, width, height, height / 2).fill(color);
  }

  private _paintProgressFill(g: Graphics, width: number, height: number, color: number): void {
    g.clear();
    if (width <= 0) return;
    g.roundRect(0, 0, width, height, height / 2).fill(color);
  }

  private buildHudLabel(initialText: string, fontSize: number): LabelComponent {
    const style = this.styleManager.resolve<LabelComponentStyle>(UIComponentsStyleIds.Label, {
      text: { fontSize, fontWeight: "600", color: 0xffffff },
    });
    return new LabelComponent(this.assetLoader, style, { text: initialText });
  }

  private buildEndStateLabel(): LabelComponent {
    const style = this.styleManager.resolve<LabelComponentStyle>(UIComponentsStyleIds.Label, {
      text: { fontSize: END_STATE_LABEL_SIZE, fontWeight: "700", color: 0xffffff },
    });
    return new LabelComponent(this.assetLoader, style, { text: "", anchorX: 0.5, anchorY: 0.5 });
  }
}
