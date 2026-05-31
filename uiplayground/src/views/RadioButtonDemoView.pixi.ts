import * as PIXI from "pixi.js";
import {
  HudViewBase,
  RadioButtonComponent,
  UIComponentsStyleIds,
  VerticalLayoutComponent,
  type IInstanceResolver,
  type RadioButtonComponentStyle,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import { UIPlaygroundAssetIds } from "../UIPlaygroundAssetIds.js";
import { UIPlaygroundConfig } from "../UIPlaygroundConfig.js";
import type { IRadioButtonDemoView } from "./IRadioButtonDemoView.js";

const SECTION_LABEL_STYLE: Partial<PIXI.TextStyleOptions> = {
  fill: 0xa3b1c2,
  fontSize: 12,
  fontWeight: "600",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  letterSpacing: 1,
};

/**
 * Live preview for the `RadioButtonComponent` playground demo. Renders
 * two radios stacked vertically:
 *
 *   1. **Default skin** — `RadioButtonComponent` constructed with the
 *      framework default style resolved from
 *      `UIComponentsStyleIds.RadioButton` (loaded by
 *      `UIComponentsBinding` at app boot).
 *   2. **Custom skin** — `RadioButtonComponent` constructed with a per-
 *      call style override pointing at the playground's
 *      `UIPlaygroundAssetIds.CustomRadio*` PNGs (registered in
 *      `UIPlaygroundApp.loadAssets()`). Demonstrates the asset-id
 *      override flow without touching the lib defaults.
 *
 * Radius / gap / label changes rebuild both radios; the
 * `toggleSelected` action flips both of their selected states via the
 * silent `setSelected` API. Each radio reports presses tagged with
 * `"default"` / `"custom"` so the event log distinguishes them.
 */
export class RadioButtonDemoView extends HudViewBase implements IRadioButtonDemoView {
  private _config: UIPlaygroundConfig | null = null;

  private _column: VerticalLayoutComponent | null = null;
  private _defaultRadio: RadioButtonComponent | null = null;
  private _customRadio: RadioButtonComponent | null = null;
  private _defaultOutline: PIXI.Graphics | null = null;
  private _customOutline: PIXI.Graphics | null = null;
  private _outlineVisible = false;
  private _defaultPressUnsub: Unsubscribe | null = null;
  private _customPressUnsub: Unsubscribe | null = null;
  private readonly _pressListeners = new Set<(which: "default" | "custom") => void>();

  // Mutable props driving both `RadioButtonComponent` instances.
  private _radius = 9;
  private _gap = 8;
  private _label = "Option A";
  // Selected state is per-radio so user clicks on one don't flip the
  // other — the two demos are independent radios, not a group.
  private _defaultSelected = true;
  private _customSelected = true;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(UIPlaygroundConfig);
  }

  public override postInitialize(): void {
    super.postInitialize();
    this.layout = {};
    this._buildColumn();
  }

  public setRadius(radius: number): void {
    if (this._radius === radius) return;
    this._radius = radius;
    this._rebuildRadios();
  }

  public setGap(gap: number): void {
    if (this._gap === gap) return;
    this._gap = gap;
    this._rebuildRadios();
  }

  public setLabel(label: string): void {
    if (this._label === label) return;
    this._label = label;
    this._rebuildRadios();
  }

  public toggleSelected(): void {
    // Programmatic action flips both — useful for demonstrating the
    // silent `setSelected` API across both skins at once.
    this._defaultSelected = !this._defaultSelected;
    this._customSelected = !this._customSelected;
    this._defaultRadio?.setSelected(this._defaultSelected);
    this._customRadio?.setSelected(this._customSelected);
  }

  public setOutlineVisible(visible: boolean): void {
    this._outlineVisible = visible;
    this._refreshOutlines();
  }

  public onPress(cb: (which: "default" | "custom") => void): Unsubscribe {
    this._pressListeners.add(cb);
    return () => this._pressListeners.delete(cb);
  }

  public override preDestroy(): void {
    this._pressListeners.clear();
    this._defaultPressUnsub?.();
    this._customPressUnsub?.();
    this._defaultPressUnsub = null;
    this._customPressUnsub = null;
    this._defaultOutline?.removeFromParent();
    this._defaultOutline?.destroy();
    this._defaultOutline = null;
    this._customOutline?.removeFromParent();
    this._customOutline?.destroy();
    this._customOutline = null;
    this._column?.removeFromParent();
    this._column?.destroy({ children: true });
    this._column = null;
    this._defaultRadio = null;
    this._customRadio = null;
    this._config = null;
    super.preDestroy();
  }

  private _firePress(which: "default" | "custom"): void {
    for (const cb of this._pressListeners) cb(which);
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
    this._rebuildRadios();
  }

  private _rebuildRadios(): void {
    if (!this._column) return;

    this._defaultPressUnsub?.();
    this._customPressUnsub?.();
    this._defaultPressUnsub = null;
    this._customPressUnsub = null;
    this._defaultOutline?.removeFromParent();
    this._defaultOutline?.destroy();
    this._defaultOutline = null;
    this._customOutline?.removeFromParent();
    this._customOutline?.destroy();
    this._customOutline = null;

    this._column.removeChildren().forEach((c) => c.destroy({ children: true }));

    this._column.addChild(this._buildSection("DEFAULT SKIN", false));
    this._column.addChild(this._buildSection("CUSTOM SKIN (asset-id override)", true));

    // Reapply each radio's local selected state — construction may
    // default to false; this aligns the freshly built radio with the
    // last-known per-skin state.
    this._defaultRadio?.setSelected(this._defaultSelected);
    this._customRadio?.setSelected(this._customSelected);
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

    // Default skin pulls the registered defaults straight from the
    // StyleManager. Custom skin overrides each indicator slot with the
    // playground's own asset ids; the registered label TextStyle stays
    // since it isn't being overridden.
    const radioStyle = isCustom
      ? this.styleManager.resolve<RadioButtonComponentStyle>(UIComponentsStyleIds.RadioButton, {
          unselected: { textureId: UIPlaygroundAssetIds.CustomRadioUnselected },
          selected: { textureId: UIPlaygroundAssetIds.CustomRadioSelected },
        })
      : this.styleManager.resolve<RadioButtonComponentStyle>(UIComponentsStyleIds.RadioButton);

    const radio = new RadioButtonComponent(this.assetLoader, radioStyle, {
      label: this._label,
      radius: this._radius,
      gap: this._gap,
      selected: isCustom ? this._customSelected : this._defaultSelected,
    });

    if (isCustom) {
      this._customRadio = radio;
      this._customPressUnsub = radio.onPress(() => this._handleLivePress("custom"));
    } else {
      this._defaultRadio = radio;
      this._defaultPressUnsub = radio.onPress(() => this._handleLivePress("default"));
    }
    section.addChild(radio);

    return section;
  }

  private _handleLivePress(which: "default" | "custom"): void {
    // Standalone radios are decoupled — pressing doesn't auto-select.
    // For the demo we flip only the radio that was tapped so the two
    // skins toggle independently. Forward the event so the controller's
    // log distinguishes which one fired.
    if (which === "custom") {
      this._customSelected = !this._customSelected;
      this._customRadio?.setSelected(this._customSelected);
    } else {
      this._defaultSelected = !this._defaultSelected;
      this._defaultRadio?.setSelected(this._defaultSelected);
    }
    this._firePress(which);
  }

  private _refreshOutlines(): void {
    this._defaultOutline?.removeFromParent();
    this._defaultOutline?.destroy();
    this._defaultOutline = null;
    this._customOutline?.removeFromParent();
    this._customOutline?.destroy();
    this._customOutline = null;
    if (!this._outlineVisible || !this._config) return;

    if (this._defaultRadio) {
      this._defaultOutline = this._makeOutline(this._defaultRadio);
      this._defaultRadio.addChild(this._defaultOutline);
    }
    if (this._customRadio) {
      this._customOutline = this._makeOutline(this._customRadio);
      this._customRadio.addChild(this._customOutline);
    }
  }

  private _makeOutline(radio: RadioButtonComponent): PIXI.Graphics {
    const config = this._config!;
    const bounds = radio.getLocalBounds();
    const w = Math.max(1, bounds.width);
    const h = Math.max(1, bounds.height);
    const g = new PIXI.Graphics();
    g.eventMode = "none";
    g.rect(bounds.x, bounds.y, w, h).stroke({ color: config.outlineColor, width: config.outlineWidth });
    return g;
  }
}
