import * as PIXI from "pixi.js";
import {
  ButtonComponent,
  HudViewBase,
  UIComponentsStyleIds,
  VerticalLayoutComponent,
  type ButtonComponentStyle,
  type IInstanceResolver,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import { UIPlaygroundAssetIds } from "../UIPlaygroundAssetIds.js";
import { UIPlaygroundConfig } from "../UIPlaygroundConfig.js";
import type { IButtonDemoView } from "./IButtonDemoView.js";

const SECTION_LABEL_STYLE: Partial<PIXI.TextStyleOptions> = {
  fill: 0xa3b1c2,
  fontSize: 12,
  fontWeight: "600",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  letterSpacing: 1,
};

/**
 * Live preview for the `ButtonComponent` playground demo. Renders two
 * buttons stacked vertically:
 *
 *   1. **Default skin** — `ButtonComponent` constructed without a `skin`
 *      preset, so it falls back to the framework's `UIComponentsAssetIds`
 *      defaults (loaded by `UIComponentsBinding` at app boot). The
 *      "default-button enabled" control flips this button's enabled state
 *      so users can see the `disabled` texture variant.
 *   2. **Custom skin** — `ButtonComponent` constructed with a `skin`
 *      pointing at `UIPlaygroundAssetIds.CustomButton*`, which the
 *      playground app registers via `loadAssets()` from PNGs under
 *      `examples/uiplayground/assets/button/`. Demonstrates the
 *      asset-id override flow without touching the lib defaults.
 *
 * Width / height / label changes rebuild both buttons; outline wraps both.
 */
export class ButtonDemoView extends HudViewBase implements IButtonDemoView {
  private _config: UIPlaygroundConfig | null = null;

  private _column: VerticalLayoutComponent | null = null;
  private _defaultButton: ButtonComponent | null = null;
  private _customButton: ButtonComponent | null = null;
  private _defaultOutline: PIXI.Graphics | null = null;
  private _customOutline: PIXI.Graphics | null = null;
  private _outlineVisible = false;
  private _defaultPressUnsub: Unsubscribe | null = null;
  private _customPressUnsub: Unsubscribe | null = null;
  private readonly _pressListeners = new Set<(which: "default" | "custom") => void>();

  // Mutable props driving both `ButtonComponent` instances.
  private _label = "Click me";
  private _width = 220;
  private _height = 56;
  private _defaultButtonEnabled = true;

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
    this._rebuildButtons();
  }

  public setHeight(height: number): void {
    if (this._height === height) return;
    this._height = height;
    this._rebuildButtons();
  }

  public setLabel(label: string): void {
    if (this._label === label) return;
    this._label = label;
    this._defaultButton?.setLabel(label);
    this._customButton?.setLabel(label);
  }

  public setOutlineVisible(visible: boolean): void {
    this._outlineVisible = visible;
    this._refreshOutlines();
  }

  public setDefaultButtonEnabled(enabled: boolean): void {
    if (this._defaultButtonEnabled === enabled) return;
    this._defaultButtonEnabled = enabled;
    this._defaultButton?.setEnabled(enabled);
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
    this._defaultButton = null;
    this._customButton = null;
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
      alignItems: "center",
      justifyContent: "flex-start",
    });
    this._column = column;
    this.addChild(column);
    this._rebuildButtons();
  }

  private _rebuildButtons(): void {
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

    this._defaultButton!.setEnabled(this._defaultButtonEnabled);
    this._refreshOutlines();
  }

  private _buildSection(captionText: string, isCustom: boolean): VerticalLayoutComponent {
    const section = new VerticalLayoutComponent({
      gap: 6,
      padding: 0,
      alignItems: "center",
      justifyContent: "flex-start",
    });

    const caption = new PIXI.Text({ text: captionText, style: SECTION_LABEL_STYLE });
    caption.layout = {};
    section.addChild(caption);

    // Both buttons share label-style overrides; only the custom one
    // points each pointer-state slot at the playground's CustomButton*
    // PNGs (which also ship with a 2px black border, so they keep
    // border: 2 from the registered default).
    const buttonStyle = isCustom
      ? this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button, {
          idle: { textureId: UIPlaygroundAssetIds.CustomButtonIdle, border: 2 },
          hover: { textureId: UIPlaygroundAssetIds.CustomButtonHover, border: 2 },
          pressed: { textureId: UIPlaygroundAssetIds.CustomButtonPressed, border: 2 },
          disabled: { textureId: UIPlaygroundAssetIds.CustomButtonDisabled, border: 2 },
          label: { fontSize: 16, fontWeight: "700", color: 0xffffff },
        })
      : this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button, {
          label: { fontSize: 16, fontWeight: "700", color: 0xffffff },
        });
    const button = new ButtonComponent(this.assetLoader, buttonStyle, {
      width: this._width,
      height: this._height,
      label: this._label,
    });

    if (isCustom) {
      this._customButton = button;
      this._customPressUnsub = button.onPress(() => this._firePress("custom"));
    } else {
      this._defaultButton = button;
      this._defaultPressUnsub = button.onPress(() => this._firePress("default"));
    }
    section.addChild(button);

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

    if (this._defaultButton) {
      this._defaultOutline = this._makeOutline();
      this._defaultButton.addChild(this._defaultOutline);
    }
    if (this._customButton) {
      this._customOutline = this._makeOutline();
      this._customButton.addChild(this._customOutline);
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
