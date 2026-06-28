import {
  AssetRequest,
  AssetRequestList,
  AssetTypes,
  ControlAnchor,
  ControlType,
  Front2dCameraController,
  GameCameraBinding,
  GameCameraManager,
  GamelabsApp,
  LogTypes,
  OnScreenControlManager,
  OnScreenControlsBinding,
  ParticleManager,
  ParticlesBinding,
  SettingsBinding,
  SettingsBooleanField,
  SettingsManager,
  SettingsNumberField,
  SettingsUIIds,
  TimelineBinding,
  TimelineManager,
  UIComponentsBinding,
  UIEvents,
  World,
  type VirtualButtonConfig,
  type VirtualLabelConfig,
} from "@gamebyte/gamelabsjs";

import { BubbleShooterAssetIds } from "./BubbleShooterAssetIds";
import { BubbleShooterConfig } from "./BubbleShooterConfig";
import { BubbleShooterUIIds } from "./BubbleShooterUIIds";
import { BubbleGridLayout } from "./utilities/BubbleGridLayout";
import { BubbleGrid } from "./models/BubbleGrid";
import { IBubbleGrid } from "./models/IBubbleGrid";
import { Shooter } from "./models/Shooter";
import { IShooter } from "./models/IShooter";
import { Score } from "./models/Score";
import { IScore } from "./models/IScore";
import { GameEvents } from "./events/GameEvents";
import { GameOperations } from "./utilities/GameOperations";
import { AimTrajectoryCalculator } from "./utilities/AimTrajectoryCalculator";
import { MatchFinder } from "./utilities/MatchFinder";
import { FloatingBubbleFinder } from "./utilities/FloatingBubbleFinder";
import { GameAreaView } from "./views/GameAreaView.three";
import { GameAreaViewController } from "./controllers/GameAreaViewController";
import { PlayAreaClipping } from "./views/PlayAreaClipping";
import { PowerUpButtonTargets } from "./views/PowerUpButtonTargets";
import { PowerUpCollectionView } from "./views/PowerUpCollectionView.three";
import { PowerUpCollectionViewController } from "./controllers/PowerUpCollectionViewController";
import { GameScreenView } from "./views/GameScreenView.pixi";
import { GameScreenViewController } from "./controllers/GameScreenViewController";
import { EffectsView } from "./views/EffectsView.three";
import { EffectsViewController } from "./controllers/EffectsViewController";
import { FallingBubblesView } from "./views/FallingBubblesView.three";
import { FallingBubblesViewController } from "./controllers/FallingBubblesViewController";
import { FlightView } from "./views/FlightView.three";
import { FlightViewController } from "./controllers/FlightViewController";
import { AimLineView } from "./views/AimLineView.three";
import { AimLineViewController } from "./controllers/AimLineViewController";
import { BubbleGridView } from "./views/BubbleGridView.three";
import { BubbleGridViewController } from "./controllers/BubbleGridViewController";
import { ShooterView } from "./views/ShooterView.three";
import { ShooterViewController } from "./controllers/ShooterViewController";
import { HudHookup } from "./utilities/HudHookup";
import { SettingsHookup } from "./utilities/SettingsHookup";
import { SoundManager } from "./utilities/SoundManager";
import { SoundSynth } from "./utilities/SoundSynth";

/**
 * Bubble Shooter scaffold.
 *
 * Step 3 in a multi-step build: play area + empty grid + initial bubble
 * layout from earlier steps, plus a shooter at the bottom-centre that
 * holds a random-coloured bubble, rotates to track the cursor, and shows
 * a dotted aim line that reflects off the side walls and stops at the
 * top wall or the first bubble it would touch. No firing yet.
 */
export class BubbleShooterApp extends GamelabsApp {
  private readonly _assetRequestList = new AssetRequestList();
  private readonly _config = new BubbleShooterConfig();
  private readonly _layout = new BubbleGridLayout(this._config);
  private readonly _grid = new BubbleGrid(this._layout);
  private readonly _shooter = new Shooter();
  private readonly _score = new Score();
  private readonly _gameEvents = new GameEvents();
  private readonly _gameCameraBinding = new GameCameraBinding();
  private readonly _onScreenControlsBinding = new OnScreenControlsBinding();
  private readonly _uiComponentsBinding = new UIComponentsBinding();
  // Held as a field so it's reachable from `_layoutPowerUpButtons`
  // even when the framework's ResizeObserver fires before
  // `configureDI` has bound it on the view DI container (the
  // observer attaches in the framework constructor; DI bindings
  // run later inside `initialize`).
  private readonly _powerUpButtonTargets = new PowerUpButtonTargets();
  // SettingsBinding registers the framework SettingsManager + popup
  // view/controller. We pass `audioFields: false` because the bubble
  // shooter only exposes SFX-related fields (no music yet) — the
  // matching `addField(...)` calls + the audio bridge live in
  // postInitialize via `SettingsHookup`.
  private readonly _settingsBinding = new SettingsBinding();
  // ParticlesBinding registers the ParticleManager + ParticleBudget +
  // ParticleModel singletons. Pop-burst FX in EffectsView use a
  // WorldParticleEmitter routed through this manager. Default
  // budget (4096) is generous; bubbleshooter's busiest frame is a
  // ~19-cell bomb burst × popParticleCount → still well under cap.
  private readonly _particlesBinding = new ParticlesBinding();
  // TimelineBinding registers TimelineManager + TimelineModel +
  // TimelineEvents. Power-up collection (`PowerUpFlightTrack` view-
  // side, `PowerUpCountBumpTrack` model-side) uses tracks for its
  // duration timing instead of hand-ticked age counters.
  private readonly _timelineBinding = new TimelineBinding();

  private _gameAreaView: GameAreaView | null = null;
  private _cameraManager: GameCameraManager | null = null;
  private _cameraController: Front2dCameraController | null = null;
  private _soundManager: SoundManager | null = null;
  private _hudHookup: HudHookup | null = null;
  private _settingsHookup: SettingsHookup | null = null;
  private _particleManager: ParticleManager | null = null;
  private _timelineManager: TimelineManager | null = null;
  private _layoutChangedUnsub: (() => void) | null = null;

  // Power-up button + count configs are kept by reference so resize can
  // reposition them against the play area's bottom-right corner (rather
  // than the screen's), by mutating offsetX/Y in place. The OSC view
  // re-reads these on its next reposition (driven by AppEvents.onResize).
  private _bombButtonConfig: VirtualButtonConfig | null = null;
  private _bombCountConfig: VirtualLabelConfig | null = null;
  private _fireballButtonConfig: VirtualButtonConfig | null = null;
  private _fireballCountConfig: VirtualLabelConfig | null = null;
  private _targetButtonConfig: VirtualButtonConfig | null = null;
  /**
   * Aim-aid toggle. Starts closed; the bottom-left target button
   * flips it. The visible state is mirrored to the AimLineView via
   * `GameEvents.onAimAidVisibleChanged`.
   */
  private _aimAidVisible = false;

  public constructor(stageEl: HTMLElement) {
    super({ mount: stageEl });
  }

  protected override registerModules(): void {
    this.addModule(this._gameCameraBinding);
    this.addModule(this._onScreenControlsBinding);
    this.addModule(this._uiComponentsBinding);
    this.addModule(this._settingsBinding);
    this.addModule(this._particlesBinding);
    this.addModule(this._timelineBinding);
  }

  protected override configureDI(): void {
    if (!this.world) {
      this.logger.log("World is not initialized", LogTypes.Error);
      throw new Error("World is not initialized");
    }
    this.viewDiContainer.bindInstance(World, this.world);

    this.diContainer.bindInstance(BubbleShooterConfig, this._config);
    this.viewDiContainer.bindInstance(BubbleShooterConfig, this._config);
    this.diContainer.bindInstance(BubbleGridLayout, this._layout);
    this.viewDiContainer.bindInstance(BubbleGridLayout, this._layout);
    this.diContainer.bindInstance(BubbleGrid, this._grid, [IBubbleGrid]);
    this.diContainer.bindInstance(Shooter, this._shooter, [IShooter]);
    this.diContainer.bindInstance(Score, this._score, [IScore]);
    this.diContainer.bindInstance(GameEvents, this._gameEvents);
    // Shared bubble-clipping planes — view-side only, so just the
    // viewDiContainer. Each bubble-drawing sub-view pulls the same
    // instance and assigns its `.planes` to every bubble material.
    this.viewDiContainer.bindInstance(PlayAreaClipping, new PlayAreaClipping(this._layout));
    // World-space positions of the HUD power-up buttons. App writes
    // these on every layout / resize pass; PowerUpCollectionView
    // reads them as the flight destination. Bind the App's own
    // instance so `_layoutPowerUpButtons` can write to it without a
    // DI lookup (resize events can fire before this binding is set).
    this.viewDiContainer.bindInstance(PowerUpButtonTargets, this._powerUpButtonTargets);

    // Top-left score readout via the on-screen-controls Label widget.
    const osc = this.diContainer.getInstance(OnScreenControlManager);
    osc.addControl({
      type: ControlType.Label,
      id: BubbleShooterUIIds.ScoreLabel,
      anchor: ControlAnchor.TopLeft,
      offsetX: 16,
      offsetY: 16,
      content: "Score: 0",
      text: { color: 0xffffff, fontSize: 22, fontWeight: "700" },
    });
    // Centre-of-screen "YOU WIN!" overlay, hidden until the grid clears.
    osc.addControl({
      type: ControlType.Label,
      id: BubbleShooterUIIds.WinLabel,
      anchor: ControlAnchor.Center,
      offsetX: 0,
      offsetY: 0,
      anchorX: 0.5,
      anchorY: 0.5,
      content: "YOU WIN!",
      text: { color: 0xfff2a0, fontSize: 64, fontWeight: "800" },
    });
    osc.setControlVisible(BubbleShooterUIIds.WinLabel, false);
    // Centre-of-screen "GAME OVER" overlay, hidden until a bubble
    // settles in the bottom row.
    osc.addControl({
      type: ControlType.Label,
      id: BubbleShooterUIIds.GameOverLabel,
      anchor: ControlAnchor.Center,
      offsetX: 0,
      offsetY: 0,
      anchorX: 0.5,
      anchorY: 0.5,
      content: "GAME OVER",
      text: { color: 0xff6464, fontSize: 64, fontWeight: "800" },
    });
    osc.setControlVisible(BubbleShooterUIIds.GameOverLabel, false);
    // Power-up button strip — bomb is rightmost, fireball sits to its
    // LEFT, each step-left adds `(powerUpButtonSize + powerUpButtonGap)`
    // to offsetX (BottomRight: bigger offsetX = further LEFT). Concrete
    // offsets are placeholders here; `_layoutPowerUpButtons` recomputes
    // them on every resize / layout-change against the play area's
    // bottom edge so the strip always sits in the gap below the
    // shooter regardless of grid width.
    this._bombButtonConfig = {
      type: ControlType.Button,
      id: BubbleShooterUIIds.BombButton,
      anchor: ControlAnchor.BottomRight,
      offsetX: 0,
      offsetY: 0,
      size: this._config.powerUpButtonSize,
      icon: { textureId: BubbleShooterAssetIds.BombIcon, scaleX: 0.7, scaleY: 0.7 },
    };
    osc.addControl(this._bombButtonConfig);
    this._bombCountConfig = {
      type: ControlType.Label,
      id: BubbleShooterUIIds.BombCountLabel,
      anchor: ControlAnchor.BottomRight,
      offsetX: 0,
      offsetY: 0,
      anchorX: 0.5,
      anchorY: 0.5,
      content: `${this._config.initialBombCount}`,
      text: { color: 0xffffff, fontSize: 16, fontWeight: "700" },
    };
    osc.addControl(this._bombCountConfig);
    this._fireballButtonConfig = {
      type: ControlType.Button,
      id: BubbleShooterUIIds.FireballButton,
      anchor: ControlAnchor.BottomRight,
      offsetX: 0,
      offsetY: 0,
      size: this._config.powerUpButtonSize,
      icon: { textureId: BubbleShooterAssetIds.FireballIcon, scaleX: 0.7, scaleY: 0.7 },
    };
    osc.addControl(this._fireballButtonConfig);
    this._fireballCountConfig = {
      type: ControlType.Label,
      id: BubbleShooterUIIds.FireballCountLabel,
      anchor: ControlAnchor.BottomRight,
      offsetX: 0,
      offsetY: 0,
      anchorX: 0.5,
      anchorY: 0.5,
      content: `${this._config.initialFireballCount}`,
      text: { color: 0xffffff, fontSize: 16, fontWeight: "700" },
    };
    osc.addControl(this._fireballCountConfig);
    // Bottom-left target (crosshair) button — toggles the aim-aid
    // layer (dotted aim line + landing-preview ring) on/off. Mirrors
    // the BottomRight power-up strip; positioned by
    // `_layoutPowerUpButtons` so it tracks per-level play-area widths.
    this._targetButtonConfig = {
      type: ControlType.Button,
      id: BubbleShooterUIIds.TargetButton,
      anchor: ControlAnchor.BottomLeft,
      offsetX: 0,
      offsetY: 0,
      size: this._config.powerUpButtonSize,
      icon: { textureId: BubbleShooterAssetIds.TargetIcon, scaleX: 0.7, scaleY: 0.7 },
    };
    osc.addControl(this._targetButtonConfig);
    // Top-right settings (gear) button. Opens the framework
    // SettingsPopup via UIEvents.createPopup in postInitialize. The
    // dev-only level dropdown in GameScreenView is positioned to sit
    // just below this button.
    osc.addControl({
      type: ControlType.Button,
      id: BubbleShooterUIIds.SettingsButton,
      anchor: ControlAnchor.TopRight,
      offsetX: this._config.settingsButtonOffsetX,
      offsetY: this._config.settingsButtonOffsetY,
      size: this._config.settingsButtonSize,
      icon: { textureId: BubbleShooterAssetIds.SettingsIcon, scaleX: 0.7, scaleY: 0.7 },
    });
    this.diContainer.bindSingleton(AimTrajectoryCalculator, () => new AimTrajectoryCalculator());
    this.diContainer.bindSingleton(MatchFinder, () => new MatchFinder());
    this.diContainer.bindSingleton(FloatingBubbleFinder, () => new FloatingBubbleFinder());
    this.diContainer.bindSingleton(GameOperations, () => new GameOperations());
  }

  protected override configureViews(): void {
    this.viewFactory.registerScreen(BubbleShooterUIIds.GameScreen, GameScreenView, GameScreenViewController);
    this.viewFactory.register(GameAreaView, GameAreaViewController);
    this.viewFactory.register(EffectsView, EffectsViewController);
    this.viewFactory.register(FallingBubblesView, FallingBubblesViewController);
    this.viewFactory.register(FlightView, FlightViewController);
    this.viewFactory.register(AimLineView, AimLineViewController);
    this.viewFactory.register(BubbleGridView, BubbleGridViewController);
    this.viewFactory.register(ShooterView, ShooterViewController);
    this.viewFactory.register(PowerUpCollectionView, PowerUpCollectionViewController);
  }

  protected override loadAssets(): void {
    this._assetRequestList.addRequest(
      new AssetRequest(AssetTypes.WorldTexture, BubbleShooterAssetIds.BubbleRed, new URL("../assets/bubbles/red.svg", import.meta.url).href),
    );
    this._assetRequestList.addRequest(
      new AssetRequest(AssetTypes.WorldTexture, BubbleShooterAssetIds.BubbleBlue, new URL("../assets/bubbles/blue.svg", import.meta.url).href),
    );
    this._assetRequestList.addRequest(
      new AssetRequest(AssetTypes.WorldTexture, BubbleShooterAssetIds.BubbleGreen, new URL("../assets/bubbles/green.svg", import.meta.url).href),
    );
    this._assetRequestList.addRequest(
      new AssetRequest(AssetTypes.WorldTexture, BubbleShooterAssetIds.BubbleYellow, new URL("../assets/bubbles/yellow.svg", import.meta.url).href),
    );
    this._assetRequestList.addRequest(
      new AssetRequest(AssetTypes.WorldTexture, BubbleShooterAssetIds.BubblePurple, new URL("../assets/bubbles/purple.svg", import.meta.url).href),
    );
    this._assetRequestList.addRequest(
      new AssetRequest(AssetTypes.WorldTexture, BubbleShooterAssetIds.BubbleStone, new URL("../assets/bubbles/stone.svg", import.meta.url).href),
    );
    this._assetRequestList.addRequest(
      new AssetRequest(AssetTypes.WorldTexture, BubbleShooterAssetIds.SwapIcon, new URL("../assets/swap-icon.svg", import.meta.url).href),
    );
    // Power-up sprites: each SVG is loaded twice (world for the
    // held / flying mesh, HUD for the OSC button icon).
    const bombUrl = new URL("../assets/bomb.svg", import.meta.url).href;
    this._assetRequestList.addRequest(
      new AssetRequest(AssetTypes.WorldTexture, BubbleShooterAssetIds.BombBubble, bombUrl),
    );
    this._assetRequestList.addRequest(
      new AssetRequest(AssetTypes.HudTexture, BubbleShooterAssetIds.BombIcon, bombUrl),
    );
    const fireballUrl = new URL("../assets/fireball.svg", import.meta.url).href;
    this._assetRequestList.addRequest(
      new AssetRequest(AssetTypes.WorldTexture, BubbleShooterAssetIds.FireballBubble, fireballUrl),
    );
    this._assetRequestList.addRequest(
      new AssetRequest(AssetTypes.HudTexture, BubbleShooterAssetIds.FireballIcon, fireballUrl),
    );
    this._assetRequestList.addRequest(
      new AssetRequest(
        AssetTypes.HudTexture,
        BubbleShooterAssetIds.SettingsIcon,
        new URL("../assets/settings.svg", import.meta.url).href,
      ),
    );
    this._assetRequestList.addRequest(
      new AssetRequest(
        AssetTypes.HudTexture,
        BubbleShooterAssetIds.TargetIcon,
        new URL("../assets/target.svg", import.meta.url).href,
      ),
    );
    this.assetManager.loadAll(this._assetRequestList.getRequests());
    this._registerSoundBuffers();
  }

  /**
   * Synthesise SFX buffers off the AudioContext and register them
   * directly with the AssetManager. We bypass the normal request /
   * load pipeline because the buffers are generated in-process — no
   * network fetch needed — and `setAsset` makes them visible to
   * `AudioService.playSfx(assetId)` immediately.
   */
  private _registerSoundBuffers(): void {
    const ctx = this.audioService.context;
    if (!ctx) {
      this.logger.log("AudioContext unavailable; SFX disabled", LogTypes.Warning);
      return;
    }
    const am = this.assetManager;
    am.setAsset(BubbleShooterAssetIds.SoundPop, SoundSynth.buildPop(ctx));
    am.setAsset(BubbleShooterAssetIds.SoundSnap, SoundSynth.buildSnap(ctx));
    am.setAsset(BubbleShooterAssetIds.SoundShoot, SoundSynth.buildShoot(ctx));
    am.setAsset(BubbleShooterAssetIds.SoundBomb, SoundSynth.buildBomb(ctx));
    am.setAsset(BubbleShooterAssetIds.SoundFireball, SoundSynth.buildFireball(ctx));
    am.setAsset(BubbleShooterAssetIds.SoundSwap, SoundSynth.buildSwap(ctx));
  }

  protected override postInitialize(): void {
    if (!this.world || !this.hud) {
      this.logger.log("World or HUD is not initialized", LogTypes.Error);
      throw new Error("World or HUD is not initialized");
    }

    // Subscribe BEFORE any sub-view / controller — `GameScreenViewController`
    // also subscribes to `onLayoutChanged` to push the OSC reposition,
    // and that must run AFTER this handler has mutated the button
    // configs against the new play-area dimensions. GameEvents
    // dispatches in insertion order, so subscribing here puts the App's
    // mutate step first and the controller's reposition step second.
    this._layoutChangedUnsub = this._gameEvents.onLayoutChanged(() => this._onLayoutChanged());

    // Resolve the particle + timeline managers up front so sub-view
    // controllers can inject them during sub-view creation.
    this._particleManager = this.diContainer.getInstance(ParticleManager);
    this._timelineManager = this.diContainer.getInstance(TimelineManager);

    this._gameAreaView = this.viewFactory.createView(GameAreaView);
    this.world.addRootView(this._gameAreaView);

    this._cameraManager = this.diContainer.getInstance(GameCameraManager);
    this._cameraManager.initialize(this.world);
    this._cameraController = new Front2dCameraController(this._cameraManager).register();
    this._cameraController.followPosition(0, 0, this._config.cameraFocusZ);
    this._fitCamera(this.width, this.height);
    this._layoutPowerUpButtons(this.width, this.height);

    this.diContainer.getInstance(UIEvents).createScreen(BubbleShooterUIIds.GameScreen, this._config.transitions.gameScreenEnter);

    // Wire the bomb button: ops is resolvable now that DI is fully
    // configured. Single-shot on press; the manager's key handler
    // pattern fires both on press and release with `isPressed`.
    const osc = this.diContainer.getInstance(OnScreenControlManager);
    const ops = this.diContainer.getInstance(GameOperations);
    osc.addKeyHandler(BubbleShooterUIIds.BombButton, (isPressed) => {
      if (isPressed) ops.activateBomb();
    });
    osc.addKeyHandler(BubbleShooterUIIds.FireballButton, (isPressed) => {
      if (isPressed) ops.activateFireball();
    });
    osc.addKeyHandler(BubbleShooterUIIds.TargetButton, (isPressed) => {
      if (!isPressed) return;
      this._aimAidVisible = !this._aimAidVisible;
      this._gameEvents.emitAimAidVisibleChanged(this._aimAidVisible);
      this._refreshTargetButtonTint();
    });
    // Register SFX-only settings fields, then wire the gear button to
    // open the framework SettingsPopup. Field names match the
    // framework defaults so a future switch to `SettingsBinding({
    // defaults: true })` would override these without breaking the
    // hookup manager.
    const settingsManager = this.diContainer.getInstance(SettingsManager);
    settingsManager.addField(new SettingsBooleanField("sfx", "Sound Effects", true));
    settingsManager.addField(new SettingsNumberField("sfxVolume", "SFX Volume", 100, 0, 100, 5));
    const uiEvents = this.diContainer.getInstance(UIEvents);
    osc.addKeyHandler(BubbleShooterUIIds.SettingsButton, (isPressed) => {
      if (isPressed) uiEvents.createPopup(SettingsUIIds.SettingsPopup);
    });

    this._soundManager = new SoundManager();
    this._soundManager.inject(this.diContainer);
    this._soundManager.start();

    this._hudHookup = new HudHookup();
    this._hudHookup.inject(this.diContainer);
    this._hudHookup.start();

    // Settings → AudioService bridge. Applies persisted sfx + volume
    // values up front and re-applies on every settings change.
    this._settingsHookup = new SettingsHookup();
    this._settingsHookup.inject(this.diContainer);
    this._settingsHookup.start();
  }

  private _onLayoutChanged(): void {
    this._fitCamera(this.width, this.height);
    this._layoutPowerUpButtons(this.width, this.height);
  }

  /**
   * Re-issue the target button so its bg ring picks up the
   * aim-aid-on tint (bright green when open, framework default
   * when closed). The OSC view caches the resolved style at
   * `_createButton`, so we remove + re-add to force a fresh
   * `OscButton` with the updated `up` slot. The same config object
   * is reused so its current offsetX/offsetY (set by
   * `_layoutPowerUpButtons`) survive the round-trip.
   */
  private _refreshTargetButtonTint(): void {
    const config = this._targetButtonConfig;
    if (!config) return;
    const osc = this.diContainer.getInstance(OnScreenControlManager);
    config.up = this._aimAidVisible
      ? { color: this._config.targetButtonActiveBgColor, alpha: this._config.targetButtonActiveBgAlpha }
      : undefined;
    osc.removeControl(config.id);
    osc.addControl(config);
  }

  protected override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this._cameraManager?.resize(width, height);
    this._fitCamera(width, height);
    this._layoutPowerUpButtons(width, height);
  }

  /**
   * Position the power-up button strip in the bottom margin of the
   * play area — the gap between the play-area's bottom edge and the
   * shooter's bottom. Buttons are right-aligned: bomb is rightmost,
   * fireball one step left, future power-ups grow further leftward
   * in `(powerUpButtonSize + powerUpButtonGap)` increments. Strip Y is
   * vertically centred in the (shooterMarginFromBottom − shooterRadius)
   * gap so buttons can never overlap the shooter or the next-bubble
   * preview at any grid width. The OSC manager re-reads `config.offsetX/Y`
   * on every reposition, so mutating in place + the screen view's
   * onResize → OSC reposition flow is enough to update visuals.
   */
  private _layoutPowerUpButtons(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    const aspect = width / height;
    const requiredW = this._layout.areaWidth + 2 * this._config.cameraMargin;
    const requiredH = this._layout.areaHeight + 2 * this._config.cameraMargin;
    const orthoSize = Math.max(requiredH, requiredW / aspect);
    const pxPerWorld = height / orthoSize;

    // Screen-px distance from the bottom edge of the SCREEN to the
    // bottom edge of the PLAY AREA (BottomRight anchors measure
    // offsets from the screen edges inward).
    const playAreaBottomToScreenBottom = height / 2 - this._layout.halfAreaHeight * pxPerWorld;
    const playAreaRightToScreenRight = width / 2 - this._layout.halfAreaWidth * pxPerWorld;

    // Strip vertical centre = halfway between the play-area bottom
    // and the shooter's bottom. Bottom-of-shooter sits
    // `shooterMarginFromBottom − shooterRadius` world units above
    // the play-area bottom; the strip centre is half that.
    const stripCentreAboveBottomWorld =
      (this._config.shooterMarginFromBottom - this._config.shooterRadius) / 2;
    const buttonOffsetY = playAreaBottomToScreenBottom + stripCentreAboveBottomWorld * pxPerWorld;

    // Right-aligned slots: index 0 = rightmost (bomb). Each slot's
    // X offset measures the button CENTRE inward from the screen's
    // right edge.
    const buttonSize = this._config.powerUpButtonSize;
    const rightmostOffsetX = playAreaRightToScreenRight + this._config.powerUpButtonEdgeInset + buttonSize / 2;
    const slotStep = buttonSize + this._config.powerUpButtonGap;
    const bombOffsetX = rightmostOffsetX;
    const fireballOffsetX = rightmostOffsetX + slotStep;

    const countInset = this._config.powerUpCountInset;
    const place = (
      button: VirtualButtonConfig | null,
      count: VirtualLabelConfig | null,
      slotX: number,
    ): void => {
      if (button) {
        button.offsetX = slotX;
        button.offsetY = buttonOffsetY;
      }
      if (count) {
        count.offsetX = slotX - countInset;
        count.offsetY = buttonOffsetY + countInset;
      }
    };
    place(this._bombButtonConfig, this._bombCountConfig, bombOffsetX);
    place(this._fireballButtonConfig, this._fireballCountConfig, fireballOffsetX);

    // Target button — left mirror of the rightmost power-up. Anchored
    // BottomLeft, so its offsetX is measured from the screen LEFT edge
    // inward; by symmetry (play area centred), the BottomLeft inset
    // equals the BottomRight inset = `playAreaRightToScreenRight`.
    if (this._targetButtonConfig) {
      this._targetButtonConfig.offsetX = rightmostOffsetX;
      this._targetButtonConfig.offsetY = buttonOffsetY;
    }

    // Project the BottomRight-anchored button centres into world
    // coordinates so power-up collection icons can fly from a grid
    // cell to the right HUD button. Ortho centres at (0, 0):
    //   screenX = width - offsetX  →  worldX = (width/2 - offsetX) / pxPerWorld
    //   screenY = height - offsetY →  worldY = (offsetY - height/2) / pxPerWorld
    this._powerUpButtonTargets.setBombTarget(
      (width / 2 - bombOffsetX) / pxPerWorld,
      (buttonOffsetY - height / 2) / pxPerWorld,
    );
    this._powerUpButtonTargets.setFireballTarget(
      (width / 2 - fireballOffsetX) / pxPerWorld,
      (buttonOffsetY - height / 2) / pxPerWorld,
    );
  }

  /**
   * Pick an ortho size that always fits the play area plus a uniform margin
   * on every side. With ortho conventions `visible_h = orthoSize` and
   * `visible_w = orthoSize * aspect`, both spans must clear the area extents.
   */
  private _fitCamera(screenWidth: number, screenHeight: number): void {
    if (screenWidth <= 0 || screenHeight <= 0) return;
    const aspect = screenWidth / screenHeight;
    const areaWidth = this._layout.gridWidth + 2 * this._config.playAreaPaddingX;
    const areaHeight = this._layout.gridHeight + this._config.playAreaPaddingTop + this._config.playAreaPaddingBottom;
    const requiredW = areaWidth + 2 * this._config.cameraMargin;
    const requiredH = areaHeight + 2 * this._config.cameraMargin;
    const orthoForHeight = requiredH;
    const orthoForWidth = requiredW / aspect;
    this._cameraManager?.setOrthoSize(Math.max(orthoForHeight, orthoForWidth));
  }

  protected override onStep(timestepSeconds: number): void {
    super.onStep(timestepSeconds);
    this._cameraManager?.update(timestepSeconds);
    // Both Particles and Timeline are hand-ticked. Order matters:
    // timeline first so any track that wants to spawn particles
    // (none in bubbleshooter today, but the framework convention
    // documented on `ParticlesBinding`) hits the emitters before
    // the manager advances them this frame.
    this._timelineManager?.update(timestepSeconds);
    this._particleManager?.update(timestepSeconds);
  }

  protected override preDestroy(): void {
    this._layoutChangedUnsub?.();
    this._layoutChangedUnsub = null;
    this._settingsHookup?.destroy();
    this._settingsHookup = null;
    this._hudHookup?.destroy();
    this._hudHookup = null;
    this._soundManager?.destroy();
    this._soundManager = null;
    // Drop every live emitter so their THREE meshes / materials are
    // disposed before the world tears down.
    this._particleManager?.destroyAll();
    this._particleManager = null;
    // Cancel any in-flight tracks so their `onCancel` hooks run and
    // release whatever they were holding (icon meshes, count-bump
    // closures).
    this._timelineManager?.cancelAll();
    this._timelineManager = null;
    this._cameraController = null;
    this._gameAreaView?.destroy();
    this._gameAreaView = null;
    super.preDestroy();
  }
}
