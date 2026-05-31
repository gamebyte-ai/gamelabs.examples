import * as PIXI from "pixi.js";
import {
  HudViewBase,
  ToggleComponent,
  UIComponentsStyleIds,
  VerticalLayoutComponent,
  type IInstanceResolver,
  type ToggleComponentStyle,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import { UIPlaygroundAssetIds } from "../UIPlaygroundAssetIds.js";
import { UIPlaygroundConfig } from "../UIPlaygroundConfig.js";
import type { IToggleDemoView } from "./IToggleDemoView.js";

const SECTION_LABEL_STYLE: Partial<PIXI.TextStyleOptions> = {
  fill: 0xa3b1c2,
  fontSize: 12,
  fontWeight: "600",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  letterSpacing: 1,
};

/**
 * Live preview for the `ToggleComponent` playground demo. Renders two
 * toggles stacked vertically:
 *
 *   1. **Default skin** — `ToggleComponent` constructed with the
 *      framework default style resolved from `UIComponentsStyleIds.Toggle`
 *      (loaded by `UIComponentsBinding` at app boot). Rounded pill
 *      track + circular thumb.
 *   2. **Custom skin** — `ToggleComponent` constructed with a per-call
 *      style override pointing at the playground's
 *      `UIPlaygroundAssetIds.CustomToggle*` PNGs. Rectangular track +
 *      square thumb in a violet / amber palette so the visual contrast
 *      with the default rounded skin is unmistakable.
 *
 * Width / height changes rebuild both toggles. Tapping a toggle flips
 * only that toggle's value (the two are independent, not a group); the
 * programmatic `toggle()` action flips both at once for the API demo.
 */
export class ToggleDemoView extends HudViewBase implements IToggleDemoView {
  private _config: UIPlaygroundConfig | null = null;

  private _column: VerticalLayoutComponent | null = null;
  private _defaultToggle: ToggleComponent | null = null;
  private _customToggle: ToggleComponent | null = null;
  private _defaultOutline: PIXI.Graphics | null = null;
  private _customOutline: PIXI.Graphics | null = null;
  private _outlineVisible = false;
  private _defaultChangeUnsub: Unsubscribe | null = null;
  private _customChangeUnsub: Unsubscribe | null = null;
  private readonly _changeListeners = new Set<(which: "default" | "custom", value: boolean) => void>();

  // Mutable props.
  private _width = 60;
  private _height = 32;
  private _defaultValue = false;
  private _customValue = false;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(UIPlaygroundConfig);
  }

  public override postInitialize(): void {
    super.postInitialize();
    this.layout = {};
    this._buildColumn();
  }

  public setWidth(width: number): void {
    if (this._width === width) return;
    this._width = width;
    this._rebuildToggles();
  }

  public setHeight(height: number): void {
    if (this._height === height) return;
    this._height = height;
    this._rebuildToggles();
  }

  public toggle(): void {
    // Programmatic action flips both toggles' values via the live
    // instances — fires onChange on each so the controller's log
    // surfaces both transitions.
    this._defaultToggle?.toggle();
    this._customToggle?.toggle();
  }

  public setOutlineVisible(visible: boolean): void {
    this._outlineVisible = visible;
    this._refreshOutlines();
  }

  public onChange(cb: (which: "default" | "custom", value: boolean) => void): Unsubscribe {
    this._changeListeners.add(cb);
    return () => this._changeListeners.delete(cb);
  }

  public override preDestroy(): void {
    this._changeListeners.clear();
    this._defaultChangeUnsub?.();
    this._customChangeUnsub?.();
    this._defaultChangeUnsub = null;
    this._customChangeUnsub = null;
    this._defaultOutline?.removeFromParent();
    this._defaultOutline?.destroy();
    this._defaultOutline = null;
    this._customOutline?.removeFromParent();
    this._customOutline?.destroy();
    this._customOutline = null;
    this._column?.removeFromParent();
    this._column?.destroy({ children: true });
    this._column = null;
    this._defaultToggle = null;
    this._customToggle = null;
    this._config = null;
    super.preDestroy();
  }

  private _fireChange(which: "default" | "custom", value: boolean): void {
    if (which === "custom") this._customValue = value;
    else this._defaultValue = value;
    for (const cb of this._changeListeners) cb(which, value);
  }

  private _buildColumn(): void {
    const column = new VerticalLayoutComponent({
      gap: 24,
      padding: 0,
      alignItems: "flex-start",
      justifyContent: "flex-start",
    });
    this._column = column;
    this.addChild(column);
    this._rebuildToggles();
  }

  private _rebuildToggles(): void {
    if (!this._column) return;

    this._defaultChangeUnsub?.();
    this._customChangeUnsub?.();
    this._defaultChangeUnsub = null;
    this._customChangeUnsub = null;
    this._defaultOutline?.removeFromParent();
    this._defaultOutline?.destroy();
    this._defaultOutline = null;
    this._customOutline?.removeFromParent();
    this._customOutline?.destroy();
    this._customOutline = null;

    this._column.removeChildren().forEach((c) => c.destroy({ children: true }));

    this._column.addChild(this._buildSection("DEFAULT SKIN (rounded pill)", false));
    this._column.addChild(this._buildSection("CUSTOM SKIN (rectangle + square knob)", true));

    this._refreshOutlines();
  }

  private _buildSection(captionText: string, isCustom: boolean): VerticalLayoutComponent {
    const section = new VerticalLayoutComponent({
      gap: 6,
      padding: 0,
      alignItems: "flex-start",
      justifyContent: "flex-start",
    });

    const caption = new PIXI.Text({ text: captionText, style: SECTION_LABEL_STYLE });
    caption.layout = {};
    section.addChild(caption);

    // Default skin pulls the registered defaults; custom skin overrides
    // each track + thumb slot with the playground's own asset ids.
    const toggleStyle = isCustom
      ? this.styleManager.resolve<ToggleComponentStyle>(UIComponentsStyleIds.Toggle, {
          trackOn: { textureId: UIPlaygroundAssetIds.CustomToggleTrackOn },
          trackOff: { textureId: UIPlaygroundAssetIds.CustomToggleTrackOff },
          thumb: { textureId: UIPlaygroundAssetIds.CustomToggleThumb },
        })
      : this.styleManager.resolve<ToggleComponentStyle>(UIComponentsStyleIds.Toggle);

    const toggle = new ToggleComponent(this.assetLoader, toggleStyle, {
      width: this._width,
      height: this._height,
      value: isCustom ? this._customValue : this._defaultValue,
    });

    if (isCustom) {
      this._customToggle = toggle;
      this._customChangeUnsub = toggle.onChange((value) => this._fireChange("custom", value));
    } else {
      this._defaultToggle = toggle;
      this._defaultChangeUnsub = toggle.onChange((value) => this._fireChange("default", value));
    }
    section.addChild(toggle);

    return section;
  }

  private _refreshOutlines(): void {
    this._defaultOutline?.removeFromParent();
    this._defaultOutline?.destroy();
    this._defaultOutline = null;
    this._customOutline?.removeFromParent();
    this._customOutline?.destroy();
    this._customOutline = null;
    if (!this._outlineVisible || !this._config) return;

    if (this._defaultToggle) {
      this._defaultOutline = this._makeOutline();
      this._defaultToggle.addChild(this._defaultOutline);
    }
    if (this._customToggle) {
      this._customOutline = this._makeOutline();
      this._customToggle.addChild(this._customOutline);
    }
  }

  private _makeOutline(): PIXI.Graphics {
    const config = this._config!;
    const g = new PIXI.Graphics();
    g.eventMode = "none";
    g.rect(0, 0, this._width, this._height).stroke({ color: config.outlineColor, width: config.outlineWidth });
    return g;
  }
}
