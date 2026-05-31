import * as PIXI from "pixi.js";
import {
  ButtonComponent,
  DropdownComponent,
  HorizontalLayoutComponent,
  HudViewBase,
  RadioButtonGroupComponent,
  ScreenView,
  SliderComponent,
  ToggleComponent,
  UIComponentsStyleIds,
  VerticalLayoutComponent,
  type ButtonComponentStyle,
  type DropdownComponentStyle,
  type IInstanceResolver,
  type IView,
  type RadioButtonComponentStyle,
  type SliderComponentStyle,
  type ToggleComponentStyle,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import { UIPlaygroundConfig } from "../UIPlaygroundConfig.js";
import type { DemoEntry, SliderControlOpts } from "../constants/PlaygroundTypes.js";
import { SIDEBAR_CATEGORY_ORDER } from "../constants/PlaygroundTypes.js";
import { FONT_FAMILY, LABEL_STYLE, LABEL_WIDTH, MONO_FAMILY, READOUT_STYLE, READOUT_WIDTH } from "../constants/Typography.js";
import { BackgroundDemoView } from "./BackgroundDemoView.pixi.js";
import { ButtonDemoView } from "./ButtonDemoView.pixi.js";
import { DropdownDemoView } from "./DropdownDemoView.pixi.js";
import { GridLayoutDemoView } from "./GridLayoutDemoView.pixi.js";
import { ImageDemoView } from "./ImageDemoView.pixi.js";
import { LabelDemoView } from "./LabelDemoView.pixi.js";
import { ListDemoView } from "./ListDemoView.pixi.js";
import { RadioButtonDemoView } from "./RadioButtonDemoView.pixi.js";
import { RadioButtonGroupDemoView } from "./RadioButtonGroupDemoView.pixi.js";
import { ScrollViewDemoView } from "./ScrollViewDemoView.pixi.js";
import { SettingsModuleDemoView } from "./SettingsModuleDemoView.pixi.js";
import { SliderDemoView } from "./SliderDemoView.pixi.js";
import { ToggleDemoView } from "./ToggleDemoView.pixi.js";
import type { IPlaygroundShellView } from "./IPlaygroundShellView.js";

type DemoViewClass = new () => HudViewBase;

/**
 * Playground shell — a single Pixi `ScreenView` divided into four
 * regions (sidebar, stage, controls, log).
 *
 * The shell hosts every rendering primitive (PIXI containers, layout
 * boxes, control widget builders) so neither the shell controller nor
 * any demo controller imports `PIXI.Container`. Demo controllers reach
 * the controls panel through `IControlsManager`, which forwards
 * to this view via the `add*Control` / `clearControls` / `appendLog`
 * methods on `IPlaygroundShellView`.
 */
export class PlaygroundShellView extends ScreenView implements IPlaygroundShellView {
  /**
   * Map of demo id → demo View class. The only place demo View classes
   * are referenced — keeps the shell controller free of any rendering
   * imports. To register a new demo, add an entry here in addition to
   * `DEMO_REGISTRY` and `viewFactory.register(...)` in the App.
   */
  private static readonly _DEMO_VIEW_BY_ID: ReadonlyMap<string, DemoViewClass> = new Map<string, DemoViewClass>([
    ["button", ButtonDemoView],
    ["slider", SliderDemoView],
    ["toggle", ToggleDemoView],
    ["grid-layout", GridLayoutDemoView],
    ["dropdown", DropdownDemoView],
    ["radio-button", RadioButtonDemoView],
    ["radio-group", RadioButtonGroupDemoView],
    ["scroll-view", ScrollViewDemoView],
    ["list", ListDemoView],
    ["image", ImageDemoView],
    ["label", LabelDemoView],
    ["background", BackgroundDemoView],
    ["settings", SettingsModuleDemoView],
  ]);

  private _config: UIPlaygroundConfig | null = null;

  // ── Region containers ──────────────────────────────────────────────
  private _sidebarBg: PIXI.Graphics | null = null;
  private _sidebar: PIXI.Container | null = null;
  private _stageBg: PIXI.Graphics | null = null;
  private _stage: PIXI.Container | null = null;
  private _controlsBg: PIXI.Graphics | null = null;
  /** Outer container for the controls region — hosts global + demo subsections. */
  private _controls: VerticalLayoutComponent | null = null;
  /** Persistent global controls (outline toggle etc.). Survives demo switches. */
  private _globalControls: VerticalLayoutComponent | null = null;
  /** Per-demo controls — cleared by `clearControls()` whenever a new demo mounts. */
  private _demoControls: VerticalLayoutComponent | null = null;
  private _logBg: PIXI.Graphics | null = null;
  private _log: VerticalLayoutComponent | null = null;
  private _logLines: PIXI.Text[] = [];

  // ── Sidebar state ──────────────────────────────────────────────────
  private readonly _selectedListeners = new Set<(id: string) => void>();
  private readonly _sidebarButtons = new Map<string, ButtonComponent>();
  private readonly _sidebarAccents = new Map<string, PIXI.Graphics>();
  private readonly _sidebarUnsubs: Unsubscribe[] = [];

  // ── Stage state ────────────────────────────────────────────────────
  private _activeDemoView: IView | null = null;

  // ── Outline toggle state ───────────────────────────────────────────
  private _outlineEnabled = false;
  private readonly _outlineListeners = new Set<(visible: boolean) => void>();

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(UIPlaygroundConfig);
  }

  public override postInitialize(): void {
    super.postInitialize();
    const cfg = this._cfg;

    this._sidebarBg = new PIXI.Graphics();
    this.addChild(this._sidebarBg);
    this._sidebar = new PIXI.Container();
    this.addChild(this._sidebar);

    this._stageBg = new PIXI.Graphics();
    this.addChild(this._stageBg);
    this._stage = new PIXI.Container();
    this.addChild(this._stage);

    this._controlsBg = new PIXI.Graphics();
    this.addChild(this._controlsBg);
    this._controls = new VerticalLayoutComponent({
      gap: 8,
      padding: cfg.regionPadding,
      alignItems: "stretch",
      justifyContent: "flex-start",
    });
    this.addChild(this._controls);
    // Global controls — shell-level toggles that apply to every demo.
    // Lives at the top of the controls panel and survives `clearControls()`.
    this._globalControls = new VerticalLayoutComponent({
      gap: 4,
      padding: 0,
      alignItems: "stretch",
      justifyContent: "flex-start",
    });
    this._controls.addChild(this._globalControls);
    this._globalControls.addChild(this._buildOutlineToggleRow());
    this._controls.addChild(this._buildControlsDivider());
    // Per-demo controls — populated by demo controllers via add*Control().
    // Each control row is wrapped in a section with a trailing divider
    // (see `_wrapInSection`); the gap below adds breathing room around
    // each divider so successive settings are visually distinct.
    this._demoControls = new VerticalLayoutComponent({
      gap: 8,
      padding: 0,
      alignItems: "stretch",
      justifyContent: "flex-start",
    });
    this._controls.addChild(this._demoControls);

    this._logBg = new PIXI.Graphics();
    this.addChild(this._logBg);
    this._log = new VerticalLayoutComponent({
      gap: 2,
      padding: cfg.regionPadding,
      alignItems: "flex-start",
      justifyContent: "flex-start",
    });
    this.addChild(this._log);

    this.appendLog("Pick a demo from the sidebar →");
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this.layout = { width: Math.max(1, width), height: Math.max(1, height) };
    const cfg = this._cfg;

    // Three columns: [sidebar | (stage / log) | controls]. Sidebar +
    // controls are full-height; the centre column is split vertically
    // between stage (top) and event log (bottom). Every region uses
    // `position: "absolute"` so Yoga doesn't pull them into the
    // ScreenView's default flex row — the manual left/top below is the
    // single source of truth for placement.
    const sidebarW = cfg.sidebarWidth;
    const controlsW = cfg.controlsWidth;
    const centreW = Math.max(200, width - sidebarW - controlsW);
    const logH = cfg.logHeight;
    const stageH = Math.max(160, height - logH);
    const centreX = sidebarW;
    const controlsX = sidebarW + centreW;

    // Sidebar (left column).
    this._redrawRegion(this._sidebarBg, 0, 0, sidebarW, height, cfg.sidebarBgColor);
    if (this._sidebar) {
      this._sidebar.layout = {
        position: "absolute",
        left: 0,
        top: cfg.regionPadding,
        width: sidebarW,
        height: height - cfg.regionPadding * 2,
        flexDirection: "column",
        gap: cfg.sidebarSectionGap,
        padding: cfg.regionPadding,
        alignItems: "stretch",
        justifyContent: "flex-start",
      };
    }

    // Stage (centre top). `alignItems: "center"` + `justifyContent:
    // "center"` keep the active demo view centered regardless of its
    // intrinsic size — fixes the off-screen overflow that demo views
    // had when their internal "100%" wrappers couldn't resolve against
    // an unsized parent.
    this._redrawRegion(this._stageBg, centreX, 0, centreW, stageH, cfg.stageBgColor);
    if (this._stage) {
      this._stage.layout = {
        position: "absolute",
        left: centreX,
        top: 0,
        width: centreW,
        height: stageH,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
      };
    }

    // Event log (centre bottom).
    const logY = stageH;
    this._redrawRegion(this._logBg, centreX, logY, centreW, logH, cfg.logBgColor);
    if (this._log) {
      this._log.layout = {
        position: "absolute",
        left: centreX,
        top: logY,
        width: centreW,
        height: logH,
        flexDirection: "column",
        gap: 2,
        padding: cfg.regionPadding,
        alignItems: "flex-start",
        justifyContent: "flex-start",
      };
    }

    // Controls (right column, full height).
    this._redrawRegion(this._controlsBg, controlsX, 0, controlsW, height, cfg.controlsBgColor);
    if (this._controls) {
      this._controls.layout = {
        position: "absolute",
        left: controlsX,
        top: 0,
        width: controlsW,
        height,
        flexDirection: "column",
        gap: 4,
        padding: cfg.regionPadding,
        alignItems: "stretch",
        justifyContent: "flex-start",
      };
    }
  }

  // ── IPlaygroundShellView — sidebar ─────────────────────────────────

  public setSidebarItems(items: readonly DemoEntry[]): void {
    if (!this._sidebar) return;
    this._clearSidebarUnsubs();
    this._sidebarButtons.clear();
    this._sidebarAccents.clear();
    this._sidebar.removeChildren().forEach((c) => c.destroy({ children: true }));

    for (const category of SIDEBAR_CATEGORY_ORDER) {
      const inCategory = items.filter((it) => it.category === category);
      if (inCategory.length === 0) continue;

      const header = new PIXI.Text({
        text: category.toUpperCase() + (inCategory.length === 1 ? "" : "S"),
        style: {
          fill: this._cfg.sidebarHeaderColor,
          fontSize: 11,
          fontWeight: "800",
          letterSpacing: 1.5,
          fontFamily: FONT_FAMILY,
        },
      });
      header.layout = {};
      this._sidebar.addChild(header);

      for (const item of inCategory) {
        const button = this._makeSidebarButton(item);
        this._sidebarButtons.set(item.id, button);
        this._sidebar.addChild(button);
      }
    }
  }

  public setActiveSidebarItem(id: string): void {
    for (const [itemId, accent] of this._sidebarAccents) {
      this._setAccentVisible(accent, itemId === id);
    }
  }

  public onSidebarSelected(cb: (id: string) => void): Unsubscribe {
    this._selectedListeners.add(cb);
    return () => this._selectedListeners.delete(cb);
  }

  // ── IPlaygroundShellView — stage / demo lifecycle ──────────────────

  public mountDemo(id: string): void {
    if (!this._stage) return;
    this.unmountDemo();

    const ViewClass = PlaygroundShellView._DEMO_VIEW_BY_ID.get(id);
    if (!ViewClass) {
      this.appendLog(`▸ unknown demo id "${id}"`);
      return;
    }

    // viewFactory.createView builds the view AND injects+initialises
    // its controller in one shot.
    const demoView = this.viewFactory.createView(ViewClass);
    this._activeDemoView = demoView;
    this._stage.addChild(demoView);
    this.appendLog(`▸ ${id} mounted`);
  }

  public unmountDemo(): void {
    if (!this._activeDemoView) return;
    this._activeDemoView.destroy();
    this._activeDemoView = null;
    if (this._stage) this._stage.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  // ── IPlaygroundShellView — controls panel ──────────────────────────

  public clearControls(): void {
    if (!this._demoControls) return;
    // Only the per-demo subsection is cleared — the global subsection
    // (outline toggle etc.) lives above and survives demo switches.
    this._demoControls.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  public addSliderControl(
    label: string,
    opts: SliderControlOpts,
    onChange: (value: number) => void,
  ): Unsubscribe {
    if (!this._demoControls) return () => {};
    const formatValue = opts.format ?? ((v: number) => v.toFixed(1));
    const row = new HorizontalLayoutComponent({ gap: 12, padding: 4, alignItems: "center" });

    const labelText = new PIXI.Text({ text: label, style: LABEL_STYLE });
    labelText.layout = { width: LABEL_WIDTH };
    row.addChild(labelText);

    // Slider sizing notes:
    // - `SliderComponent` doesn't set its own `.layout`, so without an
    //   explicit one here Yoga skips it and the row's flex flow only
    //   contains [label, readout] — the slider then renders at its
    //   untransformed (0, 0), appearing on its own line above the row.
    // - The component draws its track centered on y=0 and its thumb at
    //   y=0 with a 10px radius, so the visual extent is
    //   (-thumbRadius, -thumbRadius) → (trackWidth+thumbRadius, +thumbRadius).
    //   We give the slider a `(trackWidth + 2·thumbRadius) × (2·thumbRadius)`
    //   layout box and shift it by `(thumbRadius, thumbRadius)` so the
    //   centered drawing fits inside the box.
    const trackWidth = 140;
    const thumbRadius = 10;
    const sliderStyle = this.styleManager.resolve<SliderComponentStyle>(UIComponentsStyleIds.Slider);
    const slider = new SliderComponent(this.assetLoader, sliderStyle, {
      trackWidth,
      min: opts.min,
      max: opts.max,
      step: opts.step ?? 0,
      value: opts.value,
    });
    slider.layout = { width: trackWidth + thumbRadius * 2, height: thumbRadius * 2 };
    slider.position.set(thumbRadius, thumbRadius);
    row.addChild(slider);

    const readout = new PIXI.Text({ text: formatValue(opts.value), style: READOUT_STYLE });
    readout.layout = { width: READOUT_WIDTH };
    row.addChild(readout);

    const handleChange = (value: number): void => {
      readout.text = formatValue(value);
      onChange(value);
    };
    const sliderUnsub = slider.onChange(handleChange);
    const section = this._wrapInSection(row);
    this._demoControls.addChild(section);
    return () => this._removeControlSection(section, sliderUnsub);
  }

  public addToggleControl(
    label: string,
    initial: boolean,
    onChange: (value: boolean) => void,
  ): Unsubscribe {
    if (!this._demoControls) return () => {};
    const row = new HorizontalLayoutComponent({ gap: 12, padding: 4, alignItems: "center" });

    const labelText = new PIXI.Text({ text: label, style: LABEL_STYLE });
    labelText.layout = { width: LABEL_WIDTH };
    row.addChild(labelText);

    const toggleStyle = this.styleManager.resolve<ToggleComponentStyle>(UIComponentsStyleIds.Toggle);
    const toggle = new ToggleComponent(this.assetLoader, toggleStyle, { value: initial });
    row.addChild(toggle);

    const readout = new PIXI.Text({ text: initial ? "ON" : "OFF", style: READOUT_STYLE });
    readout.layout = { width: READOUT_WIDTH };
    row.addChild(readout);

    const handleChange = (value: boolean): void => {
      readout.text = value ? "ON" : "OFF";
      onChange(value);
    };
    const toggleUnsub = toggle.onChange(handleChange);
    const section = this._wrapInSection(row);
    this._demoControls.addChild(section);
    return () => this._removeControlSection(section, toggleUnsub);
  }

  public addCycleControl<T>(
    label: string,
    values: readonly T[],
    initialIndex: number,
    formatValue: (value: T) => string,
    onChange: (value: T, index: number) => void,
  ): Unsubscribe {
    if (!this._demoControls) return () => {};
    const row = new HorizontalLayoutComponent({ gap: 12, padding: 4, alignItems: "center" });

    const labelText = new PIXI.Text({ text: label, style: LABEL_STYLE });
    labelText.layout = { width: LABEL_WIDTH };
    row.addChild(labelText);

    let index = initialIndex;
    const cycleButtonStyle = this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button, {
      label: { fontSize: 12, fontWeight: "700", color: 0xe8eef6 },
    });
    const button = new ButtonComponent(this.assetLoader, cycleButtonStyle, {
      width: 160,
      height: 28,
      label: `Cycle → ${formatValue(values[index]!)}`,
    });
    row.addChild(button);

    const handlePress = (): void => {
      index = (index + 1) % values.length;
      button.setLabel(`Cycle → ${formatValue(values[index]!)}`);
      onChange(values[index]!, index);
    };
    const buttonUnsub = button.onPress(handlePress);
    const section = this._wrapInSection(row);
    this._demoControls.addChild(section);
    return () => this._removeControlSection(section, buttonUnsub);
  }

  public addDropdownControl<T>(
    label: string,
    values: readonly T[],
    initialIndex: number,
    formatValue: (value: T) => string,
    onChange: (value: T, index: number) => void,
  ): Unsubscribe {
    if (!this._demoControls) return () => {};
    const row = new HorizontalLayoutComponent({ gap: 12, padding: 4, alignItems: "center" });

    const labelText = new PIXI.Text({ text: label, style: LABEL_STYLE });
    labelText.layout = { width: LABEL_WIDTH };
    row.addChild(labelText);

    // Map each value to a dropdown item; the id encodes the index so
    // the onChange callback can recover the original `T` cleanly
    // (mirrors the addRadioGroupControl pattern).
    const items = values.map((v, i) => ({ id: String(i), label: formatValue(v) }));
    const dropdownStyle = this.styleManager.resolve<DropdownComponentStyle>(UIComponentsStyleIds.Dropdown, {
      label: { fontSize: 12, fontWeight: "600", color: 0xe8eef6 },
    });
    const dropdown = new DropdownComponent(this.assetLoader, dropdownStyle, {
      width: 160,
      height: 28,
      itemHeight: 26,
      items,
      selectedId: items[initialIndex]?.id,
    });
    // DropdownComponent doesn't set its own `.layout`, so without one
    // here Yoga skips it from the row's flex flow and the dropdown
    // renders at the row's (0, 0), painting on top of the label.
    // Mirrors the pattern used in `addSliderControl` for SliderComponent.
    dropdown.layout = { width: 160, height: 28 };
    row.addChild(dropdown);

    const dropdownUnsub = dropdown.onChange((id) => this._dispatchIndexedSelection(id, values, onChange));
    const section = this._wrapInSection(row);
    this._demoControls.addChild(section);
    return () => this._removeControlSection(section, dropdownUnsub);
  }

  public addRadioGroupControl<T>(
    label: string,
    values: readonly T[],
    initialIndex: number,
    formatValue: (value: T) => string,
    onChange: (value: T, index: number) => void,
  ): Unsubscribe {
    if (!this._demoControls) return () => {};
    // Top-aligned because the radio column grows downward and we want
    // the row's label to sit next to the first option, not vertically
    // centered against a tall radio column.
    const row = new HorizontalLayoutComponent({ gap: 12, padding: 4, alignItems: "flex-start" });

    const labelText = new PIXI.Text({ text: label, style: LABEL_STYLE });
    labelText.layout = { width: LABEL_WIDTH };
    row.addChild(labelText);

    // Map each value to a radio item. The id encodes the index so the
    // onChange callback can recover the original `T` cleanly.
    const items = values.map((v, i) => ({ id: String(i), label: formatValue(v) }));
    const radioStyle = this.styleManager.resolve<RadioButtonComponentStyle>(UIComponentsStyleIds.RadioButton, {
      label: { fontSize: 13, fontWeight: "600", color: 0xe8eef6 },
    });
    const group = new RadioButtonGroupComponent(this.assetLoader, radioStyle, {
      items,
      selectedId: items[initialIndex]?.id,
      direction: "column",
      spacing: 4,
      radius: 7,
      gap: 6,
    });
    row.addChild(group);

    const groupUnsub = group.onChange((id) => this._dispatchIndexedSelection(id, values, onChange));
    const section = this._wrapInSection(row);
    this._demoControls.addChild(section);
    return () => this._removeControlSection(section, groupUnsub);
  }

  public addActionControl(label: string, onPress: () => void): Unsubscribe {
    if (!this._demoControls) return () => {};
    const row = new HorizontalLayoutComponent({ gap: 12, padding: 4, alignItems: "center" });

    const spacer = new PIXI.Text({ text: "", style: LABEL_STYLE });
    spacer.layout = { width: LABEL_WIDTH };
    row.addChild(spacer);

    const actionButtonStyle = this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button, {
      label: { fontSize: 12, fontWeight: "700", color: 0xffffff },
    });
    const button = new ButtonComponent(this.assetLoader, actionButtonStyle, {
      width: 160,
      height: 28,
      label,
    });
    row.addChild(button);

    const buttonUnsub = button.onPress(onPress);
    const section = this._wrapInSection(row);
    this._demoControls.addChild(section);
    return () => this._removeControlSection(section, buttonUnsub);
  }

  // ── IPlaygroundShellView — log ─────────────────────────────────────

  public appendLog(msg: string): void {
    if (!this._log) return;
    const cfg = this._cfg;
    const timestamp = this._formatTimestamp(new Date());
    const line = new PIXI.Text({
      text: `${timestamp}  ${msg}`,
      style: {
        fill: cfg.logTextColor,
        fontSize: 12,
        fontFamily: MONO_FAMILY,
      },
    });
    line.layout = {};
    this._log.addChild(line);
    this._logLines.push(line);

    while (this._logLines.length > cfg.logBufferSize) {
      const oldest = this._logLines.shift();
      oldest?.removeFromParent();
      oldest?.destroy();
    }
  }

  // ── IPlaygroundShellView — outline (debug) ─────────────────────────

  public isOutlineVisible(): boolean {
    return this._outlineEnabled;
  }

  public onOutlineChanged(cb: (visible: boolean) => void): Unsubscribe {
    this._outlineListeners.add(cb);
    return () => this._outlineListeners.delete(cb);
  }

  public override preDestroy(): void {
    this.unmountDemo();
    this._clearSidebarUnsubs();
    this._selectedListeners.clear();
    this._outlineListeners.clear();
    this._sidebarButtons.clear();
    this._sidebarAccents.clear();
    this._logLines = [];
    this._sidebar = null;
    this._stage = null;
    this._controls = null;
    this._globalControls = null;
    this._demoControls = null;
    this._log = null;
    this._sidebarBg = null;
    this._stageBg = null;
    this._controlsBg = null;
    this._logBg = null;
    this._config = null;
    super.preDestroy();
  }

  // ── Internals ──────────────────────────────────────────────────────

  private _makeSidebarButton(item: DemoEntry): ButtonComponent {
    const cfg = this._cfg;
    const sidebarButtonStyle = this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button, {
      label: { fontSize: 13, fontWeight: "600", color: cfg.sidebarItemColor },
    });
    const button = new ButtonComponent(this.assetLoader, sidebarButtonStyle, {
      width: cfg.sidebarWidth - cfg.regionPadding * 2,
      height: cfg.sidebarItemHeight,
      label: item.label,
    });

    // Active-state accent: a thin vertical bar pinned to the left edge,
    // hidden until the controller marks this item active.
    const accent = new PIXI.Graphics();
    accent.layout = { position: "absolute", left: 0, top: 0, width: 3, height: "100%" };
    accent.visible = false;
    button.addChild(accent);
    this._sidebarAccents.set(item.id, accent);

    const unsub = button.onPress(() => this._fireSidebarSelected(item.id));
    this._sidebarUnsubs.push(unsub);
    return button;
  }

  private _fireSidebarSelected(id: string): void {
    for (const cb of this._selectedListeners) cb(id);
  }

  private _setAccentVisible(accent: PIXI.Graphics, active: boolean): void {
    if (active) {
      accent.clear();
      accent.rect(0, 0, 3, this._cfg.sidebarItemHeight).fill({
        color: this._cfg.sidebarActiveColor,
      });
      accent.visible = true;
    } else {
      accent.visible = false;
    }
  }

  private _redrawRegion(
    g: PIXI.Graphics | null,
    x: number,
    y: number,
    w: number,
    h: number,
    color: number,
  ): void {
    if (!g) return;
    const safeW = Math.max(1, w);
    const safeH = Math.max(1, h);
    // Absolute layout keeps the background fixed at (x, y) and prevents
    // Yoga from sucking it into the ScreenView's flex flow alongside the
    // region containers.
    g.layout = { position: "absolute", left: x, top: y, width: safeW, height: safeH };
    // Block any pointer events that would otherwise pass through the
    // full-screen background to the Three.js world below. Any HUD
    // element that should block world pointer input must have
    // eventMode: "static" set on its background Graphics.
    g.eventMode = "static";
    g.clear();
    g.rect(0, 0, safeW, safeH).fill({ color });
  }

  private _formatTimestamp(date: Date): string {
    const hh = date.getHours().toString().padStart(2, "0");
    const mm = date.getMinutes().toString().padStart(2, "0");
    const ss = date.getSeconds().toString().padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  private _clearSidebarUnsubs(): void {
    for (const u of this._sidebarUnsubs) u();
    this._sidebarUnsubs.length = 0;
  }

  /**
   * Translates the id-by-index selection format used by the dropdown
   * + radio-group controls back into the original `T` value before
   * calling the consumer's `onChange`. Mirrors the round-trip set up
   * in `addDropdownControl` / `addRadioGroupControl` where each value
   * is mapped to an item with `id: String(index)`.
   */
  private _dispatchIndexedSelection<T>(
    id: string,
    values: readonly T[],
    onChange: (value: T, index: number) => void,
  ): void {
    const index = Number.parseInt(id, 10);
    if (Number.isInteger(index) && index >= 0 && index < values.length) {
      onChange(values[index]!, index);
    }
  }

  /**
   * Outline-toggle change handler. Mirrors the toggle value to the
   * row's ON/OFF readout and propagates the new value to subscribers
   * via `_setOutlineEnabled`.
   */
  private _handleOutlineToggleChange(readout: PIXI.Text, value: boolean): void {
    readout.text = value ? "ON" : "OFF";
    this._setOutlineEnabled(value);
  }

  /**
   * Wraps a control row in a vertical "section" container that holds
   * the row plus a thin trailing divider, so successive settings are
   * visually separated in the panel.
   */
  private _wrapInSection(row: PIXI.Container): VerticalLayoutComponent {
    const section = new VerticalLayoutComponent({
      gap: 6,
      padding: 0,
      alignItems: "stretch",
      justifyContent: "flex-start",
    });
    section.addChild(row);
    section.addChild(this._buildSectionDivider());
    return section;
  }

  /** Thin horizontal rule used between consecutive control sections. */
  private _buildSectionDivider(): PIXI.Graphics {
    const divider = new PIXI.Graphics();
    divider.layout = { width: "100%", height: 1 };
    divider.rect(0, 0, 1, 1).fill({ color: this._cfg.sidebarItemBorderColor, alpha: 0.4 });
    return divider;
  }

  private _removeControlSection(section: PIXI.Container, listenerUnsub: Unsubscribe): void {
    listenerUnsub();
    section.removeFromParent();
    section.destroy({ children: true });
  }

  /**
   * Builds the persistent "outline" toggle row that lives at the top
   * of the controls panel and survives demo switches.
   */
  private _buildOutlineToggleRow(): HorizontalLayoutComponent {
    const row = new HorizontalLayoutComponent({ gap: 12, padding: 4, alignItems: "center" });

    const labelText = new PIXI.Text({ text: "outline", style: LABEL_STYLE });
    labelText.layout = { width: LABEL_WIDTH };
    row.addChild(labelText);

    const toggleStyle = this.styleManager.resolve<ToggleComponentStyle>(UIComponentsStyleIds.Toggle);
    const toggle = new ToggleComponent(this.assetLoader, toggleStyle, { value: this._outlineEnabled });
    row.addChild(toggle);

    const readout = new PIXI.Text({
      text: this._outlineEnabled ? "ON" : "OFF",
      style: READOUT_STYLE,
    });
    readout.layout = { width: READOUT_WIDTH };
    row.addChild(readout);

    toggle.onChange((value) => this._handleOutlineToggleChange(readout, value));

    return row;
  }

  /** Thin horizontal rule between the global and per-demo subsections. */
  private _buildControlsDivider(): PIXI.Graphics {
    const divider = new PIXI.Graphics();
    divider.layout = { width: "100%", height: 1 };
    divider.rect(0, 0, 1, 1).fill({ color: this._cfg.sidebarItemBorderColor, alpha: 0.6 });
    return divider;
  }

  private _setOutlineEnabled(visible: boolean): void {
    if (this._outlineEnabled === visible) return;
    this._outlineEnabled = visible;
    for (const cb of this._outlineListeners) cb(visible);
  }

  private get _cfg(): UIPlaygroundConfig {
    if (!this._config) throw new Error("PlaygroundShellView is not initialized");
    return this._config;
  }
}
