import {
  AssetTypes,
  GamelabsApp,
  LogTypes,
  SettingsBinding,
  UIComponentsBinding,
  UIEvents,
} from "@gamebyte/gamelabsjs";
import { UIPlaygroundAssetIds } from "./UIPlaygroundAssetIds.js";
import { UIPlaygroundConfig } from "./UIPlaygroundConfig.js";
import { UIPlaygroundUIIds } from "./UIPlaygroundUIIds.js";
import { BackgroundDemoViewController } from "./controllers/BackgroundDemoViewController.js";
import { ButtonDemoViewController } from "./controllers/ButtonDemoViewController.js";
import { DropdownDemoViewController } from "./controllers/DropdownDemoViewController.js";
import { GridLayoutDemoViewController } from "./controllers/GridLayoutDemoViewController.js";
import { ImageDemoViewController } from "./controllers/ImageDemoViewController.js";
import { LabelDemoViewController } from "./controllers/LabelDemoViewController.js";
import { ListDemoViewController } from "./controllers/ListDemoViewController.js";
import { PlaygroundShellViewController } from "./controllers/PlaygroundShellViewController.js";
import { RadioButtonDemoViewController } from "./controllers/RadioButtonDemoViewController.js";
import { RadioButtonGroupDemoViewController } from "./controllers/RadioButtonGroupDemoViewController.js";
import { ScrollViewDemoViewController } from "./controllers/ScrollViewDemoViewController.js";
import { SettingsModuleDemoViewController } from "./controllers/SettingsModuleDemoViewController.js";
import { SliderDemoViewController } from "./controllers/SliderDemoViewController.js";
import { ToggleDemoViewController } from "./controllers/ToggleDemoViewController.js";
import { ControlsManager } from "./utilities/ControlsManager.js";
import { IControlsManager } from "./utilities/IControlsManager.js";
import { BackgroundDemoView } from "./views/BackgroundDemoView.pixi.js";
import { ButtonDemoView } from "./views/ButtonDemoView.pixi.js";
import { DropdownDemoView } from "./views/DropdownDemoView.pixi.js";
import { GridLayoutDemoView } from "./views/GridLayoutDemoView.pixi.js";
import { ImageDemoView } from "./views/ImageDemoView.pixi.js";
import { LabelDemoView } from "./views/LabelDemoView.pixi.js";
import { ListDemoView } from "./views/ListDemoView.pixi.js";
import { PlaygroundShellView } from "./views/PlaygroundShellView.pixi.js";
import { RadioButtonDemoView } from "./views/RadioButtonDemoView.pixi.js";
import { RadioButtonGroupDemoView } from "./views/RadioButtonGroupDemoView.pixi.js";
import { ScrollViewDemoView } from "./views/ScrollViewDemoView.pixi.js";
import { SettingsModuleDemoView } from "./views/SettingsModuleDemoView.pixi.js";
import { SliderDemoView } from "./views/SliderDemoView.pixi.js";
import { ToggleDemoView } from "./views/ToggleDemoView.pixi.js";

/**
 * UI Components Playground.
 *
 * Single-screen Pixi shell with four regions — sidebar / stage /
 * controls / event log. Every framework `uicomponents` member gets a
 * full View + ViewController pair so its props can be tweaked live.
 *
 * To add a new component playground:
 *   1. Create the View + Controller pair under `views/<X>DemoView.pixi.ts`
 *      and `controllers/<X>DemoViewController.ts`.
 *   2. Register them with the framework's view factory in
 *      {@link configureViews} (this file).
 *   3. Add a row to `DEMO_REGISTRY` in `constants/DemoRegistry.ts`.
 *   4. Map the id → View class inside
 *      `PlaygroundShellView._DEMO_VIEW_BY_ID`.
 *
 * No world content (the framework still creates a 3D World by default
 * but this example never adds anything to it). All visuals live on
 * the HUD.
 */
export class UIPlaygroundApp extends GamelabsApp {
  private readonly _config = new UIPlaygroundConfig();
  private readonly _controlsManager = new ControlsManager();
  private readonly _uiComponentsBinding = new UIComponentsBinding();
  // SettingsBinding is registered so the Settings module demo's gear
  // button can open the framework settings popup. `audioFields: true`
  // opts into the framework's standard audio field set (sfx / music /
  // sfxVolume / musicVolume) and installs the AudioService bridge —
  // the playground app itself doesn't call `addField(...)` so the
  // popup renders exactly what the framework provides.
  private readonly _settingsBinding = new SettingsBinding({ audioFields: true });

  public constructor(stageEl: HTMLElement) {
    super({ mount: stageEl });
  }

  protected override registerModules(): void {
    // Ships the framework default button skin (idle/hover/pressed/disabled)
    // so the Button demo's "default" button has art without us providing any.
    this.addModule(this._uiComponentsBinding);
    // Registers SettingsManager + SettingsPopupView/Controller. The
    // Settings module demo's gear button opens the popup via
    // `UIEvents.createPopup(SettingsUIIds.SettingsPopup)`. The
    // playground does NOT register any fields on SettingsManager —
    // the popup renders exactly as the framework provides it.
    this.addModule(this._settingsBinding);
  }

  protected override loadAssets(): void {
    // Custom skin used by the second button in the Button demo. Demonstrates
    // the override flow: the skin's asset ids point at example-owned PNGs
    // registered here, distinct from the default-skin ids shipped by
    // UIComponentsBinding.
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomButtonIdle,
      new URL("../assets/button/idle.png", import.meta.url).href,
    );
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomButtonHover,
      new URL("../assets/button/hover.png", import.meta.url).href,
    );
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomButtonPressed,
      new URL("../assets/button/pressed.png", import.meta.url).href,
    );
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomButtonDisabled,
      new URL("../assets/button/disabled.png", import.meta.url).href,
    );

    // Custom slider skin for the SliderDemo's RGB section. Neutral white
    // textures so per-channel `.tint` (R/G/B) multiplies cleanly.
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomSliderTrack,
      new URL("../assets/slider/track.png", import.meta.url).href,
    );
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomSliderFill,
      new URL("../assets/slider/fill.png", import.meta.url).href,
    );
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomSliderThumb,
      new URL("../assets/slider/thumb.png", import.meta.url).href,
    );

    // Custom radio skin for the RadioButtonDemo's "custom" example.
    // Two indicator textures with a different palette than the default
    // skin so the side-by-side comparison is visually distinct.
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomRadioUnselected,
      new URL("../assets/radio/unselected.png", import.meta.url).href,
    );
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomRadioSelected,
      new URL("../assets/radio/selected.png", import.meta.url).href,
    );

    // Custom toggle skin for the ToggleDemo's "custom" example.
    // Rectangle track + square thumb in a violet / amber palette so it
    // visibly contrasts with the default rounded-pill skin.
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomToggleTrackOn,
      new URL("../assets/toggle/track-on.png", import.meta.url).href,
    );
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomToggleTrackOff,
      new URL("../assets/toggle/track-off.png", import.meta.url).href,
    );
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomToggleThumb,
      new URL("../assets/toggle/thumb.png", import.meta.url).href,
    );

    // Custom background for the BackgroundDemo's "custom" example —
    // dark slate vignette so the cover-fit + overlay alpha controls
    // read clearly against the white framework default.
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomBackground,
      new URL("../assets/background/custom.png", import.meta.url).href,
    );

    // Custom dropdown skin for the DropdownDemo's "custom" example —
    // violet / amber palette to contrast with the default slate /
    // indigo skin shipped by `UIComponentsBinding`.
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomDropdownHeader,
      new URL("../assets/dropdown/header.png", import.meta.url).href,
    );
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomDropdownList,
      new URL("../assets/dropdown/list.png", import.meta.url).href,
    );
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomDropdownItemIdle,
      new URL("../assets/dropdown/item-idle.png", import.meta.url).href,
    );
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomDropdownItemHover,
      new URL("../assets/dropdown/item-hover.png", import.meta.url).href,
    );
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomDropdownItemSelected,
      new URL("../assets/dropdown/item-selected.png", import.meta.url).href,
    );
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomDropdownChevron,
      new URL("../assets/dropdown/chevron.png", import.meta.url).href,
    );

    // Custom list skin for the ListDemo's "custom" example — violet /
    // amber palette to contrast with the default slate / indigo skin
    // shipped by `UIComponentsBinding`.
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomListItemIdle,
      new URL("../assets/list/item-idle.png", import.meta.url).href,
    );
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomListItemHover,
      new URL("../assets/list/item-hover.png", import.meta.url).href,
    );
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomListItemSelected,
      new URL("../assets/list/item-selected.png", import.meta.url).href,
    );

    // Custom scroll view skin for the ScrollViewDemo's "custom" example —
    // light-gray rounded thumb with a hamburger grip, sitting visually
    // wider than its track. Contrasts with the default skin's invisible
    // track + slate-blue rounded thumb.
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomScrollViewTrack,
      new URL("../assets/scrollview/track.png", import.meta.url).href,
    );
    this.assetManager.load(
      AssetTypes.HudTexture,
      UIPlaygroundAssetIds.CustomScrollViewThumb,
      new URL("../assets/scrollview/thumb.png", import.meta.url).href,
    );
  }

  protected override configureDI(): void {
    this.diContainer.bindInstance(UIPlaygroundConfig, this._config);
    this.viewDiContainer.bindInstance(UIPlaygroundConfig, this._config);

    // ControlsManager is the bridge between demo controllers and the
    // shell view's controls/log regions. Demos resolve `IControlsManager`
    // (the readonly demo-facing interface); the shell controller resolves
    // `ControlsManager` (the class, with `bindShell` / `unbindShell`).
    this.diContainer.bindInstance(ControlsManager, this._controlsManager, [IControlsManager]);
  }

  protected override configureViews(): void {
    this.viewFactory.registerScreen(
      UIPlaygroundUIIds.PlaygroundShell,
      PlaygroundShellView,
      PlaygroundShellViewController,
    );
    // Demo View ↔ Controller pairs. `viewFactory.createView()` (called
    // from inside the shell view's `mountDemo`) walks these registrations
    // to build + initialise the controller automatically.
    this.viewFactory.register(ButtonDemoView, ButtonDemoViewController);
    this.viewFactory.register(SliderDemoView, SliderDemoViewController);
    this.viewFactory.register(ToggleDemoView, ToggleDemoViewController);
    this.viewFactory.register(GridLayoutDemoView, GridLayoutDemoViewController);
    this.viewFactory.register(DropdownDemoView, DropdownDemoViewController);
    this.viewFactory.register(RadioButtonDemoView, RadioButtonDemoViewController);
    this.viewFactory.register(RadioButtonGroupDemoView, RadioButtonGroupDemoViewController);
    this.viewFactory.register(ScrollViewDemoView, ScrollViewDemoViewController);
    this.viewFactory.register(ListDemoView, ListDemoViewController);
    this.viewFactory.register(ImageDemoView, ImageDemoViewController);
    this.viewFactory.register(LabelDemoView, LabelDemoViewController);
    this.viewFactory.register(BackgroundDemoView, BackgroundDemoViewController);
    this.viewFactory.register(SettingsModuleDemoView, SettingsModuleDemoViewController);
  }

  protected override postInitialize(): void {
    if (!this.hud) {
      this.logger.log("HUD is not initialized", LogTypes.Error);
      throw new Error("HUD is not initialized");
    }

    this.diContainer
      .getInstance(UIEvents)
      .createScreen(UIPlaygroundUIIds.PlaygroundShell, this._config.transitions.screenEnter);
  }
}
